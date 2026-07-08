// Per-hull silhouettes — the ladder is visible at a glance. Every path
// points +x (nose right); nose/tail anchor the thrust flames, shield sets
// the aura radius. Wireframe polygons, same stroke idiom as everything else.
const HULL_SHAPES = {
    skiff: {
        nose: 10, tail: -10, shield: 16,
        draw: (ctx) => {
            ctx.moveTo(10, 0); ctx.lineTo(-10, -5); ctx.lineTo(-5, 0);
            ctx.lineTo(-10, 5); ctx.closePath();
        }
    },
    courier: {
        nose: 13, tail: -12, shield: 17,
        draw: (ctx) => {
            ctx.moveTo(13, 0); ctx.lineTo(3, -4); ctx.lineTo(-8, -6); ctx.lineTo(-12, -3);
            ctx.lineTo(-7, 0); ctx.lineTo(-12, 3); ctx.lineTo(-8, 6); ctx.lineTo(3, 4);
            ctx.closePath();
        }
    },
    freighter: {
        nose: 14, tail: -14, shield: 20,
        draw: (ctx) => {
            ctx.moveTo(14, 0); ctx.lineTo(8, -7); ctx.lineTo(-10, -8); ctx.lineTo(-14, -4);
            ctx.lineTo(-14, 4); ctx.lineTo(-10, 8); ctx.lineTo(8, 7); ctx.closePath();
            // Hold seam — a warehouse, not a dart
            ctx.moveTo(4, -7); ctx.lineTo(4, 7);
        }
    },
    gunship: {
        nose: 14, tail: -12, shield: 18,
        draw: (ctx) => {
            ctx.moveTo(14, 0); ctx.lineTo(4, -3); ctx.lineTo(-2, -10); ctx.lineTo(-9, -10);
            ctx.lineTo(-5, -3); ctx.lineTo(-12, -2); ctx.lineTo(-8, 0); ctx.lineTo(-12, 2);
            ctx.lineTo(-5, 3); ctx.lineTo(-9, 10); ctx.lineTo(-2, 10); ctx.lineTo(4, 3);
            ctx.closePath();
        }
    },
    clipper: {
        nose: 18, tail: -16, shield: 21,
        draw: (ctx) => {
            ctx.moveTo(18, 0); ctx.lineTo(8, -3); ctx.lineTo(-6, -4); ctx.lineTo(-16, -8);
            ctx.lineTo(-11, -2); ctx.lineTo(-11, 2); ctx.lineTo(-16, 8); ctx.lineTo(-6, 4);
            ctx.lineTo(8, 3); ctx.closePath();
        }
    }
};

