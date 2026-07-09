// World hazards and pickups: asteroid fields (mine them or crash into them)
// and floating cargo drops you scoop by flying through.

const ASTEROID_FIELDS = [
    { x: 1600, y: 950, radius: 260, count: 12 },   // between Agricon and Mining Station
    { x: 2450, y: 1650, radius: 300, count: 14 },  // on the Frontier run
    { x: 850, y: 1250, radius: 220, count: 9 }     // near Core World
];

function makeAsteroid(field, fieldIndex) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * field.radius;
    const size = 6 + Math.random() * 10;
    // Pre-baked lumpy outline so each rock keeps a stable shape
    const points = [];
    const vertexCount = 7 + Math.floor(Math.random() * 4);
    for (let v = 0; v < vertexCount; v++) {
        points.push({
            angle: (v / vertexCount) * Math.PI * 2,
            r: size * (0.7 + Math.random() * 0.5)
        });
    }
    return {
        fieldIndex,
        x: field.x + Math.cos(angle) * dist,
        y: field.y + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size,
        hull: Math.round(size * 4),
        spin: (Math.random() - 0.5) * 0.01,
        rotation: Math.random() * Math.PI * 2,
        points
    };
}

function initAsteroids() {
    game.asteroids = [];
    game.drops = [];
    ASTEROID_FIELDS.forEach((field, fieldIndex) => {
        for (let i = 0; i < field.count; i++) {
            game.asteroids.push(makeAsteroid(field, fieldIndex));
        }
    });
}

let asteroidRespawnTimer = 150; // seconds until the first regrowth check

function updateAsteroids(deltaTime) {
    if (!game.asteroids) return;

    // Mined fields slowly regrow — one rock per field every couple of minutes,
    // capped at the original count, and never in view of the player
    asteroidRespawnTimer -= deltaTime;
    if (asteroidRespawnTimer <= 0) {
        asteroidRespawnTimer = 120 + Math.random() * 60;
        ASTEROID_FIELDS.forEach((field, fieldIndex) => {
            const current = game.asteroids.filter(a => a.fieldIndex === fieldIndex).length;
            const playerDist = Math.sqrt(
                Math.pow(game.ship.x - field.x, 2) +
                Math.pow(game.ship.y - field.y, 2)
            );
            if (current < field.count && playerDist > field.radius + 400) {
                game.asteroids.push(makeAsteroid(field, fieldIndex));
            }
        });
    }
    game.asteroids.forEach(a => {
        a.x += a.vx * deltaTime * 60;
        a.y += a.vy * deltaTime * 60;
        a.rotation += a.spin;

        // Ship collision: damage scales with impact speed, then bounce off
        const dx = game.ship.x - a.x;
        const dy = game.ship.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.size + 10;
        if (dist < minDist && dist > 0) {
            const speed = Math.sqrt(
                game.ship.velocity.x * game.ship.velocity.x +
                game.ship.velocity.y * game.ship.velocity.y
            );
            if (speed > 1.5) {
                damagePlayer(Math.round(4 + speed * 2.5));
                addShake(0.2);
            }
            // Push the ship out and reflect its velocity away from the rock
            const nx = dx / dist, ny = dy / dist;
            game.ship.x = a.x + nx * minDist;
            game.ship.y = a.y + ny * minDist;
            const dot = game.ship.velocity.x * nx + game.ship.velocity.y * ny;
            if (dot < 0) {
                game.ship.velocity.x -= 1.6 * dot * nx;
                game.ship.velocity.y -= 1.6 * dot * ny;
            }
        }
    });
}

function renderAsteroids(ctx, camera) {
    if (!game.asteroids) return;
    game.asteroids.forEach(a => {
        const screenX = a.x - camera.x;
        const screenY = a.y - camera.y;
        if (screenX < -40 || screenX > ctx.canvas.width + 40 ||
            screenY < -40 || screenY > ctx.canvas.height + 40) return;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(a.rotation);
        ctx.strokeStyle = '#998877';
        ctx.fillStyle = 'rgba(60, 55, 45, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        a.points.forEach((p, idx) => {
            const px = Math.cos(p.angle) * p.r;
            const py = Math.sin(p.angle) * p.r;
            if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    });
}

