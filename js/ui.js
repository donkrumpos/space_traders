function flashCredits() {
    const el = document.getElementById('credits');
    if (!el) return;
    el.classList.remove('credits-pulse');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('credits-pulse');
}

const HUD_TOAST_MAX = 4;          // visible at once; oldest evicted beyond this
const HUD_TOAST_COLORS = {
    error:   { bg: '#ff4444', fg: '#ffffff' },
    warning: { bg: '#ffaa00', fg: '#000000' },
    success: { bg: '#00ff00', fg: '#000000' },
    info:    { bg: '#00aaff', fg: '#ffffff' }
};

function showHudFeedback(message, type = 'info', duration = 3000) {
    const stack = document.getElementById('hudToastStack');
    if (!stack) return;

    // Reading-time floor: callers pass durations tuned for glances, but a
    // long mission line needs more screen time than "Cargo full!"
    duration = Math.min(9000, Math.max(duration, 1600 + message.length * 45));

    // Same message already showing → bump a ×N counter and its timer
    // instead of stacking spam (save acks, repeated pickup denials)
    for (const t of stack.children) {
        if (t._message === message && t._type === type) {
            t._count++;
            t.textContent = `${message} ×${t._count}`;
            clearTimeout(t._timer);
            t.classList.remove('fading');
            t._timer = setTimeout(() => hudToastFade(t), duration);
            return;
        }
    }

    const colors = HUD_TOAST_COLORS[type] || HUD_TOAST_COLORS.info;
    const toast = document.createElement('div');
    toast.className = 'hud-toast';
    toast.textContent = message;
    toast.style.backgroundColor = colors.bg;
    toast.style.color = colors.fg;
    toast._message = message;
    toast._type = type;
    toast._count = 1;
    stack.appendChild(toast); // newest at the bottom of the column

    while (stack.children.length > HUD_TOAST_MAX) {
        clearTimeout(stack.firstChild._timer);
        stack.firstChild.remove();
    }

    toast._timer = setTimeout(() => hudToastFade(toast), duration);
}

function hudToastFade(toast) {
    toast.classList.add('fading');
    setTimeout(() => toast.remove(), 400); // matches the CSS transition
}

// ---------------------------------------------------------------------------
// Vitals band — the drawn-ship schematic + numerics strip that replaced the
// Ship Status / Ship Upgrades / Cargo Hold text panels (design:
// docs/ship-design-vision.md §7). Capacity is encoded as FORM (bay cell
// count, shield-envelope thickness, nacelle/nose size, tank width), current
// state as fill/opacity, damage as red on the exact part; the numerics strip
// carries the digits.
//
// updateUI() runs every physics tick, so element refs are cached once and
// every DOM write is guarded by a last-value check; cell/pip geometry
// rebuilds only when the underlying capacity changes.
// ---------------------------------------------------------------------------
const SVG_NS = 'http://www.w3.org/2000/svg';
const vitals = { els: null, last: {}, cargoCells: [], missilePips: [] };

function vitalsEls() {
    if (!vitals.els) {
        vitals.els = {};
        ['pilotRank', 'xpLine', 'credits', 'fuel', 'fuelMax', 'hull', 'hullMax',
         'shieldVal', 'shieldMax', 'cargoUsed', 'cargoMax', 'missiles', 'missilesMax',
         'weaponMode', 'laserHeat', 'streakLine', 'powerupLine', 'systemsLine',
         'cargoManifest', 'posX', 'posY', 'nearbyObjects',
         'svShieldEnv', 'svHullBody', 'svHullDmg', 'svWeaponMount', 'svMissilePips',
         'svEngL', 'svEngR', 'svThrL', 'svThrR', 'svEngLWrap', 'svEngRWrap',
         'svLifeCore', 'svLifeCoreDmg', 'svCargoGrid', 'svFuelTank', 'svFuelFill'
        ].forEach(id => { vitals.els[id] = document.getElementById(id); });
    }
    return vitals.els;
}

