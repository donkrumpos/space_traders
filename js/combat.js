function fireLaser() {
    if (game.ship.weapons.lasers.cooldown > 0) {
        return; // Still cooling down
    }

    // Spawn at the ship's nose, not its center
    const muzzleX = game.ship.x + Math.cos(game.ship.angle) * 12;
    const muzzleY = game.ship.y + Math.sin(game.ship.angle) * 12;

    // Create laser projectile — inherits ship velocity (true Newtonian physics).
    // Ship velocity is units/frame at 60fps; projectile velocity is units/second.
    const laser = {
        type: 'laser',
        x: muzzleX,
        y: muzzleY,
        velocity: {
            x: Math.cos(game.ship.angle) * 800 + game.ship.velocity.x * 60,
            y: Math.sin(game.ship.angle) * 800 + game.ship.velocity.y * 60
        },
        damage: 20 + (game.ship.upgrades.weapons - 1) * 10, // More damage with upgrades
        range: 500, // Maximum travel distance
        distanceTraveled: 0,
        color: '#ff0000',
        size: 3,
        age: 0,
        maxAge: 1500 // Generous cap; range (distanceTraveled) is the real limiter
    };

    game.projectiles.push(laser);
    game.ship.weapons.lasers.cooldown = game.ship.weapons.lasers.maxCooldown;

    // Muzzle flash + pew
    spawnParticles(muzzleX, muzzleY, {
        count: 4, colors: ['#ff6666', '#ffaaaa'], speed: 80, life: 0.15, size: 1.5,
        baseVx: game.ship.velocity.x * 60, baseVy: game.ship.velocity.y * 60
    });
    playLaserSound();
}

