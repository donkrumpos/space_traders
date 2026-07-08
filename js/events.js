// Spatial Event System for Space Trading Game

// Event system state
const eventSystem = {
    activeEvents: [], // Array of event objects in space
    eventCooldown: 0,
    minEventInterval: 300, // Minimum frames between events (5 seconds at 60fps)
    travelDistance: 0, // Track distance traveled since last event
    eventTriggerDistance: 0, // Distance needed to trigger next event
    nearEvent: null, // Currently nearby event
    inEventRange: false
};

// Event object definitions for spatial spawning
const eventTypes = {
    derelictShip: {
        name: "Derelict Ship",
        probability: 0.25,
        size: 12,
        color: '#666666',
        symbol: '🚢',
        description: "A drifting derelict vessel. Investigating might yield valuable salvage.",
        interactionText: "Investigate Derelict Ship",
        fuelCost: 50,
        action: "investigateDerelict"
    },
    fuelDepot: {
        name: "Fuel Depot",
        probability: 0.2,
        size: 15,
        color: '#FFD700',
        symbol: '⛽',
        description: "An automated fuel depot offering emergency refueling at premium prices.",
        interactionText: "Access Fuel Depot",
        fuelCost: 0,
        action: "accessFuelDepot"
    },
    distressBeacon: {
        name: "Distress Beacon",
        probability: 0.25,
        size: 8,
        color: '#FF6B6B',
        symbol: '🆘',
        description: "A distress beacon signals for help. Someone needs assistance.",
        interactionText: "Respond to Distress Call",
        fuelCost: 40,
        action: "respondDistress"
    }
};

function initializeEventSystem() {
    // Set up initial event timing
    eventSystem.eventTriggerDistance = 200 + Math.random() * 400; // 200-600 units
}

function updateEventSystem() {
    // Don't spawn new events while docked
    if (game.isDocked) {
        return;
    }

    // Track travel distance for event spawning
    const speed = Math.sqrt(game.ship.velocity.x * game.ship.velocity.x + game.ship.velocity.y * game.ship.velocity.y);
    eventSystem.travelDistance += speed;

    // Update cooldown
    if (eventSystem.eventCooldown > 0) {
        eventSystem.eventCooldown--;
    }

    // Check proximity to existing events
    checkEventProximity();

    // Remove events that are too far away
    cleanupDistantEvents();

    // Check if we should spawn a new event
    if (eventSystem.travelDistance >= eventSystem.eventTriggerDistance &&
        eventSystem.eventCooldown <= 0 &&
        speed > 1) { // Only when actually moving

        // Higher chance at higher speeds (risk/reward for fast travel)
        const baseChance = 0.4;
        const speedBonus = Math.min(speed / 8, 1) * 0.2; // Up to 20% bonus for max speed
        const eventChance = baseChance + speedBonus;

        if (Math.random() < eventChance) {
            spawnRandomEvent();
        }

        // Reset distance tracking
        eventSystem.travelDistance = 0;
        eventSystem.eventTriggerDistance = 150 + Math.random() * 300; // Slightly more frequent
    }
}

function checkEventProximity() {
    let nearEvent = null;
    let inEventRange = false;

    eventSystem.activeEvents.forEach(event => {
        const distance = Math.sqrt(
            Math.pow(game.ship.x - event.x, 2) +
            Math.pow(game.ship.y - event.y, 2)
        );

        if (distance < 60) { // Same range as planet docking
            nearEvent = event;
            inEventRange = true;
        }
    });

    eventSystem.nearEvent = nearEvent;
    eventSystem.inEventRange = inEventRange;
}

function cleanupDistantEvents() {
    // Remove events that are too far from the ship
    eventSystem.activeEvents = eventSystem.activeEvents.filter(event => {
        const distance = Math.sqrt(
            Math.pow(game.ship.x - event.x, 2) +
            Math.pow(game.ship.y - event.y, 2)
        );
        return distance < 2000; // Remove if more than 2000 units away
    });
}