function render() {
    const ctx = game.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);

    // Screen shake — offset the whole frame while trauma decays
    const shakeOffset = getShakeOffset();
    ctx.save();
    ctx.translate(shakeOffset.x, shakeOffset.y);

    // Damage flash effect
    if (game.damage && game.damage.flashTime > 0) {
        const flashIntensity = game.damage.flashTime / 300; // Normalize to 0-1
        ctx.fillStyle = `rgba(255, 0, 0, ${flashIntensity * 0.3})`; // Red overlay
        ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
    }

    // Draw stars with parallax effect (back to front)
    game.stars.forEach(star => {
        // Apply parallax - closer stars move faster with camera
        const parallaxX = game.camera.x * star.depth;
        const parallaxY = game.camera.y * star.depth;

        const screenX = star.x - parallaxX;
        const screenY = star.y - parallaxY;

        // Expanded culling bounds for larger stars
        const margin = star.size + 5;
        if (screenX >= -margin && screenX <= game.canvas.width + margin &&
            screenY >= -margin && screenY <= game.canvas.height + margin) {

            ctx.globalAlpha = star.brightness;
            ctx.fillStyle = star.color;

            if (star.size === 1) {
                // Optimize single pixel stars
                ctx.fillRect(Math.floor(screenX), Math.floor(screenY), 1, 1);
            } else if (star.size <= 3) {
                // Small-medium stars: simple circle
                ctx.beginPath();
                ctx.arc(screenX, screenY, star.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Large stars: add glow effect
                // Create gradient for each large star (only a few of these)
                const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, star.size);
                gradient.addColorStop(0, star.color);
                gradient.addColorStop(0.7, star.color + '80'); // Add transparency
                gradient.addColorStop(1, star.color + '00'); // Fully transparent

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(screenX, screenY, star.size, 0, Math.PI * 2);
                ctx.fill();

                // Bright core
                ctx.fillStyle = star.color;
                ctx.beginPath();
                ctx.arc(screenX, screenY, star.size / 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });
    ctx.globalAlpha = 1;

    // Draw event objects
    if (typeof eventSystem !== 'undefined' && eventSystem.activeEvents) {
        eventSystem.activeEvents.forEach(event => {
            const screenX = event.x - game.camera.x;
            const screenY = event.y - game.camera.y;

            if (screenX >= -50 && screenX <= game.canvas.width + 50 &&
                screenY >= -50 && screenY <= game.canvas.height + 50) {

                // Event object
                ctx.fillStyle = event.color;
                ctx.beginPath();
                ctx.arc(screenX, screenY, event.size, 0, Math.PI * 2);
                ctx.fill();

                // Event name
                ctx.fillStyle = '#ffffff';
                ctx.font = '10px Courier New';
                ctx.textAlign = 'center';
                ctx.fillText(event.name, screenX, screenY + event.size + 15);

                // Interaction range indicator
                const distance = Math.sqrt(
                    Math.pow(game.ship.x - event.x, 2) +
                    Math.pow(game.ship.y - event.y, 2)
                );

                if (distance < 60) {
                    ctx.strokeStyle = '#ffff00';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, 40, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Event symbol/icon overlay
                ctx.fillStyle = '#ffffff';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(event.symbol, screenX, screenY + 5);
            }
        });
    }

    // Draw planets
    game.planets.forEach(planet => {
        const screenX = planet.x - game.camera.x;
        const screenY = planet.y - game.camera.y;

        if (screenX >= -50 && screenX <= game.canvas.width + 50 &&
            screenY >= -50 && screenY <= game.canvas.height + 50) {

            // Planet
            ctx.fillStyle = planet.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, planet.size, 0, Math.PI * 2);
            ctx.fill();

            // Planet name
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(planet.name, screenX, screenY + planet.size + 15);

            // Docking range indicator
            const distance = Math.sqrt(
                Math.pow(game.ship.x - planet.x, 2) +
                Math.pow(game.ship.y - planet.y, 2)
            );

            if (distance < 60) {
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(screenX, screenY, 40, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    });

    // Draw asteroid fields and floating cargo
    renderAsteroids(ctx, game.camera);
    renderDrops(ctx, game.camera);

    // Draw NPC freighter traffic
    renderTraders(ctx, game.camera);

    // Draw enemies
    renderEnemies(ctx, game.camera);

    // Draw projectiles
    renderProjectiles(ctx, game.camera);

    // Draw orbiting option orbs (Twin Options powerup)
    renderPowerupOrbs(ctx, game.camera);

    // Draw explosions, sparks, floating text
    renderEffects(ctx, game.camera);

    // Draw lead-target reticle (where to aim at the nearest enemy)
    renderLeadReticle(ctx, game.camera);

    // Draw ship (always in center)
    const shipX = game.canvas.width / 2;
    const shipY = game.canvas.height / 2;

    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(game.ship.angle);

    // Invulnerability flashing effect
    let shipAlpha = 1;
    if (game.damage && game.damage.invulnerabilityTime > 0) {
        // Flash the ship during invulnerability
        shipAlpha = 0.3 + 0.7 * Math.sin(Date.now() * 0.02); // Fast flashing
    }
    ctx.globalAlpha = shipAlpha;

    // Ship body color based on hull status
    let shipColor = '#00ff00'; // Green when healthy
    const hullPercent = game.ship.hull / game.ship.hullMax;
    if (hullPercent < 0.25) {
        shipColor = '#ff0000'; // Red when critically damaged
    } else if (hullPercent < 0.5) {
        shipColor = '#ff8800'; // Orange when moderately damaged
    } else if (hullPercent < 0.75) {
        shipColor = '#ffff00'; // Yellow when lightly damaged
    }

    // Ship body — the hull's own silhouette
    const shape = HULL_SHAPES[game.ship.hullId] || HULL_SHAPES.skiff;
    ctx.strokeStyle = shipColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    shape.draw(ctx);
    ctx.stroke();

    // Shield aura — brighter when the pool is fuller, gone when depleted
    if (game.ship.shield > 0) {
        ctx.globalAlpha = 0.12 + 0.3 * (game.ship.shield / game.ship.shieldMax);
        ctx.strokeStyle = '#44aaff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, shape.shield, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = shipAlpha;
    }

    // Forward thrust indicator - intensity based on current thrust
    const hasMainFuel = game.ship.fuel > 0;
    const hasEmergencyFuel = game.ship.emergencyFuel > 0;
    const canThrust = hasMainFuel || hasEmergencyFuel;

    if (game.ship.thrust.isThrusting && canThrust) {
        const intensity = game.ship.thrust.current;
        const alpha = 0.3 + (intensity * 0.7); // 30% to 100% opacity
        const flameLength = 5 + (intensity * 10); // 5 to 15 pixel flame
        const isEmergencyMode = game.ship.fuel <= 0 && game.ship.emergencyFuel > 0;

        ctx.globalAlpha = alpha;
        // Different flame color for emergency mode
        ctx.strokeStyle = isEmergencyMode ? '#ff4444' : '#ff8800'; // Red flame in emergency mode
        ctx.lineWidth = 1 + intensity; // Thicker line at full thrust
        ctx.beginPath();
        ctx.moveTo(shape.tail, -2 * intensity);
        ctx.lineTo(shape.tail - flameLength, 0);
        ctx.moveTo(shape.tail, 2 * intensity);
        ctx.lineTo(shape.tail - flameLength, 0);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Reverse thrust indicator (smaller, blue) - intensity based on current thrust
    if (game.ship.thrust.isReversing && canThrust) {
        const intensity = game.ship.thrust.current;
        const alpha = 0.3 + (intensity * 0.7);
        const flameLength = 3 + (intensity * 5); // Smaller reverse flame
        const isEmergencyMode = game.ship.fuel <= 0 && game.ship.emergencyFuel > 0;

        ctx.globalAlpha = alpha;
        // Different flame color for emergency mode
        ctx.strokeStyle = isEmergencyMode ? '#ff6666' : '#4488ff'; // Light red in emergency mode
        ctx.lineWidth = 1 + (intensity * 0.5);
        ctx.beginPath();
        ctx.moveTo(shape.nose, -1 * intensity);
        ctx.lineTo(shape.nose + flameLength, 0);
        ctx.moveTo(shape.nose, 1 * intensity);
        ctx.lineTo(shape.nose + flameLength, 0);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    ctx.restore();

    // End screen-shake translate
    ctx.restore();
}