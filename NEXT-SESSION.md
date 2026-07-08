# Next Session Roadmap

State as of 2026-07-08 (late): the RPG layer (ranks/perks/grudges/crew/
escorts) passed its human playtest, and the ship progression arc queued
behind it is now BUILT and committed (one commit each):

1. **Hull ladder** — five buyable ships: Sparrow Skiff (one-seater, 0
   berths) → Magpie Courier ($6k, 1 berth) → Pelican Freighter ($18k,
   hauler) / Kestrel Gunship ($24k, warbird) → Albatross Clipper ($60k,
   3 berths). Shipyards at Agricon, Tech Hub, Core World, Frontier show
   the FULL catalog — including what you can't afford and what's sold
   elsewhere. The dreaming is the point. Trade-in is 60% of the old hull.
2. **Ship-as-character** — buying (or first-loading an unnamed save)
   opens a christening modal with name suggestions; the ship gets a name,
   a sidebar identity panel ("The Ship"), and a log where purchases and
   installs accumulate. Hull gates berths (min with rank), upgrade caps
   per track ("HULL CAP" in the shop), top speed, and turn agility.
3. **Named mods** — 8 one-of-a-kind used parts at a rotating Mechanic's
   Bench, most with a quirk beside the gift (Vex compressor runs lasers
   hot; Whisperdrive coil scrambles the minimap; Barnacle plating sheds
   speed; Smuggler's False Deck blinds customs; Old Grinner's bore,
   Back-Alley Injectors, Saint Elmo's Capacitor, Songbird Array).
4. **Per-hull silhouettes** — each hull draws its own wireframe body;
   shield ring and flames follow.

Legacy saves are commissioned retroactively into the smallest hull that
fits their upgrade levels and crew — Arthur's save may load into a
Courier or better, then get asked to name her. All headless-verified:
`?verify` runs 92 assertions (js/verify.js). **None of the ship layer is
human-playtested yet.** Same rule as always: feel pass with Arthur
before building anything new.

## Playtest checklist (do this first)

- Load Arthur's save: what hull does the retroactive commission give him?
  Does the christening modal land as a moment? (It queues BEFORE any
  pending perk modals — watch the ordering feel.)
- Can Arthur read the shipyard catalog and does the "can't afford it yet"
  row make him want something? Which ship does he say he wants?
- Buy a hull with him: does the trade-in math read? Does the new
  silhouette + banner land? Does he want to rename or keep the name?
- Skiff berth-lock: does "no bunks on a one-seater" read as a reason to
  save up, or as a punishment? (New players can't hire crew until the
  Courier — watch whether that feels like progression or a wall.)
- Mechanic's Bench: do the quirks read at his reading level? Does a
  drawback mod (Grinner's bore heat) feel like character or like a trap?
- Freighter feel: is 6.5 top speed + 0.8 agility "big and heavy" or just
  "worse"? Gunship at 9/1.25 — noticeably mean?
- Does "The Ship" panel (name/hull/mods/log) get glanced at? Does Arthur
  retell the log entries?

## Tuning flags (carried + new)

- Hull prices ($6k/$18k/$24k/$60k) vs. income rate are first-pass —
  watch how many sessions to the first Courier
- Upgrade caps may strand credits early (skiff caps everything at 2-3);
  if the skiff phase drags, either cheapen the Courier or raise a cap
- Mod stock rate (45%/dock) untested for drought/flood
- Trade-in at 60% means downgrade round-trips lose 40% — intended
  friction, verify it doesn't read as a bug
- XP sell-loop exploit + escort freighter speed (3.2) still carried
- Grudge has no forgiveness mechanic — VENDETTA is forever (carried)

## Future feature seeds

- Mods visible on the silhouette (greebles per installed mod)
- Ship log auto-entries for milestones: first vendetta boss kill,
  100th landing, surviving under 10% hull
- Grudge amnesty at Frontier Outpost (credits sink, carried)
- Crew loyalty; persistent rivals; boss taunts by rank title (carried)
- Second-hand hulls: a cheaper, quirky used version of the next hull up

## Workflow that works

One-sentence playtest note → diagnose → build → playtest again. Small
scope, verify in browser before next feature. Serve: python3 -m
http.server 8377. Console: grantXP(n), nameShip('...'), spawnRaidBand(),
exportCharacter(), resetCharacter(). Headless: see js/verify.js header.
