// Game state
const game = {
    canvas: null,
    ctx: null,
    ship: {
        x: 1050, // Near Agricon Prime (1000, 800)
        y: 850,
        angle: 0,
        velocity: { x: 0, y: 0 },
        fuel: 500,
        fuelMax: 500,
        hull: 100,
        hullMax: 100,
        credits: 1000,
        cargo: {},
        cargoMax: 10,
        upgrades: {
            cargo: 1,
            engine: 1,
            shields: 1,
            fuel_tank: 1,
            hull: 1
        },
        thrust: {
            current: 0,        // Current thrust power (0-1)
            target: 0,         // Target thrust power (0-1)
            rampUpTime: 0,     // Time spent ramping up
            rampDownTime: 0,   // Time spent ramping down
            isThrusting: false,
            isReversing: false
        }
    },
    camera: { x: 0, y: 0 },
    keys: {},
    planets: [],
    stars: [],
    nearPlanet: null,
    inDockingRange: false,
    isDocked: false,
    map: {
        showFullMap: false,
        miniMapSize: 150,
        miniMapRange: 1500  // 5x wider than typical main screen view (~300 units)
    }
};

// Trade goods
const goods = {
    food: { name: 'Food', color: '#ffff00' },
    technology: { name: 'Technology', color: '#00ffff' },
    materials: { name: 'Raw Materials', color: '#ff8800' },
    luxury: { name: 'Luxury Goods', color: '#ff00ff' }
};

// Planet definitions
const planetData = [
    {
        name: 'Agricon Prime',
        x: 1000, y: 800,
        type: 'agricultural',
        color: '#00ff00',
        produces: { food: 50 },
        demands: { technology: 200, luxury: 150 },
        upgrades: {
            cargo: { name: 'Cargo Bay Extension', baseCost: 500, description: 'Increases cargo capacity by 5 units' },
            fuel_tank: { name: 'Extended Fuel Tank', baseCost: 800, description: 'Increases fuel capacity by 200 units' }
        }
    },
    {
        name: 'Mining Station 7',
        x: 2000, y: 1200,
        type: 'industrial',
        color: '#888888',
        produces: { materials: 60 },
        demands: { food: 180, luxury: 140 },
        upgrades: {
            hull: { name: 'Hull Reinforcement', baseCost: 1000, description: 'Increases hull strength by 50 points' },
            engine: { name: 'Industrial Thrusters', baseCost: 1200, description: 'Faster acceleration (2s to max thrust) and improved fuel efficiency' }
        }
    },
    {
        name: 'Tech Hub Alpha',
        x: 1500, y: 400,
        type: 'technology',
        color: '#00ffff',
        produces: { technology: 80, luxury: 120 },
        demands: { materials: 160, food: 100 },
        upgrades: {
            shields: { name: 'Shield Generator', baseCost: 1500, description: 'Advanced shield system for protection' },
            engine: { name: 'Fusion Drive', baseCost: 2000, description: 'Rapid acceleration (1s to max thrust) and superior fuel efficiency' }
        }
    },
    {
        name: 'Frontier Outpost',
        x: 3000, y: 2000,
        type: 'frontier',
        color: '#ff0000',
        produces: {},
        demands: { food: 300, technology: 280, materials: 250, luxury: 200 },
        upgrades: {
            shields: { name: 'Military Shields', baseCost: 3000, description: 'Military-grade defensive systems' },
            hull: { name: 'Armor Plating', baseCost: 2500, description: 'Heavy combat armor for dangerous regions' },
            engine: { name: 'Military Drive Core', baseCost: 4000, description: 'Instant acceleration (0.5s to max thrust) with maximum fuel efficiency' }
        }
    },
    {
        name: 'Core World Central',
        x: 800, y: 1600,
        type: 'core',
        color: '#ffff00',
        produces: { luxury: 90 },
        demands: { materials: 130, technology: 110 },
        upgrades: {
            cargo: { name: 'Luxury Cargo Bay', baseCost: 2000, description: 'Premium cargo expansion with climate control' },
            fuel_tank: { name: 'Premium Fuel System', baseCost: 2500, description: 'High-capacity fuel system with purification' }
        }
    }
];

