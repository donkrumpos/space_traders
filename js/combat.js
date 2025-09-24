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
        lastSpawn: Date.now(),
        weapons: {
            fireCooldown: 0,
            maxCooldown: 1500 + Math.random() * 1000, // 1.5-2.5 second firing rate
            range: 400, // Firing range
            accuracy: 0.8 // 80% accuracy (some spread)
        },
        thrust: {
            current: 0,
            target: 0,
            maxThrust: 0.15,
            acceleration: 0.008
        },
        rotation: {
            current: 0,
            turnSpeed: 0.03
        },
        ai: {
            state: 'patrol',
            targetDistance: 300,
            evasionCooldown: 0,
            strafeDirection: 0,
            lastDamageHull: 40
        }
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

    // Update enemy AI with realistic physics-based movement
    game.enemies.forEach(enemy => {
        // Update weapon cooldown
        if (enemy.weapons.fireCooldown > 0) {
            enemy.weapons.fireCooldown -= deltaTime * 1000;
        }

        // Update evasion cooldown
        if (enemy.ai.evasionCooldown > 0) {
            enemy.ai.evasionCooldown -= deltaTime * 1000;
        }

        // Calculate distance to player
        const distanceToPlayer = Math.sqrt(
            Math.pow(enemy.x - game.ship.x, 2) +
            Math.pow(enemy.y - game.ship.y, 2)
        );

        // Calculate angle to player
        const angleToPlayer = Math.atan2(
            game.ship.y - enemy.y,
            game.ship.x - enemy.x
        );

        // Check if enemy took damage and trigger evasion
        if (enemy.hull < enemy.ai.lastDamageHull && enemy.ai.evasionCooldown <= 0) {
            enemy.ai.state = 'evading';
            enemy.ai.evasionCooldown = 2000;
            enemy.ai.strafeDirection = Math.random() < 0.5 ? -1 : 1;
            enemy.ai.lastDamageHull = enemy.hull;
        } else if (enemy.hull === enemy.ai.lastDamageHull && enemy.ai.state === 'evading' && enemy.ai.evasionCooldown <= 0) {
            enemy.ai.state = distanceToPlayer < 800 ? 'engage' : 'patrol';
        }

        // AI behavior based on state
        let targetAngle = enemy.angle;
        let shouldThrust = false;

        if (enemy.ai.state === 'evading') {
            // Evasive maneuvers: turn perpendicular and thrust away
            targetAngle = angleToPlayer + (Math.PI / 2 * enemy.ai.strafeDirection);
            shouldThrust = true;
        } else if (distanceToPlayer < 800) {
            enemy.ai.state = 'engage';

            if (distanceToPlayer > enemy.ai.targetDistance) {
                // Approach player: turn toward player and thrust
                targetAngle = angleToPlayer;
                shouldThrust = true;
            } else if (distanceToPlayer < enemy.ai.targetDistance - 50) {
                // Too close: turn away and reverse thrust
                targetAngle = angleToPlayer + Math.PI;
                shouldThrust = true;
            } else {
                // At optimal range: orbit player for strafing shots
                targetAngle = angleToPlayer + Math.PI / 2;
                shouldThrust = distanceToPlayer > enemy.ai.targetDistance - 25;
            }
        } else {
            // Patrol: drift with occasional course corrections
            enemy.ai.state = 'patrol';
            if (Math.random() < 0.02) {
                targetAngle = angleToPlayer + (Math.random() - 0.5) * Math.PI;
                shouldThrust = Math.random() < 0.3;
            }
        }

        // Smooth rotation toward target angle
        let angleDiff = targetAngle - enemy.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const turnAmount = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), enemy.rotation.turnSpeed);
        enemy.rotation.current = turnAmount;
        enemy.angle += turnAmount;

        // Update thrust with smooth acceleration
        if (shouldThrust) {
            enemy.thrust.target = 1.0;
            if (enemy.thrust.current < enemy.thrust.target) {
                enemy.thrust.current = Math.min(enemy.thrust.current + enemy.thrust.acceleration, enemy.thrust.target);
            }
        } else {
            enemy.thrust.target = 0.0;
            if (enemy.thrust.current > enemy.thrust.target) {
                enemy.thrust.current = Math.max(enemy.thrust.current - enemy.thrust.acceleration * 2, enemy.thrust.target);
            }
        }

        // Apply thrust to velocity (like player physics)
        if (enemy.thrust.current > 0) {
            const actualThrust = enemy.thrust.maxThrust * enemy.thrust.current;
            enemy.velocity.x += Math.cos(enemy.angle) * actualThrust;
            enemy.velocity.y += Math.sin(enemy.angle) * actualThrust;
        }

        // Apply drag
        enemy.velocity.x *= 0.99;
        enemy.velocity.y *= 0.99;

        // Speed limit
        const maxSpeed = 6;
        const currentSpeed = Math.sqrt(enemy.velocity.x * enemy.velocity.x + enemy.velocity.y * enemy.velocity.y);
        if (currentSpeed > maxSpeed) {
            enemy.velocity.x = (enemy.velocity.x / currentSpeed) * maxSpeed;
            enemy.velocity.y = (enemy.velocity.y / currentSpeed) * maxSpeed;
        }

        // Fire at player if weapon is ready and aimed
        if (enemy.ai.state === 'engage' && enemy.weapons.fireCooldown <= 0 && Math.abs(angleDiff) < 0.2) {
            fireEnemyWeapon(enemy);
            enemy.weapons.fireCooldown = enemy.weapons.maxCooldown;
        }

        // Update position
        enemy.x += enemy.velocity.x * deltaTime * 60;
        enemy.y += enemy.velocity.y * deltaTime * 60;
    });

    // Remove enemies that are too far away
    game.enemies = game.enemies.filter(enemy => {
        const distance = Math.sqrt(
            Math.pow(enemy.x - game.ship.x, 2) +
            Math.pow(enemy.y - game.ship.y, 2)
        );
        return distance < 3000;
    });
}

