function updateUI() {
    document.getElementById('credits').textContent = game.ship.credits;
    document.getElementById('fuel').textContent = Math.floor(game.ship.fuel);
    document.getElementById('fuelMax').textContent = game.ship.fuelMax;
    document.getElementById('hull').textContent = Math.floor(game.ship.hull);
    document.getElementById('hullMax').textContent = game.ship.hullMax;

    const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
    document.getElementById('cargoUsed').textContent = cargoUsed;
    document.getElementById('cargoMax').textContent = game.ship.cargoMax;

    document.getElementById('posX').textContent = Math.floor(game.ship.x);
    document.getElementById('posY').textContent = Math.floor(game.ship.y);

    // Update upgrade levels
    document.getElementById('engineLevel').textContent = game.ship.upgrades.engine;
    document.getElementById('shieldLevel').textContent = game.ship.upgrades.shields;
    document.getElementById('cargoLevel').textContent = game.ship.upgrades.cargo;
    document.getElementById('fuelTankLevel').textContent = game.ship.upgrades.fuel_tank;
    document.getElementById('hullLevel').textContent = game.ship.upgrades.hull;

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

    if (game.inDockingRange && game.nearPlanet && !game.isDocked) {
        nearby.innerHTML += `<div style="color: #00ff00; font-weight: bold;">DOCKING RANGE</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Press SPACE to dock with ${game.nearPlanet.name}</div>`;
    } else if (game.isDocked) {
        nearby.innerHTML += `<div style="color: #00ffff; font-weight: bold;">DOCKED at ${game.currentPlanet.name}</div>`;
        nearby.innerHTML += `<div style="color: #ffff00;">Press ESC or movement keys for emergency undock</div>`;
    } else {
        game.planets.forEach(planet => {
            const distance = Math.sqrt(
                Math.pow(game.ship.x - planet.x, 2) +
                Math.pow(game.ship.y - planet.y, 2)
            );

            if (distance < 200) {
                nearby.innerHTML += `<div style="color: #888888;">Nearby: ${planet.name}</div>`;
            }
        });
    }
}