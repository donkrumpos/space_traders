// M3 world authority: markets, market events, mission boards (docs/PROTOCOL.md).
// The pure math lives in js/sim/* (same files the browser loads as script
// tags); this module owns the server-side cadence, persistence, and wire
// handlers. Grudges are carried as world state now so the snapshot shape is
// M4-ready, but nothing writes them until M4.
import { getWorld, saveWorld } from './db.mjs';
import config from './config.mjs';

// Side-effect imports set the globals (same files, no fork — PROTOCOL.md
// "Economy sim extraction").
await import('../js/sim/planets.js');
await import('../js/sim/economy-core.js');
const SIM_PLANETS = globalThis.SIM_PLANETS;
const EconomyCore = globalThis.EconomyCore;

const metaByName = new Map(SIM_PLANETS.map(p => [p.name, p]));

// A board is one offers[] array: delivery offers plus (sometimes) a bounty
// entry (type:'bounty') — one generateMissionOffers roll covers both.
function rollBoard(meta) {
    const { offers, bountyOffer } = EconomyCore.generateMissionOffers(meta, SIM_PLANETS);
    if (bountyOffer) offers.push(bountyOffer);
    return offers;
}

// --- World state: restore from SQLite when present, fresh otherwise --------
// Merge per planet so a roster change (new planet) still boots cleanly.

const world = { markets: {}, marketEvent: null, missionBoards: {}, grudges: {} };

{
    let saved = null;
    try {
        const raw = getWorld();
        if (raw) saved = JSON.parse(raw);
    } catch (e) {
        console.error('world snapshot unreadable, starting fresh:', e.message);
    }
    for (const meta of SIM_PLANETS) {
        world.markets[meta.name] = (saved && saved.markets && saved.markets[meta.name])
            || EconomyCore.makeMarket(meta);
        world.missionBoards[meta.name] = (saved && saved.missionBoards && saved.missionBoards[meta.name])
            || rollBoard(meta);
    }
    if (saved && saved.grudges) world.grudges = saved.grudges;
    // An event that was live at shutdown resumes with its remaining time
    // (endsAt is a server-side wall-clock field added on top of timeLeft).
    if (saved && saved.marketEvent && saved.marketEvent.endsAt > Date.now()) {
        world.marketEvent = saved.marketEvent;
    }
}

// --- Persistence: debounced 5s after any change + every 60s + on SIGTERM ---

let dirty = false;
let dirtyTimer = null;

function persist() {
    if (dirtyTimer) { clearTimeout(dirtyTimer); dirtyTimer = null; }
    dirty = false;
    saveWorld(JSON.stringify(world));
}

function markDirty() {
    dirty = true;
    if (!dirtyTimer) dirtyTimer = setTimeout(persist, config.worldSaveDebounceMs);
}

setInterval(() => { if (dirty) persist(); }, config.worldSaveIntervalMs).unref();

// server.mjs calls this from its SIGTERM/SIGINT shutdown, before closeDb()
export function flushWorld() {
    if (dirty) persist();
}

// --- Market event scheduler -------------------------------------------------
// Same cadence the solo client used (js/economy.js): first stir at 75s,
// events run 180s (timeLeft), 90-210s cooldown between events, 20s retry
// when the rolled planet had nothing to disrupt.

let broadcast = () => {}; // injected by startWorld
let eventTimer = null;    // one timer, reused for cooldown AND expiry

function scheduleEventTimer(ms, fn) {
    if (eventTimer) clearTimeout(eventTimer);
    eventTimer = setTimeout(fn, ms);
}

function tryStartEvent() {
    const ev = EconomyCore.rollMarketEvent(SIM_PLANETS);
    if (!ev) { scheduleEventTimer(20 * 1000, tryStartEvent); return; }
    setEvent(ev);
}

function setEvent(ev) {
    ev.endsAt = Date.now() + ev.timeLeft * 1000; // survives a restart
    world.marketEvent = ev;
    broadcast({ t: 'market.event', marketEvent: ev });
    markDirty();
    scheduleEventTimer(ev.timeLeft * 1000, endEvent);
}

function endEvent() {
    world.marketEvent = null;
    broadcast({ t: 'market.event', marketEvent: null });
    markDirty();
    scheduleEventTimer((90 + Math.random() * 120) * 1000, tryStartEvent);
}

export function startWorld(broadcastFn) {
    broadcast = broadcastFn;
    if (world.marketEvent) {
        scheduleEventTimer(world.marketEvent.endsAt - Date.now(), endEvent);
    } else {
        scheduleEventTimer(75 * 1000, tryStartEvent); // economy.eventCooldown's opening value
    }
}

// --- M4 accessors: grudges + trader market impact ---------------------------
// combat.mjs owns the combat sim but grudges and markets are WORLD state
// (persisted in the snapshot), so mutation goes through here.

export function getGrudges() {
    return world.grudges;
}

