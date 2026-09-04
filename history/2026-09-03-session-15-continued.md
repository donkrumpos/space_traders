# Session record — 2026-09-03-session-15-continued

(Archived from NEXT-SESSION.md; the rolling log keeps only the newest record.)

State as of 2026-09-03 (fifteenth session, CONTINUED same conversation —
**expansion readiness RESEARCHED + PROPOSED, improvement review TRIAGED &
LOGGED**). Main `eb46b38`+ (docs-only since the handbook deploy; themisto
still at `6fb5e8d` = current game code, **nothing pending deploy**). Two
strands:

1. **`docs/expansion-design.md` — "The Widening Reach" (eb46b38).** The
   developer floated the forever-growing-universe direction ("current game
   = the tutorial section"); a three-agent audit + proposal doc now maps
   readiness. Headlines: planets/POIs are already add-a-row data-driven;
   unknown ids fail safe both ways; persistence merges per-entity on boot;
   scale is a non-issue. The two real blockers: **no protocol version
   handshake at all**, and **the gates can't pin a test world** (client,
   server, both suites read live SIM_PLANETS/SIM_POIS; verify.js:15 pins
   `=== 7`). Readiness ladder R1–R7 + ⚖ forks in the doc. **Status:
   PROPOSED — "something we can get ready for," NOT pinned as active
   work.** Don't start R-slices without the developer picking one.

2. **Improvement triage (external 12-item review; claims VERIFIED against
   code, then bucketed with the developer).** Logged here so no future
   session relitigates:

   **Bucket A — DO SOON (fits one session; developer leaning yes):**
   - **README refresh** — verified badly stale (says combat "in
     development", "4 goods between 5 planets"; factions "planned").
     Describe the real game (combat/missions/factions/persistence/
     multiplayer/exploration/8 goods/7 worlds), link manual.html +
     docs/PROTOCOL/RUNBOOK + gates.
   - **`npm test`** — one script running BOTH gates (solo ?verify +
     verify-net); today the incantations live only in CLAUDE.md.
   - **Corrupt-save guard** — `JSON.parse(stored.doc)` at connect
     (server/server.mjs ~123) is unguarded; one corrupt row could crash
     the connect path. Wrap it, auto-restore newest valid backup (the
     db `backups` table already exists). Strongest item on the list.
   - **Scrub `?secret=` from the URL** — one `history.replaceState`
     after consuming it (js/net.js ~34). Query strings leak into
     history/logs.
   - **`/healthz` endpoint** — process health, db availability, player
     count, world-save age. Completes the 2026-09-01 durability list
     (gives the external uptime ping a target).

   **Bucket B — real slices, schedule BEFORE inviting friends beyond
   family:**
   - **WS boundary hardening**: pilot-name length/char rules; finite/
     range checks on relayed ship.state numerics (a NaN position would
     poison every peer's screen — accident risk, not just cheating);
     per-message rate limits. Server already stamps identity from the
     socket, validates factions, whitelists relay fields — this adds
     the missing bounds. Pairs with expansion R3 (protocol versioning)
     as one "harden the front door" arc.
   - **Shared escapeHTML helper** + audit of innerHTML paths — pilot/
     ship/faction names are player-authored text reaching peers' DOM;
     no helper exists today, safety is per-call-site memory.
   - **Docs hygiene**: TEST-PLAN.md is doubly stale (describes retired
     branch AND retired family-playtest process) — retire or repurpose;
     move NEXT-SESSION's old session records to dated files under
     history/; archive/remove index_original.html.
   - **CI** running `npm test` on push/PR (gates are headless-ready by
     design; needs chrome-headless-shell in the workflow).

   **Bucket C — OPPORTUNISTIC (not campaigns):**
   - Node unit tests for shared sim modules — server already imports
     them, no restructuring needed; add WITH new sim math (first
     customer: R5 region rules), don't backfill.
   - A11y folded into UI slices as touched; the one targeted win worth
     doing sooner: `aria-live` on shields-down / fuel alarms.
   - Big-file splits (net.js 1252 / combat.js 1132 / verify suites) —
     only when a domain is being rewritten anyway (net.js during R4);
     not as its own project.

   **DECLINED (with reasons — don't relitigate without new facts):**
   - **ES-modules migration** — the shared-globals no-build architecture
     is load-bearing (same sim files run unforked in browser + server;
     both gates depend on it). Churn without a current problem.
   - **Revocable session tokens** — violates the 2026-09-01 "no
     pre-scaling infra" decision; family secret + login prompt is right
     until strangers exist.

**NEXT (ordered):**
1. **Bucket A hardening session** (the five small slices above — three
   touch server code, so both gates + explicit themisto deploy at the
   end).
2. **Watch the first real death in prod** (carried).
3. **Link the handbook from the game UI** (carried; small gated slice).
4. **Handbook upkeep rule** (carried, standing): feature lands → grow
   manual.html same session.
5. Expansion R-slices **only when the developer pins one** (R1+R2 are
   the natural first session when they do).
