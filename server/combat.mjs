// M4 combat/traffic authority: enemies, raid bands, NPC freighters, loot
// drops, grudges (docs/PROTOCOL.md M4 table + authority-split block). The
// pure sim lives in js/sim/combat-core.js and js/sim/traffic-core.js (same
// files the browser loads as script tags); this module owns the server-side
// cadence (spawn timers, band muster clock, trader respawn), ids for the
// wire, the 10Hz world.tick broadcast, and the damage/drop claim handlers.
//
// Server-build choices (documented in PROTOCOL.md "M4 server authority"):
// - Wealth gates (pickEnemyTier, maxEnemies, the credits>2500 band gate) read
//   the RICHEST connected pilot's credits from their last char doc (hello's
//   stored doc or char.push). ship.state doesn't carry credits. When no
//   connected pilot has a doc yet, wealth defaults to 0 for tier/max picks
//   and the band credits-gate is SKIPPED (bands may muster).
// - cargoUnits per pilot likewise comes from the last char doc (may be a few
//   seconds stale — good enough for "pirates smell cargo").
// - Sim substeps at 60Hz inside each 10Hz tick: CombatCore's turn/thrust
//   ramps are per-update (browser runs them at 60fps), so the server steps
//   the sim 6× per broadcast with dt=1/60 to keep enemy handling identical.
// - The world sleeps at zero pilots: ticks skip entirely, all combat timers
//   freeze (sim-time based). M3 market-event timers keep running (unchanged).
import config from './config.mjs';
import { getGrudges, mergeGrudgesMax, bumpGrudge, applyTraderImpact } from './world.mjs';

// Side-effect imports set the globals (same files, no fork — PROTOCOL.md
// "Combat/traffic sim extraction"). planets.js is already loaded by world.mjs
// but the module cache makes re-import free.
await import('../js/sim/planets.js');
await import('../js/sim/combat-core.js');
await import('../js/sim/traffic-core.js');
const SIM_PLANETS = globalThis.SIM_PLANETS;
const CombatCore = globalThis.CombatCore;
const TrafficCore = globalThis.TrafficCore;

// Loot universe = every good any planet produces or demands (PROTOCOL.md:
// "derive from SIM_PLANETS")
const GOOD_TYPES = [...new Set(SIM_PLANETS.flatMap(
    p => [...Object.keys(p.produces), ...Object.keys(p.demands)]))];

const SUB_DT = 1 / 60; // sim substep (matches browser frame rate)

// --- State -------------------------------------------------------------------

const state = { enemies: [], traders: [], drops: [] };
let seq = 1;
const newId = prefix => `${prefix}${seq++}`;

// pilot name -> { x, y, cargoUnits, credits } — positions from ship.state
// (the M2 relay path), credits/cargo from the last char doc
const pilots = new Map();

let broadcast = () => {};   // injected by startCombat
let tickN = 0;
let simNow = 0;             // accumulated sim seconds (frozen while asleep)
let lastEnemySpawnAt = -Infinity;
let raidBandTimer = 150;    // seconds until the first band can muster (solo cadence)
let traderRespawnTimer = 0;

function ensurePilot(name) {
    let p = pilots.get(name);
    if (!p) { p = { x: undefined, y: undefined, cargoUnits: 0, credits: null }; pilots.set(name, p); }
    return p;
}

function richestCredits() {
    let best = null;
    for (const p of pilots.values()) {
        if (typeof p.credits === 'number' && (best === null || p.credits > best)) best = p.credits;
    }
    return best; // null = no connected pilot has a doc yet
}

function positionedTargets() {
    const targets = [];
    for (const [name, p] of pilots) {
        if (typeof p.x === 'number' && typeof p.y === 'number') {
            targets.push({ name, x: p.x, y: p.y, cargoUnits: p.cargoUnits || 0 });
        }
    }
    return targets;
}

// --- Pilot lifecycle (called from server.mjs) ---------------------------------

// hello: seed presence + run grudge migration off the server's stored doc
export function combatPilotConnected(name, storedDoc) {
    ensurePilot(name);
    if (storedDoc) combatPilotDoc(name, storedDoc);
}

