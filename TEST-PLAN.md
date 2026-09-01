# Test Plan — Exploration + Persistent World milestones (branch `feature/exploration-poi`)

Built headless on 2026-08-31 while you were away — THREE milestones now live
on this branch: **UI legibility Slice 1** (the ship-schematic Vitals band,
Part 0), **Persistent World** ("The World Remembers and Moves", Part 1), and
**Exploration** (the seven POIs, Part 2). **Nothing is merged to `main` or
deployed to themisto yet.** Both automated gates are green (solo `?verify`
165/165, `node verify-net.mjs` 136/136); this doc is for the things a machine
can't judge — how it *feels*.

---

# Part 0 — The ship schematic (UI legibility, Slice 1)

The confusing sidebar got its first redesign slice: the old **Ship Status +
Ship Upgrades + Cargo Hold** text panels (and the systems-down warning wall)
are now **one drawn ship** at the top of the sidebar, with a small numerics
strip under it. The design bet (docs/ship-design-vision.md): you should read
your ship's state from the *shape*, mid-combat, without reading a single
number —

- **Cargo** is a bay grid that fills cell by cell, each cell in the good's
  own color (relics violet, ore orange, Glowgrain yellow…). A one-line
  manifest under the numerics says what's aboard.
- **Shields** are the blue envelope around the hull — it thins and fades as
  charge drops, and a bigger shield bank IS a thicker envelope.
- **Upgrades are size, not "Lv" badges**: bigger engines = bigger nacelles,
  bigger weapon = bigger nose mount, bigger tank = wider fuel spine, more
  missile tubes = more pips.
- **Damage flashes the exact part red** — hull outline goes amber then red
  and pulses when critical; knocked-out engines / life support / lasers flash
  where they live; an overheated laser glows amber. The one-line "R to
  repair (kits: N)" hint stays below the strip.
- **Thruster glow breathes with your actual thrust.**

## What to check (feel, not function)

1. **The five-second test.** Mid-fight, glance at the sidebar only: can you
   tell how hurt you are, and WHERE, without reading the numbers? That's the
   whole bet of the milestone. If you still read the digits first, say so.
2. **Cargo at a glance.** Buy a mixed load, look at the bay: does the colored
   grid tell you "mostly ore, two relics" faster than the old list did?
3. **Upgrade shopping.** Buy an engine or shield upgrade at a station: does
   the drawing visibly change (fatter nacelles / thicker envelope)? Does
   losing the "Level 3" text hurt, or do the shapes + Bench prices carry it?
4. **Damage moments.** Let a raider knock your shields down and take hull
   hits: does the red-flash-on-the-part read instantly? Field-repair with R —
   does the flash clearing feel like a fix?
5. **Two windows side by side** (the family-testing goal): the sidebar
   should feel *shorter* now — status + upgrades + cargo were three panels,
   now one. Does the top of the sidebar still fit on your screens?

Nothing about combat/trading behavior changed — this is the HUD around it.
Slice 3 (the contextual "Now" zone) comes next per
`mockups/sidebar-redesign.html`.

## Slice 2 — the Records tabs (built 2026-09-01, after your first look)

Your note — "the side drawer still has a lot of information that seems
overwhelming" — was about the panel stack *below* the schematic. That stack
(The Ship / Missions / Crew / Reputation / Galaxy Log / Trade Ledger) is now
**one tabbed Records area**: a small tab row, one panel showing at a time.
The Navigation panel above it became the contextual "Now" zone in Slice 3
(next section).

- **A fresh Cadet sees three tabs** (Ship / Missions / Ledger). Crew, Rep,
  and Log tabs only appear once those records exist (a berth, a grudge, a
  chronicle entry) — same rule that used to show/hide their panels.
- **Hiding a panel never hides news** — tabs carry badges: Missions shows
  the active-contract count, Rep shows how many factions hold grudges (red),
  Galaxy Log shows the unseen-entries count, which clears when you actually
  open the Log tab.
- **Your tab choice sticks** across sessions (per browser). Until you pick
  one, it defaults to Missions when contracts are active, else Ship.

