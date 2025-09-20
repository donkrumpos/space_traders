function update() {
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

    // Ship controls (Asteroids style)
    if (game.keys['ArrowLeft']) {
        game.ship.angle -= 0.1;
    }
    if (game.keys['ArrowRight']) {
        game.ship.angle += 0.1;
    }

    // Enhanced thrust system with engine upgrade acceleration curves
    updateThrustSystem();

    // Apply current thrust to ship velocity
    if (game.ship.thrust.current > 0) {
        const maxThrust = 0.2; // Base maximum thrust
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
        game.ship.fuel -= baseFuelRate * game.ship.thrust.current * Math.max(0.3, fuelEfficiency);
    }

    // Apply velocity
    game.ship.x += game.ship.velocity.x;
    game.ship.y += game.ship.velocity.y;

    // Apply drag - stronger when near planets for easier docking
    let dragFactor = inDockingRange ? 0.95 : 0.99;
    game.ship.velocity.x *= dragFactor;
    game.ship.velocity.y *= dragFactor;

    // Speed limit
    const maxSpeed = 8;
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

    updateUI();
    updateMaps();
}

function updateThrustSystem() {
    const thrust = game.ship.thrust;
    const deltaTime = 1/60; // Assuming 60 FPS for consistent timing

    // Check thrust input states
    const wantsForwardThrust = game.keys['ArrowUp'] && game.ship.fuel > 0;
    const wantsReverseThrust = game.keys['ArrowDown'] && game.ship.fuel > 0;

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