// Guarded writes — skip the DOM entirely when the value is unchanged
function vText(key, el, value) { if (vitals.last[key] !== value) { vitals.last[key] = value; el.textContent = value; } }
function vAttr(key, el, attr, value) { if (vitals.last[key] !== value) { vitals.last[key] = value; el.setAttribute(attr, value); } }
function vStyle(key, el, prop, value) { if (vitals.last[key] !== value) { vitals.last[key] = value; el.style[prop] = value; } }
function vClass(key, el, on) { if (vitals.last[key] !== on) { vitals.last[key] = on; el.classList.toggle('schem-flash', on); } }
function vHtml(key, el, html) { if (vitals.last[key] !== html) { vitals.last[key] = html; el.innerHTML = html; } }

// The bay region of the schematic (a slot — the future Ship Bay reuses it).
// The grid inside re-derives its cell count from cargoMax: a bigger hold IS
// more cells, no number needed.
const SCHEM_BAY = { x: 96, y: 112, w: 48, h: 76, gap: 2 };

function rebuildCargoGrid(els, max) {
    const g = els.svCargoGrid;
    while (g.firstChild) g.removeChild(g.firstChild);
    vitals.cargoCells = [];
    const cols = Math.max(2, Math.ceil(Math.sqrt(max * (SCHEM_BAY.w / SCHEM_BAY.h))));
    const rows = Math.max(1, Math.ceil(max / cols));
    const cw = (SCHEM_BAY.w - (cols - 1) * SCHEM_BAY.gap) / cols;
    const ch = (SCHEM_BAY.h - (rows - 1) * SCHEM_BAY.gap) / rows;
    for (let i = 0; i < max; i++) {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', (SCHEM_BAY.x + (i % cols) * (cw + SCHEM_BAY.gap)).toFixed(1));
        rect.setAttribute('y', (SCHEM_BAY.y + Math.floor(i / cols) * (ch + SCHEM_BAY.gap)).toFixed(1));
        rect.setAttribute('width', cw.toFixed(1));
        rect.setAttribute('height', ch.toFixed(1));
        rect.setAttribute('rx', 1.5);
        rect.setAttribute('fill', '#081808');
        rect.setAttribute('stroke', '#063806');
        rect.setAttribute('stroke-width', '1');
        g.appendChild(rect);
        vitals.cargoCells.push(rect);
    }
}

function rebuildMissilePips(els, maxAmmo) {
    const g = els.svMissilePips;
    while (g.firstChild) g.removeChild(g.firstChild);
    vitals.missilePips = [];
    const perRow = 8;
    for (let i = 0; i < maxAmmo; i++) {
        const row = Math.floor(i / perRow);
        const rowCount = Math.min(perRow, maxAmmo - row * perRow);
        const pip = document.createElementNS(SVG_NS, 'circle');
        pip.setAttribute('cx', (120 - (rowCount - 1) * 3 + (i % perRow) * 6).toFixed(0));
        pip.setAttribute('cy', 64 + row * 6);
        pip.setAttribute('r', 2);
        pip.setAttribute('fill', '#333333');
        g.appendChild(pip);
        vitals.missilePips.push(pip);
    }
}

