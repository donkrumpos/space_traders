// Navigation and mapping functions

function updateMaps() {
    updateMiniMap();
    updateFullMap();
}

function updateMiniMap() {
    const canvas = document.getElementById('miniMapCanvas');
    const ctx = canvas.getContext('2d');
    const size = game.map.miniMapSize;
    const range = game.map.miniMapRange;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Scale factor for mini-map (much wider view)
    const scale = size / (range * 2);
    const centerX = size / 2;
    const centerY = size / 2;

    // Draw range circles for reference
    ctx.strokeStyle = '#001100';
    ctx.lineWidth = 1;

    // Inner circle (main screen view approximation)
    const mainScreenRange = 300;
    if (mainScreenRange < range) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, mainScreenRange * scale, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Outer circle (mini-map edge)
    ctx.strokeStyle = '#002200';
    ctx.beginPath();
    ctx.arc(centerX, centerY, range * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Draw ALL planets in range - strategic overview
    game.planets.forEach(planet => {
        const dx = planet.x - game.ship.x;
        const dy = planet.y - game.ship.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= range) {
            const mapX = centerX + (dx * scale);
            const mapY = centerY + (dy * scale);

            // Simple planet dot - bigger for closer planets
            const isClose = distance <= mainScreenRange;
            const dotSize = isClose ? 4 : 2;

            ctx.fillStyle = planet.color;
            ctx.beginPath();
            ctx.arc(mapX, mapY, dotSize, 0, Math.PI * 2);
            ctx.fill();

            // Always show planet name for strategic navigation
            ctx.fillStyle = '#ffffff';
            ctx.font = isClose ? '7px Courier New' : '6px Courier New';
            ctx.textAlign = 'center';

            // Abbreviated names for distant planets
            const planetName = distance > 800 ?
                planet.name.substring(0, 5) + (planet.name.length > 5 ? '.' : '') :
                planet.name.substring(0, 8);

            ctx.fillText(planetName, mapX, mapY - (dotSize + 2));

            // Distance indicator for strategic planning
            ctx.fillStyle = isClose ? '#00ff00' : '#888888';
            ctx.font = '5px Courier New';
            ctx.textAlign = 'center';

            // Show distance in different formats based on range
            let distanceText;
            if (distance < 1000) {
                distanceText = Math.floor(distance).toString();
            } else {
                distanceText = (distance / 1000).toFixed(1) + 'k';
            }

            ctx.fillText(distanceText, mapX, mapY + dotSize + 8);
        }
    });

    // Draw ship (center) - more prominent
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Ship direction indicator - longer for strategic view
    const directionLength = 12;
    const dirX = centerX + Math.cos(game.ship.angle) * directionLength;
    const dirY = centerY + Math.sin(game.ship.angle) * directionLength;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(dirX, dirY);
    ctx.stroke();

    // Fuel range indicator - strategic planning
    if (game.ship.fuel > 0) {
        const fuelRange = calculateFuelRange();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.min(fuelRange * scale, range * scale), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Fuel range text
        ctx.fillStyle = '#ffff00';
        ctx.font = '6px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(`Fuel: ${Math.floor(fuelRange)}`, 2, size - 2);
    }

    // Mini-map scale indicator
    ctx.fillStyle = '#444444';
    ctx.font = '5px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(`${range * 2} units`, size - 2, 8);
}

