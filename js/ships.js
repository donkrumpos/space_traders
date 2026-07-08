// The hull ladder: buyable ships. The hull is the ship's body — it sets the
// physical truths (bunks, hold size, how far each upgrade track can go) that
// credits and upgrades grow within. Buying a new hull is THE progression
// moment, and naming it is what makes the ship a character instead of a stat
// sheet. Everyone starts in a one-seater, dreaming at shipyard windows.

const HULLS = {
    skiff: {
        name: 'Sparrow Skiff', class: 'one-seater',
        blurb: 'A cockpit, an engine, and hope. Everyone starts somewhere.',
        price: 2500, berths: 0,
        baseCargo: 10, baseFuel: 500, baseHull: 100,
        maxSpeed: 8, agility: 1.0,
        caps: { cargo: 3, engine: 2, shields: 2, fuel_tank: 2, hull: 2, weapons: 2 }
    },
    courier: {
        name: 'Magpie Courier', class: 'two-seater',
        blurb: 'A quick little packet-runner with a spare bunk behind the cockpit.',
        price: 6000, berths: 1,
        baseCargo: 16, baseFuel: 700, baseHull: 140,
        maxSpeed: 8.5, agility: 1.1,
        caps: { cargo: 5, engine: 4, shields: 3, fuel_tank: 4, hull: 3, weapons: 3 }
    },
    freighter: {
        name: 'Pelican Freighter', class: 'hauler',
        blurb: 'A flying warehouse. Slow, stubborn, and it pays for itself.',
        price: 18000, berths: 2,
        baseCargo: 40, baseFuel: 900, baseHull: 220,
        maxSpeed: 6.5, agility: 0.8,
        caps: { cargo: 9, engine: 3, shields: 4, fuel_tank: 6, hull: 5, weapons: 3 }
    },
    gunship: {
        name: 'Kestrel Gunship', class: 'warbird',
        blurb: 'Twin spinal mounts and a temper. Raiders know the silhouette.',
        price: 24000, berths: 2,
        baseCargo: 14, baseFuel: 800, baseHull: 260,
        maxSpeed: 9, agility: 1.25,
        caps: { cargo: 4, engine: 5, shields: 5, fuel_tank: 4, hull: 6, weapons: 6 }
    },
    clipper: {
        name: 'Albatross Clipper', class: 'legend',
        blurb: 'The ship they paint on station walls. Room for a real crew.',
        price: 60000, berths: 3,
        baseCargo: 30, baseFuel: 1200, baseHull: 300,
        maxSpeed: 9, agility: 1.1,
        caps: { cargo: 8, engine: 6, shields: 6, fuel_tank: 6, hull: 6, weapons: 6 }
    }
};

const HULL_ORDER = ['skiff', 'courier', 'freighter', 'gunship', 'clipper'];

// --- Named mods: used parts with a past. Each is one-of-a-kind, bought at a
// station mechanic's bench, and most carry a quirk alongside the gift — the
// Falcon layer. Two ships with the same hull diverge here. Flat stats flow
// through recomputeShipStats(); rate effects are read live at their call
// sites via hasMod(), same pattern as perks.

const MODS = {
    vex_compressor: {
        name: 'Vex-Pattern Compressor', cost: 1800, flat: { cargo: 6 },
        blurb: '+6 cargo. Salvaged Vexworks lattice — runs the lasers 10% hotter.'
    },
    smugglers_deck: {
        name: "Smuggler's False Deck", cost: 2600, flat: { cargo: 4 },
        blurb: '+4 cargo in a hold customs scanners somehow never find.'
    },
    barnacle_plating: {
        name: 'Barnacle-Hide Plating', cost: 2200, flat: { hull: 40 },
        blurb: '+40 hull. Grown, not forged. Sheds half a point of top speed.'
    },
    saint_capacitor: {
        name: "Saint Elmo's Capacitor", cost: 2400, flat: { shield: 15 },
        blurb: '+15 shields. Hums a hymn when it charges.'
    },
    whisper_coil: {
        name: 'Whisperdrive Coil', cost: 2000,
        blurb: 'Burns 10% less fuel. Its hum scrambles the minimap a touch.'
    },
    grinner_bore: {
        name: "Old Grinner's Cannon Bore", cost: 3200,
        blurb: "Lasers hit 15% harder and run 15% hotter. Grinner doesn't need it anymore."
    },
    tuned_injectors: {
        name: 'Back-Alley Injectors', cost: 1500,
        blurb: 'Throttle answers 25% faster. Definitely not factory settings.'
    },
    songbird_antenna: {
        name: 'Songbird Array', cost: 2600,
        blurb: 'Contracts pay 10% more — dispatchers like a clear channel.'
    }
};