function updateSchematic(els) {
    const ship = game.ship;
    const systems = ship.systems || {};

    // Hull: outline thickness = capacity, color = integrity; the red overlay
    // deepens as integrity drops and flashes when critical
    const hFrac = ship.hullMax > 0 ? Math.max(0, ship.hull) / ship.hullMax : 0;
    vAttr('hullStroke', els.svHullBody, 'stroke',
        hFrac > 0.66 ? '#55cc66' : hFrac > 0.33 ? '#ffaa00' : '#ff4d4d');
    vAttr('hullStrokeW', els.svHullBody, 'stroke-width',
        (2 + Math.min(2.5, Math.max(0, ship.hullMax - 100) / 180)).toFixed(1));
    vAttr('hullDmgOp', els.svHullDmg, 'fill-opacity',
        hFrac > 0.66 ? '0' : (0.12 + (0.66 - hFrac) / 0.66 * 0.35).toFixed(2));
    vClass('hullFlash', els.svHullDmg, hFrac <= 0.33);

    // Shield envelope: base thickness = shieldMax (capacity as form), current
    // charge modulates thickness + opacity; dead shields leave a faint husk
    const sFrac = ship.shieldMax > 0 ? Math.max(0, ship.shield) / ship.shieldMax : 0;
    const envMaxW = 2 + Math.min(4, ship.shieldMax / 30);
    vAttr('shEnvW', els.svShieldEnv, 'stroke-width',
        ship.shield <= 0 ? '1.2' : (0.8 + envMaxW * sFrac).toFixed(1));
    vAttr('shEnvOp', els.svShieldEnv, 'stroke-opacity',
        ship.shield <= 0 ? '0.08' : (0.25 + 0.55 * sFrac).toFixed(2));
    vAttr('shEnvColor', els.svShieldEnv, 'stroke', ship.shield <= 0 ? '#334455' : '#44aaff');

    // Engines: nacelle size = upgrade level; damage turns them red and kills
    // the thruster glow, which otherwise breathes with actual thrust
    const engS = (0.85 + 0.07 * (ship.upgrades.engine || 1)).toFixed(3);
    vAttr('engTL', els.svEngLWrap, 'transform', `translate(78 195) scale(${engS}) translate(-78 -195)`);
    vAttr('engTR', els.svEngRWrap, 'transform', `translate(162 195) scale(${engS}) translate(-162 -195)`);
    const engDown = systems.engines === 'damaged';
    const engStroke = engDown ? '#ff4d4d' : '#00ff00';
    vAttr('engLStroke', els.svEngL, 'stroke', engStroke);
    vAttr('engRStroke', els.svEngR, 'stroke', engStroke);
    vClass('engLFlash', els.svEngL, engDown);
    vClass('engRFlash', els.svEngR, engDown);
    const thr = engDown ? 0.08 : 0.15 + 0.6 * (ship.thrust ? ship.thrust.current : 0);
    vAttr('thrLOp', els.svThrL, 'opacity', thr.toFixed(2));
    vAttr('thrROp', els.svThrR, 'opacity', thr.toFixed(2));

    // Weapons: nose mount size = upgrade level; knocked-out lasers flash red,
    // an overheat glows amber (the numerics strip carries the heat %)
    const wpnS = (0.85 + 0.08 * (ship.upgrades.weapons || 1)).toFixed(3);
    vAttr('wpnT', els.svWeaponMount, 'transform', `translate(120 40) scale(${wpnS}) translate(-120 -40)`);
    const lasersDown = systems.lasers === 'damaged';
    const overheated = !!ship.weapons.lasers.overheated;
    vAttr('wpnStroke', els.svWeaponMount, 'stroke',
        lasersDown ? '#ff4d4d' : overheated ? '#ffaa00' : '#00ff00');
    vAttr('wpnFill', els.svWeaponMount, 'fill',
        lasersDown ? '#3a0a0a' : overheated ? '#3a2a0a' : '#06210f');
    vClass('wpnFlash', els.svWeaponMount, lasersDown || overheated);

    // Missile pips: rack size = pip count, spent tubes go dark
    const missiles = ship.weapons.missiles;
    if (vitals.last.pipMax !== missiles.maxAmmo) {
        vitals.last.pipMax = missiles.maxAmmo;
        rebuildMissilePips(els, missiles.maxAmmo);
        vitals.last.pipAmmo = -1;
    }
    if (vitals.last.pipAmmo !== missiles.ammo) {
        vitals.last.pipAmmo = missiles.ammo;
        vitals.missilePips.forEach((pip, i) =>
            pip.setAttribute('fill', i < missiles.ammo ? '#ffdd44' : '#333333'));
    }

    // Life support core
    const lifeDown = systems.lifeSupport === 'damaged';
    vAttr('lifeStroke', els.svLifeCore, 'stroke', lifeDown ? '#ff4d4d' : '#00ffff');
    vAttr('lifeDmgOp', els.svLifeCoreDmg, 'fill-opacity', lifeDown ? '0.5' : '0');
    vClass('lifeFlash', els.svLifeCoreDmg, lifeDown);

    // Cargo bay: the grid IS the capacity; cells fill in the hold's own
    // good-colors (relics violet, ore orange...) so the bay tells the story
    if (vitals.last.bayMax !== ship.cargoMax) {
        vitals.last.bayMax = ship.cargoMax;
        rebuildCargoGrid(els, ship.cargoMax);
        vitals.last.baySig = null;
    }
    const baySig = Object.keys(ship.cargo).map(k => k + ':' + ship.cargo[k]).join(',');
    if (vitals.last.baySig !== baySig) {
        vitals.last.baySig = baySig;
        const cellColors = [];
        Object.keys(goods).forEach(type => {
            const n = ship.cargo[type] || 0;
            for (let i = 0; i < n; i++) cellColors.push(goods[type].color);
        });
        vitals.cargoCells.forEach((cell, i) => {
            if (i < cellColors.length) {
                cell.setAttribute('fill', cellColors[i]);
                cell.setAttribute('fill-opacity', '0.8');
                cell.setAttribute('stroke', '#0a5a0a');
            } else {
                cell.setAttribute('fill', '#081808');
                cell.setAttribute('fill-opacity', '1');
                cell.setAttribute('stroke', '#063806');
            }
        });
        // Compact manifest under the numerics strip (what, not just how much)
        const manifest = Object.keys(goods)
            .filter(type => (ship.cargo[type] || 0) > 0)
            .map(type => `<span style="color:${goods[type].color}">■</span> ${ship.cargo[type]} ${goods[type].name}`)
            .join(' · ');
        vHtml('manifest', els.cargoManifest, manifest);
    }

    // Fuel tank: width = tank capacity, fill height = what's left in it
    const tankW = 12 + Math.min(9, Math.max(0, ship.fuelMax - 500) / 200);
    const tankX = 120 - tankW / 2;
    vAttr('tankW', els.svFuelTank, 'width', tankW.toFixed(1));
    vAttr('tankX', els.svFuelTank, 'x', tankX.toFixed(1));
    const fFrac = ship.fuelMax > 0 ? Math.max(0, ship.fuel) / ship.fuelMax : 0;
    const fillH = 52 * fFrac;
    vAttr('fuelY', els.svFuelFill, 'y', (196 + 52 - fillH).toFixed(1));
    vAttr('fuelH', els.svFuelFill, 'height', fillH.toFixed(1));
    vAttr('fuelW', els.svFuelFill, 'width', tankW.toFixed(1));
    vAttr('fuelX', els.svFuelFill, 'x', tankX.toFixed(1));
    vAttr('fuelColor', els.svFuelFill, 'fill',
        fFrac < 0.1 ? '#ff4d4d' : fFrac < 0.25 ? '#ffaa00' : '#d9902a');
}

