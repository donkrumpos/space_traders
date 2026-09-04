# The Crawl — death without dying (design riff)

Status: **PROPOSED, not pinned** (2026-09-04, developer riff + research
synthesis). Companion: `docs/death-research.md` (the evidence base).
The developer's direction: no one ever dies — defeat, silence, recovery.
Roots: UO fame/karma (the developer's home MMO), Sid Meier's Pirates!
defeat states, the IEEE CoG savepoint/autonomy findings, EVE's
never-touch-progression walkback.

## The flow

Hull reaches zero →

1. **The breach.** The outer hull/cargo section blows — this IS the
   death FX peers already see (boom, shake, wreck field). Real pods
   scatter. The core hull goes dark and drifts.
2. **Cargo stakes.** A protected fraction stays aboard; a percentage
   scatters as pods — the victor's reward (and the reason pirates
   disengage: they got what they came for). A **fortified cargo hold**
   (purchasable, charge-limited — e.g. 3 charges) protects more; the
   Precursor Reliquary Hold remains the legendary permanent tier above
   it. Credit sink by design ("economy too solvable" gets its drain).
3. **Running silent.** The pilot is stopped for a delay, then crawls.
   While dark they are UNTARGETABLE and absent from hostile sensors —
   not magic: a cold, dead-reading hulk indistinguishable from the
   debris around it. Thermal-signature logic, zero lore handwaving.
4. **Recovery.** Systems self-repair over time. Baseline: repair
   starts automatically after the delay. The **play-dead mod**
   (bought or found): the pilot CHOOSES when to light the reactor —
   lie dark until the raid band drifts off. Tension: dark = safe but
   slow; lighting up = speed but exposure.
5. **The exits.** Crawl out on emergency thrust (guaranteed floor —
   no stuck states, ever); call the **wreckers** (paid tow; karma
   courtesy below); eventually limp to a lit beacon and jump
   (expansion-gated, see Beacons).
6. **The ledger.** The chronicle records the wrecking. **Fame** takes
   the dent. Rank, XP, perks, karma: untouched.

## Balance rules that bind

- **Silence ends on:** repair completing, docking, or ANY interaction
  (firing, scooping, mission acts). Then you are a target again.
- **No stealth-drive exploit:** crawl speed stays crawl speed; no
  interactions while dark. The ghost state is recovery, not passage.
- **Never touch progression** (death-research finding 3): no XP/rank/
  perk loss, ever. Fame carries the sting — social, not mechanical.
- **No stuck states:** emergency power always regenerates minimal
  thrust (already true of the fuel-out crawl).

## Fame / Karma / Titles (the UO lane, Reach-voiced)

- **Fame** = how much of the Reach's memory is about you. Fed by the
  same events the chronicle records (charters, liberations, foundings,
  bounties…); dented by getting wrecked. The chronicle is already the
  event spine — fame hangs off existing hook points.
- **Karma** = how you're judged: escorts defended, tributes settled,
  rescues vs. traders gutted, smuggling. Death never touches karma.
- **Titles** = pilot rank (existing PILOT_RANKS ladder, capability)
  + an earned **epithet** from the fame×karma matrix. Epithets obey
  the naming law (lore-bible §3 + nomenclature lock): names are
  earned through chronicled events — applied to people.

## The wreckers

Salvage/tow crews — the Reach's most Mad Max profession. V1: a paid
"call the wreckers" option while dark (tow to nearest port; price by
distance). Full version: ambient traffic entities (traffic-core
already flies traders) that physically come to you. **Karma courtesy:**
high-karma pilots occasionally get a free tow — the road remembers
kindness. Future faction/lore surface.

## Beacons + hyperspace (expansion-gated)

The crawl removes respawn, so beacons stop being save points and
become **infrastructure**: jump anchors + safe harbor. Jump only
between beacons you have ACTIVATED (the earned-choice principle from
the savepoint research, preserved); frontier regions have none until a
pilot flies out and lights them — the family builds the travel network
outward, the edge stays far. Solves the crawl's worst case (deep-space
wreck → limp to nearest lit beacon → jump home). Belongs to the
R-slices; the beacon is designed dual-purpose from day one.

## ⚖ Forks to pin before building

- ⚖ Cargo % scattered baseline (rec: ~50%; fortified hold cuts it,
  Reliquary zeroes it)
- ⚖ Delay + repair curve numbers (stopped Xs → thrust → full over
  ~1–3 min; crawl must be a scene, not a wait)
- ⚖ XP loss (rec: NO — fame instead; the research is unambiguous)
- ⚖ Fame v1 shape (rec: per-pilot counter fed at chronicle hook
  points; epithet thresholds later)
- ⚖ Wreckers v1 (rec: paid call while dark; traffic entities later)
- ⚖ What peers see (rec: the breach FX + wreck field + pods; the dark
  core hull does not relay until recovery — net ghost-hide extension)
- ⚖ Hyperspace scope (rec: R-slice; beacons dual-purpose now)
- ⚖ Ironman charter interaction (opt-in true death for signatories —
  deferred, from death-research architecture 3)

## Slice ladder (when pinned)

1. **Crawl core** — hulk state replaces respawn: breach FX split
   (peers see boom, pilot goes dark), untargetable+unrelayed silence,
   % cargo scatter, stop delay + repair curve, crawl floor. Server +
   client + combat-core disengage-on-hulk. The big one.
2. **Fame v1** — counter + chronicle hooks + death dent + HUD line.
3. **Economy hatches** — fortified hold charges + wrecker paid tow.
4. **Karma + epithets** — second axis, title matrix, wrecker courtesy.
5. **Beacons/hyperspace** — with the expansion R-ladder.

Handbook rule applies at every slice: the Crawl changes what a player
needs to know (§08 "When you die" rewrites to "When you fall silent").
