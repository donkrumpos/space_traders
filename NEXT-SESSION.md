# Next Session Roadmap

State as of 2026-09-04 (seventeenth session — **handbook link SHIPPED +
Bucket B COMPLETE (all four slices)**). Main `9ca574c` (pushed); **themisto
still runs `d72022b`** — this session's five merges are NOT deployed, and
two of them touch server/game code (deploy = explicit go, per RUNBOOK).
Prod check + five slices, each branch → no-ff merge, gates green before
every commit:

0. **Prod chronicle check (read-only ssh, no deploy):** NO `pilot.died`
   yet — the first real death is still unwatched. But real play landed:
   **Dad charted The Ossuary Dig and Halgren's Eddy** (first prod POI
   charters), and the per-kind chronicle cap is doing its job live
   (12/12 market.event, notable history preserved). /healthz answers
   green from outside; a pilot was online mid-check.
1. **Handbook link (47382ce).** manual.html stops being URL-only: ⎘
   links in the docked drawer's header (new tab, noopener, blur-on-click
   so the SPACE dock key can't re-fire it) and the always-visible
   controls footer (the game's "join screen" is prompt() dialogs — no
   anchor there). Districts suite +2.
2. **WS boundary hardening (ead5a5b) — Bucket B-a, SERVER CODE.** Pilot
   names: 1–24 chars, letters/digits/space/`'._-` only → reject `bad
   pilot name` (client drops its stored name and re-prompts, the
   bad-secret footgun shape). ship.state numerics type+finite+range
   checked as a whole frame (JSON `1e999` → Infinity; one bad field
   drops the frame before peers OR combat AI); null shipName still
   relays (unchristened ships); shipName/hullId length-cut. Per-socket
   rate limit BEFORE parsing: >100 msg/s drops, >500/s flood-kicks.
   PROTOCOL "Boundary rules" section. Net `[bounds]` +10.
3. **escapeHTML (2519f7c) — Bucket B-b.** js/escape.js is THE shared
   helper (all five specials); factions.js's escName retired into it.
   Audit: toasts + hull engraving already textContent, ghost tags
   canvas, faction fields + pilot names server-restricted. Sinks that
   interpolated raw player text now escape: journal lines, chronicle
   entries, christening banner, mod-card source line. Solo `[escape]`
   +4 (hostile name/entry/banner render inert).
4. **Docs hygiene (05c331f) — Bucket B-c.** NEXT-SESSION.md keeps ONLY
   the newest record (this one) — older records live in `history/`, one
   dated file per session (**new ritual: archive the old record there
   when writing a new one**). TEST-PLAN.md deleted (retired process),
   index_original.html deleted (git history keeps it). CLAUDE.md
   updated.
5. **CI (9ca574c) — Bucket B-d.** `.github/workflows/gates.yml` runs
   `npm test` on every push/PR (ubuntu, node 22, chrome-headless-shell
   cached in the ~/.cache/puppeteer layout). Getting it green took four
   real fixes, all good on their own: verify-net's chromePath was
   mac-arm64-hardcoded (now platform-agnostic); verify-solo needed
   `--no-sandbox` (matches verify-net); `VERIFY_TIMEOUT_SCALE` env
   stretches every until() + the run cap for 2-core runners (workflow
   sets 3; local default 1, waits return early on success); and TWO
   pre-existing flakes fixed at the root — `[boot] traffic initialized`
   (game.traders was lazily initialized on the loop's first traffic
   tick; init() now populates the lanes at boot, online merge rule
   unaffected) and the `[occupation]→[faction]` cascade (early-mustered
   band wanders off chasing prey; window 20s→45s covers the flight
   back).

**Gates at tip: solo ?verify 265/265 · verify-net 231/231** (was 259/221 —
solo +2 handbook +4 escape; net +10 bounds). CI run on main: green.
Handbook upkeep rule checked: the link slice IS the handbook surfacing;
no mechanics changed, manual.html untouched by design.

**NEXT (ordered):**
1. **Deploy to themisto** (explicit go required; server/server.mjs +
   js/game.js + client files changed → pull + restart, wss probe after,
   per RUNBOOK). Until then the boundary rules protect nobody.
2. **External uptime pinger** (carried, developer's step — needs an
   account): point UptimeRobot-or-similar at
   https://siegeperilousstudio.com/healthz, alert on non-200/ok:false.
3. **Watch the first real death in prod** (carried; netChronicle() or
   the read-only ssh recipe — see this session's step 0).
4. **Bucket C stays opportunistic** (sim unit tests WITH new sim math,
   aria-live on shields-down/fuel alarms folded into UI slices,
   big-file splits only during domain rewrites).
5. Expansion R-slices **only when the developer pins one**
   (docs/expansion-design.md stays proposal-only).

**Watchlist (carried + updated):** dock feel under the re-tuned pressure;
Settlement tribute pricing in play; poi-over-combat tease line; perk
picker re-pops per dock; ×2 occupation weight cadence; invite-while-
offline UX; 12-entry market cap feel in the Log tab (prod data point
this session: the cap looks right — 12 market lines, history intact);
death FX boom radius; manual.html is public (vhost-gate if the family
wants it private). New: pilot-name rules are live once deployed — an
existing player whose stored name violates them gets one clean
re-prompt (only "Dad"/"Arthur" exist in prod, both fine); the handbook
link's blur-on-click pattern should ride along into any future overlay
links (SPACE is the dock key).

---

Older session records live in `history/` — one dated file per session,
newest first: `ls -r history/`. This file keeps ONLY the newest record;
archive the old one there when a new session's record replaces it.
