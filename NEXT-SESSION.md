# Next Session Roadmap

State as of 2026-10-05 (twentieth session — **slice 4 KARMA + EPITHETS
built, merged, NOT deployed**). Main at the merge of `feat/karma-epithets`
(`ba1cd16`); **themisto still runs `5d0cc5b`** (server/world.mjs +
server/combat.mjs changed → deploy = pull + npm install + restart + wss
probe, per docs/RUNBOOK.md — explicit go only).

1. **Slice 4 — KARMA + EPITHETS (ba1cd16).** `world.karma` hangs off the
   same `recordChronicle` funnel as fame: KARMA_DELTAS grudge.settled +3,
   poi.liberated +3, escort.arrived +3, wreck.looted −4. No floor/ceiling;
   `pilot.died` never touches it. New wire: `karma.update` broadcast +
   snapshot field; `escort.arrived` c→s claim (escorts are client-local
   per M3; 5s spam guard; freighter name bounded). **The cold lane:**
   `cargo.scatter` pods carry `wreckOf` + per-breach `wreckId`;
   `drop.claim` on another pilot's wreck pod chronicles `wreck.looted`
   ONCE per (looter, wreck) — the scoop race is still real, it now has a
   price the ledger names ("X picked Y's pockets while the hull was
   dark"); the scooper's HUD says so the first time. Epithets are
   client-side (`js/pilot.js epithetFor`): fame tiers 15/40/80 × karma
   lanes ≤−8 cold / ≥8 kind / plain → the Picker/Vulture/Dread, the
   Seen/Named/Storied, the Steady/Good Hand/Lodestar; no fame → no name
   (naming law). Own rank line: `Captain, the Seen · ✦ fame n · ⚖ karma
   ±n`; peer tags: `Dad the Seen — Kestrel` (`netEpithetOf`). **Wrecker
   courtesy:** karma ≥ towCourtesyKarma (8) rolls towCourtesyChance
   (0.34) to wave the tow fee (COMBAT_TUNING, server-overridable); the
   Now-zone quote says "the road may remember you" when eligible.
   `escort.arrived` joins `market.event` as a MINOR chronicle kind
   (shared 12-cap, out of the digest headline) on server + client.
   Handbook: §Fame → "Fame, karma, and the name they earn you", §08 notes
   the courtesy. PROTOCOL.md grew the karma block + two wire rows.
   `netKarma()` → `{ all, mine, epithet }`.
2. **Playtest note logged (developer, 2026-10-05):** "I'm a bit
   overpowered since I've been playing a while. I stay around the planets
   so if I need a repair I quick dock — haven't died yet." Diagnosis: the
   Crawl, the hatches, and the courtesy only bite for a pilot who LEAVES
   the ports — right now nothing pulls a strong pilot out past the quick-
   dock radius. That is the expansion ladder's argument (frontier regions,
   beacons as the far harbor) and a tuning question (dock repair is free
   and instant). Not acted on this session — the developer has ideas
   queued (see NEXT below).
3. **Prod progression (developer ran the read by hand, 2026-10-05):**
   ONE pilot on themisto — **Dad: rank 8 Living Legend (the top rung,
   4000 XP), XP 6892, credits 1916, fame 84.** Findings: the rank ladder
   is EXHAUSTED (~2900 XP past the ceiling earning nothing); fame 84 is
   already the storied tier, so the deploy will read "Living Legend, the
   Storied" with zero karma deeds — 80 is a low ceiling for a one-pilot
   world with seven 10-fame charters; credits 1916 puts a maxed pilot in
   the LIGHT pirate-pressure band (wealth bands key off credits, which go
   into the ship) — that, plus free instant dock repair, is why nothing
   threatens them near the ports. All three point the same way as item 2.
   The classifier blocks my ssh reads ("production reads"); the recipe
   works from the developer's own shell (`!` prefix in the prompt):
   `ssh themisto 'cd /var/www/siegeperilous && node -e "const D=require(\"better-sqlite3\");const db=new D(\"/var/lib/space-traders/world.db\",{readonly:true});for(const r of db.prepare(\"SELECT name,doc FROM pilots\").all()){const d=JSON.parse(r.doc);console.log(r.name,d.pilot&&d.pilot.rank,d.pilot&&d.pilot.xp,d.ship&&d.ship.credits,d.pilot&&d.pilot.fame)}"'`
   (typed with the `!` prefix in a Claude Code prompt it lands in the
   conversation). In-game: `exportCharacter()`.

