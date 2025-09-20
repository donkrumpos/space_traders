function render() {
    const ctx = game.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);

    // Draw stars with parallax effect (back to front)
    game.stars.forEach(star => {
        // Apply parallax - closer stars move faster with camera
        const parallaxX = game.camera.x * star.depth;
        const parallaxY = game.camera.y * star.depth;

        const screenX = star.x - parallaxX;
        const screenY = star.y - parallaxY;

        // Expanded culling bounds for larger stars
        const margin = star.size + 5;
        if (screenX >= -margin && screenX <= game.canvas.width + margin &&
            screenY >= -margin && screenY <= game.canvas.height + margin) {

            ctx.globalAlpha = star.brightness;
            ctx.fillStyle = star.color;

            if (star.size === 1) {
                // Optimize single pixel stars
                ctx.fillRect(Math.floor(screenX), Math.floor(screenY), 1, 1);
            } else if (star.size <= 3) {
                // Small-medium stars: simple circle
                ctx.beginPath();
                ctx.arc(screenX, screenY, star.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Large stars: add glow effect
                // Create gradient for each large star (only a few of these)
                const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, star.size);
                gradient.addColorStop(0, star.color);
                gradient.addColorStop(0.7, star.color + '80'); // Add transparency
                gradient.addColorStop(1, star.color + '00'); // Fully transparent

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(screenX, screenY, star.size, 0, Math.PI * 2);
                ctx.fill();

                // Bright core
                ctx.fillStyle = star.color;
                ctx.beginPath();
                ctx.arc(screenX, screenY, star.size / 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });
    ctx.globalAlpha = 1;

    // Draw event objects
    if (typeof eventSystem !== 'undefined' && eventSystem.activeEvents) {
        eventSystem.activeEvents.forEach(event => {
            const screenX = event.x - game.camera.x;
            const screenY = event.y - game.camera.y;

            if (screenX >= -50 && screenX <= game.canvas.width + 50 &&
                screenY >= -50 && screenY <= game.canvas.height + 50) {

                // Event object
                ctx.fillStyle = event.color;
                ctx.beginPath();
                ctx.arc(screenX, screenY, event.size, 0, Math.PI * 2);
                ctx.fill();

                // Event name
                ctx.fillStyle = '#ffffff';
                ctx.font = '10px Courier New';
                ctx.textAlign = 'center';
                ctx.fillText(event.name, screenX, screenY + event.size + 15);

                // Interaction range indicator
                const distance = Math.sqrt(
                    Math.pow(game.ship.x - event.x, 2) +
                    Math.pow(game.ship.y - event.y, 2)
                );

                if (distance < 60) {
                    ctx.strokeStyle = '#ffff00';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, 40, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Event symbol/icon overlay
                ctx.fillStyle = '#ffffff';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(event.symbol, screenX, screenY + 5);
            }
        });
    }

    // Draw planets
    game.planets.forEach(planet => {
        const screenX = planet.x - game.camera.x;
        const screenY = planet.y - game.camera.y;

        if (screenX >= -50 && screenX <= game.canvas.width + 50 &&
            screenY >= -50 && screenY <= game.canvas.height + 50) {

            // Planet
            ctx.fillStyle = planet.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, planet.size, 0, Math.PI * 2);
            ctx.fill();

            // Planet name
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(planet.name, screenX, screenY + planet.size + 15);

            // Docking range indicator
            const distance = Math.sqrt(
                Math.pow(game.ship.x - planet.x, 2) +
                Math.pow(game.ship.y - planet.y, 2)
            );

            if (distance < 60) {
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(screenX, screenY, 40, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    });

    // Draw enemies
    renderEnemies(ctx, game.camera);

    // Draw projectiles
    renderProjectiles(ctx, game.camera);

    // Draw ship (always in center)
    const shipX = game.canvas.width / 2;
    const shipY = game.canvas.height / 2;

    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(game.ship.angle);

    // Ship body
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-10, -5);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 5);
    ctx.closePath();
    ctx.stroke();

    // Forward thrust indicator - intensity based on current thrust
    if (game.ship.thrust.isThrusting && game.ship.fuel > 0) {
        const intensity = game.ship.thrust.current;
        const alpha = 0.3 + (intensity * 0.7); // 30% to 100% opacity
        const flameLength = 5 + (intensity * 10); // 5 to 15 pixel flame

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 1 + intensity; // Thicker line at full thrust
        ctx.beginPath();
        ctx.moveTo(-10, -2 * intensity);
        ctx.lineTo(-10 - flameLength, 0);
        ctx.moveTo(-10, 2 * intensity);
        ctx.lineTo(-10 - flameLength, 0);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Reverse thrust indicator (smaller, blue) - intensity based on current thrust
    if (game.ship.thrust.isReversing && game.ship.fuel > 0) {
        const intensity = game.ship.thrust.current;
        const alpha = 0.3 + (intensity * 0.7);
        const flameLength = 3 + (intensity * 5); // Smaller reverse flame

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 1 + (intensity * 0.5);
        ctx.beginPath();
        ctx.moveTo(10, -1 * intensity);
        ctx.lineTo(10 + flameLength, 0);
        ctx.moveTo(10, 1 * intensity);
        ctx.lineTo(10 + flameLength, 0);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}