# The Singing Reactor — the first expedition (design riff)

Status: **PINNED 2026-10-06** (developer walked every fork with the
assistant, all recommended options accepted; see Pinned forks below).
The brief: a dispatcher offers a contract to recover a singing reactor
from a remote Combine hauler. The pilot prepares hold, fuel, and repair
kits; follows intermittent signal clues; survives a recovery encounter;
and brings the reactor home while its song draws cartel attention. The
reward is a specialized module with a real tradeoff. Smallest complete
version — no quest framework, no crafting, no procedural universe, no
ship redesign.

Why now: the twentieth-session prod read (NEXT-SESSION item 2–3) —
a maxed pilot (rank capped, light pressure band, free instant dock
repair) has nothing pulling them past the quick-dock radius. This
contract is that pull, and it is regional (the SE dark, Void Choir
turf) rather than a global pressure bump. The settled core stays a
harbor.

Lore (docs/lore-bible.md): the singing motif is the Reach's one
aesthetic law — a human machine that sings has been touched by
something it shouldn't have. The Void Choir calls every core a caged
voice and raids for them. A Combine extraction hauler abandoned
mid-Withdrawal, hold full of cores, is diegetically correct filler.

## The flow

1. **The offer (Frontier Outpost, "Lastlight").** A dispatcher entry
   sits beside the shared mission board — per-pilot, not a board slot.
   It lists the preparation plainly: **4 free hold units** (the reactor
   is big), **2 Repair Kits aboard** (out past the ports the only repair
   is field repair), and a warning that the pull draws on your drive
   (top the tank). Accept is enabled only when the hold and kits check
   pass and the log has room. The offer text gives the opening bearing
   in prose: the last squawk came from the SE dark, past Lastlight,
   short of the Choir.
2. **The hunt (signal pulse).** Once accepted, the reactor's song
   reaches you every ~20s: a minimap pip at the true position plus
   jitter that shrinks with distance (900u of slop far out, ~30u when
   close), a strength word in the Now zone (faint → clear → strong →
   loud), the first pulse a HUD toast. You fly toward where the pips
   cluster. Pure client math; the hidden position rides in the mission
   object under the family trust model. The hauler is NOT a POI: it
   never becomes a shared landmark, so the second pilot still hunts.
3. **The pull (tether hold under fire).** Inside the hauler's radius
   (wide enough to dogfight in) press **E** to start the extraction: a
   ~60s bar that runs only while you stay inside the ring (drifting out
   PAUSES it) and drains ~200 fuel over its length (paused with the bar
   — a skiff must arrive near full or stall on reserve). At ~40% the
   song gets loud enough: a **Void Choir band musters at the site**
   (server: the occupation muster path; solo: the local band spawner).
   A breach CANCELS the pull; the reactor stays in the hauler for a
   retry — a wrecking costs time and kits, never the reward. The bar
   full → the reactor drops into your hold as a 4-unit cargo good.
4. **The return (the song).** While a pilot carries the reactor AND is
   outside the settled core (>~600u from any planet), a per-carrier
   hunter lane runs on its own clock: a Void Choir raider pair every
   ~45s, anchored on the carrier, bypassing the wealth gate, capped at
   four hunters alive. The lane stops the moment the reactor is
   delivered or lost. Nobody else's pressure changes; inside the core
   the Choir backs off — getting home is the finish line. Told plainly:
   a persistent Now-zone line (♪ the reactor sings · the Choir is
   listening), a toast with a bearing when a pair musters, hunters in
   Choir purple on the minimap. The reactor **scatters like any cargo**
   on a breach (the Crawl's 50% roll; pods expire in 90s, the hulk wakes
   at ~105s → a scattered reactor is lost, or scooped by a family member,
   which the karma lane already judges). Fortified/Reliquary holds are
   therefore real preparation decisions.
5. **Delivery (back at Lastlight).** Dock with the reactor aboard:
   **$3000**, **+12 fame** (above a first charter — the top deed), 150
   XP, and the reactor is fitted as a mod on the spot. The chronicle
   records it (MAJOR). The first pilot galaxy-wide to deliver is
   remembered charter-style ("first answered by Dad"); the hauler keeps
   its Combine designation (earned naming belongs to the nomenclature
   slice).
6. **The module — the reactor itself, bolted in.** Benefit: **lasers
   never lock out** — heat still builds and runs them hot, but the
   overheat lockout is gone. Tradeoff: **it keeps singing** — the hunter
   lane becomes permanent at a gentle cadence (a pair every ~3 min,
   same outside-the-core rule, same cap). The dark gets harder only for
   the pilot who chose it. **Pullable at any bench** (the first removable
   mod): pulled is gone; the expedition is the way to get another.

## Pinned forks (2026-10-06)