**Gates at tip: solo ?verify 326/326 · verify-net 261/261** (was 311/244 —
solo +15 [karma], net +17 [karma]).

**NEXT (ordered):**
1. **Deploy slice 4 to themisto** (explicit go): pull, npm install,
   restart, wrong-secret wss probe, /healthz, statics carry `epithetFor`.
   Then the family meets karma: first `wreck.looted` line in the ledger
   is the thing to watch — does the −4 read as a fair price for the scoop
   race or as a scold? One `KARMA_DELTAS` edit either way.
2. **The developer's ideas FIRST** (deferred this session — "my ideas
   can wait"). Hear them before picking a slice. The design pressure they
   land on, from items 2–3: a maxed pilot (rank capped, light pressure
   band, free quick-dock repair) has nothing to progress toward and
   nothing pulling them past the ports. Candidate levers if the ideas
   don't cover it: rank ladder past Living Legend or a prestige layer;
   pressure keyed to rank/fame as well as credits; dock repair with a
   cost or a wait; fame thresholds above 80; the expansion ladder's
   frontier (R-slices, pinned only).
3. **External uptime pinger** (carried a FOURTH time, developer's step —
   needs an account): point UptimeRobot-or-similar at
   https://siegeperilousstudio.com/healthz, alert on non-200/ok:false.
4. **Ask Dad** (carried): how the old 06:13 death felt, and how the first
   Crawl wrecking feels (stop length, repair pace, tow price). Both feed
   `config.combatTuning`.
5. **Graphic split slice** (world/station/ruin) and **nomenclature canon
   docs** — still awaiting the developer's pins. **Slice 5
   beacons/hyperspace** stays R-gated with the expansion ladder.
6. **Bucket C stays opportunistic**; expansion R-slices only when pinned.

**Watchlist (carried + updated):** dock feel under the re-tuned pressure;
Settlement tribute pricing; poi-over-combat tease line; perk picker
re-pops per dock; ×2 occupation weight cadence; invite-while-offline UX;
12-entry market cap (holding); manual.html public; pilot-name rules live;
`#srAlarm` single-channel rule; crawl tuning in the wild (8s / 105s / 50%
/ $200+0.35 — no family wrecking has happened yet under the Crawl); hulk
state not persisted (accepted edge); fame deltas v1 guesses — epithet
thresholds (15/40/80) now exist, so the retune has targets: a pilot
charting two sites and freeing one is "the Seen" (28); NEW: **karma
deltas v1 guesses** (+3/+3/+3/−4; kind lane at 8 = three good deeds,
cold at −8 = two wrecks picked over); NEW: **wreck.looted is the only
negative lane** — there's no trader fire, no contraband, no PvP, so a
pilot who never scoops a family member's pods can never go cold; NEW:
**the courtesy roll is pure chance** (0.34) — if a kind pilot gets
towed three times paying full freight it will feel broken, consider a
pity counter; NEW: **escort.arrived is a trusted claim** (like
damage.claim) — a looping client could farm karma; family-trust model
accepts it, the 5s guard caps the rate; NEW: **epithets on ghost tags
widen the label** — long pilot names + "the Good Hand" + a ship name may
crowd at the 10px font, nobody has seen it in the wild yet.

---

Older session records live in `history/` — one dated file per session,
newest first: `ls -r history/`. This file keeps ONLY the newest record;
archive the old one there when a new session's record replaces it.
