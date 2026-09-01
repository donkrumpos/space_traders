# Next Session Roadmap

State as of 2026-08-31 (third session — **UI milestone DESIGNED, ready to
build**): the confusing-sidebar milestone got a full information-design pass
plus a much bigger vision riff. No game/server code changed this session (docs +
mockups only, so gates were skipped) — **the next session BUILDS Slice 1.**

**What this session produced (all on `feature/exploration-poi`, uncommitted →
now committed):**
- `docs/ship-design-vision.md` — **the north star.** The sidebar redesign
  cracked open into "the ship IS the character": three views of one ship
  (**Avatar** in flight / **Schematic** glance-HUD / **Ship Bay** detail+mod),
  "kill the word *level*" → components + **power budget + hull space +
  tradeoffs**, and a **production chain** tying ship tech to the *existing*
  trade-good lore (Ferrovolt Ore→reactors, Cognition Cores→droids, Panacea
  Vials→med bay, Precursor Relics→exotic tech). **§7 is the in-scope build;
  §8 is the sequenced later work.** Read this first.
- `mockups/sidebar-redesign.html` — Current vs A/B/C vs the **★ Recommended
  Contextual Hybrid** (pinned gauges + a state-driven "Now" zone that swaps by
  situation: cruising / near-derelict / docking / combat / low-fuel / docked).
- `mockups/ship-schematic.html` — the **Vitals band = a drawn ship** that
  encodes hull/shield/fuel/cargo/upgrades/damage in ONE image (cargo bay fills
  cell-by-cell, shield envelope thins, hit parts flash red). Interactive.
- `mockups/ship-bay.html` — the detail/mod view: live reactor+bay budgets,
  components with lore materials + tradeoffs, crew/droid/bacta slots, install
  buttons that ENFORCE the power budget (proves "not levels, but planning").

