// M3 world authority: markets, market events, mission boards (docs/PROTOCOL.md).
// The pure math lives in js/sim/* (same files the browser loads as script
// tags); this module owns the server-side cadence, persistence, and wire
// handlers. Grudges are carried as world state now so the snapshot shape is
// M4-ready, but nothing writes them until M4.
import { getWorld, saveWorld } from './db.mjs';
import config from './config.mjs';

// Side-effect imports set the globals (same files, no fork — PROTOCOL.md
// "Economy sim extraction"). combat-core is here for pickRaidFaction (M6
// occupations are grudge-weighted); combat.mjs re-imports it for free.
await import('../js/sim/planets.js');
await import('../js/sim/pois.js');
await import('../js/sim/economy-core.js');
await import('../js/sim/combat-core.js');
const SIM_PLANETS = globalThis.SIM_PLANETS;
const SIM_POIS = globalThis.SIM_POIS || [];
const EconomyCore = globalThis.EconomyCore;
const CombatCore = globalThis.CombatCore;

const metaByName = new Map(SIM_PLANETS.map(p => [p.name, p]));
// Valid POI ids — reject discovery reports for anything not in the roster
const POI_IDS = new Set(SIM_POIS.map(p => p.id));
const poiMetaById = new Map(SIM_POIS.map(p => [p.id, p]));

// A board is one offers[] array: delivery offers plus (sometimes) a bounty
// entry (type:'bounty') — one generateMissionOffers roll covers both.
function rollBoard(meta) {
    const { offers, bountyOffer } = EconomyCore.generateMissionOffers(meta, SIM_PLANETS);
    if (bountyOffer) offers.push(bountyOffer);
    return offers;
}

// --- World state: restore from SQLite when present, fresh otherwise --------
// Merge per planet so a roster change (new planet) still boots cleanly.

// discoveredPOIs: { poiId: { pilot, at } } — the galaxy-wide charter record,
// first-write-wins. Persisted in the singleton world snapshot like grudges.
// chronicle: the world's memory (M6) — a capped ledger of notable happenings
// ({ at, kind, ...detail }), newest last. Persisted so "while you were away"
// survives restarts; clients diff it against welcome.lastSeen for the digest.
// poiState: { poiId: { nextSalvageAt, occupation } } — regenerating caches +
// occupations (M6). Cache readiness is COMPUTED on read against wall-clock
// (the marketEvent.endsAt pattern taken further: no timers at all), so it
// needs no catch-up logic and survives any restart or idle stretch for free.
// occupation: { faction, color, since } | undefined — pirates dug in at a
// charted site; salvage blocked until a pilot breaks the band (combat.mjs).
// nextOccupationAt: wall-clock stamp of the next occupation roll (persisted).
// factions: { key: { name, color, want: { kind, words }, founder, members: [],
// invites: [], foundedAt } } — player-founded factions (M7), keyed by
// lowercased name. A row in the same ledger the Rustfang live in: plain data,
// same world blob, no schema change. Invites are public registry data (family
// trust model) — the client sees its own standing invite in the snapshot.
const world = { markets: {}, marketEvent: null, missionBoards: {}, grudges: {}, discoveredPOIs: {}, chronicle: [], poiState: {}, nextOccupationAt: 0, factions: {} };