function fireMissile() {
    if (game.ship.weapons.missiles.cooldown > 0 || game.ship.weapons.missiles.ammo <= 0) {
        return; // Still cooling down or no ammo
    }

    // Create missile projectile — also inherits ship velocity
    const missile = {
        type: 'missile',
        x: game.ship.x + Math.cos(game.ship.angle) * 12,
        y: game.ship.y + Math.sin(game.ship.angle) * 12,
        velocity: {
            x: Math.cos(game.ship.angle) * 300 + game.ship.velocity.x * 60,
            y: Math.sin(game.ship.angle) * 300 + game.ship.velocity.y * 60
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
    playMissileSound();
}

// Combat targets system — three pirate tiers. Danger scales with wealth:
// a rich trader is a juicy target, so tougher pirates come looking.
const ENEMY_TIERS = {
    scout: {
        name: 'Scout', hull: 30, size: 7, color: '#ff8844',
        maxThrust: 0.18, maxSpeed: 7, turnSpeed: 0.04,
        cooldownMin: 1200, cooldownVar: 800, damage: 10, accuracy: 0.75,
        rewardMin: 80, rewardVar: 80, detectRange: 700
    },
    raider: {
        name: 'Raider', hull: 70, size: 9, color: '#ff4444',
        maxThrust: 0.15, maxSpeed: 6, turnSpeed: 0.03,
        cooldownMin: 900, cooldownVar: 600, damage: 16, accuracy: 0.85,
        rewardMin: 220, rewardVar: 160, detectRange: 850
    },
    warlord: {
        name: 'Warlord', hull: 140, size: 12, color: '#cc44ff',
        maxThrust: 0.13, maxSpeed: 5.5, turnSpeed: 0.025,
        cooldownMin: 650, cooldownVar: 350, damage: 24, accuracy: 0.9,
        rewardMin: 600, rewardVar: 400, detectRange: 1000
    }
};

function cargoUnitsCarried() {
    return Object.values(game.ship.cargo).reduce((sum, qty) => sum + qty, 0);
}

function pickEnemyTier() {
    const wealth = game.ship.credits;
    const roll = Math.random();
    if (wealth < 2000) {
        return roll < 0.85 ? 'scout' : 'raider';
    } else if (wealth < 6000) {
        return roll < 0.45 ? 'scout' : (roll < 0.9 ? 'raider' : 'warlord');
    }
    return roll < 0.2 ? 'scout' : (roll < 0.65 ? 'raider' : 'warlord');
}

function spawnEnemyShip() {
    // Spawn enemy ships at random locations away from the player
    const angle = Math.random() * Math.PI * 2;
    const distance = 800 + Math.random() * 1200; // 800-2000 units away

    const tierKey = pickEnemyTier();
    const tier = ENEMY_TIERS[tierKey];

    const enemy = {
        type: 'enemy_ship',
        tierName: tier.name,
        x: game.ship.x + Math.cos(angle) * distance,
        y: game.ship.y + Math.sin(angle) * distance,
        angle: Math.random() * Math.PI * 2,
        velocity: { x: 0, y: 0 },
        hull: tier.hull,
        maxHull: tier.hull,
        size: tier.size,
        color: tier.color,
        maxSpeed: tier.maxSpeed,
        damage: tier.damage,
        detectRange: tier.detectRange,
        reward: tier.rewardMin + Math.random() * tier.rewardVar,
        lastSpawn: Date.now(),
        weapons: {
            fireCooldown: 0,
            maxCooldown: tier.cooldownMin + Math.random() * tier.cooldownVar,
            range: 400, // Firing range
            accuracy: tier.accuracy
        },
        thrust: {
            current: 0,
            target: 0,
            maxThrust: tier.maxThrust,
            acceleration: 0.008
        },
        rotation: {
            current: 0,
            turnSpeed: tier.turnSpeed
        },
        ai: {
            state: 'patrol',
            targetDistance: 300,
            evasionCooldown: 0,
            strafeDirection: 0,
            lastDamageHull: tier.hull
        }
    };

    if (!game.enemies) {
        game.enemies = [];
    }

    game.enemies.push(enemy);
}

// Named Warlord for a wanted-poster hunt: tougher than a regular Warlord,
// fires 3-shot volleys, waits near its "last seen" planet, never despawns.
function spawnNamedWarlord(bounty) {
    const planet = game.planets.find(p => p.name === bounty.nearPlanet) || game.planets[0];
    const angle = Math.random() * Math.PI * 2;
    const dist = 350 + Math.random() * 250;

    const boss = {
        type: 'enemy_ship',
        isBoss: true,
        bountyId: bounty.id,
        tierName: bounty.name,
        x: planet.x + Math.cos(angle) * dist,
        y: planet.y + Math.sin(angle) * dist,
        angle: Math.random() * Math.PI * 2,
        velocity: { x: 0, y: 0 },
        hull: 200,
        maxHull: 200,
        size: 14,
        color: '#ff2266',
        maxSpeed: 6,
        damage: 24,
        detectRange: 1100,
        reward: bounty.reward,
        lastSpawn: Date.now(),
        weapons: {
            fireCooldown: 0,
            maxCooldown: 1100,
            range: 450,
            accuracy: 0.9,
            volley: 3 // fires a 3-shot spread
        },
        thrust: { current: 0, target: 0, maxThrust: 0.15, acceleration: 0.008 },
        rotation: { current: 0, turnSpeed: 0.028 },
        ai: {
            state: 'patrol',
            targetDistance: 320,
            evasionCooldown: 0,
            strafeDirection: 0,
            lastDamageHull: 200
        }
    };

    if (!game.enemies) game.enemies = [];
    game.enemies.push(boss);
}

function updateEnemies(deltaTime) {
    if (!game.enemies) {
        game.enemies = [];
    }

    // Spawn cadence and pack size scale with how tempting a target you are.
    // Hauling cargo makes you actively hunted.
    const hasCargo = cargoUnitsCarried() > 0;
    const maxEnemies = (game.ship.credits < 2000 ? 2 : game.ship.credits < 6000 ? 3 : 4) + (hasCargo ? 1 : 0);
    const spawnInterval = hasCargo ? 10000 + Math.random() * 10000 : 15000 + Math.random() * 15000;
    if (game.enemies.length < maxEnemies && (!game.lastEnemySpawn || Date.now() - game.lastEnemySpawn > spawnInterval)) {
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
            enemy.ai.state = distanceToPlayer < enemy.detectRange ? 'engage' : 'patrol';
        }

        // Cargo haulers are worth chasing — pirates smell the goods from further out
        const effectiveDetectRange = enemy.detectRange + (cargoUnitsCarried() > 0 ? 300 : 0);

        // AI behavior based on state
        let targetAngle = enemy.angle;
        let shouldThrust = false;

        if (enemy.ai.state === 'evading') {
            // Evasive maneuvers: turn perpendicular and thrust away
            targetAngle = angleToPlayer + (Math.PI / 2 * enemy.ai.strafeDirection);
            shouldThrust = true;
        } else if (distanceToPlayer < effectiveDetectRange) {
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

        // Speed limit (per tier — scouts are fast, warlords lumber)
        const maxSpeed = enemy.maxSpeed;
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

    // Remove enemies that are too far away (bounty bosses never despawn)
    game.enemies = game.enemies.filter(enemy => {
        if (enemy.isBoss) return true;
        const distance = Math.sqrt(
            Math.pow(enemy.x - game.ship.x, 2) +
            Math.pow(enemy.y - game.ship.y, 2)
        );
        return distance < 3000;
    });
}

function fireEnemyWeapon(enemy) {
    // Bosses fire a fanned volley; regular pirates fire a single shot
    const shots = enemy.weapons.volley || 1;

    for (let s = 0; s < shots; s++) {
        // Calculate firing angle with some inaccuracy, plus volley fan spread
        const baseAngle = enemy.angle;
        const spread = (1 - enemy.weapons.accuracy) * 0.5; // Convert accuracy to spread
        const inaccuracy = (Math.random() - 0.5) * spread;
        const fanOffset = shots > 1 ? (s - (shots - 1) / 2) * 0.12 : 0;
        const firingAngle = baseAngle + inaccuracy + fanOffset;

        // Create enemy projectile
        const projectile = {
            type: 'enemy_laser',
            source: 'enemy',
            x: enemy.x,
            y: enemy.y,
            velocity: {
                x: Math.cos(firingAngle) * 600 + enemy.velocity.x * 60, // Inherits enemy velocity too
                y: Math.sin(firingAngle) * 600 + enemy.velocity.y * 60
            },
            damage: enemy.damage, // Per tier
            range: 350, // Shorter range than player weapons
            distanceTraveled: 0,
            color: enemy.color,
            size: 2,
            age: 0,
            maxAge: 583 // 583ms at 600 units/second = 350 unit range
        };

        game.projectiles.push(projectile);
    }
}

// Distance from point (px, py) to the segment (x1,y1)-(x2,y2).
// Projectiles move many units per frame — checking only their endpoint position
// lets them tunnel straight through targets. Sweeping the full path fixes that.
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
        return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2));
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    return Math.sqrt(Math.pow(px - closestX, 2) + Math.pow(py - closestY, 2));
}

