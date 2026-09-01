# Ship Systems & Modding — Design Vision (north star)

> **Status:** exploratory design, captured 2026-08-31 during the UI-legibility
> milestone riff. **This is a north star, NOT the current build task.** The
> in-scope slice is the *Schematic readout* (see §7). Everything past that is
> sequenced, later work. Written down so scope-creep ideas aren't lost and the
> next session has a direction to build *toward*. The worldbuilder (user) owns
> the final lexicon; lore terms here that already exist in code are marked ✓.

---

## 1. The core idea — the ship IS the character

Space Traders is drifting from "a ship you fly" toward "a ship that is *yours*
— that you design, outfit, crew, and read at a glance." The HUD sidebar redesign
cracked this open: once ship *state* is a drawn schematic instead of a text
wall, the schematic naturally wants to become **editable** — and editing a ship
is a whole RPG/economy system. This doc captures that arc.

## 2. Three views of one ship

The same ship, rendered at three levels of detail for three purposes:

| View | Where | Purpose | Rotates? | Art budget |
|---|---|---|---|---|
| **Avatar** | in flight, on the canvas | dodge, thrust, fight | yes (free 360°) | cheap / vector |
| **Schematic** | always, in the HUD sidebar | *glance* — "how am I, where am I hurt" | no | rich, number-free |
| **Ship Bay** | on demand (dock / hotkey) | *design & inspect* — full specs, modding | no | lavish, the detail view |

The Avatar is a **simplified render of the Schematic**, which is the glance-face
of the **Bay**. Mod your ship in the Bay → the Schematic changes → the Avatar's
silhouette can change too. That closes the loop: *explore → find components →
install them → your ship visibly becomes yours.*

**This dissolves the vector-vs-pixel-art question:** only the Avatar rotates, so
it stays simple/vector. The Schematic and Bay never rotate → they can be as
lavish (pixel / illustrated) as desired, with zero rotation-frame cost. The
Schematic is the ideal **first custom-art test** — one drawn ship, contained,
no rotation risk.

## 3. Glance vs. detail — visual vs. specs

Two audiences, both served, by splitting the encoding across views:

- **Schematic (glance) = number-free.** State and *capacity* are encoded as
  **form**, not digits: the cargo bay is a grid that fills; a bigger shield is a
  thicker envelope; a stronger engine is a bigger nacelle; damage flashes red on
  the exact part. You read the *shape*, pre-attentively, mid-combat.
- **Bay (detail) = every spec.** The gearhead opens the hood: power draw, mass,
  capacity, regen, heat, the lore of each component. (User's car-dashboard
  analogy: the dash is glanceable; the spec sheet in the glovebox has the tire
  ratings.)

Consequence: **the glance never shows a number it can encode as a shape.** No
"Lv2" badges — see §4.

## 4. Kill "levels." Components + power budget + tradeoffs.

The word **"level" is wrong.** A ship isn't a stat ladder; it's a set of
**named component technologies** you install, each with a cost/benefit profile,
**gated by two budgets:**

1. **Power** — a reactor/core outputs N power units; every active system draws
   power; `sum(draws) ≤ output`. Shields off frees power for weapons. Installing
   a stronger emitter may require a bigger core — which costs space, credits, and
   rarer fuel material. *(FTL reactor allocation; Escape Velocity outfitting.)*
2. **Space** — the hull has finite bays; every component (and every crew berth,
   gunner station, droid socket) occupies room. "You need the room." *(Star Wars
   RPG vehicle mods; Firefly ship-as-home.)*

So upgrading is **design planning under constraints**, not a linear climb.
The game already leans this way — existing mods carry real tradeoffs:

- *Old Grinner's Cannon Bore* ✓ — +15% laser damage, **+15% heat**
- *Barnacle-Hide Plating* ✓ — +40 hull, **−0.5 top speed**
- *Whisperdrive Coil* ✓ — −10% fuel burn, **scrambles the minimap**
- *Vex-Pattern Compressor* ✓ — +6 cargo, **runs lasers 10% hotter**

We formalize that instinct into slots + power, and rename "shield level 2" to
"which emitter, built from what, drawing how much."

## 5. The production chain — components ARE the economy

The materials that build & power ship tech are **the same commodities traded in
the game** — so players recognize the vocabulary. But raw goods can't bolt
straight onto a hull; they're **processed at a factory/refinery first.** The
chain:

```
raw commodity (market good)  →  factory / refinery  →  component  →  install in Bay (space + power)
```