// char.push (and hello's stored doc): credits/cargo cache + grudge merge-by-max
export function combatPilotDoc(name, doc) {
    if (!doc) return;
    const p = ensurePilot(name);
    if (doc.ship) {
        if (typeof doc.ship.credits === 'number') p.credits = doc.ship.credits;
        const cargo = doc.ship.cargo || {};
        p.cargoUnits = Object.values(cargo).reduce((s, q) => s + (Number(q) || 0), 0);
        // Doc position seeds spawn anchoring until the first ship.state lands
        if (p.x === undefined && typeof doc.ship.x === 'number') { p.x = doc.ship.x; p.y = doc.ship.y; }
    }
    if (doc.pilot && mergeGrudgesMax(doc.pilot.grudges)) {
        broadcast({ t: 'grudge.update', grudges: getGrudges() });
    }
}

// ship.state (10Hz): latest position is what enemy AI hunts
export function combatPilotState(name, msg) {
    const p = ensurePilot(name);
    if (typeof msg.x === 'number') p.x = msg.x;
    if (typeof msg.y === 'number') p.y = msg.y;
}

export function combatPilotLeft(name) {
    pilots.delete(name);
}

// --- Spawning ------------------------------------------------------------------

function spawnTrader() {
    const planet = SIM_PLANETS[Math.floor(Math.random() * SIM_PLANETS.length)];
    const t = TrafficCore.makeTrader(planet);
    t.id = newId('t');
    state.traders.push(t);
}

for (let i = 0; i < TrafficCore.TRADER_COUNT; i++) spawnTrader();

