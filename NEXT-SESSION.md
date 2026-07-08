# Next Session Roadmap

State as of 2026-07-08 (evening): **Tier 3 multiplayer is BUILT and DEPLOYED.**
M1 (shared saves) → M2 (ghosts) → M3 (shared world) → M4 (shared combat) each
committed gate-green; M5 deployed to **https://siegeperilousstudio.com**
(themisto VPS, Apache + wss + systemd; see docs/RUNBOOK.md). verify-net:
93/93 across M1–M4 suites; solo ?verify: 92/92. Family secret + first-visit
setup: RUNBOOK.md (secret itself lives only in the systemd unit on themisto).

## THE acceptance test (do this first): two-machine playtest with Arthur

This is both the M5 acceptance test AND the ship-progression playtest that
was consciously jump-gated for the multiplayer build. Two birds, one sitting:

- Each machine: open the URL, pilot names Dad / Arthur, secret from the unit
  file. Arthur's existing save should upload and retro-commission into its hull.
- **Christening moment:** does the naming modal land as a moment for Arthur?
  (It queues before perk modals.)
- **The ghost moment:** does Arthur SEE "Dad — <ship>" flying next to him?
  Does he chase you? Does the minimap blip read?
- **Shared fight:** spawn trouble (fly rich, or console spawnRaidBand()),
  fight the same band. Does "we're fighting them together" land? Does the
  family vendetta (shared grudge) get retold afterward?
- **One ledger:** sell at the same station — does Arthur notice Dad's selling
  moved his price?
- Ship-layer checklist (carried from the jump-gated arc): shipyard catalog
  dreaming, trade-in math readability, skiff berth-lock feel, mechanic's
  bench quirks at Arthur's reading level, freighter-vs-gunship feel, "The
  Ship" panel glances.

## Known v1 gaps (documented in PROTOCOL.md; post-playtest candidates)

- Online NPC freighters are indestructible (no server projectile sim).
- Named bounty warlords stay client-local online.
- No `www.` DNS record / cert (bare domain only).
- backups table in world.db grows unpruned (fine for years at n=2).

## Tuning flags (carried)

- Hull prices vs. income rate; skiff upgrade caps; mod stock rate (45%/dock);
  trade-in 60%; XP sell-loop exploit; escort freighter speed 3.2; VENDETTA
  has no forgiveness mechanic (grudge amnesty seed carried).

## Workflow that works

Same as always, now with a net gate: one-sentence playtest note → diagnose →
build → verify (`?verify` 92/92 solo AND `node verify-net.mjs` 93/93) →
commit → `ssh themisto '...'` update line from RUNBOOK.md. Serve local:
python3 -m http.server 8377. Console: grantXP(n), nameShip('...'),
spawnRaidBand(), exportCharacter(), netStatus(), netGhosts(), netWorld(),
netCombat().
