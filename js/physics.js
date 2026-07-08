function update() {
    // Modal choices (perk training) freeze the world so nobody dies mid-menu
    if (game.paused) return;

    // Check for nearby planets for docking effects
    let nearPlanet = null;
    let inDockingRange = false;

    game.planets.forEach(planet => {
        const distance = Math.sqrt(
            Math.pow(game.ship.x - planet.x, 2) +
            Math.pow(game.ship.y - planet.y, 2)
        );

        if (distance < 60) {
            nearPlanet = planet;
            inDockingRange = true;
        }
    });

    // Variable rotation system for combat precision
    updateRotationSystem();

    // Enhanced thrust system with engine upgrade acceleration curves
    updateThrustSystem();

    // Apply current thrust to ship velocity
    if (game.ship.thrust.current > 0) {
        const isEmergencyMode = game.ship.fuel <= 0 && game.ship.emergencyFuel > 0;
        const baseMaxThrust = 0.2; // Base maximum thrust
        const emergencyThrustReduction = 0.15; // Emergency mode is much weaker (75% reduction)

        // Knocked-out engines limp at 40% thrust (60% with Emergency Thrusters)
        const enginesDamaged = game.ship.systems && game.ship.systems.engines === 'damaged';
        const limpFactor = hasPerk('emergency_thrusters') ? 0.6 : 0.4;
        const maxThrust = (isEmergencyMode ? baseMaxThrust * emergencyThrustReduction : baseMaxThrust)
            * (enginesDamaged ? limpFactor : 1);
        const actualThrust = maxThrust * game.ship.thrust.current;

        if (game.ship.thrust.isThrusting) {
            // Forward thrust
            game.ship.velocity.x += Math.cos(game.ship.angle) * actualThrust;
            game.ship.velocity.y += Math.sin(game.ship.angle) * actualThrust;
        } else if (game.ship.thrust.isReversing) {
            // Reverse thrust (25% of forward thrust)
            const reverseThrust = actualThrust * 0.25;
            game.ship.velocity.x -= Math.cos(game.ship.angle) * reverseThrust;
            game.ship.velocity.y -= Math.sin(game.ship.angle) * reverseThrust;
        }

        // Fuel consumption (improved efficiency with engine upgrades)
        const fuelEfficiency = 1 - (game.ship.upgrades.engine - 1) * 0.1; // 10% better per level
        const baseFuelRate = game.ship.thrust.isReversing ? 0.02 : 0.05;
        const fuelConsumption = baseFuelRate * game.ship.thrust.current * Math.max(0.3, fuelEfficiency)
            * (hasPerk('fuel_sipper') ? 0.8 : 1)
            * (crewHasRole('navigator') ? 0.85 : 1);

        if (game.ship.fuel > 0) {
            // Consume main fuel first
            game.ship.fuel -= fuelConsumption;
            // Prevent fuel from going negative
            if (game.ship.fuel < 0) {
                game.ship.fuel = 0;
            }
        } else if (game.ship.emergencyFuel > 0) {
            // Emergency mode: consume emergency fuel at higher rate (2x consumption)
            const emergencyConsumption = fuelConsumption * 2;
            game.ship.emergencyFuel -= emergencyConsumption;
            // Prevent emergency fuel from going negative
            if (game.ship.emergencyFuel < 0) {
                game.ship.emergencyFuel = 0;
            }
        }
    }

    // Track distance traveled for statistics
    const oldX = game.ship.x;
    const oldY = game.ship.y;

    // Apply velocity
    game.ship.x += game.ship.velocity.x;
    game.ship.y += game.ship.velocity.y;

    // Update distance traveled (for character statistics)
    if (typeof characterManager !== 'undefined' && characterManager.character) {
        const distance = Math.sqrt(
            Math.pow(game.ship.x - oldX, 2) +
            Math.pow(game.ship.y - oldY, 2)
        );
        characterManager.character.progress.distanceTraveled += distance;
    }

    // Apply drag - stronger when near planets for easier docking
    let dragFactor = inDockingRange ? 0.95 : 0.99;
    game.ship.velocity.x *= dragFactor;
    game.ship.velocity.y *= dragFactor;

    // Speed limit — the hull's top end, not a universal constant
    const maxSpeed = shipMaxSpeed();
    const currentSpeed = Math.sqrt(game.ship.velocity.x * game.ship.velocity.x + game.ship.velocity.y * game.ship.velocity.y);
    if (currentSpeed > maxSpeed) {
        game.ship.velocity.x = (game.ship.velocity.x / currentSpeed) * maxSpeed;
        game.ship.velocity.y = (game.ship.velocity.y / currentSpeed) * maxSpeed;
    }

    // Update docking state
    game.nearPlanet = nearPlanet;
    game.inDockingRange = inDockingRange;

    // Update camera to follow ship
    game.camera.x = game.ship.x - game.canvas.width / 2;
    game.camera.y = game.ship.y - game.canvas.height / 2;

    // Update combat systems
    const deltaTime = 1/60; // Assuming 60 FPS
    updateProjectiles(deltaTime);
    updateWeaponCooldowns(deltaTime);
    updateEnemies(deltaTime);
    updateDamageEffects(deltaTime);
    updateEffects(deltaTime);
    updateEconomy(deltaTime);
    updateAsteroids(deltaTime);
    updateDrops(deltaTime);
    updatePowerup(deltaTime);
    updateTraffic(deltaTime);
    updateCrew(deltaTime);

    updateUI();
    updateMaps();
    updateEventSystem();
}

