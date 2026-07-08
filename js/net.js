// Client net layer (M1+M2) — pilot handshake, shared saves, offline
// fallback, ghost presence (send own ship state, track peers' ghosts).
// Contract: docs/PROTOCOL.md. Loads after character.js, before verify.js.
// Solo boot must NEVER block on the network: under ?verify (no ?ws=) this
// file installs its hooks but never prompts, polls, or opens a socket.

const NET_PARAMS = new URLSearchParams(location.search);

// ws URL resolution per PROTOCOL.md
const NET_WS_URL = NET_PARAMS.get('ws')
    || (location.protocol === 'https:' ? `wss://${location.host}/ws` : 'ws://127.0.0.1:8378');

// ?verify / ?verify-net = harness modes: no prompts ever; no connection
// attempts either, unless the harness explicitly passed ?ws=.
const NET_VERIFY_MODE = NET_PARAMS.has('verify') || NET_PARAMS.has('verify-net');
const NET_ALLOWED = !NET_VERIFY_MODE || !!NET_PARAMS.get('ws');

// Snapshot the on-disk lastPlayed BEFORE loadCharacter() stamps the live doc
// with Date.now() — otherwise a machine idle for a week would look "newest"
// at boot and clobber the other machine's server save.
const netDiskLastPlayed = (() => {
    try {
        const raw = localStorage.getItem('space_trader_character');
        return raw ? (JSON.parse(raw).lastPlayed || 0) : 0;
    } catch (e) { return 0; }
})();

// Identity: localStorage, URL params override + persist, prompt on first
// visit. Missing identity (harness mode / cancelled prompt) → play offline.
const netIdentity = (() => {
    let pilot = NET_PARAMS.get('pilot');
    let secret = NET_PARAMS.get('secret');
    if (pilot) localStorage.setItem('space_trader_pilot', pilot);
    if (secret) localStorage.setItem('space_trader_secret', secret);
    pilot = pilot || localStorage.getItem('space_trader_pilot');
    secret = secret || localStorage.getItem('space_trader_secret');
    if (!NET_VERIFY_MODE) {
        if (!pilot) {
            pilot = prompt('Who flies this ship?');
            if (pilot) localStorage.setItem('space_trader_pilot', pilot);
        }
        if (pilot && !secret) {
            secret = prompt('Family secret?');
            if (secret) localStorage.setItem('space_trader_secret', secret);
        }
    }
    return { pilot: pilot || 'Pilot', secret: secret || null, complete: !!(pilot && secret) };
})();

const net = {
    online: false,
    peers: [],
    status: 'idle', // idle|disabled|connecting|online|offline|rejected
    connect() { netManualConnect(); },
    send(obj) {
        if (netSocket && netSocket.readyState === 1) {
            try { netSocket.send(JSON.stringify(obj)); } catch (e) {}
        }
    },
    // M2 interface contract: array of ghost snapshots with positions
    // extrapolated from the last peer.state (pos + vel*elapsed, capped at
    // 500ms). Entries expire 5s after last update. Empty when offline/solo.
    getGhosts() {
        if (!net.online) return [];
        const now = Date.now();
        const out = [];
        for (const [pilot, g] of netGhostMap) {
            const ageMs = now - g.at;
            if (ageMs > NET_GHOST_EXPIRY_MS) { netGhostMap.delete(pilot); continue; }
            const dt = Math.min(ageMs, NET_GHOST_EXTRAP_CAP_MS) / 1000; // seconds
            out.push({
                pilot: g.pilot,
                x: g.x + g.vx * dt,
                y: g.y + g.vy * dt,
                angle: g.angle,
                vx: g.vx, vy: g.vy,
                hull: g.hull, hullMax: g.hullMax, shield: g.shield,
                hullId: g.hullId, shipName: g.shipName,
                thrusting: g.thrusting, docked: g.docked,
                ageMs
            });
        }
        return out;
    }
};
window.net = net;

let netSocket = null;
let netRetryTimer = null;
let netSuppressUntil = 0;
let netRejected = false;
let netAdopting = false;     // guards the save-wrapper during server-doc adoption
let netSyncedOnce = false;
let netLastSaveAck = null;

const NET_CONNECT_TIMEOUT_MS = 3000;
const NET_RETRY_MS = 30000;

// M2 ghost presence
const NET_SEND_INTERVAL_MS = 100;      // 10Hz sender
const NET_HEARTBEAT_MS = 1000;         // always send at least this often
const NET_DRIFT_EPSILON = 0.5;         // x/y drift below this = "unchanged"
const NET_GHOST_EXPIRY_MS = 5000;      // drop ghosts 5s after last update
const NET_GHOST_EXTRAP_CAP_MS = 500;   // cap dead-reckoning extrapolation

