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
            credits: 1000,
            cargo: {},
            cargoMax: 10,
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
            }
        },

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

        // Apply game state
        game.isDocked = this.character.gameState.isDocked;
        game.currentPlanet = this.character.gameState.currentPlanet;
        game.isEngaged = this.character.gameState.isEngaged;
        game.currentEvent = this.character.gameState.currentEvent;

        console.log("Character data applied to game state");
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
            credits: game.ship.credits,
            cargo: { ...game.ship.cargo },
            cargoMax: game.ship.cargoMax,
            upgrades: { ...game.ship.upgrades },
            weapons: {
                lasers: { ...game.ship.weapons.lasers },
                missiles: { ...game.ship.weapons.missiles }
            }
        });

        // Update game state
        this.character.gameState = {
            isDocked: game.isDocked || false,
            currentPlanet: game.currentPlanet,
            isEngaged: game.isEngaged || false,
            currentEvent: game.currentEvent,
            lastPosition: { x: game.ship.x, y: game.ship.y }
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