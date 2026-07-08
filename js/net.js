// Client net layer (M1+M2+M3+M4) — pilot handshake, shared saves, offline
// fallback, ghost presence (send own ship state, track peers' ghosts),
// shared world (server-authoritative markets, market events, mission boards),
// shared combat (server-owned enemies/traders/drops via world.tick, damage
// claims, drop claims, shared grudges).
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
    },
    // --- M4: server-owned combat entities ---------------------------------
    // Persistent, game-shaped objects (same fields the local sim produces, so
    // render/collision/homing code needs no branches). Positions interpolate
    // between buffered 10Hz tick snapshots, rendered NET_INTERP_DELAY_MS in
    // the past — always between two real server positions, so AI turns never
    // mispredict and nothing snaps. The getters mutate x/y/angle in place and
    // return the live objects — combat.js/traffic.js merge them into
    // game.enemies/game.traders each frame, so hull predictions and hit
    // feedback land on the same objects the next tick corrects.
    serverEnemies: [],
    serverTraders: [],
    serverDrops: [],
    getServerEnemies() {
        if (!net.online) return [];
        netInterpolate(netEnemyMap);
        return net.serverEnemies;
    },
    getServerTraders() {
        if (!net.online) return [];
        netInterpolate(netTraderMap);
        return net.serverTraders;
    },
    getServerDrops() {
        return net.online ? net.serverDrops : [];
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

// M4 shared combat
const NET_INTERP_DELAY_MS = 150;       // render behind newest tick (1.5 ticks of jitter room)
const NET_SNAP_MAX = 6;                // per-entity snapshot ring (~600ms of history)
const NET_TELEPORT_SPEED = 2000;       // units/s; faster = server respawn, not flight
const NET_DROP_CLAIM_RETRY_MS = 1500;  // re-claim window if drop.taken never lands
const netEnemyMap = new Map();         // id -> persistent game-shaped enemy
const netTraderMap = new Map();        // id -> persistent game-shaped trader
const netDropMap = new Map();          // id -> persistent game-shaped drop
let netLastTickN = 0;

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
    netClearServerWorld();
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
            netCombatTakeover();
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
            // A mistyped family secret persists in localStorage and would
            // fail silently on every future visit (the 2026-07-08 "can't see
            // arthur" playtest). Drop it so the next load re-prompts, and say
            // so on screen — console.warn is invisible to a 6-year-old.
            if (msg.reason === 'bad secret') {
                try { localStorage.removeItem('space_trader_secret'); } catch (e) {}
            }
            if (typeof showHudFeedback === 'function') {
                const why = msg.reason === 'bad secret' ? 'Wrong family secret' : 'Server said no';
                showHudFeedback(`${why} — playing offline. Reload to try again.`, 'error', 10000);
            }
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
        // --- M4: shared combat -------------------------------------------
        case 'world.tick':
            netApplyWorldTick(msg);
            break;
        case 'enemy.hit': {
            const e = netEnemyMap.get(msg.enemyId);
            if (e && typeof msg.hull === 'number') e.hull = msg.hull;
            break;
        }
        case 'enemy.killed':
            netHandleEnemyKilled(msg);
            break;
        case 'drop.taken':
            netHandleDropTaken(msg);
            break;
        case 'grudge.update':
            netApplyGrudges(msg.grudges, false);
            break;
        // Unknown t: ignored (forward compatibility)
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
    // Grudges mirror by MAX on snapshot: the server may not have seeded this
    // pilot's doc yet (char.push races the snapshot), so solo-earned grudges
    // must survive until grudge.update arrives with the merged truth.
    if (snap.grudges) netApplyGrudges(snap.grudges, true);
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

// --- M4: shared combat (server-owned enemies, traders, drops, grudges) ------
// Authority split (PROTOCOL.md): server owns enemy/raid-band/NPC-trader
// spawn/AI/movement, loot drops, grudges. Client owns its OWN projectiles,
// hits on its own ship, its credits/XP. Enemy firing decisions arrive as
// shots-in-tick; the client spawns the visual projectile and resolves damage
// against its own ship locally. Kill celebration waits for enemy.killed.

// Stash a fresh tick position into an entity's snapshot ring. A jump too
// fast to be flight (server-side respawn/teleport) resets the ring so the
// entity snaps to the new spot instead of sliding across the sector.
function netPushSnap(e, wx, wy, angle, now) {
    const s = e._snaps;
    const last = s[s.length - 1];
    if (last && now > last.t) {
        const dtS = (now - last.t) / 1000;
        const vx = (wx - last.x) / dtS;
        const vy = (wy - last.y) / dtS;
        if (vx * vx + vy * vy > NET_TELEPORT_SPEED * NET_TELEPORT_SPEED) s.length = 0;
    }
    s.push({ x: wx, y: wy, angle: angle, t: now });
    if (s.length > NET_SNAP_MAX) s.shift();
}

// One interpolation pass over a stash map, mutating the persistent objects
// in place. Renders NET_INTERP_DELAY_MS behind the newest arrival, lerping
// pos + shortest-arc angle between the two bracketing snapshots — dead
// reckoning is gone; every drawn position sits between two real server
// positions. A stalled feed holds the newest snapshot (a brief freeze reads
// better than a mispredicted sling). Velocity comes from the bracketing
// pair because the M4 wire carries no vx/vy.
function netInterpolate(map) {
    const rt = Date.now() - NET_INTERP_DELAY_MS;
    for (const e of map.values()) {
        const s = e._snaps;
        const n = s.length;
        if (!n) continue;
        if (rt >= s[n - 1].t) {
            // feed stalled (or just spawned): hold the newest known position
            e.x = s[n - 1].x; e.y = s[n - 1].y; e.angle = s[n - 1].angle;
            netPairVelocity(e, s[n - 2], s[n - 1]);
        } else if (rt <= s[0].t) {
            // just spawned/teleported: hold the oldest until rt catches up
            e.x = s[0].x; e.y = s[0].y; e.angle = s[0].angle;
            netPairVelocity(e, null, s[0]);
        } else {
            let i = n - 1;
            while (s[i - 1].t > rt) i--;
            const a = s[i - 1], b = s[i];
            const f = (rt - a.t) / (b.t - a.t);
            e.x = a.x + (b.x - a.x) * f;
            e.y = a.y + (b.y - a.y) * f;
            e.angle = netAngleLerp(a.angle, b.angle, f);
            netPairVelocity(e, a, b);
        }
    }
}

function netAngleLerp(a, b, f) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * f;
}

