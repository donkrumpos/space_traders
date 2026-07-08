// Shared sim data (M3, docs/PROTOCOL.md "Economy sim extraction"): the planet
// roster, moved verbatim out of js/game.js. Side-effect script that sets
// globalThis.SIM_PLANETS — loaded as a <script> tag before game.js in the
// browser and via await import() on the server. Same file, no fork: no
// window/DOM references allowed here.
globalThis.SIM_PLANETS = [
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