function updateThrustSystem() {
    const thrust = game.ship.thrust;
    const deltaTime = 1/60; // Assuming 60 FPS for consistent timing

    // Check thrust input states (allow emergency thrust when main fuel is depleted)
    const hasMainFuel = game.ship.fuel > 0;
    const hasEmergencyFuel = game.ship.emergencyFuel > 0;
    const canThrust = hasMainFuel || hasEmergencyFuel;

    const wantsForwardThrust = game.keys['ArrowUp'] && canThrust;
    const wantsReverseThrust = game.keys['ArrowDown'] && canThrust;

    // Update thrust state flags
    thrust.isThrusting = wantsForwardThrust;
    thrust.isReversing = wantsReverseThrust;

    // Engine upgrade acceleration curves
    // Level 1: 3 seconds to max (slow, clunky starter engines)
    // Level 2: 2 seconds to max (better industrial thrusters)
    // Level 3: 1 second to max (advanced fusion drives)
    // Level 4+: 0.5 seconds to max (military-grade engines)
    const engineLevel = game.ship.upgrades.engine;
    let rampUpTime, rampDownTime;

    switch(engineLevel) {
        case 1:
            rampUpTime = 3.0;   // Slow, clunky starter engines
            rampDownTime = 2.0;
            break;
        case 2:
            rampUpTime = 2.0;   // Better industrial thrusters
            rampDownTime = 1.5;
            break;
        case 3:
            rampUpTime = 1.0;   // Advanced fusion drives
            rampDownTime = 0.8;
            break;
        default: // Level 4+
            rampUpTime = 0.5;   // Military-grade engines
            rampDownTime = 0.3;
            break;
    }

    // Determine target thrust
    if (wantsForwardThrust || wantsReverseThrust) {
        thrust.target = 1.0;
        thrust.rampUpTime += deltaTime;
        thrust.rampDownTime = 0; // Reset ramp down
    } else {
        thrust.target = 0.0;
        thrust.rampDownTime += deltaTime;
        thrust.rampUpTime = 0; // Reset ramp up
    }

    // Calculate current thrust based on acceleration curve
    if (thrust.target > thrust.current) {
        // Ramping up - smooth acceleration curve
        const progress = Math.min(thrust.rampUpTime / rampUpTime, 1.0);
        // Use easing curve for more natural feel
        const easedProgress = 1 - Math.pow(1 - progress, 2); // Ease-out curve
        thrust.current = easedProgress;
    } else if (thrust.target < thrust.current) {
        // Ramping down - quick deceleration
        const progress = Math.min(thrust.rampDownTime / rampDownTime, 1.0);
        const easedProgress = 1 - Math.pow(1 - progress, 1.5); // Slightly faster ramp down
        thrust.current = 1.0 - easedProgress;
    }

    // Ensure thrust stays in bounds
    thrust.current = Math.max(0, Math.min(1, thrust.current));
}

function updateRotationSystem() {
    const rotation = game.ship.rotation;
    const deltaTime = 1/60; // Assuming 60 FPS for consistent timing

    // Check rotation input states
    const wantsRotateLeft = game.keys['ArrowLeft'];
    const wantsRotateRight = game.keys['ArrowRight'];

    // Update rotation state flags
    rotation.isRotatingLeft = wantsRotateLeft;
    rotation.isRotatingRight = wantsRotateRight;

    // Track hold times for acceleration
    if (wantsRotateLeft) {
        rotation.leftHoldTime += deltaTime;
        rotation.rightHoldTime = 0; // Reset opposite direction
    } else {
        rotation.leftHoldTime = 0;
    }

    if (wantsRotateRight) {
        rotation.rightHoldTime += deltaTime;
        rotation.leftHoldTime = 0; // Reset opposite direction
    } else {
        rotation.rightHoldTime = 0;
    }

    // Calculate rotation speed based on hold time
    let targetRotationSpeed = 0;

    if (wantsRotateLeft || wantsRotateRight) {
        const holdTime = Math.max(rotation.leftHoldTime, rotation.rightHoldTime);

        // Acceleration curve: start with base speed, ramp up to max over 1 second
        const rampTime = 1.0; // 1 second to reach max speed
        const progress = Math.min(holdTime / rampTime, 1.0);

        // Smooth acceleration curve (ease-out)
        const easedProgress = 1 - Math.pow(1 - progress, 2);

        // Calculate speed between base and max, scaled by how nimble the
        // hull is — a freighter turns like a freighter
        targetRotationSpeed = (rotation.baseSpeed + (rotation.maxSpeed - rotation.baseSpeed) * easedProgress)
            * currentHull().agility;

        // Apply direction
        if (wantsRotateLeft) {
            targetRotationSpeed = -targetRotationSpeed;
        }
    }

    // Smooth rotation changes for precise control
    const rotationAcceleration = 0.3; // How quickly rotation speed changes

    if (Math.abs(targetRotationSpeed) > Math.abs(rotation.current)) {
        // Accelerating
        rotation.current = rotation.current + Math.sign(targetRotationSpeed - rotation.current) * rotationAcceleration * deltaTime;
    } else {
        // Decelerating or changing direction
        rotation.current = rotation.current + (targetRotationSpeed - rotation.current) * 0.8; // Quick deceleration
    }

    // Apply rotation to ship
    game.ship.angle += rotation.current;

    // Normalize angle to prevent floating point issues
    game.ship.angle = game.ship.angle % (Math.PI * 2);
}