# Next Session Roadmap

State as of 2026-07-08 (evening): the morning's five features passed their
human playtest ("playtest works"), and the RPG progression layer queued from
that session is now BUILT and committed (one commit each):

1. **Pilot XP + ranks** — XP from kills (~hull/3), sells ($50/XP),
   deliveries (30), first landfall (25), escorts (40). Nine ranks
   Cadet→Living Legend, full-screen promotion banner. Old saves get a
   retroactive commission on first load — expect a promotion parade.
2. **Perk choice per promotion** — pick-one modal (game pauses), three
   lanes × four perks: FIGHTER (cooldown/missiles/heat/warheads), TRADER
   (sell+5%/cargo/buy-5%/contracts+20%), EXPLORER (fuel/minimap/limp/shields).
3. **Faction grudges** — broken raids escalate Marked→Hunted→VENDETTA per
   faction; grudged factions muster likelier, +minions, +boss hull (cap
   +60%), +pay (+20%/level). Reputation panel appears once grudged.
4. **Named crew** — 12 characters with quirks in station bars; Engineer
   (auto-repair 10s), Tail Gunner (rear bolt every other volley), Navigator
   (fuel −15%). Berths: 1 at Pilot rank, 2 at Captain.
5. **Escort missions + distress pings** — ⛡ contracts to shepherd a named
   freighter; departure spawns a 2-raider ambush; failure voids pay. All
   chased freighters blink orange on the minimap; escort clamps to map edge.

All five verified headless — `?verify` runs a 57-assertion suite
(js/verify.js, committed this session; see chrome-headless-shell one-liner
in that file's header). **None of the RPG layer is human-playtested yet.**
Same rule as last time: feel pass with Arthur before building anything new.

## Playtest checklist (do this first)

- Load Arthur's existing save: does the retroactive promotion parade land as
  a great moment or as noise? (Several banners + perk choices may stack.)
- Rank pacing: is the Cadet→Ensign 60 XP gap quick enough that Arthur hits a
  promotion in his first session, and is Captain (1000) a real horizon?
- Perk modal: can Arthur read/choose the three cards himself? Does pausing
  mid-flight feel safe or jarring?
- Break 2-3 raids from one faction: does VENDETTA escalation read? Is a
  +60%-hull vendetta boss a wall or a boss fight?
- Hire someone at a bar (needs Pilot rank): do the names/quirks land? Is the
  Engineer's 10s auto-fix noticeable next to field-repair kits?
- Fly one escort start to finish: is staying with a slow freighter fun or a
  chore? Is the ambush survivable at Arthur's ship level? Does the cyan
  edge-clamped blip make the charge findable?

## Tuning flags (carried + new)

- XP curve numbers are first-pass; sell-XP ($50/XP) is exploitable at a
  credit loss by buy-sell loops — watch whether it matters in practice
- Retroactive XP may vault a veteran save 3-4 ranks instantly — stacked
  perk choices on load could overwhelm; consider spacing them
- Gunner rear bolt + Rear Guard powerup stack — probably fine, may be loud
- Escort freighter speed (3.2) vs player max 8 — player waits a lot;
  consider a "match speed" nudge if it drags
- Grudge has no forgiveness mechanic — VENDETTA is forever (bribe/amnesty
  at a lawless port could be a future release valve)
- Economy numbers still first-pass; spread lasers vs Scout packs still
  untested against a human (carried from last session)

## Future feature seeds

- Grudge amnesty: pay off a faction at Frontier Outpost (credits sink)
- Crew levels or loyalty — crew that survives raids gets better
- Persistent rival characters growing out of traffic + grudges
- Boss taunts using the pilot's rank title ("run home, *Captain*")

## Workflow that works

One-sentence playtest note → diagnose → build → playtest again. Small scope,
verify in browser before next feature. Serve: python3 -m http.server 8377.
Console: spawnEnemyShip(), spawnRaidBand(), spawnPowerupDrop(x, y),
grantXP(n), exportCharacter(), resetCharacter(). Headless: see js/verify.js.
