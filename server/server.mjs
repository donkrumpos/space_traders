// M1+M2 multiplayer server: handshake + shared saves + ghost relay (docs/PROTOCOL.md).
// ws over plain node:http, bound to 127.0.0.1 (Apache proxies in prod).
// Optional static serving when STATIC_DIR is set (dev + verify-net).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { getPilot, savePilot, closeDb } from './db.mjs';
import config from './config.mjs';

const PORT = Number(process.env.PORT) || 8378;
const FAMILY_SECRET = process.env.FAMILY_SECRET || 'dev-secret';
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
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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

const httpServer = http.createServer(serveStatic);
const wss = new WebSocketServer({ server: httpServer });

// pilot name -> ws (one live socket per pilot)
const pilots = new Map();

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

wss.on('connection', (ws) => {
    ws.pilot = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (!msg || typeof msg.t !== 'string') return;

        if (msg.t === 'hello') {
            if (msg.secret !== FAMILY_SECRET) {
                send(ws, { t: 'reject', reason: 'bad secret' });
                ws.close();
                log(`reject: bad secret for pilot "${msg.pilot}"`);
                return;
            }
            const name = String(msg.pilot || '').trim();
            if (!name) {
                send(ws, { t: 'reject', reason: 'missing pilot name' });
                ws.close();
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
            send(ws, {
                t: 'welcome',
                pilot: name,
                doc: stored ? JSON.parse(stored.doc) : null,
                peers: [...pilots.keys()].filter(p => p !== name),
                config
            });
            broadcastToOthers(name, { t: 'peer.join', pilot: name });
            log(`connect: ${name} (${pilots.size} online)`);
            return;
        }

        if (!ws.pilot) return; // everything below requires a completed handshake

        if (msg.t === 'char.push') {
            if (!msg.doc) return;
            const updated = savePilot(ws.pilot, JSON.stringify(msg.doc));
            send(ws, { t: 'char.saved', updated });
            log(`save: ${ws.pilot}`);
            return;
        }

        if (msg.t === 'ship.state') {
            // M2: relay to everyone else, pilot stamped from the handshake
            // (never trust a pilot field in the payload). Fields whitelisted,
            // no persistence, no logging (arrives at up to 10Hz).
            broadcastToOthers(ws.pilot, {
                t: 'peer.state',
                pilot: ws.pilot,
                x: msg.x, y: msg.y, angle: msg.angle,
                vx: msg.vx, vy: msg.vy,
                hull: msg.hull, hullMax: msg.hullMax, shield: msg.shield,
                hullId: msg.hullId, shipName: msg.shipName,
                thrusting: !!msg.thrusting, docked: !!msg.docked
            });
            return;
        }

        // Unknown t: ignore (forward compatibility with M3-M4)
    });

    ws.on('close', () => {
        if (ws.pilot && pilots.get(ws.pilot) === ws) {
            pilots.delete(ws.pilot);
            broadcastToOthers(ws.pilot, { t: 'peer.leave', pilot: ws.pilot });
            log(`disconnect: ${ws.pilot} (${pilots.size} online)`);
        }
    });

    ws.on('error', () => {}); // close handler does the cleanup
});

httpServer.listen(PORT, '127.0.0.1', () => {
    log(`space-traders server on ws://127.0.0.1:${PORT}${STATIC_DIR ? ` (static: ${STATIC_DIR})` : ''}`);
});

function shutdown() {
    log('shutting down');
    for (const ws of pilots.values()) ws.close();
    wss.close();
    httpServer.close();
    closeDb();
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
