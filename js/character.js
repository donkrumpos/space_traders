// Character persistence system for Space Trader

const CHARACTER_VERSION = "1.0";
const STORAGE_KEY = "space_trader_character";

// Character data structure optimized for future server integration
function createDefaultCharacter() {
    return {
        version: CHARACTER_VERSION,
        id: generateCharacterId(),
        created: Date.now(),
        lastPlayed: Date.now(),

        // Ship state
        ship: {
            x: 1050,
            y: 850,
            angle: 0,
            velocity: { x: 0, y: 0 },
            fuel: 500,
            fuelMax: 500,
            emergencyFuel: 25,
            emergencyFuelMax: 25,
            hull: 100,
            hullMax: 100,
            shield: 20,
            shieldMax: 20,
            credits: 1000,
            cargo: {},
            cargoMax: 10,
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
                lasers: { cooldown: 0, maxCooldown: 500 },
                missiles: { cooldown: 0, maxCooldown: 2000, ammo: 5, maxAmmo: 5 }
            },
            systems: { lasers: 'ok', engines: 'ok', lifeSupport: 'ok' }
        },

        // Pilot progression (XP, rank, perks, grudges, crew)
        pilot: createDefaultPilot(),

        // Game progress and statistics
        progress: {
            planetsVisited: [],
            eventsCompleted: [],
            enemiesDestroyed: 0,
            totalCreditsEarned: 0,
            distanceTraveled: 0,
            playtimeMinutes: 0
        },

        // Current game state
        gameState: {
            isDocked: false,
            currentPlanet: null,
            isEngaged: false,
            currentEvent: null,
            lastPosition: { x: 1050, y: 850 }
        }
    };
}