| # | Fork | Pinned | Why |
|---|------|--------|-----|
| 1 | One reactor or one per pilot | **Per pilot** — the hauler carries a hold of cores | POI precedent: every family member gets the moment, the first gets the ledger line. Galaxy-unique locks two of three out forever. |
| 2a | Where the hauler sits | **Fixed authored spot**, far SE dark | One data row; the family can share directions. Drift → watchlist. |
| 2b | How it's found | **Signal pulse** (jitter shrinks with distance) | Client math, works solo. Checkpoints = three more hidden-location problems. |
| 3a | Recovery sequence | **Tether hold under fire** | Active, reuses band muster + radius detection + cargo. |
| 3b | When the Choir musters | **Partway, ~40%** | A quiet half and a loud half; a damaged pilot can still decide. |
| 3c | Leaving the ring / breach | **Pause; breach cancels** | Reset would stack with the Crawl's dark time. |
| 4a | Return danger | **Choir hunters on their own clock** | Expedition-specific, pointable on the HUD. |
| 4b | Where active | **Outside the settled core only** | The core stays a harbor; home is a finish line. |
| 4c | Reactor on breach | **Scatters like cargo** | Hold mods become real prep; the danger has teeth. |
| 5a | Module benefit | **Lasers never lock out** | A rate effect a maxed pilot feels every fight. |
| 5b | Module tradeoff | **It keeps singing** (permanent gentle lane) | The pull past the ports, in one part, opt-in. |
| 5c | Removable | **Pullable at any bench** | Keeps the choice honest; first removable mod. |
| 6a | Hold size | **4 units** | A skiff arrives near-empty; a freighter barely notices. |
| 6b | Fuel teeth | **The pull drains the tank** (~200 over 60s) | Fuel range is otherwise not a constraint on this map. |
| 6c | Payout | **$3000 + 12 fame + 150 XP** | Above a bounty; nudges a maxed pilot's pressure band. |
| 7a | Chronicle the loss | **Yes, MINOR kind** | "Lost the reactor to the dark off the Choir." No extra fame dent. |
| 7b | First recovery earns | **Charter-style record** | Earned naming → nomenclature slice. |
| 8 | Repeatability | **Whenever you hold no reactor** | No active expedition, none in hold, none installed. Consistent with a pullable mod. |
| 9 | Process | Design doc → `feat/expedition-reactor` → three gated slices | — |

## Personal vs shared (the ledger the protocol doc carries)

**Shared, server-owned:** the hauler's position (constant, in the sim
module), who answered first (`world.expedition.firstBy`), the Choir
muster at the site (one band at a time, like occupations), each
carrier's hunter lane (server combat authority), the chronicle lines.

**Personal, in the pilot doc:** contract stage (on the mission object:
`outbound` → `recovering` → `carrying`), extraction progress, the
reactor in the hold, the installed module, fame/karma credit. Two
pilots extracting together fight ONE band and each pull their OWN
reactor.

**Solo:** the client runs the muster and the hunter lane locally,
exactly as it runs offline raid bands now. Same tuning constants, same
sim module.

## Tuning (ExpeditionCore.EXPEDITION_TUNING — v1 guesses, all flagged)

| knob | v1 | note |
|------|----|------|
| hauler position | 4600, 2900 | ~1840u from Lastlight, ~670u from the Drowned Choir; off the 1500u minimap from the port |
| tether radius | 220u | room to dogfight inside |
| reactorUnits | 4 | hold cost |
| kitsRequired | 2 | at accept |
| pullSeconds | 60 | the bar |
| pullFuel | 200 | drained over the bar, paused with it |
| musterAtFrac | 0.40 | when the Choir arrives |
| pulsePeriodSec | 20 | the song's cadence |
| pulseJitter far/near | 900u @ ≥3000u → 30u @ ≤400u | linear between |
| coreRadius | 600u | "outside the core" = farther than this from every planet |
| hunterPeriodSec | 45 | carrying |
| singingHunterPeriodSec | 180 | installed |
| hunterCap | 4 | alive at once, per lane |
| reward | $3000 · fame 12 · xp 150 | |

## Slice ladder (each: both gates green, one commit)

1. **Contract + clues** — `js/sim/expedition-core.js` (pure: hauler
   row, tuning, prep check, jitter math, offer factory, availability
   rule, core test), `js/expedition.js` (dispatcher entry at Lastlight,
   accept with the prep check, mission-log row, pulse timer on the
   fixed-step tick, minimap pip + full-map pip, hauler world/minimap
   glyph, arrival = `found`, Now-zone signal line, console
   `expeditionStatus()`). Playable to "I found it."
2. **Recovery + return** — the pull (E inside the ring, bar, fuel drain,
   pause/cancel), the reactor good (`reactor`, 4 units; server
   `GOOD_TYPES` must learn it or `cargo.scatter` rejects the pod), the
   Choir muster at 40% (server `expedition.pull` claim → muster at the
   hauler; solo local band), the per-carrier hunter lane on both paths
   (`combat.mjs` + `combat.js`), the carrying Now-zone line and muster
   toasts, the loss chronicle line.
3. **Module + chronicle** — delivery at Lastlight grants the mod
   (`singing_reactor`: no laser lockout; `singing` flag feeds the gentle
   lane), the bench pull (first removable mod), `expedition.recovered`
   (MAJOR, +12 fame) + `expedition.lost` (MINOR), `world.expedition.
   firstBy`, PROTOCOL.md rows, handbook section, NEXT-SESSION record.

## Watchlist (seeded)

- Jitter envelope (900→30) and the 20s cadence: does the hunt take 3
  minutes or 15? Target ~5 from Lastlight.
- 60s bar with a band at 40%: survivable in a skiff with 2 kits?
- Hunter cadence 45s / cap 4 on the ~1840u run home — too thin or a
  wall? The core radius 600u: does the finish line feel like one?
- The gentle lane at 180s: does anyone keep the reactor installed?
- Drift (fork 2a) if the second pilot's hunt feels trivial.
- Server `GOOD_TYPES` derives from planet produces/demands — the
  reactor good must be added explicitly (slice 2).
