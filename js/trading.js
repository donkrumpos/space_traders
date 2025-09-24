function tryDock() {
    // Priority 1: Planet docking (highest priority - stable infrastructure)
    if (game.inDockingRange && game.nearPlanet && !game.isDocked && !game.isEngaged) {
        dock(game.nearPlanet);
        return;
    }

    // Priority 2: Event interaction (lower priority - temporary encounters)
    if (typeof eventSystem !== 'undefined' && eventSystem.inEventRange && eventSystem.nearEvent && !game.isDocked && !game.isEngaged) {
        interactWithEvent(eventSystem.nearEvent);
        return;
    }
}

function trySecondaryInteraction() {
    // Secondary interaction: try to interact with events when planet has priority
    if (typeof eventSystem !== 'undefined' && eventSystem.inEventRange && eventSystem.nearEvent && !game.isDocked && !game.isEngaged) {
        interactWithEvent(eventSystem.nearEvent);
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

    // Auto-save on docking
    autoSave('dock');
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
    updateFuelButton();

    // Update missile cost
    updateMissileCost();
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
    const fullTankCost = fuelNeeded * 2;

    if (game.ship.credits >= fullTankCost) {
        // Can afford full tank
        document.getElementById('fuelCost').textContent = '$' + fullTankCost;
    } else if (game.ship.credits >= 2) {
        // Show partial refuel option
        const maxAffordableFuel = Math.floor(game.ship.credits / 2);
        const actualFuelToBuy = Math.min(maxAffordableFuel, fuelNeeded);
        const actualCost = actualFuelToBuy * 2;
        document.getElementById('fuelCost').textContent = `$${actualCost} (${actualFuelToBuy} units)`;
    } else {
        // Can't afford any fuel
        document.getElementById('fuelCost').textContent = 'Need $2 min';
    }
}

function updateFuelButton() {
    const fuelNeeded = game.ship.fuelMax - Math.floor(game.ship.fuel);
    const fullTankCost = fuelNeeded * 2;
    const button = document.querySelector('button[onclick="buyFuel()"]');

    if (fuelNeeded === 0) {
        button.textContent = 'Tank Full';
        button.disabled = true;
    } else if (game.ship.credits >= fullTankCost) {
        button.textContent = 'Fill Tank';
        button.disabled = false;
    } else if (game.ship.credits >= 2) {
        const maxAffordableFuel = Math.floor(game.ship.credits / 2);
        const actualFuelToBuy = Math.min(maxAffordableFuel, fuelNeeded);
        button.textContent = `Add ${actualFuelToBuy} Fuel`;
        button.disabled = false;
    } else {
        button.textContent = 'No Credits';
        button.disabled = true;
    }
}

function updateMissileCost() {
    const missilesNeeded = game.ship.weapons.missiles.maxAmmo - game.ship.weapons.missiles.ammo;
    const fullCost = missilesNeeded * 50; // $50 per missile

    if (game.ship.credits >= fullCost) {
        // Can afford full rearm
        document.getElementById('missileCost').textContent = '$' + fullCost;
    } else if (game.ship.credits >= 50) {
        // Show partial rearm option
        const maxAffordableMissiles = Math.floor(game.ship.credits / 50);
        const actualMissilesToBuy = Math.min(maxAffordableMissiles, missilesNeeded);
        const actualCost = actualMissilesToBuy * 50;
        document.getElementById('missileCost').textContent = `$${actualCost} (${actualMissilesToBuy} missiles)`;
    } else {
        // Can't afford any missiles
        document.getElementById('missileCost').textContent = 'Need $50 min';
    }
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

    // Auto-save on upgrade purchase
    autoSave('upgrade');
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
        case 'weapons':
            // Weapon upgrades improve damage and missile capacity
            const level = game.ship.upgrades.weapons;
            game.ship.weapons.missiles.maxAmmo = 5 + (level - 1) * 3; // +3 missiles per level
            game.ship.weapons.missiles.ammo = Math.min(game.ship.weapons.missiles.ammo + 3, game.ship.weapons.missiles.maxAmmo);
            break;
    }
}

function buyFuel() {
    const fuelNeeded = game.ship.fuelMax - Math.floor(game.ship.fuel);
    if (fuelNeeded === 0) {
        alert('Fuel tank is already full!');
        return;
    }

    const fullTankCost = fuelNeeded * 2;

    if (game.ship.credits >= fullTankCost) {
        // Can afford full tank
        game.ship.credits -= fullTankCost;
        game.ship.fuel = game.ship.fuelMax;
        // Also restore emergency fuel if depleted
        game.ship.emergencyFuel = game.ship.emergencyFuelMax;
        console.log(`Refueled to full tank for $${fullTankCost}`);
    } else if (game.ship.credits >= 2) {
        // Can afford partial refuel
        const maxAffordableFuel = Math.floor(game.ship.credits / 2);
        const actualFuelToBuy = Math.min(maxAffordableFuel, fuelNeeded);
        const actualCost = actualFuelToBuy * 2;

        game.ship.credits -= actualCost;
        game.ship.fuel += actualFuelToBuy;

        // If main tank is now full, restore emergency fuel
        if (game.ship.fuel >= game.ship.fuelMax) {
            game.ship.emergencyFuel = game.ship.emergencyFuelMax;
        }

        console.log(`Partial refuel: +${actualFuelToBuy} fuel for $${actualCost}`);
        alert(`Partial refuel: Added ${actualFuelToBuy} fuel units for $${actualCost}`);
    } else {
        // Can't afford any fuel
        alert('Insufficient credits! Need at least $2 for 1 fuel unit.');
        return;
    }

    updateUI();
    updateFuelCost(); // Refresh fuel cost display
    updateFuelButton(); // Refresh button text
}

function buyMissiles() {
    const missilesNeeded = game.ship.weapons.missiles.maxAmmo - game.ship.weapons.missiles.ammo;
    if (missilesNeeded === 0) {
        alert('Missile bay is already full!');
        return;
    }

    const fullCost = missilesNeeded * 50;

    if (game.ship.credits >= fullCost) {
        // Can afford full rearm
        game.ship.credits -= fullCost;
        game.ship.weapons.missiles.ammo = game.ship.weapons.missiles.maxAmmo;
        console.log(`Rearmed all missiles for $${fullCost}`);
    } else if (game.ship.credits >= 50) {
        // Can afford partial rearm
        const maxAffordableMissiles = Math.floor(game.ship.credits / 50);
        const actualMissilesToBuy = Math.min(maxAffordableMissiles, missilesNeeded);
        const actualCost = actualMissilesToBuy * 50;

        game.ship.credits -= actualCost;
        game.ship.weapons.missiles.ammo += actualMissilesToBuy;

        console.log(`Partial rearm: +${actualMissilesToBuy} missiles for $${actualCost}`);
        alert(`Partial rearm: Added ${actualMissilesToBuy} missiles for $${actualCost}`);
    } else {
        alert('Insufficient credits! Need at least $50 for 1 missile.');
        return;
    }

    updateUI();
    updateMissileCost(); // Refresh missile cost display
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
    updateFuelCost(); // Refresh fuel options
    updateFuelButton();

    // Auto-save on trade
    autoSave('trade');
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
    updateFuelCost(); // Refresh fuel options
    updateFuelButton();

    // Auto-save on trade
    autoSave('trade');
}