// Generate unique character ID
function generateCharacterId() {
    return 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Auto-save system
class CharacterManager {
    constructor() {
        this.character = null;
        this.autoSaveEnabled = true;
        this.lastSaveTime = 0;
        this.saveThrottle = 1000; // Don't save more than once per second
        this.pendingSave = false;
    }

    // Initialize character system
    initialize() {
        this.loadCharacter();
        this.startAutoSaveTimer();
        console.log(`Character system initialized. ID: ${this.character.id}`);
    }

    // Load character from localStorage or create new one
    loadCharacter() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);

                // Validate version compatibility
                if (parsed.version === CHARACTER_VERSION) {
                    this.character = parsed;
                    this.character.lastPlayed = Date.now();
                    console.log("Character loaded from storage");
                } else {
                    console.log("Character version mismatch, creating new character");
                    this.character = createDefaultCharacter();
                }
            } else {
                console.log("No saved character found, creating new character");
                this.character = createDefaultCharacter();
            }
        } catch (error) {
            console.error("Error loading character:", error);
            this.character = createDefaultCharacter();
        }

        // Apply character data to game state
        this.applyCharacterToGame();

        // Initialize emergency fuel for legacy saves
        this.initializeEmergencyFuel();
    }

    // Apply character data to current game state
    applyCharacterToGame() {
        if (!this.character || !game.ship) return;

        // Apply ship state
        Object.assign(game.ship, this.character.ship);

        // Legacy saves predate the shield pool
        if (typeof game.ship.shield === 'undefined' || typeof game.ship.shieldMax === 'undefined') {
            game.ship.shieldMax = 20 * (game.ship.upgrades.shields || 1);
            game.ship.shield = game.ship.shieldMax;
        }

        // Legacy saves predate weapon systems and laser heat
        const lasers = game.ship.weapons.lasers;
        if (!lasers.owned) lasers.owned = ['single'];
        if (!lasers.mode) lasers.mode = 'single';
        if (typeof lasers.heat === 'undefined') lasers.heat = 0;
        if (typeof lasers.overheated === 'undefined') lasers.overheated = false;

        // Legacy saves predate the per-system laser progression tree
        if (!lasers.levels) lasers.levels = {};
        lasers.owned.forEach(m => { if (!lasers.levels[m]) lasers.levels[m] = 1; });

        // Legacy saves predate subsystem damage
        if (!game.ship.systems) {
            game.ship.systems = { lasers: 'ok', engines: 'ok', lifeSupport: 'ok' };
        }

        // Legacy saves predate the pilot system: commission retroactively from
        // the stats ledger, so a veteran's first load is a promotion parade
        let retroXP = 0;
        if (!this.character.pilot) {
            this.character.pilot = createDefaultPilot();
            retroXP = retroactivePilotXP(this.character.progress);
        }
        // Same object by reference: pilot state saves without an explicit sync
        game.pilot = this.character.pilot;
        if (!game.pilot.grudges) game.pilot.grudges = {};
        if (!game.pilot.crew) game.pilot.crew = [];
        reapplyPerkEffects();
        updateFactionUI();

        // Legacy saves predate the hull ladder: commission the ship they've
        // been flying all along — smallest hull that fits their upgrade
        // levels and houses their crew. (After pilot assignment, so the
        // recompute sees perks like Packrat. Detected on the SAVED ship —
        // Object.assign left game.ship's default 'skiff' in place.)
        if (!this.character.ship.hullId) {
            game.ship.hullId = assignLegacyHull(game.ship.upgrades, game.pilot.crew.length);
            recomputeShipStats();
        }
        if (!game.ship.mods) game.ship.mods = [];
        if (!game.ship.log) game.ship.log = [];
        // An unnamed ship (legacy or brand-new) gets her christening on load
        if (!game.ship.name) {
            setTimeout(() => showShipNaming(false), 600);
        }
        updateShipPanelUI();
        updateCrewPanelUI();
        if (retroXP > 0) {
            setTimeout(() => addXP(retroXP, 'service record'), 1200);
        } else if (game.pilot.pendingPerkChoices > 0) {
            // A promotion earned last session still owes its training choice
            setTimeout(maybeShowPerkChoice, 2000);
        }

        // Apply game state
        game.isDocked = this.character.gameState.isDocked;
        game.currentPlanet = this.character.gameState.currentPlanet;
        game.isEngaged = this.character.gameState.isEngaged;
        game.currentEvent = this.character.gameState.currentEvent;

        // Apply world state (economy, missions, hazards)
        this.applyWorldToGame();

        console.log("Character data applied to game state");
    }

    // Restore world state saved alongside the ship. Legacy saves without a
    // world section keep the freshly initialized world.
    applyWorldToGame() {
        const w = this.character.world;
        if (!w) return;

        if (w.markets) {
            w.markets.forEach(saved => {
                const planet = game.planets.find(p => p.name === saved.name);
                if (planet) {
                    // Merge over defaults so goods added after the save keep their fresh prices
                    planet.market = {
                        buy: { ...planet.market.buy, ...saved.buy },
                        sell: { ...planet.market.sell, ...saved.sell }
                    };
                }
            });
        }
        if (w.ledger) economy.ledger = w.ledger;
        economy.marketEvent = w.marketEvent || null;
        if (typeof w.eventCooldown === 'number') economy.eventCooldown = w.eventCooldown;
        game.missions = w.missions || [];
        game.combatStreak = w.combatStreak || 0;
        if (w.asteroids && w.asteroids.length > 0) game.asteroids = w.asteroids;
        if (w.drops) game.drops = w.drops;

        updateLedgerUI();
        updateMissionsUI();

        // Bounty hunts respawn their target if it wasn't killed before reload
        if (typeof restoreActiveBounties === 'function') {
            restoreActiveBounties();
        }

        // Accepted escorts respawn their freighter at the origin port
        if (typeof restoreActiveEscorts === 'function') {
            restoreActiveEscorts();
        }
    }

    // Initialize emergency fuel for legacy saves that don't have it
    initializeEmergencyFuel() {
        if (!this.character || !game.ship) return;

        // Check if emergency fuel fields are missing (legacy save)
        if (typeof game.ship.emergencyFuel === 'undefined') {
            // Calculate emergency fuel as 5% of max fuel capacity
            game.ship.emergencyFuelMax = Math.max(25, Math.floor(game.ship.fuelMax * 0.05));
            game.ship.emergencyFuel = game.ship.emergencyFuelMax;

            console.log(`Initialized emergency fuel system: ${game.ship.emergencyFuel}/${game.ship.emergencyFuelMax}`);

            // Save the updated character data
            this.saveCharacter(true);
        }
    }

    // Save character data
    saveCharacter(immediate = false) {
        if (!this.autoSaveEnabled || !this.character) return;

        const now = Date.now();

        // Throttle saves unless immediate
        if (!immediate && now - this.lastSaveTime < this.saveThrottle) {
            this.pendingSave = true;
            return;
        }

        try {
            // Update character data from current game state
            this.updateCharacterFromGame();

            // Save to localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.character));

            this.lastSaveTime = now;
            this.pendingSave = false;

            console.log("Character auto-saved");
        } catch (error) {
            console.error("Error saving character:", error);
        }
    }

    // Update character data from current game state
    updateCharacterFromGame() {
        if (!this.character || !game.ship) return;

        // Update ship state
        Object.assign(this.character.ship, {
            x: game.ship.x,
            y: game.ship.y,
            angle: game.ship.angle,
            velocity: { ...game.ship.velocity },
            fuel: game.ship.fuel,
            fuelMax: game.ship.fuelMax,
            emergencyFuel: game.ship.emergencyFuel,
            emergencyFuelMax: game.ship.emergencyFuelMax,
            hull: game.ship.hull,
            hullMax: game.ship.hullMax,
            shield: game.ship.shield,
            shieldMax: game.ship.shieldMax,
            credits: game.ship.credits,
            cargo: { ...game.ship.cargo },
            cargoMax: game.ship.cargoMax,
            hullId: game.ship.hullId,
            name: game.ship.name,
            mods: [...(game.ship.mods || [])],
            log: [...(game.ship.log || [])],
            upgrades: { ...game.ship.upgrades },
            weapons: {
                lasers: { ...game.ship.weapons.lasers },
                missiles: { ...game.ship.weapons.missiles }
            },
            systems: { ...game.ship.systems }
        });

        // Update game state
        this.character.gameState = {
            isDocked: game.isDocked || false,
            currentPlanet: game.currentPlanet,
            isEngaged: game.isEngaged || false,
            currentEvent: game.currentEvent,
            lastPosition: { x: game.ship.x, y: game.ship.y }
        };

        // World state: economy, missions, combat streak, hazards
        this.character.world = {
            markets: game.planets.map(p => ({
                name: p.name,
                buy: { ...(p.market ? p.market.buy : {}) },
                sell: { ...(p.market ? p.market.sell : {}) }
            })),
            ledger: JSON.parse(JSON.stringify(economy.ledger)),
            marketEvent: economy.marketEvent ? { ...economy.marketEvent } : null,
            eventCooldown: economy.eventCooldown,
            missions: JSON.parse(JSON.stringify(game.missions || [])),
            combatStreak: game.combatStreak || 0,
            asteroids: JSON.parse(JSON.stringify(game.asteroids || [])),
            drops: JSON.parse(JSON.stringify(game.drops || []))
        };

        // Update last played time
        this.character.lastPlayed = Date.now();
    }

    // Auto-save timer for periodic saves
    startAutoSaveTimer() {
        setInterval(() => {
            if (this.pendingSave) {
                this.saveCharacter();
            }
        }, 2000); // Check every 2 seconds for pending saves
    }

    // Trigger auto-save on major events
    triggerAutoSave(eventType) {
        console.log(`Auto-save triggered: ${eventType}`);

        // Update statistics based on event type
        switch(eventType) {
            case 'dock':
                const planetName = game.currentPlanet?.name;
                if (planetName && !this.character.progress.planetsVisited.includes(planetName)) {
                    this.character.progress.planetsVisited.push(planetName);
                }
                break;
            case 'upgrade':
                // Statistics are updated when credits change
                break;
            case 'combat_victory':
                this.character.progress.enemiesDestroyed++;
                break;
            case 'trade':
                // Credits tracking handled in updateCharacterFromGame
                break;
        }

        this.saveCharacter(true); // Immediate save for major events
    }

    // Export character data for testing/backup
    exportCharacter() {
        if (!this.character) return null;

        this.updateCharacterFromGame();
        return JSON.stringify(this.character, null, 2);
    }

    // Import character data for testing/restore
    importCharacter(jsonData) {
        try {
            const imported = JSON.parse(jsonData);

            // Basic validation
            if (imported.version && imported.id && imported.ship) {
                this.character = imported;
                this.saveCharacter(true);
                this.applyCharacterToGame();
                console.log("Character imported successfully");
                return true;
            } else {
                console.error("Invalid character data format");
                return false;
            }
        } catch (error) {
            console.error("Error importing character:", error);
            return false;
        }
    }

    // Get character statistics for display
    getStats() {
        if (!this.character) return null;

        this.updateCharacterFromGame();
        return {
            id: this.character.id,
            created: new Date(this.character.created).toLocaleDateString(),
            lastPlayed: new Date(this.character.lastPlayed).toLocaleDateString(),
            credits: this.character.ship.credits,
            planetsVisited: this.character.progress.planetsVisited.length,
            enemiesDestroyed: this.character.progress.enemiesDestroyed,
            playtimeMinutes: Math.floor((Date.now() - this.character.created) / 60000)
        };
    }
}