function updateFullMap() {
    const overlay = document.getElementById('fullMapOverlay');
    const canvas = document.getElementById('fullMapCanvas');

    if (!game.map.showFullMap) {
        overlay.style.display = 'none';
        return;
    }

    overlay.style.display = 'flex';

    // Set canvas size to match container
    const container = document.getElementById('fullMapContainer');
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width - 44; // Account for padding and borders
    canvas.height = rect.height - 80; // Account for title and legend

    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Find universe bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    game.planets.forEach(planet => {
        minX = Math.min(minX, planet.x);
        maxX = Math.max(maxX, planet.x);
        minY = Math.min(minY, planet.y);
        maxY = Math.max(maxY, planet.y);
    });

    // Add padding
    const padding = 200;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    // Include ship position
    minX = Math.min(minX, game.ship.x - padding);
    maxX = Math.max(maxX, game.ship.x + padding);
    minY = Math.min(minY, game.ship.y - padding);
    maxY = Math.max(maxY, game.ship.y + padding);

    const universeWidth = maxX - minX;
    const universeHeight = maxY - minY;

    // Calculate scale to fit everything
    const scaleX = canvas.width / universeWidth;
    const scaleY = canvas.height / universeHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave some margin

    // Center the map
    const offsetX = (canvas.width - universeWidth * scale) / 2 - minX * scale;
    const offsetY = (canvas.height - universeHeight * scale) / 2 - minY * scale;

    // Draw grid
    ctx.strokeStyle = '#001100';
    ctx.lineWidth = 1;
    for (let x = 0; x <= universeWidth; x += 500) {
        const screenX = x * scale + offsetX + minX * scale;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= universeHeight; y += 500) {
        const screenY = y * scale + offsetY + minY * scale;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(canvas.width, screenY);
        ctx.stroke();
    }

    // Draw planets
    game.planets.forEach(planet => {
        const mapX = planet.x * scale + offsetX;
        const mapY = planet.y * scale + offsetY;

        // Planet
        ctx.fillStyle = planet.color;
        ctx.beginPath();
        ctx.arc(mapX, mapY, Math.max(4, 8 * scale), 0, Math.PI * 2);
        ctx.fill();

        // Planet name
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(planet.name, mapX, mapY - 15);

        // Planet type
        ctx.fillStyle = '#888888';
        ctx.font = '10px Courier New';
        ctx.fillText(planet.type, mapX, mapY + 20);

        // Distance from ship
        const distance = Math.sqrt(
            Math.pow(planet.x - game.ship.x, 2) +
            Math.pow(planet.y - game.ship.y, 2)
        );
        ctx.fillStyle = '#666666';
        ctx.font = '8px Courier New';
        ctx.fillText(`${Math.floor(distance)} units`, mapX, mapY + 30);
    });

    // Draw ship
    const shipMapX = game.ship.x * scale + offsetX;
    const shipMapY = game.ship.y * scale + offsetY;

    // Ship position
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(shipMapX, shipMapY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Ship direction
    const dirLength = 20;
    const dirX = shipMapX + Math.cos(game.ship.angle) * dirLength;
    const dirY = shipMapY + Math.sin(game.ship.angle) * dirLength;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shipMapX, shipMapY);
    ctx.lineTo(dirX, dirY);
    ctx.stroke();

    // Ship label
    ctx.fillStyle = '#00ffff';
    ctx.font = '12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('YOUR SHIP', shipMapX, shipMapY - 15);

    // Fuel range indicator
    if (game.ship.fuel > 0) {
        const fuelRange = calculateFuelRange();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(shipMapX, shipMapY, fuelRange * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Fuel range label
        ctx.fillStyle = '#ffff00';
        ctx.font = '10px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(`Fuel Range: ${Math.floor(fuelRange)} units`, 10, canvas.height - 10);
    }
}

function calculateFuelRange() {
    // Estimate how far the ship can travel with current fuel
    // Based on thrust fuel consumption rate
    const fuelEfficiency = 1 - (game.ship.upgrades.engine - 1) * 0.1;
    const baseFuelRate = 0.05 * Math.max(0.3, fuelEfficiency);

    // Assume 50% thrust usage on average for travel
    const averageThrust = 0.5;
    const fuelUsagePerFrame = baseFuelRate * averageThrust;

    // Assume average speed of 4 units per frame (conservative estimate)
    const averageSpeed = 4;

    // Calculate frames of fuel remaining
    const framesOfFuel = game.ship.fuel / fuelUsagePerFrame;

    // Convert to distance
    return framesOfFuel * averageSpeed;
}

function getDistanceToNearest() {
    let nearest = null;
    let nearestDistance = Infinity;

    game.planets.forEach(planet => {
        const distance = Math.sqrt(
            Math.pow(planet.x - game.ship.x, 2) +
            Math.pow(planet.y - game.ship.y, 2)
        );

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = planet;
        }
    });

    return { planet: nearest, distance: nearestDistance };
}