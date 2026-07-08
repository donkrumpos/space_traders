// NPC living traffic: freighters haul goods planet-to-planet, and their
// dockings move the markets through applyTradeImpact — so prices drift for a
// reason and ledger intel goes stale honestly. Pirates hunt them too; you can
// watch, intervene, or scoop what's left. Traders are ambience, not rivals:
// they're not saved, they respawn, and they never fight back.

const TRADER_COUNT = 3;
const TRADER_NAMES = [
    'Kestrel', 'Long Haul', 'Glowgrain Queen', 'Rustbucket', 'Meridian Belle',
    'Slow Dancer', 'Pale Lantern', 'Second Chance', 'Dust Sparrow', 'Old Debt'
];

function spawnTrader() {
    const planet = game.planets[Math.floor(Math.random() * game.planets.length)];
    const trader = {
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
    game.traders.push(trader);
}

function initTraffic() {
    game.traders = [];
    game.traderRespawnTimer = 0;
    for (let i = 0; i < TRADER_COUNT; i++) spawnTrader();
}

// Docking is where the living economy happens: the freighter sells its haul
// and buys local produce, nudging prices exactly like the player would
function traderDock(t, planet) {
    t.state = 'docked';
    t.dockTimer = 6 + Math.random() * 6;
    t.atPlanet = planet.name;
    t.velocity.x = 0;
    t.velocity.y = 0;

    if (t.goodType && planet.demands[t.goodType] !== undefined) {
        applyTradeImpact(planet, t.goodType, 'sell', t.qty);
    }
    const produced = Object.keys(planet.produces).filter(g => g !== 'contraband');
    if (produced.length > 0) {
        t.goodType = produced[Math.floor(Math.random() * produced.length)];
        t.qty = 4 + Math.floor(Math.random() * 6);
        applyTradeImpact(planet, t.goodType, 'buy', t.qty);
    } else {
        t.goodType = null;
        t.qty = 0;
    }

    // If the player is docked at the same station, they see the prices move
    if (game.isDocked && game.currentPlanet && game.currentPlanet.name === planet.name) {
        refreshDockedTradeUI();
        showHudFeedback(`Freighter ${t.name} docks and trades — prices shift`, 'info', 2500);
    }
}

function traderDepart(t) {
    // Haul toward a planet that wants the cargo; wander if hauling nothing
    const candidates = game.planets.filter(p =>
        p.name !== t.atPlanet && (!t.goodType || p.demands[t.goodType] !== undefined));
    const pool = candidates.length > 0 ? candidates : game.planets.filter(p => p.name !== t.atPlanet);
    t.dest = pool[Math.floor(Math.random() * pool.length)].name;
    t.state = 'traveling';
}

function updateTraffic(deltaTime) {
    if (!game.traders) initTraffic();

    // Keep the lanes populated: lost freighters are replaced after a while
    if (game.traders.length < TRADER_COUNT) {
        game.traderRespawnTimer -= deltaTime;
        if (game.traderRespawnTimer <= 0) {
            spawnTrader();
            game.traderRespawnTimer = 30 + Math.random() * 30;
        }
    }

    game.traders.forEach(t => {
        if (t.state === 'docked') {
            t.dockTimer -= deltaTime;
            if (t.dockTimer <= 0) traderDepart(t);
            return;
        }

        const dest = game.planets.find(p => p.name === t.dest);
        if (!dest) { traderDepart(t); return; }

        // Freighters don't fight — they run from nearby pirates
        let steerAngle = Math.atan2(dest.y - t.y, dest.x - t.x);
        let fleeing = false;
        (game.enemies || []).forEach(e => {
            const dSq = Math.pow(e.x - t.x, 2) + Math.pow(e.y - t.y, 2);
            if (dSq < 350 * 350) {
                steerAngle = Math.atan2(t.y - e.y, t.x - e.x);
                fleeing = true;
            }
        });

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
        if (distToDest < 90) traderDock(t, dest);
    });
}

// Called from combat when an enemy shot finishes a freighter
function destroyTrader(index) {
    const t = game.traders[index];
    spawnExplosion(t.x, t.y, t.color, t.velocity.x * 60, t.velocity.y * 60);
    playExplosionSound();
    // Its cargo scatters — scoopable by whoever gets there first
    if (t.goodType && t.qty > 0) {
        const crates = Math.min(3, t.qty);
        for (let c = 0; c < crates; c++) {
            spawnCargoDrop(
                t.x + (Math.random() - 0.5) * 25,
                t.y + (Math.random() - 0.5) * 25,
                t.goodType,
                Math.max(1, Math.floor(t.qty / crates))
            );
        }
    }
    showHudFeedback(`☠ Pirates destroyed Freighter ${t.name}`, 'warning', 4000);
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