const netGhostMap = new Map();         // pilot -> last peer.state + at timestamp
let netSendTimer = null;
let netLastSent = null;
let netLastSentAt = 0;

function netLocalLastPlayed() {
    // First handshake compares against the pre-boot disk value; after we've
    // synced once, the player really has been playing on this machine.
    if (!netSyncedOnce) return netDiskLastPlayed;
    try {
        const raw = localStorage.getItem('space_trader_character');
        return raw ? (JSON.parse(raw).lastPlayed || 0) : 0;
    } catch (e) { return 0; }
}

function netOpenSocket() {
    if (!NET_ALLOWED || !netIdentity.complete || netRejected) return;
    if (Date.now() < netSuppressUntil) { netScheduleRetry(); return; }
    if (netSocket && netSocket.readyState <= 1) return; // CONNECTING or OPEN

    net.status = 'connecting';
    let ws;
    try { ws = new WebSocket(NET_WS_URL); } catch (e) { netGoOffline(); return; }
    netSocket = ws;

    const timeout = setTimeout(() => {
        if (ws.readyState !== 1) { try { ws.close(); } catch (e) {} }
    }, NET_CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
        clearTimeout(timeout);
        net.send({ t: 'hello', pilot: netIdentity.pilot, secret: netIdentity.secret, lastPlayed: netLocalLastPlayed() });
    };
    ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        netHandleMessage(msg);
    };
    ws.onerror = () => {}; // close always follows
    ws.onclose = () => {
        clearTimeout(timeout);
        if (netSocket === ws) netGoOffline();
    };
}

function netGoOffline() {
    netSocket = null;
    net.online = false;
    net.peers = [];
    netStopSender();
    netGhostMap.clear();
    if (net.status !== 'rejected') net.status = 'offline';
    netScheduleRetry();
}

function netScheduleRetry() {
    if (netRetryTimer || netRejected || !NET_ALLOWED || !netIdentity.complete) return;
    netRetryTimer = setTimeout(() => {
        netRetryTimer = null;
        netOpenSocket();
    }, NET_RETRY_MS);
}

function netHandleMessage(msg) {
    switch (msg.t) {
        case 'welcome': {
            net.online = true;
            net.status = 'online';
            net.peers = (msg.peers || []).filter(p => p !== netIdentity.pilot);
            netApplySyncRule(msg.doc);
            netSyncedOnce = true;
            netStartSender();
            break;
        }
        case 'reject': {
            netRejected = true;
            net.status = 'rejected';
            console.warn(`Server rejected handshake: ${msg.reason}`);
            break;
        }
        case 'char.saved':
            netLastSaveAck = msg.updated;
            break;
        case 'peer.join': {
            if (msg.pilot === netIdentity.pilot) break;
            // Dedup: same-pilot reconnect re-broadcasts peer.join with no
            // preceding peer.leave — an already-known peer gets no toast and
            // keeps its existing ghost entry.
            if (net.peers.includes(msg.pilot)) break;
            net.peers.push(msg.pilot);
            if (typeof showHudFeedback === 'function') {
                showHudFeedback(`${msg.pilot} has entered the sector`, 'info', 3000);
            }
            break;
        }
        case 'peer.leave': {
            net.peers = net.peers.filter(p => p !== msg.pilot);
            netGhostMap.delete(msg.pilot);
            if (msg.pilot !== netIdentity.pilot && typeof showHudFeedback === 'function') {
                showHudFeedback(`${msg.pilot} has left the sector`, 'info', 3000);
            }
            break;
        }
        case 'peer.state': {
            if (!msg.pilot || msg.pilot === netIdentity.pilot) break;
            // A peer.state from a pilot we somehow missed the join for still
            // counts as presence (dedup rule covers the reverse case).
            if (!net.peers.includes(msg.pilot)) net.peers.push(msg.pilot);
            netGhostMap.set(msg.pilot, {
                pilot: msg.pilot,
                x: msg.x, y: msg.y, angle: msg.angle,
                vx: msg.vx || 0, vy: msg.vy || 0,
                hull: msg.hull, hullMax: msg.hullMax, shield: msg.shield,
                hullId: msg.hullId, shipName: msg.shipName,
                thrusting: !!msg.thrusting, docked: !!msg.docked,
                at: Date.now()
            });
            break;
        }
        // Unknown t: ignored (forward compatibility with M3-M4)
    }
}

