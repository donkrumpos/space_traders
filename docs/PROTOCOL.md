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
| `world.tick` | s→c *broadcast* | `{ n, enemies: [{id,x,y,angle,hull,maxHull,tierName,color,size,bandId,isBandBoss,shielded,factionName,isBoss}], traders: [{id,x,y,angle,state,color,isEscort}], drops: [{id,x,y,kind,goodType,qty}] }` at 10Hz |
| `damage.claim` | c→s | `{ enemyId, damage }` — server applies (last-writer-wins), no validation |
| `enemy.hit` | s→c *broadcast* | `{ enemyId, hull }` (piggybacks on world.tick; explicit msg optional) |
| `enemy.killed` | s→c *broadcast* | `{ enemyId, by, reward, drops }` — killer gets credits client-side; drops appear for both |
| `drop.claim` | c→s | `{ dropId }` → `drop.taken { dropId, by }` *broadcast* (first claim wins) |
| `grudge.update` | s→c *broadcast* | `{ grudges }` — family vendetta is shared world state (seeded at M4 migration from max of the two pilots' values) |

Clients render interpolated enemies/traders from ticks; local projectiles
detect hits and send claims; all spawn/AI/loot logic runs server-side in
`js/sim/*.js` modules (pure state, `fx` callbacks injected — browser passes
real feedback fns, node passes no-ops). Raid band size uses connected pilot
count per the locked answer.

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
