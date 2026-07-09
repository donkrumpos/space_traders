function flashCredits() {
    const el = document.getElementById('credits');
    if (!el) return;
    el.classList.remove('credits-pulse');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('credits-pulse');
}

const HUD_TOAST_MAX = 4;          // visible at once; oldest evicted beyond this
const HUD_TOAST_COLORS = {
    error:   { bg: '#ff4444', fg: '#ffffff' },
    warning: { bg: '#ffaa00', fg: '#000000' },
    success: { bg: '#00ff00', fg: '#000000' },
    info:    { bg: '#00aaff', fg: '#ffffff' }
};

function showHudFeedback(message, type = 'info', duration = 3000) {
    const stack = document.getElementById('hudToastStack');
    if (!stack) return;

    // Reading-time floor: callers pass durations tuned for glances, but a
    // long mission line needs more screen time than "Cargo full!"
    duration = Math.min(9000, Math.max(duration, 1600 + message.length * 45));

    // Same message already showing → bump a ×N counter and its timer
    // instead of stacking spam (save acks, repeated pickup denials)
    for (const t of stack.children) {
        if (t._message === message && t._type === type) {
            t._count++;
            t.textContent = `${message} ×${t._count}`;
            clearTimeout(t._timer);
            t.classList.remove('fading');
            t._timer = setTimeout(() => hudToastFade(t), duration);
            return;
        }
    }

    const colors = HUD_TOAST_COLORS[type] || HUD_TOAST_COLORS.info;
    const toast = document.createElement('div');
    toast.className = 'hud-toast';
    toast.textContent = message;
    toast.style.backgroundColor = colors.bg;
    toast.style.color = colors.fg;
    toast._message = message;
    toast._type = type;
    toast._count = 1;
    stack.appendChild(toast); // newest at the bottom of the column

    while (stack.children.length > HUD_TOAST_MAX) {
        clearTimeout(stack.firstChild._timer);
        stack.firstChild.remove();
    }

    toast._timer = setTimeout(() => hudToastFade(toast), duration);
}

function hudToastFade(toast) {
    toast.classList.add('fading');
    setTimeout(() => toast.remove(), 400); // matches the CSS transition
}