// Sync rule per PROTOCOL.md: server null → push up; server newer → back up
// local + adopt server doc; local newer (or equal) → push up.
function netApplySyncRule(serverDoc) {
    if (!serverDoc) { netPushChar(); return; }
    if ((serverDoc.lastPlayed || 0) > netLocalLastPlayed()) {
        try {
            const localRaw = localStorage.getItem('space_trader_character');
            if (localRaw) localStorage.setItem('space_trader_character_backup', localRaw);
        } catch (e) {}
        netAdopting = true;
        try {
            // window.importCharacter = validation + apply + UI refresh
            window.importCharacter(JSON.stringify(serverDoc));
        } finally {
            netAdopting = false;
        }
        // Adopted the server's copy — push nothing.
    } else {
        netPushChar();
    }
}

function netPushChar() {
    if (!net.online || !netSocket || netSocket.readyState !== 1) return;
    if (!characterManager.character) return;
    try { characterManager.updateCharacterFromGame(); } catch (e) {}
    net.send({ t: 'char.push', doc: characterManager.character });
}

// Every real (throttle-passing) save also pushes up when online. This covers
// trades, dock (autoSave('dock') → saveCharacter(true)), upgrades, combat.
// character.js is not edited: the instance property shadows the prototype.
const netOrigSave = characterManager.saveCharacter.bind(characterManager);
characterManager.saveCharacter = function(immediate = false) {
    const before = characterManager.lastSaveTime;
    netOrigSave(immediate);
    if (!netAdopting && characterManager.lastSaveTime !== before) netPushChar();
};

window.addEventListener('beforeunload', () => {
    if (net.online) netPushChar(); // ws send is best-effort on unload
});

// --- M2: 10Hz ship.state sender -------------------------------------------
// Runs off its own setInterval (started on welcome, stopped on close), not
// the RAF loop. game.ship.velocity is units-per-frame at an assumed 60fps
// (js/physics.js), so vx/vy go over the wire as units-per-second (×60) to
// match the pos + vel*elapsed-seconds extrapolation in getGhosts().

function netShipSnapshot() {
    if (typeof game === 'undefined' || !game.ship) return null;
    const s = game.ship;
    return {
        x: s.x, y: s.y, angle: s.angle,
        vx: (s.velocity ? s.velocity.x : 0) * 60,
        vy: (s.velocity ? s.velocity.y : 0) * 60,
        hull: s.hull, hullMax: s.hullMax, shield: s.shield,
        hullId: s.hullId, shipName: s.name,
        thrusting: !!(s.thrust && (s.thrust.isThrusting || s.thrust.isReversing)),
        docked: !!game.isDocked
    };
}

function netShipStateUnchanged(a, b) {
    if (!a || !b) return false;
    if (Math.abs(a.x - b.x) >= NET_DRIFT_EPSILON) return false;
    if (Math.abs(a.y - b.y) >= NET_DRIFT_EPSILON) return false;
    for (const k of ['angle', 'vx', 'vy', 'hull', 'hullMax', 'shield', 'hullId', 'shipName', 'thrusting', 'docked']) {
        if (a[k] !== b[k]) return false;
    }
    return true;
}

function netSendShipState() {
    if (!net.online || !netSocket || netSocket.readyState !== 1) return;
    const snap = netShipSnapshot();
    if (!snap) return;
    const now = Date.now();
    // Cheap dirty check: skip when nothing changed beyond sub-epsilon x/y
    // drift — but always send at least every second as a heartbeat.
    if (netShipStateUnchanged(snap, netLastSent) && now - netLastSentAt < NET_HEARTBEAT_MS) return;
    net.send({ t: 'ship.state', ...snap });
    netLastSent = snap;
    netLastSentAt = now;
}

function netStartSender() {
    if (netSendTimer) return;
    netLastSent = null; // fresh connection: first tick always sends
    netSendTimer = setInterval(netSendShipState, NET_SEND_INTERVAL_MS);
}

function netStopSender() {
    if (netSendTimer) { clearInterval(netSendTimer); netSendTimer = null; }
    netLastSent = null;
}

function netManualConnect() {
    netSuppressUntil = 0;
    netRejected = false;
    if (netRetryTimer) { clearTimeout(netRetryTimer); netRetryTimer = null; }
    netOpenSocket();
}

// Console hooks for the verify-net harness
window.netStatus = function() {
    return { online: net.online, pilot: netIdentity.pilot, peers: net.peers.slice(), lastSaveAck: netLastSaveAck };
};
window.netForceDisconnect = function(suppressMs = 5000) {
    netSuppressUntil = Date.now() + suppressMs;
    if (netSocket) { try { netSocket.close(); } catch (e) {} }
};
window.netConnect = function() { netManualConnect(); };
window.netGhosts = function() { return net.getGhosts(); };

// Auto-connect once characterManager has a character (startGame() runs from
// the inline script after this file; poll rather than editing character.js).
if (NET_ALLOWED && netIdentity.complete) {
    const netBootPoll = setInterval(() => {
        if (characterManager.character) {
            clearInterval(netBootPoll);
            netOpenSocket();
        }
    }, 200);
}