What to check (feel, not function):

1. **The wall test.** Undock and look at the sidebar: vitals + Navigation +
   one small tabbed panel. Does the drawer finally feel scannable instead of
   overwhelming? That was the complaint this slice answers.
2. **News still reaches you.** Have someone chart a site or break a raid
   while your Records is on Ship: does the Log badge pull your eye? Accept a
   contract, switch to Ledger — does the Missions count keep you oriented?
3. **Tabs appearing over a career.** Start a fresh pilot (incognito window):
   three tabs. Hire crew → Crew tab appears. Break a raid → Rep tab appears
   with a red count. Does the growing tab row read as progression or noise?
4. **Anything you miss?** The old stack showed everything at once; if you
   find yourself flipping tabs to compare (say, ledger prices against
   mission cargo), that's real feedback — say so.

---

## Slice 3 — the contextual Now zone (built 2026-09-01; completes the redesign)

The Navigation panel — the last un-redesigned piece — is now a **Now zone**:
it reads your situation and shows only what matters there, recoloring its
label (and in danger, its border) so the state change registers before the
words do. One state at a time, priority order: **engaged > docked > combat >
fuel emergency > docking range > event > near-site > cruising** (docked
outranks combat because the station shields you — the fight outside is noise
until you undock; combat outranks the empty tank because the vitals band
already shows the fuel while shot-dodging needs the hostile picture).

- **Cruising** — position, nearest planet + heading, "M for map".
- **Sensor contact** (within 600u of a site) — the site's glyph, name,
  charter credit, salvage/occupation status, and its lore line. *No market
  data* — the dark stays the dark. An **uncharted** contact shows only
  "? Unknown contact" + bearing: the name stays a discovery reward.
- **Docking range** — station name, type, "SPACE to dock".
- **In combat** (hostile within 900u) — hostile count + nearest range, the
  bounty target's name + price if a boss is in the fight, your streak, a
  blinking SHIELDS DOWN alarm, and the weapon keys.
- **Emergency power / solar sail** — fuel banner + nearest fuel stop heading.
- **Docked** — station name + type (this used to live inside the nav text).

What to check (feel, not function):

1. **The glance test.** Fly a loop: undock → cruise → brush a derelict →
   pick a fight → dock. Does the panel always show the thing you'd have
   asked for, and nothing else? Any state where you miss the old info?
2. **State flicker.** Skirting the edge of a fight or a site, does the zone
   thrash between states annoyingly? (Thresholds are tunable: 900u combat,
   600u site.)
3. **The derelict moment.** Approaching an uncharted "?" contact, does the
   sidebar tease build the moment or spoil it?
4. **Shields-down alarm.** Mid-fight with shields stripped — does the blink
   pull your eye in time to matter?

## Visual language — Slice B: the dock districts (built 2026-09-01)

The docked drawer used to be **nine identical cyan-headed sections** stacked
into one scroll. It now splits into **two districts by decision tempo**, and
docking always lands you at the first one:

- **The Dock** (default) — the seconds loop. A **services icon strip**
  (refuel / rearm / repair as three gauge-buttons: the glyph, a fill gauge for
  the current level, the top-off cost, the action), then market buy/sell (glyphed
  by Slice A), the mission board, and crew for hire.