function fireEnemyWeapon(enemy) {
    // Calculate firing angle with some inaccuracy
    const baseAngle = enemy.angle;
    const spread = (1 - enemy.weapons.accuracy) * 0.5; // Convert accuracy to spread
    const inaccuracy = (Math.random() - 0.5) * spread;
    const firingAngle = baseAngle + inaccuracy;

    // Create enemy projectile
    const projectile = {
        type: 'enemy_laser',
        source: 'enemy',
        x: enemy.x,
        y: enemy.y,
        velocity: {
            x: Math.cos(firingAngle) * 600, // Slightly slower than player lasers
            y: Math.sin(firingAngle) * 600
        },
        damage: 15, // Moderate damage
        range: 350, // Shorter range than player weapons
        distanceTraveled: 0,
        color: '#ff4444',
        size: 2,
        age: 0,
        maxAge: 583 // 583ms at 600 units/second = 350 unit range
    };

    game.projectiles.push(projectile);
}

function checkProjectileCollisions() {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
        const projectile = game.projectiles[i];
        let hitSomething = false;

        // Check player projectiles vs enemies
        if (projectile.source !== 'enemy' && game.enemies) {
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
                    hitSomething = true;

                    // Check if enemy is destroyed
                    if (enemy.hull <= 0) {
                        // Award credits
                        game.ship.credits += Math.floor(enemy.reward);

                        // Remove enemy
                        game.enemies.splice(j, 1);

                        // Auto-save on combat victory
                        autoSave('combat_victory');

                        // TODO: Add explosion effect or debris
                    }

                    break; // Projectile can only hit one target
                }
            }
        }

        // Check enemy projectiles vs player
        if (!hitSomething && projectile.source === 'enemy') {
            const playerSize = 10; // Player ship collision size
            const distance = Math.sqrt(
                Math.pow(projectile.x - game.ship.x, 2) +
                Math.pow(projectile.y - game.ship.y, 2)
            );

            if (distance < playerSize + projectile.size) {
                // Player hit!
                damagePlayer(projectile.damage);

                // Remove projectile
                game.projectiles.splice(i, 1);
                hitSomething = true;
            }
        }
    }
}

function damagePlayer(damage) {
    // Check if player is invulnerable (brief period after last hit)
    if (game.damage.invulnerabilityTime > 0) {
        return;
    }

    // Apply shield absorption first (if shields are upgraded)
    const shieldLevel = game.ship.upgrades.shields;
    const shieldAbsorption = (shieldLevel - 1) * 0.2; // 20% absorption per shield level above 1
    const actualDamage = damage * (1 - shieldAbsorption);

    // Apply damage to hull
    game.ship.hull -= actualDamage;

    // Ensure hull doesn't go below 0
    game.ship.hull = Math.max(0, game.ship.hull);

    // Set damage feedback effects
    game.damage.flashTime = 300; // 300ms red flash
    game.damage.lastHitTime = Date.now();
    game.damage.invulnerabilityTime = 200; // 200ms invulnerability

    // Check if player is destroyed
    if (game.ship.hull <= 0) {
        handlePlayerDestruction();
    }

    console.log(`Player hit for ${Math.round(actualDamage)} damage! Hull: ${Math.round(game.ship.hull)}/${game.ship.hullMax}`);
}

function handlePlayerDestruction() {
    // For now, respawn player with some penalties
    console.log("Player ship destroyed! Respawning...");

    // Reset hull to 25%
    game.ship.hull = game.ship.hullMax * 0.25;

    // Lose some credits (25%)
    const creditsLost = Math.floor(game.ship.credits * 0.25);
    game.ship.credits -= creditsLost;

    // Move player to a safe location (near starting area)
    game.ship.x = 1050;
    game.ship.y = 850;
    game.ship.velocity.x = 0;
    game.ship.velocity.y = 0;

    // Clear all enemies to give player a break
    game.enemies = [];

    // Auto-save the respawn state
    autoSave('respawn');

    console.log(`Lost ${creditsLost} credits. Respawned at starting location.`);
}

function updateDamageEffects(deltaTime) {
    // Update damage flash effect
    if (game.damage.flashTime > 0) {
        game.damage.flashTime -= deltaTime * 1000;
        if (game.damage.flashTime < 0) {
            game.damage.flashTime = 0;
        }
    }

    // Update invulnerability
    if (game.damage.invulnerabilityTime > 0) {
        game.damage.invulnerabilityTime -= deltaTime * 1000;
        if (game.damage.invulnerabilityTime < 0) {
            game.damage.invulnerabilityTime = 0;
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

        // Show combat range indicator when enemy is targeting player
        const distanceToPlayer = Math.sqrt(
            Math.pow(enemy.x - game.ship.x, 2) +
            Math.pow(enemy.y - game.ship.y, 2)
        );

        if (distanceToPlayer < enemy.weapons.range * 1.2) { // Show range when close
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(screenX, screenY, enemy.weapons.range, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
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

        if (projectile.type === 'laser' || projectile.type === 'enemy_laser') {
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