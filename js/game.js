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
        emergencyFuel: 25, // Reserve fuel that can't be consumed normally
        emergencyFuelMax: 25, // 5% of starting fuel as emergency reserve
        hull: 100,
        hullMax: 100,
        shield: 20,
        shieldMax: 20, // 20 points per shield upgrade level, regenerates out of combat
        credits: 1000,
        cargo: {},
        cargoMax: 10,
        // The hull ladder: which body this ship is, what Foggy/Arthur named
        // her, and the log where her story accumulates (see js/ships.js)
        hullId: 'skiff',
        name: null,
        mods: [],
        log: [],
        upgrades: {
            cargo: 1,
            engine: 1,
            shields: 1,
            fuel_tank: 1,
            hull: 1,
            weapons: 1
        },
        weapons: {
            lasers: {
                cooldown: 0, maxCooldown: 500, // 500ms between shots
                mode: 'single', owned: ['single'], // Gradius-style systems, cycle with Z
                heat: 0, overheated: false // spam builds heat; 100 = lockout until cooled
            },
            missiles: { cooldown: 0, maxCooldown: 2000, ammo: 5, maxAmmo: 5 }
        },
        // Subsystems get knocked out by hull hits once shields are down.
        // Field-repair with Repair Kits (R) or dock — station crews fix free.
        systems: { lasers: 'ok', engines: 'ok', lifeSupport: 'ok' },
        thrust: {
            current: 0,        // Current thrust power (0-1)
            target: 0,         // Target thrust power (0-1)
            rampUpTime: 0,     // Time spent ramping up
            rampDownTime: 0,   // Time spent ramping down
            isThrusting: false,
            isReversing: false
        },
        rotation: {
            current: 0,        // Current rotation speed (radians per frame)
            target: 0,         // Target rotation speed
            leftHoldTime: 0,   // Time spent holding left
            rightHoldTime: 0,  // Time spent holding right
            isRotatingLeft: false,
            isRotatingRight: false,
            baseSpeed: 0.02,   // Minimum rotation speed for taps
            maxSpeed: 0.12     // Maximum rotation speed when held
        }
    },
    camera: { x: 0, y: 0 },
    keys: {},
    planets: [],
    stars: [],
    projectiles: [],
    nearPlanet: null,
    inDockingRange: false,
    isDocked: false,
    isEngaged: false,
    currentEvent: null,
    map: {
        showFullMap: false,
        miniMapSize: 150,
        miniMapRange: 1500  // 5x wider than typical main screen view (~300 units)
    },
    damage: {
        flashTime: 0,        // Screen flash duration
        lastHitTime: 0,      // When player was last hit
        invulnerabilityTime: 0,  // Brief invulnerability after hit
        shieldRegenDelay: 0  // Seconds until shields start regenerating
    }
};

// Trade goods — keys are stable save-format IDs; names carry the story world
const goods = {
    food: { name: 'Glowgrain', color: '#ffff00' },            // bioluminescent staple crop
    technology: { name: 'Cognition Cores', color: '#00ffff' }, // shipmind processor lattices
    materials: { name: 'Ferrovolt Ore', color: '#ff8800' },    // charge-bearing iron, warm to the touch
    luxury: { name: 'Nebula Silk', color: '#ff00ff' },         // woven from gas-harvested polymer strands
    medicine: { name: 'Panacea Vials', color: '#66ff99' },     // reef-lab cultured cure-alls
    relics: { name: 'Precursor Relics', color: '#cc99ff' },    // artifacts of the vanished builders
    contraband: { name: 'Voidbloom', color: '#ff44cc' },       // psychoactive flower — illegal at lawful ports
    parts: { name: 'Repair Kits', color: '#88ffee' }           // sealed spares — field-fix knocked-out subsystems (R)
};