// velocity in per-frame-at-60fps units, matching local sim objects
// (spawnExplosion / shot-inheritance read enemy.velocity * 60)
function netPairVelocity(e, a, b) {
    if (!a || b.t <= a.t) { e.velocity.x = 0; e.velocity.y = 0; return; }
    const dtS = (b.t - a.t) / 1000;
    e.velocity.x = (b.x - a.x) / dtS / 60;
    e.velocity.y = (b.y - a.y) / dtS / 60;
}

// The M4 enemy wire has no per-shot damage field; infer the tier's damage
// from tierName (band minions arrive prefixed, e.g. "Rustfang Scout"), then
// size, defaulting to raider. Cosmetically exact is not required — own-ship
// damage is client-authoritative and this IS the client's own resolution.
function netInferEnemyDamage(src) {
    if (!src) return 16;
    if (typeof src.damage === 'number') return src.damage;
    if (src.isBandBoss || src.isBoss) return 24;
    const name = (src.tierName || '').toLowerCase();
    if (name.includes('scout')) return 10;
    if (name.includes('warlord')) return 24;
    if (name.includes('raider')) return 16;
    return src.size >= 12 ? 24 : (src.size <= 7 ? 10 : 16);
}

// Deterministic fallback name when the trader wire omits one — both clients
// derive the same label from the same id.
function netTraderNameFor(id) {
    const s = String(id);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const names = (typeof TrafficCore !== 'undefined' && TrafficCore.TRADER_NAMES) || ['Freighter'];
    return names[h % names.length];
}

function netUpsertEnemy(w, now) {
    let e = netEnemyMap.get(w.id);
    if (!e) {
        e = {
            id: w.id,
            type: 'enemy_ship',
            x: w.x, y: w.y, angle: w.angle || 0,
            velocity: { x: 0, y: 0 },
            // synthesized: render draws the red range ring from weapons.range
            weapons: { fireCooldown: 0, maxCooldown: 999999, range: 400, accuracy: 1 },
            _snaps: []
        };
        netEnemyMap.set(w.id, e);
    }
    // x/y/angle are owned by netInterpolate from here on
    netPushSnap(e, w.x, w.y, w.angle || 0, now);
    e.hull = w.hull;            // authoritative — corrects client prediction
    e.maxHull = w.maxHull;
    e.tierName = w.tierName;
    e.color = w.color;
    e.size = w.size;
    e.bandId = w.bandId || null;
    e.isBandBoss = !!w.isBandBoss;
    e.shielded = !!w.shielded;
    e.factionName = w.factionName || null;
    e.isBoss = !!w.isBoss;
    if (typeof w.damage === 'number') e.damage = w.damage;
    return e;
}

