# Player factions — design riff (MMO groundwork kickoff)

2026-09-02. Seed: lore-bible §9 — a faction is a declared WANT (rule 4);
founding is a chronicle naming-event; never hardcode the three authored
cartels. Companion mockup: `mockups/faction-founding.html`. This is the
design pass; nothing here is built yet.

## What the code already gives us (machinery audit, 2026-09-02)

- **Faction identity is data, defined once.** `PIRATE_FACTIONS` at
  `js/sim/combat-core.js:74` — `{ name, color, minionTier, bossTitle,
  bossNames[] }`. Client and server both import it; no forked copies.
  Behavior is uniformly data-driven off the faction object — there are
  no switches on faction names anywhere in game logic.
- **Grudges key on the name string** (pilot doc + world-shared merge-max,
  `server/world.mjs:266`), and `pickRaidFaction(grudges)` weights spawns
  by them. A player faction name is just another key.
- **Occupations store `{ faction, color, since }`** on
  `world.poiState[id].occupation` — name string + color, nothing else.
- **The chronicle tolerates unknown kinds** (`js/chronicle.js:78` default
  case prints them raw), so new kinds render on old clients.
- **The one true breakage seam:** `spawnBand(forceFaction)` at
  `server/combat.mjs:151-160` (+ debug at `:436`) re-rolls `makeRaidBand`
  until the rolled name matches — a name not in `PIRATE_FACTIONS` silently
  falls through to a random cartel. Must become a direct faction-object
  lookup in the first faction slice, regardless of direction.
- **Nothing groups players today.** `pilots` table is name → opaque doc;
  no membership edges, no shared roster. The faction registry is a
  genuinely new world-state entity (fits the existing world JSON blob —
  no schema change).

## The founding flow (common to every direction)

Founding is the naming-event §9 promises — the same first-write-wins
machinery as a POI charter, pointed at a name you choose:

1. **Where:** docked, in the Shipyard district — a "charter desk" beside
   the mechanic's bench. (Considered: only at the Ledger. Rejected for v1
   — one more flight before the fun; the Ledger can become the place
   *renames* and faction quests happen later.)
2. **What you declare:** a name (3–24 chars, unique against cartels +
   player factions, case-insensitive), a color (palette pick, cartel
   colors excluded), and **the want** — the errand the reach owes your
   crew (fork 4: structured pick vs freeform line).
3. **What it costs:** fork 2. Founding should feel earned — the chronicle
   is permanent.
4. **What happens:** server validates, writes
   `world.factions[key] = { name, color, want, founder, members:[founder],
   foundedAt }`, broadcasts `faction.update`, chronicles
   `faction.founded { faction, founder, want }` — permanent, broadcast,
   the same ledger the Rustfang live in.

## Membership (common)

- Invite-only: the founder names a pilot; the invite is stored on the
  faction and lands on the invitee's next connect (or instantly if
  online). Accepting joins + chronicles `faction.joined`.
- One faction per pilot. Leaving is allowed (chronicled); the founder
  disbanding is allowed only while sole member (grudges held against the
  faction don't vanish — the reach remembers).
- Scale honesty: this serves a developer + a few friends. No permissions
  ladder, no officer ranks, no treasury custody fights — the founder
  invites, everyone else flies.

## The three directions (what a faction DOES, v1)

### A — The Banner (identity-first)

Founding + roster + color on your ghost + a faction card in the Rep tab +
chronicle credit ("Mara liberated the Drowned Choir relay **for the Reef
Wardens**"). No new world mechanics.
- Cheapest; pure identity. Risk: reads as a cosmetic clan tag — the want
  is declared but never *does* anything.

### B — The Claim (territory-first) ★ recommended

Everything in A, plus **one claim per faction**: a member flying at a
charted, unoccupied site plants the faction's mark (`faction.claim`).
The site draws in faction colors on every map; the claim is chronicled.
Teeth, without touching the salvage scarcity rule:
- The daily occupation roll **prefers claimed sites** (weighted) — the
  cartels contest what players hold, so the claim turns the existing
  occupation loop into a two-way conversation: your banner on a site is
  a standing invitation to defend it.
- Liberating your own claimed site chronicles as the faction repelling
  the cartel — the faction's deeds accumulate in world history.
- Salvage stays FIRST-COME for everyone (deliberate: the claim is a
  flag and a fight-magnet, not a paywall — revisit member priority only
  if play shows the claim feels toothless).
- Reuses: poiState, occupations, liberation, chronicle, map markers.
  New: claim field on poiState, one wire pair, roll weighting.

### C — The Tally (want-first)

Everything in A, plus the want is **structured and counted**: declare a
want-kind (haul a good / break raids / chart+salvage sites) and the
server tallies member deeds toward thresholds that chronicle milestones
("the Reef Wardens have moved 500 crates of panacea").
- The want is mechanical from day one — most faithful to rule 4.
- Risk: tallies are server hooks on trade/combat/salvage paths (wider
  surface), and a counter ticking up is less *visible* in the world than
  a flag on the map. Better as the SECOND faction slice, once claims
  give the want somewhere to live.

## Recommended build order (pending fork answers)

1. **Slice F1 — registry + founding + membership + chronicle + Rep card**
   (direction A's whole surface; fixes the `forceFaction` seam; net
   suite: found/invite/join/uniqueness/persistence).
2. **Slice F2 — the claim** (direction B's teeth: claim wire, map
   colors, occupation weighting, liberation credit; net suite: claim,
   contest, repel).
3. **Later, unpinned:** want-tallies (C) once claims exist; faction-
   flavored amnesty (the Choir forgives those who return a core);
   member salvage priority if claims feel toothless.

## Wire sketch (PROTOCOL M7, drafted at build time)

- `faction.found` c→s `{ reqId, name, color, want }` →
  `faction.founded { reqId, ok, faction?, reason? }`
- `faction.invite` c→s `{ reqId, pilot }` (founder only) →
  `faction.invited { reqId, ok }`; invitee gets `faction.invite.offer`
- `faction.join` / `faction.leave` c→s `{ reqId }` → ack + broadcast
- `faction.update` s→c broadcast `{ factions }` (registry, additive
  snapshot field `world.snapshot.factions`)
- `faction.claim` c→s `{ reqId, poiId }` → ack; claim rides `poi.state`
  as `claim: { faction, color, since }`
- Chronicle kinds: `faction.founded`, `faction.joined`, `faction.claimed`
  (+ `poi.liberated` gains optional `by` = player-faction credit)
- Server is authority on all of it; pilot names from `ws.pilot`, never
  payloads.

## UI sketch

- **Rep tab** becomes two halves: **Your Banner** (faction card: color
  chip, name, want line, roster with online dots, deed lines) above the
  existing grudge list. No faction → a one-line teaser ("a banner needs
  a want — the charter desk is in any shipyard").
- **Charter desk** in the Shipyard district (Slice B's walk-through
  pattern): name field, color swatches, want picker, the fee, and the
  warning that the chronicle is permanent.
- **Map:** claimed sites ring their POI glyph in faction color (distinct
  from ⚑ occupation — a claim under occupation shows both: your ring,
  their flag).
- **Ghosts:** member ships tint their name tag with the faction color
  (registry lookup client-side — no ghost wire change).

## Tuning flags (initial guesses, all consts)

Founding fee 15k credits; rank gate Veteran (index 3); claim requires
charted + unoccupied + no existing claim by that faction; occupation
roll weight for claimed sites ×2; invite expiry: none (scale is tiny).
