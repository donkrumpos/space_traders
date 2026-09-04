// M1+M2+M3+M4 multiplayer server: handshake + shared saves + ghost relay +
// world authority (markets/events/mission boards) + combat authority
// (enemies/raid bands/traffic/drops/grudges) per docs/PROTOCOL.md.
// ws over plain node:http, bound to 127.0.0.1 (Apache proxies in prod).
// Optional static serving when STATIC_DIR is set (dev + verify-net).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { getPilot, savePilot, restorePilotFromBackup, dbHealth, closeDb } from './db.mjs';
import config from './config.mjs';
import { startWorld, worldSnapshotMessage, handleWorldMessage, flushWorld } from './world.mjs';
import {
    startCombat, handleCombatMessage,
    combatPilotConnected, combatPilotDoc, combatPilotState, combatPilotLeft
} from './combat.mjs';

const PORT = Number(process.env.PORT) || 8378;
const FAMILY_SECRET = process.env.FAMILY_SECRET;
if (!FAMILY_SECRET) {
    console.error('FATAL: FAMILY_SECRET is not set. Refusing to start — a '
        + 'guessable default on a public server is worse than no server. '
        + 'Local dev/verify: FAMILY_SECRET=dev-secret node server/server.mjs');
    process.exit(1);
}
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2'
};

function serveStatic(req, res) {
    if (!STATIC_DIR) { res.writeHead(404); res.end('no static dir'); return; }
    let urlPath;
    // decodeURIComponent throws on malformed escapes ("/%") — that must be a
    // 400, not a process exit
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400); res.end('bad request'); return; }
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const filePath = path.join(STATIC_DIR, urlPath);
    // path.join normalizes ".."; anything escaping STATIC_DIR is a traversal attempt
    if (filePath !== STATIC_DIR && !filePath.startsWith(STATIC_DIR + path.sep)) {
        res.writeHead(403); res.end('forbidden'); return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    });
}

// /healthz — the external uptime ping's target (2026-09-01 durability list).
// Unauthenticated by design: it exposes only process liveness, db health, a
// head-count, and the world blob's save age. 503 when SQLite stops answering
// (prod reachability needs an Apache ProxyPass — see docs/RUNBOOK.md).
function serveHealthz(res) {
    const health = {
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        db: true,
        pilotsOnline: pilots.size,
        worldSaveAgeSec: null // null until the first world flush hits disk
    };
    try {
        const { worldUpdated } = dbHealth();
        if (worldUpdated != null) {
            health.worldSaveAgeSec = Math.max(0, Math.round((Date.now() - worldUpdated) / 1000));
        }
    } catch (err) {
        health.ok = false;
        health.db = false;
    }
    res.writeHead(health.ok ? 200 : 503, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(health));
}

const httpServer = http.createServer((req, res) => {
    let pathname = null;
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* serveStatic 400s it */ }
    if (pathname === '/healthz') { serveHealthz(res); return; }
    serveStatic(req, res);
});
// maxPayload: the biggest legitimate frame is a char.push doc (a few KB);
// ws's 100MiB default would let a stranger stall the event loop pre-auth
const wss = new WebSocketServer({ server: httpServer, maxPayload: 256 * 1024 });

// pilot name -> ws (one live socket per pilot)
const pilots = new Map();

