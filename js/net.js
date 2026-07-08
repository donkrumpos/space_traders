// Client net layer (M1+M2+M3) — pilot handshake, shared saves, offline
// fallback, ghost presence (send own ship state, track peers' ghosts),
// shared world (server-authoritative markets, market events, mission boards).
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
    },
    // M3 request/response interface. Each returns a Promise that resolves
    // with the server reply message and rejects on timeout/disconnect.
    // Perk pricing rule: replies carry BASE prices; callers apply their own
    // pilot's perk + event multipliers at apply time.
    trade({ planet, good, side, qty }) {
        const name = planet && planet.name ? planet.name : planet;
        return netRequest('trade', { planet: name, good, side, qty }, 'trade');
    },
    takeMission(planet, missionId) {
        const name = planet && planet.name ? planet.name : planet;
        return netRequest('mission.take', { planet: name, missionId }, 'mission');
    },
    dockAt(planet) {
        // Fire-and-forget: server runs drift for that planet and answers
        // with a market.update broadcast (handled below).
        const name = planet && planet.name ? planet.name : planet;
        net.send({ t: 'dock', planet: name });
    },
    // Apply the stashed server board for a planet onto the planet object the
    // board UI reads (planet.missionOffers / planet.bountyOffer). Escort
    // offers stay client-local (M3) and are untouched here, so the existing
    // updateMissionBoardUI merges them naturally. The one-hunt-at-a-time
    // gate is player state and belongs to this caller side, not the server.
    applyBoard(planet) {
        const board = netBoards.get(planet.name);
        planet.missionOffers = board ? (board.offers || []).slice() : [];
        const alreadyHunting = (game.missions || []).some(m => m.type === 'bounty');
        planet.bountyOffer = (!alreadyHunting && board) ? (board.bountyOffer || null) : null;
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

// M3 shared world
const NET_REQ_TIMEOUT_MS = 5000;       // pending trade/mission requests
const netPending = new Map();          // reqId -> { resolve, reject, timer, kind }
const netBoards = new Map();           // planetName -> { offers, bountyOffer }
let netReqSeq = 0;

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
    netRejectAllPending('offline');
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
            // world.snapshot is "sent in welcome" — tolerate either an
            // embedded snapshot field or a standalone world.snapshot message
            // right after (handled below). Applied AFTER the sync rule so an
            // adopted char doc's stale world section can't clobber it.
            if (msg.snapshot) netApplySnapshot(msg.snapshot);
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
        // --- M3: shared world -------------------------------------------
        case 'world.snapshot':
            netApplySnapshot(msg);
            break;
        case 'market.update':
            netApplyMarket(msg.planet, msg.market);
            break;
        case 'market.event':
            netApplyMarketEvent(msg.marketEvent || null, true);
            break;
        case 'trade.result':
            netResolvePending(msg, 'trade');
            break;
        case 'mission.taken':
            netResolvePending(msg, 'mission');
            break;
        case 'board.update':
            netApplyBoardUpdate(msg);
            break;
        // Unknown t: ignored (forward compatibility with M4)
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

// --- M3: shared world (markets, market events, mission boards) --------------
// Server is authoritative for planet markets, the market-event singleton, and
// per-planet mission boards (delivery + bounty). The wire carries BASE prices
// only (perk pricing rule); each client applies its own perk + event
// multipliers at read/apply time. Escort offers stay client-local. Credits
// and cargo are own-ship state: the client mutates them itself on trade.result.

function netRequest(t, payload, kind) {
    if (!net.online || !netSocket || netSocket.readyState !== 1) {
        return Promise.reject(new Error('offline'));
    }
    const reqId = `${netIdentity.pilot}-${++netReqSeq}`;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            netPending.delete(reqId);
            reject(new Error('timeout'));
        }, NET_REQ_TIMEOUT_MS);
        netPending.set(reqId, { resolve, reject, timer, kind });
        net.send({ t, reqId, ...payload });
    });
}

