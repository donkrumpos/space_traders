// Gradius-style laser systems. Bought at stations, cycled with Z.
const LASER_MODES = {
    single: {
        label: 'Single', blurb: 'Standard forward cannon',
        heat: 14, damageMult: 1.0, cooldown: 500, range: 500, color: '#ff0000',
        shots: [{ angleOffset: 0 }]
    },
    double: {
        label: 'Twin', blurb: 'Two parallel barrels — wide hits, moderate heat',
        heat: 18, damageMult: 0.75, cooldown: 500, range: 500, color: '#ff5533',
        shots: [{ angleOffset: 0, side: -5 }, { angleOffset: 0, side: 5 }]
    },
    spread: {
        label: 'Spread', blurb: 'Three-shot fan — crowd control, runs hot',
        heat: 22, damageMult: 0.6, cooldown: 550, range: 450, color: '#ffaa22',
        shots: [{ angleOffset: -0.18 }, { angleOffset: 0 }, { angleOffset: 0.18 }]
    },
    seeker: {
        label: 'Seeker', blurb: 'Precursor guidance — shots curve toward pirates',
        heat: 16, damageMult: 0.8, cooldown: 600, range: 600, color: '#66ffcc',
        homing: true,
        shots: [{ angleOffset: 0 }]
    }
};

// Per-system progression tree: each owned laser system levels up on its own,
// firing bigger, harder-hitting bolts. Prereqs give the tree a shape: Single
// is the trunk, Twin chases Single, Spread chases Twin, Seeker rides the
// ship's weapons upgrade.
const LASER_TREE = {
    single: { maxLevel: 5, baseCost: 400, prereq: null },
    double: {
        maxLevel: 4, baseCost: 800,
        prereq: target => getLaserLevel('single') >= target + 1,
        prereqLabel: target => `Single Lv${target + 1}`
    },
    spread: {
        maxLevel: 4, baseCost: 1200,
        prereq: target => getLaserLevel('double') >= target,
        prereqLabel: target => `Twin Lv${target}`
    },
    seeker: {
        maxLevel: 3, baseCost: 1800,
        prereq: target => game.ship.upgrades.weapons >= target + 1,
        prereqLabel: target => `ship Weapons Lv${target + 1}`
    }
};

function getLaserLevel(mode) {
    return (game.ship.weapons.lasers.levels || {})[mode] || 1;
}

function laserUpgradeCost(mode, target) {
    return Math.round(LASER_TREE[mode].baseCost * Math.pow(1.6, target - 2));
}

