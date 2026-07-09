// Pure enemy/raid-band combat sim shared by browser and server (M4,
// docs/PROTOCOL.md "Combat/traffic sim extraction"). Side-effect script that
// sets globalThis.CombatCore — loaded as a <script> tag before combat.js in
// the browser and via await import() on the server. Same file, no fork.
//
// Rules (same as economy-core): state is passed in — this module NEVER reads
// game/window globals. No DOM. No clock-based scheduling — the caller owns
// spawn cadence (enemy spawn timers, raid-band muster timer); grudges are
// passed IN as a plain { factionName: n } map, never read from globals.
// Internal Math.random() and Date.now()-for-ids are fine.
//
// fx interface (every member optional — missing ones become no-ops). This is
// the in-sim feedback channel; node passes nothing and gets a silent sim:
//   fx.floater(x, y, text, color, size)  — floating combat text
//   fx.sparks(x, y, color)               — impact sparks at a hit point
//   fx.hud(text, kind, ms)               — HUD toast ('info'|'warning'|'error'|'success')
//   fx.shake(amount)                     — screen shake
//   fx.sound(name)                       — one-shot sound ('hit' is the only name used here)
//
// Kill resolution deliberately does NOT go through fx: applyDamage returns a
// structured outcome ({ killed, reward, drops, grudgeDelta, escortsLeft, ... })
// and the caller owns the celebration (explosion, credits, XP, powerup/cargo
// spawning, streak math, mission close) — credits/XP are client-authoritative
// per PROTOCOL.md's M4 authority split, so they can't live in shared code.
//
// updateEnemies targets: an array [{ x, y, cargoUnits }] of connected pilots
// (solo = the one player ship). Raid bands and bounty bosses hunt the nearest
// PILOT; common pirates also stalk traveling NPC freighters. Enemy fire is
// returned as `shots` (fully-formed enemy_laser projectile objects) instead
// of being pushed anywhere — the browser pushes them into game.projectiles,
// the server relays them as shots-in-tick.
(() => {
    'use strict';

    const NOOP = () => {};
    function withFx(fx) {
        fx = fx || {};
        return {
            floater: fx.floater || NOOP,
            sparks: fx.sparks || NOOP,
            hud: fx.hud || NOOP,
            shake: fx.shake || NOOP,
            sound: fx.sound || NOOP
        };
    }

    // Combat targets system — three pirate tiers. Danger scales with wealth:
    // a rich trader is a juicy target, so tougher pirates come looking.
    // leadFactor: how much of the intercept solution the tier's gunners
    // apply (0 = aim at where you ARE — trivially outrun; 1 = full lead).
    // Scouts stay kind to new pilots; warlords make you actually weave.
    const ENEMY_TIERS = {
        scout: {
            name: 'Scout', hull: 30, size: 7, color: '#ff8844',
            maxThrust: 0.18, maxSpeed: 7, turnSpeed: 0.04,
            cooldownMin: 1200, cooldownVar: 800, damage: 10, accuracy: 0.75,
            rewardMin: 80, rewardVar: 80, detectRange: 700, leadFactor: 0.35
        },
        raider: {
            name: 'Raider', hull: 70, size: 9, color: '#ff4444',
            maxThrust: 0.15, maxSpeed: 6, turnSpeed: 0.03,
            cooldownMin: 900, cooldownVar: 600, damage: 16, accuracy: 0.85,
            rewardMin: 220, rewardVar: 160, detectRange: 850, leadFactor: 0.65
        },
        warlord: {
            name: 'Warlord', hull: 140, size: 12, color: '#cc44ff',
            maxThrust: 0.13, maxSpeed: 5.5, turnSpeed: 0.025,
            cooldownMin: 650, cooldownVar: 350, damage: 24, accuracy: 0.9,
            rewardMin: 600, rewardVar: 400, detectRange: 1000, leadFactor: 0.9
        }
    };

    // Pirate faction raid bands: 3-4 faction minions escorting a warlord boss.
    const PIRATE_FACTIONS = [
        {
            name: 'Rustfang Cartel', color: '#ff7744', minionTier: 'scout',
            bossTitle: 'Fang-Boss', bossNames: ['Gnash', 'Korrode', 'Scrapjaw', 'Old Tetanus']
        },
        {
            name: 'Void Choir', color: '#bb66ff', minionTier: 'raider',
            bossTitle: 'Choirmaster', bossNames: ['Dirge', 'Hymnal', 'Echo-of-Nine', 'Vesper']
        },
        {
            name: 'Iron Shoal', color: '#88ccff', minionTier: 'raider',
            bossTitle: 'Shoal-Tyrant', bossNames: ['Undertow', 'Riptide', 'Brack', 'Deepmaw']
        }
    ];

    function grudgeOf(grudges, name) {
        return (grudges && grudges[name]) || 0;
    }

    // Tier pick scales with the target's wealth
    function pickEnemyTier(wealth) {
        const roll = Math.random();
        if (wealth < 2000) {
            return roll < 0.85 ? 'scout' : 'raider';
        } else if (wealth < 6000) {
            return roll < 0.45 ? 'scout' : (roll < 0.9 ? 'raider' : 'warlord');
        }
        return roll < 0.2 ? 'scout' : (roll < 0.65 ? 'raider' : 'warlord');
    }

    function makeEnemy(tierKey, x, y) {
        const tier = ENEMY_TIERS[tierKey];
        return {
            type: 'enemy_ship',
            tierName: tier.name,
            x, y,
            angle: Math.random() * Math.PI * 2,
            velocity: { x: 0, y: 0 },
            hull: tier.hull,
            maxHull: tier.hull,
            size: tier.size,
            color: tier.color,
            maxSpeed: tier.maxSpeed,
            damage: tier.damage,
            detectRange: tier.detectRange,
            leadFactor: tier.leadFactor || 0,
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
    }

    // Named Warlord for a wanted-poster hunt: tougher than a regular Warlord,
    // fires 3-shot volleys, waits near its "last seen" planet, never despawns.
    // anchor = the planet it lurks near ({ x, y }).
    function makeNamedWarlord(bounty, anchor) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 350 + Math.random() * 250;
        return {
            type: 'enemy_ship',
            isBoss: true,
            bountyId: bounty.id,
            tierName: bounty.name,
            x: anchor.x + Math.cos(angle) * dist,
            y: anchor.y + Math.sin(angle) * dist,
            angle: Math.random() * Math.PI * 2,
            velocity: { x: 0, y: 0 },
            hull: 200,
            maxHull: 200,
            size: 14,
            color: '#ff2266',
            maxSpeed: 6,
            damage: 24,
            detectRange: 1100,
            leadFactor: 0.9, // a named warlord earns its bounty
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
    }

    // Grudge-weighted faction pick: a broken raid makes that faction likelier
    // to come back for you (weight 1 + grudge each)
    function pickRaidFaction(grudges) {
        const weights = PIRATE_FACTIONS.map(f => 1 + grudgeOf(grudges, f.name));
        let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
        for (let i = 0; i < PIRATE_FACTIONS.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return PIRATE_FACTIONS[i];
        }
        return PIRATE_FACTIONS[0];
    }

    // Assemble a full raid band anchored near (anchorX, anchorY): minions in a
    // loose ring, boss trailing behind its escort with shields up. Returns
    // { faction, grudge, bandId, minions, boss, enemies } — enemies is the
    // spawn-ordered list (minions then boss); the caller pushes them into its
    // own enemy array and owns the muster announcement.
    function makeRaidBand(anchorX, anchorY, grudges) {
        const faction = pickRaidFaction(grudges);
        const grudge = grudgeOf(grudges, faction.name);
        const bandId = `band-${Date.now()}`;
        const bandAngle = Math.random() * Math.PI * 2;
        const bandDist = 1100 + Math.random() * 500;
        const cx = anchorX + Math.cos(bandAngle) * bandDist;
        const cy = anchorY + Math.sin(bandAngle) * bandDist;

        // Escort: minions in a loose ring, keyed to the faction's colors and name.
        // Grudges bring reinforcements: +1 minion per 2 grudge, capped at +2.
        const factionTag = faction.name.split(' ')[0];
        const minionCount = 3 + (Math.random() < 0.5 ? 1 : 0) + Math.min(2, Math.floor(grudge / 2));
        const minions = [];
        for (let i = 0; i < minionCount; i++) {
            const a = (i / minionCount) * Math.PI * 2;
            const minion = makeEnemy(faction.minionTier,
                cx + Math.cos(a) * 90, cy + Math.sin(a) * 90);
            minion.bandId = bandId;
            minion.color = faction.color;
            minion.tierName = `${factionTag} ${minion.tierName}`;
            minion.detectRange = 1400; // the band came for YOU — no wandering off
            minions.push(minion);
        }

        // The boss trails behind its escort, shields up
        const bossName = faction.bossNames[Math.floor(Math.random() * faction.bossNames.length)];
        const boss = makeEnemy('warlord',
            cx + Math.cos(bandAngle) * 260, cy + Math.sin(bandAngle) * 260);
        // Vendetta bosses are tougher and worth more: +15% hull and +20% pay per
        // grudge level (hull capped at +60%)
        const bossHull = Math.round(170 * (1 + Math.min(0.6, grudge * 0.15)));
        Object.assign(boss, {
            bandId,
            isBandBoss: true,
            holdingBack: true,
            shielded: true,
            factionName: faction.name,
            tierName: `${faction.bossTitle} ${bossName}`,
            color: faction.color,
            hull: bossHull,
            maxHull: bossHull,
            size: 13,
            reward: (700 + Math.random() * 300) * (1 + grudge * 0.2),
            detectRange: 1600
        });
        boss.weapons.volley = 3;
        boss.weapons.maxCooldown = 1000;

        return { faction, grudge, bandId, minions, boss, enemies: [...minions, boss] };
    }

    // One enemy's firing volley → enemy_laser projectile objects (bosses fan
    // a volley; regular pirates fire a single shot). Never pushed anywhere —
    // returned so the caller owns the projectile list.
    function buildEnemyShots(enemy) {
        const shots = [];
        const volley = enemy.weapons.volley || 1;
        for (let s = 0; s < volley; s++) {
            // Calculate firing angle with some inaccuracy, plus volley fan spread
            const baseAngle = enemy.angle;
            const spread = (1 - enemy.weapons.accuracy) * 0.5; // Convert accuracy to spread
            const inaccuracy = (Math.random() - 0.5) * spread;
            const fanOffset = volley > 1 ? (s - (volley - 1) / 2) * 0.12 : 0;
            const firingAngle = baseAngle + inaccuracy + fanOffset;

            const projectile = {
                type: 'enemy_laser',
                source: 'enemy',
                x: enemy.x,
                y: enemy.y,
                angle: firingAngle,
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
            if (enemy.id !== undefined) projectile.enemyId = enemy.id;
            shots.push(projectile);
        }
        return shots;
    }

    // Per-frame enemy AI/movement/band-logic update.
    //   state = { enemies, targets, traders }
    //     targets: [{ x, y, cargoUnits }] — connected pilots (N targets, not
    //       "the player"; solo passes exactly one)
    //     traders: NPC freighters; only state==='traveling' ones are prey
    // Mutates enemies in place (including despawn removal — bosses never
    // despawn). Returns { shots } — enemy fire events this frame.
    function updateEnemies(state, deltaTime, fx) {
        const F = withFx(fx);
        const enemies = state.enemies;
        const targets = state.targets || [];
        const traders = state.traders || [];
        const shots = [];

        enemies.forEach(enemy => {
            // Update weapon cooldown
            if (enemy.weapons.fireCooldown > 0) {
                enemy.weapons.fireCooldown -= deltaTime * 1000;
            }

            // Update evasion cooldown
            if (enemy.ai.evasionCooldown > 0) {
                enemy.ai.evasionCooldown -= deltaTime * 1000;
            }

            // Pick prey: raid bands and bounty bosses came for a PILOT (the
            // nearest one); common pirates chase whichever target is closer —
            // a pilot or a hauling freighter
            let prey = targets[0];
            let bestSq = Infinity;
            targets.forEach(p => {
                const dSq = Math.pow(enemy.x - p.x, 2) + Math.pow(enemy.y - p.y, 2);
                if (dSq < bestSq) { bestSq = dSq; prey = p; }
            });
            const nearestPilot = prey;
            if (!enemy.bandId && !enemy.isBoss) {
                traders.forEach(t => {
                    if (t.state !== 'traveling') return; // berthed freighters are safe in port
                    const dSq = Math.pow(enemy.x - t.x, 2) + Math.pow(enemy.y - t.y, 2);
                    if (dSq < bestSq) { bestSq = dSq; prey = t; }
                });
            }
            if (!prey) return; // no targets at all — hold station

            const distanceToPlayer = Math.sqrt(
                Math.pow(enemy.x - prey.x, 2) +
                Math.pow(enemy.y - prey.y, 2)
            );
            const angleToPlayer = Math.atan2(
                prey.y - enemy.y,
                prey.x - enemy.x
            );

            // Gunnery solution: aim at where the prey will be when a 600 u/s
            // bolt arrives, not where it is now (aim-at-current is trivially
            // outrun — a thrusting ship is faster than the bolt). leadFactor
            // scales how much of the solve each tier applies. Targets carry
            // vx/vy in units/second; traders don't, and fall back to no lead.
            let aimAngle = angleToPlayer;
            const lead = enemy.leadFactor || 0;
            if (lead > 0 && (prey.vx || prey.vy)) {
                const boltTime = distanceToPlayer / 600;
                aimAngle = Math.atan2(
                    prey.y + (prey.vy || 0) * boltTime * lead - enemy.y,
                    prey.x + (prey.vx || 0) * boltTime * lead - enemy.x
                );
            }

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
            const effectiveDetectRange = enemy.detectRange +
                (nearestPilot && (nearestPilot.cargoUnits || 0) > 0 ? 300 : 0);

            // Band boss: drop shields and engage the moment the last escort dies
            if (enemy.isBandBoss && enemy.holdingBack) {
                const escortAlive = enemies.some(e => e.bandId === enemy.bandId && !e.isBandBoss);
                if (!escortAlive) {
                    enemy.holdingBack = false;
                    enemy.shielded = false;
                    F.floater(enemy.x, enemy.y - 30, 'SHIELDS DOWN', '#ffff66', 16);
                    F.hud(`⚠ ${enemy.tierName} drops shields and engages!`, 'warning', 4000);
                }
            }

            // AI behavior based on state
            let targetAngle = enemy.angle;
            let shouldThrust = false;

            if (enemy.ai.state === 'evading') {
                // Evasive maneuvers: turn perpendicular and thrust away
                targetAngle = angleToPlayer + (Math.PI / 2 * enemy.ai.strafeDirection);
                shouldThrust = true;
            } else if (enemy.holdingBack) {
                // Shielded boss shadows the fight from long range and never fires
                if (distanceToPlayer > 950) {
                    targetAngle = angleToPlayer;
                    shouldThrust = true;
                } else if (distanceToPlayer < 650) {
                    targetAngle = angleToPlayer + Math.PI;
                    shouldThrust = true;
                } else {
                    targetAngle = angleToPlayer + Math.PI / 2; // drift sideways, looming
                    shouldThrust = false;
                }
            } else if (distanceToPlayer < effectiveDetectRange) {
                enemy.ai.state = 'engage';

                if (distanceToPlayer > enemy.ai.targetDistance) {
                    // Approach: nose onto the intercept, not the prey — a
                    // hunter leads its quarry
                    targetAngle = aimAngle;
                    shouldThrust = true;
                } else if (distanceToPlayer < enemy.ai.targetDistance - 50) {
                    // Too close: turn away and reverse thrust
                    targetAngle = angleToPlayer + Math.PI;
                    shouldThrust = true;
                } else if (enemy.weapons.fireCooldown <= 250) {
                    // Gun (nearly) ready: attack run — swing the nose onto
                    // the firing solution. Before this, orbiting enemies
                    // "fired" along their strafe heading: 90° wide of the
                    // prey by construction, pure fireworks.
                    targetAngle = aimAngle;
                    shouldThrust = false;
                } else {
                    // Gun cycling: orbit the prey for the next run
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

            // Fire at prey if weapon is ready and aimed (shielded bosses hold fire)
            if (enemy.ai.state === 'engage' && !enemy.holdingBack && enemy.weapons.fireCooldown <= 0 && Math.abs(angleDiff) < 0.2) {
                buildEnemyShots(enemy).forEach(s => shots.push(s));
                enemy.weapons.fireCooldown = enemy.weapons.maxCooldown;
            }

            // Update position
            enemy.x += enemy.velocity.x * deltaTime * 60;
            enemy.y += enemy.velocity.y * deltaTime * 60;
        });

        // Remove enemies that drift too far from every pilot (bounty bosses
        // never despawn). In-place so the caller's array reference holds.
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            if (enemy.isBoss) continue;
            let nearSq = Infinity;
            targets.forEach(p => {
                const dSq = Math.pow(enemy.x - p.x, 2) + Math.pow(enemy.y - p.y, 2);
                if (dSq < nearSq) nearSq = dSq;
            });
            if (nearSq >= 3000 * 3000) enemies.splice(i, 1);
        }

        return { shots };
    }

    // Damage application + kill resolution. Mutates the enemy (hull) and, on a
    // kill, removes it from `enemies`. (hitX, hitY) is the impact point for
    // sparks. opts.goodTypes: the legal cargo universe for loot rolls.
    //
    // Returns a structured outcome instead of performing side effects:
    //   { shielded, killed,
    //     reward,                     — RAW enemy.reward (caller owns streak math)
    //     xp,                         — maxHull/3 (caller awards it)
    //     drops: [{kind:'cargo',x,y,goodType,qty} | {kind:'powerup',x,y}],
    //     grudgeDelta: {faction,amount}|null,  — band-boss kills deepen the vendetta
    //     escortsLeft: n|null,        — minions left in this band after the kill
    //     bountyId, isBandBoss, factionName, tierName }
    function applyDamage(enemies, enemy, damage, hitX, hitY, fx, opts) {
        const F = withFx(fx);

        // Escort shield: shots splash off until the minions are dead
        if (enemy.shielded) {
            F.sparks(hitX, hitY, '#66ffff');
            if (Math.random() < 0.35) {
                F.floater(enemy.x, enemy.y - 25, 'SHIELDED — KILL THE ESCORT', '#66ffff', 11);
            }
            F.sound('hit');
            return { shielded: true, killed: false };
        }

        enemy.hull -= damage;
        F.sparks(hitX, hitY, enemy.color);
        F.sound('hit');
        F.shake(0.08);

        if (enemy.hull > 0) {
            return { shielded: false, killed: false };
        }

        // Kill resolution — outcomes, not side effects
        const outcome = {
            shielded: false,
            killed: true,
            reward: enemy.reward,
            xp: enemy.maxHull / 3,
            drops: [],
            grudgeDelta: enemy.isBandBoss ? { faction: enemy.factionName, amount: 1 } : null,
            escortsLeft: null,
            bountyId: enemy.bountyId || null,
            isBandBoss: !!enemy.isBandBoss,
            factionName: enemy.factionName || null,
            tierName: enemy.tierName || null
        };

        // Pirates sometimes jettison cargo — fly through to scoop it
        // (a band boss always drops its plunder)
        const goodTypes = (opts && opts.goodTypes) || [];
        if ((enemy.isBandBoss || Math.random() < 0.6) && goodTypes.length > 0) {
            outcome.drops.push({
                kind: 'cargo',
                x: enemy.x, y: enemy.y,
                goodType: goodTypes[Math.floor(Math.random() * goodTypes.length)],
                qty: 1 + Math.floor(Math.random() * 3)
            });
        }

        // Sometimes their weapon rig survives the blast — grab it
        if (enemy.isBandBoss || Math.random() < 0.15) {
            outcome.drops.push({ kind: 'powerup', x: enemy.x + 20, y: enemy.y - 10 });
        }

        const idx = enemies.indexOf(enemy);
        if (idx !== -1) enemies.splice(idx, 1);

        // Escort down: count what stands between the killer and the boss
        if (enemy.bandId && !enemy.isBandBoss) {
            outcome.escortsLeft = enemies.filter(e => e.bandId === enemy.bandId && !e.isBandBoss).length;
        }

        return outcome;
    }

    globalThis.CombatCore = {
        ENEMY_TIERS, PIRATE_FACTIONS,
        pickEnemyTier, makeEnemy, makeNamedWarlord,
        pickRaidFaction, makeRaidBand,
        updateEnemies, applyDamage
    };
})();