// Planet definitions
const planetData = [
    {
        name: 'Agricon Prime',
        x: 1000, y: 800,
        type: 'agricultural',
        color: '#00ff00',
        blurb: 'Terraced glowgrain paddies light the nightside like a second aurora.',
        produces: { food: 50 },
        demands: { technology: 200, luxury: 150, medicine: 160 },
        shipyard: ['skiff'],
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
        blurb: 'A drum of scaffold and dust. The ferrovolt seams sing when the drills bite.',
        produces: { materials: 60, parts: 80 },
        demands: { food: 180, luxury: 140, contraband: 220 },
        weaponSystems: ['double'],
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
        blurb: 'Orbital foundries where cognition cores dream themselves into being.',
        produces: { technology: 80, luxury: 120, parts: 100 },
        demands: { materials: 160, food: 100, relics: 320 },
        weaponSystems: ['spread'],
        shipyard: ['courier', 'gunship'],
        upgrades: {
            shields: { name: 'Shield Generator', baseCost: 1500, description: 'Advanced shield system for protection' },
            engine: { name: 'Fusion Drive', baseCost: 2000, description: 'Rapid acceleration (1s to max thrust) and superior fuel efficiency' },
            weapons: { name: 'Advanced Targeting', baseCost: 1800, description: 'Improved laser damage and missile capacity' }
        }
    },
    {
        name: 'Frontier Outpost',
        x: 3000, y: 2000,
        type: 'frontier',
        color: '#ff0000',
        lawless: true, // no customs — the only place to buy contraband openly
        blurb: 'Last dock before the dark. No customs, no questions, no refunds.',
        produces: { contraband: 40 },
        demands: { food: 300, technology: 280, materials: 250, luxury: 200, medicine: 280, parts: 150 },
        shipyard: ['gunship', 'freighter'],
        upgrades: {
            shields: { name: 'Military Shields', baseCost: 3000, description: 'Military-grade defensive systems' },
            hull: { name: 'Armor Plating', baseCost: 2500, description: 'Heavy combat armor for dangerous regions' },
            engine: { name: 'Military Drive Core', baseCost: 4000, description: 'Instant acceleration (0.5s to max thrust) with maximum fuel efficiency' },
            weapons: { name: 'Military Weapons', baseCost: 3500, description: 'Heavy laser cannons and missile pods for combat' }
        }
    },
    {
        name: 'Core World Central',
        x: 800, y: 1600,
        type: 'core',
        color: '#ffff00',
        blurb: 'Old money, high towers, and an appetite for everything the rim digs up.',
        produces: { luxury: 90 },
        demands: { materials: 130, technology: 110, contraband: 350, relics: 380 },
        shipyard: ['courier', 'freighter', 'clipper'],
        upgrades: {
            cargo: { name: 'Luxury Cargo Bay', baseCost: 2000, description: 'Premium cargo expansion with climate control' },
            fuel_tank: { name: 'Premium Fuel System', baseCost: 2500, description: 'High-capacity fuel system with purification' }
        }
    },
    {
        name: 'Meridian Deep',
        x: 2600, y: 600,
        type: 'ocean',
        color: '#00ccaa',
        blurb: 'A storm-wracked ocean world. Its drowned reef-labs culture the galaxy\'s medicine.',
        produces: { medicine: 70 },
        demands: { technology: 230, food: 150, materials: 140 },
        upgrades: {
            shields: { name: 'Pressure-Hull Shielding', baseCost: 1800, description: 'Deep-sea shield tech adapted for vacuum' },
            fuel_tank: { name: 'Hydro-Cracked Fuel Tanks', baseCost: 1600, description: 'Ocean-refined fuel storage expansion' }
        }
    },
    {
        name: 'Ossuary Drift',
        x: 500, y: 500,
        type: 'ruins',
        color: '#9977dd',
        blurb: 'A shattered precursor necropolis. Relic-diggers pay well to stay alive out here.',
        produces: { relics: 120 },
        demands: { medicine: 210, luxury: 170, food: 130 },
        weaponSystems: ['seeker'],
        upgrades: {
            weapons: { name: 'Precursor Weapon Lattice', baseCost: 2200, description: 'Reverse-engineered relic weaponry — improved damage and missile capacity' }
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

    // Initialize living economy and world hazards
    initEconomy();
    initAsteroids();

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
            } else if (game.isEngaged) {
                disengage();
            } else if (game.isDocked) {
                undock();
            }
        }
        if (e.code === 'KeyM') {
            e.preventDefault();
            game.map.showFullMap = !game.map.showFullMap;
        }
        // Weapon firing controls (only when not docked/engaged)
        if (!game.isDocked && !game.isEngaged) {
            if (e.code === 'KeyX') {
                e.preventDefault();
                fireLaser();
            }
            if (e.code === 'KeyC') {
                e.preventDefault();
                fireMissile();
            }
            if (e.code === 'KeyZ') {
                e.preventDefault();
                cycleLaserMode();
            }
            // Secondary interaction key for events when planet has priority
            if (e.code === 'KeyE') {
                e.preventDefault();
                trySecondaryInteraction();
            }
            // Field-repair a knocked-out subsystem with a Repair Kit
            if (e.code === 'KeyR') {
                e.preventDefault();
                fieldRepair();
            }
        }
        // Emergency undock/disengage on any movement key while docked or engaged
        if ((game.isDocked || game.isEngaged) && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
            if (game.isEngaged) {
                disengage();
            } else if (game.isDocked) {
                undock();
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        game.keys[e.code] = false;
    });

    updateUI();
    initEvents();
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

    // Initialize character system after game is set up
    characterManager.initialize();
}

// Don't start immediately - wait for all scripts to load