function spawnRandomEvent() {
    // Calculate probabilities based on current situation
    const availableEvents = [];

    Object.keys(eventTypes).forEach(eventType => {
        const event = eventTypes[eventType];
        availableEvents.push({
            type: eventType,
            event: event,
            weight: event.probability
        });
    });

    // Weighted random selection
    const totalWeight = availableEvents.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;

    for (let eventOption of availableEvents) {
        random -= eventOption.weight;
        if (random <= 0) {
            createSpatialEvent(eventOption.type, eventOption.event);
            break;
        }
    }
}

function createSpatialEvent(eventType, eventData) {
    // Find a valid spawn location that doesn't conflict with planets
    let attempts = 0;
    let validLocation = false;
    let eventX, eventY;

    const minDistanceFromPlanets = 150; // Minimum distance from any planet
    const spawnDistance = 300 + Math.random() * 200; // 300-500 units ahead

    while (!validLocation && attempts < 10) {
        attempts++;
        const angle = game.ship.angle + (Math.random() - 0.5) * 0.8; // Slight angle variation

        eventX = game.ship.x + Math.cos(angle) * spawnDistance;
        eventY = game.ship.y + Math.sin(angle) * spawnDistance;

        // Check distance to all planets
        validLocation = true;
        for (let planet of game.planets) {
            const distanceToPlanet = Math.sqrt(
                Math.pow(eventX - planet.x, 2) +
                Math.pow(eventY - planet.y, 2)
            );

            if (distanceToPlanet < minDistanceFromPlanets) {
                validLocation = false;
                break;
            }
        }
    }

    // If we couldn't find a valid location, don't spawn this event
    if (!validLocation) {
        console.log(`Event ${eventType} not spawned - too close to planets`);
        return;
    }

    const eventObject = {
        id: Date.now() + Math.random(), // Unique ID
        type: eventType,
        data: eventData,
        x: eventX,
        y: eventY,
        name: eventData.name,
        size: eventData.size,
        color: eventData.color,
        symbol: eventData.symbol,
        description: eventData.description,
        interactionText: eventData.interactionText,
        fuelCost: eventData.fuelCost,
        action: eventData.action,
        isInteracted: false
    };

    eventSystem.activeEvents.push(eventObject);
    eventSystem.eventCooldown = eventSystem.minEventInterval;
}

// Function to interact with spatial events (called when player presses space near event)
function interactWithEvent(eventObj) {
    // Use the side panel interface like planet docking
    engageWithEvent(eventObj);
}

function engageWithEvent(eventObj) {
    // Mark as engaged with event (similar to docking)
    game.isEngaged = true;
    game.currentEvent = eventObj;

    // Stop the ship
    game.ship.velocity.x = 0;
    game.ship.velocity.y = 0;

    // Expand UI panel and show event interaction
    document.getElementById('ui').classList.add('trading');
    document.getElementById('eventPanel').style.display = 'block';

    // Resize canvas to account for expanded UI
    setTimeout(() => {
        resizeCanvas();
    }, 300); // Wait for CSS transition

    // Populate event interface
    updateEventInterface(eventObj);
}

function disengage() {
    // Exit event interaction (similar to undocking)
    game.isEngaged = false;
    game.currentEvent = null;

    // Collapse UI panel and hide event interaction
    document.getElementById('ui').classList.remove('trading');
    document.getElementById('eventPanel').style.display = 'none';

    // Resize canvas back
    setTimeout(() => {
        resizeCanvas();
    }, 300); // Wait for CSS transition
}

