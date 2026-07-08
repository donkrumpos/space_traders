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

    // First landfall on a new world is explorer XP
    const visited = characterManager.character &&
        characterManager.character.progress.planetsVisited;
    if (visited && !visited.includes(planet.name)) {
        addXP(25, 'discovery');
    }

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

    // Customs scan at lawful ports: 35% chance contraband is found,
    // seized, and fined at $100/unit. Frontier Outpost doesn't ask questions.
    if (!planet.lawless && (game.ship.cargo.contraband || 0) > 0 && Math.random() < 0.35) {
        const seized = game.ship.cargo.contraband;
        delete game.ship.cargo.contraband;
        const fine = Math.min(game.ship.credits, seized * 100);
        game.ship.credits -= fine;
        showHudFeedback(`CUSTOMS SCAN — ${seized} contraband seized, fined $${fine}!`, 'error', 6000);
    }

    // Station crews bring knocked-out subsystems back online while you're berthed
    const systems = game.ship.systems || {};
    const knocked = Object.keys(systems).filter(s => systems[s] === 'damaged');
    if (knocked.length > 0) {
        knocked.forEach(s => { systems[s] = 'ok'; });
        showHudFeedback('Station crews bring your systems back online', 'success', 3500);
    }

    // Economy: markets drift while you fly, this station's prices get recorded,
    // deliveries pay out, fresh contracts are posted, and your bounty streak ends
    driftMarkets();
    completeMissionsAt(planet);
    recordLedger(planet);
    generateMissionOffers(planet);
    generateBountyOffer(planet);
    generateEscortOffer(planet);
    generateCrewOffers(planet);
    game.combatStreak = 0;

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
    document.getElementById('stationInfo').innerHTML =
        `Type: ${planet.type} | Status: DOCKED` +
        (planet.blurb ? `<br><em style="color:#889988;">${planet.blurb}</em>` : '');

    // Update buying section (what the station sells)
    updateBuyingSectionUI();

    // Update selling section (what the station buys)
    updateSellingSectionUI();

    // Update mission board
    updateMissionBoardUI(planet);

    // Update crew-for-hire section
    updateCrewSectionUI(planet);

    // Update upgrades section
    updateUpgradesUI(planet);

    // Update weapon systems shop
    updateWeaponSystemsUI(planet);

    // Update fuel cost
    updateFuelCost();
    updateFuelButton();

    // Update missile cost
    updateMissileCost();

    // Update repair cost
    updateRepairCost();
}

function updateBuyingSectionUI() {
    const buyingSection = document.getElementById('buyingSection');
    const planet = game.currentPlanet;
    if (!planet) return;

    buyingSection.innerHTML = '';
    Object.keys(planet.produces).forEach(goodType => {
        const base = planet.produces[goodType];
        const price = getBuyPrice(planet, goodType);
        // For buying, above-base is bad (red), below-base is a deal (green)
        const trend = price > base * 1.05 ? ' <span style="color:#ff6666;">▲</span>'
                    : price < base * 0.95 ? ' <span style="color:#66ff66;">▼</span>' : '';
        const illegal = goodType === 'contraband' ? ' <span style="color:#ff44cc;">⚠</span>' : '';
        buyingSection.innerHTML += `<div class="trade-item">
            <span>${goods[goodType].name}${illegal}</span>
            <span>$${price}${trend}</span>
            <span class="qty-buttons">
                <button onclick="buyGood('${goodType}', 1)">+1</button>
                <button onclick="buyGood('${goodType}', 5)">+5</button>
                <button onclick="buyGood('${goodType}', 'max')">Max</button>
            </span>
        </div>`;
    });

    if (Object.keys(planet.produces).length === 0) {
        buyingSection.innerHTML = '<div style="color: #666;">Nothing for sale</div>';
    }
}

