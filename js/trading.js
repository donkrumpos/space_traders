function tryDock() {
    // Check for event interaction first (but not if already engaged or docked)
    if (typeof eventSystem !== 'undefined' && eventSystem.inEventRange && eventSystem.nearEvent && !game.isDocked && !game.isEngaged) {
        interactWithEvent(eventSystem.nearEvent);
        return;
    }

    // Then check for planet docking (but not if already engaged)
    if (game.inDockingRange && game.nearPlanet && !game.isDocked && !game.isEngaged) {
        dock(game.nearPlanet);
    }
}

function dock(planet) {
    game.isDocked = true;
    game.currentPlanet = planet;

    // Stop the ship
    game.ship.velocity.x = 0;
    game.ship.velocity.y = 0;

    // Expand UI panel and show trading
    document.getElementById('ui').classList.add('trading');
    document.getElementById('tradingPanel').style.display = 'block';

    // Resize canvas to account for expanded UI
    setTimeout(() => {
        resizeCanvas();
    }, 300); // Wait for CSS transition

    // Populate trading interface
    updateTradingInterface(planet);
}

function undock() {
    game.isDocked = false;
    game.currentPlanet = null;

    // Collapse UI panel and hide trading
    document.getElementById('ui').classList.remove('trading');
    document.getElementById('tradingPanel').style.display = 'none';

    // Resize canvas back
    setTimeout(() => {
        resizeCanvas();
    }, 300); // Wait for CSS transition
}

function updateTradingInterface(planet) {
    document.getElementById('tradingTitle').textContent = planet.name;
    document.getElementById('stationInfo').textContent = `Type: ${planet.type} | Status: DOCKED`;

    // Update buying section (what the station sells)
    const buyingSection = document.getElementById('buyingSection');
    buyingSection.innerHTML = '';
    Object.keys(planet.produces).forEach(goodType => {
        const price = planet.produces[goodType];
        buyingSection.innerHTML += `<div class="trade-item">
            <span>${goods[goodType].name}</span>
            <span>${price}</span>
            <button onclick="buyGood('${goodType}', ${price})">Buy</button>
        </div>`;
    });

    if (Object.keys(planet.produces).length === 0) {
        buyingSection.innerHTML = '<div style="color: #666;">Nothing for sale</div>';
    }

    // Update selling section (what the station buys)
    updateSellingSectionUI();

    // Update upgrades section
    updateUpgradesUI(planet);

    // Update fuel cost
    updateFuelCost();
}

function updateSellingSectionUI() {
    const sellingSection = document.getElementById('sellingSection');
    const planet = game.currentPlanet;

    sellingSection.innerHTML = '';
    Object.keys(planet.demands).forEach(goodType => {
        const price = planet.demands[goodType];
        const playerHas = game.ship.cargo[goodType] || 0;
        sellingSection.innerHTML += `<div class="trade-item">
            <span>${goods[goodType].name} (You have: ${playerHas})</span>
            <span>${price}</span>
            <button onclick="sellGood('${goodType}', ${price})" ${playerHas === 0 ? 'disabled' : ''}>Sell</button>
        </div>`;
    });
}

function updateUpgradesUI(planet) {
    const upgradesSection = document.getElementById('upgradesSection');
    upgradesSection.innerHTML = '';

    if (!planet.upgrades || Object.keys(planet.upgrades).length === 0) {
        upgradesSection.innerHTML = '<div style="color: #666;">No upgrades available</div>';
        return;
    }

    Object.keys(planet.upgrades).forEach(upgradeType => {
        const upgrade = planet.upgrades[upgradeType];
        const currentLevel = game.ship.upgrades[upgradeType];
        const cost = upgrade.baseCost * Math.pow(1.5, currentLevel - 1); // Exponential pricing
        const canAfford = game.ship.credits >= cost;

        upgradesSection.innerHTML += `<div class="trade-item">
            <span>
                ${upgrade.name} (Lv.${currentLevel})<br>
                <small style="color: #888;">${upgrade.description}</small>
            </span>
            <span>$${Math.floor(cost)}</span>
            <button onclick="buyUpgrade('${upgradeType}', ${Math.floor(cost)})" ${!canAfford ? 'disabled' : ''}>
                Upgrade
            </button>
        </div>`;
    });
}

function updateFuelCost() {
    const fuelNeeded = game.ship.fuelMax - Math.floor(game.ship.fuel);
    const fuelCost = fuelNeeded * 2;
    document.getElementById('fuelCost').textContent = '$' + fuelCost;
}

function buyUpgrade(upgradeType, cost) {
    if (game.ship.credits < cost) {
        alert(`Insufficient credits! Need $${cost} for this upgrade.`);
        return;
    }

    game.ship.credits -= cost;
    game.ship.upgrades[upgradeType]++;

    // Apply upgrade effects
    applyUpgradeEffects(upgradeType);

    updateUI();
    updateUpgradesUI(game.currentPlanet); // Refresh just the upgrades section
}

function applyUpgradeEffects(upgradeType) {
    switch(upgradeType) {
        case 'cargo':
            game.ship.cargoMax += 5;
            break;
        case 'fuel_tank':
            game.ship.fuelMax += 200;
            game.ship.fuel = Math.min(game.ship.fuel + 200, game.ship.fuelMax); // Add fuel too
            break;
        case 'hull':
            game.ship.hullMax += 50;
            game.ship.hull = Math.min(game.ship.hull + 50, game.ship.hullMax); // Repair too
            break;
        case 'engine':
            // Engine upgrades improve fuel efficiency (handled in update function)
            break;
        case 'shields':
            // Shield upgrades (placeholder for future combat system)
            break;
    }
}

function buyFuel() {
    const fuelNeeded = game.ship.fuelMax - Math.floor(game.ship.fuel);
    if (fuelNeeded === 0) {
        alert('Fuel tank is already full!');
        return;
    }

    const fuelCost = fuelNeeded * 2;
    if (game.ship.credits < fuelCost) {
        alert(`Insufficient credits! Need ${fuelCost} to fill tank.`);
        return;
    }

    game.ship.credits -= fuelCost;
    game.ship.fuel = game.ship.fuelMax;

    updateUI();
    updateFuelCost(); // Refresh fuel cost display
}

function buyGood(goodType, price) {
    const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);

    if (cargoUsed >= game.ship.cargoMax) {
        alert('Cargo hold is full!');
        return;
    }

    if (game.ship.credits < price) {
        alert('Insufficient credits!');
        return;
    }

    game.ship.credits -= price;
    game.ship.cargo[goodType] = (game.ship.cargo[goodType] || 0) + 1;

    updateUI();
    updateSellingSectionUI(); // Refresh the selling section with new cargo
}

function sellGood(goodType, price) {
    if ((game.ship.cargo[goodType] || 0) === 0) {
        alert('You don\'t have any ' + goods[goodType].name + '!');
        return;
    }

    game.ship.credits += price;
    game.ship.cargo[goodType]--;
    if (game.ship.cargo[goodType] === 0) {
        delete game.ship.cargo[goodType];
    }

    updateUI();
    updateSellingSectionUI(); // Refresh the selling section
}