// PROTOCOL's mission.taken payload carries no reqId; we send one anyway
// (unknown fields are ignored) and fall back to the oldest pending request
// of the right kind when the reply omits it.
function netResolvePending(msg, kind) {
    let reqId = msg.reqId;
    if (!reqId || !netPending.has(reqId)) {
        reqId = null;
        for (const [id, p] of netPending) {
            if (p.kind === kind) { reqId = id; break; }
        }
    }
    if (!reqId) return;
    const p = netPending.get(reqId);
    netPending.delete(reqId);
    clearTimeout(p.timer);
    p.resolve(msg);
}

function netRejectAllPending(reason) {
    for (const [, p] of netPending) {
        clearTimeout(p.timer);
        p.reject(new Error(reason));
    }
    netPending.clear();
}

// markets/missionBoards arrive either keyed by planet name or as arrays of
// { name|planet, ... } — normalize both (char docs use the array form).
function netEntryFor(collection, planetName) {
    if (!collection) return null;
    if (Array.isArray(collection)) {
        return collection.find(e => e && (e.name === planetName || e.planet === planetName)) || null;
    }
    return collection[planetName] || null;
}

function netApplySnapshot(snap) {
    if (typeof game === 'undefined' || !game.planets) return;
    if (snap.markets) {
        game.planets.forEach(planet => {
            const m = netEntryFor(snap.markets, planet.name);
            if (m && m.buy && m.sell) netApplyMarket(planet.name, m);
        });
    }
    if ('marketEvent' in snap) netApplyMarketEvent(snap.marketEvent || null, false);
    if (snap.missionBoards) {
        game.planets.forEach(planet => {
            const b = netEntryFor(snap.missionBoards, planet.name);
            if (b) netStashBoard(planet.name, b);
        });
    }
    if (snap.grudges) net.grudges = snap.grudges; // stashed; applied in M4
}

function netApplyMarket(planetName, market) {
    if (typeof game === 'undefined' || !game.planets || !market) return;
    const planet = game.planets.find(p => p.name === planetName);
    if (!planet || !planet.market) return;
    // Merge over defaults so goods the server doesn't know keep fresh prices
    planet.market = {
        buy: { ...planet.market.buy, ...(market.buy || {}) },
        sell: { ...planet.market.sell, ...(market.sell || {}) }
    };
    if (game.isDocked && game.currentPlanet === planet) {
        recordLedger(planet);       // berthed here = these are the prices you saw
        refreshDockedTradeUI();
    }
}

// Set/clear the market-event singleton. announce=true reuses the exact HUD
// announcement wording from economy.js startMarketEvent / updateEconomy.
function netApplyMarketEvent(ev, announce) {
    if (typeof economy === 'undefined') return;
    const prev = economy.marketEvent;
    economy.marketEvent = ev;
    if (announce && typeof showHudFeedback === 'function') {
        if (ev && !(prev && prev.label === ev.label && prev.planetName === ev.planetName)) {
            const goodName = goods[ev.goodType] ? goods[ev.goodType].name : ev.goodType;
            if (ev.side === 'sell') {
                showHudFeedback(`⚡ ${ev.label} — ${goodName} sells at ${ev.multiplier.toFixed(1)}× for 3 min!`, 'warning', 6000);
            } else {
                showHudFeedback(`⚡ ${ev.label} — ${goodName} is dirt cheap for 3 min!`, 'warning', 6000);
            }
        } else if (!ev && prev) {
            showHudFeedback(`Markets normalize — ${prev.label} is over`, 'info');
        }
    }
    if (typeof updateLedgerUI === 'function') updateLedgerUI();
    if (typeof refreshDockedTradeUI === 'function') refreshDockedTradeUI();
}

// Server boards are ONE offers[] array with the bounty entry (type:'bounty')
// inline when the roll produced one (locked server-authority details). The
// board UI renders bounty and deliveries from different planet fields, so
// split the inline bounty out here. Also tolerates a { offers, bountyOffer }
// object shape (the core's return shape) in case a board ever arrives split.
function netStashBoard(planetName, board) {
    let offers = Array.isArray(board) ? board : (board.offers || []);
    let bountyOffer = (!Array.isArray(board) && board.bountyOffer) || null;
    const inline = offers.find(o => o && o.type === 'bounty');
    offers = offers.filter(o => o && o.type !== 'bounty');
    netBoards.set(planetName, { offers, bountyOffer: bountyOffer || inline || null });
}

