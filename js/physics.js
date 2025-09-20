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
    if (game.keys['ArrowUp'] && game.ship.fuel > 0) {
        const thrust = 0.2;
        game.ship.velocity.x += Math.cos(game.ship.angle) * thrust;
        game.ship.velocity.y += Math.sin(game.ship.angle) * thrust;

        // Improved fuel efficiency with engine upgrades
        const fuelEfficiency = 1 - (game.ship.upgrades.engine - 1) * 0.1; // 10% better per level
        game.ship.fuel -= 0.05 * Math.max(0.3, fuelEfficiency); // Minimum 30% fuel usage
    }

    // Reverse thrust (much weaker)
    if (game.keys['ArrowDown'] && game.ship.fuel > 0) {
        const reverseThrust = 0.05; // Much weaker than forward thrust
        game.ship.velocity.x -= Math.cos(game.ship.angle) * reverseThrust;
        game.ship.velocity.y -= Math.sin(game.ship.angle) * reverseThrust;

        // Uses same fuel efficiency as forward thrust
        const fuelEfficiency = 1 - (game.ship.upgrades.engine - 1) * 0.1;
        game.ship.fuel -= 0.02 * Math.max(0.3, fuelEfficiency); // Less fuel than forward
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
}