function updateSellingSectionUI() {
    const sellingSection = document.getElementById('sellingSection');
    const planet = game.currentPlanet;

    sellingSection.innerHTML = '';
    Object.keys(planet.demands).forEach(goodType => {
        const base = planet.demands[goodType];
        const price = getSellPrice(planet, goodType);
        // For selling, above-base is a windfall (green), below-base is weak (red)
        const trend = price > base * 1.05 ? ' <span style="color:#66ff66;">▲</span>'
                    : price < base * 0.95 ? ' <span style="color:#ff6666;">▼</span>' : '';
        const playerHas = game.ship.cargo[goodType] || 0;
        const off = playerHas === 0 ? 'disabled' : '';
        const illegal = goodType === 'contraband' ? ' <span style="color:#ff44cc;">⚠</span>' : '';
        sellingSection.innerHTML += `<div class="trade-item">
            <span>${goods[goodType].name}${illegal} (You have: ${playerHas})</span>
            <span>$${price}${trend}</span>
            <span class="qty-buttons">
                <button onclick="sellGood('${goodType}', 1)" ${off}>-1</button>
                <button onclick="sellGood('${goodType}', 5)" ${off}>-5</button>
                <button onclick="sellGood('${goodType}', 'all')" ${off}>All</button>
            </span>
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
        showHudFeedback(`Insufficient credits! Need $${cost} for this upgrade.`, 'error');
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
            // +20 regenerating shield points per level, refilled on purchase
            // (recomputed from scratch, so perk bonuses must be re-added)
            game.ship.shieldMax = 20 * game.ship.upgrades.shields + (hasPerk('deflector_tuning') ? 10 : 0);
            game.ship.shield = game.ship.shieldMax;
            break;
        case 'weapons':
            // Weapon upgrades improve damage and missile capacity
            const level = game.ship.upgrades.weapons;
            game.ship.weapons.missiles.maxAmmo = 5 + (level - 1) * 3 + (hasPerk('missile_racks') ? 3 : 0);
            game.ship.weapons.missiles.ammo = Math.min(game.ship.weapons.missiles.ammo + 3, game.ship.weapons.missiles.maxAmmo);
            break;
    }
}

function buyFuel() {
    const fuelNeeded = game.ship.fuelMax - Math.floor(game.ship.fuel);
    if (fuelNeeded === 0) {
        showHudFeedback('Fuel tank is already full!', 'info');
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
        showHudFeedback(`Partial refuel: Added ${actualFuelToBuy} fuel units for $${actualCost}`, 'success');
    } else {
        // Can't afford any fuel
        showHudFeedback('Insufficient credits! Need at least $2 for 1 fuel unit.', 'error');
        return;
    }

    updateUI();
    updateFuelCost(); // Refresh fuel cost display
    updateFuelButton(); // Refresh button text
}

function buyMissiles() {
    const missilesNeeded = game.ship.weapons.missiles.maxAmmo - game.ship.weapons.missiles.ammo;
    if (missilesNeeded === 0) {
        showHudFeedback('Missile bay is already full!', 'info');
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
        showHudFeedback(`Partial rearm: Added ${actualMissilesToBuy} missiles for $${actualCost}`, 'success');
    } else {
        showHudFeedback('Insufficient credits! Need at least $50 for 1 missile.', 'error');
        return;
    }

    updateUI();
    updateMissileCost(); // Refresh missile cost display
}

function buyGood(goodType, qty = 1) {
    const planet = game.currentPlanet;
    if (!planet) return;
    const price = getBuyPrice(planet, goodType);

    const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
    const spaceLeft = game.ship.cargoMax - cargoUsed;
    const affordable = Math.floor(game.ship.credits / price);

    if (spaceLeft <= 0) {
        showHudFeedback('Cargo hold is full!', 'error');
        return;
    }
    if (affordable <= 0) {
        showHudFeedback('Insufficient credits!', 'error');
        return;
    }

    const wanted = qty === 'max' ? Infinity : qty;
    const amount = Math.min(wanted, spaceLeft, affordable);
    const totalCost = amount * price;

    game.ship.credits -= totalCost;
    game.ship.cargo[goodType] = (game.ship.cargo[goodType] || 0) + amount;

    // Your purchase tightens local supply — the price creeps up
    applyTradeImpact(planet, goodType, 'buy', amount);

    if (amount > 1) {
        showHudFeedback(`Bought ${amount} ${goods[goodType].name} for $${totalCost}`, 'success');
    } else if (qty !== 1 && amount === 1) {
        showHudFeedback(`Only room/credits for 1 ${goods[goodType].name} ($${totalCost})`, 'warning');
    }

    updateUI();
    updateBuyingSectionUI(); // Prices moved
    updateSellingSectionUI(); // Refresh the selling section with new cargo
    updateMissionsUI(); // Cargo counts toward contracts
    updateFuelCost(); // Refresh fuel options
    updateFuelButton();

    // Auto-save on trade
    autoSave('trade');
}

function sellGood(goodType, qty = 1) {
    const planet = game.currentPlanet;
    if (!planet) return;
    const price = getSellPrice(planet, goodType);

    const playerHas = game.ship.cargo[goodType] || 0;
    if (playerHas === 0) {
        showHudFeedback('You don\'t have any ' + goods[goodType].name + '!', 'error');
        return;
    }

    const amount = qty === 'all' ? playerHas : Math.min(qty, playerHas);
    const totalEarned = amount * price;

    game.ship.credits += totalEarned;
    game.ship.cargo[goodType] -= amount;
    if (game.ship.cargo[goodType] === 0) {
        delete game.ship.cargo[goodType];
    }

    // Flooding the market drives the price down
    applyTradeImpact(planet, goodType, 'sell', amount);

    if (amount > 1) {
        showHudFeedback(`Sold ${amount} ${goods[goodType].name} for $${totalEarned}`, 'success');
    }
    flashCredits();
    addXP(totalEarned / 50, 'trade');

    updateUI();
    updateBuyingSectionUI(); // Prices moved
    updateSellingSectionUI(); // Refresh the selling section
    updateMissionsUI(); // Cargo counts toward contracts
    updateFuelCost(); // Refresh fuel options
    updateFuelButton();

    // Auto-save on trade
    autoSave('trade');
}

const WEAPON_SYSTEM_PRICES = { double: 1200, spread: 2600, seeker: 4200 };

function updateWeaponSystemsUI(planet) {
    const el = document.getElementById('weaponSystemsSection');
    if (!el || !planet) return;
    const stocked = planet.weaponSystems || [];
    const owned = game.ship.weapons.lasers.owned || ['single'];

    // Every station's gunsmith can tune what you own; new systems only where stocked
    const rows = ['single', 'double', 'spread', 'seeker']
        .filter(mode => owned.includes(mode) || stocked.includes(mode))
        .map(mode => {
            const spec = LASER_MODES[mode];

            if (!owned.includes(mode)) {
                const cost = WEAPON_SYSTEM_PRICES[mode];
                // Seeker tech is precursor-grade: needs ship Weapons Lv3 to mount
                const gated = mode === 'seeker' && game.ship.upgrades.weapons < 3;
                const note = gated ? 'Requires ship Weapons Lv3' : spec.blurb;
                return `<div class="trade-item">
                    <span>${spec.label} Lasers<br><small style="color:${gated ? '#cc8866' : '#888'};">${note}</small></span>
                    <span>$${cost}</span>
                    <button onclick="buyWeaponSystem('${mode}', ${cost})" ${gated || game.ship.credits < cost ? 'disabled' : ''}>Buy</button>
                </div>`;
            }

            const level = getLaserLevel(mode);
            const tree = LASER_TREE[mode];
            if (level >= tree.maxLevel) {
                return `<div class="trade-item">
                    <span>${spec.label} Lasers Lv${level}<br><small style="color:#888;">${spec.blurb}</small></span>
                    <span style="color:#66ffcc;">MAX</span>
                </div>`;
            }
            const target = level + 1;
            const cost = laserUpgradeCost(mode, target);
            const locked = tree.prereq && !tree.prereq(target);
            const note = locked ? `Lv${target} requires ${tree.prereqLabel(target)}` : `Lv${target}: bigger, harder-hitting bolts`;
            return `<div class="trade-item">
                <span>${spec.label} Lasers Lv${level}<br><small style="color:${locked ? '#cc8866' : '#888'};">${note}</small></span>
                <span>$${cost}</span>
                <button onclick="buyLaserUpgrade('${mode}')" ${locked || game.ship.credits < cost ? 'disabled' : ''}>Upgrade</button>
            </div>`;
        });

    el.innerHTML = rows.join('') || '<div style="color:#666;">None sold here</div>';
}

function buyWeaponSystem(mode, cost) {
    const lasers = game.ship.weapons.lasers;
    if ((lasers.owned || []).includes(mode)) return;
    if (mode === 'seeker' && game.ship.upgrades.weapons < 3) {
        showHudFeedback('Seeker guidance needs ship Weapons Lv3 to mount', 'error');
        return;
    }
    if (game.ship.credits < cost) {
        showHudFeedback(`Insufficient credits! Need $${cost}.`, 'error');
        return;
    }
    game.ship.credits -= cost;
    if (!lasers.owned) lasers.owned = ['single'];
    lasers.owned.push(mode);
    if (!lasers.levels) lasers.levels = {};
    lasers.levels[mode] = 1;
    lasers.mode = mode; // Equip the new toy immediately
    showHudFeedback(`${LASER_MODES[mode].label} lasers installed — Z to switch systems`, 'success', 3500);
    updateUI();
    updateWeaponSystemsUI(game.currentPlanet);
    autoSave('upgrade');
}

function buyLaserUpgrade(mode) {
    const lasers = game.ship.weapons.lasers;
    if (!lasers.levels) lasers.levels = {};
    const level = getLaserLevel(mode);
    const tree = LASER_TREE[mode];
    if (level >= tree.maxLevel) return;

    const target = level + 1;
    if (tree.prereq && !tree.prereq(target)) {
        showHudFeedback(`${LASER_MODES[mode].label} Lv${target} requires ${tree.prereqLabel(target)} first`, 'error');
        return;
    }
    const cost = laserUpgradeCost(mode, target);
    if (game.ship.credits < cost) {
        showHudFeedback(`Insufficient credits! Need $${cost}.`, 'error');
        return;
    }
    game.ship.credits -= cost;
    lasers.levels[mode] = target;
    showHudFeedback(`${LASER_MODES[mode].label} lasers tuned to Lv${target}`, 'success', 3000);
    updateUI();
    updateWeaponSystemsUI(game.currentPlanet);
    autoSave('upgrade');
}

// Field repair: burn one Repair Kit (cargo good 'parts') to fix the most
// urgent knocked-out subsystem. Triage order: life support, engines, lasers.
function fieldRepair() {
    const systems = game.ship.systems || {};
    const damaged = ['lifeSupport', 'engines', 'lasers'].filter(s => systems[s] === 'damaged');
    if (damaged.length === 0) {
        showHudFeedback('All systems nominal', 'info', 1500);
        return;
    }
    const kits = game.ship.cargo.parts || 0;
    if (kits <= 0) {
        showHudFeedback('No Repair Kits aboard — stock up at industrial stations', 'error', 3500);
        return;
    }
    game.ship.cargo.parts--;
    if (game.ship.cargo.parts === 0) delete game.ship.cargo.parts;
    const fixed = damaged[0];
    systems[fixed] = 'ok';
    spawnFloater(game.ship.x, game.ship.y - 30, SUBSYSTEMS[fixed].label + ' RESTORED', '#66ff88', 15);
    showHudFeedback(`${SUBSYSTEMS[fixed].label} back online (${kits - 1} kit${kits - 1 === 1 ? '' : 's'} left)`, 'success', 3000);
    playPickupSound();
    updateUI();
    autoSave('repair');
}

function updateRepairCost() {
    const label = document.getElementById('repairCost');
    const button = document.querySelector('button[onclick="buyRepair()"]');
    if (!label || !button) return;

    const needed = game.ship.hullMax - Math.floor(game.ship.hull);
    const fullCost = needed * 2; // $2 per hull point

    if (needed === 0) {
        label.textContent = 'Hull OK';
        button.textContent = 'Repaired';
        button.disabled = true;
    } else if (game.ship.credits >= fullCost) {
        label.textContent = '$' + fullCost;
        button.textContent = 'Repair All';
        button.disabled = false;
    } else if (game.ship.credits >= 2) {
        const points = Math.min(Math.floor(game.ship.credits / 2), needed);
        label.textContent = `$${points * 2} (${points} pts)`;
        button.textContent = `Repair ${points}`;
        button.disabled = false;
    } else {
        label.textContent = 'Need $2 min';
        button.textContent = 'No Credits';
        button.disabled = true;
    }
}

function buyRepair() {
    const needed = game.ship.hullMax - Math.floor(game.ship.hull);
    if (needed === 0) {
        showHudFeedback('Hull already at full integrity', 'info');
        return;
    }
    const points = Math.min(needed, Math.floor(game.ship.credits / 2));
    if (points <= 0) {
        showHudFeedback('Insufficient credits! Repairs cost $2 per hull point.', 'error');
        return;
    }
    game.ship.credits -= points * 2;
    game.ship.hull += points;
    showHudFeedback(`Hull repaired +${points} for $${points * 2}`, 'success');
    updateUI();
    updateRepairCost();
    updateFuelCost();
    updateFuelButton();
}