The lore already exists in `js/game.js` `goods` — these map cleanly:

| Trade good ✓ | Flavor ✓ | Refines toward |
|---|---|---|
| **Ferrovolt Ore** | "charge-bearing iron, warm to the touch" | reactors, shield capacitors, hull |
| **Cognition Cores** | "shipmind processor lattices" | nav droids, AI gunners, targeting |
| **Panacea Vials** | "reef-lab cultured cure-alls" | med bay / bacta, life support |
| **Precursor Relics** | "artifacts of the vanished builders" | exotic / highest-tier components |
| **Repair Kits (parts)** | "sealed spares — field-fix subsystems" | hull plating, field repair |
| **Glowgrain** | "bioluminescent staple crop" | crew sustenance / life support |
| **Nebula Silk / Voidbloom** | luxury / contraband | crew comfort, black-market mods |

The player buys **Ferrovolt Ore** on the market AND recognizes it inside their
warp core — the economy and the ship become one story. (Star Trek's dilithium;
the user's coal→nuclear "what powers it" instinct.)

## 6. Modding surfaces (the Star-Wars-RPG vision)

The Bay's slots aren't just systems — they're the ship as a *place*:

- **Systems** — reactor/core, shields, engines, weapons, life support, sensors.
- **Cargo** — holds; some specialized (Reliquary Hold ✓ = fireproof; Smuggler's
  Deck ✓ = hidden).
- **Crew berths** — a seat *and a bunk* for each crew member (Sparks, Vex ✓).
  Crew occupy space and grant abilities.
- **Gunner stations** — a crewmember mans a turret (independent fire).
- **Droid sockets** — nav droid (autopilot / better minimap), AI gunner
  (auto-target), refined from Cognition Cores.
- **Med bay / bacta** — heal over time; Panacea Vials.

Constraint = the fun: a bigger med bay means one fewer cargo hold; an AI gunner
draws power your shields wanted. **The player is the designer.**

## 7. What we build FIRST (in scope NOW — the legibility milestone)

Only the **Schematic readout**, as the sidebar's Vitals band:

- Replaces four panels (Ship Status, Upgrades, Cargo Hold, systems-down warning)
  with one drawn ship + a small numerics strip.
- Number-free glance; capacity encoded as form (cargo grid, shield envelope
  thickness, engine size). Damage flashes the hit part red.
- **Draw its regions as slots from day one** so the Bay/modding drops in later
  with no rework.
- **No** power budget, **no** modding, **no** factories yet. Just the readout.
- Keep verify.js DOM ids stable (`#credits`, `#fuel`, `#hull`, `#shieldVal`,
  `#cargoUsed`, `#pilotRank`…); fold in the per-frame `updateUI` perf fix here.

This ships the legibility win *and* proves the visual language the rest depends
on, without committing to the big system.

## 8. North-star milestones (later, sequenced — each its own slice-set)

1. **Ship Bay, read-only** — the detail view: enlarged schematic + slot layout +
   full spec sheet. No editing yet; just "open the hood."
2. **Power + component reframe** — reactor output, per-system draw, install/remove
   components with space+power constraints. Retire "levels."
3. **Production chain** — factories/refineries turn market goods into components.
4. **Crew & droid slots** — berths, gunner stations, droid sockets + abilities.
5. **Lore lexicon pass** — the worldbuilder names every component/tier/tech.

## 9. Open questions

- **Power model granularity** — continuous pool, or discrete "bars" you assign
  per system (FTL-style)? Per-system on/off toggles in flight?
- **Space model** — free-form slots, a literal grid the ship interior fills, or
  weight/mass instead of/alongside slots?
- **Do raw goods get *consumed*** to craft components, or just *referenced* as
  lore? (Consumption ties the economy tighter but adds grind.)
- **Hulls as space budgets** — Sparrow Skiff (1 seat) vs Pelican Freighter
  (hauler) ✓ already differ; formalize each hull's slot/power capacity.
- **Multiplayer / persistence** — components are per-pilot save state; are they
  server-authoritative? (Persistent-world implications, see PROTOCOL.md.)
- **Lexicon ownership** — reactor tiers, shield tech names: the worldbuilder's
  call. Placeholders in mockups are straw-men to react to.

## 10. Why this is safe to want

The current mods, crew, upgrades, and richly-named goods mean the game is
*already* two-thirds of the way into this vision as flat lists. This doc doesn't
invent a new game — it gives the pieces already in the code a **spatial home and
a production story.** We just have to build it in slices, loops-first, starting
with the readout (§7).