function fireLaser() {
    const lasers = game.ship.weapons.lasers;
    if (game.ship.systems && game.ship.systems.lasers === 'damaged') {
        showHudFeedback('LASERS OFFLINE — field-repair (R) or dock', 'error', 2000);
        return;
    }
    if (lasers.cooldown > 0 || lasers.overheated) {
        return; // Cooling down or locked out
    }

    const spec = LASER_MODES[lasers.mode] || LASER_MODES.single;
    const level = getLaserLevel(lasers.mode);

    // Heat: sustained fire builds heat; hitting 100 locks the lasers until cooled
    const heatPerShot = spec.heat * (hasPerk('cold_barrels') ? 0.75 : 1) * modHeatFactor();
    lasers.heat = Math.min(100, (lasers.heat || 0) + heatPerShot);
    if (lasers.heat >= 100) {
        lasers.overheated = true;
        showHudFeedback('LASERS OVERHEATED — cooling...', 'warning', 2000);
    }

    // Spawn at the ship's nose, not its center
    const muzzleX = game.ship.x + Math.cos(game.ship.angle) * 12;
    const muzzleY = game.ship.y + Math.sin(game.ship.angle) * 12;
    const baseDamage = 20 + (game.ship.upgrades.weapons - 1) * 10; // More damage with upgrades

    // Active powerup can reshape the volley
    const pw = game.powerup;
    const waveActive = pw && pw.type === 'wave';
    const shotDamage = Math.round(baseDamage * spec.damageMult * (1 + 0.3 * (level - 1)) * modDamageFactor());
    const shotSize = 3 + (level - 1) * 0.7 + (waveActive ? 2 : 0);
    const shotRange = spec.range + (level - 1) * 30;

    spec.shots.forEach(shot => {
        const angle = game.ship.angle + shot.angleOffset;
        // Perpendicular offset for parallel barrels (Twin)
        const side = shot.side || 0;
        const offX = -Math.sin(game.ship.angle) * side;
        const offY = Math.cos(game.ship.angle) * side;

        // Inherits ship velocity (true Newtonian physics).
        // Ship velocity is units/frame at 60fps; projectile velocity is units/second.
        game.projectiles.push({
            type: 'laser',
            x: muzzleX + offX,
            y: muzzleY + offY,
            velocity: {
                x: Math.cos(angle) * 800 + game.ship.velocity.x * 60,
                y: Math.sin(angle) * 800 + game.ship.velocity.y * 60
            },
            // Level scaling: +30% damage, fatter bolt, a bit more reach per level
            damage: shotDamage,
            homing: spec.homing || false,
            pierce: waveActive,
            range: shotRange,
            distanceTraveled: 0,
            color: waveActive ? POWERUPS.wave.color : spec.color,
            size: shotSize,
            age: 0,
            maxAge: 1500 // Generous cap; range (distanceTraveled) is the real limiter
        });
    });

    // Rear Guard: one mirrored bolt from the tail
    if (pw && pw.type === 'rear') {
        const rearAngle = game.ship.angle + Math.PI;
        game.projectiles.push({
            type: 'laser',
            x: game.ship.x + Math.cos(rearAngle) * 12,
            y: game.ship.y + Math.sin(rearAngle) * 12,
            velocity: {
                x: Math.cos(rearAngle) * 800 + game.ship.velocity.x * 60,
                y: Math.sin(rearAngle) * 800 + game.ship.velocity.y * 60
            },
            damage: shotDamage,
            pierce: waveActive,
            range: shotRange,
            distanceTraveled: 0,
            color: POWERUPS.rear.color,
            size: shotSize,
            age: 0,
            maxAge: 1500
        });
    }

    // Tail Gunner crew covers your six with every other volley
    if (crewHasRole('gunner')) {
        game.gunnerToggle = !game.gunnerToggle;
        if (game.gunnerToggle) {
            const rearAngle = game.ship.angle + Math.PI;
            game.projectiles.push({
                type: 'laser',
                x: game.ship.x + Math.cos(rearAngle) * 12,
                y: game.ship.y + Math.sin(rearAngle) * 12,
                velocity: {
                    x: Math.cos(rearAngle) * 800 + game.ship.velocity.x * 60,
                    y: Math.sin(rearAngle) * 800 + game.ship.velocity.y * 60
                },
                damage: Math.round(shotDamage * 0.7),
                range: shotRange,
                distanceTraveled: 0,
                color: '#ff8866',
                size: Math.max(2, shotSize - 1),
                age: 0,
                maxAge: 1500
            });
        }
    }

    lasers.cooldown = spec.cooldown * (hasPerk('gunners_instinct') ? 0.85 : 1);

    // Muzzle flash + pew
    spawnParticles(muzzleX, muzzleY, {
        count: 4, colors: [spec.color, '#ffaaaa'], speed: 80, life: 0.15, size: 1.5,
        baseVx: game.ship.velocity.x * 60, baseVy: game.ship.velocity.y * 60
    });
    playLaserSound();
}