// --- Zanac-style weapon powerups (timed super-weapons, scooped like cargo) ---

const POWERUPS = {
    wave: { name: 'WAVE BEAM', color: '#44aaff', duration: 20, blurb: 'shots pierce everything' },
    rear: { name: 'REAR GUARD', color: '#ffaa44', duration: 25, blurb: 'fires backward too' },
    options: { name: 'TWIN OPTIONS', color: '#66ff88', duration: 25, blurb: 'orbiting auto-guns' },
    nova: { name: 'NOVA BOMB', color: '#ffffff', duration: 0, blurb: 'radial blast' }
};

function randomPowerupType() {
    const roll = Math.random();
    if (roll < 0.30) return 'wave';
    if (roll < 0.55) return 'rear';
    if (roll < 0.85) return 'options';
    return 'nova'; // the rare one
}

function spawnPowerupDrop(x, y) {
    game.drops.push({
        kind: 'powerup',
        powerType: randomPowerupType(),
        x, y,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        life: 30
    });
}

function activatePowerup(type) {
    const spec = POWERUPS[type];

    if (type === 'nova') {
        // Instant: a radial burst of high-power bolts straight from the ship —
        // rides the normal projectile pipeline so kills pay bounties as usual
        const shots = 28;
        const baseDamage = 40 + (game.ship.upgrades.weapons - 1) * 10;
        for (let s = 0; s < shots; s++) {
            const a = (s / shots) * Math.PI * 2;
            game.projectiles.push({
                type: 'laser',
                x: game.ship.x, y: game.ship.y,
                velocity: {
                    x: Math.cos(a) * 700 + game.ship.velocity.x * 60,
                    y: Math.sin(a) * 700 + game.ship.velocity.y * 60
                },
                damage: baseDamage, range: 550, distanceTraveled: 0,
                color: '#ffffff', size: 4, age: 0, maxAge: 1500
            });
        }
        spawnParticles(game.ship.x, game.ship.y, {
            count: 40, colors: ['#ffffff', '#ffee88'], speed: 300, life: 0.5, size: 2.5
        });
        addShake(0.6);
        playExplosionSound();
        spawnFloater(game.ship.x, game.ship.y - 30, 'NOVA BOMB', '#ffffff', 20);
        showHudFeedback('☀ NOVA BOMB detonated!', 'warning', 3000);
        return;
    }

    // Timed powerups: a fresh scoop replaces whatever was running
    game.powerup = { type, timeLeft: spec.duration, optionCooldown: 0, optionAngle: 0 };
    playBountySound();
    spawnFloater(game.ship.x, game.ship.y - 30, spec.name, spec.color, 18);
    showHudFeedback(`⚡ ${spec.name} — ${spec.blurb} (${spec.duration}s)`, 'success', 3500);
}

function optionPositions() {
    const pw = game.powerup;
    const r = 34;
    return [pw.optionAngle, pw.optionAngle + Math.PI].map(a => ({
        x: game.ship.x + Math.cos(a) * r,
        y: game.ship.y + Math.sin(a) * r
    }));
}

function updatePowerup(deltaTime) {
    const pw = game.powerup;
    if (!pw) return;
    pw.timeLeft -= deltaTime;
    if (pw.timeLeft <= 0) {
        showHudFeedback(`${POWERUPS[pw.type].name} expired`, 'info', 2000);
        game.powerup = null;
        return;
    }

    if (pw.type === 'options') {
        pw.optionAngle += 2.2 * deltaTime;
        pw.optionCooldown -= deltaTime;
        if (pw.optionCooldown <= 0 && game.enemies && game.enemies.length > 0) {
            // Each orb snipes the nearest unshielded pirate in reach
            let fired = false;
            optionPositions().forEach(pos => {
                let nearest = null, best = Infinity;
                game.enemies.forEach(e => {
                    if (e.shielded) return;
                    const dSq = Math.pow(e.x - pos.x, 2) + Math.pow(e.y - pos.y, 2);
                    if (dSq < best) { best = dSq; nearest = e; }
                });
                if (nearest && best < 550 * 550) {
                    const a = Math.atan2(nearest.y - pos.y, nearest.x - pos.x);
                    game.projectiles.push({
                        type: 'laser',
                        x: pos.x, y: pos.y,
                        velocity: { x: Math.cos(a) * 750, y: Math.sin(a) * 750 },
                        damage: 10 + (game.ship.upgrades.weapons - 1) * 5,
                        range: 550, distanceTraveled: 0,
                        color: POWERUPS.options.color, size: 2.5, age: 0, maxAge: 1200
                    });
                    fired = true;
                }
            });
            if (fired) playLaserSound();
            pw.optionCooldown = 0.55;
        }
    }
}

