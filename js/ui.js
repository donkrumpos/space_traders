function updateUI() {
    document.getElementById('credits').textContent = game.ship.credits;
    document.getElementById('fuel').textContent = Math.floor(game.ship.fuel);
    document.getElementById('fuelMax').textContent = game.ship.fuelMax;
    document.getElementById('hull').textContent = Math.floor(game.ship.hull);
    document.getElementById('hullMax').textContent = game.ship.hullMax;

    const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
    document.getElementById('cargoUsed').textContent = cargoUsed;
    document.getElementById('cargoMax').textContent = game.ship.cargoMax;

    document.getElementById('missiles').textContent = game.ship.weapons.missiles.ammo;
    document.getElementById('missilesMax').textContent = game.ship.weapons.missiles.maxAmmo;

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

    // Check for event engagement first
    if (game.isEngaged) {
        nearby.innerHTML += `<div style="color: #ffaa00; font-weight: bold;">ENGAGED with ${game.currentEvent.name}</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Use side panel for choices | ESC or movement keys to disengage</div>`;
    } else if (typeof eventSystem !== 'undefined' && eventSystem.inEventRange && eventSystem.nearEvent && !game.isDocked) {
        const event = eventSystem.nearEvent;
        nearby.innerHTML += `<div style="color: #ffaa00; font-weight: bold;">EVENT DETECTED</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Press SPACE to ${event.interactionText}</div>`;
        nearby.innerHTML += `<div style="color: #cccccc; font-size: 10px;">${event.description}</div>`;
        if (event.fuelCost > 0) {
            const canAfford = game.ship.fuel >= event.fuelCost;
            const color = canAfford ? '#88ff88' : '#ff8888';
            nearby.innerHTML += `<div style="color: ${color};">Fuel cost: ${event.fuelCost}</div>`;
        }
    } else if (game.inDockingRange && game.nearPlanet && !game.isDocked) {
        nearby.innerHTML += `<div style="color: #00ff00; font-weight: bold;">DOCKING RANGE</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Press SPACE to dock with ${game.nearPlanet.name}</div>`;
    } else if (game.isDocked) {
        nearby.innerHTML += `<div style="color: #00ffff; font-weight: bold;">DOCKED at ${game.currentPlanet.name}</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Press ESC or movement keys for emergency undock</div>`;
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