function cycleLaserMode() {
    const lasers = game.ship.weapons.lasers;
    const owned = lasers.owned || ['single'];
    if (owned.length < 2) {
        showHudFeedback('No other weapon systems installed — buy them at stations', 'info', 2000);
        return;
    }
    const idx = owned.indexOf(lasers.mode);
    lasers.mode = owned[(idx + 1) % owned.length];
    showHudFeedback(`Weapon system: ${LASER_MODES[lasers.mode].label} Lv${getLaserLevel(lasers.mode)}`, 'info', 1500);
    updateUI();
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
        damage: Math.round((50 + (game.ship.upgrades.weapons - 1) * 25)
            * (hasPerk('warhead_tuning') ? 1.3 : 1)),
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

// Combat targets system — three pirate tiers. The pure sim (tier tables,
// factories, AI update, damage/kill resolution) lives in js/sim/combat-core.js
// (shared browser+server, docs/PROTOCOL.md "Combat/traffic sim extraction");
// this file is the browser adapter: same public names, delegating to
// CombatCore with game-state args and the real fx implementation below.
const ENEMY_TIERS = CombatCore.ENEMY_TIERS;

// Real feedback wiring for the shared sim (see combat-core.js fx interface)
const COMBAT_FX = {
    floater: (x, y, text, color, size) => spawnFloater(x, y, text, color, size),
    sparks: (x, y, color) => spawnHitSparks(x, y, color),
    hud: (text, kind, ms) => showHudFeedback(text, kind, ms),
    shake: amount => addShake(amount),
    sound: name => ({
        laser: playLaserSound, hit: playHitSound,
        explosion: playExplosionSound, bounty: playBountySound
    })[name]()
};

function cargoUnitsCarried() {
    return Object.values(game.ship.cargo).reduce((sum, qty) => sum + qty, 0);
}

function pickEnemyTier() {
    return CombatCore.pickEnemyTier(game.ship.credits);
}

function makeEnemyFromTier(tierKey, x, y) {
    return CombatCore.makeEnemy(tierKey, x, y);
}

function spawnEnemyShip() {
    // Spawn enemy ships at random locations away from the player
    const angle = Math.random() * Math.PI * 2;
    const distance = 800 + Math.random() * 1200; // 800-2000 units away

    const enemy = makeEnemyFromTier(
        pickEnemyTier(),
        game.ship.x + Math.cos(angle) * distance,
        game.ship.y + Math.sin(angle) * distance
    );

    if (!game.enemies) {
        game.enemies = [];
    }

    game.enemies.push(enemy);
}

// Named Warlord for a wanted-poster hunt: tougher than a regular Warlord,
// fires 3-shot volleys, waits near its "last seen" planet, never despawns.
function spawnNamedWarlord(bounty) {
    const planet = game.planets.find(p => p.name === bounty.nearPlanet) || game.planets[0];
    if (!game.enemies) game.enemies = [];
    game.enemies.push(CombatCore.makeNamedWarlord(bounty, planet));
}

// --- Pirate faction raid bands ---
// An authored encounter: 3-4 faction minions escorting a warlord boss.
// The boss shields up and shadows the fight from long range; only once its
// escort is dead does it drop shields and engage.
const PIRATE_FACTIONS = CombatCore.PIRATE_FACTIONS;

let raidBandTimer = 150; // seconds until the first band can muster

function updateRaidBands(deltaTime) {
    // Bands only muster once you're worth robbing, and only one at a time
    if (game.ship.credits < 2500) return;
    if ((game.enemies || []).some(e => e.bandId)) return;
    raidBandTimer -= deltaTime;
    if (raidBandTimer <= 0) {
        spawnRaidBand();
        raidBandTimer = 240 + Math.random() * 180;
    }
}

// Grudge-weighted faction pick: a broken raid makes that faction likelier
// to come back for you (weight 1 + grudge each)
function pickRaidFaction() {
    return CombatCore.pickRaidFaction((game.pilot && game.pilot.grudges) || {});
}

function spawnRaidBand() {
    const band = CombatCore.makeRaidBand(game.ship.x, game.ship.y,
        (game.pilot && game.pilot.grudges) || {});

    if (!game.enemies) game.enemies = [];
    band.enemies.forEach(e => game.enemies.push(e));

    const vendetta = band.grudge > 0 ? ` They remember you (grudge ×${band.grudge}).` : '';
    showHudFeedback(`⚠ ${band.faction.name} raid band inbound — ${band.boss.tierName} won't fight until its escort falls.${vendetta}`, 'warning', 6000);
    playBountySound();
}

// True when the M4 net layer is up — net.js loads after this file, so the
// lookup happens at call time, and solo/?verify (net offline) never branches.
function combatNetOnline() {
    return typeof window !== 'undefined' && window.net && window.net.online === true;
}

function updateEnemies(deltaTime) {
    if (!game.enemies) {
        game.enemies = [];
    }

    // M4 online: the server owns enemy spawn/AI/band scheduling — the whole
    // local cadence below is bypassed. game.enemies becomes the extrapolated
    // server set merged with the client-local exceptions, which KEEP their
    // local CombatCore AI: named-warlord bounty targets (isBoss — the hunt is
    // client-local) and escort-ambush raiders (escortAmbush — part of the
    // client-local escort path). Server enemies carry `id`; locals don't.
    if (combatNetOnline()) {
        const locals = game.enemies.filter(e => e.id === undefined);
        if (locals.length > 0) {
            const targets = [{ x: game.ship.x, y: game.ship.y,
                vx: game.ship.velocity.x * 60, vy: game.ship.velocity.y * 60, // units/second for gunnery lead
                cargoUnits: cargoUnitsCarried() }];
            const { shots } = CombatCore.updateEnemies(
                { enemies: locals, targets, traders: game.traders || [] },
                deltaTime, COMBAT_FX);
            shots.forEach(shot => game.projectiles.push(shot));
        }
        game.enemies = [...window.net.getServerEnemies(), ...locals];
        return;
    }

    // Spawn cadence stays caller-owned (browser here, server cadence on the
    // server). Cadence and pack size scale with how tempting a target you
    // are. Hauling cargo makes you actively hunted.
    const hasCargo = cargoUnitsCarried() > 0;
    const maxEnemies = (game.ship.credits < 2000 ? 2 : game.ship.credits < 6000 ? 3 : 4) + (hasCargo ? 1 : 0);
    const spawnInterval = hasCargo ? 10000 + Math.random() * 10000 : 15000 + Math.random() * 15000;
    if (game.enemies.length < maxEnemies && (!game.lastEnemySpawn || Date.now() - game.lastEnemySpawn > spawnInterval)) {
        spawnEnemyShip();
        game.lastEnemySpawn = Date.now();
    }

    // Faction raid bands muster on their own clock
    updateRaidBands(deltaTime);

    // AI/movement/band logic runs in the shared core; enemy fire comes back
    // as projectile objects (the client owns its projectile list)
    const targets = [{ x: game.ship.x, y: game.ship.y,
                vx: game.ship.velocity.x * 60, vy: game.ship.velocity.y * 60, // units/second for gunnery lead
                cargoUnits: cargoUnitsCarried() }];
    const { shots } = CombatCore.updateEnemies(
        { enemies: game.enemies, targets, traders: game.traders || [] },
        deltaTime, COMBAT_FX);
    shots.forEach(shot => game.projectiles.push(shot));
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

// Kill celebration — streak math, credits, explosion, floaters, sounds,
// mission close, loot spawning, XP, autosave. Client-authoritative per the
// M4 authority split, so BOTH kill paths land here: local CombatCore kills
// (offline sim + client-local bounty bosses) and server-confirmed kills
// (net.js enemy.killed, which passes grudgeDelta:null because online grudges
// are server-owned and arrive via grudge.update, and drops:[] because server
// loot arrives via world.tick).
function applyKillRewards(enemy, outcome) {
    // Kill streak: consecutive bounties multiply, up to 3x. Docking resets it.
    game.combatStreak = (game.combatStreak || 0) + 1;
    const streakMult = Math.min(1 + 0.25 * (game.combatStreak - 1), 3);
    const reward = Math.floor(outcome.reward * streakMult);
    game.ship.credits += reward;

    spawnExplosion(enemy.x, enemy.y, enemy.color,
        enemy.velocity.x * 60, enemy.velocity.y * 60);
    const streakTag = streakMult > 1 ? ` ×${streakMult.toFixed(2).replace(/0$/, '')}` : '';
    spawnFloater(enemy.x, enemy.y - 25, `BOUNTY +$${reward}${streakTag}`, '#00ff88', 18);
    playExplosionSound();
    playBountySound();
    addShake(0.35);
    flashCredits();
    if (outcome.bountyId) {
        // Wanted-poster target down: close out the hunt
        const bountyIdx = game.missions.findIndex(m => m.id === outcome.bountyId);
        if (bountyIdx !== -1) game.missions.splice(bountyIdx, 1);
        updateMissionsUI();
        spawnFloater(enemy.x, enemy.y - 45, `${enemy.tierName} DOWN`, '#ff6666', 16);
        showHudFeedback(`☠ BOUNTY CLAIMED: ${enemy.tierName} — $${reward}${streakTag}`, 'success', 5000);
    } else if (outcome.isBandBoss) {
        spawnFloater(enemy.x, enemy.y - 45, 'RAID BROKEN', '#ffcc44', 18);
        showHudFeedback(`☠ RAID BROKEN — ${enemy.tierName} of the ${enemy.factionName || 'pirates'} destroyed! $${reward}${streakTag}`, 'success', 5000);
        if (outcome.grudgeDelta) recordRaidBroken(outcome.grudgeDelta.faction);
    } else {
        showHudFeedback(`${enemy.tierName || 'Pirate'} destroyed — bounty $${reward}${streakTag}`, 'success', 2500);
    }

    // Loot rolled by the core lands here (server kills pass none)
    (outcome.drops || []).forEach(d => {
        if (d.kind === 'cargo') spawnCargoDrop(d.x, d.y, d.goodType, d.qty);
        else spawnPowerupDrop(d.x, d.y);
    });

    // Escort down: count off what stands between you and the boss
    if (outcome.escortsLeft > 0) {
        spawnFloater(enemy.x, enemy.y - 45,
            `${outcome.escortsLeft} ESCORT${outcome.escortsLeft > 1 ? 'S' : ''} LEFT`, '#ffcc66', 14);
    }

    // Tougher ships teach the pilot more (~hull/3 XP)
    addXP(outcome.xp, enemy.tierName || 'kill');

    // Auto-save on combat victory
    autoSave('combat_victory');
}

function checkProjectileCollisions() {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
        const projectile = game.projectiles[i];
        let hitSomething = false;

        // Peer-aimed enemy fire (M4) renders as a tracer: pure visual,
        // collides with nothing, expires by age/range in updateProjectiles.
        if (projectile.tracer) continue;

        // Swept path for this frame (prev position set in updateProjectiles)
        const prevX = projectile.prevX !== undefined ? projectile.prevX : projectile.x;
        const prevY = projectile.prevY !== undefined ? projectile.prevY : projectile.y;

        // Check player projectiles vs enemies
        if (projectile.source !== 'enemy' && game.enemies) {
            for (let j = game.enemies.length - 1; j >= 0; j--) {
                const enemy = game.enemies[j];

                // Wave Beam bolts pierce — but only bite each target once
                if (projectile.pierce && projectile.hitTargets && projectile.hitTargets.includes(enemy)) {
                    continue;
                }

                // Forgiving hitbox: the drawn ship is ~16 units wide, and this is
                // an action game, not a simulation — err toward hits landing.
                const hitRadius = enemy.size * 2 + projectile.size;
                const distance = pointToSegmentDistance(
                    enemy.x, enemy.y, prevX, prevY, projectile.x, projectile.y
                );

                if (distance < hitRadius) {
                    // Server-owned enemy (M4 online, carries `id`): the hit
                    // becomes a fire-and-forget damage.claim plus client-
                    // predicted feedback — sparks/sound now, predicted hull
                    // dent on the stash object (the next world.tick corrects
                    // it). Kill celebration WAITS for enemy.killed; nothing
                    // is removed or rewarded here.
                    if (enemy.id !== undefined && combatNetOnline()) {
                        if (enemy.shielded) {
                            // Mirror the core's escort-shield splash locally;
                            // no claim — the server would no-op it anyway
                            spawnHitSparks(projectile.x, projectile.y, '#66ffff');
                            if (Math.random() < 0.35) {
                                spawnFloater(enemy.x, enemy.y - 25, 'SHIELDED — KILL THE ESCORT', '#66ffff', 11);
                            }
                            playHitSound();
                        } else {
                            window.net.send({ t: 'damage.claim', enemyId: enemy.id, damage: projectile.damage });
                            enemy.hull = Math.max(0, enemy.hull - projectile.damage); // prediction
                            spawnHitSparks(projectile.x, projectile.y, enemy.color);
                            playHitSound();
                            addShake(0.08);
                        }
                        if (projectile.pierce) {
                            if (!projectile.hitTargets) projectile.hitTargets = [];
                            projectile.hitTargets.push(enemy);
                            continue;
                        }
                        game.projectiles.splice(i, 1);
                        hitSomething = true;
                        break;
                    }

                    // Damage + kill resolution run in the shared core, which
                    // returns a structured outcome (reward, drops, grudge)
                    // instead of performing side effects. The celebration
                    // is the browser's job — credits/XP/streak are
                    // client-authoritative per the M4 authority split.
                    const outcome = CombatCore.applyDamage(
                        game.enemies, enemy, projectile.damage,
                        projectile.x, projectile.y, COMBAT_FX,
                        { goodTypes: Object.keys(goods) });

                    // Escort shield: shots splashed off (core showed the feedback)
                    if (outcome.shielded) {
                        game.projectiles.splice(i, 1);
                        hitSomething = true;
                        break;
                    }

                    // Piercing bolts sail on; everything else stops here
                    if (projectile.pierce) {
                        if (!projectile.hitTargets) projectile.hitTargets = [];
                        projectile.hitTargets.push(enemy);
                    } else {
                        game.projectiles.splice(i, 1);
                        hitSomething = true;
                    }

                    if (outcome.killed) {
                        applyKillRewards(enemy, outcome);
                    }

                    if (!projectile.pierce) {
                        break; // Non-piercing projectile can only hit one target
                    }
                }
            }
        }

        // Any projectile can crack an asteroid — mining and stray shots alike
        if (!hitSomething && game.asteroids) {
            for (let j = game.asteroids.length - 1; j >= 0; j--) {
                const rock = game.asteroids[j];
                if (projectile.pierce && projectile.hitTargets && projectile.hitTargets.includes(rock)) {
                    continue;
                }
                const distance = pointToSegmentDistance(
                    rock.x, rock.y, prevX, prevY, projectile.x, projectile.y
                );
                if (distance < rock.size + projectile.size) {
                    rock.hull -= projectile.damage;
                    spawnHitSparks(projectile.x, projectile.y, '#bbaa88');
                    playHitSound();
                    if (projectile.pierce) {
                        if (!projectile.hitTargets) projectile.hitTargets = [];
                        projectile.hitTargets.push(rock);
                    } else {
                        game.projectiles.splice(i, 1);
                        hitSomething = true;
                    }

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
                        // Rarely, a rock hides precursor tech
                        if (Math.random() < 0.08) {
                            spawnPowerupDrop(rock.x, rock.y);
                        }
                        game.asteroids.splice(j, 1);
                    }
                    if (!projectile.pierce) {
                        break;
                    }
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

        // Enemy fire can gun down freighters too
        if (!hitSomething && projectile.source === 'enemy' && game.traders) {
            for (let j = game.traders.length - 1; j >= 0; j--) {
                const t = game.traders[j];
                if (t.state !== 'traveling') continue;
                // Server-owned freighters (M4): the server resolves their
                // damage in its own sim — a local shot must not kill them
                if (t.id !== undefined) continue;
                const distance = pointToSegmentDistance(
                    t.x, t.y, prevX, prevY, projectile.x, projectile.y
                );
                if (distance < t.size + projectile.size) {
                    t.hull -= projectile.damage;
                    spawnHitSparks(projectile.x, projectile.y, t.color);
                    game.projectiles.splice(i, 1);
                    hitSomething = true;
                    if (t.hull <= 0) destroyTrader(j);
                    break;
                }
            }
        }
    }
}

// Subsystems that hull hits can knock out once shields are down
const SUBSYSTEMS = {
    lifeSupport: { label: 'LIFE SUPPORT', hitMsg: 'LIFE SUPPORT HIT — hull bleeding!' },
    engines: { label: 'ENGINES', hitMsg: 'ENGINES HIT — thrust crippled!' },
    lasers: { label: 'LASERS', hitMsg: 'LASERS HIT — cannons offline!' }
};

function maybeDamageSubsystem() {
    if (Math.random() > 0.3) return;
    const systems = game.ship.systems;
    if (!systems) return;
    const intact = Object.keys(SUBSYSTEMS).filter(s => systems[s] === 'ok');
    if (intact.length === 0) return;
    const hit = intact[Math.floor(Math.random() * intact.length)];
    systems[hit] = 'damaged';
    spawnFloater(game.ship.x, game.ship.y - 30, SUBSYSTEMS[hit].label + ' HIT', '#ff4444', 16);
    showHudFeedback(`⚠ ${SUBSYSTEMS[hit].hitMsg} Field-repair (R) or limp to a station`, 'error', 5000);
    addShake(0.4);
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

    // Hull hits (not shield hits) can knock out a subsystem
    if (remaining > 0 && game.ship.hull > 0) {
        maybeDamageSubsystem();
    }

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

    // The hold doesn't die with the ship: cargo scatters at the wreck as
    // pods anyone can scoop — hopefully you, racing back from respawn.
    // Online the server owns the pods (shared, first-wins like kill loot);
    // offline they're ordinary local drops with a long fuse.
    const wreckX = game.ship.x, wreckY = game.ship.y;
    const manifest = {};
    Object.keys(game.ship.cargo).forEach(g => {
        if (game.ship.cargo[g] > 0) manifest[g] = game.ship.cargo[g];
    });
    const unitsLost = Object.values(manifest).reduce((a, b) => a + b, 0);
    if (unitsLost > 0) {
        if (typeof net !== 'undefined' && net.online) {
            net.send({ t: 'cargo.scatter', x: wreckX, y: wreckY, cargo: manifest });
        } else {
            Object.keys(manifest).forEach(g => {
                let qty = manifest[g];
                while (qty > 0) { // pods of ≤5 so the wreck reads as a debris field
                    const podQty = Math.min(5, qty);
                    qty -= podQty;
                    game.drops.push({
                        x: wreckX + (Math.random() - 0.5) * 240,
                        y: wreckY + (Math.random() - 0.5) * 240,
                        vx: (Math.random() - 0.5) * 0.8,
                        vy: (Math.random() - 0.5) * 0.8,
                        goodType: g, amount: podQty,
                        life: 90 // longer than kill loot — the corpse run needs time
                    });
                }
            });
        }
        game.ship.cargo = {};
        showHudFeedback(`${unitsLost} cargo units adrift at the wreck — race back before someone else scoops them!`, 'warning', 8000);
    }

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

    // Damaged life support bleeds hull — pressure, not a death sentence:
    // the drain stops at 5 hull so it can't kill you. Repair or dock to stop it.
    if (game.ship.systems && game.ship.systems.lifeSupport === 'damaged' && game.ship.hull > 5) {
        game.ship.hull = Math.max(5, game.ship.hull - 1.2 * deltaTime);
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

        // Escort shield: pulsing ring around a holding-back band boss
        if (enemy.shielded) {
            const pulse = 0.35 + 0.25 * Math.sin(Date.now() * 0.006);
            ctx.save();
            ctx.strokeStyle = '#66ffff';
            ctx.lineWidth = 2;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(screenX, screenY, enemy.size + 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

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

        // Seeker shots curve toward the nearest pirate, preserving their speed.
        // Shielded band bosses are skipped — no point homing into a wall.
        if (projectile.homing && game.enemies && game.enemies.length > 0) {
            let nearest = null;
            let nearestDistSq = Infinity;
            game.enemies.forEach(e => {
                if (e.shielded) return;
                const dSq = Math.pow(e.x - projectile.x, 2) + Math.pow(e.y - projectile.y, 2);
                if (dSq < nearestDistSq) {
                    nearestDistSq = dSq;
                    nearest = e;
                }
            });
            if (nearest) {
                const speed = Math.sqrt(
                    projectile.velocity.x * projectile.velocity.x +
                    projectile.velocity.y * projectile.velocity.y
                );
                const currentAngle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
                const targetAngle = Math.atan2(nearest.y - projectile.y, nearest.x - projectile.x);
                let diff = targetAngle - currentAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                const turn = Math.sign(diff) * Math.min(Math.abs(diff), 3.5 * deltaTime);
                const newAngle = currentAngle + turn;
                projectile.velocity.x = Math.cos(newAngle) * speed;
                projectile.velocity.y = Math.sin(newAngle) * speed;
            }
        }

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

    // Laser heat dissipates constantly; overheat lockout clears at 30
    const lasers = game.ship.weapons.lasers;
    if (lasers.heat > 0) {
        lasers.heat = Math.max(0, lasers.heat - 20 * deltaTime);
        if (lasers.overheated && lasers.heat <= 30) {
            lasers.overheated = false;
            showHudFeedback('Lasers back online', 'info', 1500);
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