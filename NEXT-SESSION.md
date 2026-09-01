# Next Session Roadmap

State as of 2026-09-01 (ninth session — **visual-language Slice C BUILT
(ledger-fed deal bars)**): commit 8a2267d on `feature/exploration-poi`
(pushed; still NOT merged, NOT deployed; nothing server-side changed). One
commit:

1. **Slice C — deal bars + the ledger as a chart (8a2267d).** Both surfaces
   compare prices against YOUR OWN price memory (mockup §2's `.deal` column +
   §3's chart):
   - **Market deal bars** — every buy/sell row in the Dock district grows a
     `.deal-line`: a track scaled to here-price vs your best recorded price at
     OTHER ports, a `.deal-mark` where your best sits, and a tag ("cheapest
     known" / "best sell known" green · "near your best" · "worse than known"
     red). The `title` attr is the under-the-hood layer: here-price, your
     best, which port, one junkyard-voice line. **Empty ledger = no bars, and
     the here-port never compares against itself** — a good never priced
     ELSEWHERE shows nothing; scouting builds market sense (designed reward).
   - **The Ledger tab as a chart** — `updateLedgerUI` regroups `#ledgerList`
     BY GOOD (sell groups before buy — you hold cargo more than credits): a
     `.lrow` bar per station scaled to the group max, `.lrow.best` glowing
     green, event ⚡ kept per station, every price still printed.
   - Mechanics worth knowing cold: `ledgerBest(good, side, excludeStation)`
     (economy.js) is the ONE comparator both surfaces share ('buy' = min,
     'sell' = max over `economy.ledger`). `dealLine()` (trading.js) renders
     inside the existing `updateBuyingSectionUI`/`updateSellingSectionUI`, so
     bars rebuild on dock + after every trade — event-driven, no per-frame
     work. `.trade-item` gained `flex-wrap: wrap` so the deal line drops to
     its own full-width row (sell rows with long "(You have: n)" labels now
     wrap their qty buttons below at sidebar width — looks intentional, fine).
     CSS mirrors Slice B's gauge vocabulary (`.deal-track`/`.lbar` ≈
     `.svc-track`). New solo `deals` suite (9 asserts). Verified visually
     in-browser (claude-in-chrome): both surfaces match the mockup.

**Gates at tip: solo ?verify 202/202 (was 193), verify-net 136/136.**

**NEXT: build Slice D (interactive schematic + Ship-tab dissolution)** —
mockup §4: mods pin onto the schematic slots (◈), the under-the-hood card is
the only place numbers live, the Ship tab retires, the ship log's journal
lines merge into the Log tab. Then the milestone is done → deploy to themisto
(explicit, per RUNBOOK) and start MMO groundwork (player-founded factions,
lore-bible §9).

--- (eighth-session record follows) ---

State as of 2026-09-01 (eighth session — **visual-language Slice B BUILT
(dock districts) + rank language fully de-navied**): commits e2657a4..6ed051b
on `feature/exploration-poi` (pushed; still NOT merged, NOT deployed; nothing
server-side changed this session). Two commits:

1. **Slice B — dock districts (45b9d1e).** The docked `tradingPanel` was nine
   identically-cyan-headed sections in one scroll. It now splits into **two
   districts by decision tempo** (mockups/dock-visual-language.html §2), and
   docking always re-lands at the Dock:
   - **The Dock** (default, `#district-dock`) — the seconds loop: a **services
     icon strip** (`#servicesStrip`) of refuel / rearm / repair as three
     gauge-buttons (each = a service glyph + a fill gauge tracking the live pool
     level + the top-off cost + the action button), then market buy/sell (glyphed
     by Slice A), mission board, crew for hire.
   - **The Shipyard** (`#district-yard`) — the considered purchases (shipyard
     hulls, ship upgrades, weapon systems, mechanic's bench) behind a deliberate
     **"⇱ walk to the Shipyard"** door (`walkDistrict()`), greeted by a
     junkyard-voice line ("nothing here is new — inherited, salvaged, or grown").
     **"⇲ walk back"** returns. Burying the slow purchases is a feature (sheds
     half the every-dock wall) and plants the future planet-map seed.
   - Mechanics worth knowing cold: the 3 service symbols (`s-fuel`/`s-rearm`/
     `s-repair`) live in a **SEPARATE `#serviceSprite`** (index.html), NOT in
     icons.js's `#glyphSprite` — so the `icons` suite's goods-glyph count stays
     8. `resetDistrict()` (trading.js) runs inside `updateTradingInterface()` so
     every dock lands at the Dock (choice is non-persistent by design). Gauge
     fills ride the existing `updateFuelCost`/`updateMissileCost`/
     `updateRepairCost` via `setServiceGauge()` — event-driven, no per-frame.
     ALL section ids preserved (`#shipyardSection #modsSection #crewSection
     #missionBoard`, buy/sell, `#fuelCost/#missileCost/#repairCost` + buttons),
     so the ships/mods/crew/escort suites are untouched. New solo `districts`
     suite (9 asserts): dock lands on the Dock, door swaps to the Shipyard, both
     districts render, service strip carries live costs + its three glyphs.
2. **De-navy cleanup (6ed051b).** The rank ladder was de-navied in cc3ef06 but
   three literals were missed and the developer caught the HUD still reading
   "Cadet": index.html's `#pilotRank` placeholder (→ "· Deckhand", the real
   rank-0 first paint), crew.js's berth hint ("third berth at Star Marshal" — a
   deleted rank — → "Chartbreaker"), and a stale "Cadet" ui.js comment. Ranks
   are stored as an index; no mechanics change. (Full ladder in pilot.js:
   Deckhand/Runner/Pilot/Veteran/Ace/Captain/Shipmaster/Chartbreaker/Living
   Legend — "Captain" is legit at rank 5.)

**Gates at tip: solo ?verify 193/193 (was 184), verify-net 136/136.** Verified
Slice B visually in-browser (claude-in-chrome): both districts render to spec,
the door wraps cleanly at sidebar width (a narrow-width overflow was fixed,
CSS-only). Developer confirmed it in their own browser: "much nicer."

**DIRECTION PIVOT this session (developer, decided via AskUserQuestion): the
target is FULL MMO and FAMILY PLAYTEST IS RETIRED.** This supersedes the
"family as live-test guild" framing. Consequences for the workflow going
forward (see the [[space-traders-direction]] memory):
- **The two automated gates (solo `?verify` + `verify-net`) are the ONLY
  quality bar.** Stop writing TEST-PLAN family-playtest sections and "family
  playtest queued" backlog items. (TEST-PLAN.md still has legacy playtest
  sections incl. the Slice B one added this session — harmless, retire on touch,
  not worth a churn commit now.)
- **Deploy to themisto when a milestone lands** (still explicit per RUNBOOK.md,
  never auto) so the shared world stays live for the MMO push.
- **Roadmap:** FINISH the visual-language slices first (they're polish the MMO
  still wants), THEN pivot to MMO groundwork. **Build order: A glyphs ✓ →
  B districts ✓ → C ledger-fed deal bars → D interactive schematic + Ship-tab
  dissolution → MMO groundwork (player-founded factions, lore-bible §9).**

**NEXT: build Slice C (ledger-fed deal bars)** — the market rows compare each
price against YOUR ledger memory (empty ledger = no bars; scouting builds your
market sense). Spec is in mockups/dock-visual-language.html §3 (the Ledger tab
as a chart, grouped by good) and the market `.deal` column in §2. The ledger
data already exists (economy.js `updateLedgerUI`, `economy.ledger` keyed by
station; the `icons` suite exercises it). Then D (interactive schematic).

--- (seventh-session record follows) ---

State as of 2026-09-01 (seventh session — **visuals riff PINNED + glyph
Slice A BUILT + the LORE BIBLE written**): commits c5939d1..cc3ef06 on
`feature/exploration-poi` (pushed; still NOT merged, NOT deployed). Three
strands, all landed the same session:

**1. The visuals-over-text riff (mockups/dock-visual-language.html) — four
forks PINNED with the user via AskUserQuestion:** Ship tab dissolves into an
interactive schematic (mods pin to slots, log merges into the Log tab);
docked screen splits into TWO districts by decision tempo (Dock = fast loop
w/ services icon strip + market + missions + crew hire; Shipyard = the
thinking purchases behind a "walk out" door — burying them is a feature and
plants the future planet-map seed); goods glyphs FIRST, planet/rank insignia
later; market deal bars compare against YOUR ledger (empty ledger = no bars —
scouting builds market sense). Build order: **A glyphs → B districts → C
deal bars → D interactive schematic.**

**2. Slice A BUILT (551000c):** js/icons.js — 8 drawn-SVG goods glyphs as an
injected <symbol> sprite in the schematic's style; goodIcon() is the only
producer (name rides as <title> tooltip = the under-the-hood layer; unknown
goods fall back to the colored square). Swapped into cargo manifest, market
buy/sell rows, ledger, mission list, mission board. THE ART IS PLACEHOLDER
BY DESIGN (user call): call sites bind to #g-<type> ids, so redrawing when
lore firms up is a one-file swap. New solo `icons` suite (6 asserts).

**3. docs/lore-bible.md — READ IT BEFORE WRITING ANY CONTENT.** Four forks
pinned: Precursors **became the signal** (relics are fragments, still
transmitting; the Void Choir is half right); setting = **charter reach gone
feral** (the Meridian Charter Combine settled the reach for ferrovolt, named
worlds like ledger rows, then the Withdrawal — freighters just stopped);
MVP planet names **canonized as charter designations** (locals' nicknames:
the Drum, the Lantern, the Dreamworks, Lastlight, the Ledger, the Deep;
earning a real name = future live world event, Ossuary Drift already did);
every pirate faction is a planet's shadow (Rustfang = the Drum's abandoned
shift crews, Iron Shoal = the Deep's dispossessed divers, Void Choir =
signal-techs gone cult). Second pass from the Mad-Max-in-space riff: rule 7
**NO EMPIRES EVER** (power is local + personal; the differentiator is
"junkyard economy where the gasoline is ghosts"), Guild de-sainted, §9 =
**player-founded factions as the MMO north star** (a faction is a declared
WANT; founding = chronicle naming-event; grudges/occupations already treat
factions as plain data — never hardcode the three authored cartels).
Seed-content pass applied in-code (cc3ef06): Frontier's "Military" shop →
warlord-surplus/raid-scrap, all upgrade copy junkyard-voiced (facts kept),
event descriptions rewritten, and the **rank ladder de-navied**: Cadet/
Ensign/Commodore/Star Marshal → Deckhand/Runner/Shipmaster/Chartbreaker
(rank stored as index — saves untouched; FAMILY HEADS-UP: titles changed).

**Gates at tip: solo ?verify 184/184, verify-net 136/136.**

**NEXT: build Slice B (dock districts)** — the nine-section docked wall
splits into Dock + Shipyard per the mockup; the bible's junkyard voice now
feeds the Shipyard flavor ("nothing is new here"). Then C (ledger-fed deal
bars), D (interactive schematic + Ship-tab dissolution). Family playtest of
the finished sidebar (TEST-PLAN.md Part 0) still queued — Slice 3 watchlist
(state flicker at the 900u/600u edges, badges, tab-row growth) unchanged,
plus new: do the glyphs read at 16px for the family, and does anyone mourn
their old rank title.

(Sixth-session record follows.)