- **The Shipyard** — the considered purchases (hulls, ship upgrades, weapon
  systems, mechanic's bench), tucked behind a deliberate **"⇱ walk to the
  Shipyard"** door. A junkyard-voice line greets you out there ("nothing here is
  new — inherited, salvaged, or grown"). **"⇲ walk back"** returns to the Dock.

What to check (feel, not function):

1. **The seconds-loop test.** Dock to trade and refuel: is everything you reach
   for on the *first* screen, with no scrolling past hull ads to sell your cargo?
2. **The service gauges.** Do the three fill bars read at a glance — low fuel /
   spent missiles / battered hull — before you read the dollar amounts?
3. **Walking out.** Does burying the shipyard behind a door feel like a *place*
   you visit for a big purchase (good), or an annoying extra click for something
   you wanted often (tell us which section)?
4. **Landing spot.** Every dock drops you at the Dock, even if you walked to the
   Shipyard last time — does that reset feel right, or do you want it to remember?
5. **The door copy.** Does "walk to the Shipyard / walk back" land, or read as
   fussy? (It's also planting the seed of a future planet map — districts are
   named places.)

---

# Part 1 — Persistent World: "The World Remembers and Moves"

The gap we set out to close: the world persisted but nothing *happened* while
you were away, and nothing pulled you back. Three slices, per the forks you
pinned at kickoff (chronicle + living sites; adds + occupations; daily-ish
cadence; digest + log panel):

1. **The Chronicle** — the world keeps a ledger (POI charters, broken raid
   bands, market events, salvages, occupations, liberations). Log in after
   time away and you get a **"While you were away — N things happened"**
   digest, plus a **Galaxy Log** sidebar panel (unseen entries highlighted).
2. **Regenerating caches** — every charted site's cache refills on a
   **12–24h wall-clock window** (runs while the server is up OR down — it's a
   timestamp, not a timer). Ready caches glow **✦ salvage ready** on the map;
   cooling ones show an ETA. Salvage is **first-come galaxy-wide** (~⅓ of the
   discovery reward) — whoever flies out first collects.
3. **Occupations** — daily-ish, a pirate faction (grudge-weighted: your
   vendettas literally shape the map) **digs in at a charted site**. Salvage
   is blocked, the site shows **⚑ <faction> dug in**, and flying near it
   musters the band AT the site — the loved chaotic fight, now with a place.
   Kill the boss → the site is liberated, **the cache opens immediately**,
   and the chronicle credits you by name.

## How to check it — quick console-assisted pass (both pilots online)

Setup is the same as Part 2 below (branch server + static). The real cadences
are 12–24h, so day-to-day play tests them honestly; to force things NOW, run
the server with `VERIFY_DEBUG=1` and use the browser console:

1. **Chronicle + digest.** Play a few minutes (chart something, break a raid),
   close the tab, have the other pilot do something notable, reopen. You
   should get the away digest, and the **Galaxy Log** panel should list the
   news with the new items highlighted. `netChronicle()` in the console shows
   `{ count, lastSeen, unseen }`.
2. **Salvage.** With `VERIFY_DEBUG=1`:
   `net.send({ t:'debug.poiState', id:'wraith_cache', nextSalvageAt: Date.now()-1 })`
   → the site should start pulsing **✦ salvage ready** for everyone. Fly back
   to it (you must have charted it personally): floaters, ~$300 + a relic, a
   ship-log line, a chronicle entry — and the site flips to "salvage in ~Xh"
   on BOTH screens. Second pilot arriving after you gets nothing (first-come:
   check that this feels exciting, not mean — it's the fork we picked, easy to
   flip to per-pilot if the family hates it).
3. **Occupation.** `net.send({ t:'debug.occupyPOI', id:'silent_beacon' })` →
   **⚑ dug in** appears on everyone's map + Galaxy Log entry. Fly out: the
   band should muster at the site and come at you (does it feel like an
   ambush?). Break it — minions first, the boss unshields last, exactly like
   raid bands. On the boss kill: site freed, cache INSTANTLY ready (grab it!),
   "you drove them out" in the chronicle.
4. **Away-time regen (the honest test).** Chart sites today, don't play
   tomorrow morning, log in tomorrow evening: some caches should be ready and
   possibly a site occupied — the map should have *moved* while you were gone.

## Design calls I made — sanity-check against how it plays

- **Salvage is first-come** (vs the per-visitor discovery reward). Scarcity is
  the login pull ("fly out before your brother does") and follows the shared
  mission-board/loot-drop precedent. Discovery rewards stay per-visitor.
- **Liberation opens the cache immediately** — occupations are net *positive*
  content (fight + loot), never a loss. The world only ever adds.
- **Occupations cap at 2** and don't expire on their own — they wait to be
  cleared. If the map feels cluttered or nagging, expiry is a small knob.
- **Chronicle records charters, boss kills, market events, salvages,
  occupations, liberations** — not common pirate kills or trades (noise).
  Deaths aren't chronicled yet (no death broadcast exists — known M4 gap).
- **Cadence numbers** (12–24h salvage, 12–24h occupation roll, max one
  catch-up occupation after server downtime) are all constants at the top of
  `server/world.mjs`.

---

# Part 2 — Exploration milestone (the seven sites)

## TL;DR — what shipped

The first exploration feature: **hidden points of interest out in the dark**
that you chart by flying to them. Seven sites now sit past the known planet
cluster (several off the edge of the old map, in negative-coordinate space).
Fly near one and your sensors ping it as a `?`; reach it and you *chart* it —
you get a reward, and the site becomes a **permanent landmark on the shared
map with your name on it** ("first charted by Arthur"). The empty-sky bug when
flying far out is fixed as part of this (the dark now has stars).

Discovery is **co-op friendly**: every family member who visits a site gets
their own reward and discovery moment; only the *naming* is first-come.

## How to run it locally

```bash
git checkout feature/exploration-poi
python3 -m http.server 8377        # then open http://localhost:8377/index.html
```

For the multiplayer parts you also need the server running (and it must be the
branch's server, because the discovery handler is server-side):

```bash
FAMILY_SECRET=<your secret> node server/server.mjs
```

## The seven sites (and quick-test warps)

The ship spawns near Agricon (~1050, 850). The known planets sit in x 500–3000,
y 400–2000. Every site below is *outside* that, in the dark:

| Site | Kind | Where (x, y) | Reward |
|------|------|--------------|--------|
| The Wraith Cache | ⬡ derelict | 3650, 2650 (SE) | $900 · 3 relics · 60 XP |
| The Silent Beacon | ◈ beacon | 1600, −1500 (N, off-map) | $1200 · 70 XP |
| Halgren's Eddy | ✦ anomaly | −1700, 900 (W, off-map) | $800 · 90 XP |
| The Ossuary Dig | ◆ cache | −400, −900 (NW, off-map) | $600 · 5 relics · 80 XP · quest seed |
| Smuggler's Reef | ⌂ outpost | −1100, 3000 (SW, off-map) | $1500 · 60 XP |
| The Drowned Choir | ⬡ derelict | 4300, 3500 (deep SE) | $1000 · 100 XP · **ship mod: Songbird Array** |
| The Twin Pulsar | ✦ anomaly | 3900, −1100 (NE, off-map) | $1100 · 2 relics · 85 XP |

**Fast way to test without the long flight** — open the browser console:
- `warpToPOI('silent_beacon')` — teleports you next to a site so you can watch
  the discovery fire. (ids: `wraith_cache`, `silent_beacon`, `gravity_eddy`,
  `ossuary_dig`, `smugglers_reef`, `the_choir`, `twin_pulsar`.)
- `listPOIs()` — table of every site: charted?, chartedBy, mine?, distance.

## What to check — solo

1. **The tease.** Fly toward a site (or `warpToPOI` to just outside its range).
   Before you reach it, a faint pulsing **`?`** should appear on the main view
   and minimap — an "unknown contact." Does it make you want to go look? That's
   the whole point of the feature; if it doesn't pull you, tell me.
2. **The discovery.** Fly into the site. You should get: a banner
   (`⬡ DISCOVERED: The Wraith Cache`), a flavor line, floating `+$` / `+relics`
   text at your ship, a little screen shake + the bounty sound, and the credits/
   cargo/XP actually land (check the Ship Status panel).
3. **The landmark.** Open the map (**M**). The charted site now shows as its
   icon + name + "charted by <you>". Uncharted sites stay hidden — the map fills
   in as you explore. Is that satisfying?
4. **Persistence.** Reload the page. Your charted sites should still be charted
   (stored on your pilot). Flying back in should *not* re-pay you.
5. **The mod site.** Chart **The Drowned Choir** (`warpToPOI('the_choir')`) —
   check the ship's mod list gains **Songbird Array** (contracts pay 10% more).
6. **The dark isn't empty.** Fly way out past a site, especially into negative
   space (up/left off the old map). The starfield should keep going — no black
   void. (This was a real bug; it's fixed.)

## What to check — multiplayer (needs a second pilot)

1. You and a family member both online. You chart a fresh site first.
2. **They should see it appear on their map** as a landmark "charted by <you>",
   even though they never went there.
3. When *they* fly to the same site, **they still get the full reward** (co-op),
   but the charter name stays *you* (first-come).
4. Restart the server; charted sites survive (persisted in the world snapshot).

## Design calls I made — please sanity-check these against how it plays

These are the judgment calls where your gut matters more than mine. Each is a
knob we can turn:

- **Reward is per-visitor, not scarce.** Everyone who reaches a site gets the
  loot; only the *name* is first-come. I chose this because a family game where
  one kid grabs the prize and the others get nothing breeds resentment (same
  sensitivity as the death-balance notes). **If you'd rather loot be scarce
  (first pilot only), say so** — it's a design flag, not a rewrite, but it needs
  the async "am I first?" server round-trip before granting.
- **Discovery is hybrid: sensor-ping reveals, fly-in claims.** Sensor range =
  your minimap range, so `long_range_scanner` / whisperdrive now help
  exploration too. Alternative is pure fly-into-it (more surprising, less pull).
- **Site placement & spread.** Seven sites, spread to all corners of the dark.
  Do they feel too close / too far / too clustered? Is the flight *out there*
  fun or just a slog? (This tells us whether the map needs to physically spread
  the *planets* out too, which you mentioned wanting.)
- **Rewards are cash-heavy for now.** Two sites carry the RPG rails — a ship mod
  (Drowned Choir) and a quest seed (Ossuary Dig, which does nothing yet but is
  wired for the future dig-quest). The next milestone turns discoveries into
  quest chains; this slice just lays the track.
- **Art is placeholder.** Sites are unicode glyphs (⬡ ✦ ◆ ◈ ⌂) in the existing
  wireframe style. Deliberately un-arted until the loop proves fun.

## Known limitations (by design, this slice)

- Sites are static points; there's nothing to *do* at one yet beyond charting it
  (no station to dock, no quest to start) — that's the next milestone.
- A discovery you make while **offline** grants your reward and persists locally,
  but doesn't register the shared charter name until you're online and re-visit
  (offline you're the only one there anyway).
- Sensor detection uses your minimap range; there's no active "ping" button yet.

## The automated gates (both green on this branch)

```bash
# solo — 144/144
python3 -m http.server 8377 &                                   # serve
CHS=~/.cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-mac-arm64/chrome-headless-shell
$CHS --headless --dump-dom --virtual-time-budget=12000 \
  "http://localhost:8377/index.html?verify" | grep VERIFY

# multiplayer — 136/136
FAMILY_SECRET=dev-secret node verify-net.mjs | tail -1
```

Coverage, exploration milestone: solo `exploration` + `starfield` suites
(detection, reward, idempotency, peer-landmark-no-reward, mod + questSeed
grants, wrapped starfield); verify-net `exploration` suite (broadcast
round-trip, first-charter-wins). Wire protocol: `docs/PROTOCOL.md` "M5".

Coverage, persistent-world milestone: solo `chronicle` + `salvage` suites
(ledger apply/digest math/panel, cache readiness/ETA/occupation block, reward
apply incl. relic-overflow, offline-grants-nothing); verify-net `chronicle`,
`salvage`, `occupation` suites (shared ledger + away digest with a real
leave/return, seeded windows, refusals, the real fly-in claim path, the
first-come race, band-musters-on-approach, liberation opens the cache). Wire
protocol: `docs/PROTOCOL.md` "M6".

## To ship it for real (when you've decided)

1. Playtest, tune the design flags above.
2. Merge `feature/exploration-poi` → `main`.
3. Deploy the server to themisto per `docs/RUNBOOK.md` (the discovery handler is
   server-side — online discovery won't work until themisto runs the new code).
   Note: the batch-2 review server fixes are *also* still undeployed (see
   NEXT-SESSION.md) — fold both into one deploy.
