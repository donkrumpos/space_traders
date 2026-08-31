// Shared sim data: points of interest — the hidden sites out in the dark that
// pilots discover by flying to them. Same side-effect-script pattern as
// js/sim/planets.js (sets globalThis.SIM_POIS): loaded as a <script> tag before
// game.js in the browser, and via await import() on the server for discovery
// validation. NO window/DOM references allowed here.
//
// A POI is charted the first time any ship comes within `discoveryRadius`.
// Discovery is a shared, persistent fact on the server (world.discoveredPOIs,
// keyed by id) — the FIRST pilot galaxy-wide to reach a site is remembered as
// its charter ("first charted by Arthur"), and the site then shows as a
// landmark on everyone's map. The reward is granted locally to whoever reaches
// a site (co-op friendly — every family member gets the discovery moment); the
// charter naming is the bragging-rights layer on top. (Whether loot should
// instead be scarce/first-come is a tuning flag — see TEST-PLAN / NEXT-SESSION.)
//
// reward schema (all fields optional, forward-compatible with the RPG/quest
// milestone — grantPOIReward in js/exploration.js applies what's present):
//   credits   number  — added to the wallet
//   relics    number  — Precursor Relics dropped into the hold (capped to space)
//   xp        number  — pilot XP toward the next rank
//   mod       string  — a one-off ship mod id (js/ships.js MODS) granted if new
//   lore      string  — a line written into the ship's log
//   questSeed string  — reserved: a quest id for the future quest system (logged)
globalThis.SIM_POIS = [
    {
        id: 'wraith_cache',
        name: 'The Wraith Cache',
        x: 3650, y: 2650,          // out past Frontier Outpost (3000,2000) — into the dark
        kind: 'derelict',          // archetype → icon/color (see POI_KINDS in js/exploration.js)
        blurb: 'A dead ore-hauler drifts here, reactor cold for a century. Its holds ' +
               'were never emptied — someone left in a hurry, and never came back.',
        discoveryRadius: 75,
        reward: { credits: 900, relics: 3, xp: 60,
                  lore: 'Charted the Wraith Cache — a derelict hauler out past the Frontier.' }
    }
];
