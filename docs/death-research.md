# Death mechanics — research survey (2026-09-04)

Status: **RESEARCH, not pinned.** Deep-research pass (5 search angles, 21
sources, 104 claims extracted, 25 adversarially verified — 22 confirmed
3-0, 3 refuted and discarded). Question: what do great games teach about
death/respawn, mapped to OUR fit — a family-scale persistent world,
exploration-as-the-reward, a hardcore-leaning designer, sci-fi diegesis
available. Current mechanic under study: cargo scatters at the wreck as
lootable pods, 25% credit tax, respawn at map start after 4s; knowledge
(charts, XP, rank, perks) persists.

## The verified findings

**1. Respawn location is an isolable, studied variable — and the only
controlled experiment favors player-activated savepoints AND permadeath
over automatic checkpoints.** Cuerdo, Mahajan & Melcer (IEEE CoG 2021,
N=72, randomized): checkpoints scored significantly LOWER on autonomy
and curiosity than both savepoints (p=0.046 autonomy) and
respawn-to-start/permadeath (p=0.037 autonomy, p=0.005 curiosity). The
authors' diagnosis: players weren't involved in deciding where they
respawn. Curiosity is exactly the dimension an exploration-as-reward
game must protect. Notable corollary: **our current respawn-at-start is
the well-scoring "start of game" condition, not the bad one** —
designer-placed automatic checkpoints are the bad one.
→ https://ieee-cog.org/2021/assets/papers/paper_70.pdf

**2. Death frequency matters as much as severity.** Same study: more
deaths correlated with lower mastery/autonomy/curiosity (rs≈−0.25 to
−0.37); immersion rose with deaths ONLY inside the permadeath condition
(rs=0.554). For a curiosity game: deaths should be rare-but-meaningful;
raising stakes buys immersion only for players who accepted the frame.

**3. EVE walked back progression loss and kept economic loss.** Rhea
release (2014-12-09) removed skill-point loss on pod death and clone
grades entirely — CCP's stated reason: unexpected progression loss "is
a terrible experience for new players." What EVE KEPT for two decades:
the ship is really gone (~half the fittings destroyed, the rest drops
as loot). Lesson: **never let death touch knowledge/XP/rank (we already
get this right); confine loss to replaceable economics.**
→ https://www.eveonline.com/article/a-new-era-of-clones

**4. Harshness works only with social recovery.** CCP's CEO: a
devastating loss is often the turning point that creates a committed
player — "if you have the social support to get out of that." A family
server has that support built in; a child's loss can become the
family's rescue story. (Open question flagged: all this evidence comes
from massive anonymous populations; 5-person-server looting dynamics
are undocumented.)
→ https://venturebeat.com/2020/04/29/people-despise-losing-progress-so-why-is-loss-key-to-eve-online

**5. EVE's clone lore is the gold standard for diegetic respawn.** The
transneural burning scanner snapshots the mind-state and transmits it
to a waiting clone — death reframed as continuity. Directly borrowable:
**beacons as mind-state relays.** (And our lore is pre-adapted: the
Precursors BECAME the signal — a beacon that sings your pattern back
into a new hull is already Reach-canonical.)
→ https://universe.eveonline.com/lore/capsuleers

**6. Star Citizen's "Death of a Spaceman" (Roberts, 2013) prefigures
both our open ideas.** (a) Respawn binds to the last place you docked —
a save point set by visiting, plus insurance ("You'll end back up at
the last planet you docked on, with a new ship courtesy of SystemWide
Insurance"). (b) Softened permadeath: ~half a dozen lives, accumulating
scars/prosthetics, then the character dies for good and assets pass to
a named beneficiary. Roberts rejected EVE-style easy cloning: "a
universe of immortal gods that can't be killed." Caveat: a design doc,
never implemented — proof of design intent, not play-tested outcomes.
→ https://robertsspaceindustries.com/en/comm-link/engineering/12879-Death-Of-A-Spaceman

**7. Project: Gorgon names the two failure modes of harsh death** (Eric
Heimburg, exploration-first MMO): (a) unexpected punishment during
low-stakes play → rage-quit; (b) a weakness spiral where repeated
deaths leave you unable to recover → abandonment. His solution: lenient
baseline everywhere ("my game is first and foremost about exploration,
so I need a penalty that makes it easy to explore"), harsh outcomes
scoped ONLY to encounters players knowingly opt into ("you came into a
group-combat area, so you knew the stakes were going up").
→ https://wiki.projectgorgon.com/wiki/Elder_Game:_Project_Gorgon%E2%80%99s_Death_Penalty

**8. Full permadeath MMOs failed commercially** (Salem, Wizardry
Online — the latter shut down in ~18 months; lag alone can end a
career). And Klastrup (2007): the SAME penalty lands as trivial or
devastating depending on penalty design, player experience, and social
context — one global severity dial cannot fit a hardcore designer and
a child on one server. Severity must be scoped or opt-in, not global.

## Ranked best-fit architectures (research synthesis, not pinned)

1. **Beacon-bound respawn over current economics** — keep the wreck-pod
   scatter + credit tax (the EVE-validated shape; pods matter to other
   pilots), replace fixed respawn-at-start with clone-relay beacons the
   pilot must physically fly to and activate. The strongest
   evidence-backed move: it IS the savepoint condition that beat
   checkpoints; the choice is EARNED by reaching the beacon (hardcore-
   compatible — resolves the designer's save-point vs player-choice
   tension: earned choice tied WITH permadeath in the study); EVE lore
   + our signal canon make it fully in-fiction.
2. **Context-scoped severity (the Gorgon model)** — lenient baseline;
   harsher stakes only in zones/encounters knowingly entered. This is
   the region-gradient idea with a sharper rule: severity follows
   CONSENT, not distance.
3. **Opt-in legacy layer (Death-of-a-Spaceman flavor)** — per-pilot
   ironman charter: limited lives, accumulating scars, inheritance to a
   named successor; chronicled forever. Permadeath's meaning without
   imposing it.
4. **Distance-as-punishment (die far → restart from core) — CAUTIONED
   AGAINST at expansion scale.** It reproduces both Gorgon failure
   modes and taxes exactly the behavior (ranging far) the game treats
   as its reward. Same risk-feeling, better shape: **beacon spacing** —
   how far past your last activated beacon you push is a gamble the
   player chooses; distance-risk becomes autonomy instead of penalty.
   (At TODAY's map size, respawn-at-start is fine — see finding 1.)

## Caveats

The lab study is a 15-minute 2D platformer (N=72) — transfer to a
persistent economy game is extrapolation. Star Citizen's design was
never implemented. Gorgon is one designer's blog (verified verbatim,
corroborated by the shipped game). Catalogue gaps: claims about
EverQuest XP-loss specifics, FFXI/XIV home points, Minecraft/Valheim/
Terraria recovery, souls bloodstains, Sea of Thieves' ferry, and
hardcore-mode retention did NOT survive verification or were never
gathered — the synthesis leans on space-sim/MMO evidence, which is the
closest genre match anyway.

## Open questions the research couldn't answer

- How do corpse-run/recovery mechanics land with CHILDREN specifically?
  (No surviving age-differentiated evidence.)
- Does wreck-looting between five family members generate story or
  grief? (All social-glue evidence is from anonymous populations.)
- Any direct precedent for distance/travel-time as the PRIMARY death
  penalty in exploration games? (The case against is inferential.)
- Verified retention history of opt-in hardcore modes? (Those claims
  didn't survive verification; the legacy-layer idea rests on Star
  Citizen's unimplemented design.)
