# Next Session Roadmap

State as of 2026-09-03 (sixteenth session — **Bucket A hardening: ALL FIVE
SLICES SHIPPED + DEPLOYED**). Main `d72022b`; **themisto runs `d72022b`**
(developer-authorized deploy same session: pull + npm install + restart,
clean boot; outside-in wss probe `reject: bad secret` through the full
TLS/Apache/node path; the `ProxyPass /healthz` lines were added to BOTH
siegeperilousstudio vhosts — sites-available, symlink-safe sed — configtest
+ reload clean; `https://siegeperilousstudio.com/healthz` answers 200
`{ok:true,db:true,...}` from outside, statics still 200; a real pilot was
online mid-verify, pilotsOnline:1). Five slices, each its own branch →
no-ff merge, gates green before every server-touching commit:

1. **README refresh (496acaa).** The old README predated combat ("4 goods
   between 5 planets", factions "planned"). Now describes the real game
   (combat/cartels/grudges, 8 goods, 7 worlds with nicknames, missions,
   ranks/perks/hulls, exploration, player factions, the shared world),
   real controls (SPACE docks, X/C fire, Z mode, R field repair — goods
   names verified against game.js's goods table, nicknames against the
   upgrade copy), run recipes, repo map, gates, links to manual.html +
   PROTOCOL + RUNBOOK.
2. **`npm test` (0ba4b62).** verify-solo.mjs wraps the solo gate (scratch
   static server + chrome-headless-shell under virtual time, mirrors the
   page verdict, nonzero exit on red); `npm test` = verify-solo && verify-
   net. README + CLAUDE.md gate sections lead with it. Note: verify-net's
   own [solo] suite means npm test runs the solo suite twice — accepted,
   the standalone runner gives fast fail before the long harness.
3. **Corrupt-save guard (b2c7884) — the strongest item, worse than the
   review knew.** The unguarded JSON.parse at connect wouldn't just fail
   one pilot: the throw rode the ws message handler into
   uncaughtException → **process.exit on every connect attempt by that
   pilot** (and the family shares one server). Now: newest backups-table
   row that parses wins, corrupt backups skipped, pilots row repaired in
   place (corrupt doc itself backed up for forensics), welcome.lastSeen =
   the backup's created stamp, no valid backup → fresh start. Gotcha
   caught by the suite's first red run: better-sqlite3 forbids writes
   while a cursor is open — restorePilotFromBackup scans, breaks, THEN
   savePilots. Net [saveguard] (9): raw sockets + direct SQL on the temp
   DB. PROTOCOL schema section documents the rule.
4. **?secret= scrub (b156f5a).** history.replaceState right after the
   identity block consumes+persists it; ?pilot/?ws survive. Synchronous
   at load — which is what makes `?secret=verify` harness URLs safe
   (verify.js reads location.search AFTER net.js cleans it; a scrub
   regression fires the solo suite inside the net harness = loud red).
   Net [handshake] +4. PROTOCOL identity section updated.
5. **/healthz (9015869).** { ok, uptimeSec, db, pilotsOnline,
   worldSaveAgeSec } on the node http server; broken SQLite → ok:false +
   503; worldSaveAgeSec null until first flush (idle age can grow — alert
   on ok, age is context). Completes the 2026-09-01 durability list. Net
   [health] (7). RUNBOOK: curl recipe + the one-line Apache ProxyPass to
   expose it to an external pinger — **that vhost line is a manual
   themisto step when the deploy happens.**

**Gates at tip: solo ?verify 259/259 · verify-net 221/221** (was 201 —
+9 saveguard, +4 scrub, +7 health). Handbook upkeep rule checked: nothing
player-facing changed, manual.html untouched by design.

**NEXT (ordered):**
1. ~~Deploy to themisto~~ ✅ DONE same session (see above). One human step
   remains: **point an external uptime pinger at
   https://siegeperilousstudio.com/healthz** (UptimeRobot or similar —
   alert on non-200/ok:false; needs an account, so it's the developer's).
2. **Watch the first real death in prod** (carried).
3. **Link the handbook from the game UI** (carried; small gated slice).
4. **Bucket B when scheduling allows** (see fifteenth-session triage
   below): WS boundary hardening, escapeHTML audit, docs hygiene
   (TEST-PLAN retirement, session-record archiving, index_original.html),
   CI running `npm test` (now trivially possible — that was the point of
   slice 2).
5. Expansion R-slices **only when the developer pins one**.

---

Older session records live in `history/` — one dated file per session,
newest first: `ls -r history/`. This file keeps ONLY the newest record;
archive the old one there when a new session's record replaces it.
