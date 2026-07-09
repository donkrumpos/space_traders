# Multiplayer Protocol Contract (v1)

The single source of truth for the M1–M5 build. Server, client net layer, and
verify-net harness are built by separate agents against THIS document. If you
need to deviate, update this file in the same commit.

## Locked kickoff answers (Foggy, 2026-07-08)

- **VPS:** themisto (the cal.yonderartland.com box — Apache + Let's Encrypt,
  Debian-family, runs Radicale). **Deploy adapts from the Caddy plan to an
  Apache vhost + `mod_proxy_wstunnel`.** Ssh details TBD before M5.
- **Domain:** `siegeperilousstudio.com` (root — the game's whole home).
- **Friendly fire:** OFF. Ghosts are render-only; player projectiles never
  collide with peers. Do not add ghost collision.
- **Raid scaling:** scale to pilots online. Solo pilot → base-size bands;
  both connected → full strength.
- **Canonical saves:** no manual migration. Each machine's first connect
  uploads its local save as that pilot's server doc; thereafter newest
  `lastPlayed` wins (backup before any overwrite).

## Topology

```
prod:   browser ── wss://siegeperilousstudio.com/ws ── Apache ── ws://127.0.0.1:8378 (node, systemd)
        static game files: Apache DocumentRoot /var/www/siegeperilous (git checkout)
dev:    browser ── ws://127.0.0.1:8378 ── node server.mjs (also serves static when STATIC_DIR set)
verify: verify-net.mjs spawns server on a scratch port w/ temp SQLite + STATIC_DIR=repo root,
        drives two chrome-headless-shell tabs via puppeteer-core
```

Client ws-URL resolution (js/net.js):

```js
const wsUrl = new URLSearchParams(location.search).get('ws')
  || (location.protocol === 'https:' ? `wss://${location.host}/ws` : 'ws://127.0.0.1:8378');
```

## Files

```
package.json (root)      deps: ws, better-sqlite3; devDeps: puppeteer-core (single root node_modules)
server/server.mjs        ws server + optional static file serving (STATIC_DIR env)
server/db.mjs            better-sqlite3, WAL mode. DB path from env DB_PATH (default server/world.db)
server/config.mjs        { friendlyFire:false, raidScale:'perPilot', tickHz, saveIntervalMs }
js/net.js                client net layer (load after character.js, before verify.js)
verify-net.mjs           two-client convergence harness (repo root, node)
js/sim/*.js              (M3/M4) pure sim modules shared browser+node
docs/RUNBOOK.md          (M5) themisto deploy runbook
```

## Identity & auth

- `localStorage.space_trader_pilot` — pilot name. First visit: prompt
  ("Who flies this ship?"). URL param `?pilot=NAME` overrides + persists.
- `localStorage.space_trader_secret` — family secret. First visit: prompt.
  URL param `?secret=S` overrides + persists. Server env `FAMILY_SECRET`
  (default `dev-secret` when unset, for local/verify).
- No accounts. Trust model: a father and his six-year-old.

## SQLite schema (server/db.mjs)

```sql
CREATE TABLE IF NOT EXISTS pilots (name TEXT PRIMARY KEY, doc TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS world  (id INTEGER PRIMARY KEY CHECK (id=1), snapshot TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, pilot TEXT NOT NULL, doc TEXT NOT NULL, created INTEGER NOT NULL);
```

Server writes a `backups` row before overwriting any pilot doc it already has.
Client writes `localStorage.space_trader_character_backup` before adopting a
server doc over its local one.

## Message envelope

JSON text frames, every message `{ "t": "<type>", ... }`. Unknown `t` is
ignored (forward compatibility between milestones). Server → single client
unless marked *broadcast*.

### M1 — handshake + shared saves

| t | dir | payload |
|---|-----|---------|
| `hello` | c→s | `{ pilot, secret, lastPlayed }` — lastPlayed of local doc, or 0 if none |
| `reject` | s→c | `{ reason }` (bad secret) then close |
| `welcome` | s→c | `{ pilot, doc, peers: [names], config }` — `doc` = stored char doc or `null` if server has none |
| `char.push` | c→s | `{ doc }` — full character document. Sent on the existing save throttle + on dock + on beforeunload |
| `char.saved` | s→c | `{ updated }` ack (harness uses this) |

**Sync rule (client, on welcome):** server `doc` null → push local up. Server
doc `lastPlayed` newer than local → back up local, adopt server doc, reload
character via `importCharacter`-equivalent path. Local newer → push local up.

**Offline fallback:** connect timeout 3s. On fail/close: `net.online=false`,
game plays solo from localStorage exactly as today; reconnect attempts every
30s; on reconnect re-handshake (sync rule runs again). NOTHING in solo boot
may block on the network — `?verify` (92 assertions) must stay green with no
server running.

### M2 — ghost presence

| t | dir | payload |
|---|-----|---------|
| `ship.state` | c→s | `{ x, y, angle, vx, vy, hull, hullMax, shield, hullId, shipName, thrusting, docked }` at 10Hz (only when changed since last send is fine) |
| `peer.state` | s→c *broadcast* | `{ pilot, ...same fields }` relayed ≤10Hz |
| `peer.join` | s→c *broadcast* | `{ pilot }` → toast "PILOT has entered the sector" |
| `peer.leave` | s→c *broadcast* | `{ pilot }` → toast |

**Units note (M2):** `vx`/`vy` are world-units **per second** on the wire
(client converts from `game.ship.velocity`'s per-frame-at-60fps units, ×60).
`net.getGhosts()` extrapolates `pos + vel * elapsedSeconds`, capped at 500ms
past the last `peer.state`; ghost entries expire 5s after last update. The
sender skips a frame only when x/y drift < 0.5 units AND every other field is
unchanged, with a ≥1Hz heartbeat regardless.

Ghost render: hull silhouette via `HULL_SHAPES[hullId].draw()` at interpolated
position, pilot+ship name label above, engine flames when `thrusting`, cyan-ish
distinct color, minimap blip. Ghosts are NOT collidable (friendly fire off).

### M3 — shared world (server authority: markets, events, missions board)

| t | dir | payload |
|---|-----|---------|
| `world.snapshot` | s→c | `{ markets, marketEvent, missionBoards, grudges }` — sent as its own message immediately AFTER `welcome` (welcome stays M1-shaped, no snapshot field), and on `debug.snapshot` |
| `trade` | c→s | `{ reqId, planet, good, side:'buy'\|'sell', qty }` |
| `trade.result` | s→c | `{ reqId, ok, prices: {buy,sell} }` — client applies credits/cargo locally on ok |
| `market.update` | s→c *broadcast* | `{ planet, market }` after any trade/drift/event |
| `market.event` | s→c *broadcast* | `{ marketEvent }` (or `{ marketEvent: null }` when it expires) |
| `dock` | c→s | `{ planet }` — server runs drift for that planet, returns/broadcasts `market.update`; also triggers char.push |
| `mission.take` | c→s | `{ planet, missionId }` → `mission.taken { ok, mission }`; boards regenerate server-side |
| `board.update` | s→c *broadcast* | `{ planet, offers }` after any mission.take or board regen |
| `debug.*` | c→s | verify-only hooks, accepted ONLY when server env `VERIFY_DEBUG=1`: `debug.marketEvent {planetName?, goodType?, side?, multiplier?}` forces a market event now; `debug.snapshot` → server replies `world.snapshot`. Never set in prod. |

Accepted missions live in the pilot's char doc (per-pilot); the mission BOARD
per planet is server state. Ledger stays per-pilot (it's personal knowledge).
Escort missions stay CLIENT-LOCAL in M3 (they touch game.traders — M4
territory): server boards carry delivery + bounty offers only; client-local
escort offers merge into the board UI unchanged.

**Server world authority details (locked at M3 build, 2026-07-08):**

- `missionBoards[planet]` is ONE `offers[]` array: delivery offers plus, when
  the roll produced one, the bounty entry (`type:'bounty'`) inline. One
  `generateMissionOffers` roll per board seeds both.
- `mission.take` restocks like-for-like from a fresh core roll: a taken
  delivery is replaced by the fresh roll's first delivery offer; a taken
  bounty by the fresh roll's `bountyOffer` (i.e. refills at the core's own
  40% odds, so posters stay intermittent). Player-state gates (log full,
  one-hunt-at-a-time) stay client-side per the caller-owns-gates rule.
- `trade.result.prices` = the traded good's **pre-impact** base prices
  `{ buy, sell }` (either side absent when the planet doesn't trade that side)
  — matches solo, where the price is read before `applyTradeImpact`. `ok:false`
  (unknown planet/good/side, qty ≤ 0) carries `prices: null`.
- `dock` drifts ONLY that planet's market (the M3 table's wording is literal;
  solo drifted all markets on dock — server-side that would let one pilot's
  docking churn the whole galaxy).
- Server market events run the solo cadence: first event at 75s after boot,
  180s duration, 90–210s cooldown, 20s retry on a null roll. The server adds
  an `endsAt` wall-clock field to the event object (persisted, so a restart
  resumes the event with its remaining time); clients ignore unknown fields.
- World persistence: SQLite `world` row, JSON of
  `{ markets, marketEvent, missionBoards, grudges }` — saved debounced 5s
  after any change, every 60s when dirty, and on SIGTERM/SIGINT. Restore
  merges per planet (a roster change gets fresh markets/boards for new
  planets). `grudges` rides along empty until M4.

**Perk pricing rule (M3):** the wire carries BASE prices only.
`trade.result.prices` and `market.update` are perk-free; each client applies
its own pilot's haggling perks (`market_savvy`, `silver_tongue`) at
read/display time exactly as today. Credits are own-ship state
(client-authoritative): the client computes its credit delta locally from
base price × its perk multiplier.

**M3 client notes (locked at client build, 2026-07-08):**

- The client sends a `reqId` on `mission.take` too (unknown fields are
  ignored) and matches `mission.taken` by `reqId` when the reply carries one,
  falling back to the oldest pending mission request when it doesn't. Pending
  trade/mission requests reject after 5s or on disconnect; on `ok:false`,
  rejection, or timeout the client shows the existing error feedback and
  mutates nothing.
- The client splits the inline `type:'bounty'` entry out of a board's
  `offers[]` (snapshot boards + `board.update`) because the board UI renders
  bounties and deliveries from different planet fields; escort/crew/mod
  offers remain client-local and merge into the board UI unchanged.
- When online the client suppresses its own economy authority: no local
  market-event rolls (the server's `market.event` sets/clears the singleton),
  no `driftMarkets()` or board generation on dock (it sends `dock` and
  applies the stashed server board instead), and no local `applyTradeImpact`
  on trades (the server's `market.update` broadcast carries the impact).
  Everything stays byte-identical offline.
- A `market.update` for the planet the client is currently docked at
  re-records the trade ledger (berthed = those are the prices you saw) and
  refreshes the open trade UI.
- Console hook for the harness: `window.netWorld()` →
  `{ marketFor(planetName), marketEvent, boardFor(planetName) }` where a
  board is `{ offers, bountyOffer }` post-split.

**Economy sim extraction (M3 refactor):** pure logic moves to
`js/sim/planets.js` (`globalThis.SIM_PLANETS` — name/x/y/produces/demands
meta) and `js/sim/economy-core.js` (`globalThis.EconomyCore` — clampPrice,
makeMarket(meta), drift(market, meta), tradeImpact(market, meta, good, side,
qty), eventMultiplier(marketEvent, planetName, good, side),
rollMarketEvent(planetMetas), generateMissionOffers(meta, allMetas)). Both
files are side-effect scripts setting globals (script tags in the browser
loaded BEFORE game.js, `await import()` on the server — same files, no fork).
Browser economy.js delegates to EconomyCore; solo behavior must stay
identical (`?verify` 92/92 is the proof).

Return shapes (locked at extraction, 2026-07-08): `makeMarket` returns
`{ buy: {good: price}, sell: {good: price} }`; `drift`/`tradeImpact` mutate
that market in place (and return it). `rollMarketEvent` returns
`{ planetName, goodType, side, multiplier, timeLeft: 180, label }` or `null`
when the picked planet had nothing to disrupt (caller owns retry cadence —
the client retries in 20s). `generateMissionOffers` returns
`{ offers: [{ id, from, dest, goodType, qty, reward }],
bountyOffer: { id, type:'bounty', name, nearPlanet, reward } | null }` —
one board roll covering both; bountyOffer already includes its 40%
appearance odds. Player-state gates (mission log full, one-hunt-at-a-time)
belong to the caller, not the core.

### M4 — shared combat (server sim: enemies, raid bands, traffic, drops)

| t | dir | payload |
|---|-----|---------|
| `world.tick` | s→c *broadcast* | `{ n, enemies: [{id,x,y,angle,hull,maxHull,tierName,color,size,bandId,isBandBoss,shielded,factionName,isBoss}], traders: [{id,x,y,angle,state,color,isEscort}], drops: [{id,x,y,kind,goodType,qty}], shots: [{enemyId,targetPilot,x,y,angle}] }` at 10Hz; `shots` = enemy fire events since last tick |
| `damage.claim` | c→s | `{ enemyId, damage }` — server applies (last-writer-wins), no validation. Fire-and-forget (no reqId), like dock |
| `enemy.hit` | s→c *broadcast* | `{ enemyId, hull }` (piggybacks on world.tick; explicit msg optional) |
| `enemy.killed` | s→c *broadcast* | `{ enemyId, by, reward, drops }` — killer gets credits/XP client-side; drops appear for both |
| `drop.claim` | c→s | `{ dropId }` → `drop.taken { dropId, by }` *broadcast* (first claim wins; claimer applies pickup locally) |
| `cargo.scatter` | c→s | `{ x, y, cargo: {goodType: qty} }` — sent on own-ship destruction; server scatters the hold as shared cargo pods (≤5 units each, ±120u around the wreck, 90s expiry, 150-unit sanity cap) that ride `world.tick` drops and settle via the normal `drop.claim` race. Fire-and-forget. Offline path spawns equivalent local drops. Not sent when the `reliquary_hold` mod is installed (client-side: the vault hold keeps its cargo through the wreck). |
| `grudge.update` | s→c *broadcast* | `{ grudges }` — family vendetta is shared world state |
| `debug.*` (M4) | c→s | verify-only hooks, accepted ONLY when `VERIFY_DEBUG=1`: `debug.spawnEnemy {x,y,tier}` spawns one enemy (bad/missing tier → scout), acked `debug.spawned {enemyId}`, in the world by the next tick; `debug.spawnBand {factionName?}` musters a raid band near a random connected pilot (faction forced by retry-roll when named), acked `debug.spawned {bandId, faction, bossId, enemyIds}`; `debug.state` → server replies `{ t:'debug.state', state: {enemies, traders, drops, pilots, grudges, simNow, tickN} }` (full raw combat state). Never set in prod. |

**M4 authority split (locked at M4 kickoff):**

- Server owns: enemy + raid-band + NPC-trader spawn/AI/movement, loot-drop
  spawning, grudges. Client owns: its OWN projectiles, hits on its own ship,
  its credits/XP. Enemy FIRING decisions are server-side (`shots` in
  world.tick); the client spawns the visual projectile and resolves damage
  against its OWN ship locally (client-authoritative own ship).
- Enemy AI targets the NEAREST connected pilot (positions known from
  ship.state); spawns anchor near a random connected pilot. Raid-band size
  scales to pilots online per the locked kickoff answer; grudge scaling reads
  the SHARED grudge values.
- Grudge migration: first time a pilot's char doc arrives after M4 deploys,
  server seeds world grudges as max(existing world value, pilot's doc value)
  per faction; thereafter server increments on band-boss kills and broadcasts
  grudge.update; clients mirror into game.pilot.grudges (so offline solo play
  still works and re-seeds by max on reconnect).
- **Asteroids stay client-local in M4** (deviation from MULTIPLAYER.md's
  original list): mining is solo-scenery at n=2 and syncing rocks adds port
  surface for no felt payoff. Revisit after the family playtest if shared
  mining ever matters.
- **Escort traders stay client-local** (M3 rule carries): the client MERGES
  world.tick traders with its local escort traders — replace non-escort
  entries, preserve `isEscort` locals. Enemies chasing escorts remains a
  client-local behavior of the escort ambush path.
- **Online mode bypasses the local enemy/traffic sim** (spawn timers, AI
  updates, band scheduling all skipped); offline solo keeps the full local
  sim EXACTLY as today via the same `js/sim/` modules. When the connection
  drops mid-flight, server enemies despawn client-side (fade, no explosion)
  and the local sim resumes; on reconnect the local sim stops and live
  server state replaces it.

Clients render interpolated enemies/traders from ticks (reuse the ghost
extrapolation approach); local projectiles detect hits against server-enemy
positions and send claims; all spawn/AI/loot logic runs server-side in
`js/sim/*.js` modules (pure state, `fx` callbacks injected — browser passes
real feedback fns, node passes no-ops).

**Combat/traffic sim extraction (M4 refactor, locked 2026-07-08):** pure
logic moves to `js/sim/combat-core.js` (`globalThis.CombatCore`) and
`js/sim/traffic-core.js` (`globalThis.TrafficCore`), mirroring the M3
economy extraction (side-effect scripts, script tags before combat.js /
traffic.js in the browser, `await import()` on the server — same files, no
fork). `js/combat.js` / `js/traffic.js` are now browser adapters with the
same public names (`makeEnemyFromTier`, `spawnRaidBand`, `pickRaidFaction`,
`updateEnemies`, `traderDock`, `traderDepart`, `updateTraffic`, ... — the
solo verify suite calls them directly).

- `CombatCore`: `ENEMY_TIERS`, `PIRATE_FACTIONS`, `pickEnemyTier(wealth)`,
  `makeEnemy(tierKey, x, y)`, `makeNamedWarlord(bounty, anchor{x,y})`,
  `pickRaidFaction(grudges)`, `makeRaidBand(anchorX, anchorY, grudges)` →
  `{ faction, grudge, bandId, minions, boss, enemies }` (grudges always a
  passed-in `{ factionName: n }` map, never read from globals),
  `updateEnemies({ enemies, targets, traders }, dt, fx)` → `{ shots }`, and
  `applyDamage(enemies, enemy, damage, hitX, hitY, fx, opts)` → outcome.
- `targets` is `[{ x, y, cargoUnits }]` — N connected pilots, not "the
  player". Bands/bounty bosses hunt the nearest pilot; common pirates also
  stalk traveling traders; despawn (>3000) is distance-to-nearest-pilot;
  the pirates-smell-cargo detect bonus keys off the nearest pilot's
  `cargoUnits`. Solo passes exactly one target — behavior identical.
- Enemy fire returns as `shots` — fully-formed `enemy_laser` projectile
  objects (plus `angle`, and `enemyId` when the enemy has an `id`) — the
  browser pushes them into `game.projectiles`; the server relays them as
  world.tick `shots`. `fireEnemyWeapon` no longer exists as a global.
- **Kill resolution returns a structured outcome**
  `{ shielded, killed, reward (raw, no streak), xp, drops: [{kind:'cargo',
  x,y,goodType,qty} | {kind:'powerup',x,y}], grudgeDelta:
  {faction,amount}|null, escortsLeft, bountyId, isBandBoss, factionName,
  tierName }` — deliberately NOT via fx: credits/XP/streak are
  client-authoritative (M4 authority split), so the caller owns the
  celebration (explosion, credit flash, floaters, powerup/cargo spawning,
  mission close, streak math). The fx object covers in-sim feedback only:
  `fx.floater / fx.sparks / fx.hud / fx.shake / fx.sound` — all optional,
  no-ops when absent (node passes nothing). `opts.goodTypes` supplies the
  loot universe (browser: `Object.keys(goods)`; server: derive from
  SIM_PLANETS or `EconomyCore`-style legal goods).
- `TrafficCore`: `TRADER_COUNT`, `TRADER_NAMES`, `makeTrader(planet)`,
  `departTrader(t, planets)`, `dockTrader(t, planet, applyImpact)`,
  `updateTraders({ traders, planets, enemies }, dt, hooks)`,
  `scatterDrops(t)`. Trader→market impact goes through the
  `applyImpact(planet, goodType, side, qty)` callback (browser →
  `applyTradeImpact`; server → world-market mutation + `market.update`).
  `hooks.depart(t)` / `hooks.dock(t, planet)` are the state-machine edges so
  the escort-aware client wrappers intercept them.
- **Spawn cadence stays caller-owned** (the economy-core rule carries):
  enemy spawn timers, the raid-band muster clock (`updateRaidBands`), and
  trader respawn timers live in the browser adapters; the server implements
  its own cadence in M4 server work.
- **No trader→raider spawn-request outcome in TrafficCore:** the only
  trader-spawns-raider path is the escort ambush, which is client-local per
  the M4 authority split, so it stays in js/traffic.js (pushing into
  game.enemies via `CombatCore.makeEnemy`). If the server ever wants
  raiders-on-traders, that's server cadence + `CombatCore.makeEnemy`.

**M4 server authority (locked at server build, 2026-07-08):** the combat sim
lives in `server/combat.mjs` (cadence + ids + tick broadcast + claim
handlers); grudges and trader market impact mutate WORLD state through
`server/world.mjs` accessors so they ride the existing SQLite snapshot.

- **Wealth reads:** `ship.state` carries no credits/cargo, so wealth gates
  (`pickEnemyTier`, maxEnemies, the credits>2500 band gate) use the RICHEST
  connected pilot's credits from their last char doc (hello's stored doc or
  `char.push`); per-pilot `cargoUnits` likewise comes from the last doc (a
  few seconds stale — good enough for "pirates smell cargo"). When NO
  connected pilot has a doc yet, wealth defaults to 0 for tier/max picks and
  the band credits-gate is SKIPPED (bands may muster).
- **Sim substeps:** CombatCore's turn/thrust ramps are per-update (the
  browser runs them at 60fps), so the server steps the sim 6× at dt=1/60
  inside each 10Hz tick — enemy handling matches solo. Broadcast stays 10Hz.
- **Spawn cadence** ports the browser numbers: enemy spawns anchor 800–2000
  units off a RANDOM connected pilot, 10–20s intervals hauling / 15–30s not,
  maxEnemies 2–4(+1 with cargo); raid bands first muster at 150s, then
  240–420s, one band at a time; trader respawn 30–60s below TRADER_COUNT.
- **Raid scaling** (`config.raidScale: 'perPilot'`): the core sizes the band
  for one pilot (grudge reinforcements included); the server adds +1 faction
  minion per EXTRA pilot online, capped at `config.raidExtraMinionCap` (2).
- **The world sleeps at zero pilots:** ticks skip entirely and all combat
  timers freeze (they run on accumulated sim-time). Nothing observes an empty
  sector, so "world keeps running" only holds while someone's online —
  deliberate, cheaper, invisible. M3 market-event timers keep running
  (unchanged M3 behavior). Enemies/traders/drops freeze in place and resume
  when the next pilot connects.
- **Drops** expire server-side after `config.dropExpiryMs` (60s, sim-time) —
  they vanish from the tick; no explicit expiry message.
- **Additive tick fields** (clients may ignore): traders carry `name` +
  `fleeing`; shots carry `damage` + `color` (saves a dead-enemy lookup race
  when spawning the visual projectile). `shots[].targetPilot` = the pilot
  nearest the muzzle (informational — CombatCore picks prey internally).
- **`enemy.hit` is not sent** — hull changes ride the next world.tick (the
  M4 table marks the explicit message optional).
- **Known gaps (v1):** the server runs NO projectile sim, so server-side NPC
  freighters can't be destroyed while online (`TrafficCore.scatterDrops`
  unused server-side; enemy shots only hurt player ships, resolved
  client-side). Named bounty warlords (`makeNamedWarlord`) are NOT
  server-spawned — bounty hunts stay client-local when online for now.
  Revisit both after the family playtest.

**M4 client integration (locked at client build, 2026-07-08):** js/net.js
stashes world.tick entities as PERSISTENT game-shaped objects (same fields
the local sim produces) in id-keyed maps; `net.getServerEnemies()` /
`getServerTraders()` / `getServerDrops()` extrapolate ghost-style (velocity
derived from consecutive tick positions — the wire carries no vx/vy — capped
at 500ms, with a >2000 u/s teleport guard that zeroes velocity) and return
the live objects. combat.js/traffic.js merge them into
`game.enemies`/`game.traders` every frame, so render, minimap, homing,
options-orbs, and collision code run unbranched; server drops draw through
the same `renderDrops` path via a one-call list swap in render.js. The
discriminator everywhere is `id !== undefined` = server-owned.

- **Online bypass:** `updateEnemies` skips spawn cadence, `updateRaidBands`,
  and the shared-core AI for server enemies; `updateTraffic` skips
  `initTraffic` spawning and respawn cadence. Client-local exceptions KEEP
  their local CombatCore/TrafficCore behavior online: named-warlord bounty
  targets (`isBoss`), escort-ambush raiders (tagged `escortAmbush` at spawn),
  and `isEscort` traders. Merge rule: `[...server, ...locals]` each frame.
- **Client-synthesized fields** the enemy/trader wire omits: enemy
  `weapons.range` 400 (cosmetic red ring), `velocity` in per-frame units from
  tick deltas; trader `hull`/`maxHull` 60/60 (hides the damage bar — server
  freighters aren't client-damageable per the known gap), `size` 10,
  `goodType` null (no cargo glow), `name` falls back to a deterministic hash
  of the id into TRADER_NAMES when the additive field is absent.
- **Hits on server enemies:** `checkProjectileCollisions` sends fire-and-
  forget `damage.claim` + client-predicted feedback (sparks/sound/predicted
  hull dent on the stash object; next tick corrects). Shielded bosses splash
  locally with the core's exact feedback and send NO claim. Kill celebration
  WAITS for `enemy.killed`: `by === me` → the same `applyKillRewards` path as
  local kills (streak math on the raw reward, XP = stash `maxHull/3`,
  escortsLeft counted from the stash) but with `drops: []` (server loot rides
  the tick / the enemy.killed drops, stashed idempotently by id) and
  `grudgeDelta: null` (NO `recordRaidBroken` online — `grudge.update` is the
  truth, else double-count); `by !== me` → explosion + `☠ <pilot>` floater,
  no credits/XP/sound.
- **Shots:** `targetPilot === me` → real `enemy_laser` resolved against own
  ship locally (damage from the additive `shots[].damage`, falling back to
  tierName/size inference); `targetPilot !== me` → same visual with
  `tracer: true`, damage 0, skipped by every collision branch, expires by
  age/range.
- **Drops:** fly-through (<26 units) sends `drop.claim` (1.5s re-claim
  window); a full hold never claims cargo (the claimer applies the pickup, so
  claiming unscoopable cargo would vaporize it). `drop.taken` by me → the
  local pickup semantics (space-capped cargo add / `activatePowerup`); by a
  peer → the drop just disappears. Powerup drops carry no `powerType` on the
  wire: each client rolls its own flavor (pre-claim star color is cosmetic;
  the claimer's roll is what activates).
- **Grudges:** `grudge.update` mirrors DIRECTLY into `game.pilot.grudges`;
  `world.snapshot` grudges mirror by MAX (char.push races the snapshot, so
  solo-earned grudges survive until the server's seeded broadcast lands).
- **Transitions:** disconnect → server entities + tracers vanish quietly (no
  explosions), stashes clear, local sim resumes on its own cadence next
  frame. Reconnect (`welcome`) → quiet despawn of local sim entities EXCEPT
  named warlords, escort-ambush raiders, and isEscort traders; server state
  flows in on the next tick.
- **Escort docking online:** market impact is a no-op (server owns markets;
  its own freighters trade through world state) and the "prices shift" toast
  is suppressed. An escort that ARRIVES online melts out of the sky rather
  than into ambient traffic (isEscort→false drops it from the merge) —
  accepted cosmetic difference.
- **Console hook:** `window.netCombat()` →
  `{ enemies, traders, drops, lastTickN }` (plain snapshots with ids).

## verify-net.mjs (the gate)

Node script at repo root. Uses `puppeteer-core` with
`executablePath` = newest `~/.cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
Spawns `server/server.mjs` with `PORT=<scratch>`, `DB_PATH=<tmp>`,
`STATIC_DIR=<repo>`, `FAMILY_SECRET=verify`, `VERIFY_DEBUG=1` (enables the
M3 `debug.*` hooks; the [world] persistence test kills and respawns the same
port+DB to prove the SQLite world snapshot survives). Opens two pages
(`?pilot=VerifyA&ws=ws://127.0.0.1:<port>` etc. — the secret is preseeded into
`localStorage.space_trader_secret` via `evaluateOnNewDocument`, NOT passed as
`?secret=verify`, because js/verify.js runs the state-mutating solo suite on
`location.search.includes('verify')`; no harness URL may contain the lowercase
substring "verify", so the offline page uses `?netoffline` as its marker),
drives them via `page.evaluate` on existing console hooks. Asserts (per
MULTIPLAYER.md):

1. both clients converge on the same enemy set within N ticks (M4)
2. A's damage claim reduces the enemy B sees (M4)
3. A's ghost renders on B with name + hull silhouette (M2)
4. A's market sale moves the price B reads at dock (M3)
5. disconnect/reconnect: A's character survives, world keeps running (M1)
6. offline fallback: with no server, game boots and plays solo (M1)

Assertions land as `PASS/FAIL [suite] name` lines + final `VERIFY-NET-PASS
n/n`; process exit code 0/1. Milestones enable suites incrementally — the
harness must run green at every milestone for the suites that exist so far.
Solo gate stays: `?verify` 92/92 via the documented chrome-headless-shell
one-liner, with NO server running.

## Client integration points (from the architecture map)

- Load `js/net.js` after `character.js`, before `verify.js` in index.html.
- Hook: `characterManager.initialize()` completes → `net.connect()`; on
  `welcome` run the sync rule; `characterManager.saveCharacter` throttle also
  triggers `char.push` when online.
- 10Hz sender + ghost interpolation run off their own `setInterval`, not the
  RAF loop.
- `render()` draws ghosts; `updateMiniMap()` adds ghost blips (M2).
- `buyGood`/`sellGood`/`dock` route through net when online (M3), else local.
- `checkProjectileCollisions` sends `damage.claim` for server enemies (M4);
  local enemy sim is bypassed when online, kept intact for offline solo.
```
