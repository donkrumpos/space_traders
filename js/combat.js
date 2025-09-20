function fireLaser() {
    if (game.ship.weapons.lasers.cooldown > 0) {
        return; // Still cooling down
    }

    // Create laser projectile
    const laser = {
        type: 'laser',
        x: game.ship.x,
        y: game.ship.y,
        velocity: {
            x: Math.cos(game.ship.angle) * 800, // Fast laser speed
            y: Math.sin(game.ship.angle) * 800
        },
        damage: 20 + (game.ship.upgrades.weapons - 1) * 10, // More damage with upgrades
        range: 500, // Maximum travel distance
        distanceTraveled: 0,
        color: '#ff0000',
        size: 3,
        age: 0,
        maxAge: 625 // 625ms at 800 units/second = 500 unit range
    };

    game.projectiles.push(laser);
    game.ship.weapons.lasers.cooldown = game.ship.weapons.lasers.maxCooldown;
}

function fireMissile() {
    if (game.ship.weapons.missiles.cooldown > 0 || game.ship.weapons.missiles.ammo <= 0) {
        return; // Still cooling down or no ammo
    }

    // Create missile projectile
    const missile = {
        type: 'missile',
        x: game.ship.x,
        y: game.ship.y,
        velocity: {
            x: Math.cos(game.ship.angle) * 300, // Slower than laser
            y: Math.sin(game.ship.angle) * 300
        },
        damage: 50 + (game.ship.upgrades.weapons - 1) * 25, // High damage with upgrades
        range: 800, // Longer range than laser
        distanceTraveled: 0,
        color: '#ffff00',
        size: 4,
        age: 0,
        maxAge: 2667, // 2667ms at 300 units/second = 800 unit range
        trail: [] // For visual trail effect
    };

    game.projectiles.push(missile);
    game.ship.weapons.missiles.cooldown = game.ship.weapons.missiles.maxCooldown;
    game.ship.weapons.missiles.ammo--;
}

// Combat targets system
function spawnEnemyShip() {
    // Spawn enemy ships at random locations away from the player
    const angle = Math.random() * Math.PI * 2;
    const distance = 800 + Math.random() * 1200; // 800-2000 units away

    const enemy = {
        type: 'enemy_ship',
        x: game.ship.x + Math.cos(angle) * distance,
        y: game.ship.y + Math.sin(angle) * distance,
        angle: Math.random() * Math.PI * 2,
        velocity: { x: 0, y: 0 },
        hull: 40,
        maxHull: 40,
        size: 8,
        color: '#ff4444',
        reward: 100 + Math.random() * 200, // 100-300 credits
        lastSpawn: Date.now()
    };

    if (!game.enemies) {
        game.enemies = [];
    }

    game.enemies.push(enemy);
}

function updateEnemies(deltaTime) {
    if (!game.enemies) {
        game.enemies = [];
    }

    // Spawn new enemies occasionally (every 30-60 seconds)
    if (game.enemies.length < 3 && (!game.lastEnemySpawn || Date.now() - game.lastEnemySpawn > 30000 + Math.random() * 30000)) {
        spawnEnemyShip();
        game.lastEnemySpawn = Date.now();
    }

    // Update enemy AI (simple movement)
    game.enemies.forEach(enemy => {
        // Simple random movement
        if (Math.random() < 0.01) { // 1% chance per frame to change direction
            enemy.angle += (Math.random() - 0.5) * 0.5;
        }

        // Move slowly
        const speed = 1;
        enemy.velocity.x = Math.cos(enemy.angle) * speed;
        enemy.velocity.y = Math.sin(enemy.angle) * speed;

        enemy.x += enemy.velocity.x * deltaTime;
        enemy.y += enemy.velocity.y * deltaTime;
    });

    // Remove enemies that are too far away
    game.enemies = game.enemies.filter(enemy => {
        const distance = Math.sqrt(
            Math.pow(enemy.x - game.ship.x, 2) +
            Math.pow(enemy.y - game.ship.y, 2)
        );
        return distance < 3000; // Remove if more than 3000 units away
    });
}

function checkProjectileCollisions() {
    if (!game.enemies) return;

    for (let i = game.projectiles.length - 1; i >= 0; i--) {
        const projectile = game.projectiles[i];

        for (let j = game.enemies.length - 1; j >= 0; j--) {
            const enemy = game.enemies[j];

            const distance = Math.sqrt(
                Math.pow(projectile.x - enemy.x, 2) +
                Math.pow(projectile.y - enemy.y, 2)
            );

            if (distance < enemy.size + projectile.size) {
                // Hit!
                enemy.hull -= projectile.damage;

                // Remove projectile
                game.projectiles.splice(i, 1);

                // Check if enemy is destroyed
                if (enemy.hull <= 0) {
                    // Award credits
                    game.ship.credits += Math.floor(enemy.reward);

                    // Remove enemy
                    game.enemies.splice(j, 1);

                    // TODO: Add explosion effect or debris
                }

                break; // Projectile can only hit one target
            }
        }
    }
}