function checkProjectileCollisions() {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
        const projectile = game.projectiles[i];
        let hitSomething = false;

        // Swept path for this frame (prev position set in updateProjectiles)
        const prevX = projectile.prevX !== undefined ? projectile.prevX : projectile.x;
        const prevY = projectile.prevY !== undefined ? projectile.prevY : projectile.y;

        // Check player projectiles vs enemies
        if (projectile.source !== 'enemy' && game.enemies) {
            for (let j = game.enemies.length - 1; j >= 0; j--) {
                const enemy = game.enemies[j];

                // Forgiving hitbox: the drawn ship is ~16 units wide, and this is
                // an action game, not a simulation — err toward hits landing.
                const hitRadius = enemy.size * 2 + projectile.size;
                const distance = pointToSegmentDistance(
                    enemy.x, enemy.y, prevX, prevY, projectile.x, projectile.y
                );

                if (distance < hitRadius) {
                    // Hit!
                    enemy.hull -= projectile.damage;

                    spawnHitSparks(projectile.x, projectile.y, enemy.color);
                    playHitSound();
                    addShake(0.08);

                    // Remove projectile
                    game.projectiles.splice(i, 1);
                    hitSomething = true;

                    // Check if enemy is destroyed
                    if (enemy.hull <= 0) {
                        // Kill streak: consecutive bounties multiply, up to 3x. Docking resets it.
                        game.combatStreak = (game.combatStreak || 0) + 1;
                        const streakMult = Math.min(1 + 0.25 * (game.combatStreak - 1), 3);
                        const reward = Math.floor(enemy.reward * streakMult);
                        game.ship.credits += reward;

                        spawnExplosion(enemy.x, enemy.y, enemy.color,
                            enemy.velocity.x * 60, enemy.velocity.y * 60);
                        const streakTag = streakMult > 1 ? ` ×${streakMult.toFixed(2).replace(/0$/, '')}` : '';
                        spawnFloater(enemy.x, enemy.y - 25, `BOUNTY +$${reward}${streakTag}`, '#00ff88', 18);
                        playExplosionSound();
                        playBountySound();
                        addShake(0.35);
                        flashCredits();
                        if (enemy.bountyId) {
                            // Wanted-poster target down: close out the hunt
                            const bountyIdx = game.missions.findIndex(m => m.id === enemy.bountyId);
                            if (bountyIdx !== -1) game.missions.splice(bountyIdx, 1);
                            updateMissionsUI();
                            spawnFloater(enemy.x, enemy.y - 45, `${enemy.tierName} DOWN`, '#ff6666', 16);
                            showHudFeedback(`☠ BOUNTY CLAIMED: ${enemy.tierName} — $${reward}${streakTag}`, 'success', 5000);
                        } else {
                            showHudFeedback(`${enemy.tierName || 'Pirate'} destroyed — bounty $${reward}${streakTag}`, 'success', 2500);
                        }

                        // Pirates sometimes jettison cargo — fly through to scoop it
                        if (Math.random() < 0.6) {
                            const goodTypes = Object.keys(goods);
                            spawnCargoDrop(
                                enemy.x, enemy.y,
                                goodTypes[Math.floor(Math.random() * goodTypes.length)],
                                1 + Math.floor(Math.random() * 3)
                            );
                        }

                        // Remove enemy
                        game.enemies.splice(j, 1);

                        // Auto-save on combat victory
                        autoSave('combat_victory');
                    }

                    break; // Projectile can only hit one target
                }
            }
        }

        // Any projectile can crack an asteroid — mining and stray shots alike
        if (!hitSomething && game.asteroids) {
            for (let j = game.asteroids.length - 1; j >= 0; j--) {
                const rock = game.asteroids[j];
                const distance = pointToSegmentDistance(
                    rock.x, rock.y, prevX, prevY, projectile.x, projectile.y
                );
                if (distance < rock.size + projectile.size) {
                    rock.hull -= projectile.damage;
                    spawnHitSparks(projectile.x, projectile.y, '#bbaa88');
                    playHitSound();
                    game.projectiles.splice(i, 1);
                    hitSomething = true;

                    if (rock.hull <= 0) {
                        spawnExplosion(rock.x, rock.y, '#998877', rock.vx * 60, rock.vy * 60);
                        addShake(0.15);
                        // Cracked rocks shed raw materials
                        const chunks = 1 + Math.floor(Math.random() * 2);
                        for (let c = 0; c < chunks; c++) {
                            spawnCargoDrop(
                                rock.x + (Math.random() - 0.5) * 12,
                                rock.y + (Math.random() - 0.5) * 12,
                                'materials',
                                1 + Math.floor(Math.random() * 2)
                            );
                        }
                        game.asteroids.splice(j, 1);
                    }
                    break;
                }
            }
        }

        // Check enemy projectiles vs player
        if (!hitSomething && projectile.source === 'enemy') {
            const playerSize = 10; // Player ship collision size
            const distance = pointToSegmentDistance(
                game.ship.x, game.ship.y, prevX, prevY, projectile.x, projectile.y
            );

            if (distance < playerSize + projectile.size) {
                // Player hit!
                damagePlayer(projectile.damage);
                spawnHitSparks(projectile.x, projectile.y, '#ff8888');

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

    // Shields soak damage first; only the overflow reaches the hull
    let remaining = damage;
    if (game.ship.shield > 0) {
        const absorbed = Math.min(game.ship.shield, remaining);
        game.ship.shield -= absorbed;
        remaining -= absorbed;
    }
    game.ship.hull -= remaining;

    // Ensure hull doesn't go below 0
    game.ship.hull = Math.max(0, game.ship.hull);

    // Set damage feedback effects
    game.damage.flashTime = 300; // 300ms red flash
    game.damage.lastHitTime = Date.now();
    game.damage.invulnerabilityTime = 200; // 200ms invulnerability
    game.damage.shieldRegenDelay = 4; // Shields need 4s without damage to regenerate
    addShake(0.3);
    playHitSound();

    // Check if player is destroyed
    if (game.ship.hull <= 0) {
        handlePlayerDestruction();
    }

    console.log(`Player hit for ${damage}! Shield: ${Math.round(game.ship.shield)}/${game.ship.shieldMax}, Hull: ${Math.round(game.ship.hull)}/${game.ship.hullMax}`);
}

function handlePlayerDestruction() {
    // For now, respawn player with some penalties
    console.log("Player ship destroyed! Respawning...");

    spawnExplosion(game.ship.x, game.ship.y, '#00ff00',
        game.ship.velocity.x * 60, game.ship.velocity.y * 60);
    playExplosionSound();
    addShake(0.8);

    // Reset hull to 25%, shields to full
    game.ship.hull = game.ship.hullMax * 0.25;
    game.ship.shield = game.ship.shieldMax;

    // Lose some credits (25%)
    const creditsLost = Math.floor(game.ship.credits * 0.25);
    game.ship.credits -= creditsLost;

    // Move player to a safe location (near starting area)
    game.ship.x = 1050;
    game.ship.y = 850;
    game.ship.velocity.x = 0;
    game.ship.velocity.y = 0;

    // Clear all enemies to give player a break; dying ends the bounty streak
    game.enemies = [];
    game.combatStreak = 0;

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

    // Shield regeneration: 3 points/second after 4 seconds without damage
    if (game.damage.shieldRegenDelay > 0) {
        game.damage.shieldRegenDelay -= deltaTime;
    } else if (game.ship.shield < game.ship.shieldMax) {
        game.ship.shield = Math.min(game.ship.shieldMax, game.ship.shield + 3 * deltaTime);
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

        // Enemy ship body (different design from player), scaled to tier
        ctx.strokeStyle = enemy.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Diamond shape
        ctx.moveTo(enemy.size, 0);
        ctx.lineTo(0, -enemy.size * 0.75);
        ctx.lineTo(-enemy.size, 0);
        ctx.lineTo(0, enemy.size * 0.75);
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

        // Tier name below the ship
        ctx.fillStyle = enemy.color;
        ctx.font = '9px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(enemy.tierName || 'Pirate', screenX, screenY + enemy.size + 14);

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

        // Remember where the projectile was for swept collision detection
        projectile.prevX = projectile.x;
        projectile.prevY = projectile.y;

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