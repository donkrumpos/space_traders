# The Widening Reach — universe-expansion readiness

> Status: **PROPOSED** (2026-09-03). The developer floated the direction —
> "the current game is the tutorial section, and the world keeps going
> forever, adding planets, pirates, lore, and goods" — and asked for a
> readiness plan. Nothing here is built or pinned. This doc is the map:
> what the code already supports (three-agent audit, 2026-09-03), what
> would bite, and a ladder of standalone slices that make expansion cheap
> when the phase begins. Forks marked ⚖ need pinning before their slice
> starts.

---

## 1. The proposed vision (riffed, not yet pinned)

- **The seven worlds are the settled core** — the campfire, the tutorial,
  the market hub. They never become disposable: the core is where the
  chronicle is *read* (shipyards, benches, the Ledger's money); the
  frontier is where it's *written*, and wealth flows back.
- **The reach grows in authored REGIONS, not uniform sprawl.** The
  multiplayer moments (salvage races, wrecks, occupations) need the family
  in roughly the same space, so the frontier opens in clusters — a shared
  frontier that moves outward together.
- **The spreadsheet/poetry split** (the lore bible's gift, §3): Combine
  charter designations are Function + Class + Index — *generatable on
  purpose*. "Mining Station 4, gone dark" from a generator isn't filler;
  it's diegetically correct. Generated places are ledger rows; the
  earned-name mechanic (a chronicled, permanent naming event) is how play
  turns a row into a place. Identity is authored or earned, never rolled.
- **Goods and cartels grow rarely, and each arrives with a fate.** A ninth
  good is a world event tied to a region (something that only exists out
  there), not ambient noise. A new cartel is a new region's shadow. The
  infinite-faction generator already exists: player factions (M7).
- **The mysteries stay unanswered** (bible rule 2). An endless reach is
  the best friend an unanswerable mystery can have — expansion narrows,
  never resolves.

---

## 2. What the audit found (2026-09-03)

Three parallel audit passes: content definitions; server/protocol/
persistence; UI/map/verify assumptions. Condensed, with the load-bearing
file refs.

### Already expansion-ready (don't rebuild what works)

- **Planets and POIs are "add a row and it works."** Everything derives
  from `SIM_PLANETS`/`SIM_POIS` (js/sim/planets.js, pois.js) — economy,
  missions, traffic, navigation, gravity, shipyards, upgrade shops,
  nearest-world death naming, occupation candidates. No fixed-count
  assumptions in production code. POIs are the cleanest: id-driven, every
  reward field optional and guarded, unknown `kind` degrades to derelict.
- **Unknown ids fail safe on both sides of the wire.** Server validates
  every content-keyed message (`POI_IDS.has`, `metaByName.get` → reject);
  client `apply*` functions guard on `poiById() === null` and drop
  silently; chronicle lines fall back to raw ids as text. Old client + new
  world = orphaned visuals at worst, never a crash.
- **Persistence merges per-planet/per-POI on restore** (server/world.mjs
  boot merge), so roster growth boots clean with zero migration — new
  entries get fresh markets/boards/cache cycles, old state survives.
- **Scale is a non-issue at any plausible size.** The 10Hz `world.tick`
  carries entities, not planets — flat cost regardless of roster. Market
  events pick one planet per roll. 50 planets ≈ 10× the *connect-time*
  snapshot (fine) and O(planets) scans in rare paths (fine).
- **Minimap, starfield, and save format need nothing.** Minimap is a
  range-culled 3000u sensor slice; the parallax starfield tiles
  infinitely in all directions; saves are name/id-keyed and additive
  (absent planets skipped, new planets get fresh markets).
- **Danger already travels.** Spawns anchor on pilots wherever they are
  (server/combat.mjs:153) — the void is never safe. What's missing is
  *differentiation*, not coverage (see R5).

### Coupling debt (would bite during expansion)

- **Respawn/start position `1050,850` is hardcoded** in three places
  (js/game.js:6, js/combat.js:827, js/character.js:16) — not derived from
  any planet. Asteroid belts are literal coordinates keyed to planets only
  by comment (js/world.js:5-7).
- **`'contraband'` is a magic string** (economy-core.js:100,115;
  trading.js:48). A second illegal good means hand-copying the
  special-casing; should be an `illegal: true` field on the good.
- **`ship.upgrades` has 6 fixed keys** — a planet introducing a new
  upgrade type silently no-ops (undefined level → NaN cost, no error).
- **Faction referential integrity is half-guarded:** `amnesty.good` is
  verify-asserted, but a bad `minionTier` key **throws unguarded** at
  band-spawn time.
- **Goods satellite tables** (`MARKET_EVENT_FLAVORS`, `GOODS_GLYPHS`) are
  hand-maintained per good — both degrade gracefully at runtime and both
  have loud verify tripwires. Acceptable; just part of the "new good"
  checklist.

### The two real gaps (the actual blockers)

1. **No protocol version handshake — none.** `hello`/`welcome` carry no
   `worldVersion`/rosterHash field anywhere. A server on new world data
   has no way to tell a stale, already-connected client "reload." Today's
   forward-compat is purely ignore-unknown-ids — safe, but it silently
   orphans landmarks and musters hostiles under invisible sites. This is
   the one thing that makes shipping expanded world data *unsafe*, and
   it's small.
2. **The gates can't pin a test world.** Client, server, and both verify
   suites all read the same live `SIM_PLANETS`/`SIM_POIS` — there is no
   world fixture (the pilot has one: `seedCharDoc`; the world doesn't).
   Exactly two assertions break the instant the roster grows
   (js/verify.js:15 `planets.length === 7`; verify-net.mjs:1665 assumes
   the nearest world to (2300,1200) is Mining Station 7), and ~30-40 more
   are name-keyed to today's roster. Growing the world without a fixture
   means auditing every assertion in lockstep, every time.

Also real but secondary: **the full map is the one UI redesign target.**
It's a single static fit-to-content view (js/navigation.js:285-326) — a
planet at (20000, −15000) renders but crushes the whole cluster into a
few pixels. No pan, no zoom. The trade ledger grows unbounded per visited
station (crowding, not correctness). Traffic is a constant 3 freighters
(traffic-core.js:26) — 50 worlds would feel empty without scaling it.

---

## 3. The readiness ladder

Ordered slices. Each is standalone-valuable (worth doing even if the
expansion phase never comes), each rides the normal discipline: branch,
both gates green, explicit deploy. R1–R3 are cheap; R4 is the milestone;
R5–R7 are the phase itself.

- **R1 — Harden the seams** (small, do soon). `homeWorld: true` flag on a
  planet drives spawn/respawn (kills the 1050,850 triplication);
  `illegal: true` field on goods replaces the `'contraband'` string;
  belts keyed to planet names; referential-integrity verify assertions
  (every `minionTier` ∈ ENEMY_TIERS, every produces/demands key ∈ goods,
  every shipyard hull ∈ HULLS…) so bad content fails the gate, not prod.
- **R2 — A world fixture for the gates** (highest leverage). A
  `seedWorld`-style mechanism (mirroring `seedCharDoc`) so both suites
  can pin a small deterministic test-world independent of the live
  roster; rewrite the two roster-brittle assertions to derive from data.
  After R2, growing the real world doesn't touch the gates at all.
- **R3 — Version the world on the wire** (prerequisite for shipping any
  growth). `worldVersion` (or roster hash) in `hello`/`welcome`; on
  mismatch the client shows a one-line "the charts have grown — reload"
  banner. Tiny slice; unblocks everything after it.
- **R4 — The world as data (the milestone, "M8").** The server ships the
  roster (a `world.roster` message after welcome, or in the snapshot);
  the client builds `game.planets`/`game.pois` from the wire, falling
  back to the local files offline. The audit says the client's guarded
  apply/lookup paths already tolerate this. After R4, expanding the reach
  is a *server-side data change* — no client deploy, no repo lockstep,
  and the door opens to world data living in world.db instead of code.
- **R5 — Danger geography.** A region lookup (anchor coords → region)
  threaded through the existing single choke point every spawn already
  flows through (`COMBAT_TUNING` / `pickSpawnSpot` / `maxEnemiesFor` /
  tier + cadence rolls — combat-core.js:113-170), with per-region
  multipliers tunable via the existing server `config.combatTuning`
  override channel. Scale `TRADER_COUNT` with roster size. This is what
  makes "out there" read as a place instead of a treadmill.
- **R6 — A map worth a big world.** Full-map pan/zoom or a two-level view
  (region focus + reach overview); label decluttering; bound the trade
  ledger (nearest/most-recent N stations). The minimap needs nothing.
- **R7 — The region pipeline (the phase itself).** Define the "region
  pack": planets + POIs + belts + optional regional good + optional
  faction shadow + lore lines (bible rules apply — rent or cut), plus the
  naming machinery (generated charter designations for the spreadsheet
  layer, earned names as chronicled world events). Author region 1 by
  hand end-to-end before generating anything.

## 4. Forks to pin ⚖ (before their slice)

- **⚖ Expansion trigger** (R7): play-triggered ("the family charted all
  seven sites → the charts crack open") vs calendar cadence vs manual
  drops. Recommendation: play-triggered — it ties growth to the
  exploration-is-reward loop.
- **⚖ Procgen's role** (R7): none / scaffolding-only (positions, market
  seeds, charter-row names — identity stays authored) / full procgen.
  Recommendation: scaffolding-only; the spreadsheet/poetry split is the
  lore-safe ceiling for generation.
- **⚖ Fog vs shared charts** (R5/R7): does a new region appear on
  everyone's map as dark rumor, or stay invisible until first contact?
  (Today: POIs invisible until sensor-pinged; landmarks shared once
  charted — probably extend that rule to whole regions.)
- **⚖ New cartels vs deeper cartels** (R7): do new regions get new
  factions, or extend the three cartels' geography (Stations 1–6 are
  *Rustfang* history, after all)? Bears on the grudge economy.
- **⚖ Where world data ultimately lives** (R4): repo data files served by
  the server vs rows in world.db with an admin path. Start with the
  former (keeps authoring in git, gates, and code review); the latter
  only when in-play world mutation (planet renames, player-built sites)
  demands it.

## 5. What NOT to build

- **No naive infinite procgen identity** — a generated *name* is canon
  (that's the Combine's voice); a generated *character* is oatmeal. Rent
  or cut applies to generated content doubly.
- **No pre-scaling infra** — the 2026-09-01 decision stands: themisto's
  single-process shape is right; 50 planets cost nothing that matters.
- **No hollowing the core** — if a slice makes Agricon→Drum irrelevant to
  a Veteran, it's wrong; the frontier feeds the core or it doesn't ship.
- **No answering the Withdrawal** — every region may narrow the mystery
  only by opening a better question (bible rule 2).