function renderEnemies(ctx, camera) {
    if (!game.enemies) return;

    game.enemies.forEach(enemy => {
        const screenX = enemy.x - camera.x;
        const screenY = enemy.y - camera.y;

        // Only render if on screen
        if (screenX < -50 || screenX > ctx.canvas.width + 50 ||
            screenY < -50 || screenY > ctx.canvas.height + 50) {
            return;
        }

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(enemy.angle);

        // Enemy ship body (different design from player)
        ctx.strokeStyle = enemy.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Diamond shape
        ctx.moveTo(8, 0);
        ctx.lineTo(0, -6);
        ctx.lineTo(-8, 0);
        ctx.lineTo(0, 6);
        ctx.closePath();
        ctx.stroke();

        // Add hostile indicator
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Health bar above enemy
        const barWidth = 20;
        const barHeight = 4;
        const healthPercent = enemy.hull / enemy.maxHull;

        ctx.fillStyle = '#333333';
        ctx.fillRect(screenX - barWidth/2, screenY - enemy.size - 15, barWidth, barHeight);

        ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.2 ? '#ffff00' : '#ff0000';
        ctx.fillRect(screenX - barWidth/2, screenY - enemy.size - 15, barWidth * healthPercent, barHeight);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX - barWidth/2, screenY - enemy.size - 15, barWidth, barHeight);
    });
}

function updateProjectiles(deltaTime) {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
        const projectile = game.projectiles[i];

        // Update position
        projectile.x += projectile.velocity.x * deltaTime;
        projectile.y += projectile.velocity.y * deltaTime;

        // Update age and distance
        projectile.age += deltaTime * 1000; // Convert to milliseconds
        const distance = Math.sqrt(projectile.velocity.x * projectile.velocity.x + projectile.velocity.y * projectile.velocity.y) * deltaTime;
        projectile.distanceTraveled += distance;

        // Update missile trail
        if (projectile.type === 'missile') {
            projectile.trail.push({ x: projectile.x, y: projectile.y, age: 0 });
            // Age trail points and remove old ones
            projectile.trail = projectile.trail.filter(point => {
                point.age += deltaTime * 1000;
                return point.age < 200; // 200ms trail
            });
        }

        // Remove projectile if it's too old or traveled too far
        if (projectile.age > projectile.maxAge || projectile.distanceTraveled > projectile.range) {
            game.projectiles.splice(i, 1);
            continue;
        }
    }

    // Check for collisions after updating all projectiles
    checkProjectileCollisions();
}

function updateWeaponCooldowns(deltaTime) {
    // Update laser cooldown
    if (game.ship.weapons.lasers.cooldown > 0) {
        game.ship.weapons.lasers.cooldown -= deltaTime * 1000;
        if (game.ship.weapons.lasers.cooldown < 0) {
            game.ship.weapons.lasers.cooldown = 0;
        }
    }

    // Update missile cooldown
    if (game.ship.weapons.missiles.cooldown > 0) {
        game.ship.weapons.missiles.cooldown -= deltaTime * 1000;
        if (game.ship.weapons.missiles.cooldown < 0) {
            game.ship.weapons.missiles.cooldown = 0;
        }
    }
}

function renderProjectiles(ctx, camera) {
    game.projectiles.forEach(projectile => {
        const screenX = projectile.x - camera.x;
        const screenY = projectile.y - camera.y;

        // Only render if on screen
        if (screenX < -50 || screenX > ctx.canvas.width + 50 ||
            screenY < -50 || screenY > ctx.canvas.height + 50) {
            return;
        }

        if (projectile.type === 'laser') {
            // Render laser as a bright line
            ctx.save();
            ctx.globalAlpha = 1 - (projectile.age / projectile.maxAge) * 0.5; // Fade with age
            ctx.strokeStyle = projectile.color;
            ctx.lineWidth = projectile.size;
            ctx.beginPath();

            // Draw line from current position back along velocity vector
            const lineLength = 20;
            const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
            const startX = screenX - Math.cos(angle) * lineLength;
            const startY = screenY - Math.sin(angle) * lineLength;

            ctx.moveTo(startX, startY);
            ctx.lineTo(screenX, screenY);
            ctx.stroke();
            ctx.restore();
        } else if (projectile.type === 'missile') {
            // Render missile trail
            if (projectile.trail.length > 1) {
                ctx.save();
                ctx.strokeStyle = '#ff8800';
                ctx.lineWidth = 2;
                ctx.beginPath();

                for (let i = 0; i < projectile.trail.length - 1; i++) {
                    const point = projectile.trail[i];
                    const trailX = point.x - camera.x;
                    const trailY = point.y - camera.y;

                    if (i === 0) {
                        ctx.moveTo(trailX, trailY);
                    } else {
                        ctx.lineTo(trailX, trailY);
                    }
                }
                ctx.stroke();
                ctx.restore();
            }

            // Render missile body
            ctx.save();
            ctx.fillStyle = projectile.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, projectile.size, 0, Math.PI * 2);
            ctx.fill();

            // Add missile glow
            ctx.shadowColor = projectile.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(screenX, screenY, projectile.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
}