State as of 2026-09-01 (sixth session — **UI milestone Slice 3 BUILT — the
sidebar redesign is COMPLETE**): the contextual Now zone is live on
`feature/exploration-poi` (commit 95fef7e, pushed; still NOT merged, NOT
deployed — nothing server-side changed). The Navigation panel — the last
un-redesigned piece — is now state-driven per the ★ Contextual Hybrid: the
sidebar reads sticky vitals band → Now zone → tabbed Records, and the
milestone's original complaint (a wall of same-looking text panels) has no
surviving panel.

Mechanics worth knowing cold: `updateNowZone()` (bottom-ish of js/ui.js)
resolves ONE state per tick in priority order **engaged > docked > combat >
fuel emergency > docking range > event > near-POI > cruising** — deliberately
deviating from the mockup's suggested order (combat > fuel > docked) because
docked is modal/station-shielded (the fight outside is noise) and the vitals
band already shows the empty tank mid-fight. Thresholds: hostile within 900u
= combat, site within 600u = sensor contact (both tunable consts at the top
of the block). An UNCHARTED contact shows only "? Unknown contact" + bearing
— the name stays a fly-in discovery reward (matches the render layer's "?"
ping); charted sites show glyph/name/charter/salvage-ETA/⚑occupation + lore,
never market data. `data-now` on #nowZone drives the CSS accent (label +
border recolor per state). Detection is per-tick cheap: one squared-distance
pass over enemies and one over pois (poi.dist already maintained by
updatePOIDetection), scratch object reused, all writes via the Slice 1
guarded helpers. The dead `#sector` span is gone; #posX/#posY live in the
zone header. Records tabs + vitals band untouched (the two-layer visibility
mechanic survives — records suite still asserts it). New solo `now` suite
(13 asserts) forces each state + the priority overrides. **Gates: solo
?verify 178/178 (was 165), verify-net 136/136.** TEST-PLAN.md Part 0 has a
"Slice 3" subsection.

**NEXT SESSION (user-requested at sync): a RIFF session** *(→ HAPPENED
seventh session, see above — forks pinned, Slice A built, lore bible
written)*. The structure
milestone is done (vitals band / Now zone / Records tabs), but the Records
*pages themselves* are still text walls: Ship (mods + log lines), Missions
(text list), Crew (text list), Rep (text list), Galaxy Log (text lines),
Ledger (text rows) — plus other surfaces like the trade dialog and full map
if the riff reaches. Same working rhythm as the sidebar milestone: riff/
diagnose first (what could each section encode as VISUALS — icons, bars,
color, glyph language — instead of sentences), mock up 2-3 directions, pin
forks with the user, THEN build in verified slices. This is a design-first
session, not a build-first one. The existing glyph vocabulary (POI kinds,
faction colors, goods colors, ⚑/✦/☠) is the raw material — extend it, don't
invent a parallel one.

**Still queued: family playtest of the whole redesigned sidebar**
(TEST-PLAN.md Part 0 — the wall test, the glance test, the derelict-tease
moment). Watchlist: state flicker when skirting the 900u/600u edges
(thresholds may need hysteresis if it thrashes); does anyone miss the old
always-on nav text; Slice 2 carryovers (badges pulling the eye, tab-flipping
to compare, tab-row growth as progression vs noise). After playtest verdict:
merge + themisto deploy (branch carries M5+M6 server changes — see "Deploy
first" below).

(Fifth-session record follows.)

State as of 2026-09-01 (fifth session — **UI milestone Slice 2 BUILT**):
the Records tabs are live on `feature/exploration-poi` (commit 9e4a4f2,
pushed; still NOT merged, NOT deployed — nothing server-side changed). The
panel stack below the schematic that the first look called overwhelming
(The Ship / Missions / Crew / Reputation / Galaxy Log / Trade Ledger) is now
ONE tabbed Records area, one page at a time, per the ★ Contextual Hybrid in
`mockups/sidebar-redesign.html`. The Navigation panel was left untouched
above it — it becomes the contextual "Now" zone in Slice 3.

Design mechanics worth knowing cold: each page's inline `style.display`
still means "this record has content" (set by the panel's own update
function — the factions/crew/chronicle verify suites assert on it
UNCHANGED), while the `.rec-on` class is the selected tab; CSS layers the
two so they never fight. Tabs derive existence from the content signal (a
fresh Cadet sees Ship/Missions/Ledger, not six tabs), and badges keep
hidden news visible: active-mission count, held-grudge count (red), Galaxy
Log unseen count that clears when the log is opened. Tab choice persists
per browser via localStorage (`space_trader_records_tab`); default is
Missions-when-active, else Ship. Controller lives at the bottom of
js/ui.js, event-driven from the panels' update-function tails (NOT
per-frame), cached refs + guarded writes per the Slice 1 pattern. New solo
`records` suite (11 asserts) covers the tab layer. **Gates: solo ?verify
165/165 (was 154), verify-net 136/136.** TEST-PLAN.md Part 0 has a new
"Slice 2" subsection for the family playtest (the wall test is the one
that matters). Verified visually in-browser via claude-in-chrome — note
the browser caches style.css hard; a plain reload after pulling this
slice shows all pages at once (stale CSS), hard-reload fixes it.