// M6 cadence knobs — declared ABOVE the restore block below, which calls the
// roll helpers at module init (const TDZ would bite otherwise).
const SALVAGE_MIN_MS = 12 * 3600 * 1000;      // cache regen: 12-24h w/ jitter
const SALVAGE_JITTER_MS = 12 * 3600 * 1000;
const OCCUPATION_MIN_MS = 12 * 3600 * 1000;   // occupation roll: 12-24h apart
const OCCUPATION_JITTER_MS = 12 * 3600 * 1000;
const OCCUPATION_MAX = 2;
const CLAIM_OCCUPY_WEIGHT = 2;                // claimed sites draw raiders (M7)

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
    if (saved && saved.discoveredPOIs) world.discoveredPOIs = saved.discoveredPOIs;
    if (saved && Array.isArray(saved.chronicle)) world.chronicle = saved.chronicle;
    if (saved && saved.poiState) world.poiState = saved.poiState;
    if (saved && saved.nextOccupationAt) world.nextOccupationAt = saved.nextOccupationAt;
    if (saved && saved.factions) world.factions = saved.factions;
    // Migration: sites charted before caches existed get a cycle seeded now,
    // so a live world's landmarks start regenerating on the next deploy.
    for (const id of Object.keys(world.discoveredPOIs)) {
        if (!world.poiState[id]) world.poiState[id] = { nextSalvageAt: rollNextSalvageAt() };
    }
    // First boot (or pre-occupation world): the first raiders muster 12-24h out
    if (!world.nextOccupationAt) world.nextOccupationAt = Date.now() + rollOccupationDelay();
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

// --- Chronicle (M6): the world remembers -------------------------------------
// One append path for every notable happening. Entries are small and flat:
// { at, kind, ...detail }. Kinds so far: 'poi.charted' { pilot, poi, name },
// 'market.event' { label, planet }, 'boss.killed' { pilot, faction, tier }.
// Capped so the snapshot blob can't grow without bound; broadcast so open
// clients keep their Galaxy Log current without re-snapshotting.

const CHRONICLE_MAX = 100;

// Regenerating caches (M6): after a charter or a salvage claim, the next
// salvage window opens 12-24h out — the daily-ish cadence pinned at kickoff.
// A daily check-in usually finds SOMETHING ready across seven sites; the
// jitter keeps the refresh from being clockwork-farmable.
function rollNextSalvageAt(now = Date.now()) {
    return now + SALVAGE_MIN_MS + Math.random() * SALVAGE_JITTER_MS;
}

// Occupations (M6): daily-ish, a pirate band digs in at a charted site.
// The world only ever ADDS (kickoff fork): nothing is lost, but the site's
// cache is blocked until someone flies out and breaks the band — danger as
// content, feeding the loved chaotic combat. Capped at 2 concurrent so the
// map never clogs; grudge-weighted faction pick makes the shared vendetta
// visible on the map. Liberation opens the cache IMMEDIATELY — clear the
// pirates, collect the salvage, one tight loop.
function rollOccupationDelay() {
    return OCCUPATION_MIN_MS + Math.random() * OCCUPATION_JITTER_MS;
}

function poiStateMessage(id) {
    const st = world.poiState[id] || {};
    return { t: 'poi.state', id, nextSalvageAt: st.nextSalvageAt || null,
             occupation: st.occupation || null, claim: st.claim || null };
}

function occupyPOI(id, faction) {
    const st = world.poiState[id];
    const meta = poiMetaById.get(id);
    if (!st || !meta || st.occupation) return false;
    st.occupation = { faction: faction.name, color: faction.color || null, since: Date.now() };
    recordChronicle('poi.occupied', { faction: faction.name, poi: id, name: meta.name });
    broadcast(poiStateMessage(id));
    markDirty();
    return true;
}

// The roll clock: a cheap 60s check against the persisted wall-clock stamp.
// A long-dead server rolls at most ONE catch-up occupation on resume (the
// stamp then jumps to the future) — gentler than backfilling a week of raids.
function maybeRollOccupation() {
    if (Date.now() < world.nextOccupationAt) return;
    world.nextOccupationAt = Date.now() + rollOccupationDelay();
    markDirty();
    const occupied = Object.values(world.poiState).filter(s => s && s.occupation).length;
    if (occupied >= OCCUPATION_MAX) return;
    const candidates = Object.keys(world.discoveredPOIs)
        .filter(id => world.poiState[id] && !world.poiState[id].occupation);
    if (candidates.length === 0) return; // nothing charted yet — quiet sky
    // A raised banner draws the raiders (M7): claimed sites weigh double —
    // planting your mark is a standing invitation to defend it.
    const weights = candidates.map(id => world.poiState[id].claim ? CLAIM_OCCUPY_WEIGHT : 1);
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    let id = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i];
        if (roll <= 0) { id = candidates[i]; break; }
    }
    occupyPOI(id, CombatCore.pickRaidFaction(world.grudges));
}