function netUpsertTrader(w, now) {
    let t = netTraderMap.get(w.id);
    if (!t) {
        t = {
            id: w.id,
            x: w.x, y: w.y, angle: w.angle || 0,
            velocity: { x: 0, y: 0 },
            // synthesized fields the render path reads but the wire omits:
            // full hull hides the health bar; no goodType = no cargo glow
            hull: 60, maxHull: 60, size: 10,
            goodType: null, qty: 0, fleeing: false,
            _snaps: []
        };
        netTraderMap.set(w.id, t);
    }
    // x/y/angle are owned by netInterpolate from here on
    netPushSnap(t, w.x, w.y, w.angle || 0, now);
    t.state = w.state;
    t.color = w.color;
    t.isEscort = !!w.isEscort;
    t.fleeing = !!w.fleeing; // additive tick field — feeds the distress ping
    t.name = w.name || t.name || netTraderNameFor(w.id);
    return t;
}

function netUpsertDrop(w) {
    let d = netDropMap.get(w.id);
    if (!d) {
        d = {
            id: w.id,
            vx: 0, vy: 0,
            life: 30 // cosmetic only (fade threshold is <5); server owns expiry
        };
        if (w.kind === 'powerup') {
            d.kind = 'powerup';
            // The wire carries no powerType; each client rolls its own flavor
            // (color pre-claim is cosmetic; the claimer's roll is what lands)
            d.powerType = (typeof randomPowerupType === 'function')
                ? randomPowerupType() : 'wave';
        }
        netDropMap.set(w.id, d);
    }
    d.x = w.x; d.y = w.y;
    d.goodType = w.goodType || d.goodType || null;
    d.amount = w.qty || d.amount || 1;
    return d;
}

function netApplyWorldTick(msg) {
    if (!net.online) return;
    netLastTickN = msg.n || netLastTickN;
    const now = Date.now();

    const seenE = new Set();
    (msg.enemies || []).forEach(w => {
        if (!w || w.id === undefined) return;
        seenE.add(w.id);
        netUpsertEnemy(w, now);
    });
    for (const id of [...netEnemyMap.keys()]) {
        if (!seenE.has(id)) netRemoveServerEnemy(id); // quiet (kills come via enemy.killed)
    }

    const seenT = new Set();
    (msg.traders || []).forEach(w => {
        if (!w || w.id === undefined) return;
        seenT.add(w.id);
        netUpsertTrader(w, now);
    });
    for (const id of [...netTraderMap.keys()]) {
        if (!seenT.has(id)) netTraderMap.delete(id);
    }

    const seenD = new Set();
    (msg.drops || []).forEach(w => {
        if (!w || w.id === undefined) return;
        seenD.add(w.id);
        netUpsertDrop(w);
    });
    for (const id of [...netDropMap.keys()]) {
        if (!seenD.has(id)) netDropMap.delete(id); // expired or taken elsewhere
    }

    net.serverEnemies = [...netEnemyMap.values()];
    net.serverTraders = [...netTraderMap.values()];
    net.serverDrops = [...netDropMap.values()];

    (msg.shots || []).forEach(netSpawnEnemyShot);
}

// Enemy fire event → projectile. Fire aimed at THIS pilot is a real
// enemy_laser (own-ship damage resolves locally, client-authoritative).
// Fire aimed at a peer renders as a collisionless tracer — same visual,
// zero damage, skipped by every collision branch.
function netSpawnEnemyShot(s) {
    if (typeof game === 'undefined' || !game.projectiles) return;
    const mine = s.targetPilot === netIdentity.pilot;
    const src = netEnemyMap.get(s.enemyId);
    const angle = s.angle || 0;
    const proj = {
        type: 'enemy_laser',
        source: 'enemy',
        enemyId: s.enemyId,
        x: s.x, y: s.y,
        angle,
        velocity: {
            x: Math.cos(angle) * 600 + (src ? src.velocity.x * 60 : 0),
            y: Math.sin(angle) * 600 + (src ? src.velocity.y * 60 : 0)
        },
        damage: mine ? ((typeof s.damage === 'number') ? s.damage : netInferEnemyDamage(src)) : 0,
        range: 350,
        distanceTraveled: 0,
        color: s.color || (src && src.color) || '#ff4444',
        size: 2,
        age: 0,
        maxAge: 583
    };
    if (!mine) proj.tracer = true;
    game.projectiles.push(proj);
}