function updateEventInterface(eventObj) {
    document.getElementById('eventTitle').textContent = eventObj.name;
    document.getElementById('eventInfo').textContent = `Type: ${eventObj.type} | Status: ENGAGED`;

    // Set description
    document.getElementById('eventDescription').textContent = eventObj.description;

    // Generate and display action choices
    const choices = generateEventChoices(eventObj);
    const actionsContainer = document.getElementById('eventActions');
    actionsContainer.innerHTML = '';

    choices.forEach(choice => {
        const actionItem = document.createElement('div');
        actionItem.className = 'trade-item';
        actionItem.style.marginBottom = '10px';

        const isEnabled = choice.enabled;
        const textColor = isEnabled ? '#ffffff' : '#666666';
        const detailColor = isEnabled ? '#cccccc' : '#555555';

        // Extract main action and details from choice text
        const parts = choice.text.split('<br>');
        const mainAction = parts[0];
        const details = parts[1] ? parts[1].replace('<small>', '').replace('</small>', '') : '';

        actionItem.innerHTML = `
            <div style="flex: 1;">
                <div style="color: ${textColor}; font-weight: bold;">${mainAction}</div>
                ${details ? `<div style="color: ${detailColor}; font-size: 10px; margin-top: 2px;">${details}</div>` : ''}
            </div>
            <button onclick="executeEventAction('${choice.action}')"
                    ${!isEnabled ? 'disabled' : ''}
                    style="background: ${isEnabled ? '#004400' : '#333333'};
                           color: ${isEnabled ? '#00ff00' : '#666666'};">
                ${choice.action === 'decline' ? 'Pass' : 'Choose'}
            </button>
        `;

        actionsContainer.appendChild(actionItem);
    });
}

function generateEventChoices(eventObj) {
    const choices = [];
    const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
    const cargoSpace = game.ship.cargoMax - cargoUsed;

    switch(eventObj.type) {
        case 'derelictShip':
            choices.push({
                text: `🔍 Investigate Ship<br><small>Cost: 50 fuel | Potential rewards: Credits, materials, fuel</small>`,
                action: 'investigate',
                enabled: game.ship.fuel >= 50
            });
            choices.push({
                text: `🛫 Leave it alone<br><small>Continue journey without investigation</small>`,
                action: 'decline',
                enabled: true
            });
            break;

        case 'fuelDepot':
            const fuelNeeded = game.ship.fuelMax - game.ship.fuel;
            const fullCost = fuelNeeded * 6;
            const halfFuel = Math.floor(fuelNeeded / 2);
            const halfCost = halfFuel * 6;

            if (fuelNeeded > 0) {
                choices.push({
                    text: `⛽ Fill tank completely<br><small>Cost: ${fullCost} credits | +${fuelNeeded} fuel</small>`,
                    action: 'fuel_full',
                    enabled: game.ship.credits >= fullCost
                });
                if (halfFuel > 0) {
                    choices.push({
                        text: `⛽ Buy half tank<br><small>Cost: ${halfCost} credits | +${halfFuel} fuel</small>`,
                        action: 'fuel_half',
                        enabled: game.ship.credits >= halfCost
                    });
                }
            }
            choices.push({
                text: `🛫 Decline purchase<br><small>Continue with current fuel: ${Math.floor(game.ship.fuel)}</small>`,
                action: 'decline',
                enabled: true
            });
            break;

        case 'distressBeacon':
            choices.push({
                text: `🚑 Respond to distress call<br><small>Cost: 40 fuel | Potential rewards: Credits, cargo, reputation</small>`,
                action: 'respond',
                enabled: game.ship.fuel >= 40
            });
            choices.push({
                text: `🛫 Ignore the signal<br><small>Continue journey without helping</small>`,
                action: 'decline',
                enabled: true
            });
            break;
    }

    return choices;
}

function executeEventAction(action) {
    const eventObj = game.currentEvent;

    if (action === 'decline') {
        showEventMessage("You continue your journey, leaving the " + eventObj.name.toLowerCase() + " behind.");
        disengage();
        return;
    }

    // Remove event from space
    eventObj.isInteracted = true;
    eventSystem.activeEvents = eventSystem.activeEvents.filter(e => e.id !== eventObj.id);

    // Execute the chosen action
    const result = executeSpecificAction(eventObj, action);
    showEventMessage(result.message);

    // Apply rewards with cargo space checking
    applyEventRewardsWithChecking(result.rewards);

    // Disengage after action
    disengage();
}

