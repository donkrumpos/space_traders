# Next Session Roadmap

State as of 2026-09-03 (fourteenth session — **teaser PULLED, chronicle
noise FIXED, death broadcast BUILT — ALL DEPLOYED**). Main `531dde8`
(pushed); **themisto runs `531dde8`, restarted clean** — the developer ran
the pull+restart by hand (the session's classifier had blocked ssh
mid-run), wss probe passed, and the boot-restore trim proved itself live:
the prod chronicle went **100/100 market.event → 12** on restart. Real
history can no longer be evicted by market churn. Three strands:

1. **Charter-desk teaser deployed (step 1, explicitly authorized).**
   Themisto pulled 21f9e10 → f7dd84d — static-only (js/pilot.js,
   js/verify.js), no restart needed, none done. Wrong-secret wss probe
   passed through the full TLS/Apache/node path (`reject: bad secret`,
   no junk pilot). The teaser is LIVE.
2. **Chronicle noise: diagnosed, then fixed (feature/chronicle-noise
   2a9bcbc, merged b1f002c).** The live prod world blob read **100/100
   market.event** — an event every ~5.5 min (180s run + 90-210s cooldown,
   24/7) turns the whole 100-cap over in ~9h, so every charter/founding/
   liberation was being pressured out of the world's permanent memory.
   Fix is per-kind-class caps: `market.event` trims against its own
   `CHRONICLE_MARKET_MAX` (12, ≈ the last hour of churn); every other
   kind — history, unknown future kinds included — keeps `CHRONICLE_MAX`
   (100). Trim runs on record AND on boot-restore (prod's all-market
   ledger cleans itself at the next restart); the client mirrors the rule
   (`trimChronicleEntries`); the away digest counts notable kinds only
   ("N things made the chronicle", market-only news = one soft "only the
   markets stirred" line); the Log panel gives markets at most 2 of its 8
   visible lines. `netChronicle()` grew `kinds` + `unseenNotable` (the
   exact diagnostic this session needed against prod). Wire unchanged;
   PROTOCOL M6 updated. Suites: solo chronicle +5, net [chronicle] +4
   (incl. server-side trim proof via debug.snapshot).
3. **Death broadcast (feature/death-broadcast ee89c9d, merged fb617ce) —
   the M4 gap is closed.** Peers used to see a dead pilot's ghost sit
   still 4s then teleport home, and the ledger never recorded deaths.
   Now: `pilot.death` c→s (sent once by handlePlayerDestruction; every
   landed hit stamps the shooter's cartel in
   `game.damage.lastHitFaction` so the killing blow names the errand) →
   server stamps identity from `ws.pilot` (never the payload), validates
   the faction against PIRATE_FACTIONS (unknown → null), computes the
   nearest world, swallows repeat reports within 10s, broadcasts
   `pilot.died {pilot, x, y, faction}`, and chronicles `pilot.died
   {pilot, faction, near}`. Peers play the wreck explosion at the spot
   (boom audible within 1200u), hide the ghost 4.5s through the respawn
   window (`netDeadPilots` beside the ghost map) — a blast, a gap, and a
   reappearance at the respawn point. Ledger line errand-voiced (§8 rule
   4): "the Rustfang Cartel collected their toll from X off Mining
   Station 7" / "X's ship broke up off Y". PROTOCOL M4 wire rows + M6
   kind row same slice. Suites: solo +3, net [death] +10 (full
   two-client flow, first-try green).

**Gates at tip: solo ?verify 259/259 · verify-net 201/201.**

**NEXT:**
1. ~~Deploy to themisto~~ ✅ DONE same session (developer-run pull +
   restart; wss probe green; prod ledger trimmed 100→12 on boot).
2. **Watch the first real death in prod** (netChronicle() should show a
   pilot.died entry; peers should see the blast).
3. **Faction backlog:** member salvage priority ONLY on the play-signal
   "why did I even claim this place".
4. **Standing backlog:** nebula mist ambient (ninth-session spec), www
   DNS/cert (Hover A www + certbot -d ×2), same-pilot-two-devices kick
   ping-pong (newest-hello-wins takeover rule).

**Watchlist (carried):** dock feel under the re-tuned pressure (knobs in
config.mjs combatTuning); Settlement tribute pricing in play (perPoint
6/3/4 on PIRATE_FACTIONS.amnesty); poi-over-combat tease line if the
claim button still hides; perk picker re-pops per dock; ×2 occupation
weight cadence; invite-while-offline UX. New: does the 12-entry market
cap still feel like living markets in the Log tab, or too quiet; death
FX at 1200u — is the boom radius right in real play.

--- (thirteenth-session record follows) ---

State as of 2026-09-03 (thirteenth session — **the Tally DEPLOYED, watchlist
decided, the Settlement BUILT (the VENDETTA amnesty seed, carried since
July)**). Main `872393e`; themisto runs `8975e87`.
**LATE ADDITIONS, same session:** (1) **the Settlement is DEPLOYED** —
themisto pulled 8975e87 → 21f9e10, service restarted clean, wrong-secret
wss probe passed. (2) **The charter-desk teaser was then built + merged**
(strand 4 below) — main moved past themisto again, so **themisto runs
21f9e10 and awaits ONE `git pull` for the teaser** (static-only, NO
restart needed; explicit per the deploy ritual). (3) **The developer
logged into prod live** — first real-play contact after the deploys: the
away-digest fired, the Rep tab remembered them. New watchlist item: the
digest read "100 things happened" = the chronicle is AT ITS CAP, and the
visible tail was all market events — market-event churn may be drowning
the ledger's real history (charters, liberations, foundings). Consider:
exclude market events from CHRONICLE_MAX pressure, give them their own
short cap, or filter the digest to notable kinds. Four strands:

1. **The Tally deploy (step 1, explicitly authorized).** Themisto pulled
   9c2cdb5 → 8975e87, service restarted clean, outside-in wss probe got
   `{"t":"reject","reason":"bad secret"}` through the full TLS/Apache/node
   path (scratch `wss-probe.mjs`, no junk pilot). Everything through the
   Tally is now LIVE.
2. **Watchlist pass (decided, deliberately not built):**
   - **(a) dock feel** under the re-tuned pressure: no real-play signal yet
     (the re-tune only went live this morning) — keep watching; knobs are
     one `config.mjs combatTuning` edit away.
   - **(b) charter desk:** the burial itself is right (the Shipyard walk is
     deliberate), but the design sketch's one-line Rep-tab teaser for
     factionless pilots ("a banner needs a want — the charter desk is in
     any shipyard", faction-design.md UI sketch) was NEVER BUILT —
     `factionBannerHTML()` returns `''` when factionless. DECISION: build
     the teaser as a small next slice; it rides the same Rep surface the
     Settlement just touched, and it surfaces exactly when grudges make
     the tab visible.
   - **(c) combat-over-near-POI Now-zone priority:** KEEP the order —
     combat info is safety-critical, and you don't raise a banner
     mid-firefight (clearing the field IS the 'place' deed). If play still
     hides the claim button too much, the fix is ONE tease line inside the
     combat state when a charted claimable site sits within 600u ("clear
     the field — the site waits"), not a state swap.
3. **The Settlement (feature/grudge-amnesty e389b8f, merged 872393e, NOT
   deployed — server-side world.mjs/combat.mjs changed).** Forks pinned via
   AskUserQuestion (all recommended options taken): **tribute per point** ·
   **one mechanic, per-cartel goods** (`amnesty { good, perPoint, offer,
   cleared }` on shared PIRATE_FACTIONS — Choir cognition cores ×3/point,
   Rustfang ferrovolt ore ×6, Iron Shoal panacea vials ×4; player banners
   carry no terms) · **Guild-brokered at any dock** (settle button on the
   Rep tab's grudge rows; affordability follows the hold via the trade/dock
   tails) · **whole-reach clearing** (one pilot settles the family's debt;
   chronicled errand-voiced, the cartel's own closing line when the debt
   zeroes). Wire: `grudge.settle`/`grudge.settled`, amnesty stamps ride
   `grudge.update` + the snapshot. **Merge re-infection guard** (the subtle
   part): `world.grudgeAmnesty` stamps every pay-down and a doc may only
   RAISE a settled faction's grudge if its mirrored `pilot.grudgeAmnesty`
   stamp proves it has seen the settlement — otherwise every stale doc
   reconnecting would resurrect the paid debt; offline-earned grudges still
   merge (client applies the same rule to its snapshot max-merge). Solo
   parity: same Rep-tab table eases your own ledger; with a server
   configured but unreachable the desk waits (no reconnect clobber).
   PROTOCOL: M7 wire row + M4 merge-rule amendment in the same slice.

**Gates at tip: solo ?verify 249/249 · verify-net 187/187.** New: solo
`amnesty` (8 asserts incl. per-cartel terms coverage), net `[amnesty]` (9
asserts incl. the stale-doc and seen-stamp merge paths; the no-grudge
refusal assert is deliberately self-contained — earlier suites' boss kills
leave real grudges on the other cartels).

**NEXT:**
1. ~~Deploy the Settlement to themisto~~ ✅ DONE same session (see above).
2. ~~Charter-desk teaser~~ ✅ DONE same session (883db47, merged b5f8a7c):
   one dim signpost line atop the Rep tab for grudge-holding factionless
   pilots; rendered AFTER the visibility gate so the teaser never opens the
   page itself (banner suite +2 guards both directions). Static-only —
   **awaits one themisto pull, no restart needed**. Gates: solo 251/251 ·
   net 187/187.
3. **Chronicle noise pass** (new, from the live login): the world ledger
   sits at CHRONICLE_MAX=100 and market events dominate it — decide
   whether market events get their own short cap / stop pressuring the
   real history out / get filtered from the digest. Diagnose first: count
   kinds in the live chronicle (`netChronicle()` or the world blob).
4. **Death broadcast** (M4 gap — the recommended next real build): peers
   see your ghost sit still 4s then teleport home; slice = one wire msg +
   ghost explosion FX + a chronicle death entry (the ledger's biggest
   missing event), PROTOCOL section same slice, ends in a deploy.
5. **Faction backlog:** member salvage priority ONLY if claims feel
   toothless in play (trigger: "why did I even claim this place").
6. **Standing backlog:** nebula mist ambient (ninth-session spec), www
   DNS/cert (Hover A record + certbot -d ×2), same-pilot-two-devices kick
   ping-pong (needs a newest-hello-wins takeover rule).

**Watchlist (carried + updated):** dock feel under the re-tuned pressure
(no signal yet); does the Settlement's tribute pricing land in play
(perPoint 6/3/4 — consts on PIRATE_FACTIONS.amnesty; a VENDETTA ×5 with
the Choir costs 15 cores); poi-over-combat tease line if the claim button
still hides; perk picker re-pops on every dock while choices pend; ×2
occupation weight cadence; invite-while-offline UX.

--- (twelfth-session record follows) ---

State as of 2026-09-03 (twelfth session — **developer look FINISHED, factions
MERGED + DEPLOYED, pirate pressure TUNED + DEPLOYED**). Main `9c2cdb5` is
live on themisto (wss verified from outside: probe with a wrong secret gets
`reject: bad secret` through the full TLS/Apache/node path). Three strands:

1. **The developer look (walked in-browser, both pilots).** Whole checklist
   verified live: found (charter desk, fee, gate) → invite → Arthur signs on →
   rosters on both Rep cards → ghost name-tag tinted in banner color → the
   claim (Now-zone button, toast, ring on canvas + minimap, chronicle entry)
   → contested (pink ring + ⚑ Rustfang flag together). Method: a throwaway
   `dev-driver.html` (deleted after) wrapping the game in a same-origin
   iframe with buttons for the console helpers — needed because the browser
   extension denies raw JS eval; two origins (`localhost` + `arthur.localhost`)
   gave two clean localStorage identities. **Recipe correction: credits live
   at `game.ship.credits`** (the old note said `game.credits` — that same
   wrong property was BUG 4 below).
2. **Five bugs found by the look, fixed in two verified slices (5b7f063,
   12ff4ad), all merged with the factions branch (d427581):**
   - Global hotkeys fired while typing (a SPACE in "Reef Wardens" undocked
     you mid-founding and ate the character; M opened the map). keydown now
     ignores INPUT/TEXTAREA/contentEditable.
   - Reload-while-docked restored the flag but not the docked screen (and a
     serialized currentPlanet copy broke net.js's `===` market refreshes).
     applyCharacterToGame now re-points at the live planet and restores the
     docked/engaged UI without re-running dock() (no double customs/XP).
   - Market events on medicine/parts/contraband/relics printed "undefined at
     <port>" into toasts + the permanent chronicle (was live on prod too).
     Flavor table filled, Shortage/Glut fallback, coverage assert.
   - The charter desk read `game.credits` (doesn't exist) — "sign the
     articles" was PERMANENTLY DISABLED in the real UI and the 15k fee was
     never deducted. Both now read `game.ship.credits`. (The wire-level net
     suite couldn't see this — it bypasses the desk UI. That's what the
     developer look is for.)
   - Picking a color/want re-rendered the desk and wiped the half-typed
     name; setCharterDesk now carries value + focus + caret across rewrites.
3. **Pirate-pressure tuning slice (4542e3b, merged 9c2cdb5, DEPLOYED).**
   The 2026-09-03 "cannot even leave dock" note, three fixes, chaos kept:
   - All cadence knobs live in **`CombatCore.COMBAT_TUNING`** (shared sim —
     solo and server read the same numbers; `server/config.mjs combatTuning`
     overrides at boot). Wealth bands re-scaled: light < 8k (was 2k), full
     ≥ 25k (was 6k), band gate 8k (was 2.5k). Counts per band unchanged.
   - **Station no-spawn radius** (600u): spawn spots re-roll clear of every
     port (shared `pickSpawnSpot`, same 800-2000u envelope).
   - **Undock grace** (8s): docked/graced pilots are `untargetable` — prey
     selection ignores them (they still anchor the despawn pass), firing
     forfeits (fireLaser/fireMissile solo; damage.claim server-side). Server
     reads the docked flag already on ship.state.

**Gates at tip: solo ?verify 239/239 · verify-net 172/172.** New solo suites:
`guards` (7), `pressure` (8), banner +3; net `[pressure]` (5). **Net-suite
flake note:** back-to-back runs with leftover chrome-headless processes
cascade failures ([occupation]/[faction] + "Connection closed" / detached
frames) — `pkill -f chrome-headless-shell`, run once, clean runs pass.

**LATE ADDITION, same session: the Tally is BUILT and merged (8463c9d →
main 6788b41) but NOT deployed.** Forks pinned via AskUserQuestion (all
recommended options taken): authority-point deeds (units SOLD → 'trade';
damage.claim kills → 'grudge'; own-claim repels + own-claim salvage →
'place'), short authored ladder (`TALLY_LADDER` in server/world.mjs: trade
100/500/2500 · grudge 10/50/250 · place 5/25/125, three tiers then "the
ledger remembers"), quiet banner-card line + chronicle speaks only at
milestones (`faction.milestone`, errand-voiced). The tally rides the
registry as an additive field — no new wire messages; PROTOCOL M7 has the
details. Gates after: **solo 241/241 · net 178/178** (banner +2, net
[tally] 6).

**NEXT:**
1. **Deploy the Tally to themisto** (explicit, per RUNBOOK — one pull +
   restart; server-side world.mjs/combat.mjs changed). Everything else is
   already live.
2. **Faction backlog:** VENDETTA amnesty faction-flavored (the Choir
   forgives those who return a core); member salvage priority ONLY if
   claims feel toothless.
3. **Standing backlog:** nebula mist ambient (ninth-session spec), death
   broadcast (M4 gap), www DNS/cert, same-pilot-two-devices kick ping-pong.

**Watchlist (new this session):** does the re-tuned pressure actually fix
the dock feel in real play (knobs are one config edit away now); charter
desk discoverability CONFIRMED buried (two walks + a long scroll — decide
if that's the right amount of hidden before the next faction slice); combat
suppresses the near-POI Now-zone state, so the "raise the banner" button
rarely wins under heavy pressure (may deserve a poi-over-combat exception
when the site is charted + claimable); perk picker re-pops on every dock
while choices are pending (fine solo, mildly naggy). Carried: ×2 occupation
weight cadence, invite-while-offline UX.

--- (eleventh-session record follows) ---

State as of 2026-09-02 (eleventh session — **DEPLOYED to themisto + VPS
durability done + player factions F1/F2 BUILT**). Three strands:

1. **The big deploy happened (main `fb86071`, live and verified).**
   `feature/exploration-poi` merged to main (`4b1b03d`) — M5 exploration +
   M6 living world + the whole visual-language milestone — plus the
   2026-08-06 review-hardening fixes that had sat undeployed. Themisto
   pulled, restarted, wss handshake verified from outside (`welcome` ok),
   world.db intact (pilot "Dad" preserved; prod had no charted POIs so the
   M6 boot migration correctly seeded nothing). Node there is v22 — no
   better-sqlite3 rebuild needed.
2. **VPS durability (feature/vps-durability, merged to main + DEPLOYED).**
   - Supervision + wss/TLS were ALREADY in place (unit has Restart=always/
     RestartSec=3; Apache + certbot serve wss) — verified, documented.
   - **Backups now exist, two layers, zero new credentials:** daily cron on
     themisto (3:17am, `server/backup.mjs` — better-sqlite3 online .backup
     → gzip → rotate 30 in /var/lib/space-traders/backups/) + daily pull
     to Foggy's Mac (launchd `com.spacetraders.backup-pull`, 9:15am or
     next wake, rsync over the existing ssh alias → ~/Backups/space-traders/).
     Both ends tested live. RUNBOOK has the recipes + restore procedure.
   - Server nits closed: **FAMILY_SECRET is now required** (refuses to
     start, no dev-secret fallback — prod unit already sets it) and
     **mission.taken echoes reqId** (new raw-socket net assert).
3. **Player factions: design pinned, F1+F2 built** on
   `feature/player-factions` (pushed; **NOT merged, NOT deployed** — the
   developer hasn't seen it in-browser yet). Riff → mockup
   (`mockups/faction-founding.html`) + design doc (`docs/faction-design.md`,
   READ IT — includes the machinery audit) → four forks pinned via
   AskUserQuestion (all recommended options): **the Claim** as v1 heart,
   fee+rank founding gate (15k cr + Veteran), invite-only/one-per-pilot
   membership, structured want + freeform words.
   - **F1 (3c3cad0):** `world.factions` registry (persisted in the world
     blob, additive snapshot field, `faction.update` broadcast), founding
     as chronicle naming-event, invites/join/leave/disband, charter desk
     in the Shipyard district, banner card atop the Rep tab, ghost
     name-tag tint, `netFactions()` hook, PROTOCOL **M7** section. Seam
     fix from the audit: `spawnBand` forced-faction is a direct object
     lookup now (unknown names fall back loudly, never silently muster
     the wrong cartel).
   - **F2 (4a7783b):** `faction.claim` — ONE mark per banner at a charted
     unoccupied site; claim rides `poi.state` (+ map rings in banner
     color, Now-zone "raise the banner here" button). Teeth: occupation
     roll weighs claimed sites ×2 (`CLAIM_OCCUPY_WEIGHT`), repelling
     raiders from your own claim chronicles `poi.liberated … by` (the
     faction's deed). Claims survive occupation (contested = your ring,
     their flag); salvage stays first-come; disband lowers the mark.
     `debug.liberatePOI` (VERIFY_DEBUG) tests the credit path.

**Post-sync review batch (6db8525, autonomous):** 8-angle review of the
faction diff → fixed: banner-color uniqueness enforced server-side,
charter-desk innerHTML guard (broadcasts no longer wipe a half-typed
name), pilot-name escaping at the banner-card sink, weightedPick shared
between raid + occupation rolls, claim-ring drawer deduped, unified
net-fail feedback, lore-voice copy trims. Gates re-verified after.

**Gates at tips: main = solo 219/219 · net 158/158; player-factions =
solo 221/221 · net 167/167.** (Solo growth: `banner` suite; net: [faction]
suite, 35 asserts total.)

**Developer look STARTED 2026-09-03, not finished.** Local test recipe
(run from repo root, then two non-storage-sharing windows):

```bash
FAMILY_SECRET=dev-secret DB_PATH=./dev-world.db VERIFY_DEBUG=1 STATIC_DIR=. node server/server.mjs
# http://localhost:8378/index.html?pilot=Dad&secret=dev-secret&ws=ws://127.0.0.1:8378
# http://localhost:8378/index.html?pilot=Arthur&secret=dev-secret&ws=ws://127.0.0.1:8378  (private window)
```

The developer got as far as the perk picker + finding the charter desk
(questions asked: "is the perk thing a class system?", "where's the
desk?" — mild discoverability signal for the watchlist). Not yet
verified in-browser: founding, invite/join, ghost tint, the claim flow,
contested state. `dev-world.db*` is the throwaway test world
(gitignored). Test checklist: found (needs `grantXP(400)` +
`game.credits = 20000`) → invite Arthur → both rosters → ghost name-tag
color → `warpToPOI('wraith_cache')` + chart + "◎ raise the banner
here" → ring on maps + chronicle → optional contested via
`net.send({t:'debug.occupyPOI', id:'wraith_cache'})`.

**PLAYTEST NOTE (developer, 2026-09-03): "getting pummelled by pirates
all the time — I cannot even leave dock."** Diagnosis: pirate pressure
scales off the RICHEST online pilot's credits (combat.mjs
runSpawnCadence: wealth ≥ 6000 → maxEnemies 4 (+1 w/ cargo), spawn every
10-30s, pickEnemyTier gives 80% raider/warlord; band every 240-420s past
2500 cr) — thresholds are early-economy numbers, and there's NO
station no-spawn zone or post-undock grace, so pirates camp the dock
door. Fix shapes (a tuning slice, verified): (a) no-spawn radius around
planets + undock grace window — fixes "can't leave dock" directly;
(b) rescale the 2000/6000 wealth bands for the current economy;
(c) lift maxEnemies/spawnInterval/band cadence into named tuning flags
(config.mjs server-side; mirror the browser solo cadence in
js/combat.js so solo matches). pickEnemyTier is pure sim — shared fix.
Keep the LOVED "pesky flies" chaos (direction memory) — the complaint
is density+camping, not the combat feel.

**NEXT:**
1. **Finish the developer look** (checklist above) → then merge
   `feature/player-factions` + themisto deploy (explicit, per RUNBOOK —
   server changes: world.mjs registry + claim, combat.mjs seam fix).
2. **Faction backlog, in rough order:** the Tally (direction C — structured
   want-kinds start counting member deeds; the `want.kind` field is
   already stored for exactly this), faction-flavored VENDETTA amnesty
   (the Choir forgives those who return a core), member salvage priority
   ONLY if claims feel toothless in play.
3. **Standing backlog:** nebula mist ambient effect (spec in the
   ninth-session record), death broadcast (M4 gap), www DNS/cert.

**New tuning flags:** FACTION_FEE 15000 · FACTION_RANK_MIN 3 (Veteran) ·
FACTION_MAX 8 · CLAIM_OCCUPY_WEIGHT 2 · claim proximity = the POI
discovery ring (client rule).

**Watchlist:** does the ×2 occupation weight actually land fights on the
claim at 2-cap/12-24h cadence (may want ×3+ or a guaranteed first
contest); charter desk discoverability (it's buried in the Shipyard — is
that the right amount of hidden); invite UX when the invitee is offline
(HUD nudge lands on next connect — enough?).

--- (tenth-session record follows) ---

State as of 2026-09-01 (tenth session — **visual-language Slice D BUILT —
THE MILESTONE IS COMPLETE**): commit 968433d on `feature/exploration-poi`
(pushed; still NOT merged, NOT deployed; nothing server-side changed). One
commit:

1. **Slice D — the Ship tab dissolved into the schematic (968433d).** Mockup
   §4, the last slice. The old Ship records tab's three jobs live on the
   drawing now:
   - **Mod pins** — every installed mod pins a ◈ on the `#shipSchematic` slot
     it modifies (`MODS[id].slot` + `SLOT_PIN_ANCHORS` in ships.js; a slot
     with several parts walks its anchor list then stacks below). Pins rebuild
     in `updateShipPanelUI()` — same event-driven call sites as before
     (install, hull buy, christening, character load). Clicking a pin opens
     the **under-the-hood card** (`#modCard`, `showModCard(id)`) — the ONLY
     place the part's numbers print, as `MODS[id].stats` rows (+green/−red).
     The card's source line greps the ship's log for the bolt-on entry to name
     the bench port; installs that scrolled off the 40-line journal read "a
     bench somewhere back down the road" (deliberate — old parts keep their
     mystery).
   - **Identity** — `game.ship.name` engraves on the hull (`#svShipName`,
     above the cargo bay where the CARGO label used to sit; names >13 chars
     squeeze via `textLength`). A dim `#hullLine` under the drawing keeps
     hull class/berths.
   - **Log merge** — the journal renders in the **Log tab** above the
     galaxy's chronicle ("one history surface"): `updateChroniclePanelUI()`
     (chronicle.js) now owns both halves, each under a dim `.log-sect`
     header, and the page's "has content" display signal is journal OR
     chronicle. `updateShipPanelUI()` chains into it, so `addShipLog()`
     still refreshes everything.
   - **Retired** — `#recTab-ship` + `#shipPanel` deleted; `RECORDS_PAGE_IDS`
     dropped `'ship'`; a stored `'ship'` tab preference from an old session
     falls through to the default rule, which is now **Missions when
     contracts are active, else the Log** (the journal inherits the Ship
     tab's character-surface role).
   - Suites: `records` retargeted (missions/ledger as the permanent tabs),
     `chronicle`'s final assert knows the Log page hides only when BOTH
     histories are empty, new solo `schematic` suite (10 asserts). Verified
     visually in-browser (claude-in-chrome): pins, card, engraving, and the
     merged Log all match the mockup.

**Gates at tip: solo ?verify 212/212 (was 202), verify-net 136/136.**

**NEXT: two explicit steps, in order.**
1. **Deploy to themisto** (explicit, per docs/RUNBOOK.md — merge the branch
   first; it carries M5+M6 server changes plus this whole UI milestone). The
   direction memo says milestones deploy when they land so the shared world
   stays live.
2. **MMO groundwork:** player-founded factions (lore-bible §9 — a faction is
   a declared WANT; founding = chronicle naming-event; never hardcode the
   three authored cartels) + VPS durability chores (off-box SQLite backups,
   systemd supervision, wss).

Backlog unchanged: nebula mist ambient effect (art-pass column, spec below in
the ninth-session record), plus the standing watchlist/tuning flags further
down.

--- (ninth-session record follows) ---

State as of 2026-09-01 (ninth session — **visual-language Slice C BUILT
(ledger-fed deal bars)**): commit 8a2267d on `feature/exploration-poi`
(pushed; still NOT merged, NOT deployed; nothing server-side changed). One
commit:

1. **Slice C — deal bars + the ledger as a chart (8a2267d).** Both surfaces
   compare prices against YOUR OWN price memory (mockup §2's `.deal` column +
   §3's chart):
   - **Market deal bars** — every buy/sell row in the Dock district grows a
     `.deal-line`: a track scaled to here-price vs your best recorded price at
     OTHER ports, a `.deal-mark` where your best sits, and a tag ("cheapest
     known" / "best sell known" green · "near your best" · "worse than known"
     red). The `title` attr is the under-the-hood layer: here-price, your
     best, which port, one junkyard-voice line. **Empty ledger = no bars, and
     the here-port never compares against itself** — a good never priced
     ELSEWHERE shows nothing; scouting builds market sense (designed reward).
   - **The Ledger tab as a chart** — `updateLedgerUI` regroups `#ledgerList`
     BY GOOD (sell groups before buy — you hold cargo more than credits): a
     `.lrow` bar per station scaled to the group max, `.lrow.best` glowing
     green, event ⚡ kept per station, every price still printed.
   - Mechanics worth knowing cold: `ledgerBest(good, side, excludeStation)`
     (economy.js) is the ONE comparator both surfaces share ('buy' = min,
     'sell' = max over `economy.ledger`). `dealLine()` (trading.js) renders
     inside the existing `updateBuyingSectionUI`/`updateSellingSectionUI`, so
     bars rebuild on dock + after every trade — event-driven, no per-frame
     work. `.trade-item` gained `flex-wrap: wrap` so the deal line drops to
     its own full-width row (sell rows with long "(You have: n)" labels now
     wrap their qty buttons below at sidebar width — looks intentional, fine).
     CSS mirrors Slice B's gauge vocabulary (`.deal-track`/`.lbar` ≈
     `.svc-track`). New solo `deals` suite (9 asserts). Verified visually
     in-browser (claude-in-chrome): both surfaces match the mockup.

**Gates at tip: solo ?verify 202/202 (was 193), verify-net 136/136.**

**NEXT: build Slice D (interactive schematic + Ship-tab dissolution)** —
mockup §4: mods pin onto the schematic slots (◈), the under-the-hood card is
the only place numbers live, the Ship tab retires, the ship log's journal
lines merge into the Log tab. Then the milestone is done → deploy to themisto
(explicit, per RUNBOOK) and start MMO groundwork (player-founded factions,
lore-bible §9).

**Backlog — nebula mist ambient effect (developer request 2026-09-01):** a
fine drifting haze over the starfield. Build it the CHEAP way or not at all:
pre-render a few soft mist blobs to offscreen canvases at load, then per-frame
only `drawImage` at low alpha with parallax offsets + very slow drift (rAF
timestamps, per the repo timing rule). NEVER per-frame `createRadialGradient`
over large areas / `shadowBlur` / full-canvas `ctx.filter` blur / particle
swarms — those are what tanks low-end machines. Density can be regional
(thicker near certain planets/POIs, singing-reach mood) at the same cost since
it bakes into the pre-rendered blobs. Add a `lowFx` tuning flag as insurance.
Slots in the art-pass column — after Slice D, not before.

--- (eighth-session record follows) ---

State as of 2026-09-01 (eighth session — **visual-language Slice B BUILT
(dock districts) + rank language fully de-navied**): commits e2657a4..6ed051b
on `feature/exploration-poi` (pushed; still NOT merged, NOT deployed; nothing
server-side changed this session). Two commits:

1. **Slice B — dock districts (45b9d1e).** The docked `tradingPanel` was nine
   identically-cyan-headed sections in one scroll. It now splits into **two
   districts by decision tempo** (mockups/dock-visual-language.html §2), and
   docking always re-lands at the Dock:
   - **The Dock** (default, `#district-dock`) — the seconds loop: a **services
     icon strip** (`#servicesStrip`) of refuel / rearm / repair as three
     gauge-buttons (each = a service glyph + a fill gauge tracking the live pool
     level + the top-off cost + the action button), then market buy/sell (glyphed
     by Slice A), mission board, crew for hire.
   - **The Shipyard** (`#district-yard`) — the considered purchases (shipyard
     hulls, ship upgrades, weapon systems, mechanic's bench) behind a deliberate
     **"⇱ walk to the Shipyard"** door (`walkDistrict()`), greeted by a
     junkyard-voice line ("nothing here is new — inherited, salvaged, or grown").
     **"⇲ walk back"** returns. Burying the slow purchases is a feature (sheds
     half the every-dock wall) and plants the future planet-map seed.
   - Mechanics worth knowing cold: the 3 service symbols (`s-fuel`/`s-rearm`/
     `s-repair`) live in a **SEPARATE `#serviceSprite`** (index.html), NOT in
     icons.js's `#glyphSprite` — so the `icons` suite's goods-glyph count stays
     8. `resetDistrict()` (trading.js) runs inside `updateTradingInterface()` so
     every dock lands at the Dock (choice is non-persistent by design). Gauge
     fills ride the existing `updateFuelCost`/`updateMissileCost`/
     `updateRepairCost` via `setServiceGauge()` — event-driven, no per-frame.
     ALL section ids preserved (`#shipyardSection #modsSection #crewSection
     #missionBoard`, buy/sell, `#fuelCost/#missileCost/#repairCost` + buttons),
     so the ships/mods/crew/escort suites are untouched. New solo `districts`
     suite (9 asserts): dock lands on the Dock, door swaps to the Shipyard, both
     districts render, service strip carries live costs + its three glyphs.
2. **De-navy cleanup (6ed051b).** The rank ladder was de-navied in cc3ef06 but
   three literals were missed and the developer caught the HUD still reading
   "Cadet": index.html's `#pilotRank` placeholder (→ "· Deckhand", the real
   rank-0 first paint), crew.js's berth hint ("third berth at Star Marshal" — a
   deleted rank — → "Chartbreaker"), and a stale "Cadet" ui.js comment. Ranks
   are stored as an index; no mechanics change. (Full ladder in pilot.js:
   Deckhand/Runner/Pilot/Veteran/Ace/Captain/Shipmaster/Chartbreaker/Living
   Legend — "Captain" is legit at rank 5.)

**Gates at tip: solo ?verify 193/193 (was 184), verify-net 136/136.** Verified
Slice B visually in-browser (claude-in-chrome): both districts render to spec,
the door wraps cleanly at sidebar width (a narrow-width overflow was fixed,
CSS-only). Developer confirmed it in their own browser: "much nicer."

**DIRECTION PIVOT this session (developer, decided via AskUserQuestion): the
target is FULL MMO and FAMILY PLAYTEST IS RETIRED.** This supersedes the
"family as live-test guild" framing. Consequences for the workflow going
forward (see the [[space-traders-direction]] memory):
- **The two automated gates (solo `?verify` + `verify-net`) are the ONLY
  quality bar.** Stop writing TEST-PLAN family-playtest sections and "family
  playtest queued" backlog items. (TEST-PLAN.md still has legacy playtest
  sections incl. the Slice B one added this session — harmless, retire on touch,
  not worth a churn commit now.)
- **Deploy to themisto when a milestone lands** (still explicit per RUNBOOK.md,
  never auto) so the shared world stays live for the MMO push.
- **Roadmap:** FINISH the visual-language slices first (they're polish the MMO
  still wants), THEN pivot to MMO groundwork. **Build order: A glyphs ✓ →
  B districts ✓ → C ledger-fed deal bars → D interactive schematic + Ship-tab
  dissolution → MMO groundwork (player-founded factions, lore-bible §9).**

**NEXT: build Slice C (ledger-fed deal bars)** — the market rows compare each
price against YOUR ledger memory (empty ledger = no bars; scouting builds your
market sense). Spec is in mockups/dock-visual-language.html §3 (the Ledger tab
as a chart, grouped by good) and the market `.deal` column in §2. The ledger
data already exists (economy.js `updateLedgerUI`, `economy.ledger` keyed by
station; the `icons` suite exercises it). Then D (interactive schematic).

--- (seventh-session record follows) ---

State as of 2026-09-01 (seventh session — **visuals riff PINNED + glyph
Slice A BUILT + the LORE BIBLE written**): commits c5939d1..cc3ef06 on
`feature/exploration-poi` (pushed; still NOT merged, NOT deployed). Three
strands, all landed the same session:

**1. The visuals-over-text riff (mockups/dock-visual-language.html) — four
forks PINNED with the user via AskUserQuestion:** Ship tab dissolves into an
interactive schematic (mods pin to slots, log merges into the Log tab);
docked screen splits into TWO districts by decision tempo (Dock = fast loop
w/ services icon strip + market + missions + crew hire; Shipyard = the
thinking purchases behind a "walk out" door — burying them is a feature and
plants the future planet-map seed); goods glyphs FIRST, planet/rank insignia
later; market deal bars compare against YOUR ledger (empty ledger = no bars —
scouting builds market sense). Build order: **A glyphs → B districts → C
deal bars → D interactive schematic.**

**2. Slice A BUILT (551000c):** js/icons.js — 8 drawn-SVG goods glyphs as an
injected <symbol> sprite in the schematic's style; goodIcon() is the only
producer (name rides as <title> tooltip = the under-the-hood layer; unknown
goods fall back to the colored square). Swapped into cargo manifest, market
buy/sell rows, ledger, mission list, mission board. THE ART IS PLACEHOLDER
BY DESIGN (user call): call sites bind to #g-<type> ids, so redrawing when
lore firms up is a one-file swap. New solo `icons` suite (6 asserts).

**3. docs/lore-bible.md — READ IT BEFORE WRITING ANY CONTENT.** Four forks
pinned: Precursors **became the signal** (relics are fragments, still
transmitting; the Void Choir is half right); setting = **charter reach gone
feral** (the Meridian Charter Combine settled the reach for ferrovolt, named
worlds like ledger rows, then the Withdrawal — freighters just stopped);
MVP planet names **canonized as charter designations** (locals' nicknames:
the Drum, the Lantern, the Dreamworks, Lastlight, the Ledger, the Deep;
earning a real name = future live world event, Ossuary Drift already did);
every pirate faction is a planet's shadow (Rustfang = the Drum's abandoned
shift crews, Iron Shoal = the Deep's dispossessed divers, Void Choir =
signal-techs gone cult). Second pass from the Mad-Max-in-space riff: rule 7
**NO EMPIRES EVER** (power is local + personal; the differentiator is
"junkyard economy where the gasoline is ghosts"), Guild de-sainted, §9 =
**player-founded factions as the MMO north star** (a faction is a declared
WANT; founding = chronicle naming-event; grudges/occupations already treat
factions as plain data — never hardcode the three authored cartels).
Seed-content pass applied in-code (cc3ef06): Frontier's "Military" shop →
warlord-surplus/raid-scrap, all upgrade copy junkyard-voiced (facts kept),
event descriptions rewritten, and the **rank ladder de-navied**: Cadet/
Ensign/Commodore/Star Marshal → Deckhand/Runner/Shipmaster/Chartbreaker
(rank stored as index — saves untouched; FAMILY HEADS-UP: titles changed).

**Gates at tip: solo ?verify 184/184, verify-net 136/136.**

**NEXT: build Slice B (dock districts)** — the nine-section docked wall
splits into Dock + Shipyard per the mockup; the bible's junkyard voice now
feeds the Shipyard flavor ("nothing is new here"). Then C (ledger-fed deal
bars), D (interactive schematic + Ship-tab dissolution). Family playtest of
the finished sidebar (TEST-PLAN.md Part 0) still queued — Slice 3 watchlist
(state flicker at the 900u/600u edges, badges, tab-row growth) unchanged,
plus new: do the glyphs read at 16px for the family, and does anyone mourn
their old rank title.

(Sixth-session record follows.)

State as of 2026-09-01 (sixth session — **UI milestone Slice 3 BUILT — the
sidebar redesign is COMPLETE**): the contextual Now zone is live on
`feature/exploration-poi` (commit 95fef7e, pushed; still NOT merged, NOT
deployed — nothing server-side changed). The Navigation panel — the last
un-redesigned piece — is now state-driven per the ★ Contextual Hybrid: the
sidebar reads sticky vitals band → Now zone → tabbed Records, and the
milestone's original complaint (a wall of same-looking text panels) has no
surviving panel.

Mechanics worth knowing cold: `updateNowZone()` (bottom-ish of js/ui.js)
resolves ONE state per tick in priority order **engaged > docked > combat >
fuel emergency > docking range > event > near-POI > cruising** — deliberately
deviating from the mockup's suggested order (combat > fuel > docked) because
docked is modal/station-shielded (the fight outside is noise) and the vitals
band already shows the empty tank mid-fight. Thresholds: hostile within 900u
= combat, site within 600u = sensor contact (both tunable consts at the top
of the block). An UNCHARTED contact shows only "? Unknown contact" + bearing
— the name stays a fly-in discovery reward (matches the render layer's "?"
ping); charted sites show glyph/name/charter/salvage-ETA/⚑occupation + lore,
never market data. `data-now` on #nowZone drives the CSS accent (label +
border recolor per state). Detection is per-tick cheap: one squared-distance
pass over enemies and one over pois (poi.dist already maintained by
updatePOIDetection), scratch object reused, all writes via the Slice 1
guarded helpers. The dead `#sector` span is gone; #posX/#posY live in the
zone header. Records tabs + vitals band untouched (the two-layer visibility
mechanic survives — records suite still asserts it). New solo `now` suite
(13 asserts) forces each state + the priority overrides. **Gates: solo
?verify 178/178 (was 165), verify-net 136/136.** TEST-PLAN.md Part 0 has a
"Slice 3" subsection.

**NEXT SESSION (user-requested at sync): a RIFF session** *(→ HAPPENED
seventh session, see above — forks pinned, Slice A built, lore bible
written)*. The structure
milestone is done (vitals band / Now zone / Records tabs), but the Records
*pages themselves* are still text walls: Ship (mods + log lines), Missions
(text list), Crew (text list), Rep (text list), Galaxy Log (text lines),
Ledger (text rows) — plus other surfaces like the trade dialog and full map
if the riff reaches. Same working rhythm as the sidebar milestone: riff/
diagnose first (what could each section encode as VISUALS — icons, bars,
color, glyph language — instead of sentences), mock up 2-3 directions, pin
forks with the user, THEN build in verified slices. This is a design-first
session, not a build-first one. The existing glyph vocabulary (POI kinds,
faction colors, goods colors, ⚑/✦/☠) is the raw material — extend it, don't
invent a parallel one.

**Still queued: family playtest of the whole redesigned sidebar**
(TEST-PLAN.md Part 0 — the wall test, the glance test, the derelict-tease
moment). Watchlist: state flicker when skirting the 900u/600u edges
(thresholds may need hysteresis if it thrashes); does anyone miss the old
always-on nav text; Slice 2 carryovers (badges pulling the eye, tab-flipping
to compare, tab-row growth as progression vs noise). After playtest verdict:
merge + themisto deploy (branch carries M5+M6 server changes — see "Deploy
first" below).

(Fifth-session record follows.)

State as of 2026-09-01 (fifth session — **UI milestone Slice 2 BUILT**):
the Records tabs are live on `feature/exploration-poi` (commit 9e4a4f2,
pushed; still NOT merged, NOT deployed — nothing server-side changed). The
panel stack below the schematic that the first look called overwhelming
(The Ship / Missions / Crew / Reputation / Galaxy Log / Trade Ledger) is now
ONE tabbed Records area, one page at a time, per the ★ Contextual Hybrid in
`mockups/sidebar-redesign.html`. The Navigation panel was left untouched
above it — it becomes the contextual "Now" zone in Slice 3.

Design mechanics worth knowing cold: each page's inline `style.display`
still means "this record has content" (set by the panel's own update
function — the factions/crew/chronicle verify suites assert on it
UNCHANGED), while the `.rec-on` class is the selected tab; CSS layers the
two so they never fight. Tabs derive existence from the content signal (a
fresh Cadet sees Ship/Missions/Ledger, not six tabs), and badges keep
hidden news visible: active-mission count, held-grudge count (red), Galaxy
Log unseen count that clears when the log is opened. Tab choice persists
per browser via localStorage (`space_trader_records_tab`); default is
Missions-when-active, else Ship. Controller lives at the bottom of
js/ui.js, event-driven from the panels' update-function tails (NOT
per-frame), cached refs + guarded writes per the Slice 1 pattern. New solo
`records` suite (11 asserts) covers the tab layer. **Gates: solo ?verify
165/165 (was 154), verify-net 136/136.** TEST-PLAN.md Part 0 has a new
"Slice 2" subsection for the family playtest (the wall test is the one
that matters). Verified visually in-browser via claude-in-chrome — note
the browser caches style.css hard; a plain reload after pulling this
slice shows all pages at once (stale CSS), hard-reload fixes it.

**BUILD NEXT — Slice 3: the contextual "Now" zone** *(→ BUILT sixth session,
see above)*. Watchlist for
Slice 2 at playtest: do the badges actually pull the eye or get ignored;
does anyone miss seeing ledger + missions at once (tab-flipping to compare
would be real feedback); does the growing tab row over a career read as
progression or noise.

(Fourth-session record follows.)

State as of 2026-08-31 (fourth session — **UI milestone Slice 1 BUILT**):
the ship-schematic Vitals band is live on `feature/exploration-poi`
(commit 06be645, pushed; still NOT merged, NOT deployed). One drawn SVG ship
+ numerics strip replaced the Ship Status / Ship Upgrades / Cargo Hold panels
and the systems-down text wall — number-free glance per
docs/ship-design-vision.md §7: bay grid cells = cargoMax (filled in each
good's own color, one-line manifest below), shield-envelope thickness =
shield bank, nacelle/nose/tank size = upgrade levels (no Lv badges — the
mockup's badges were dropped as contradicting §3), missile pips = tubes,
damage flashes the exact part red, thruster glow follows live thrust.
Regions are `data-slot` groups so the Ship Bay drops in later with no rework.
Perf fold-in shipped in the same slice: updateUI() now runs on cached element
refs + last-value-guarded writes (no per-frame getElementById/innerHTML;
grid/pip geometry rebuilds only on capacity change; nearby-objects panel
rewrites only when its HTML changes). All verify DOM ids live on in the
numerics strip; NEW solo `vitals` suite asserts the encodings. **Gates: solo
?verify 154/154 (was 144), verify-net 136/136.** TEST-PLAN.md Part 0 is the
playtest hand-off (the five-second glance test is the one that matters).

**First look (2026-09-01, user, in-browser):** the schematic renders as
designed; the reaction was "the side drawer still has a lot of information
that seems overwhelming" — i.e. the un-rebuilt panel stack below the
schematic (The Ship / Navigation / Missions / Ledger / Crew / Reputation /
Galaxy Log) is the remaining wall. That confirms Slice 2 as the next cut.

**BUILD NEXT — Slice 2: Records tabs; then Slice 3: the contextual "Now"
zone** — both specified in `mockups/sidebar-redesign.html` (the ★ Contextual
Hybrid). Watchlist for the schematic after family playtest: does the
number-free glance actually beat reading digits; does losing "Level N" text
hurt upgrade shopping; is the taller sticky vitals panel OK on small screens
side-by-side; SNES-pixel art test on the schematic is still the queued
first-custom-art experiment.

(Third-session record follows — the design pass that specified all of this.)

State as of 2026-08-31 (third session — **UI milestone DESIGNED, ready to
build**): the confusing-sidebar milestone got a full information-design pass
plus a much bigger vision riff. No game/server code changed that session (docs +
mockups only, so gates were skipped) — **Slice 1 is now built (see above).**

**What this session produced (all on `feature/exploration-poi`, uncommitted →
now committed):**
- `docs/ship-design-vision.md` — **the north star.** The sidebar redesign
  cracked open into "the ship IS the character": three views of one ship
  (**Avatar** in flight / **Schematic** glance-HUD / **Ship Bay** detail+mod),
  "kill the word *level*" → components + **power budget + hull space +
  tradeoffs**, and a **production chain** tying ship tech to the *existing*
  trade-good lore (Ferrovolt Ore→reactors, Cognition Cores→droids, Panacea
  Vials→med bay, Precursor Relics→exotic tech). **§7 is the in-scope build;
  §8 is the sequenced later work.** Read this first.
- `mockups/sidebar-redesign.html` — Current vs A/B/C vs the **★ Recommended
  Contextual Hybrid** (pinned gauges + a state-driven "Now" zone that swaps by
  situation: cruising / near-derelict / docking / combat / low-fuel / docked).
- `mockups/ship-schematic.html` — the **Vitals band = a drawn ship** that
  encodes hull/shield/fuel/cargo/upgrades/damage in ONE image (cargo bay fills
  cell-by-cell, shield envelope thins, hit parts flash red). Interactive.
- `mockups/ship-bay.html` — the detail/mod view: live reactor+bay budgets,
  components with lore materials + tradeoffs, crew/droid/bacta slots, install
  buttons that ENFORCE the power budget (proves "not levels, but planning").

**DECISIONS PINNED with the user this session:**
1. Direction = the **Contextual Hybrid**, built around the **ship schematic** as
   the Vitals band (user's idea, stronger than abstract gauges).
2. Art question resolved by the three-view model: **Avatar stays vector**
   (rotates cheap), **Schematic + Bay never rotate** → can be lavish/pixel later.
   The schematic is the ideal FIRST custom-art test (contained, rotation-free).
   User's gut is SNES pixel; not committed — test it on the schematic first.
3. Modding/economy vision (crew quarters, gunner stations, droids, factories,
   material-gated power) is a **north-star RPG milestone (§8), NOT slice 1** —
   captured so it isn't lost; build loops-first.

**BUILD NEXT — Slice 1: the Schematic readout as the real sidebar Vitals band.**
Replaces four panels (Ship Status + Ship Upgrades + Cargo Hold + systems-down
warning) with one drawn ship (SVG) + a small numerics strip. NUMBER-FREE glance;
capacity encoded as form (cargo grid, shield-envelope thickness, engine size);
damage flashes the hit part red. **Draw the regions as slots from day one** so
the Bay/modding drops in later with no rework. NO power budget / modding /
factories yet — just the readout. **CAUTION:** keep the DOM ids verify.js reads
(`#credits #fuel #hull #shieldVal #cargoUsed #pilotRank #missiles #weaponMode`
etc.) — the schematic's numerics strip can carry them, or update the suite in
the SAME slice. Fold in the per-frame perf fix here: `updateUI()` runs every
tick (physics.js:164) and rebuilds via `innerHTML` — switch to cached element
refs / targeted SVG attribute writes. Both gates green, commit per slice, add a
TEST-PLAN section. Then Slice 2 = Records tabs, Slice 3 = the contextual Now
zone (see the sidebar mockup).

---

State as of 2026-08-31 (second session): **Persistent World milestone ("The
World Remembers and Moves") built on the SAME branch `feature/exploration-poi`
(NOT merged, NOT deployed) — three verified slices on top of exploration:**

1. **Chronicle** (6387d26): persisted capped world ledger (charters, boss
   kills, market events, + later kinds), `chronicle.add` broadcasts,
   `welcome.lastSeen`, "While you were away" digest + Galaxy Log panel
   (`js/chronicle.js`). Also fixed en route: POI lore wrote raw strings into
   the ship log → rendered "undefined" (now via addShipLog).
2. **Regenerating caches** (6dea990): `world.poiState[id].nextSalvageAt`,
   12-24h wall-clock windows COMPUTED on read (no timers — restart/idle-proof;
   boot migration seeds windows for already-charted worlds). Salvage is
   first-come galaxy-wide, ~⅓ of discovery reward (tables in js/sim/pois.js),
   ✦/ETA map markers, chronicle entries.
3. **Occupations** (0343e18): daily-ish persisted roll, grudge-weighted
   faction digs in at a charted site (max 2, salvage blocked, ⚑ marker);
   flying within 1000u musters the band AT the site (combat.mjs, members
   tagged `occupyingPoi`); boss kill = liberation → cache opens immediately +
   chronicled. Kickoff forks pinned with the user via AskUserQuestion:
   chronicle+living-sites, adds+occupations (no losses), daily-ish cadence,
   digest+log-panel UI.

Gates green after every slice; final: **solo ?verify 144/144, verify-net
136/136** (new suites: solo chronicle+salvage(+occupation asserts); net
[chronicle], [salvage], [occupation]). PROTOCOL.md has the full **"M6 —
persistent living world"** wire section. TEST-PLAN.md Part 1 is the new
playtest hand-off (incl. VERIFY_DEBUG console commands to force windows/
occupations without waiting 12-24h).

**Next session (user-requested, 2026-08-31 playtest): compact-UI milestone.**
PORT DECISION SETTLED (user chose, 2026-08-31): **Space Traders stays a
laptop/desktop game.** The Iceswitch (son's germ-shape wooden handheld, Pi
Zero 2W + 480×320 SPI screen — full spec in the sibling repo:
`~/Documents/Projects/reliquary/knowledge/electronics/germ-shape-console.md`)
gets **Arthur-scale original games instead** (its own Phase 2 Pygame plan),
which match its hardware. The port stays a parked, zero-cost option: a
one-bench-session `cog` fps spike at 480×320 could reopen it; no hardware
purchase unless that spike fails AND the port is still wanted (then a
Pi-Zero-FOOTPRINT board ~$25-40, NOT a Pi 4 — the PowerBoost 1000C's 1A
output and the carved cavity rule the big boards out).

**The UI milestone's real goal (user clarified at sync): LEGIBILITY, not
size.** The sidebar drawer is **confusing** — a wall of same-looking stacked
text panels (ship status, cargo, nav, missions, crew, reputation, Galaxy Log,
ledger, upgrades) with no visual hierarchy; the user "wonders if it can be
redesigned, perhaps with visuals to help scan things" and knows it's a hard
job. So the milestone is an information-design pass: what does a pilot need
at a glance vs on demand, and how do icons/color/grouping/gauges make state
scannable instead of readable. Secondary benefits, in order: compact enough
for two windows side by side on one screen (family testing); working near
480×320 would keep the parked Iceswitch option warm (distant bonus, not a
requirement). Same workflow as the last two milestones: diagnose the current
UI's information architecture FIRST (inventory every panel: what it shows,
when it matters, how often it changes), propose 2-3 redesign directions with
mockups, pin the forks with the user, then build in verified slices — the
gates don't assert visuals, so add a TEST-PLAN section per slice and keep the
existing DOM ids/console hooks stable where the verify suites read them
(verify.js asserts on #credits, #pilotRank, #factionPanel, #chroniclePanel,
#missionList, #crewList, #shipLogList etc. — renaming ids means updating
suites in the same slice). Fold in the per-frame UI perf backlog (updateUI
innerHTML rebuilds, full-map canvas realloc, ~25 getElementById/frame,
shadowBlur + gradient allocs) — same code, same milestone. Art constraint
still holds: this is layout/hierarchy/iconography (structure), not an art
pass.

**Other milestone candidates** (pick after playtest): quest chains off the
questSeed rails (Ossuary dig-quest); death broadcast + death chronicle
entries (known M4 gap, now more visible since deaths are the one big event
the ledger misses); occupation expiry knob if the map feels naggy; flipping
salvage to per-pilot if first-come breeds family resentment.

Earlier-same-day exploration state (still true): seven POIs, first-charter
landmarks, per-pilot discovery rewards, wrapped starfield, M5 wire section.
Open design flags to settle via playtest: reward-per-visitor vs scarce
first-come loot (now PARTIALLY settled: discovery per-visitor, salvage
first-come — confirm it feels right); sensor-ping-then-fly-in vs pure fly-in
discovery; whether to physically spread the planets out too; POI art (still
placeholder glyphs).

(2026-08-06 review-hardening session record follows.)

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
