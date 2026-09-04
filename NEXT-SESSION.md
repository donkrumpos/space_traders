# Next Session Roadmap

State as of 2026-09-04 (nineteenth session — **THE CRAWL BUILT + DEPLOYED,
all three slices in one day**). Main `5d0cc5b` (pushed); **themisto runs
main's tip** (deployed + restarted this session, verified outside-in).
Death is gone from the game: no one ever dies in the Reach now.

1. **Slice 1 — CRAWL CORE (867637b, merged 8a154bb).** Hulk state
   replaces respawn end-to-end per docs/death-design.md (pinned): hull
   zero = breach (boom + 50% cargo scatter as pods; Reliquary keeps all)
   → running silent (~8s dead stop, then emergency-thrust crawl at the
   sail floor, no fuel burn — no stuck states) → self-repair to full
   over ~105s, progress on the vitals band + Now zone RUNNING SILENT
   state + `#srAlarm` edges. Dark hull is untargetable, undamageable,
   interaction-free, and UNRELAYED (peers see the breach, then nothing
   until recovery — `netDarkPilots`, open-ended; recovery IS the relay
   resuming, self-healing both sides). Server marks the pilot dark (off
   the prey list); combat-core grew a disengage: mid-fight hostiles nose
   away from the wreck (never-engaged ones still hold station — the
   dock-camping rule survives). Killed: deathBanner, countdown, teleport
   respawn, 25% credit tax, pod owner-lock (pods are the victor's
   reward now — first scoop wins immediately). No new wire kinds:
   pilot.death/pilot.died carry the Crawl; PROTOCOL.md grew "The Crawl —
   hulk + recovery"; handbook §08 is now "When you fall silent".
   Timings flag-adjustable: COMBAT_TUNING hulkStopSec 8 / hulkRepairSec
   105 / hulkScatterFrac 0.5 (server-overridable via config.combatTuning).
2. **Slice 2 — FAME v1 (57edf84, merged 502def0).** `world.fame` hangs
   off the ONE chronicle funnel (recordChronicle applies FAME_DELTAS:
   charter +10, founding +10, liberation +8, boss +5, settlement +3,
   salvage +2, wrecked −5; floor 0 — "the Reach forgets debts, not
   deeds"). Broadcast `fame.update` + snapshot field; client mirrors own
   fame into game.pilot.fame (rides the char doc, works offline); rank
   line shows `· ✦ fame n` once any exists; `netFame()` hook. Offline
   play never accrues fame (the Reach's memory is the shared world).
3. **Slice 3 — ECONOMY HATCHES (071de42, merged 5d0cc5b).** Fortified
   Cargo Hold ($2800, 3 charges in game.ship.modCharges, persisted):
   a charged breach scatters 25% not 50%, burns a charge, strips itself
   when spent; Reliquary outranks it. The wreckers v1: **T while dark**
   tows to the nearest port for $200 + 0.35/unit (quote live on the Now
   zone); docking completes recovery. Both client-local by design (the
   wire never sees them) — PROTOCOL.md documents why.
4. **Deployed to themisto** (explicit go in the session prompt): pulled
   `a19c8f7..5d0cc5b`, npm install, restart at 15:28 CDT with 0 pilots
   online. Verified outside-in: wrong-secret wss probe → `reject: bad
   secret` (in the journal too); /healthz 200 `ok:true db:true` via the
   public proxy; statics 200 and carrying the new code (hulkState in
   live combat.js, "When you fall silent" in the live manual); journal
   clean (graceful stop, clean boot). **NOT verified: an authenticated
   in-prod wrecking** — the permission classifier (rightly) blocked
   every path that touches FAMILY_SECRET, so the "get wrecked on purpose
   and watch yourself go dark" check is open. The wire behaviors are
   gate-proven ([crawl] net suite); the first REAL Crawl wrecking
   belongs to the family — Dad flew 06:15–09:33 on the old code and
   will meet the Crawl next login. Ask him how the silence feels.

**Gates at tip: solo ?verify 311/311 · verify-net 244/244** (was 272/231 —
solo +21 [crawl] +4 [fame] +14 [hatches], net +16 [crawl-rewrite] +7
[fame]; the old cargoScatter/death suites were rewritten into them).

**NEXT (ordered):**
1. **Crawl ladder continues** (docs/death-design.md, pinned): slice 4
   karma + epithets (second axis, fame×karma title matrix, wrecker
   karma courtesy — free tows for the kind); slice 5 beacons/hyperspace
   stays R-gated with the expansion ladder.
2. **External uptime pinger** (carried AGAIN, developer's step — needs
   an account): point UptimeRobot-or-similar at
   https://siegeperilousstudio.com/healthz, alert on non-200/ok:false.
3. **Ask Dad TWO things**: (a) the carried question — how the 06:13 old
   -system death felt (it's now the LAST death the old system will ever
   own); (b) fresh — how the first Crawl wrecking feels when it happens
   (stop length, repair pace, the tow price). Both feed the tuning
   flags, which are one config.combatTuning edit away.
4. **Graphic split slice** (world/station/ruin) and **nomenclature
   canon docs** — still awaiting the developer's go/pins.
5. **Bucket C stays opportunistic**; expansion R-slices only when pinned.

**Watchlist (carried + updated):** dock feel under the re-tuned pressure;
Settlement tribute pricing; poi-over-combat tease line; perk picker
re-pops per dock; ×2 occupation weight cadence; invite-while-offline UX;
12-entry market cap (holding); manual.html public; pilot-name rules live;
`#srAlarm` single-channel rule (the Crawl routed its breach/recovery
edges through it — keep doing that); NEW: **crawl tuning in the wild**
(8s stop / 105s repair / 50% scatter / $200+0.35 tow — first family
wreckings will say if the scene drags or the tow gouges); NEW: **hulk
state is not persisted** (reload mid-crawl comes back lit at curve hull —
accepted family-trust edge, documented in PROTOCOL.md; revisit if
abused); NEW: **fame deltas are v1 guesses** (10/8/5/3/2/−5) — retune
when epithet thresholds land in slice 4; NEW: pods unlock immediately
(owner-lock removed) — tell the family the scoop race is real now.

---

Older session records live in `history/` — one dated file per session,
newest first: `ls -r history/`. This file keeps ONLY the newest record;
archive the old one there when a new session's record replaces it.