function netRemoveServerEnemy(id) {
    const e = netEnemyMap.get(id);
    if (!e) return null;
    netEnemyMap.delete(id);
    // Rebuild NOW, not at the next tick — combat.js re-merges
    // net.serverEnemies into game.enemies every frame, and a killed enemy
    // must not haunt the sector for 100ms after its explosion.
    net.serverEnemies = [...netEnemyMap.values()];
    if (typeof game !== 'undefined' && game.enemies) {
        const gi = game.enemies.indexOf(e);
        if (gi !== -1) game.enemies.splice(gi, 1);
    }
    return e;
}

// Server-confirmed kill. The killer gets the FULL celebration through the
// same combat.js path as local kills (streak math, credits, XP, mission UI);
// everyone else gets the explosion and a modest floater — no credits, no XP.
// grudgeDelta stays null here: grudges are server-owned online and arrive
// via grudge.update (calling recordRaidBroken too would double-count).
function netHandleEnemyKilled(msg) {
    const e = netRemoveServerEnemy(msg.enemyId);

    // Drops that ride the kill message get stashed immediately (idempotent
    // by id — the next world.tick carries the same entries).
    (msg.drops || []).forEach(d => {
        if (d && d.id !== undefined) netUpsertDrop(d);
    });
    net.serverDrops = [...netDropMap.values()];

    if (typeof game === 'undefined' || !game.ship) return;

    if (msg.by === netIdentity.pilot) {
        const kill = e || {
            x: game.ship.x, y: game.ship.y, color: '#ff4444',
            velocity: { x: 0, y: 0 }, maxHull: 60, tierName: null,
            isBandBoss: false, bandId: null
        };
        // Escorts left in the band, counted from what the stash still holds
        let escortsLeft = null;
        if (kill.bandId && !kill.isBandBoss) {
            escortsLeft = 0;
            for (const o of netEnemyMap.values()) {
                if (o.bandId === kill.bandId && !o.isBandBoss) escortsLeft++;
            }
        }
        if (typeof applyKillRewards === 'function') {
            applyKillRewards(kill, {
                reward: msg.reward || 0,
                xp: (kill.maxHull || 60) / 3,
                drops: [],          // server loot arrives via the tick, not local spawns
                bountyId: null,     // named-warlord hunts stay client-local
                isBandBoss: !!kill.isBandBoss,
                grudgeDelta: null,  // server-owned; grudge.update is the truth
                escortsLeft
            });
        }
    } else if (e) {
        if (typeof spawnExplosion === 'function') {
            spawnExplosion(e.x, e.y, e.color, e.velocity.x * 60, e.velocity.y * 60);
        }
        if (typeof spawnFloater === 'function') {
            spawnFloater(e.x, e.y - 25, `☠ ${msg.by}`, '#8899aa', 13);
        }
    }
}

// Fly-through claim pass for server drops — runs from the updateDrops shadow
// below, so it shares the frame cadence of local drop scooping. First claim
// wins server-side; drop.taken settles it. A full hold never claims cargo
// (the claimer applies the pickup, so claiming what you can't scoop would
// vaporize the crate for everyone).
function netUpdateServerDrops() {
    if (typeof game === 'undefined' || !game.ship) return;
    const now = Date.now();
    for (const d of netDropMap.values()) {
        const dx = d.x - game.ship.x;
        const dy = d.y - game.ship.y;
        if (dx * dx + dy * dy >= 26 * 26) continue;
        if (d._claimedAt && now - d._claimedAt < NET_DROP_CLAIM_RETRY_MS) continue;
        if (d.kind !== 'powerup') {
            const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
            if (game.ship.cargoMax - cargoUsed <= 0) continue;
        }
        d._claimedAt = now;
        net.send({ t: 'drop.claim', dropId: d.id });
    }
}

