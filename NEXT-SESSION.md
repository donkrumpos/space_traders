# Next Session Roadmap

State as of 2026-07-08: all five queued features from the 2026-07-07 roadmap are
BUILT and committed (one commit each). On top of the existing base (swept-collision
combat, pirate tiers + bounty hunts, living economy, smuggling, asteroid mining,
kill streaks, shields, Gradius weapons + heat, 7 planets, full persistence), the
game now has:

1. **Pirate faction raid bands** — Rustfang Cartel / Void Choir / Iron Shoal.
   3-4 tinted minions escort a shielded warlord boss who holds back and holds
   fire until the escort dies, then engages with 3-shot volleys. Bands muster
   at 2500+ credits, one at a time, every 4-7 min. RAID BROKEN payoff +
   guaranteed boss drops.
2. **Laser progression tree** — every owned system levels up at any station:
   +30% damage / fatter bolt / +30 range per level. Single (trunk, Lv5),
   Twin LvN needs Single LvN+1, Spread chases Twin, Seeker needs ship Weapons
   Lv3 to buy and rides that upgrade to level. `weapons.lasers.levels` in save.
3. **Zanac powerups** — spinning star drops from pirates (15%, boss 100%) and
   asteroids (8%): Wave Beam (pierce), Rear Guard (tail shot), Twin Options
   (orbiting auto-guns), Nova Bomb (instant 28-bolt radial). One timed powerup
   at a time; HUD countdown.
4. **Subsystem damage + field repair** — hull hits (shields down) 30% knock out
   LASERS / ENGINES (40% thrust) / LIFE SUPPORT (hull bleeds to a floor of 5,
   never kills). R + a Repair Kit ('parts' good, stocked at Mining Station 7 /
   Tech Hub Alpha) field-repairs in triage order; docking fixes all free.
5. **NPC living traffic** (js/traffic.js) — 3 named freighters haul between
   planets and their dockings apply real applyTradeImpact, so prices move
   without the player. Common pirates hunt whichever prey is closer; freighters
   flee, die, scatter cargo, respawn. Bands/bounty bosses always target YOU.

All five were verified headless (game-boot + per-feature assertion harness);
**none have been playtested by human hands yet.** Next session should START with
a feel pass before building anything new.

## Playtest checklist (do this first)

- Fight a raid band at ~3000 credits: is kill-the-escort-first legible to
  Arthur? Is the boss reveal a good moment? Is 4-7 min between bands right?
- Laser tree pricing: does Single Lv3 (~$1k cumulative) feel earned? Is the
  prereq chain readable in the station UI?
- Powerup drop rate: 15% off pirates may be too generous — does it cheapen the
  owned-weapons progression? Nova at the right rarity?
- Get subsystems shot out on purpose: is limping home on 40% thrust a story or
  a chore? Is the 30% knockout chance per hull hit too spicy early?
- Watch a freighter get chased: does intervening feel heroic? Do market moves
  from NPC trades read at the ledger?

## Tuning flags (carried + new)

- Economy numbers still first-pass; watch for exploits
- Spread lasers + levels may now REALLY trivialize Scout packs
- Warlord/band boss fights still untested against a human
- Seeker + bounty hunts untested (homing may trivialize)
- Life-support floor (5 hull) — confirm it reads as tension, not cheapness
- Raid band frequency/credit gate (2500) — tune to Arthur's progress speed
- Trader flee speed vs pirate speed: fleeing at 1.3× may make pirate-vs-trader
  chases never resolve; if traders never die on their own, drop flee to 1.15×

## Future feature seeds (from the 2026-07-07 conversation)

- Faction grudges/reputation (bands remember who broke their raids)
- Persistent rival characters growing out of the traffic system
- Escort missions (protect a named freighter for pay) — natural next step now
  that traffic + factions both exist

## Workflow that works

One-sentence playtest note ("can't hit the pirate", "needs challenge") →
diagnose → build → playtest again. Small scope, verify in browser before next
feature. Serve with: python3 -m http.server 8377. Console helpers:
spawnEnemyShip(), spawnRaidBand(), spawnPowerupDrop(x, y), exportCharacter(),
resetCharacter().