function hasMod(id) {
    return !!(game.ship.mods && game.ship.mods.includes(id));
}

function modFlat(stat) {
    return (game.ship.mods || []).reduce((sum, id) => {
        const mod = MODS[id];
        return sum + ((mod && mod.flat && mod.flat[stat]) || 0);
    }, 0);
}

function modHeatFactor() {
    return (hasMod('vex_compressor') ? 1.1 : 1) * (hasMod('grinner_bore') ? 1.15 : 1);
}

function modDamageFactor() {
    return hasMod('grinner_bore') ? 1.15 : 1;
}

function modFuelFactor() {
    return hasMod('whisper_coil') ? 0.9 : 1;
}

// Customs at lawful ports can only fine what they can see
function customsRisk(planet) {
    return !planet.lawless && !hasMod('smugglers_deck') && (game.ship.cargo.contraband || 0) > 0;
}

// What's on the mechanic's bench this docking (0-2 unowned parts)
function generateModOffers(planet) {
    planet.modOffers = [];
    const pool = Object.keys(MODS).filter(id => !hasMod(id));
    if (pool.length === 0 || Math.random() > 0.45) return;
    const count = 1 + (Math.random() < 0.25 ? 1 : 0);
    for (let i = 0; i < count && pool.length > 0; i++) {
        planet.modOffers.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
}

function updateModsUI(planet) {
    const el = document.getElementById('modsSection');
    if (!el || !planet) return;
    const offers = (planet.modOffers || []).filter(id => !hasMod(id));
    if (offers.length === 0) {
        el.innerHTML = '<div style="color:#666;">The bench is bare — parts drift in with the freighters</div>';
        return;
    }
    el.innerHTML = offers.map(id => {
        const mod = MODS[id];
        return `<div class="trade-item">
            <span><span style="color:#88ffee;">⬡ ${mod.name}</span><br>
                <small style="color:#888;">${mod.blurb}</small></span>
            <span>$${mod.cost}</span>
            <button onclick="installMod('${id}')" ${game.ship.credits < mod.cost ? 'disabled' : ''}>Install</button>
        </div>`;
    }).join('');
}

function installMod(id) {
    const mod = MODS[id];
    if (!mod || hasMod(id)) return;
    if (game.ship.credits < mod.cost) {
        showHudFeedback(`Insufficient credits! The ${mod.name} runs $${mod.cost}.`, 'error');
        return;
    }
    game.ship.credits -= mod.cost;
    if (!game.ship.mods) game.ship.mods = [];
    game.ship.mods.push(id);
    recomputeShipStats();
    applyMapRange(); // the whisperdrive coil scrambles the minimap

    const where = game.currentPlanet ? ` at ${game.currentPlanet.name}` : '';
    addShipLog(`Bolted on the ${mod.name}${where}.`);
    showHudFeedback(`${mod.name} installed — ${mod.blurb}`, 'success', 4500);
    playPickupSound();

    updateUI();
    updateShipPanelUI();
    if (game.currentPlanet) updateModsUI(game.currentPlanet);
    autoSave('upgrade');
}
window.installMod = installMod;

function currentHull() {
    return HULLS[game.ship.hullId] || HULLS.skiff;
}

function hullCap(upgradeType) {
    return currentHull().caps[upgradeType] || 99;
}

function tradeInValue(hullId) {
    return Math.round((HULLS[hullId] || HULLS.skiff).price * 0.6);
}

// Mods stack on top; the barnacle plating trade-off lives here too
function shipMaxSpeed() {
    return currentHull().maxSpeed + (hasMod('barnacle_plating') ? -0.5 : 0);
}

function cargoMaxFor(hullId) {
    const hull = HULLS[hullId] || HULLS.skiff;
    return hull.baseCargo + (game.ship.upgrades.cargo - 1) * 5
        + (hasPerk('packrat') ? 3 : 0) + modFlat('cargo');
}

// Single source of truth for every derived ceiling: hull base + upgrade
// levels + perks + mods. Reproduces the legacy formulas exactly on a skiff,
// so old saves recompute to the numbers they already had.
function recomputeShipStats() {
    const ship = game.ship;
    const hull = currentHull();
    const up = ship.upgrades;

    ship.cargoMax = cargoMaxFor(ship.hullId);
    ship.fuelMax = hull.baseFuel + (up.fuel_tank - 1) * 200;
    ship.emergencyFuelMax = Math.max(25, Math.floor(ship.fuelMax * 0.05));
    ship.hullMax = hull.baseHull + (up.hull - 1) * 50 + modFlat('hull');
    ship.shieldMax = 20 * up.shields + (hasPerk('deflector_tuning') ? 10 : 0) + modFlat('shield');
    ship.weapons.missiles.maxAmmo = 5 + (up.weapons - 1) * 3 + (hasPerk('missile_racks') ? 3 : 0);

    // Currents never exceed the recomputed ceilings
    ship.fuel = Math.min(ship.fuel, ship.fuelMax);
    ship.emergencyFuel = Math.min(ship.emergencyFuel, ship.emergencyFuelMax);
    ship.hull = Math.min(ship.hull, ship.hullMax);
    ship.shield = Math.min(ship.shield, ship.shieldMax);
    ship.weapons.missiles.ammo = Math.min(ship.weapons.missiles.ammo, ship.weapons.missiles.maxAmmo);
}

// Legacy saves predate hulls: commission the ship they've already been flying.
// Smallest hull that fits their upgrade levels AND houses their crew; a save
// that outgrew even the ladder is grandfathered into the clipper unclamped.
function assignLegacyHull(upgrades, crewCount) {
    for (const id of HULL_ORDER) {
        const hull = HULLS[id];
        const fitsLevels = Object.keys(hull.caps).every(k => (upgrades[k] || 1) <= hull.caps[k]);
        if (fitsLevels && crewCount <= hull.berths) return id;
    }
    return 'clipper';
}

// --- The ship's log: where the character accumulates ---

function addShipLog(text) {
    if (!game.ship.log) game.ship.log = [];
    game.ship.log.push({ t: Date.now(), text });
    if (game.ship.log.length > 40) game.ship.log.shift();
    updateShipPanelUI();
}

// --- Shipyard ---

function stockedAt(hullId) {
    return game.planets.filter(p => (p.shipyard || []).includes(hullId)).map(p => p.name);
}

function speedWord(hull) {
    return hull.maxSpeed >= 9 ? 'fast' : hull.maxSpeed >= 8 ? 'quick' : 'slow';
}

// The full catalog shows everywhere a yard exists — including the hulls you
// can't afford and the ones sold elsewhere. The dreaming is the point.
function updateShipyardUI(planet) {
    const el = document.getElementById('shipyardSection');
    if (!el || !planet) return;
    const stock = planet.shipyard || [];
    if (stock.length === 0) {
        el.innerHTML = '<div style="color:#666;">No shipyard at this port</div>';
        return;
    }

    el.innerHTML = HULL_ORDER.map(id => {
        const hull = HULLS[id];
        const stats = `⬡ ${hull.berths} berth${hull.berths === 1 ? '' : 's'} · ${hull.baseCargo} hold · ${speedWord(hull)}`;
        const label = `<span style="color:#66ccff;">${hull.name}</span> · ${hull.class}<br>
            <small style="color:#888;">${hull.blurb}<br>${stats}</small>`;

        if (id === game.ship.hullId) {
            return `<div class="trade-item"><span>${label}</span>
                <span style="color:#66ffcc;">YOUR SHIP</span></div>`;
        }
        if (!stock.includes(id)) {
            const where = stockedAt(id);
            return `<div class="trade-item"><span>${label}</span>
                <span style="color:#556655; font-size:11px;">${where.length ? 'sold at ' + where.join(', ') : 'not sold anywhere'}</span></div>`;
        }

        const net = hull.price - tradeInValue(game.ship.hullId);
        const cargoUsed = Object.values(game.ship.cargo).reduce((a, b) => a + b, 0);
        const crewCount = (game.pilot && game.pilot.crew || []).length;
        let blocker = '';
        if (cargoUsed > cargoMaxFor(id)) blocker = 'hold too small — sell cargo first';
        else if (crewCount > hull.berths) blocker = 'not enough bunks — dismiss crew first';
        const canBuy = !blocker && game.ship.credits >= net;
        return `<div class="trade-item">
            <span>${label}${blocker ? `<br><small style="color:#cc8866;">${blocker}</small>` : ''}</span>
            <span>$${net}<br><small style="color:#666;">after trade-in</small></span>
            <button onclick="buyHull('${id}')" ${canBuy ? '' : 'disabled'}>Buy</button>
        </div>`;
    }).join('');
}

function buyHull(hullId) {
    const target = HULLS[hullId];
    const ship = game.ship;
    if (!target || hullId === ship.hullId) return;

    const net = target.price - tradeInValue(ship.hullId);
    if (ship.credits < net) {
        showHudFeedback(`Insufficient credits! The ${target.name} runs $${net} after trade-in.`, 'error');
        return;
    }
    const cargoUsed = Object.values(ship.cargo).reduce((a, b) => a + b, 0);
    if (cargoUsed > cargoMaxFor(hullId)) {
        showHudFeedback(`The ${target.name}'s hold won't fit your cargo — sell some first`, 'error');
        return;
    }
    const crewCount = (game.pilot && game.pilot.crew || []).length;
    if (crewCount > target.berths) {
        showHudFeedback(`The ${target.name} has ${target.berths} bunk${target.berths === 1 ? '' : 's'} — dismiss crew first`, 'error');
        return;
    }

    const old = currentHull();
    ship.credits -= net; // A downgrade nets you the difference
    ship.hullId = hullId;
    recomputeShipStats();
    // A new ship leaves the yard ready: full hull, shields, and tank
    ship.hull = ship.hullMax;
    ship.shield = ship.shieldMax;
    ship.fuel = ship.fuelMax;
    ship.emergencyFuel = ship.emergencyFuelMax;

    const where = game.currentPlanet ? ` at ${game.currentPlanet.name}` : '';
    addShipLog(`Traded the ${old.name} for a ${target.name}${where}.`);
    playBountySound();
    showShipNaming(true);

    updateUI();
    updateShipPanelUI();
    updateCrewPanelUI();
    if (game.currentPlanet) {
        updateShipyardUI(game.currentPlanet);
        updateUpgradesUI(game.currentPlanet);
        updateCrewSectionUI(game.currentPlanet);
    }
    autoSave('shipyard');
}
window.buyHull = buyHull;

// --- Christening: the naming is what turns a hull into HER ---

const SHIP_NAME_POOL = [
    'Lucky Penny', 'Star Wren', 'Rust Bucket', 'Long Shot', 'Night Heron',
    'Tin Comet', 'Second Chance', 'Old Growler', 'Dandelion', 'Firefly',
    'Marigold', 'Bent Arrow'
];

function showShipNaming(isNewBoat) {
    if (location.search.includes('verify')) return; // harness names ships directly
    if (document.getElementById('shipNamingOverlay')) return;

    game.paused = true;
    const picks = [...SHIP_NAME_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
    const hull = currentHull();

    const overlay = document.createElement('div');
    overlay.id = 'shipNamingOverlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.82); z-index: 2002;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        font-family: 'Courier New', monospace;
    `;
    overlay.innerHTML = `
        <div style="color: #66ccff; font-size: 14px; letter-spacing: 4px;">
            ${isNewBoat ? 'CHRISTEN YOUR NEW SHIP' : 'EVERY SHIP HAS A NAME'}
        </div>
        <div style="color: #889988; font-size: 12px; margin-top: 8px;">${hull.name} · ${hull.class}</div>
        <input id="shipNameInput" maxlength="20" value="${picks[0]}"
            onkeydown="event.stopPropagation(); if (event.key === 'Enter') confirmShipName();"
            onkeyup="event.stopPropagation();"
            style="margin-top: 18px; background: #050a08; border: 2px solid #66ccff; color: #ffffff;
                   font-family: 'Courier New', monospace; font-size: 18px; text-align: center;
                   padding: 10px 16px; width: 260px;">
        <div style="display: flex; gap: 10px; margin-top: 14px;">
            ${picks.map(n => `<button onclick="document.getElementById('shipNameInput').value='${n}'"
                style="background: #0a1410; border: 1px solid #335544; color: #88aa99; cursor: pointer;
                       font-family: 'Courier New', monospace; padding: 6px 10px;">${n}</button>`).join('')}
        </div>
        <button onclick="confirmShipName()"
            style="margin-top: 20px; background: #66ccff; border: none; color: #000000; cursor: pointer;
                   font-family: 'Courier New', monospace; font-size: 14px; padding: 10px 30px;
                   letter-spacing: 2px;">LAUNCH</button>
    `;
    document.body.appendChild(overlay);
    const input = document.getElementById('shipNameInput');
    input.focus();
    input.select();
}

function confirmShipName() {
    const input = document.getElementById('shipNameInput');
    const name = (input && input.value.trim()) || SHIP_NAME_POOL[0];
    nameShip(name);

    const overlay = document.getElementById('shipNamingOverlay');
    if (overlay) overlay.remove();
    game.paused = false;
    showShipBanner(name, currentHull().name);
    maybeShowPerkChoice(); // a queued training choice may be waiting behind the christening
}
window.confirmShipName = confirmShipName;

// Direct path used by the verify harness and the console
function nameShip(name) {
    game.ship.name = name;
    addShipLog(`Christened ${name}, a ${currentHull().name}.`);
    updateShipPanelUI();
    characterManager.saveCharacter(true);
    return name;
}
window.nameShip = nameShip;

// Full-screen moment, sibling of the promotion banner
function showShipBanner(name, subtitle) {
    const old = document.getElementById('shipBanner');
    if (old) old.remove();
    const banner = document.createElement('div');
    banner.id = 'shipBanner';
    banner.style.cssText = `
        position: fixed; top: 25%; left: 50%; transform: translateX(-50%);
        background: #00080d; border: 3px solid #66ccff; padding: 22px 44px;
        font-family: 'Courier New', monospace; text-align: center;
        z-index: 2000; box-shadow: 0 0 40px #66ccff88;
    `;
    banner.innerHTML = `
        <div style="color:#66ccff; font-size:13px; letter-spacing:4px;">YOUR SHIP</div>
        <div style="color:#ffffff; font-size:26px; margin-top:8px;">${name}</div>
        <div style="color:#889988; font-size:12px; margin-top:6px;">${subtitle}</div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
}

// --- Sidebar panel: name, hull, bolted-on parts, and the log ---

function updateShipPanelUI() {
    const identity = document.getElementById('shipIdentity');
    const modsList = document.getElementById('shipModsList');
    const logList = document.getElementById('shipLogList');
    if (!identity) return;
    const hull = currentHull();

    identity.innerHTML = `
        <div style="color:#ffdd44; font-size:14px;">${game.ship.name || '— unnamed —'}</div>
        <div style="color:#889988; font-size:11px;">${hull.name} · ${hull.class} · ${hull.berths} berth${hull.berths === 1 ? '' : 's'}</div>`;

    const mods = game.ship.mods || [];
    modsList.innerHTML = mods.length
        ? mods.map(id => `<div style="color:#88ffee; font-size:10px;">⬡ ${(typeof MODS !== 'undefined' && MODS[id]) ? MODS[id].name : id}</div>`).join('')
        : '';

    const log = game.ship.log || [];
    logList.innerHTML = log.slice(-3).map(e =>
        `<div style="color:#667766; font-size:10px; font-style:italic; margin-top:3px;">${e.text}</div>`).join('');
}
