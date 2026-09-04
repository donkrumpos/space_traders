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

**RESPAWN QUESTION — PARKED (post-sync riff, same day):** after a long
riff (respawn-at-wreck, nearest-visited-port, pod-state ladder), the
developer is leaning **keep the current system as is**: die way out →
sent back to start; in the expanded universe the punishment IS starting
over, and it scales with every region added, free. The keeper insight:
what survives death is KNOWLEDGE (charts, rank, perks) — what dies is
position and cargo; that's a roguelike loop already latent. Don't nag,
don't build a respawn slice unless the developer re-raises it. Watch
signal instead: after real deaths, do pilots fly back out (working) or
log off (revisit)?

**Death-mechanics RESEARCH done (same day, developer-requested):**
`docs/death-research.md` — deep-research pass, 22 claims verified 3-0.
Headline: the developer's wild-beacon "save point" idea is the
strongest evidence-backed shape (the one controlled study on respawn
location found player-ACTIVATED savepoints and permadeath both beat
automatic checkpoints on autonomy+curiosity); current respawn-at-start
is the well-scoring condition at today's map size; distance-as-
punishment is cautioned against at expansion scale (Gorgon failure
modes); severity should follow CONSENT not distance; EVE's clone-relay
lore + our signal canon make beacons diegetic. Still NOT pinned — the
developer is deliberately thinking; don't build.

**Also riffed same day, awaiting pins (do NOT build unpinned):**
- **Nomenclature taxonomy PROPOSED**: Region / World / Station / Port
  (capability, not identity) / Site / Contact / Wreck; procgen law =
  every generated object gets a Combine designation, NAMES are only
  authored or earned via chronicled events (lore-bible §3 extended).
  Seven dockables classify 3/3/1: worlds Agricon Prime, Core World
  Central, Meridian Deep; stations Mining Station 7, Tech Hub Alpha,
  Frontier Outpost; **ruin** Ossuary Drift (proposed third class —
  precursor wreckage, the procgen frontier's mystery category).
- **World/station/ruin GRAPHIC split designed, awaiting go**: today all
  seven draw as one flat colored circle (render.js ~line 276). Slice
  shape: `class` field on planets.js rows, three draw grammars (worlds
  round+shaded terminator/atmosphere rim, stations angular+docking
  arms+nav blink, ruins broken shards+bone-white pulse), same on map
  view, `[render]` verify suite, handbook line. Client-only.
- **Death architecture stack riffed, NOT pinned** (pilot-persists/
  ship-mortal, pod ghost-state, region-scaled severity, opt-in ironman)
  — superseded in spirit by the parked keep-as-is lean above; keep the
  riff in the transcript, revisit only if the developer reopens death.

**NEXT (ordered):**
1. **External uptime pinger** (carried, developer's step — needs an
   account): point UptimeRobot-or-similar at
   https://siegeperilousstudio.com/healthz, alert on non-200/ok:false.
   Nudged again this session.
2. **Graphic split slice** (world/station/ruin — designed above, the
   likeliest next build) and **nomenclature canon docs** — both awaiting
   the developer's go/pins.
3. **Ask Dad about the first death** (watchlist: death FX boom radius,
   corpse-run feel, countdown length — now also the respawn watch
   signal: did he fly back out or log off?).
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