setInterval(maybeRollOccupation, 60 * 1000).unref();

// combat.mjs asks where the raiders sit (site coords + who) each spawn check
export function getOccupiedPOIs() {
    const out = [];
    for (const [id, st] of Object.entries(world.poiState)) {
        if (!st || !st.occupation) continue;
        const meta = poiMetaById.get(id);
        if (meta) out.push({ id, x: meta.x, y: meta.y, faction: st.occupation.faction });
    }
    return out;
}

// The band boss at an occupied site died: the site is free and the cache
// opens NOW — the fight earns the salvage on the spot.
export function liberatePOI(id, pilot) {
    const st = world.poiState[id];
    const meta = poiMetaById.get(id);
    if (!st || !st.occupation || !meta) return;
    const faction = st.occupation.faction;
    st.occupation = null;
    st.nextSalvageAt = Date.now();
    // M7 liberation credit: repelling raiders from your own claimed site is
    // the faction's chronicled deed, not just the pilot's.
    const mine = factionOfPilot(pilot);
    const by = (st.claim && mine && mine.name === st.claim.faction) ? st.claim.faction : undefined;
    recordChronicle('poi.liberated', by
        ? { pilot, faction, poi: id, name: meta.name, by }
        : { pilot, faction, poi: id, name: meta.name });
    broadcast(poiStateMessage(id));
    markDirty();
}

// --- Player factions (M7): a banner is a declared want ----------------------
// Founding is a naming-event: chronicled, broadcast, permanent (lore-bible §9).
// The server validates shape + uniqueness; the fee and rank gate are client-
// side like all credit spends (credits are client-authoritative, M3 rule).
// Charset rules double as innerHTML safety: no <>& ever enters the registry.