function updateUI() {
    const els = vitalsEls();
    const ship = game.ship;

    // Pilot rank + XP toward next promotion
    const pilot = game.pilot;
    if (pilot && els.pilotRank) {
        const rank = PILOT_RANKS[pilot.rank];
        const next = PILOT_RANKS[pilot.rank + 1];
        vText('rank', els.pilotRank, `${rank.icon} ${rank.title}`);
        vText('xp', els.xpLine, next
            ? `XP ${pilot.xp} / ${next.xp}`
            : `XP ${pilot.xp} — highest rank`);
    }

    vText('credits', els.credits, ship.credits);
    const isEmergencyMode = ship.fuel <= 0 && ship.emergencyFuel > 0;

    if (ship.fuel <= 0 && ship.emergencyFuel <= 0) {
        vText('fuel', els.fuel, '0 (SAIL)'); // solar-sail crawl
        vStyle('fuelC', els.fuel, 'color', '#88ddff');
    } else if (isEmergencyMode) {
        vText('fuel', els.fuel, `0 (E:${Math.floor(ship.emergencyFuel)})`);
        vStyle('fuelC', els.fuel, 'color', '#ff8800'); // Orange for emergency
    } else {
        vText('fuel', els.fuel, Math.floor(ship.fuel));
        vStyle('fuelC', els.fuel, 'color', ship.fuel < 50 ? '#ffaa00' : '#ffffff'); // Yellow warning when low
    }
    vText('fuelMax', els.fuelMax, ship.fuelMax);
    vText('hull', els.hull, Math.floor(ship.hull));
    vText('hullMax', els.hullMax, ship.hullMax);

    vText('shield', els.shieldVal, Math.floor(ship.shield));
    vStyle('shieldC', els.shieldVal, 'color', ship.shield <= 0 ? '#666666'
        : ship.shield < ship.shieldMax ? '#88ccff' : '#44aaff');
    vText('shieldMax', els.shieldMax, ship.shieldMax);

    const cargoUsed = Object.values(ship.cargo).reduce((a, b) => a + b, 0);
    vText('cargoUsed', els.cargoUsed, cargoUsed);
    vText('cargoMax', els.cargoMax, ship.cargoMax);

    vText('missiles', els.missiles, ship.weapons.missiles.ammo);
    vText('missilesMax', els.missilesMax, ship.weapons.missiles.maxAmmo);

    // Weapon system + laser heat
    const lasers = ship.weapons.lasers;
    const modeSpec = (typeof LASER_MODES !== 'undefined' && LASER_MODES[lasers.mode]) || { label: 'Single' };
    const modeLevel = typeof getLaserLevel === 'function' ? getLaserLevel(lasers.mode) : 1;
    vText('wpnMode', els.weaponMode, modeSpec.label + (modeLevel > 1 ? ` Lv${modeLevel}` : ''));
    const heat = Math.round(lasers.heat || 0);
    if (lasers.overheated) {
        vText('heat', els.laserHeat, '· OVERHEATED');
        vStyle('heatC', els.laserHeat, 'color', '#ff4444');
    } else if (heat > 0) {
        vText('heat', els.laserHeat, `· heat ${heat}%`);
        vStyle('heatC', els.laserHeat, 'color', heat > 75 ? '#ff8844' : heat > 40 ? '#ffcc44' : '#888888');
    } else {
        vText('heat', els.laserHeat, '');
    }

    // The drawn ship carries everything above as form/damage state
    updateSchematic(els);

    // Bounty streak indicator (only shown mid-streak)
    const streak = game.combatStreak || 0;
    if (streak > 1) {
        const mult = Math.min(1 + 0.25 * (streak - 1), 3);
        vStyle('streakD', els.streakLine, 'display', 'block');
        vText('streak', els.streakLine, `Bounty streak ×${mult.toFixed(2).replace(/0$/, '')} (${streak} kills)`);
    } else {
        vStyle('streakD', els.streakLine, 'display', 'none');
    }

    // Knocked-out subsystem hint — the schematic flashes WHERE, this line
    // says what to do about it
    const systems = ship.systems || {};
    const down = Object.keys(systems).filter(s => systems[s] === 'damaged');
    if (down.length > 0) {
        const labels = { lifeSupport: 'LIFE SUPPORT', engines: 'ENGINES', lasers: 'LASERS' };
        const kits = ship.cargo.parts || 0;
        vStyle('sysD', els.systemsLine, 'display', 'block');
        vText('sys', els.systemsLine, `✖ ${down.map(s => labels[s]).join(' · ')} — R to repair (kits: ${kits})`);
    } else {
        vStyle('sysD', els.systemsLine, 'display', 'none');
    }

    // Active powerup countdown
    if (game.powerup) {
        const pwSpec = POWERUPS[game.powerup.type];
        vStyle('pwD', els.powerupLine, 'display', 'block');
        vStyle('pwC', els.powerupLine, 'color', pwSpec.color);
        vText('pw', els.powerupLine, `⚡ ${pwSpec.name} ${Math.ceil(game.powerup.timeLeft)}s`);
    } else {
        vStyle('pwD', els.powerupLine, 'display', 'none');
    }

    vText('posX', els.posX, Math.floor(ship.x));
    vText('posY', els.posY, Math.floor(ship.y));

    // Nearby-objects panel: composed as one string, written only on change
    let html = '';

    // Emergency mode warning (highest priority)
    if (isEmergencyMode) {
        html += `<div style="color: #ff4444; font-weight: bold; text-align: center; margin-bottom: 10px;">⚠️ EMERGENCY POWER ⚠️</div>`;
        html += `<div style="color: #ff8800; text-align: center; margin-bottom: 10px;">Weak thrust only - find fuel immediately!</div>`;
    }

    // Check for active engagement first
    if (game.isEngaged) {
        html += `<div style="color: #ffaa00; font-weight: bold;">ENGAGED with ${game.currentEvent.name}</div>`;
        html += `<div style="color: #ffff00;">Use side panel for choices | ESC or movement keys to disengage</div>`;
    } else if (game.isDocked) {
        html += `<div style="color: #00ffff; font-weight: bold;">DOCKED at ${game.currentPlanet.name}</div>`;
        html += `<div style="color: #ffff00;">Press ESC or movement keys for emergency undock</div>`;
    } else if (game.inDockingRange && game.nearPlanet) {
        // Priority 1: Planet docking (highest priority)
        html += `<div style="color: #00ff00; font-weight: bold;">DOCKING RANGE</div>`;
        html += `<div style="color: #ffff00;">Press SPACE to dock with ${game.nearPlanet.name}</div>`;

        // Show event as secondary option if present
        if (typeof eventSystem !== 'undefined' && eventSystem.inEventRange && eventSystem.nearEvent) {
            const event = eventSystem.nearEvent;
            html += `<div style="color: #888888; font-size: 10px; margin-top: 5px;">Also nearby: ${event.name}</div>`;
            html += `<div style="color: #ffaa88; font-size: 10px;">Press E to ${event.interactionText}</div>`;
        }
    } else if (typeof eventSystem !== 'undefined' && eventSystem.inEventRange && eventSystem.nearEvent) {
        // Priority 2: Event interaction (only when no planet docking available)
        const event = eventSystem.nearEvent;
        html += `<div style="color: #ffaa00; font-weight: bold;">EVENT DETECTED</div>`;
        html += `<div style="color: #ffff00;">Press SPACE to ${event.interactionText}</div>`;
        html += `<div style="color: #cccccc; font-size: 10px;">${event.description}</div>`;
        if (event.fuelCost > 0) {
            const canAfford = ship.fuel >= event.fuelCost;
            const color = canAfford ? '#88ff88' : '#ff8888';
            html += `<div style="color: ${color};">Fuel cost: ${event.fuelCost}</div>`;
        }
    } else {
        // Show nearest planet information
        const nearest = getDistanceToNearest();
        if (nearest.planet) {
            const distance = Math.floor(nearest.distance);
            const dx = nearest.planet.x - ship.x;
            const dy = nearest.planet.y - ship.y;
            const angle = Math.atan2(dy, dx);

            // Convert angle to compass direction
            let direction = '';
            const degrees = (angle * 180 / Math.PI + 360) % 360;
            if (degrees >= 337.5 || degrees < 22.5) direction = 'E';
            else if (degrees >= 22.5 && degrees < 67.5) direction = 'SE';
            else if (degrees >= 67.5 && degrees < 112.5) direction = 'S';
            else if (degrees >= 112.5 && degrees < 157.5) direction = 'SW';
            else if (degrees >= 157.5 && degrees < 202.5) direction = 'W';
            else if (degrees >= 202.5 && degrees < 247.5) direction = 'NW';
            else if (degrees >= 247.5 && degrees < 292.5) direction = 'N';
            else direction = 'NE';

            html += `<div style="color: #00ffff;">Nearest: ${nearest.planet.name}</div>`;
            html += `<div style="color: #888888;">Distance: ${distance} units ${direction}</div>`;
        }

        // Show nearby planets within 200 units
        let nearbyCount = 0;
        game.planets.forEach(planet => {
            const distance = Math.sqrt(
                Math.pow(ship.x - planet.x, 2) +
                Math.pow(ship.y - planet.y, 2)
            );

            if (distance < 200 && planet !== nearest.planet) {
                if (nearbyCount === 0) {
                    html += `<div style="color: #666666; margin-top: 5px;">Also nearby:</div>`;
                }
                html += `<div style="color: #666666;">${planet.name} (${Math.floor(distance)})</div>`;
                nearbyCount++;
            }
        });

        // Event system status
        if (typeof eventSystem !== 'undefined') {
            const distanceToNextEvent = eventSystem.eventTriggerDistance - eventSystem.travelDistance;
            if (distanceToNextEvent < 100 && distanceToNextEvent > 0) {
                html += `<div style="color: #ffaa00; margin-top: 5px;">🌟 Event imminent</div>`;
            } else if (eventSystem.eventCooldown > 0) {
                html += `<div style="color: #666666; margin-top: 2px;">Event cooldown: ${Math.ceil(eventSystem.eventCooldown/60)}s</div>`;
            }
        }

        // Navigation hint
        html += `<div style="color: #444444; margin-top: 5px;">Press M for map</div>`;
    }

    vHtml('nearby', els.nearbyObjects, html);
}
// ---------------------------------------------------------------------------
// Records tabs — the reference panels (Ship / Missions / Crew / Rep / Log /
// Ledger) collapsed to one tabbed area, one page visible at a time (UI Slice
// 2, mockups/sidebar-redesign.html ★ Contextual Hybrid).
//
// Two visibility layers, deliberately separate:
//   - each page's inline style.display stays "this record has content", set
//     by that panel's own update function (verify.js asserts on it, and the
//     tab row derives which tabs exist from it — a fresh Cadet sees three
//     tabs, not six);
//   - the .rec-on class is "this is the selected tab", layered on in CSS.
// Hiding a panel must never hide news, so tabs carry attention cues: active
// mission count, held-grudge count, and the Galaxy Log's unseen count (which
// clears when you actually look at the log).
//
// Event-driven (called from the panels' update functions, not per-frame),
// but keeps the vitals pattern anyway: cached refs + last-value guards.
// ---------------------------------------------------------------------------
const RECORDS_TAB_KEY = 'space_trader_records_tab';
const RECORDS_PAGE_IDS = {
    ship: 'shipPanel', missions: 'missionsPanel', crew: 'crewPanel',
    rep: 'factionPanel', log: 'chroniclePanel', ledger: 'ledgerPanel'
};
const records = { els: null, selected: null, userChose: false, logViewedAt: 0, last: {} };