function netApplyBoardUpdate(msg) {
    if (!msg.planet) return;
    netStashBoard(msg.planet, msg);
    if (typeof game !== 'undefined' && game.isDocked && game.currentPlanet
        && game.currentPlanet.name === msg.planet) {
        net.applyBoard(game.currentPlanet);
        if (typeof updateMissionBoardUI === 'function') updateMissionBoardUI(game.currentPlanet);
    }
}

// When online the server owns the market-event cadence — the local roll in
// economy.js updateEconomy() must not invent client-only events (prices would
// diverge from trade.result bases). Same instance-shadow pattern as the
// saveCharacter wrapper: economy.js itself is not edited.
const netOrigStartMarketEvent = startMarketEvent;
startMarketEvent = function() {
    if (net.online) { economy.eventCooldown = 30; return; } // server's call
    netOrigStartMarketEvent();
};

// Accepting a delivery/bounty offer while online routes through the server
// (mission.take) so the board regenerates for everyone. The mission-log-full
// and one-hunt gates are player state and stay caller-side per PROTOCOL.
// Offline path calls straight through to the original functions.
const netOrigAcceptMission = acceptMission;
acceptMission = function(offerId) {
    if (!net.online) return netOrigAcceptMission(offerId);
    const planet = game.currentPlanet;
    if (!planet || !planet.missionOffers) return;
    if (game.missions.length >= 3) {
        showHudFeedback('Mission log full (3 contracts max)', 'error');
        return;
    }
    const offer = planet.missionOffers.find(o => o.id === offerId);
    if (!offer) return;
    net.takeMission(planet, offerId).then(res => {
        if (!res || !res.ok) { showHudFeedback('Contract no longer available', 'error'); return; }
        if (game.missions.length >= 3) return; // re-check: reply came back async
        game.missions.push(res.mission || offer);
        planet.missionOffers = planet.missionOffers.filter(o => o.id !== offerId);
        const b = netBoards.get(planet.name);
        if (b) b.offers = (b.offers || []).filter(o => o.id !== offerId);
        showHudFeedback('Contract accepted', 'success');
        if (game.isDocked && game.currentPlanet === planet) updateMissionBoardUI(planet);
        updateMissionsUI();
    }).catch(() => showHudFeedback('Contract no longer available', 'error'));
};

const netOrigAcceptBounty = acceptBounty;
acceptBounty = function() {
    if (!net.online) return netOrigAcceptBounty();
    const planet = game.currentPlanet;
    if (!planet || !planet.bountyOffer) return;
    if (game.missions.length >= 3) {
        showHudFeedback('Mission log full (3 contracts max)', 'error');
        return;
    }
    const bounty = planet.bountyOffer;
    net.takeMission(planet, bounty.id).then(res => {
        if (!res || !res.ok) { showHudFeedback('Poster already claimed', 'error'); return; }
        if (game.missions.length >= 3) return;
        const mission = res.mission || bounty;
        planet.bountyOffer = null;
        const b = netBoards.get(planet.name);
        if (b) b.bountyOffer = null;
        game.missions.push(mission);
        spawnNamedWarlord(mission); // the hunt target itself is local combat
        showHudFeedback(`Hunt accepted: ${mission.name}, last seen near ${mission.nearPlanet}`, 'success', 4500);
        if (game.isDocked && game.currentPlanet === planet) updateMissionBoardUI(planet);
        updateMissionsUI();
    }).catch(() => showHudFeedback('Poster already claimed', 'error'));
};

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
window.netWorld = function() {
    return {
        marketFor(planetName) {
            const p = (typeof game !== 'undefined' && game.planets)
                ? game.planets.find(pl => pl.name === planetName) : null;
            return p ? p.market : null;
        },
        marketEvent: (typeof economy !== 'undefined') ? economy.marketEvent : null,
        boardFor(planetName) { return netBoards.get(planetName) || null; }
    };
};

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