**BUILD NEXT — Slice 3: the contextual "Now" zone** *(→ BUILT sixth session,
see above)*. Watchlist for
Slice 2 at playtest: do the badges actually pull the eye or get ignored;
does anyone miss seeing ledger + missions at once (tab-flipping to compare
would be real feedback); does the growing tab row over a career read as
progression or noise.

(Fourth-session record follows.)

State as of 2026-08-31 (fourth session — **UI milestone Slice 1 BUILT**):
the ship-schematic Vitals band is live on `feature/exploration-poi`
(commit 06be645, pushed; still NOT merged, NOT deployed). One drawn SVG ship
+ numerics strip replaced the Ship Status / Ship Upgrades / Cargo Hold panels
and the systems-down text wall — number-free glance per
docs/ship-design-vision.md §7: bay grid cells = cargoMax (filled in each
good's own color, one-line manifest below), shield-envelope thickness =
shield bank, nacelle/nose/tank size = upgrade levels (no Lv badges — the
mockup's badges were dropped as contradicting §3), missile pips = tubes,
damage flashes the exact part red, thruster glow follows live thrust.
Regions are `data-slot` groups so the Ship Bay drops in later with no rework.
Perf fold-in shipped in the same slice: updateUI() now runs on cached element
refs + last-value-guarded writes (no per-frame getElementById/innerHTML;
grid/pip geometry rebuilds only on capacity change; nearby-objects panel
rewrites only when its HTML changes). All verify DOM ids live on in the
numerics strip; NEW solo `vitals` suite asserts the encodings. **Gates: solo
?verify 154/154 (was 144), verify-net 136/136.** TEST-PLAN.md Part 0 is the
playtest hand-off (the five-second glance test is the one that matters).

**First look (2026-09-01, user, in-browser):** the schematic renders as
designed; the reaction was "the side drawer still has a lot of information
that seems overwhelming" — i.e. the un-rebuilt panel stack below the
schematic (The Ship / Navigation / Missions / Ledger / Crew / Reputation /
Galaxy Log) is the remaining wall. That confirms Slice 2 as the next cut.

**BUILD NEXT — Slice 2: Records tabs; then Slice 3: the contextual "Now"
zone** — both specified in `mockups/sidebar-redesign.html` (the ★ Contextual
Hybrid). Watchlist for the schematic after family playtest: does the
number-free glance actually beat reading digits; does losing "Level N" text
hurt upgrade shopping; is the taller sticky vitals panel OK on small screens
side-by-side; SNES-pixel art test on the schematic is still the queued
first-custom-art experiment.

(Third-session record follows — the design pass that specified all of this.)

State as of 2026-08-31 (third session — **UI milestone DESIGNED, ready to
build**): the confusing-sidebar milestone got a full information-design pass
plus a much bigger vision riff. No game/server code changed that session (docs +
mockups only, so gates were skipped) — **Slice 1 is now built (see above).**

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
