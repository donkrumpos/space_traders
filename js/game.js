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
        }
    },
    camera: { x: 0, y: 0 },
    keys: {},
    planets: [],
    stars: [],
    nearPlanet: null,
    inDockingRange: false,
    isDocked: false
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
            engine: { name: 'Industrial Thrusters', baseCost: 1200, description: 'Improves thrust power and fuel efficiency' }
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
            engine: { name: 'Fusion Drive', baseCost: 2000, description: 'High-efficiency propulsion system' }
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
            hull: { name: 'Armor Plating', baseCost: 2500, description: 'Heavy combat armor for dangerous regions' }
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

    // Generate starfield
    for (let i = 0; i < 200; i++) {
        game.stars.push({
            x: Math.random() * 4000,
            y: Math.random() * 3000,
            brightness: Math.random()
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
            if (game.isDocked) {
                undock();
            }
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