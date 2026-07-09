# Next Session Roadmap

State as of 2026-07-08 (late night): **First real two-machine playtest DONE —
and it worked.** Dad + Arthur flew together on https://siegeperilousstudio.com;
the session produced a stream of live fixes, all deployed (themisto VPS,
Apache + wss + systemd; see docs/RUNBOOK.md). verify-net: 93/93; solo
?verify: **102/102**. Family secret + first-visit setup: RUNBOOK.md.

## What the playtest shipped (2026-07-08, commits bcf26ee → b86f86b)

- **Snapshot interpolation** for server enemies/traders (was extrapolate-and-
  snap → jerky). Docs said "interpolate"; now the code does.
- **Bad-secret reject is visible + self-heals** (Arthur typed the secret wrong
  and silently played offline solo — that was the "can't see Arthur" mystery;
  the server log's `reject: bad secret for pilot "arthur"` is the tell).
- **UI batch:** minimap anchored to the play area (was covering Ship Status),
  toast stack (cap 4, reading-time floor, ×N duplicate collapse), perk choice
  no longer force-pauses — pulsing ⭐ Training chip + dock prompt +
  "train later" dismiss. Pause is solo-only.
- **Solar-sail crawl:** dry tanks = 5% thrust floor, burns nothing, pale-blue
  flame, `0 (SAIL)` readout. The stranded softlock is gone.
- **Ballistic compensation** — THE fix of the night. Enemy bolts inherit
  shooter velocity; orbiting pirates smeared every shot ~150u sideways and
  could not hit even a PARKED ship (sim: 221 shots/60s → 0 hits). Gunners now
  solve barrel direction so total bolt velocity rides the aim line, plus
  per-tier intercept lead (scout .35 / raider .65 / warlord .9). Parked in a
  6-pack: 0 → ~48 DPS. Full-burn escape still works. 2 scouts vs parked
  beginner: 0.8 DPS (teaches, never kills).
- **Death is a moment:** 4s wreck pause (shatter explosions, SHIP DESTROYED
  banner + countdown + credit tax), cargo scatters as pods (`cargo.scatter`,
  owner-locked 8s server-side so nobody vacuums a wreck mid-respawn), corpse
  run to recover. **Reliquary Hold** (9th mod, $7500): cargo survives the
  wreck. verify-net harness ships now carry `game.testInvulnerable` plot
  armor (real gunnery was killing parked test pilots mid-suite).

## Next playtest watchlist

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

## Known v1 gaps (documented in PROTOCOL.md; post-playtest candidates)

- Online NPC freighters are indestructible (no server projectile sim).
- Named bounty warlords stay client-local online.
- Peers don't see your death (no death broadcast — your ghost just sits
  still for 4s, then teleports home). Candidate: broadcast + explosion FX.
- No `www.` DNS record / cert (bare domain only).
- backups table in world.db grows unpruned (fine for years at n=2).

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