// Grudge migration (PROTOCOL.md M4): merge a pilot doc's grudges by max.
// Returns true when anything changed (caller broadcasts grudge.update).
export function mergeGrudgesMax(map) {
    if (!map) return false;
    let changed = false;
    for (const [faction, val] of Object.entries(map)) {
        const n = Number(val);
        if (!Number.isFinite(n)) continue;
        if (n > (world.grudges[faction] || 0)) {
            world.grudges[faction] = n;
            changed = true;
        }
    }
    if (changed) markDirty();
    return changed;
}

// Band-boss kill deepens the shared vendetta
export function bumpGrudge(faction, amount) {
    if (!faction) return;
    world.grudges[faction] = (world.grudges[faction] || 0) + amount;
    markDirty();
}

// NPC freighter dockings nudge world markets exactly like a player trade
// (TrafficCore.dockTrader's applyImpact seam). Returns the mutated market
// (combat.mjs broadcasts market.update) or null on unknown planet.
export function applyTraderImpact(planetName, goodType, side, qty) {
    const meta = metaByName.get(planetName);
    const market = world.markets[planetName];
    if (!meta || !market) return null;
    EconomyCore.tradeImpact(market, meta, goodType, side, qty);
    markDirty();
    return market;
}

// --- Snapshot + wire handlers ------------------------------------------------

export function worldSnapshotMessage() {
    return {
        t: 'world.snapshot',
        markets: world.markets,
        marketEvent: world.marketEvent,
        missionBoards: world.missionBoards,
        grudges: world.grudges
    };
}

// Returns true when the message was M3 territory (handled or deliberately
// swallowed); false lets server.mjs fall through to its unknown-t ignore.
export function handleWorldMessage(ws, msg, send) {
    switch (msg.t) {
        case 'trade': {
            const meta = metaByName.get(msg.planet);
            const market = world.markets[msg.planet];
            const qty = Math.floor(Number(msg.qty));
            const ok = !!(meta && market && qty > 0 &&
                (msg.side === 'buy' ? meta.produces[msg.good] !== undefined
                                    : msg.side === 'sell' && meta.demands[msg.good] !== undefined));
            if (!ok) {
                send(ws, { t: 'trade.result', reqId: msg.reqId, ok: false, prices: null });
                return true;
            }
            // Pre-impact BASE prices for the traded good (perk-free, event-free
            // — the perk pricing rule). The client charges itself from these.
            const prices = { buy: market.buy[msg.good], sell: market.sell[msg.good] };
            EconomyCore.tradeImpact(market, meta, msg.good, msg.side, qty);
            send(ws, { t: 'trade.result', reqId: msg.reqId, ok: true, prices });
            broadcast({ t: 'market.update', planet: msg.planet, market });
            markDirty();
            return true;
        }

        case 'dock': {
            // Docking drives drift, mirroring solo where dock() drifts markets
            // — but server-side only THIS planet's market wanders (per the M3
            // table), so one pilot docking doesn't churn the whole galaxy.
            const meta = metaByName.get(msg.planet);
            const market = world.markets[msg.planet];
            if (!meta || !market) return true;
            EconomyCore.drift(market, meta);
            broadcast({ t: 'market.update', planet: msg.planet, market });
            markDirty();
            return true;
        }

        case 'mission.take': {
            const meta = metaByName.get(msg.planet);
            const board = world.missionBoards[msg.planet];
            if (!meta || !board) {
                send(ws, { t: 'mission.taken', ok: false, mission: null });
                return true;
            }
            const idx = board.findIndex(o => o.id === msg.missionId);
            if (idx === -1) {
                // Someone else took it first — the board is shared
                send(ws, { t: 'mission.taken', ok: false, mission: null });
                return true;
            }
            const [mission] = board.splice(idx, 1);
            send(ws, { t: 'mission.taken', ok: true, mission });
            // Restock like-for-like from a fresh roll so boards never bleed
            // dry: bounty slot refills at the core's own 40% odds.
            const fresh = EconomyCore.generateMissionOffers(meta, SIM_PLANETS);
            const replacement = mission.type === 'bounty' ? fresh.bountyOffer : (fresh.offers[0] || null);
            if (replacement) board.push(replacement);
            broadcast({ t: 'board.update', planet: msg.planet, offers: board });
            markDirty();
            return true;
        }

        case 'debug.marketEvent': {
            if (process.env.VERIFY_DEBUG !== '1') return true; // swallow in prod
            let ev = null;
            for (let i = 0; i < 20 && !ev; i++) ev = EconomyCore.rollMarketEvent(SIM_PLANETS);
            if (!ev) return true;
            let overridden = false;
            for (const k of ['planetName', 'goodType', 'side', 'multiplier']) {
                if (msg[k] !== undefined) { ev[k] = msg[k]; overridden = true; }
            }
            if (overridden) {
                ev.label = `${ev.goodType} ${ev.side === 'sell' ? 'shortage' : 'glut'} at ${ev.planetName}`;
            }
            setEvent(ev);
            return true;
        }

        case 'debug.snapshot': {
            if (process.env.VERIFY_DEBUG !== '1') return true;
            send(ws, worldSnapshotMessage());
            return true;
        }
    }
    return false;
}
