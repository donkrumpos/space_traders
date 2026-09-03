// Shared server config, sent to clients in the welcome message (PROTOCOL.md).
export default {
    friendlyFire: false,
    raidScale: 'perPilot',
    tickHz: 10,
    saveIntervalMs: 5000,
    // M3 world persistence: debounce after any change + periodic flush
    worldSaveDebounceMs: 5000,
    worldSaveIntervalMs: 60000,
    // M4 combat authority: server-side loot-drop lifetime (matches the ~60s
    // local feel) and the per-extra-pilot raid-band reinforcement cap
    dropExpiryMs: 60000,
    raidExtraMinionCap: 2,
    // Pirate-pressure overrides: entries here Object.assign over the shared
    // CombatCore.COMBAT_TUNING defaults at boot (see js/sim/combat-core.js
    // for the full knob list — wealth bands, maxEnemies, spawn/band cadence,
    // stationNoSpawnRadius, undockGraceSec). Empty = ship the shared numbers.
    combatTuning: {}
};