// Global character manager instance
const characterManager = new CharacterManager();

// Auto-save trigger functions to be called from other systems
function autoSave(eventType) {
    characterManager.triggerAutoSave(eventType);
}

// Export/import functions for testing
function exportCharacterData() {
    return characterManager.exportCharacter();
}

function importCharacterData(jsonData) {
    return characterManager.importCharacter(jsonData);
}

// Console testing functions
window.exportCharacter = function() {
    const data = exportCharacterData();
    console.log("Character data exported:");
    console.log(data);

    // Also copy to clipboard if available
    if (navigator.clipboard) {
        navigator.clipboard.writeText(data).then(() => {
            console.log("Character data copied to clipboard!");
        });
    }

    return data;
};

window.importCharacter = function(jsonData) {
    if (!jsonData) {
        console.log("Usage: importCharacter(jsonDataString)");
        return false;
    }

    const result = importCharacterData(jsonData);
    if (result) {
        console.log("Character imported successfully! Reloading UI...");
        updateUI();
        if (game.isDocked) {
            updateTradingInterface(game.currentPlanet);
        }
    } else {
        console.log("Failed to import character data");
    }
    return result;
};

window.getCharacterStats = function() {
    const stats = characterManager.getStats();
    console.log("Character Statistics:");
    console.table(stats);
    return stats;
};

window.resetCharacter = function() {
    if (confirm("Are you sure you want to reset your character? This cannot be undone!")) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
};