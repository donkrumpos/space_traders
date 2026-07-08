// Pure NPC-trader (freighter) sim shared by browser and server (M4,
// docs/PROTOCOL.md "Combat/traffic sim extraction"). Side-effect script that
// sets globalThis.TrafficCore — loaded as a <script> tag before traffic.js in
// the browser and via await import() on the server. Same file, no fork.
//
// Rules (same as economy-core/combat-core): state is passed in — this module
// NEVER reads game/window globals. No DOM. The caller owns population cadence
// (respawn timers) and everything escort-shaped: escort trader spawning,
// ambushes, distress pings, and arrival payouts are CLIENT-LOCAL per
// PROTOCOL.md's M4 authority split and stay in js/traffic.js.
//
// The trader→market impact goes through a passed-in callback
// applyImpact(planet, goodType, side, qty): the browser wires it to the local
// applyTradeImpact path; the server wires it to world-market mutation +
// market.update broadcast.
//
// hooks for updateTraders — the state-machine edges, so escort-aware callers
// can intercept them:
//   hooks.depart(t)        — trader finished its layover (or lost its dest)
//   hooks.dock(t, planet)  — trader reached its destination
// The core emits no fx of its own: freighters are quiet ambience; all HUD
// noise (distress pings, dock toasts) lives with the caller.
(() => {
    'use strict';

    const TRADER_COUNT = 3;
    const TRADER_NAMES = [
        'Kestrel', 'Long Haul', 'Glowgrain Queen', 'Rustbucket', 'Meridian Belle',
        'Slow Dancer', 'Pale Lantern', 'Second Chance', 'Dust Sparrow', 'Old Debt'
    ];

    // Fresh freighter berthed at (or drifting near) the given planet
    function makeTrader(planet) {
        return {
            name: TRADER_NAMES[Math.floor(Math.random() * TRADER_NAMES.length)],
            x: planet.x + (Math.random() - 0.5) * 120,
            y: planet.y + (Math.random() - 0.5) * 120,
            angle: Math.random() * Math.PI * 2,
            velocity: { x: 0, y: 0 },
            hull: 60, maxHull: 60,
            size: 10,
            color: '#66cc66',
            state: 'docked',
            dockTimer: 2 + Math.random() * 5,
            atPlanet: planet.name,
            dest: null,
            goodType: null,
            qty: 0,
            speed: 3.2 + Math.random() * 0.8
        };
    }

    // Ordinary route pick: haul toward a planet that wants the cargo; wander
    // if hauling nothing. (Escorted freighters fly their contract route — the
    // caller handles that branch before delegating here.)
    function departTrader(t, planets) {
        const candidates = planets.filter(p =>
            p.name !== t.atPlanet && (!t.goodType || p.demands[t.goodType] !== undefined));
        const pool = candidates.length > 0 ? candidates : planets.filter(p => p.name !== t.atPlanet);
        t.dest = pool[Math.floor(Math.random() * pool.length)].name;
        t.state = 'traveling';
    }

    // Docking is where the living economy happens: the freighter sells its
    // haul and buys local produce through applyImpact, nudging prices exactly
    // like a player would.
    function dockTrader(t, planet, applyImpact) {
        t.state = 'docked';
        t.dockTimer = 6 + Math.random() * 6;
        t.atPlanet = planet.name;
        t.velocity.x = 0;
        t.velocity.y = 0;

        if (t.goodType && planet.demands[t.goodType] !== undefined) {
            applyImpact(planet, t.goodType, 'sell', t.qty);
        }
        const produced = Object.keys(planet.produces).filter(g => g !== 'contraband');
        if (produced.length > 0) {
            t.goodType = produced[Math.floor(Math.random() * produced.length)];
            t.qty = 4 + Math.floor(Math.random() * 6);
            applyImpact(planet, t.goodType, 'buy', t.qty);
        } else {
            t.goodType = null;
            t.qty = 0;
        }
    }

    // Per-frame trader state machine: layover countdown, flee-from-pirates
    // steering, thrust/drag/speed-cap movement, arrival detection. Sets
    // t.fleeing (read by minimap/HUD). state = { traders, planets, enemies }.
    function updateTraders(state, deltaTime, hooks) {
        const planets = state.planets;
        const enemies = state.enemies || [];

        state.traders.forEach(t => {
            if (t.state === 'docked') {
                t.dockTimer -= deltaTime;
                if (t.dockTimer <= 0) hooks.depart(t);
                return;
            }

            const dest = planets.find(p => p.name === t.dest);
            if (!dest) { hooks.depart(t); return; }

            // Freighters don't fight — they run from nearby pirates
            let steerAngle = Math.atan2(dest.y - t.y, dest.x - t.x);
            let fleeing = false;
            enemies.forEach(e => {
                const dSq = Math.pow(e.x - t.x, 2) + Math.pow(e.y - t.y, 2);
                if (dSq < 350 * 350) {
                    steerAngle = Math.atan2(t.y - e.y, t.x - e.x);
                    fleeing = true;
                }
            });
            t.fleeing = fleeing; // distress state read by the minimap + HUD alert

            // Smooth turn toward the steering angle. Turn radius must stay well
            // inside the docking window or the freighter orbits its port forever.
            let diff = steerAngle - t.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            t.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.05);

            // Thrust, drag, per-ship speed cap (a scared freighter redlines;
            // an arriving one brakes for approach)
            const distToDest = Math.sqrt(Math.pow(dest.x - t.x, 2) + Math.pow(dest.y - t.y, 2));
            t.velocity.x += Math.cos(t.angle) * 0.09;
            t.velocity.y += Math.sin(t.angle) * 0.09;
            t.velocity.x *= 0.99;
            t.velocity.y *= 0.99;
            let maxSpeed = fleeing ? t.speed * 1.3 : t.speed;
            if (distToDest < 250 && !fleeing) maxSpeed *= 0.6;
            const speed = Math.sqrt(t.velocity.x * t.velocity.x + t.velocity.y * t.velocity.y);
            if (speed > maxSpeed) {
                t.velocity.x = (t.velocity.x / speed) * maxSpeed;
                t.velocity.y = (t.velocity.y / speed) * maxSpeed;
            }
            t.x += t.velocity.x * deltaTime * 60;
            t.y += t.velocity.y * deltaTime * 60;

            // Arrival
            if (distToDest < 90) hooks.dock(t, dest);
        });
    }

    // A destroyed freighter's cargo scatters — scoopable by whoever gets
    // there first. Pure roll: returns [{x, y, goodType, qty}], no spawning.
    function scatterDrops(t) {
        const drops = [];
        if (t.goodType && t.qty > 0) {
            const crates = Math.min(3, t.qty);
            for (let c = 0; c < crates; c++) {
                drops.push({
                    x: t.x + (Math.random() - 0.5) * 25,
                    y: t.y + (Math.random() - 0.5) * 25,
                    goodType: t.goodType,
                    qty: Math.max(1, Math.floor(t.qty / crates))
                });
            }
        }
        return drops;
    }

    globalThis.TrafficCore = {
        TRADER_COUNT, TRADER_NAMES,
        makeTrader, departTrader, dockTrader,
        updateTraders, scatterDrops
    };
})();