function spawnCommonEnemy(targets, wealth) {
    const anchor = targets[Math.floor(Math.random() * targets.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = 800 + Math.random() * 1200; // same envelope as the browser adapter
    const e = CombatCore.makeEnemy(CombatCore.pickEnemyTier(wealth),
        anchor.x + Math.cos(angle) * dist,
        anchor.y + Math.sin(angle) * dist);
    e.id = newId('e');
    state.enemies.push(e);
}

// Assemble a band near a random connected pilot. Raid scaling per the locked
// kickoff answer (config.raidScale 'perPilot'): the core sizes the band for
// one pilot (grudge reinforcements included); the server adds +1 faction
// minion per EXTRA pilot online, capped at config.raidExtraMinionCap.
// forceFaction is the debug.spawnBand hook (retry-rolled, debug-only).
function spawnBand(targets, forceFaction) {
    const anchor = targets[Math.floor(Math.random() * targets.length)] || { x: 0, y: 0 };
    const grudges = getGrudges();
    let band = CombatCore.makeRaidBand(anchor.x, anchor.y, grudges);
    if (forceFaction) {
        for (let tries = 0; band.faction.name !== forceFaction && tries < 100; tries++) {
            band = CombatCore.makeRaidBand(anchor.x, anchor.y, grudges);
        }
    }
    const extra = Math.min(config.raidExtraMinionCap, Math.max(0, pilots.size - 1));
    const factionTag = band.faction.name.split(' ')[0];
    for (let i = 0; i < extra; i++) {
        const a = Math.random() * Math.PI * 2;
        const m = CombatCore.makeEnemy(band.faction.minionTier,
            band.boss.x + Math.cos(a) * 140, band.boss.y + Math.sin(a) * 140);
        m.bandId = band.bandId;
        m.color = band.faction.color;
        m.tierName = `${factionTag} ${m.tierName}`;
        m.detectRange = 1400;
        band.minions.push(m);
        band.enemies.splice(band.enemies.length - 1, 0, m); // keep boss last
    }
    band.enemies.forEach(e => { e.id = newId('e'); state.enemies.push(e); });
    return band;
}

// Ported browser cadence (js/combat.js updateEnemies + updateRaidBands),
// wealth read server-side per the header note. Timers run on simNow seconds.
function runSpawnCadence(dt, targets) {
    const credits = richestCredits();
    const wealth = credits === null ? 0 : credits;
    const hasCargo = targets.some(t => t.cargoUnits > 0);

    const maxEnemies = (wealth < 2000 ? 2 : wealth < 6000 ? 3 : 4) + (hasCargo ? 1 : 0);
    const spawnInterval = hasCargo ? 10 + Math.random() * 10 : 15 + Math.random() * 15; // seconds
    if (state.enemies.length < maxEnemies && simNow - lastEnemySpawnAt > spawnInterval) {
        spawnCommonEnemy(targets, wealth);
        lastEnemySpawnAt = simNow;
    }

    // Bands only muster once someone's worth robbing (credits gate skipped
    // when no doc has arrived), and only one band at a time
    if (credits !== null && credits < 2500) return;
    if (state.enemies.some(e => e.bandId)) return;
    raidBandTimer -= dt;
    if (raidBandTimer <= 0) {
        spawnBand(targets, null);
        raidBandTimer = 240 + Math.random() * 180;
    }
}

// --- Traffic hooks --------------------------------------------------------------

const trafficHooks = {
    depart: t => TrafficCore.departTrader(t, SIM_PLANETS),
    dock: (t, planet) => {
        let market = null;
        TrafficCore.dockTrader(t, planet, (p, good, side, qty) => {
            market = applyTraderImpact(p.name, good, side, qty) || market;
        });
        if (market) broadcast({ t: 'market.update', planet: planet.name, market });
    }
};

// --- Tick loop -------------------------------------------------------------------

function nearestPilotName(x, y, targets) {
    let best = null, bestSq = Infinity;
    for (const t of targets) {
        const dSq = (t.x - x) ** 2 + (t.y - y) ** 2;
        if (dSq < bestSq) { bestSq = dSq; best = t.name; }
    }
    return best;
}

function tick() {
    if (pilots.size === 0) return; // the world sleeps — timers frozen via simNow

    const dt = 1 / config.tickHz;
    simNow += dt;
    tickN++;

    const targets = positionedTargets();
    const shots = [];

    if (targets.length > 0) {
        runSpawnCadence(dt, targets);
        // Substep at 60Hz so per-update turn/thrust ramps match the browser.
        // (With zero positioned targets we skip the enemy sim entirely —
        // CombatCore's despawn pass would wipe every non-boss enemy.)
        const steps = Math.round(dt / SUB_DT);
        for (let i = 0; i < steps; i++) {
            const out = CombatCore.updateEnemies(
                { enemies: state.enemies, targets, traders: state.traders },
                SUB_DT, null);
            for (const s of out.shots) shots.push(s);
            TrafficCore.updateTraders(
                { traders: state.traders, planets: SIM_PLANETS, enemies: state.enemies },
                SUB_DT, trafficHooks);
        }
    } else {
        // Pilots connected but no position yet: keep the freighters ambling
        const steps = Math.round(dt / SUB_DT);
        for (let i = 0; i < steps; i++) {
            TrafficCore.updateTraders(
                { traders: state.traders, planets: SIM_PLANETS, enemies: state.enemies },
                SUB_DT, trafficHooks);
        }
    }

    // Trader population cadence (traders can't die server-side yet — no
    // server projectile sim — but the lane stays correct for when they can)
    if (state.traders.length < TrafficCore.TRADER_COUNT) {
        traderRespawnTimer -= dt;
        if (traderRespawnTimer <= 0) {
            spawnTrader();
            traderRespawnTimer = 30 + Math.random() * 30;
        }
    }

    // Unclaimed drops evaporate (~60s, like the local feel)
    for (let i = state.drops.length - 1; i >= 0; i--) {
        if (state.drops[i].expiresAt <= simNow) state.drops.splice(i, 1);
    }

    broadcast({
        t: 'world.tick',
        n: tickN,
        enemies: state.enemies.map(e => ({
            id: e.id, x: e.x, y: e.y, angle: e.angle,
            hull: e.hull, maxHull: e.maxHull,
            tierName: e.tierName, color: e.color, size: e.size,
            bandId: e.bandId, isBandBoss: !!e.isBandBoss, shielded: !!e.shielded,
            factionName: e.factionName, isBoss: !!e.isBoss
        })),
        traders: state.traders.map(t => ({
            id: t.id, x: t.x, y: t.y, angle: t.angle,
            state: t.state, color: t.color, isEscort: false,
            name: t.name, fleeing: !!t.fleeing // additive fields, clients may ignore
        })),
        drops: state.drops.map(d => ({
            id: d.id, x: d.x, y: d.y, kind: d.kind, goodType: d.goodType, qty: d.qty
        })),
        shots: shots.map(s => ({
            enemyId: s.enemyId, targetPilot: nearestPilotName(s.x, s.y, targets),
            x: s.x, y: s.y, angle: s.angle,
            damage: s.damage, color: s.color // additive: saves a lookup race client-side
        }))
    });
}

export function startCombat(broadcastFn) {
    broadcast = broadcastFn;
    setInterval(tick, 1000 / config.tickHz);
}

// --- Wire handlers ------------------------------------------------------------
// Returns true when the message was M4 territory (handled or swallowed).

export function handleCombatMessage(ws, msg, send) {
    switch (msg.t) {
        case 'damage.claim': {
            // Fire-and-forget, last-writer-wins, no validation (family trust
            // model). Hull changes ride the next world.tick; kills broadcast.
            const enemy = state.enemies.find(e => e.id === msg.enemyId);
            const damage = Number(msg.damage);
            if (!enemy || !(damage > 0)) return true;
            const outcome = CombatCore.applyDamage(
                state.enemies, enemy, damage, enemy.x, enemy.y, null,
                { goodTypes: GOOD_TYPES });
            if (!outcome.killed) return true;
            const wireDrops = outcome.drops.map(d => {
                const drop = { id: newId('d'), x: d.x, y: d.y, kind: d.kind, goodType: d.goodType, qty: d.qty };
                state.drops.push({ ...drop, expiresAt: simNow + config.dropExpiryMs / 1000 });
                return drop;
            });
            broadcast({
                t: 'enemy.killed',
                enemyId: msg.enemyId,
                by: ws.pilot,
                reward: Math.round(outcome.reward),
                drops: wireDrops
            });
            if (outcome.grudgeDelta) {
                bumpGrudge(outcome.grudgeDelta.faction, outcome.grudgeDelta.amount);
                broadcast({ t: 'grudge.update', grudges: getGrudges() });
            }
            return true;
        }

        case 'drop.claim': {
            // First claim wins; the loser hears the winner's drop.taken
            const idx = state.drops.findIndex(d => d.id === msg.dropId);
            if (idx === -1) return true;
            state.drops.splice(idx, 1);
            broadcast({ t: 'drop.taken', dropId: msg.dropId, by: ws.pilot });
            return true;
        }

        case 'debug.spawnEnemy': {
            if (process.env.VERIFY_DEBUG !== '1') return true;
            const tier = CombatCore.ENEMY_TIERS[msg.tier] ? msg.tier : 'scout';
            const e = CombatCore.makeEnemy(tier, Number(msg.x) || 0, Number(msg.y) || 0);
            e.id = newId('e');
            state.enemies.push(e);
            send(ws, { t: 'debug.spawned', enemyId: e.id });
            return true;
        }

        case 'debug.spawnBand': {
            if (process.env.VERIFY_DEBUG !== '1') return true;
            const band = spawnBand(positionedTargets(), msg.factionName || null);
            send(ws, {
                t: 'debug.spawned',
                bandId: band.bandId,
                faction: band.faction.name,
                bossId: band.boss.id,
                enemyIds: band.enemies.map(e => e.id)
            });
            return true;
        }

        case 'debug.state': {
            if (process.env.VERIFY_DEBUG !== '1') return true;
            // Reply reuses t:'debug.state' with the payload under `state`
            // (the verify-net tap matches replies by that t)
            send(ws, {
                t: 'debug.state',
                state: {
                    enemies: state.enemies,
                    traders: state.traders,
                    drops: state.drops,
                    pilots: Object.fromEntries(pilots),
                    grudges: getGrudges(),
                    simNow, tickN
                }
            });
            return true;
        }
    }
    return false;
}
