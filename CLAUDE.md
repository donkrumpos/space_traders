# Space Traders — AI briefing

Browser-based space trading/combat game, physics flight over an economic sim,
played by the family on a shared multiplayer server (deployed to
siegeperilousstudio.com, VPS nicknamed "themisto"). Vanilla HTML/CSS/JS, no
build step; Node + ws + better-sqlite3 server. Direction: a persistent online
world you log into anytime and progress in — exploration as reward, RPG layers,
a living shared world (see the `space-traders-direction` memory).

## Where things live

- `NEXT-SESSION.md` — the rolling session log + backlog + watchlist + tuning
  flags. **This is the source of truth for "what's next" and "what's rough."**
  Read it first each session; update it at sync.
- `docs/PROTOCOL.md` — the multiplayer wire protocol + authority split + known
  gaps (milestones M1–M5). `docs/RUNBOOK.md` — themisto deploy. `docs/MULTIPLAYER.md`,
  `docs/game_design_doc.md` — design.
- `js/sim/*.js` — pure sim modules shared by browser AND server (same files, no
  fork): `planets.js`, `pois.js`, `economy-core.js`, `combat-core.js`,
  `traffic-core.js`. No `window`/DOM refs allowed in these.
- `js/verify.js` — solo `?verify` headless suite. `verify-net.mjs` — two-client
  multiplayer harness. `TEST-PLAN.md` — the current hand-off for family playtest.

## The two gates (the core discipline)

Never commit game/server code without both green. Elapsed-time timing must come
from rAF timestamps, not `performance.now()` (breaks under headless virtual time).

`npm test` runs both gates in sequence (verify-solo.mjs, then verify-net.mjs).
By hand:

```bash
# solo — serve, then headless ?verify (expect VERIFY-PASS n/n)
python3 -m http.server 8377 &
CHS=~/.cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-mac-arm64/chrome-headless-shell
$CHS --headless --dump-dom --virtual-time-budget=12000 \
  "http://localhost:8377/index.html?verify" | grep VERIFY

# multiplayer — expect VERIFY-NET-PASS n/n
FAMILY_SECRET=dev-secret node verify-net.mjs | tail -1
```

Console helpers (in-game): `grantXP(n)`, `nameShip('...')`, `spawnRaidBand()`,
`exportCharacter()`, `listPOIs()`, `warpToPOI(id)`, `netStatus()`, `netGhosts()`,
`netWorld()`, `netCombat()`.

## Working rhythm

One-sentence playtest note → diagnose → build in verified slices → both gates
green → commit per slice → push. Branch for features (don't commit straight to
`main`). Commit footer:

```
Claude-Session: <session url>
```

## Sync Protocol

When the user says **"sync"**, run this checklist (adapted from the sibling
reliquary repo, tuned to this repo's gate-driven, deploy-to-themisto workflow):

1. **Pull + review.** `git pull` if the branch tracks a remote (a parallel
   session may have pushed). Then `git status` + `git diff` for uncommitted
   work and `git log --oneline <base>..HEAD` for what this session shipped.
   Catch any uncommitted or orphaned work and fold it in.
2. **Both gates green — if any game/server code changed.** Run the solo
   `?verify` AND `node verify-net.mjs` gates above; report the counts. **Never
   sync red.** (Docs-only or memory-only syncs skip this.)
3. **Update `NEXT-SESSION.md`.** Record the session: commit range, what shipped,
   and any new backlog / playtest-watchlist / tuning-flag items. Note anything
   left undeployed to themisto. This is the ritual that lets the next session
   pick up cold.
4. **Update memory** (lives OUTSIDE this repo, at
   `~/.claude/projects/-Users-landtrust-Documents-Projects-space-traders/memory/`).
   If something durable was learned/decided, write or update the relevant memory
   file and its `MEMORY.md` pointer. (Not part of the repo's git — updated in
   place, not committed here.)
5. **Commit + push.** Commit per topical unit with the footer convention above,
   on the feature branch (never force-push, never push straight to `main`
   unless told). Push with **`git pushr`** — the global push-with-retry alias
   (rides through transient GitHub blips; plain `git push` also works).
6. **Deploy reminder — never auto-deploy.** If server-side code changed, remind
   that themisto deploy is a separate, explicitly-authorized step per
   `docs/RUNBOOK.md` (ssh pull + restart). Don't run it as part of sync.

**When to suggest a sync:** at natural breakpoints — after building something
out, before signing off, or when context is getting full. The repo is the
source of truth: if it happened but wasn't synced (code committed, session
logged, memory written), the next session can't find it.