function recordsEls() {
    if (!records.els) {
        records.els = { tabs: {}, badges: {}, pages: {} };
        Object.keys(RECORDS_PAGE_IDS).forEach(key => {
            records.els.tabs[key] = document.getElementById('recTab-' + key);
            records.els.badges[key] = document.getElementById('recBadge-' + key);
            records.els.pages[key] = document.getElementById(RECORDS_PAGE_IDS[key]);
        });
    }
    return records.els;
}

// Conditional records reuse the page's inline display as the "has content"
// signal; Ship / Missions / Ledger always earn a tab
function recordsTabAvailable(key, els) {
    if (key === 'crew' || key === 'rep' || key === 'log') {
        return els.pages[key] && els.pages[key].style.display !== 'none';
    }
    return true;
}

function recordsDefaultTab() {
    const active = typeof game !== 'undefined' && game.missions && game.missions.length > 0;
    return active ? 'missions' : 'ship';
}

function recordsBadgeCounts() {
    const counts = { missions: 0, rep: 0, log: 0 };
    if (typeof game !== 'undefined' && game.missions) counts.missions = game.missions.length;
    if (typeof game !== 'undefined' && game.pilot && game.pilot.grudges) {
        counts.rep = Object.keys(game.pilot.grudges).filter(n => game.pilot.grudges[n] > 0).length;
    }
    if (typeof chronicleUnseen === 'function') {
        counts.log = chronicleUnseen().filter(e => e.at > records.logViewedAt).length;
    }
    return counts;
}