function init() {
    game.canvas = document.getElementById('gameCanvas');
    game.ctx = game.canvas.getContext('2d');

    // Set canvas size to fill available space
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize planets
    game.planets = planetData.map(p => ({
        ...p,
        size: 20
    }));

    // Generate starfield with variety and depth
    const starColors = ['#ffffff', '#aaccff', '#ffffaa', '#ffccaa', '#ffaaaa'];
    const starColorNames = ['white', 'blue', 'yellow', 'orange', 'red'];

    // Background stars (far) - 80% small stars
    for (let i = 0; i < 160; i++) {
        game.stars.push({
            x: Math.random() * 8000, // Larger field for background
            y: Math.random() * 6000,
            size: 1,
            brightness: 0.3 + Math.random() * 0.4, // Dimmer background stars
            color: starColors[Math.floor(Math.random() * starColors.length)],
            depth: 0.3, // Far background - slow parallax
            layer: 'background'
        });
    }

    // Mid-distance stars - 15% medium stars
    for (let i = 0; i < 30; i++) {
        game.stars.push({
            x: Math.random() * 6000,
            y: Math.random() * 4500,
            size: 2 + Math.random(), // 2-3px
            brightness: 0.5 + Math.random() * 0.4,
            color: starColors[Math.floor(Math.random() * starColors.length)],
            depth: 0.6, // Medium parallax
            layer: 'middle'
        });
    }

    // Close stars - 4% large stars
    for (let i = 0; i < 8; i++) {
        game.stars.push({
            x: Math.random() * 5000,
            y: Math.random() * 4000,
            size: 4 + Math.random() * 2, // 4-6px
            brightness: 0.7 + Math.random() * 0.3,
            color: starColors[Math.floor(Math.random() * starColors.length)],
            depth: 0.9, // Fast parallax
            layer: 'close'
        });
    }

    // Giant stars - 1% rare giants
    for (let i = 0; i < 2; i++) {
        game.stars.push({
            x: Math.random() * 4500,
            y: Math.random() * 3500,
            size: 8 + Math.random() * 2, // 8-10px
            brightness: 0.8 + Math.random() * 0.2,
            color: starColors[Math.floor(Math.random() * starColors.length)],
            depth: 1.2, // Very fast parallax (appears closest)
            layer: 'giant'
        });
    }

    // Event listeners
    document.addEventListener('keydown', (e) => {
        game.keys[e.code] = true;
        if (e.code === 'Space') {
            e.preventDefault();
            if (game.isDocked) {
                undock();
            } else {
                tryDock();
            }
        }
        if (e.code === 'Escape') {
            e.preventDefault();
            if (game.map.showFullMap) {
                game.map.showFullMap = false;
            } else if (game.isDocked) {
                undock();
            }
        }
        if (e.code === 'KeyM') {
            e.preventDefault();
            game.map.showFullMap = !game.map.showFullMap;
        }
        // Emergency undock on any movement key while docked
        if (game.isDocked && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
            undock();
        }
    });

    document.addEventListener('keyup', (e) => {
        game.keys[e.code] = false;
    });

    updateUI();
    gameLoop();
}

function resizeCanvas() {
    const container = document.getElementById('gameContainer');
    const ui = document.getElementById('ui');
    const canvas = game.canvas;

    // Get the actual current width of the UI panel
    const uiWidth = ui.offsetWidth;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Canvas takes remaining space after UI panel
    canvas.width = containerWidth - uiWidth - 20; // Account for borders and padding
    canvas.height = containerHeight - 4; // Account for borders

    // Ensure minimum canvas width
    if (canvas.width < 400) {
        canvas.width = 400;
    }
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

function startGame() {
    // This function will be called after all scripts are loaded
    init();
}

// Don't start immediately - wait for all scripts to load