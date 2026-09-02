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
//
// salvage (M6, all fields optional): what a charted site's cache yields when it
// REGENERATES. The server owns readiness (world.poiState[id].nextSalvageAt,
// rolled 12-24h out after each claim); salvage is first-come galaxy-wide —
// whoever flies out first collects, per the shared mission-board/loot-drop
// precedent. Roughly a third of the discovery reward: a reason to fly the dark
// again, not a substitute for finding the site. Never grants mod/lore/questSeed.
// The known planet cluster sits at x 500-3000, y 400-2000. Every POI lives OUT
// past that, in the dark — several at negative coordinates, giving a real
// reason to fly off the edge of the map (and exercising the wrapped starfield).
globalThis.SIM_POIS = [
    {
        id: 'wraith_cache',
        name: 'The Wraith Cache',
        x: 3650, y: 2650,          // SE, out past Frontier Outpost (3000,2000)
        kind: 'derelict',          // archetype → icon/color (see POI_KINDS in js/exploration.js)
        blurb: 'A dead ore-hauler drifts here, reactor cold for a century. Its holds ' +
               'were never emptied — someone left in a hurry, and never came back.',
        discoveryRadius: 75,
        salvage: { credits: 300, relics: 1, xp: 20 },
        reward: { credits: 900, relics: 3, xp: 60,
                  lore: 'Charted the Wraith Cache — a derelict hauler out past the Frontier.' }
    },
    {
        id: 'silent_beacon',
        name: 'The Silent Beacon',
        x: 1600, y: -1500,         // far north, off the top of the known map
        kind: 'beacon',
        blurb: 'A distress beacon still pulsing on a dead channel, ages after whoever ' +
               'lit it stopped answering. The salvage rights alone are worth the trip.',
        discoveryRadius: 80,
        salvage: { credits: 400, xp: 25 },
        reward: { credits: 1200, xp: 70,
                  lore: 'Answered the Silent Beacon — a distress call nobody else came for.' }
    },
    {
        id: 'gravity_eddy',
        name: 'Halgren\'s Eddy',
        x: -1700, y: 900,          // deep west, negative x
        kind: 'anomaly',
        blurb: 'Space folds wrong here — a slow whirl of light where a star should be. ' +
               'The first survey drones never came back; their telemetry sells for a fortune.',
        discoveryRadius: 85,
        salvage: { credits: 250, xp: 30 },
        reward: { credits: 800, xp: 90,
                  lore: 'Mapped Halgren\'s Eddy — a gravitational anomaly out in the western dark.' }
    },
    {
        id: 'ossuary_dig',
        name: 'The Ossuary Dig',
        x: -400, y: -900,          // NW dark, out past the Ossuary Drift ruins (500,500)
        kind: 'cache',
        blurb: 'A precursor tomb-field the diggers of Ossuary Drift only whisper about. ' +
               'The relics here are the real thing — and something down there is still counting.',
        discoveryRadius: 90,
        salvage: { credits: 200, relics: 2, xp: 25 },
        reward: { credits: 600, relics: 5, xp: 80,
                  lore: 'Broke ground at the Ossuary Dig — a precursor tomb-field in the deep NW.',
                  questSeed: 'ossuary_drift' } // rail for the future dig-quest (NEXT-SESSION watchlist)
    },
    {
        id: 'smugglers_reef',
        name: 'Smuggler\'s Reef',
        x: -1100, y: 3000,         // SW dark, a hidden port
        kind: 'outpost',
        blurb: 'A shanty-station bolted to a drifting asteroid reef, off every customs chart. ' +
               'They ask no questions here, and they pay finder\'s fees in hard credits.',
        discoveryRadius: 80,
        salvage: { credits: 500, xp: 20 },
        reward: { credits: 1500, xp: 60,
                  lore: 'Found Smuggler\'s Reef — a hidden free port off the customs charts.' }
    },
    {
        id: 'the_choir',
        name: 'The Drowned Choir',
        x: 4300, y: 3500,          // deep SE, the far dark
        kind: 'derelict',
        blurb: 'A precursor relay-hulk the size of a moon, its dead antennae still singing to ' +
               'no one. Whatever tuned it left gear behind that a good mechanic can still use.',
        discoveryRadius: 95,
        salvage: { credits: 350, xp: 35 },
        reward: { credits: 1000, xp: 100, mod: 'songbird_antenna',
                  lore: 'Boarded the Drowned Choir — a precursor relay-hulk in the far SE dark.' }
    },
    {
        id: 'twin_pulsar',
        name: 'The Twin Pulsar',
        x: 3900, y: -1100,         // NE dark
        kind: 'anomaly',
        blurb: 'Two dead stars locked in a death-spiral, strobing the void white. Beautiful, ' +
               'and lethal — the drones that survive the radiation bring back priceless data.',
        discoveryRadius: 85,
        salvage: { credits: 350, relics: 1, xp: 30 },
        reward: { credits: 1100, relics: 2, xp: 85,
                  lore: 'Charted the Twin Pulsar — a binary anomaly in the northeastern dark.' }
    }
];