function executeSpecificAction(eventObj, action) {
    switch(eventObj.type) {
        case 'derelictShip':
            if (action === 'investigate') {
                return eventActions.investigateDerelict();
            }
            break;

        case 'fuelDepot':
            if (action === 'fuel_full') {
                const fuelNeeded = game.ship.fuelMax - game.ship.fuel;
                const cost = fuelNeeded * 6;
                game.ship.credits -= cost;
                game.ship.fuel = game.ship.fuelMax;
                return { message: `Tank filled completely! You paid ${cost} credits for ${fuelNeeded} units of fuel.`, rewards: {} };
            } else if (action === 'fuel_half') {
                const halfFuel = Math.floor((game.ship.fuelMax - game.ship.fuel) / 2);
                const cost = halfFuel * 6;
                game.ship.credits -= cost;
                game.ship.fuel += halfFuel;
                return { message: `Partial refuel complete! You paid ${cost} credits for ${halfFuel} units of fuel.`, rewards: {} };
            }
            break;

        case 'distressBeacon':
            if (action === 'respond') {
                return eventActions.respondDistress();
            }
            break;
    }

    return { message: "Something went wrong with the event action.", rewards: {} };
}

function applyEventRewards(rewards) {
    if (rewards.credits) {
        game.ship.credits += rewards.credits;
    }
    if (rewards.fuel) {
        game.ship.fuel = Math.min(game.ship.fuelMax, game.ship.fuel + rewards.fuel);
    }
    if (rewards.hull) {
        game.ship.hull = Math.max(0, Math.min(game.ship.hullMax, game.ship.hull + rewards.hull));
    }
    if (rewards.cargo) {
        Object.keys(rewards.cargo).forEach(goodType => {
            game.ship.cargo[goodType] = (game.ship.cargo[goodType] || 0) + rewards.cargo[goodType];
        });
    }
}

function applyEventRewardsWithChecking(rewards) {
    if (rewards.credits) {
        game.ship.credits += rewards.credits;
    }
    if (rewards.fuel) {
        game.ship.fuel = Math.min(game.ship.fuelMax, game.ship.fuel + rewards.fuel);
    }
    if (rewards.hull) {
        game.ship.hull = Math.max(0, Math.min(game.ship.hullMax, game.ship.hull + rewards.hull));
    }
    if (rewards.cargo) {
        const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
        const cargoSpace = game.ship.cargoMax - cargoUsed;

        let totalItemsToAdd = 0;
        Object.values(rewards.cargo).forEach(amount => {
            totalItemsToAdd += amount;
        });

        if (totalItemsToAdd > cargoSpace) {
            // Show choice dialog for what to take
            showCargoChoiceDialog(rewards.cargo, cargoSpace);
        } else {
            // Enough space, add everything
            Object.keys(rewards.cargo).forEach(goodType => {
                game.ship.cargo[goodType] = (game.ship.cargo[goodType] || 0) + rewards.cargo[goodType];
            });
        }
    }
}

