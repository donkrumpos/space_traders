# Next Session Roadmap

State as of 2026-09-04 (eighteenth session — **DEPLOYED + first prod death
witnessed + aria-live alarms**). Main `2b7d68e` (pushed); **themisto runs
main's tip** (deployed this session, verified outside-in). One slice built:

0. **Deploy to themisto (explicit go, done first).** Pulled
   `8164693..d986329`, npm install, restart. (Note: themisto was at
   `8164693`, not `d72022b` as the old record said — the sixteenth
   session's own deploy note, docs-only on top of d72022b; no mystery.)
   Verified outside-in: wrong-secret wss probe → `reject: bad secret`;
   /healthz 200 `ok:true db:true`; statics 200 including the new
   js/escape.js; the manual.html ⎘ link present in the live index.html
   (drawer header + controls footer). Journal clean after restart — no
   `bad pilot name`, no `flood kick`; Dad auto-reconnected 30s after the
   restart (he was flying at the time). The boundary rules now protect
   the actual server. A follow-up statics-only pull later in the session
   brought themisto to `2b7d68e` (no restart — no server/ or js/sim/
   files in that range).

1. **THE FIRST PROD DEATH HAPPENED.** Chronicle (read-only better-sqlite3
   query via the deployed repo — sqlite3 CLI isn't on the box):
   `{"kind":"pilot.died","pilot":"Dad","faction":null,"near":"Ossuary
   Drift"}` at 2026-09-04 06:13:02 CDT — about two minutes before this
   session's deploy restart. Chronicled correctly on the OLD code (the
   session-14 death pipeline worked live). Chronicle at 15 entries:
   12/12 market.event (cap holding), 2 poi.charted, 1 pilot.died.
   Watch item CLOSED. Follow-up for the watchlist: ask Dad how the death
   moment felt (boom radius, the corpse run, the countdown) — first real
   data point, and it feeds the respawn-design question below.

2. **aria-live alarms (ef64648, merged 2b7d68e) — the Bucket C targeted
   win.** The Now zone repaints innerHTML every tick, which screen
   readers treat as silence — so shields-down and fuel-out now speak
   through `#srAlarm` (visually-hidden `role=alert`, `.sr-only` CSS),
   one write per alarm EDGE (onset + recovery: "Alarm: shields down" /
   "Shields restored" / emergency-power → sail-crawl escalation /
   "Refueled"), keyed off raw ship condition rather than the rendered
   now-state so leaving combat range with shields still down doesn't
   falsely announce recovery. Handbook §04 grew the note (upkeep rule
   satisfied). Solo `[aria]` +7.

**Gates at tip: solo ?verify 272/272 · verify-net 231/231** (was 265/231 —
solo +7 aria). CI green on the merge push.

**OPEN DESIGN QUESTION — respawn location (developer riff, not pinned):**
proposal on the table is respawn AT the wreck after a delay (the delay =
others' scavenge window) instead of today's teleport-to-start + corpse
run (pods, 90s fuse). Pros/cons riffed this session (see the session
transcript / final summary): position-as-progress vs spawn-camping the
fight that killed you, self-scooping your own pods (death loses its
sting), the empty-tank-far-from-port softlock, dead-air countdown vs
travel-as-gameplay. Middle path named: respawn at NEAREST CHARTED
station (scales with the forever-universe, keeps a short-but-real corpse
run). NOT pinned — waiting on the developer's call; if pinned it's a
proper server+client gated slice (cargo.scatter is server-owned online).

**NEXT (ordered):**
1. **External uptime pinger** (carried, developer's step — needs an
   account): point UptimeRobot-or-similar at
   https://siegeperilousstudio.com/healthz, alert on non-200/ok:false.
   Nudged again this session.
2. **Respawn-location decision** (see open question above) — pin it and
   it becomes the next feature slice.
3. **Ask Dad about the first death** (watchlist: death FX boom radius,
   corpse-run feel, countdown length).
4. **Bucket C stays opportunistic** (sim unit tests WITH new sim math,
   big-file splits only during domain rewrites; the aria-live item is
   DONE).
5. Expansion R-slices **only when the developer pins one**
   (docs/expansion-design.md stays proposal-only).

**Watchlist (carried + updated):** dock feel under the re-tuned pressure;
Settlement tribute pricing in play; poi-over-combat tease line; perk
picker re-pops per dock; ×2 occupation weight cadence; invite-while-
offline UX; 12-entry market cap feel (still holding at 12/12 in prod);
death FX boom radius (**first real death happened — ask Dad**);
manual.html is public (vhost-gate if the family wants it private);
pilot-name rules NOW LIVE (only "Dad"/"Arthur" exist, both pass; any
other reject in the journal is news); the handbook link's blur-on-click
pattern rides along into future overlay links; NEW: the `#srAlarm`
region announces on raw-condition edges — if a future slice adds more
alarms, route them through `updateAlarmAnnouncements()` (one channel,
no per-tick spam), don't sprinkle new live regions.

---

Older session records live in `history/` — one dated file per session,
newest first: `ls -r history/`. This file keeps ONLY the newest record;
archive the old one there when a new session's record replaces it.
