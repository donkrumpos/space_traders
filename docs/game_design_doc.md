# Space Traders - Game Design Document

## Overview
A retro-style space trading game combining physics-based flight with economic strategy. Players pilot starfighters through a vast universe, buying low and selling high while upgrading their ships and navigating various challenges.

## Core Vision
- 8-bit aesthetic with deep underlying mechanics (Dwarf Fortress philosophy)
- Emphasis on spatial gameplay over menu-driven interactions
- Economic simulation with meaningful player choices
- Progression through ship upgrades rather than character levels

## Target Platforms
- Primary: Desktop web browsers
- Secondary: Mobile (responsive design considerations)
- Technical: JavaScript/HTML5, modular architecture

## Core Gameplay Loop
1. **Navigate** to planets using physics-based ship controls
2. **Trade** goods between planets with different supply/demand
3. **Upgrade** ship systems to improve efficiency and capabilities
4. **Encounter** random events during travel
5. **Expand** operations to more distant, profitable routes

## Player Progression
### Ship Upgrades (Primary progression)
- **Engines**: Thrust acceleration curves (Level 1: slow ramp, Level 4: instant response)
- **Cargo Bay**: Capacity increases (+5 units per level)
- **Fuel Tank**: Range extensions (+200 units per level)
- **Hull**: Damage resistance (+50 HP per level)
- **Shields**: Defense systems (future combat preparation)

### Economic Progression
- Start with basic trade routes (Agricon ↔ Mining Station)
- Progress to high-risk/high-reward runs (Frontier Outpost)
- Develop specialized trading strategies based on ship configuration

## UI/UX Standards

### Interface Hierarchy
1. **Game World** (left): Primary visual focus, always visible
2. **Ship Systems Panel** (right): Expandable for interactions
3. **Mini-map** (corner): Spatial awareness without obstruction
4. **Notifications** (top): Non-blocking status updates

### Interaction Patterns
- **Spatial Objects**: All interactive elements exist in game world
- **Proximity-based**: Use SPACE key when near objects (consistent with planet docking)
- **Side Panel Expansion**: All complex interactions use right panel (trading, upgrades, events)
- **Emergency Escape**: ESC key always available for quick exit

### Design Principles
- **No center-blocking modals**: Maintain spatial awareness
- **Player agency**: Always provide choice, never force transactions
- **Information before commitment**: Show costs/consequences before action
- **Consistent interaction model**: Same pattern for planets, events, stations

## Economic System

### Trade Goods
- **Food**: Agricultural worlds → Industrial/frontier markets
- **Technology**: Tech hubs → Agricultural/mining worlds
- **Raw Materials**: Mining stations → Manufacturing worlds
- **Luxury Goods**: Core worlds → Established colonies

### Planet Specializations
- **Agricon Prime**: Agriculture, basic upgrades (cargo, fuel tank)
- **Mining Station 7**: Industry, structural upgrades (hull, engines)
- **Tech Hub Alpha**: Advanced systems (shields, fusion drives)
- **Frontier Outpost**: High prices, military upgrades
- **Core World Central**: Luxury market, premium upgrades

### Pricing Dynamics
- **Base prices** set by planet type and specialization
- **Future**: Dynamic pricing based on supply/demand simulation
- **Upgrade costs**: Exponential scaling (1.5x per level)

## Event System

### Design Philosophy
- Events as **spatial objects**, not interruptions
- **Player choice** in engagement level
- **Meaningful consequences** tied to player skill/decisions
- **Integration** with existing physics and economic systems

### Event Types
1. **Fuel Depots**: Emergency refueling at premium prices
2. **Derelict Ships**: Salvage opportunities with fuel costs
3. **Asteroid Fields**: Navigation challenges requiring piloting skill
4. **Distress Signals**: Reputation/reward trading for time/fuel

### Implementation Pattern
- Spawn as visible objects in space
- Non-blocking notification of discovery
- Proximity-based interaction (SPACE key)
- Side panel interface for complex choices
- Always include "continue journey" option

## Technical Architecture

### File Structure
/js

game.js (core game state)
physics.js (movement, collision)
render.js (graphics, UI)
trading.js (economic systems)
ui.js (interface management)
/css (styling separated from logic)
/assets (future sprites, sounds)

### Performance Considerations
- Efficient star field rendering (200+ objects per frame)
- Responsive canvas resizing
- Mobile-friendly touch controls (future)
- Modular loading for feature expansion

## Mobile Considerations

### Screen Real Estate
- Minimum viable game area: 400px width
- UI panel max width: 40vw (responsive)
- Touch-friendly button sizes
- Simplified interaction patterns for mobile

### Control Adaptations
- Touch controls for movement (virtual joystick)
- Tap-to-dock for proximity interactions
- Gesture-based navigation (pinch to zoom map)

## Future Feature Roadmap

### Phase 1 (Current Focus)
- ✅ Core trading and upgrades
- ✅ Navigation system
- 🔄 Event system UX improvements
- ⏳ Save/load functionality

### Phase 2 (Expansion)
- Dynamic economy simulation
- Multiple ship types with different roles
- Reputation/faction system
- Contraband and smuggling mechanics

### Phase 3 (Advanced)
- Multiplayer trading (MMO elements)
- Combat system utilizing existing physics
- Procedural universe expansion
- Advanced economic modeling

## Success Metrics
- **Engagement**: Session length and return rate
- **Progression**: Ship upgrade completion rates
- **Economic**: Trade route optimization by players
- **Spatial**: Navigation efficiency improvements over time

## Risk Mitigation
- **Complexity Creep**: Maintain focus on core trading loop
- **UX Consistency**: Document and enforce interaction patterns
- **Performance**: Regular testing with mobile constraints
- **Player Retention**: Ensure early game tutorial/guidance

## Technical Constraints
- No localStorage/sessionStorage in current environment
- Single-file deployment for prototyping
- Browser compatibility (modern ES6+ features)
- Responsive design requirements for multiple screen sizes