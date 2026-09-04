# Session record — 2026-08-06-review-hardening

(Archived from NEXT-SESSION.md; the rolling log keeps only the newest record.)

State as of 2026-08-06: **Code-review hardening session — two batches committed
and pushed (5a9623a, 81f8bf8), both gates green after each** (solo ?verify
102/102, verify-net 93/93). Four parallel review agents swept client logic,
net/server, render/UI, and repo structure; the top two tiers of findings are
fixed, the rest are backlogged below. **The server-side fixes are NOT yet
deployed to themisto** — first order of business next session.
(2026-07-08 family playtest record: commit 66689f5.)

## Deploy first — ✅ DONE 2026-09-02 (eleventh session)

All of the below shipped to themisto in the eleventh session (exploration +
M6 + visual language + review hardening + durability fixes). Kept for
reference:
- Note: local dev needed `npm rebuild better-sqlite3` after node hit v25.9 —
  if themisto's node ever jumps majors (it's on v22), same rebuild applies
  (an `engines` field in package.json is a backlogged nicety).

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
- **Net nits:** ~~`mission.taken` reqId echo~~ + ~~`dev-secret` fallback~~
  BOTH FIXED 2026-09-02 (eleventh session);
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