// --- WS boundary rules (docs/PROTOCOL.md "Boundary rules") ------------------
// Identity is already stamped server-side and relay fields whitelisted; these
// are the missing bounds. All of it is anti-poison, not gameplay tuning: one
// non-finite coordinate relayed (JSON `1e999` parses to Infinity, `null`
// slips through arithmetic as 0-ish) corrupts every peer's ghost math.
const PILOT_NAME_MAX = 24;
// Letters in any script, digits, space, ' . _ - ; no control chars, and no
// markup characters at all — names reach every peer's DOM.
const PILOT_NAME_RE = /^[\p{L}\p{N} '._-]+$/u;
const SHIP_NAME_MAX = 40;
const HULL_ID_MAX = 32;
const COORD_MAX = 1e6;  // charted space sits within ±5000; generous on purpose
const VEL_MAX = 1e4;    // wire velocity is units-per-second
const ANGLE_MAX = 10;   // client normalizes to (-2π, 2π) (js/physics.js)
const VITAL_MAX = 1e6;  // hull / hullMax / shield
// Per-socket, per-second message budget. A real client peaks ~15/s (10Hz
// ship.state + trades + saves); past MAX the message drops, an order of
// magnitude past that the socket goes away.
const RATE_MAX_PER_SEC = 100;
const RATE_KICK_PER_SEC = 500;

const finiteIn = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;

function validPilotName(name) {
    return name.length > 0 && name.length <= PILOT_NAME_MAX && PILOT_NAME_RE.test(name);
}

function validShipState(m) {
    return finiteIn(m.x, COORD_MAX) && finiteIn(m.y, COORD_MAX)
        && finiteIn(m.angle, ANGLE_MAX)
        && finiteIn(m.vx, VEL_MAX) && finiteIn(m.vy, VEL_MAX)
        && finiteIn(m.hull, VITAL_MAX) && finiteIn(m.hullMax, VITAL_MAX)
        && finiteIn(m.shield, VITAL_MAX);
}

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function send(ws, obj) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastToOthers(exceptPilot, obj) {
    for (const [name, ws] of pilots) {
        if (name !== exceptPilot) send(ws, obj);
    }
}

// World messages (market.update / market.event / board.update) go to everyone
// — the sender needs the post-trade market too.
function broadcastAll(obj) {
    for (const ws of pilots.values()) send(ws, obj);
}

wss.on('connection', (ws) => {
    ws.pilot = null;

    // Sockets that never complete the hello handshake don't get to sit on an
    // FD forever (they're invisible to `pilots` and would otherwise never die)
    const helloTimer = setTimeout(() => {
        if (!ws.pilot) ws.terminate();
    }, 10000);

    ws.rateWindow = 0;
    ws.rateCount = 0;

    ws.on('message', (raw) => {
        // Rate check BEFORE parsing — flood protection has to be cheaper
        // than the flood. Over budget → drop; egregiously over → terminate.
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec !== ws.rateWindow) { ws.rateWindow = nowSec; ws.rateCount = 0; }
        if (++ws.rateCount > RATE_MAX_PER_SEC) {
            if (ws.rateCount > RATE_KICK_PER_SEC) {
                log(`flood kick: ${ws.pilot || 'pre-hello socket'} (${ws.rateCount} msgs in 1s)`);
                ws.terminate();
            }
            return;
        }

        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (!msg || typeof msg.t !== 'string') return;

        if (msg.t === 'hello') {
            if (msg.secret !== FAMILY_SECRET) {
                send(ws, { t: 'reject', reason: 'bad secret' });
                ws.close();
                log(`reject: bad secret for pilot "${String(msg.pilot).slice(0, 32)}"`);
                return;
            }
            const name = String(msg.pilot || '').trim();
            if (!name) {
                send(ws, { t: 'reject', reason: 'missing pilot name' });
                ws.close();
                return;
            }
            if (!validPilotName(name)) {
                send(ws, { t: 'reject', reason: 'bad pilot name' });
                ws.close();
                log(`reject: bad pilot name (${name.length} chars)`);
                return;
            }
            // Same pilot reconnecting (or a second machine) replaces the old socket
            const old = pilots.get(name);
            if (old && old !== ws) {
                old.pilot = null; // suppress the leave broadcast from the stale close
                old.close();
            }
            ws.pilot = name;
            pilots.set(name, ws);
            const stored = getPilot(name);
            let storedDoc = null;
            let lastSeen = stored ? stored.updated : 0;
            if (stored) {
                try {
                    storedDoc = JSON.parse(stored.doc);
                } catch (err) {
                    // A corrupt row must not brick the connect path — unguarded,
                    // this throw would ride the ws message handler into
                    // uncaughtException and take the whole server down on every
                    // connect attempt. Newest backup that parses wins (the row
                    // is repaired in place); none → the pilot starts fresh.
                    const restored = restorePilotFromBackup(name);
                    storedDoc = restored ? restored.parsed : null;
                    lastSeen = restored ? restored.updated : 0;
                    log(restored
                        ? `corrupt save for "${name}" — restored the ${new Date(restored.updated).toISOString()} backup`
                        : `corrupt save for "${name}" — no valid backup, starting fresh`);
                }
            }
            send(ws, {
                t: 'welcome',
                pilot: name,
                doc: storedDoc,
                peers: [...pilots.keys()].filter(p => p !== name),
                config,
                // M6: when this pilot's doc was last saved server-side (0 for a
                // brand-new pilot) — the client diffs the chronicle against it
                // for the "while you were away" digest.
                lastSeen
            });
            // World state follows immediately as its own message (documented
            // choice in PROTOCOL.md — welcome itself stays M1-shaped).
            send(ws, worldSnapshotMessage());
            // M4: presence for enemy targeting + grudge migration off the
            // stored doc (merge-by-max, broadcasts grudge.update on change)
            combatPilotConnected(name, storedDoc);
            broadcastToOthers(name, { t: 'peer.join', pilot: name });
            log(`connect: ${name} (${pilots.size} online)`);
            return;
        }

        if (!ws.pilot) return; // everything below requires a completed handshake

        if (msg.t === 'char.push') {
            if (!msg.doc) return;
            const updated = savePilot(ws.pilot, JSON.stringify(msg.doc));
            send(ws, { t: 'char.saved', updated });
            // M4: refresh credits/cargo cache + grudge merge-by-max
            combatPilotDoc(ws.pilot, msg.doc);
            log(`save: ${ws.pilot}`);
            return;
        }

        if (msg.t === 'ship.state') {
            // Boundary check before anything reads the numbers: a bad frame
            // (non-finite, out of range, wrong type) is dropped whole — it
            // never reaches peers OR the combat AI. A healthy client can't
            // produce one; the next valid frame restores presence.
            if (!validShipState(msg)) return;
            // M4: latest position feeds enemy AI targeting
            combatPilotState(ws.pilot, msg);
            // M2: relay to everyone else, pilot stamped from the handshake
            // (never trust a pilot field in the payload). Fields whitelisted,
            // no persistence, no logging (arrives at up to 10Hz). Free-text
            // fields are bounded: peers render them.
            broadcastToOthers(ws.pilot, {
                t: 'peer.state',
                pilot: ws.pilot,
                x: msg.x, y: msg.y, angle: msg.angle,
                vx: msg.vx, vy: msg.vy,
                hull: msg.hull, hullMax: msg.hullMax, shield: msg.shield,
                // null must survive the relay: an unchristened ship's name IS
                // null and peers mirror it. Everything else non-string → null.
                hullId: typeof msg.hullId === 'string' ? msg.hullId.slice(0, HULL_ID_MAX) : null,
                shipName: typeof msg.shipName === 'string' ? msg.shipName.slice(0, SHIP_NAME_MAX) : null,
                thrusting: !!msg.thrusting, docked: !!msg.docked
            });
            return;
        }

        // M3: trade / dock / mission.take / debug.* (VERIFY_DEBUG-gated)
        if (handleWorldMessage(ws, msg, send)) return;

        // M4: damage.claim / drop.claim / debug.* (VERIFY_DEBUG-gated)
        if (handleCombatMessage(ws, msg, send)) return;

        // Unknown t: ignore (forward compatibility with M5+)
    });

    ws.on('close', () => {
        clearTimeout(helloTimer);
        if (ws.pilot && pilots.get(ws.pilot) === ws) {
            pilots.delete(ws.pilot);
            combatPilotLeft(ws.pilot);
            broadcastToOthers(ws.pilot, { t: 'peer.leave', pilot: ws.pilot });
            log(`disconnect: ${ws.pilot} (${pilots.size} online)`);
        }
    });

    ws.on('error', () => {}); // close handler does the cleanup
});

startWorld(broadcastAll);
startCombat(broadcastAll);

httpServer.listen(PORT, '127.0.0.1', () => {
    log(`space-traders server on ws://127.0.0.1:${PORT}${STATIC_DIR ? ` (static: ${STATIC_DIR})` : ''}`);
});

function shutdown() {
    log('shutting down');
    for (const ws of pilots.values()) ws.close();
    wss.close();
    httpServer.close();
    flushWorld();
    closeDb();
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// World persistence is debounced (up to 60s behind), so an unexpected throw
// must flush before the process dies — otherwise trades/grudges rewind
process.on('uncaughtException', (err) => {
    log(`fatal: ${err && err.stack || err}`);
    try { flushWorld(); closeDb(); } catch { /* already going down */ }
    process.exit(1);
});
