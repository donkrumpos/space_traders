# Test Plan — Exploration milestone (branch `feature/exploration-poi`)

Built headless on 2026-08-31 while you were away. **Nothing here is merged to
`main` or deployed to themisto yet** — it lives on the branch
`feature/exploration-poi` for you to try, then decide what to keep. Both
automated gates are green (solo `?verify` 117/117, `node verify-net.mjs`
101/101); this doc is for the things a machine can't judge — how it *feels*.

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
# solo — 117/117
python3 -m http.server 8377 &                                   # serve
CHS=~/.cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-mac-arm64/chrome-headless-shell
$CHS --headless --dump-dom --virtual-time-budget=12000 \
  "http://localhost:8377/index.html?verify" | grep VERIFY

# multiplayer — 101/101
FAMILY_SECRET=dev-secret node verify-net.mjs | tail -1
```

New coverage this milestone: solo `exploration` + `starfield` suites (detection,
reward, idempotency, peer-landmark-no-reward, mod + questSeed grants, wrapped
starfield); verify-net `exploration` suite (broadcast round-trip, first-charter-
wins). Wire protocol documented in `docs/PROTOCOL.md` under "M5 — exploration".

## To ship it for real (when you've decided)

1. Playtest, tune the design flags above.
2. Merge `feature/exploration-poi` → `main`.
3. Deploy the server to themisto per `docs/RUNBOOK.md` (the discovery handler is
   server-side — online discovery won't work until themisto runs the new code).
   Note: the batch-2 review server fixes are *also* still undeployed (see
   NEXT-SESSION.md) — fold both into one deploy.
