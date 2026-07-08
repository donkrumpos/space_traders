// NPC living traffic: freighters haul goods planet-to-planet, and their
// dockings move the markets through applyTradeImpact — so prices drift for a
// reason and ledger intel goes stale honestly. Pirates hunt them too; you can
// watch, intervene, or scoop what's left. Traders are ambience, not rivals:
// they're not saved, they respawn, and they never fight back.

// The pure trader sim (factory, route pick, dock-trade, movement state
// machine) lives in js/sim/traffic-core.js (shared browser+server,
// docs/PROTOCOL.md "Combat/traffic sim extraction"); this file is the browser
// adapter plus everything escort-shaped, which stays client-local per the M4
// authority split.
const TRADER_COUNT = TrafficCore.TRADER_COUNT;
const TRADER_NAMES = TrafficCore.TRADER_NAMES; // economy.js names escort freighters from this

function spawnTrader() {
    const planet = game.planets[Math.floor(Math.random() * game.planets.length)];
    game.traders.push(TrafficCore.makeTrader(planet));
}

function initTraffic() {
    game.traders = [];
    game.traderRespawnTimer = 0;
    for (let i = 0; i < TRADER_COUNT; i++) spawnTrader();
}

// A freighter under player contract: tougher hull, marked cyan, and its
// route is fixed to the mission destination instead of wandering
function spawnEscortTrader(mission) {
    if (!game.traders) initTraffic();
    const origin = game.planets.find(p => p.name === mission.from) || game.planets[0];
    game.traders.push({
        name: mission.traderName,
        isEscort: true,
        escortId: mission.id,
        escortDest: mission.dest,
        x: origin.x + (Math.random() - 0.5) * 120,
        y: origin.y + (Math.random() - 0.5) * 120,
        angle: Math.random() * Math.PI * 2,
        velocity: { x: 0, y: 0 },
        hull: 80, maxHull: 80,
        size: 10,
        color: '#44ddff',
        state: 'docked',
        dockTimer: 3,
        atPlanet: origin.name,
        dest: null,
        goodType: null,
        qty: 0,
        speed: 3.2
    });
}

// True when the M4 net layer is up — net.js loads after this file, so the
// lookup happens at call time; solo/?verify (net offline) never branches.
function trafficNetOnline() {
    return typeof window !== 'undefined' && window.net && window.net.online === true;
}

// Word gets out about escorted cargo: raiders form up on the route ahead.
// escortAmbush tags them as part of the client-local escort path — they keep
// their local AI online and survive the reconnect takeover (net.js).
function spawnEscortAmbush(t) {
    const dest = game.planets.find(p => p.name === t.escortDest);
    if (!game.enemies) game.enemies = [];
    const routeAngle = dest ? Math.atan2(dest.y - t.y, dest.x - t.x) : 0;
    for (let i = 0; i < 2; i++) {
        const raider = makeEnemyFromTier('raider',
            t.x + Math.cos(routeAngle) * (450 + i * 180) + (Math.random() - 0.5) * 150,
            t.y + Math.sin(routeAngle) * (450 + i * 180) + (Math.random() - 0.5) * 150);
        raider.detectRange = 1200;
        raider.escortAmbush = true;
        game.enemies.push(raider);
    }
    showHudFeedback(`⚠ Raiders forming up on ${t.name}'s route — stay close`, 'warning', 4500);
}

function escortArrived(t) {
    const idx = game.missions.findIndex(m => m.id === t.escortId);
    if (idx !== -1) {
        const m = game.missions[idx];
        const pay = Math.round(m.reward * (hasPerk('contract_broker') ? 1.2 : 1)
            * (hasMod('songbird_antenna') ? 1.1 : 1));
        game.ship.credits += pay;
        game.missions.splice(idx, 1);
        flashCredits();
        playBountySound();
        showHudFeedback(`⛡ Freighter ${t.name} arrived safe — escort paid $${pay}`, 'success', 5000);
        addXP(40, 'escort');
        updateMissionsUI();
        autoSave('escort');
    }
    // The contract ends; the freighter melts back into ordinary traffic
    t.isEscort = false;
    t.escortId = null;
    t.escortDest = null;
    t.color = '#66cc66';
}

// Docking is where the living economy happens: the freighter sells its haul
// and buys local produce, nudging prices exactly like the player would. The
// market impact routes through the callback — locally that's applyTradeImpact;
// the server wires the same seam to world-market mutation.
function traderDock(t, planet) {
    // Online the server owns market impact (ITS freighters trade through the
    // world market); a client-local escort docking must not nudge prices
    TrafficCore.dockTrader(t, planet, trafficNetOnline() ? () => {} : applyTradeImpact);

    // If the player is docked at the same station, they see the prices move
    if (!trafficNetOnline() && game.isDocked && game.currentPlanet && game.currentPlanet.name === planet.name) {
        refreshDockedTradeUI();
        showHudFeedback(`Freighter ${t.name} docks and trades — prices shift`, 'info', 2500);
    }

    // An escorted freighter reaching its contract port pays out
    if (t.isEscort && planet.name === t.escortDest) {
        escortArrived(t);
    }
}

function traderDepart(t) {
    // Escorted freighters fly their contract route — and draw an ambush
    // (client-local behavior, so it stays in the adapter)
    if (t.isEscort) {
        t.dest = t.escortDest;
        t.state = 'traveling';
        spawnEscortAmbush(t);
        return;
    }
    TrafficCore.departTrader(t, game.planets);
}

