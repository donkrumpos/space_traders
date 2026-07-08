# Next Session Roadmap

State as of 2026-07-07: combat overhauled (swept collision, velocity inheritance,
lead reticle, juice/SFX), pirate tiers + named bounty hunts, living economy
(drifting prices, market events, ledger, mission board), smuggling (Voidbloom),
asteroid fields with respawn + mining, cargo scooping, kill streaks, regenerating
shield pool, Gradius weapon systems (Single/Twin/Spread/Seeker) with laser heat,
story-world goods, 7 planets, full persistence (world state survives reload).

## Queued features (agreed 2026-07-07)

### 1. Pirate factions — raid bands with story structure
A band of 3–4 minions escorting a warlord boss. Minions must die first (boss
shields up / stays back until its escort is gone), then the boss engages.
Factions have names/identities so encounters feel authored, not random.
- Builds on: ENEMY_TIERS + spawnNamedWarlord in combat.js
- Design questions: faction flavor (colors/names per faction), do factions hold
  grudges (reputation), band spawn triggers (wealth? bounty posters? territory?)

### 2. Laser progression tree
Each weapon system (Single/Twin/Spread/Seeker) individually upgradeable —
bigger/stronger per level. Prerequisite tree: e.g. Twin Lv2 requires Single Lv3;
Seeker requires weapons upgrade Lv3, etc.
- Builds on: LASER_MODES in combat.js, WEAPON_SYSTEM_PRICES in trading.js
- Persist per-system levels in ship save (weapons.lasers.levels = {single: 2, ...})

### 3. Zanac-style alternate shooting powerups
Temporary pickup-based weapon modes (dropped by pirates/asteroids): timed
super-weapons distinct from the owned Gradius systems — e.g. wave beam,
rear-fire, orbiting options, screen-clear bomb.
- Builds on: cargo-drop pickup loop in world.js (same scoop mechanic, different
  payload type)

### 4. Subsystem damage + field repair
Once shields are down, hull hits can strike specific systems: lasers (can't
fire), engines (thrust cut), life support (timer pressure), navigation (map
blackout?). Repair in space with the right tools (new good: repair kits?) or
limp to a station for full repair.
- Builds on: damagePlayer in combat.js, repair service in trading.js
- This is the biggest feel-changer: turns losing fights into escape stories

### 5. NPC living traffic (ambient traders + market participation)
Visible NPC freighters flying planet-to-planet. Pirates attack them; player can
watch or intervene. When they dock they actually trade via applyTradeImpact, so
prices move without the player and ledger data goes stale for a reason.
- Builds on: enemy AI patterns in combat.js, applyTradeImpact in economy.js
- Explicitly NOT: networked multiplayer, full persistent rival characters (that
  grows later out of this)

## Known gaps / tuning flags
- Economy numbers (drift rates, event multipliers, mission premiums) are
  first-pass; watch for exploits (market-event sell prices may beat missions)
- Shield pool makes early game forgiving — if pirates feel toothless, raise
  enemy fire rate, don't nerf shields
- Spread lasers may trivialize Scout packs (raise heat cost if so)
- Warlord boss fight (200 hull, 3-shot volleys) untested against a human
- Bounty boss + Seeker interaction untested (homing may make hunts too easy)
- Events (derelict/depot/distress) still use static message probabilities

## Workflow that works
One-sentence playtest note ("can't hit the pirate", "needs challenge") →
diagnose → build → playtest again. Small scope, verify in browser before next
feature. Serve with: python3 -m http.server 8377. Console helpers:
spawnEnemyShip(), exportCharacter(), resetCharacter().
