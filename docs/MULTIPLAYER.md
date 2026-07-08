# Multiplayer: Tier 3 — Shared Persistent World + Shared Combat

Decision (Foggy, 2026-07-08): build full Tier 3 — Dad and Arthur on separate
machines, one persistent world, seeing each other AND fighting the same
enemies. Hosted on Foggy's VPS. Built with an agent fan-out in a dedicated
session. This consciously jumps the hull-ladder playtest gate — Foggy's call.

## Architecture decisions (locked unless Foggy reopens)

1. **Server-authoritative world, client-authoritative own ship.** The VPS
   runs a Node sim that owns enemies, raid bands, NPC traffic, economy
   drift, market events, missions, asteroids, and drops. Each client owns
   its OWN ship completely (position, fuel, cargo, credits, hull) and
   broadcasts it ~10Hz. No anti-cheat, no reconciliation of player state —
   the trust model is a father and his six-year-old. This asymmetry is what
   makes Tier 3 tractable: only the world needs porting, not the ships.
2. **Transport: plain WebSocket (ws library), JSON messages.** Server tick
   10-20Hz; clients interpolate enemy/ghost positions between ticks.
   Client combat stays local-feeling: you fire, you report hits on shared
   enemies as damage claims; server applies them (last-writer-wins is fine
   at n=2).
3. **Persistence: SQLite on the VPS.** Two character documents (the
   existing JSON save format — character.js was built for this) + one world
   snapshot row, written on interval + on events. localStorage becomes the
   offline fallback: if the server is unreachable, play solo on your local
   save; own-character syncs up on reconnect (newest lastPlayed wins, with
   a backup written before any overwrite).
4. **Auth: two named pilots, one shared family secret** (query param or
   first-visit prompt, stored in localStorage). No accounts.
5. **Deployment: Node behind Caddy (wss:// + Let's Encrypt) on the VPS,
   systemd unit.** Static game files served by the same Caddy site, so the
   game gets a real URL playable from any machine in the house.
6. **The sim port reuses the existing modules.** combat.js enemy update,
   traffic.js, economy.js are plain JS with light DOM/canvas touching —
   port by extracting the pure sim into shared modules (`js/sim/*.js`)
   consumed by BOTH browser and Node, with the DOM/render/feedback calls
   injected as no-ops server-side. Single source of truth, no fork.

## The linchpin: automated two-client verification

Agents can't hand-test realtime sync, so the harness must. New
`verify-net.mjs`: launches the server on a scratch port + TWO
chrome-headless-shell clients, drives them via the existing console hooks,
and asserts convergence:

- both clients see the same enemy set within N ticks
- client A's damage claim reduces the enemy on client B's screen
- ghost ship of A renders on B with name + hull silhouette
- A's market sale moves the price B reads at dock
- disconnect/reconnect: A's character survives, world keeps running
- offline fallback: with no server, the game boots and plays solo

This is the workflow's inner loop. No feature merges without it green.
The existing `?verify` 92-assertion suite must also stay green (solo mode).

## Build order (milestones, each independently verifiable)

- **M1 — Server skeleton + shared saves.** Node ws server, SQLite, pilot
  handshake, character doc up/down-sync, offline fallback. Playable
  immediately: same character from either machine.
- **M2 — Ghost presence.** Own-ship broadcast, ghost render (name label +
  correct hull silhouette + flames), join/leave toasts, minimap blip.
- **M3 — Shared world.** Economy/markets/events/missions move to server
  authority; trades become server RPCs; both pilots read one ledger.
- **M4 — Shared combat.** Enemy/traffic sim runs server-side; clients
  render interpolated enemies, send damage claims, share loot drops and
  faction grudges (family vendetta). The Tier 3 payoff.
- **M5 — Deploy.** Caddy, systemd, wss, family secret, VPS runbook in
  docs/. Two-machine smoke test with Arthur is the acceptance test.

M1→M4 each end with verify-net + solo verify green and a commit. If the
session dies mid-arc, the last green milestone is a playable game.

## Open questions Foggy answers at kickoff

1. VPS details: provider/OS, is Node installed, what else runs there, and
   which subdomain? (e.g. traders.yonderartland.com — needs a DNS A record)
2. Friendly fire between the two of you? (Recommend: off.)
3. When only Arthur is online, does the shared world still spawn raids at
   full strength? (Recommend: scale to pilots online.)
4. Both existing saves (Dad's + Arthur's) migrate to the server as the two
   canonical pilots — confirm whose machines/browsers those live on.

## Kickoff prompt for the new session (paste as-is, fill blanks)

> Space Traders multiplayer session. Read docs/MULTIPLAYER.md and
> NEXT-SESSION.md first — architecture is locked, build M1→M5 in order.
> Unleash the agents / use workflows for the fan-out. My VPS: ___ (host,
> OS, ssh alias), subdomain: ___. Friendly fire: ___. Answers to the other
> open questions: ___. Verify-net must be green before each milestone
> commit; solo ?verify (92 assertions) stays green throughout.