// Distress call: one HUD ping (8s cooldown) when a freighter is being
// chased — always for your escort, otherwise only if it's nearby. Works
// online too: escorts set fleeing locally and server freighters carry a
// `fleeing` tick field (additive, mirrored by net.js).
function updateDistressPings(deltaTime) {
    game.distressTimer = Math.max(0, (game.distressTimer || 0) - deltaTime);
    if (game.distressTimer <= 0) {
        const inDistress = game.traders.find(t => t.fleeing && (t.isEscort ||
            Math.pow(t.x - game.ship.x, 2) + Math.pow(t.y - game.ship.y, 2) < 1600 * 1600));
        if (inDistress) {
            showHudFeedback(`⚠ Freighter ${inDistress.name} under attack${inDistress.isEscort ? ' — YOUR ESCORT' : ''}!`, 'warning', 3000);
            game.distressTimer = 8;
        }
    }
}

function updateTraffic(deltaTime) {
    if (!game.traders) {
        // Online, ambient lanes are the server's to populate — start empty
        if (trafficNetOnline()) {
            game.traders = [];
            game.traderRespawnTimer = 0;
        } else {
            initTraffic();
        }
    }

    // M4 online: ambient freighters come from world.tick — ONLY the
    // escort-local layer runs here (state machine for isEscort traders,
    // ambushes, distress pings, arrival payouts). Merge rule per PROTOCOL.md:
    // replace non-escort entries, preserve isEscort locals. Respawn cadence
    // is skipped — the server owns the population.
    if (trafficNetOnline()) {
        const escorts = game.traders.filter(t => t.isEscort && t.id === undefined);
        TrafficCore.updateTraders(
            { traders: escorts, planets: game.planets, enemies: game.enemies || [] },
            deltaTime, { depart: traderDepart, dock: traderDock });
        game.traders = [...window.net.getServerTraders(), ...escorts];
        updateDistressPings(deltaTime);
        return;
    }

    // Keep the lanes populated: lost freighters are replaced after a while
    // (population cadence stays caller-owned, like enemy spawn timers)
    if (game.traders.length < TRADER_COUNT) {
        game.traderRespawnTimer -= deltaTime;
        if (game.traderRespawnTimer <= 0) {
            spawnTrader();
            game.traderRespawnTimer = 30 + Math.random() * 30;
        }
    }

    // Movement/flee/arrival state machine runs in the shared core; the hooks
    // route departures and dockings through the escort-aware wrappers above
    TrafficCore.updateTraders(
        { traders: game.traders, planets: game.planets, enemies: game.enemies || [] },
        deltaTime, { depart: traderDepart, dock: traderDock });

    updateDistressPings(deltaTime);
}

// Called from combat when an enemy shot finishes a freighter
function destroyTrader(index) {
    const t = game.traders[index];
    spawnExplosion(t.x, t.y, t.color, t.velocity.x * 60, t.velocity.y * 60);
    playExplosionSound();
    // Its cargo scatters — scoopable by whoever gets there first (the roll
    // is the core's; spawning the crates is the browser's)
    TrafficCore.scatterDrops(t).forEach(d => spawnCargoDrop(d.x, d.y, d.goodType, d.qty));
    // A dead escort is a failed contract — no pay, no second chance
    if (t.isEscort) {
        const idx = game.missions.findIndex(m => m.id === t.escortId);
        if (idx !== -1) {
            game.missions.splice(idx, 1);
            updateMissionsUI();
        }
        showHudFeedback(`✖ ESCORT FAILED — Freighter ${t.name} destroyed`, 'error', 6000);
    } else {
        showHudFeedback(`☠ Pirates destroyed Freighter ${t.name}`, 'warning', 4000);
    }
    game.traders.splice(index, 1);
}

function renderTraders(ctx, camera) {
    if (!game.traders) return;
    game.traders.forEach(t => {
        const screenX = t.x - camera.x;
        const screenY = t.y - camera.y;
        if (screenX < -50 || screenX > ctx.canvas.width + 50 ||
            screenY < -50 || screenY > ctx.canvas.height + 50) return;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(t.angle);

        // Boxy freighter: long hull with a nose cab
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(-t.size, -t.size * 0.45, t.size * 1.5, t.size * 0.9);
        ctx.beginPath();
        ctx.moveTo(t.size * 0.5, -t.size * 0.45);
        ctx.lineTo(t.size, 0);
        ctx.lineTo(t.size * 0.5, t.size * 0.45);
        ctx.stroke();

        // Cargo glow amidships when hauling
        if (t.goodType) {
            ctx.fillStyle = goods[t.goodType].color;
            ctx.fillRect(-t.size * 0.5, -2, 4, 4);
        }
        ctx.restore();

        // Name label
        ctx.fillStyle = t.color;
        ctx.font = '9px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(t.name, screenX, screenY + t.size + 12);

        // Health bar only once it's been hurt
        if (t.hull < t.maxHull) {
            const barWidth = 20;
            const pct = t.hull / t.maxHull;
            ctx.fillStyle = '#333333';
            ctx.fillRect(screenX - barWidth / 2, screenY - t.size - 12, barWidth, 3);
            ctx.fillStyle = pct > 0.5 ? '#66cc66' : '#ffaa00';
            ctx.fillRect(screenX - barWidth / 2, screenY - t.size - 12, barWidth * pct, 3);
        }
    });
}