function selectRecordsTab(key, byUser = true) {
    const els = recordsEls();
    if (!els.pages[key] || !recordsTabAvailable(key, els)) return;
    records.selected = key;
    if (byUser) {
        records.userChose = true;
        try { localStorage.setItem(RECORDS_TAB_KEY, key); } catch (e) { /* private mode */ }
    }
    if (key === 'log') {
        // Looking at the log is what clears its unseen badge
        const entries = (typeof chronicle !== 'undefined' && chronicle.entries) || [];
        if (entries.length > 0) records.logViewedAt = entries[entries.length - 1].at;
    }
    updateRecordsTabs();
}
window.selectRecordsTab = selectRecordsTab;

function updateRecordsTabs() {
    const els = recordsEls();
    if (!els.tabs.ship) return;

    if (records.selected === null) {
        // First call: last session's tab if the player ever picked one,
        // else the sensible default (Missions when any active, else Ship)
        let stored = null;
        try { stored = localStorage.getItem(RECORDS_TAB_KEY); } catch (e) { /* private mode */ }
        if (stored && els.pages[stored]) {
            records.selected = stored;
            records.userChose = true;
        } else {
            records.selected = recordsDefaultTab();
        }
    }

    // Until the player picks a tab themselves, follow the default rule — a
    // restored character's missions land after boot, so Ship upgrades to
    // Missions once contracts exist. A vanished tab (rep with grudges
    // cleared, stored tab whose record is empty this session) falls back too.
    if (!records.userChose || !recordsTabAvailable(records.selected, els)) {
        records.selected = recordsDefaultTab();
    }

    const counts = recordsBadgeCounts();
    Object.keys(els.tabs).forEach(key => {
        const tab = els.tabs[key];
        if (!tab) return;
        const avail = recordsTabAvailable(key, els);
        const tabDisplay = avail ? 'block' : 'none';
        if (records.last['tab_' + key] !== tabDisplay) {
            records.last['tab_' + key] = tabDisplay;
            tab.style.display = tabDisplay;
        }
        const on = avail && records.selected === key;
        if (records.last['on_' + key] !== on) {
            records.last['on_' + key] = on;
            tab.classList.toggle('on', on);
            els.pages[key].classList.toggle('rec-on', on);
        }
        const badge = els.badges[key];
        if (badge) {
            const text = counts[key] > 0 ? String(counts[key]) : '';
            if (records.last['badge_' + key] !== text) {
                records.last['badge_' + key] = text;
                badge.textContent = text;
                badge.style.display = text ? 'inline-block' : 'none';
            }
        }
    });
}

// One page must be selected from the first frame, saved character or not
// (scripts sit at the end of body, so the markup exists at eval time)
updateRecordsTabs();
