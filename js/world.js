// World hazards and pickups: asteroid fields (mine them or crash into them)
// and floating cargo drops you scoop by flying through.

const ASTEROID_FIELDS = [
    { x: 1600, y: 950, radius: 260, count: 12 },   // between Agricon and Mining Station
    { x: 2450, y: 1650, radius: 300, count: 14 },  // on the Frontier run
    { x: 850, y: 1250, radius: 220, count: 9 }     // near Core World
];

function initAsteroids() {
    game.asteroids = [];
    game.drops = [];
    ASTEROID_FIELDS.forEach(field => {
        for (let i = 0; i < field.count; i++) {
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
            game.asteroids.push({
                x: field.x + Math.cos(angle) * dist,
                y: field.y + Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                size,
                hull: Math.round(size * 4),
                spin: (Math.random() - 0.5) * 0.01,
                rotation: Math.random() * Math.PI * 2,
                points
            });
        }
    });
}

function updateAsteroids(deltaTime) {
    if (!game.asteroids) return;
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

        // Scoop by flying through
        const dist = Math.sqrt(
            Math.pow(d.x - game.ship.x, 2) +
            Math.pow(d.y - game.ship.y, 2)
        );
        if (dist < 26) {
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
