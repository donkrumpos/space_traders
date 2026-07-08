// Visual + audio effects: particles, screen shake, floating text, synthesized sound, lead reticle.

const effects = {
    particles: [],
    floaters: [],
    shake: { trauma: 0 }
};

// --- Screen shake ---

function addShake(amount) {
    effects.shake.trauma = Math.min(1, effects.shake.trauma + amount);
}

function getShakeOffset() {
    const t = effects.shake.trauma;
    if (t <= 0.01) return { x: 0, y: 0 };
    const magnitude = t * t * 14; // squared trauma = smooth falloff
    return {
        x: (Math.random() - 0.5) * 2 * magnitude,
        y: (Math.random() - 0.5) * 2 * magnitude
    };
}

// --- Particles ---

function spawnParticles(x, y, options) {
    const count = options.count || 12;
    const colors = options.colors || ['#ffffff'];
    const speed = options.speed || 120;       // units/second
    const life = options.life || 0.6;         // seconds
    const size = options.size || 2;
    const baseVx = options.baseVx || 0;       // inherit source velocity (units/sec)
    const baseVy = options.baseVy || 0;

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const s = speed * (0.3 + Math.random() * 0.7);
        effects.particles.push({
            x, y,
            vx: baseVx + Math.cos(angle) * s,
            vy: baseVy + Math.sin(angle) * s,
            life: life * (0.5 + Math.random() * 0.5),
            maxLife: life,
            size: size * (0.5 + Math.random()),
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

function spawnExplosion(x, y, color, baseVx, baseVy) {
    // Hot core flash
    spawnParticles(x, y, { count: 10, colors: ['#ffffff', '#ffff88'], speed: 60, life: 0.25, size: 3, baseVx, baseVy });
    // Fireball
    spawnParticles(x, y, { count: 24, colors: ['#ff8800', '#ffcc00', '#ff4400'], speed: 160, life: 0.7, size: 2.5, baseVx, baseVy });
    // Debris in the ship's color
    spawnParticles(x, y, { count: 14, colors: [color, '#888888'], speed: 220, life: 1.1, size: 2, baseVx, baseVy });
}

function spawnHitSparks(x, y, color) {
    spawnParticles(x, y, { count: 8, colors: [color, '#ffffff'], speed: 180, life: 0.3, size: 1.5 });
}

// --- Floating text (credit rewards, etc.) ---

function spawnFloater(x, y, text, color) {
    effects.floaters.push({ x, y, text, color, life: 1.4, maxLife: 1.4 });
}

function updateEffects(deltaTime) {
    // Shake decays quickly
    effects.shake.trauma = Math.max(0, effects.shake.trauma - deltaTime * 1.8);

    for (let i = effects.particles.length - 1; i >= 0; i--) {
        const p = effects.particles[i];
        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life -= deltaTime;
        if (p.life <= 0) effects.particles.splice(i, 1);
    }

    for (let i = effects.floaters.length - 1; i >= 0; i--) {
        const f = effects.floaters[i];
        f.y -= 30 * deltaTime; // drift upward
        f.life -= deltaTime;
        if (f.life <= 0) effects.floaters.splice(i, 1);
    }
}

function renderEffects(ctx, camera) {
    effects.particles.forEach(p => {
        const screenX = p.x - camera.x;
        const screenY = p.y - camera.y;
        if (screenX < -20 || screenX > ctx.canvas.width + 20 ||
            screenY < -20 || screenY > ctx.canvas.height + 20) return;

        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    effects.floaters.forEach(f => {
        const screenX = f.x - camera.x;
        const screenY = f.y - camera.y;
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
        ctx.fillStyle = f.color;
        ctx.font = 'bold 14px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, screenX, screenY);
    });
    ctx.globalAlpha = 1;
}

// --- Lead-target reticle ---
// Shows where to aim so a laser (which inherits ship velocity) intercepts the enemy.
// Solved in the ship's reference frame: bullet flies at LASER_SPEED, enemy moves at relative velocity.

const LASER_SPEED = 800; // units/second, must match fireLaser

function computeInterceptPoint(enemy) {
    // Relative velocity in units/second (game velocities are units/frame at 60fps)
    const relVx = (enemy.velocity.x - game.ship.velocity.x) * 60;
    const relVy = (enemy.velocity.y - game.ship.velocity.y) * 60;
    const rx = enemy.x - game.ship.x;
    const ry = enemy.y - game.ship.y;

    const a = relVx * relVx + relVy * relVy - LASER_SPEED * LASER_SPEED;
    const b = 2 * (rx * relVx + ry * relVy);
    const c = rx * rx + ry * ry;

    let t;
    if (Math.abs(a) < 1e-6) {
        if (Math.abs(b) < 1e-6) return null;
        t = -c / b;
    } else {
        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;
        const sq = Math.sqrt(disc);
        const t1 = (-b - sq) / (2 * a);
        const t2 = (-b + sq) / (2 * a);
        t = (Math.min(t1, t2) > 0) ? Math.min(t1, t2) : Math.max(t1, t2);
    }
    if (!t || t <= 0 || t > 2) return null; // no solution or too far out

    return {
        x: game.ship.x + rx + relVx * t,
        y: game.ship.y + ry + relVy * t
    };
}

function renderLeadReticle(ctx, camera) {
    if (!game.enemies || game.enemies.length === 0) return;

    // Nearest enemy within engagement range
    let nearest = null;
    let nearestDist = 700;
    game.enemies.forEach(enemy => {
        const d = Math.sqrt(
            Math.pow(enemy.x - game.ship.x, 2) +
            Math.pow(enemy.y - game.ship.y, 2)
        );
        if (d < nearestDist) {
            nearest = enemy;
            nearestDist = d;
        }
    });
    if (!nearest) return;

    const intercept = computeInterceptPoint(nearest);
    if (!intercept) return;

    const screenX = intercept.x - camera.x;
    const screenY = intercept.y - camera.y;

    // Is the ship's nose lined up with the intercept point?
    const aimAngle = Math.atan2(intercept.y - game.ship.y, intercept.x - game.ship.x);
    let angleDiff = aimAngle - game.ship.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    const lockedOn = Math.abs(angleDiff) < 0.06;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.strokeStyle = lockedOn ? '#00ff00' : '#ffffff';
    ctx.globalAlpha = lockedOn ? 0.9 : 0.45;
    ctx.lineWidth = lockedOn ? 2 : 1;

    // Diamond crosshair with a gap in the middle
    const r = lockedOn ? 8 : 6;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r, 0);
    ctx.lineTo(0, r); ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.stroke();

    if (lockedOn) {
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff00';
        ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
}

// --- Synthesized sound (WebAudio, no asset files) ---

const sfx = {
    ctx: null,
    noiseBuffer: null,
    ensure() {
        if (!this.ctx) {
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                // Pre-build one second of white noise for hits/explosions
                const rate = this.ctx.sampleRate;
                this.noiseBuffer = this.ctx.createBuffer(1, rate, rate);
                const data = this.noiseBuffer.getChannelData(0);
                for (let i = 0; i < rate; i++) data[i] = Math.random() * 2 - 1;
            } catch (e) {
                return null;
            }
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }
};

function playLaserSound() {
    const ac = sfx.ensure();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.13);
}

function playMissileSound() {
    const ac = sfx.ensure();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.4);
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.42);
}

function playHitSound() {
    const ac = sfx.ensure();
    if (!ac) return;
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();
    src.buffer = sfx.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(0.18, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
    src.stop(ac.currentTime + 0.1);
}

function playExplosionSound() {
    const ac = sfx.ensure();
    if (!ac) return;
    // Noise body
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();
    src.buffer = sfx.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.5);
    gain.gain.setValueAtTime(0.3, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
    src.stop(ac.currentTime + 0.55);
    // Low boom
    const osc = ac.createOscillator();
    const oscGain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, ac.currentTime + 0.45);
    oscGain.gain.setValueAtTime(0.25, ac.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.45);
    osc.connect(oscGain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.5);
}