function netHandleDropTaken(msg) {
    const d = netDropMap.get(msg.dropId);
    netDropMap.delete(msg.dropId);
    net.serverDrops = [...netDropMap.values()];
    if (!d || typeof game === 'undefined' || !game.ship) return;
    if (msg.by !== netIdentity.pilot) return; // someone else scooped it

    if (d.kind === 'powerup') {
        activatePowerup(d.powerType || (typeof randomPowerupType === 'function'
            ? randomPowerupType() : 'wave'));
        return;
    }
    // Same semantics as the local scoop path in world.js updateDrops:
    // space-capped pickup, floater + sound, missions refresh. Overflow is
    // lost (first claim wins) — which the claim gate above makes rare.
    const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
    const taken = Math.min(Math.max(game.ship.cargoMax - cargoUsed, 0), d.amount || 1);
    if (taken <= 0) return;
    game.ship.cargo[d.goodType] = (game.ship.cargo[d.goodType] || 0) + taken;
    spawnFloater(d.x, d.y - 12, `+${taken} ${goods[d.goodType].name}`, goods[d.goodType].color);
    playPickupSound();
    updateMissionsUI();
}

// Mirror shared grudges into game.pilot.grudges. Direct assignment on
// grudge.update (server is authority); max-merge on snapshot (see
// netApplySnapshot). Solo play keeps working offline from the mirrored copy.
function netApplyGrudges(grudges, seedByMax) {
    if (!grudges) return;
    net.grudges = grudges;
    if (typeof game === 'undefined' || !game.pilot || !game.pilot.grudges) return;
    const g = game.pilot.grudges;
    Object.keys(grudges).forEach(f => {
        g[f] = seedByMax ? Math.max(g[f] || 0, grudges[f] || 0) : grudges[f];
    });
    if (typeof updateFactionUI === 'function') updateFactionUI();
}

// Reconnect: the local sim stops cleanly — quiet despawn (no explosions) of
// local sim entities. Survivors: named-warlord bounty targets (client-local
// hunts, isBoss), escort-ambush raiders (escortAmbush, tagged in traffic.js),
// and isEscort traders. Server entities flow in on the next world.tick.
function netCombatTakeover() {
    if (typeof game === 'undefined') return;
    if (game.enemies) {
        game.enemies = game.enemies.filter(e =>
            e.id !== undefined || e.isBoss || e.escortAmbush);
    }
    if (game.traders) {
        game.traders = game.traders.filter(t => t.isEscort);
    }
}

// Disconnect: server entities fade out quietly (no explosions, no bounty) and
// the local sim resumes on its own spawn cadence next frame.
function netClearServerWorld() {
    if (typeof game !== 'undefined') {
        if (game.enemies) game.enemies = game.enemies.filter(e => e.id === undefined);
        if (game.traders) game.traders = game.traders.filter(t => t.id === undefined);
        if (game.projectiles) game.projectiles = game.projectiles.filter(p => !p.tracer);
    }
    netEnemyMap.clear();
    netTraderMap.clear();
    netDropMap.clear();
    net.serverEnemies = [];
    net.serverTraders = [];
    net.serverDrops = [];
    netLastTickN = 0;
}

// Server-drop claim pass rides the same frame cadence as local drop scooping.
// Instance-shadow pattern (like startMarketEvent): world.js is not edited.
const netOrigUpdateDrops = updateDrops;
updateDrops = function(deltaTime) {
    netOrigUpdateDrops(deltaTime);
    if (net.online) netUpdateServerDrops();
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

window.netCombat = function() {
    return {
        enemies: net.getServerEnemies().map(e => ({
            id: e.id, x: e.x, y: e.y, hull: e.hull, maxHull: e.maxHull,
            tierName: e.tierName, bandId: e.bandId, isBandBoss: e.isBandBoss,
            shielded: e.shielded, factionName: e.factionName, isBoss: e.isBoss
        })),
        traders: net.getServerTraders().map(t => ({
            id: t.id, x: t.x, y: t.y, state: t.state, name: t.name, isEscort: t.isEscort
        })),
        drops: net.getServerDrops().map(d => ({
            id: d.id, x: d.x, y: d.y, kind: d.kind || 'cargo',
            goodType: d.goodType, qty: d.amount
        })),
        lastTickN: netLastTickN
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
