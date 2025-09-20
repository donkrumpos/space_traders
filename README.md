# Space Trader

A browser-based space trading game where players navigate the galaxy, trade goods, upgrade ships, and build their trading empire.

## Vision

Create an engaging text-based space trading simulation with:
- Multiple star systems to explore
- Dynamic economy with supply/demand mechanics
- Ship upgrades and customization
- Trading contracts and missions
- Resource management and strategic decision making

## Current Progress

### ✅ Completed
- [x] Modular project structure (HTML/CSS/JS separation)
- [x] Asteroids-style ship movement and physics
- [x] Trading system with 4 goods between 5 planets
- [x] Fuel management and refueling system
- [x] Dynamic side-panel docking interface
- [x] Ship upgrade system with exponential pricing
- [x] All planet specializations with unique upgrades
- [x] Responsive UI with proper state management

### 🚧 In Development
- [ ] Combat mechanics
- [ ] Random events and encounters
- [ ] Mission/contract system

### 📋 Planned Features
- [ ] Save/load functionality
- [ ] Advanced ship customization
- [ ] Faction relationships
- [ ] Multiple star systems
- [ ] Resource scarcity mechanics

## Project Structure

```
space_traders/
├── index.html              # Main game page
├── css/
│   └── style.css           # Game styling
├── js/
│   ├── game.js             # Core game state and initialization
│   ├── physics.js          # Ship movement and physics
│   ├── render.js           # Canvas rendering
│   ├── trading.js          # Trading and upgrade mechanics
│   └── ui.js               # UI updates and display
├── assets/                 # Future sprites and sounds
├── docs/                   # Design docs and notes
└── README.md
```

## Development Notes

The game uses vanilla HTML/CSS/JavaScript with a modular architecture. Each JS file handles a specific game system for maintainability.

## Getting Started

### Quick Start
Simply open `index.html` in your browser to start playing.

### Development Server
For development with proper file loading:
```bash
npm run dev
```
Then visit `http://localhost:8000`

### Controls
- **Arrow Keys**: Rotate ship (left/right) and thrust (up/down)
- **Space**: Dock with nearby planets
- **ESC**: Emergency undock