const FACTION_MAX = 8;                        // runaway-banner backstop
const FACTION_NAME_RE = /^[A-Za-z0-9' -]{3,24}$/;
const FACTION_WORDS_RE = /^[^<>&]{3,60}$/;
const FACTION_WANT_KINDS = new Set(['place', 'trade', 'grudge']);
// The authored cartels' names and colors are taken — and so is the Guild's
// name, which exists in lore but not in PIRATE_FACTIONS.
const RESERVED_NAMES = new Set([
    ...CombatCore.PIRATE_FACTIONS.map(f => f.name.toLowerCase()),
    'meridian guild', 'meridian charter combine',
]);
const RESERVED_COLORS = new Set(CombatCore.PIRATE_FACTIONS.map(f => f.color.toLowerCase()));

function factionKey(name) { return String(name).trim().toLowerCase(); }

function factionOfPilot(pilot) {
    for (const f of Object.values(world.factions)) {
        if (f.members.includes(pilot)) return f;
    }
    return null;
}

function factionsMessage() {
    return { t: 'faction.update', factions: world.factions };
}

export function recordChronicle(kind, detail) {
    const entry = { at: Date.now(), kind, ...detail };
    world.chronicle.push(entry);
    if (world.chronicle.length > CHRONICLE_MAX) {
        world.chronicle.splice(0, world.chronicle.length - CHRONICLE_MAX);
    }
    broadcast({ t: 'chronicle.add', entry });
    markDirty();
    return entry;
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
    recordChronicle('market.event', { label: ev.label, planet: ev.planetName });
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
        grudges: world.grudges,
        discoveredPOIs: world.discoveredPOIs,
        chronicle: world.chronicle,
        poiState: world.poiState,
        factions: world.factions
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
            // Object.hasOwn, not `!== undefined`: inherited keys ("toString",
            // "constructor") would pass the loose check and write NaN prices
            // into the shared, persisted market
            const ok = !!(meta && market && qty > 0 && typeof msg.good === 'string' &&
                (msg.side === 'buy' ? Object.hasOwn(meta.produces, msg.good)
                                    : msg.side === 'sell' && Object.hasOwn(meta.demands, msg.good)));
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
                send(ws, { t: 'mission.taken', reqId: msg.reqId, ok: false, mission: null });
                return true;
            }
            const idx = board.findIndex(o => o.id === msg.missionId);
            if (idx === -1) {
                // Someone else took it first — the board is shared
                send(ws, { t: 'mission.taken', reqId: msg.reqId, ok: false, mission: null });
                return true;
            }
            const [mission] = board.splice(idx, 1);
            send(ws, { t: 'mission.taken', reqId: msg.reqId, ok: true, mission });
            // Restock like-for-like from a fresh roll so boards never bleed
            // dry: bounty slot refills at the core's own 40% odds.
            const fresh = EconomyCore.generateMissionOffers(meta, SIM_PLANETS);
            const replacement = mission.type === 'bounty' ? fresh.bountyOffer : (fresh.offers[0] || null);
            if (replacement) board.push(replacement);
            broadcast({ t: 'board.update', planet: msg.planet, offers: board });
            markDirty();
            return true;
        }

        case 'poi.discover': {
            // A pilot charted a point of interest. First charter wins galaxy-wide
            // (later reports never overwrite the name); the broadcast makes the
            // site a landmark on every pilot's map. The pilot name comes from the
            // authenticated handshake (ws.pilot), never a payload field.
            const id = typeof msg.id === 'string' ? msg.id : null;
            if (!id || !POI_IDS.has(id)) return true; // unknown site — ignore
            if (!world.discoveredPOIs[id]) {
                world.discoveredPOIs[id] = { pilot: ws.pilot, at: Date.now() };
                const meta = poiMetaById.get(id);
                recordChronicle('poi.charted', { pilot: ws.pilot, poi: id, name: meta ? meta.name : id });
                // The cache starts its first regeneration cycle at charter time
                world.poiState[id] = { nextSalvageAt: rollNextSalvageAt() };
                broadcast(poiStateMessage(id));
                markDirty();
            }
            const rec = world.discoveredPOIs[id];
            broadcast({ t: 'poi.discovered', id, pilot: rec.pilot, at: rec.at });
            return true;
        }

        case 'poi.salvage': {
            // A pilot at a charted site claims its regenerated cache. First
            // come wins galaxy-wide (mission-board precedent): readiness is
            // checked against wall-clock, and a successful claim immediately
            // rolls the next window so a racing second claim bounces. The
            // reward comes from the roster's salvage table server-side — the
            // client applies exactly what the reply says.
            const id = typeof msg.id === 'string' ? msg.id : null;
            const st = id ? world.poiState[id] : null;
            const meta = id ? poiMetaById.get(id) : null;
            // Occupied sites yield nothing until the band is broken (M6
            // occupations) — the refusal tells the client who's squatting.
            const ready = !!(st && !st.occupation && world.discoveredPOIs[id]
                && Date.now() >= st.nextSalvageAt);
            if (!ready || !meta) {
                send(ws, { t: 'poi.salvaged', reqId: msg.reqId, ok: false, id,
                           nextSalvageAt: st ? st.nextSalvageAt : null,
                           occupation: (st && st.occupation) || null });
                return true;
            }
            st.nextSalvageAt = rollNextSalvageAt();
            recordChronicle('poi.salvaged', { pilot: ws.pilot, poi: id, name: meta.name });
            send(ws, { t: 'poi.salvaged', reqId: msg.reqId, ok: true, id,
                       reward: meta.salvage || { credits: 200, xp: 15 },
                       nextSalvageAt: st.nextSalvageAt });
            broadcast(poiStateMessage(id));
            markDirty();
            return true;
        }

        case 'faction.found': {
            // Sign the articles: name + color + want, chronicled forever.
            const name = typeof msg.name === 'string' ? msg.name.trim() : '';
            const color = typeof msg.color === 'string' ? msg.color.trim().toLowerCase() : '';
            const kind = msg.want && msg.want.kind;
            const words = msg.want && typeof msg.want.words === 'string' ? msg.want.words.trim() : '';
            const key = factionKey(name);
            const fail = reason =>
                send(ws, { t: 'faction.founded', reqId: msg.reqId, ok: false, reason });
            if (!FACTION_NAME_RE.test(name)) return fail('a banner needs a sayable name (3-24 plain characters)');
            if (RESERVED_NAMES.has(key) || world.factions[key]) return fail('that name is already in the ledger');
            if (!/^#[0-9a-f]{6}$/.test(color) || RESERVED_COLORS.has(color)) return fail('that color flies over someone else\'s ships');
            if (!FACTION_WANT_KINDS.has(kind) || !FACTION_WORDS_RE.test(words)) return fail('say what your crew wants — a few plain words');
            if (factionOfPilot(ws.pilot)) return fail('you already fly under a banner');
            if (Object.keys(world.factions).length >= FACTION_MAX) return fail('the ledger is full of banners nobody buried');
            const faction = {
                name, color, want: { kind, words },
                founder: ws.pilot, members: [ws.pilot], invites: [],
                foundedAt: Date.now(),
            };
            world.factions[key] = faction;
            send(ws, { t: 'faction.founded', reqId: msg.reqId, ok: true, faction });
            broadcast(factionsMessage());
            recordChronicle('faction.founded', { faction: name, founder: ws.pilot, want: words });
            markDirty();
            return true;
        }

        case 'faction.invite': {
            // Founder names a pilot; the invite sits in the public registry
            // until they sign on (no expiry — the scale is a family).
            const f = factionOfPilot(ws.pilot);
            const pilot = typeof msg.pilot === 'string' ? msg.pilot.trim() : '';
            const fail = reason =>
                send(ws, { t: 'faction.invited', reqId: msg.reqId, ok: false, reason });
            if (!f || f.founder !== ws.pilot) return fail('only the founder signs invitations');
            if (!/^[^<>&]{1,40}$/.test(pilot) || pilot === ws.pilot) return fail('name a pilot');
            if (f.members.includes(pilot)) return fail(`${pilot} already flies with you`);
            if (!f.invites.includes(pilot)) f.invites.push(pilot);
            send(ws, { t: 'faction.invited', reqId: msg.reqId, ok: true, pilot });
            broadcast(factionsMessage());
            markDirty();
            return true;
        }

        case 'faction.join': {
            const key = factionKey(msg.name || '');
            const f = world.factions[key];
            const fail = reason =>
                send(ws, { t: 'faction.joined', reqId: msg.reqId, ok: false, reason });
            if (!f) return fail('no such banner in the ledger');
            if (factionOfPilot(ws.pilot)) return fail('you already fly under a banner');
            if (!f.invites.includes(ws.pilot)) return fail('nobody signed you an invitation');
            f.invites = f.invites.filter(p => p !== ws.pilot);
            f.members.push(ws.pilot);
            send(ws, { t: 'faction.joined', reqId: msg.reqId, ok: true, faction: f });
            broadcast(factionsMessage());
            recordChronicle('faction.joined', { faction: f.name, pilot: ws.pilot });
            markDirty();
            return true;
        }

        case 'faction.leave': {
            // A member walks; a sole-member founder folds the banner (the
            // chronicle keeps the history — disbanding doesn't unwrite it).
            const f = factionOfPilot(ws.pilot);
            const fail = reason =>
                send(ws, { t: 'faction.left', reqId: msg.reqId, ok: false, reason });
            if (!f) return fail('you fly under no banner');
            if (f.founder === ws.pilot && f.members.length > 1) {
                return fail('the founder holds the banner while anyone still flies it');
            }
            if (f.founder === ws.pilot) {
                delete world.factions[factionKey(f.name)];
                // A folded banner comes down off the map too
                for (const [pid, s] of Object.entries(world.poiState)) {
                    if (s && s.claim && s.claim.faction === f.name) {
                        s.claim = null;
                        broadcast(poiStateMessage(pid));
                    }
                }
                recordChronicle('faction.disbanded', { faction: f.name, pilot: ws.pilot });
            } else {
                f.members = f.members.filter(p => p !== ws.pilot);
                recordChronicle('faction.left', { faction: f.name, pilot: ws.pilot });
            }
            send(ws, { t: 'faction.left', reqId: msg.reqId, ok: true });
            broadcast(factionsMessage());
            markDirty();
            return true;
        }

        case 'faction.claim': {
            // Plant the banner's mark at a charted site (M7 — one per faction).
            // Proximity is a client rule like salvage; the server owns the rest.
            const f = factionOfPilot(ws.pilot);
            const id = typeof msg.poiId === 'string' ? msg.poiId : null;
            const st = id ? world.poiState[id] : null;
            const meta = id ? poiMetaById.get(id) : null;
            const fail = reason =>
                send(ws, { t: 'faction.claimed', reqId: msg.reqId, ok: false, reason });
            if (!f) return fail('you fly under no banner');
            if (!st || !meta || !world.discoveredPOIs[id]) return fail('chart the site before you mark it');
            if (st.occupation) return fail(`${st.occupation.faction} is dug in here — drive them out first`);
            if (st.claim) {
                return fail(st.claim.faction === f.name
                    ? 'your mark already flies here'
                    : `the ${st.claim.faction} marked this site first`);
            }
            const held = Object.entries(world.poiState)
                .find(([, s]) => s && s.claim && s.claim.faction === f.name);
            if (held) {
                const heldMeta = poiMetaById.get(held[0]);
                return fail(`your banner already flies over ${heldMeta ? heldMeta.name : 'another site'} — one mark per banner`);
            }
            st.claim = { faction: f.name, color: f.color, since: Date.now() };
            send(ws, { t: 'faction.claimed', reqId: msg.reqId, ok: true, id });
            recordChronicle('faction.claimed', { faction: f.name, poi: id, name: meta.name });
            broadcast(poiStateMessage(id));
            markDirty();
            return true;
        }

        case 'debug.liberatePOI': {
            // Harness hook: liberate an occupied site as the sender without
            // the full combat path (the real path is combat.mjs boss kill).
            if (process.env.VERIFY_DEBUG !== '1') return true;
            const id = typeof msg.id === 'string' && POI_IDS.has(msg.id) ? msg.id : null;
            if (id) liberatePOI(id, ws.pilot);
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

        case 'debug.poiState': {
            // Harness hook: force a cache window (e.g. nextSalvageAt in the
            // past = "ready now") without waiting 12h. Site must be known.
            // Preserves any occupation — windows and squatters are orthogonal.
            if (process.env.VERIFY_DEBUG !== '1') return true;
            const id = typeof msg.id === 'string' && POI_IDS.has(msg.id) ? msg.id : null;
            const at = Number(msg.nextSalvageAt);
            if (!id || !Number.isFinite(at)) return true;
            world.poiState[id] = { ...(world.poiState[id] || {}), nextSalvageAt: at };
            broadcast(poiStateMessage(id));
            markDirty();
            return true;
        }

        case 'debug.occupyPOI': {
            // Harness hook: force an occupation now (the real roll is 12-24h).
            // Site must be charted + stated; factionName optional.
            if (process.env.VERIFY_DEBUG !== '1') return true;
            const id = typeof msg.id === 'string' && POI_IDS.has(msg.id) ? msg.id : null;
            if (!id || !world.poiState[id]) return true;
            let faction = CombatCore.pickRaidFaction(world.grudges);
            if (msg.factionName) {
                const wanted = CombatCore.PIRATE_FACTIONS.find(f => f.name === msg.factionName);
                if (wanted) faction = wanted;
            }
            occupyPOI(id, faction);
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