**DECISIONS PINNED with the user this session:**
1. Direction = the **Contextual Hybrid**, built around the **ship schematic** as
   the Vitals band (user's idea, stronger than abstract gauges).
2. Art question resolved by the three-view model: **Avatar stays vector**
   (rotates cheap), **Schematic + Bay never rotate** → can be lavish/pixel later.
   The schematic is the ideal FIRST custom-art test (contained, rotation-free).
   User's gut is SNES pixel; not committed — test it on the schematic first.
3. Modding/economy vision (crew quarters, gunner stations, droids, factories,
   material-gated power) is a **north-star RPG milestone (§8), NOT slice 1** —
   captured so it isn't lost; build loops-first.

**BUILD NEXT — Slice 1: the Schematic readout as the real sidebar Vitals band.**
Replaces four panels (Ship Status + Ship Upgrades + Cargo Hold + systems-down
warning) with one drawn ship (SVG) + a small numerics strip. NUMBER-FREE glance;
capacity encoded as form (cargo grid, shield-envelope thickness, engine size);
damage flashes the hit part red. **Draw the regions as slots from day one** so
the Bay/modding drops in later with no rework. NO power budget / modding /
factories yet — just the readout. **CAUTION:** keep the DOM ids verify.js reads
(`#credits #fuel #hull #shieldVal #cargoUsed #pilotRank #missiles #weaponMode`
etc.) — the schematic's numerics strip can carry them, or update the suite in
the SAME slice. Fold in the per-frame perf fix here: `updateUI()` runs every
tick (physics.js:164) and rebuilds via `innerHTML` — switch to cached element
refs / targeted SVG attribute writes. Both gates green, commit per slice, add a
TEST-PLAN section. Then Slice 2 = Records tabs, Slice 3 = the contextual Now
zone (see the sidebar mockup).

---

State as of 2026-08-31 (second session): **Persistent World milestone ("The
World Remembers and Moves") built on the SAME branch `feature/exploration-poi`
(NOT merged, NOT deployed) — three verified slices on top of exploration:**

1. **Chronicle** (6387d26): persisted capped world ledger (charters, boss
   kills, market events, + later kinds), `chronicle.add` broadcasts,
   `welcome.lastSeen`, "While you were away" digest + Galaxy Log panel
   (`js/chronicle.js`). Also fixed en route: POI lore wrote raw strings into
   the ship log → rendered "undefined" (now via addShipLog).
2. **Regenerating caches** (6dea990): `world.poiState[id].nextSalvageAt`,
   12-24h wall-clock windows COMPUTED on read (no timers — restart/idle-proof;
   boot migration seeds windows for already-charted worlds). Salvage is
   first-come galaxy-wide, ~⅓ of discovery reward (tables in js/sim/pois.js),
   ✦/ETA map markers, chronicle entries.
3. **Occupations** (0343e18): daily-ish persisted roll, grudge-weighted
   faction digs in at a charted site (max 2, salvage blocked, ⚑ marker);
   flying within 1000u musters the band AT the site (combat.mjs, members
   tagged `occupyingPoi`); boss kill = liberation → cache opens immediately +
   chronicled. Kickoff forks pinned with the user via AskUserQuestion:
   chronicle+living-sites, adds+occupations (no losses), daily-ish cadence,
   digest+log-panel UI.

Gates green after every slice; final: **solo ?verify 144/144, verify-net
136/136** (new suites: solo chronicle+salvage(+occupation asserts); net
[chronicle], [salvage], [occupation]). PROTOCOL.md has the full **"M6 —
persistent living world"** wire section. TEST-PLAN.md Part 1 is the new
playtest hand-off (incl. VERIFY_DEBUG console commands to force windows/
occupations without waiting 12-24h).

**Next session (user-requested, 2026-08-31 playtest): compact-UI milestone.**
PORT DECISION SETTLED (user chose, 2026-08-31): **Space Traders stays a
laptop/desktop game.** The Iceswitch (son's germ-shape wooden handheld, Pi
Zero 2W + 480×320 SPI screen — full spec in the sibling repo:
`~/Documents/Projects/reliquary/knowledge/electronics/germ-shape-console.md`)
gets **Arthur-scale original games instead** (its own Phase 2 Pygame plan),
which match its hardware. The port stays a parked, zero-cost option: a
one-bench-session `cog` fps spike at 480×320 could reopen it; no hardware
purchase unless that spike fails AND the port is still wanted (then a
Pi-Zero-FOOTPRINT board ~$25-40, NOT a Pi 4 — the PowerBoost 1000C's 1A
output and the carved cavity rule the big boards out).

**The UI milestone's real goal (user clarified at sync): LEGIBILITY, not
size.** The sidebar drawer is **confusing** — a wall of same-looking stacked
text panels (ship status, cargo, nav, missions, crew, reputation, Galaxy Log,
ledger, upgrades) with no visual hierarchy; the user "wonders if it can be
redesigned, perhaps with visuals to help scan things" and knows it's a hard
job. So the milestone is an information-design pass: what does a pilot need
at a glance vs on demand, and how do icons/color/grouping/gauges make state
scannable instead of readable. Secondary benefits, in order: compact enough
for two windows side by side on one screen (family testing); working near
480×320 would keep the parked Iceswitch option warm (distant bonus, not a
requirement). Same workflow as the last two milestones: diagnose the current
UI's information architecture FIRST (inventory every panel: what it shows,
when it matters, how often it changes), propose 2-3 redesign directions with
mockups, pin the forks with the user, then build in verified slices — the
gates don't assert visuals, so add a TEST-PLAN section per slice and keep the
existing DOM ids/console hooks stable where the verify suites read them
(verify.js asserts on #credits, #pilotRank, #factionPanel, #chroniclePanel,
#missionList, #crewList, #shipLogList etc. — renaming ids means updating
suites in the same slice). Fold in the per-frame UI perf backlog (updateUI
innerHTML rebuilds, full-map canvas realloc, ~25 getElementById/frame,
shadowBlur + gradient allocs) — same code, same milestone. Art constraint
still holds: this is layout/hierarchy/iconography (structure), not an art
pass.

**Other milestone candidates** (pick after playtest): quest chains off the
questSeed rails (Ossuary dig-quest); death broadcast + death chronicle
entries (known M4 gap, now more visible since deaths are the one big event
the ledger misses); occupation expiry knob if the map feels naggy; flipping
salvage to per-pilot if first-come breeds family resentment.

Earlier-same-day exploration state (still true): seven POIs, first-charter
landmarks, per-pilot discovery rewards, wrapped starfield, M5 wire section.
Open design flags to settle via playtest: reward-per-visitor vs scarce
first-come loot (now PARTIALLY settled: discovery per-visitor, salvage
first-come — confirm it feels right); sensor-ping-then-fly-in vs pure fly-in
discovery; whether to physically spread the planets out too; POI art (still
placeholder glyphs).

(2026-08-06 review-hardening session record follows.)

State as of 2026-08-06: **Code-review hardening session — two batches committed
and pushed (5a9623a, 81f8bf8), both gates green after each** (solo ?verify
102/102, verify-net 93/93). Four parallel review agents swept client logic,
net/server, render/UI, and repo structure; the top two tiers of findings are
fixed, the rest are backlogged below. **The server-side fixes are NOT yet
deployed to themisto** — first order of business next session.
(2026-07-08 family playtest record: commit 66689f5.)

## Deploy first (5 minutes)

- **Also undeployed now:** the `feature/exploration-poi` server changes — POI
  discovery handler + snapshot field AND the whole M6 layer (chronicle,
  poiState/salvage, occupations; world.mjs/combat.mjs/server.mjs). Fold into
  the same themisto deploy once the branch is playtested and merged. The M6
  boot migration seeds cache windows for any sites already charted on prod.
- `ssh themisto` pull + restart per RUNBOOK.md to pick up: crash guards
  (malformed-URL 400, uncaughtException flushes world before dying), ws
  maxPayload 256KB + hello timeout, Object.hasOwn trade validation, backups
  pruning (existing bloat shrinks on each pilot's next save).
- Note: local dev needed `npm rebuild better-sqlite3` after node hit v25.9 —
  if themisto's node ever jumps majors, same rebuild applies (an `engines`
  field in package.json is a backlogged nicety).

## What the review session shipped (2026-08-06, 5a9623a → 81f8bf8)

- **Fixed-timestep game loop** — THE fix of the session. update() ticks were
  literally display-refresh-rate (hardcoded 1/60 assumption): a 120Hz screen
  ran the whole game 2× fast. Now a rAF-clocked accumulator spends real time
  in whole 60Hz ticks (250ms clamp eats the tab-switch delta), and rAF re-arms
  *before* the tick so a thrown frame logs instead of freezing the game until
  reload. Subtlety: all timing comes from rAF's own timestamps — mixing in
  performance.now() broke under headless virtual time (verify caught it).
- **Escort-dock crash:** completeMissionsAt skips non-delivery missions;
  docking at an escort's destination threw on goods[undefined] mid-dock.
- **Docked = station shielding:** damagePlayer early-returns while docked
  (single choke point for all damage), enemy bolts pass docked ships, respawn
  defensively undocks. Dying docked used to respawn you still "docked" at a
  far planet with weapons locked.
- **Save safety:** CHARACTER_VERSION bump now migrates in place with the
  original stashed to a backup localStorage key (was: silently discard every
  pilot). importCharacter applies before saving (was: restore clobbered the
  imported doc with pre-import state — a no-op).
- **Server integrity:** trade validation uses Object.hasOwn (inherited keys
  like "toString" passed `!== undefined` and persisted NaN prices into the
  shared market); savePilot prunes backups to last-20-per-pilot in-transaction
  (verified against a scratch db — was unbounded, one full doc per save).

## Review backlog (third batch candidates, verified findings)

- **Perf, all per-frame:** updateUI() rebuilds panels via chained
  `innerHTML +=` every frame; full-map canvas resized (= backing store
  realloc + clear) every frame while open; ~25 getElementById/frame in ui.js;
  per-ghost shadowBlur + per-frame gradient allocs in render.js.
- **Net nits:** `mission.taken` reply omits reqId → double-clicked board
  offers can resolve the wrong promise (one-line server echo); `dev-secret`
  fallback when FAMILY_SECRET env is missing — should refuse to start;
  same-pilot-two-devices = 30s kick ping-pong with alternating save clobbers;
  market-event timeLeft stale for mid-event joiners (send endsAt);
  damage.claim/cargo.scatter fully client-trusted (cap per-weapon damage).
- **Coverage:** verify.js has no trading/economy/events suites — the
  most-played systems have zero solo assertions (~50 lines each in the
  existing VERIFY_SUITES pattern); no `npm run verify` script that can
  actually exit nonzero (one-liner lives in a comment).
- **Hygiene:** README badly drifted (5 planets, "combat in development", no
  multiplayer); PROTOCOL.md says 92/92; index_original.html is 827 dead
  lines; RUNBOOK publishes VPS IP/ssh port/username — move to private ssh
  config; DOCK_RANGE 60 hardcoded ×4; cargoUnitsCarried() re-inlined ×7;
  starfield doesn't wrap (sky empties flying far negative); fuel depot fill
  leaves credits fractional.

## Next playtest watchlist (carried from 2026-07-08)

- **Deaths are real now.** Does the warlord tier feel earned or cheap for
  Arthur at high wealth? Knobs: per-tier `leadFactor`, 0.2 rad fire gate.
- Does the corpse run land as fun? Pod lock 8s / expiry 90s tunable.
- Scout fire rate is low (orbit speed vs turn speed — they chase their own
  aim). Fine for beginners; revisit if scouts feel decorative.
- Economy: bounty income vs trading is closer now that combat has risk, but
  the streak ×3 multiplier deserves a look with real death risk priced in.
- Foggy's ledger insight: his home 4-planet circuit is price-depressed from
  grinding (markets remember, shared server-wide); Mining 7 / Meridian /
  Frontier untouched. Watch whether drift recovers the depressed markets or
  they need a homeostasis nudge.
- Reliquary Hold as bench mod is v1 — Foggy wants it quest-shaped eventually
  (Ossuary Drift dig-quest is the natural home when a quest system exists).
- **New since review:** 120Hz devices now run at correct speed — if anyone's
  device previously felt "faster", that was real and is now fixed; combat
  pacing may feel different on those machines.

## Known v1 gaps (documented in PROTOCOL.md; post-playtest candidates)

- Online NPC freighters are indestructible (no server projectile sim).
- Named bounty warlords stay client-local online.
- Peers don't see your death (no death broadcast — your ghost just sits
  still for 4s, then teleports home). Candidate: broadcast + explosion FX.
- No `www.` DNS record / cert (bare domain only).

## Tuning flags (carried)

- Hull prices vs. income rate; skiff upgrade caps; mod stock rate (45%/dock);
  trade-in 60%; XP sell-loop exploit; escort freighter speed 3.2; VENDETTA
  has no forgiveness mechanic (grudge amnesty seed carried).

## Workflow that works

Same as always, now with a net gate: one-sentence playtest note → diagnose →
build → verify (`?verify` 102/102 solo AND `node verify-net.mjs` 93/93) →
commit → `ssh themisto '...'` update line from RUNBOOK.md. Serve local:
python3 -m http.server 8377. Console: grantXP(n), nameShip('...'),
spawnRaidBand(), exportCharacter(), netStatus(), netGhosts(), netWorld(),
netCombat(). For balance questions, simulate first: /tmp-style node harness
importing js/sim/combat-core.js settled the "can't die" bug empirically.