function updateUI() {
    // Pilot rank + XP toward next promotion
    const pilot = game.pilot;
    const rankEl = document.getElementById('pilotRank');
    if (pilot && rankEl) {
        const rank = PILOT_RANKS[pilot.rank];
        const next = PILOT_RANKS[pilot.rank + 1];
        rankEl.textContent = `${rank.icon} ${rank.title}`;
        document.getElementById('xpLine').textContent = next
            ? `XP ${pilot.xp} / ${next.xp}`
            : `XP ${pilot.xp} — highest rank`;
    }

    document.getElementById('credits').textContent = game.ship.credits;
    const isEmergencyMode = game.ship.fuel <= 0 && game.ship.emergencyFuel > 0;

    if (game.ship.fuel <= 0 && game.ship.emergencyFuel <= 0) {
        document.getElementById('fuel').textContent = '0 (SAIL)'; // solar-sail crawl
        document.getElementById('fuel').style.color = '#88ddff';
    } else if (isEmergencyMode) {
        document.getElementById('fuel').textContent = `0 (E:${Math.floor(game.ship.emergencyFuel)})`;
        document.getElementById('fuel').style.color = '#ff8800'; // Orange for emergency
    } else {
        document.getElementById('fuel').textContent = Math.floor(game.ship.fuel);
        document.getElementById('fuel').style.color = game.ship.fuel < 50 ? '#ffaa00' : '#ffffff'; // Yellow warning when low
    }
    document.getElementById('fuelMax').textContent = game.ship.fuelMax;
    document.getElementById('hull').textContent = Math.floor(game.ship.hull);
    document.getElementById('hullMax').textContent = game.ship.hullMax;

    const shieldEl = document.getElementById('shieldVal');
    shieldEl.textContent = Math.floor(game.ship.shield);
    shieldEl.style.color = game.ship.shield <= 0 ? '#666666'
        : game.ship.shield < game.ship.shieldMax ? '#88ccff' : '#44aaff';
    document.getElementById('shieldMax').textContent = game.ship.shieldMax;

    const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
    document.getElementById('cargoUsed').textContent = cargoUsed;
    document.getElementById('cargoMax').textContent = game.ship.cargoMax;

    document.getElementById('missiles').textContent = game.ship.weapons.missiles.ammo;
    document.getElementById('missilesMax').textContent = game.ship.weapons.missiles.maxAmmo;

    // Weapon system + laser heat
    const lasers = game.ship.weapons.lasers;
    const modeSpec = (typeof LASER_MODES !== 'undefined' && LASER_MODES[lasers.mode]) || { label: 'Single' };
    const modeLevel = typeof getLaserLevel === 'function' ? getLaserLevel(lasers.mode) : 1;
    document.getElementById('weaponMode').textContent = modeSpec.label + (modeLevel > 1 ? ` Lv${modeLevel}` : '');
    const heatEl = document.getElementById('laserHeat');
    const heat = Math.round(lasers.heat || 0);
    if (lasers.overheated) {
        heatEl.textContent = '· OVERHEATED';
        heatEl.style.color = '#ff4444';
    } else if (heat > 0) {
        heatEl.textContent = `· heat ${heat}%`;
        heatEl.style.color = heat > 75 ? '#ff8844' : heat > 40 ? '#ffcc44' : '#888888';
    } else {
        heatEl.textContent = '';
    }

    // Bounty streak indicator (only shown mid-streak)
    const streakEl = document.getElementById('streakLine');
    if (streakEl) {
        const streak = game.combatStreak || 0;
        if (streak > 1) {
            const mult = Math.min(1 + 0.25 * (streak - 1), 3);
            streakEl.style.display = 'block';
            streakEl.textContent = `Bounty streak ×${mult.toFixed(2).replace(/0$/, '')} (${streak} kills)`;
        } else {
            streakEl.style.display = 'none';
        }
    }

    // Knocked-out subsystem warning
    const sysEl = document.getElementById('systemsLine');
    if (sysEl) {
        const systems = game.ship.systems || {};
        const down = Object.keys(systems).filter(s => systems[s] === 'damaged');
        if (down.length > 0) {
            const labels = { lifeSupport: 'LIFE SUPPORT', engines: 'ENGINES', lasers: 'LASERS' };
            const kits = game.ship.cargo.parts || 0;
            sysEl.style.display = 'block';
            sysEl.textContent = `✖ ${down.map(s => labels[s]).join(' · ')} — R to repair (kits: ${kits})`;
        } else {
            sysEl.style.display = 'none';
        }
    }

    // Active powerup countdown
    const pwEl = document.getElementById('powerupLine');
    if (pwEl) {
        if (game.powerup) {
            const pwSpec = POWERUPS[game.powerup.type];
            pwEl.style.display = 'block';
            pwEl.style.color = pwSpec.color;
            pwEl.textContent = `⚡ ${pwSpec.name} ${Math.ceil(game.powerup.timeLeft)}s`;
        } else {
            pwEl.style.display = 'none';
        }
    }

    document.getElementById('posX').textContent = Math.floor(game.ship.x);
    document.getElementById('posY').textContent = Math.floor(game.ship.y);

    // Update upgrade levels
    document.getElementById('engineLevel').textContent = game.ship.upgrades.engine;
    document.getElementById('shieldLevel').textContent = game.ship.upgrades.shields;
    document.getElementById('cargoLevel').textContent = game.ship.upgrades.cargo;
    document.getElementById('fuelTankLevel').textContent = game.ship.upgrades.fuel_tank;
    document.getElementById('hullLevel').textContent = game.ship.upgrades.hull;
    document.getElementById('weaponLevel').textContent = game.ship.upgrades.weapons;

    // Update cargo list
    const cargoList = document.getElementById('cargoList');
    if (Object.keys(game.ship.cargo).length === 0) {
        cargoList.innerHTML = '<div class="cargo-item">Empty</div>';
    } else {
        cargoList.innerHTML = '';
        Object.keys(game.ship.cargo).forEach(goodType => {
            const amount = game.ship.cargo[goodType];
            cargoList.innerHTML += `<div class="cargo-item">
                <span>${goods[goodType].name}</span>
                <span>${amount}</span>
            </div>`;
        });
    }

    // Check for nearby objects
    const nearby = document.getElementById('nearbyObjects');
    nearby.innerHTML = '';

    // Emergency mode warning (highest priority)
    if (isEmergencyMode) {
        nearby.innerHTML += `<div style="color: #ff4444; font-weight: bold; text-align: center; margin-bottom: 10px;">⚠️ EMERGENCY POWER ⚠️</div>`;
        nearby.innerHTML += `<div style="color: #ff8800; text-align: center; margin-bottom: 10px;">Weak thrust only - find fuel immediately!</div>`;
    }

    // Check for active engagement first
    if (game.isEngaged) {
        nearby.innerHTML += `<div style="color: #ffaa00; font-weight: bold;">ENGAGED with ${game.currentEvent.name}</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Use side panel for choices | ESC or movement keys to disengage</div>`;
    } else if (game.isDocked) {
        nearby.innerHTML += `<div style="color: #00ffff; font-weight: bold;">DOCKED at ${game.currentPlanet.name}</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Press ESC or movement keys for emergency undock</div>`;
    } else if (game.inDockingRange && game.nearPlanet) {
        // Priority 1: Planet docking (highest priority)
        nearby.innerHTML += `<div style="color: #00ff00; font-weight: bold;">DOCKING RANGE</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Press SPACE to dock with ${game.nearPlanet.name}</div>`;

        // Show event as secondary option if present
        if (typeof eventSystem !== 'undefined' && eventSystem.inEventRange && eventSystem.nearEvent) {
            const event = eventSystem.nearEvent;
            nearby.innerHTML += `<div style="color: #888888; font-size: 10px; margin-top: 5px;">Also nearby: ${event.name}</div>`;
            nearby.innerHTML += `<div style="color: #ffaa88; font-size: 10px;">Press E to ${event.interactionText}</div>`;
        }
    } else if (typeof eventSystem !== 'undefined' && eventSystem.inEventRange && eventSystem.nearEvent) {
        // Priority 2: Event interaction (only when no planet docking available)
        const event = eventSystem.nearEvent;
        nearby.innerHTML += `<div style="color: #ffaa00; font-weight: bold;">EVENT DETECTED</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Press SPACE to ${event.interactionText}</div>`;
        nearby.innerHTML += `<div style="color: #cccccc; font-size: 10px;">${event.description}</div>`;
        if (event.fuelCost > 0) {
            const canAfford = game.ship.fuel >= event.fuelCost;
            const color = canAfford ? '#88ff88' : '#ff8888';
            nearby.innerHTML += `<div style="color: ${color};">Fuel cost: ${event.fuelCost}</div>`;
        }
    } else {
        // Show nearest planet information
        const nearest = getDistanceToNearest();
        if (nearest.planet) {
            const distance = Math.floor(nearest.distance);
            const dx = nearest.planet.x - game.ship.x;
            const dy = nearest.planet.y - game.ship.y;
            const angle = Math.atan2(dy, dx);

            // Convert angle to compass direction
            let direction = '';
            const degrees = (angle * 180 / Math.PI + 360) % 360;
            if (degrees >= 337.5 || degrees < 22.5) direction = 'E';
            else if (degrees >= 22.5 && degrees < 67.5) direction = 'SE';
            else if (degrees >= 67.5 && degrees < 112.5) direction = 'S';
            else if (degrees >= 112.5 && degrees < 157.5) direction = 'SW';
            else if (degrees >= 157.5 && degrees < 202.5) direction = 'W';
            else if (degrees >= 202.5 && degrees < 247.5) direction = 'NW';
            else if (degrees >= 247.5 && degrees < 292.5) direction = 'N';
            else direction = 'NE';

            nearby.innerHTML += `<div style="color: #00ffff;">Nearest: ${nearest.planet.name}</div>`;
            nearby.innerHTML += `<div style="color: #888888;">Distance: ${distance} units ${direction}</div>`;
        }

        // Show nearby planets within 200 units
        let nearbyCount = 0;
        game.planets.forEach(planet => {
            const distance = Math.sqrt(
                Math.pow(game.ship.x - planet.x, 2) +
                Math.pow(game.ship.y - planet.y, 2)
            );

            if (distance < 200 && planet !== nearest.planet) {
                if (nearbyCount === 0) {
                    nearby.innerHTML += `<div style="color: #666666; margin-top: 5px;">Also nearby:</div>`;
                }
                nearby.innerHTML += `<div style="color: #666666;">${planet.name} (${Math.floor(distance)})</div>`;
                nearbyCount++;
            }
        });

        // Event system status
        if (typeof eventSystem !== 'undefined') {
            const distanceToNextEvent = eventSystem.eventTriggerDistance - eventSystem.travelDistance;
            if (distanceToNextEvent < 100 && distanceToNextEvent > 0) {
                nearby.innerHTML += `<div style="color: #ffaa00; margin-top: 5px;">🌟 Event imminent</div>`;
            } else if (eventSystem.eventCooldown > 0) {
                nearby.innerHTML += `<div style="color: #666666; margin-top: 2px;">Event cooldown: ${Math.ceil(eventSystem.eventCooldown/60)}s</div>`;
            }
        }

        // Navigation hint
        nearby.innerHTML += `<div style="color: #444444; margin-top: 5px;">Press M for map</div>`;
    }
}