function renderPowerupOrbs(ctx, camera) {
    const pw = game.powerup;
    if (!pw || pw.type !== 'options') return;
    optionPositions().forEach(pos => {
        const sx = pos.x - camera.x;
        const sy = pos.y - camera.y;
        ctx.save();
        ctx.fillStyle = POWERUPS.options.color;
        ctx.shadowColor = POWERUPS.options.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// --- Cargo drops ---

function spawnCargoDrop(x, y, goodType, amount) {
    game.drops.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        goodType, amount,
        life: 45 // seconds before the crate drifts away
    });
}

function updateDrops(deltaTime) {
    if (!game.drops) return;
    for (let i = game.drops.length - 1; i >= 0; i--) {
        const d = game.drops[i];
        d.x += d.vx * deltaTime * 60;
        d.y += d.vy * deltaTime * 60;
        d.vx *= 0.99;
        d.vy *= 0.99;
        d.life -= deltaTime;
        if (d.life <= 0) {
            game.drops.splice(i, 1);
            continue;
        }

        // Scoop by flying through (a dead ship scoops nothing — its own
        // scattered pods sit at the wreck until it respawns and flies back)
        const dist = Math.sqrt(
            Math.pow(d.x - game.ship.x, 2) +
            Math.pow(d.y - game.ship.y, 2)
        );
        if (dist < 26 && !game.deathState) {
            // Powerups need no cargo space — they slot straight into the ship
            if (d.kind === 'powerup') {
                activatePowerup(d.powerType);
                game.drops.splice(i, 1);
                continue;
            }
            const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
            const space = game.ship.cargoMax - cargoUsed;
            if (space <= 0) continue; // full hold — the crate keeps floating
            const taken = Math.min(space, d.amount);
            game.ship.cargo[d.goodType] = (game.ship.cargo[d.goodType] || 0) + taken;
            spawnFloater(d.x, d.y - 12, `+${taken} ${goods[d.goodType].name}`, goods[d.goodType].color);
            playPickupSound();
            d.amount -= taken;
            if (d.amount <= 0) game.drops.splice(i, 1);
            updateMissionsUI();
        }
    }
}

function renderDrops(ctx, camera) {
    if (!game.drops) return;
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.008);
    game.drops.forEach(d => {
        const screenX = d.x - camera.x;
        const screenY = d.y - camera.y;
        if (screenX < -20 || screenX > ctx.canvas.width + 20 ||
            screenY < -20 || screenY > ctx.canvas.height + 20) return;

        // Powerups render as a slow-spinning four-point star
        if (d.kind === 'powerup') {
            const pColor = POWERUPS[d.powerType].color;
            ctx.save();
            ctx.translate(screenX, screenY);
            ctx.rotate(Date.now() * 0.003);
            ctx.globalAlpha = d.life < 5 ? pulse * (d.life / 5) : pulse;
            ctx.strokeStyle = pColor;
            ctx.shadowColor = pColor;
            ctx.shadowBlur = 10;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -8); ctx.lineTo(2.5, -2.5); ctx.lineTo(8, 0); ctx.lineTo(2.5, 2.5);
            ctx.lineTo(0, 8); ctx.lineTo(-2.5, 2.5); ctx.lineTo(-8, 0); ctx.lineTo(-2.5, -2.5);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            ctx.globalAlpha = 1;
            return;
        }

        const color = goods[d.goodType].color;
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(Math.PI / 4);
        ctx.globalAlpha = d.life < 5 ? pulse * (d.life / 5) : pulse; // fade near expiry
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.strokeRect(-2, -2, 4, 4);
        ctx.restore();
        ctx.globalAlpha = 1;
    });
}