function showCargoChoiceDialog(cargoRewards, availableSpace) {
    const overlay = document.createElement('div');
    overlay.id = 'cargoChoiceOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.8);
        z-index: 2001;
        display: flex;
        justify-content: center;
        align-items: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: #001100;
        border: 3px solid #ffaa00;
        padding: 25px;
        max-width: 450px;
        font-family: 'Courier New', monospace;
        color: #00ff00;
        text-align: center;
    `;

    const totalItems = Object.values(cargoRewards).reduce((a, b) => a + b, 0);

    dialog.innerHTML = `
        <h2 style="color: #ffaa00; margin: 10px 0;">⚠️ Cargo Hold Full!</h2>
        <p style="color: #ffffff; line-height: 1.5; margin: 15px 0;">
            Found ${totalItems} items but only ${availableSpace} cargo space available.
            Choose what to take:
        </p>
        <div id="cargoChoices" style="margin: 20px 0;"></div>
        <button onclick="closeCargoChoiceDialog()" style="
            background: #333333;
            color: #888888;
            border: 1px solid #666666;
            padding: 10px 15px;
            margin-top: 10px;
            cursor: pointer;
            font-family: 'Courier New', monospace;
        ">Leave everything behind</button>
    `;

    const choicesContainer = dialog.querySelector('#cargoChoices');

    Object.keys(cargoRewards).forEach(goodType => {
        const amount = cargoRewards[goodType];
        const maxTakeable = Math.min(amount, availableSpace);

        for (let i = 1; i <= maxTakeable; i++) {
            const button = document.createElement('button');
            button.textContent = `Take ${i}x ${goods[goodType].name}`;
            button.style.cssText = `
                background: #004400;
                color: #00ff00;
                border: 1px solid #00ff00;
                padding: 8px 12px;
                margin: 3px;
                cursor: pointer;
                font-family: 'Courier New', monospace;
                font-size: 10px;
                display: inline-block;
            `;

            button.onmouseover = () => button.style.background = '#006600';
            button.onmouseout = () => button.style.background = '#004400';
            button.onclick = () => {
                game.ship.cargo[goodType] = (game.ship.cargo[goodType] || 0) + i;
                showEventMessage(`You took ${i}x ${goods[goodType].name} and left the rest behind.`);
                closeCargoChoiceDialog();
                updateUI();
            };

            choicesContainer.appendChild(button);
        }
    });

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

function closeCargoChoiceDialog() {
    const overlay = document.getElementById('cargoChoiceOverlay');
    if (overlay) {
        overlay.remove();
    }
}

function showEventMessage(message) {
    // Simple message display - could be enhanced later
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #001100;
        border: 2px solid #00ff00;
        padding: 15px;
        color: #00ff00;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        z-index: 1000;
        max-width: 400px;
        text-align: center;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    // Remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 3000);
}

// Event action implementations for spatial interaction
const eventActions = {
    investigateDerelict: () => {
        game.ship.fuel -= 50;

        const outcomes = [
            {
                probability: 0.4,
                message: "You board the derelict ship and find valuable technology components!",
                rewards: { credits: 200 + Math.floor(Math.random() * 300) }
            },
            {
                probability: 0.3,
                message: "The ship's cargo hold contains rare materials!",
                rewards: { cargo: { materials: 2 } }
            },
            {
                probability: 0.2,
                message: "You discover intact emergency fuel reserves!",
                rewards: { fuel: 100 }
            },
            {
                probability: 0.1,
                message: "The derelict ship's systems are completely fried. Nothing salvageable remains.",
                rewards: {}
            }
        ];

        return getRandomOutcome(outcomes);
    },

    accessFuelDepot: () => {
        const fuelNeeded = game.ship.fuelMax - game.ship.fuel;
        const cost = fuelNeeded * 6; // 3x normal price

        if (game.ship.credits >= cost && fuelNeeded > 0) {
            game.ship.credits -= cost;
            game.ship.fuel = game.ship.fuelMax;
            return {
                message: `Emergency refuel complete! You paid ${cost} credits for ${fuelNeeded} units of fuel.`,
                rewards: {}
            };
        } else if (fuelNeeded === 0) {
            return {
                message: "Your fuel tank is already full. The automated depot politely declines the transaction.",
                rewards: {}
            };
        } else {
            return {
                message: `Insufficient credits! You need ${cost} credits for emergency refueling.`,
                rewards: {}
            };
        }
    },

    respondDistress: () => {
        game.ship.fuel -= 40;

        const outcomes = [
            {
                probability: 0.5,
                message: "You successfully rescue the stranded traders! They reward you generously for your heroism.",
                rewards: { credits: 300 + Math.floor(Math.random() * 200) }
            },
            {
                probability: 0.3,
                message: "The rescue operation succeeds! The grateful crew shares valuable cargo with you.",
                rewards: { cargo: { luxury: 1, food: 1 } }
            },
            {
                probability: 0.2,
                message: "You help repair their damaged ship. They give you spare parts and emergency fuel as thanks.",
                rewards: { fuel: 80, credits: 100 }
            }
        ];

        return getRandomOutcome(outcomes);
    }
};

function getRandomOutcome(outcomes) {
    const totalProbability = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
    let random = Math.random() * totalProbability;

    for (let outcome of outcomes) {
        random -= outcome.probability;
        if (random <= 0) {
            return outcome;
        }
    }

    return outcomes[0]; // Fallback
}

// Removed old modal UI functions - now using spatial interaction system

// Initialize when the game starts
function initEvents() {
    initializeEventSystem();
}

// Make functions globally accessible
window.closeCargoChoiceDialog = closeCargoChoiceDialog;
window.disengage = disengage;
window.executeEventAction = executeEventAction;