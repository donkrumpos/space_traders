# Space Traders

A browser-based space trading and combat game — Asteroids-style physics
flight over a living economic sim, played on a shared persistent
multiplayer server. Vanilla HTML/CSS/JS with no build step; a Node
(`ws` + `better-sqlite3`) server owns the shared world.

**Play it:** the game lives at https://siegeperilousstudio.com (family
server, secret required). The full in-world game manual — the Pilot's
Handbook — is public at https://siegeperilousstudio.com/manual.html
(also in this repo as [`manual.html`](manual.html)).

## What's in the game

- **Flight & combat** — Newtonian-ish thrust/drift flight, lasers with
  heat, missiles, shields. Three authored pirate cartels (Rustfang
  Cartel, Iron Shoal, Void Choir) run raid bands, hold grudges that
  persist across sessions, and can be bought off with tribute at any
  dock (the Settlement). Deaths are real: credits lost, cargo pods
  scattered, and in multiplayer your wreck blooms on every peer's
  screen and enters the permanent chronicle.
- **Trade** — 8 goods (Glowgrain, Cognition Cores, Ferrovolt Ore,
  Nebula Silk, Panacea Vials, Precursor Relics, Voidbloom, Repair
  Kits) across 7 worlds, each a charter designation with a local
  nickname: Agricon Prime (the Lantern), Mining Station 7 (the Drum),
  Tech Hub Alpha (the Dreamworks), Frontier Outpost (Lastlight), Core
  World Central (the Ledger), Meridian Deep (the Deep), and Ossuary
  Drift. Markets move on their own — supply/demand drift plus market
  events — and your personal price ledger turns scouting into market
  sense (deal bars compare every price against the best you've seen).
- **Missions & progression** — contract boards at every port; a
  9-rank ladder (Deckhand → Living Legend), 12 perks, 5 buyable hulls,
  a mechanic's bench of mods that pin onto your ship schematic, and
  crew for hire. The ship IS the character sheet.
- **Exploration** — uncharted points of interest scattered in the
  dark: derelicts, beacons, anomalies, caches, outposts. Finding them
  is the reward (the handbook deliberately names no coordinates);
  charted sites yield salvage on a cooldown and can be occupied by
  cartels — or claimed by player factions.
- **Player factions** — found your own banner at any shipyard's
  charter desk: a name, a color, a declared want. Invite pilots, claim
  a site, defend it, and watch the faction's tally of deeds climb the
  ladder into the chronicle.
- **A living shared world** — one persistent server world: shared
  markets and mission boards, peer ghosts flying beside you, a world
  chronicle that remembers foundings, liberations, settlements, and
  deaths, and a "while you were away" digest when you return. Saves
  live server-side with automatic backups; solo offline play works
  from the same files.

The lore bible (`docs/lore-bible.md`) pins the setting: a charter
reach gone feral after the Combine withdrew — Mad Max in space, no
empires, power is local and personal.

## Running it

**Solo, zero setup** — serve the repo statically and open the game:

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

**Multiplayer** — run the Node server (it serves the static files too
when `STATIC_DIR` is set):

```bash
npm install
FAMILY_SECRET=dev-secret STATIC_DIR=. node server/server.mjs
# → http://localhost:8378/index.html?pilot=You&secret=dev-secret&ws=ws://127.0.0.1:8378
```

`FAMILY_SECRET` is required — the server refuses to start without it.

**Controls** are in the Pilot's Handbook ([`manual.html`](manual.html),
"The Helm" chapter). Basics: arrow keys to rotate and thrust, SPACE to
dock/undock, X lasers, C missiles, Z laser mode, R field repair, M map.

## Development

No build step: edit, reload. The `js/sim/*.js` modules are pure shared
sim — the exact same files run in the browser and in the Node server
(no `window`/DOM references allowed there).

```
index.html            the game page
js/                   client: game loop, combat, trading, UI, net layer…
js/sim/               pure sim shared browser+server: planets, POIs,
                      economy, combat, traffic
server/               node server: ws relay + world/combat authority,
                      SQLite persistence, nightly backup script
docs/PROTOCOL.md      the multiplayer wire contract + authority split
docs/RUNBOOK.md       deploy + backup/restore recipes for the VPS
docs/MULTIPLAYER.md   multiplayer design
docs/game_design_doc.md, docs/lore-bible.md, docs/faction-design.md
manual.html           the Pilot's Handbook (player-facing manual)
NEXT-SESSION.md       rolling session log + backlog — read this first
```

### The two gates

Never commit game/server code without both green:

```bash
# solo — headless browser suite (expect VERIFY-PASS n/n)
python3 -m http.server 8377 &
CHS=~/.cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-mac-arm64/chrome-headless-shell
$CHS --headless --dump-dom --virtual-time-budget=12000 \
  "http://localhost:8377/index.html?verify" | grep VERIFY

# multiplayer — two-client convergence harness (expect VERIFY-NET-PASS n/n)
node verify-net.mjs | tail -1
```

The solo suite drives the real game headless under virtual time; the
net harness spawns a scratch server + two real browser clients and
asserts convergence. See `docs/PROTOCOL.md` for what each milestone
(M1–M7) guarantees.

## Deploying

The production server ("themisto") setup, systemd unit, Apache/wss
proxy, backup layers, and restore procedure are in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md). Deploys are always explicit —
never automatic.
