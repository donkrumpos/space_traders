function render() {
    const ctx = game.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);

    // Draw stars
    ctx.fillStyle = '#ffffff';
    game.stars.forEach(star => {
        const screenX = star.x - game.camera.x;
        const screenY = star.y - game.camera.y;

        if (screenX >= 0 && screenX <= game.canvas.width &&
            screenY >= 0 && screenY <= game.canvas.height) {
            ctx.globalAlpha = star.brightness;
            ctx.fillRect(screenX, screenY, 1, 1);
        }
    });
    ctx.globalAlpha = 1;

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

    // Forward thrust indicator
    if (game.keys['ArrowUp'] && game.ship.fuel > 0) {
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -2);
        ctx.lineTo(-15, 0);
        ctx.moveTo(-10, 2);
        ctx.lineTo(-15, 0);
        ctx.stroke();
    }

    // Reverse thrust indicator (smaller, blue)
    if (game.keys['ArrowDown'] && game.ship.fuel > 0) {
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(10, -1);
        ctx.lineTo(13, 0);
        ctx.moveTo(10, 1);
        ctx.lineTo(13, 0);
        ctx.stroke();
    }

    ctx.restore();
}