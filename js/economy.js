// Living economy: drifting prices, player market impact, market events,
// a trade ledger of visited stations, and station mission boards.

const economy = {
    marketEvent: null,   // { planetName, goodType, side, multiplier, timeLeft, label }
    eventCooldown: 75,   // seconds until the market first stirs
    ledger: {}           // planetName -> { buy: {...}, sell: {...} }
};

function initEconomy() {
    game.planets.forEach(planet => {
        // Live market prices start at the static base values in planetData
        planet.market = { buy: {}, sell: {} };
        Object.keys(planet.produces).forEach(g => { planet.market.buy[g] = planet.produces[g]; });
        Object.keys(planet.demands).forEach(g => { planet.market.sell[g] = planet.demands[g]; });
    });
    game.missions = []; // active delivery contracts (max 3)
    game.combatStreak = 0;
}

function clampPrice(value, base) {
    return Math.min(base * 2.0, Math.max(base * 0.4, value));
}

// Every docking, all markets wander a little — the galaxy trades while you fly
function driftMarkets() {
    game.planets.forEach(planet => {
        Object.keys(planet.market.buy).forEach(g => {
            planet.market.buy[g] = clampPrice(planet.market.buy[g] * (0.92 + Math.random() * 0.16), planet.produces[g]);
        });
        Object.keys(planet.market.sell).forEach(g => {
            planet.market.sell[g] = clampPrice(planet.market.sell[g] * (0.92 + Math.random() * 0.16), planet.demands[g]);
        });
    });
}

function marketEventMultiplier(planet, goodType, side) {
    const ev = economy.marketEvent;
    if (ev && ev.planetName === planet.name && ev.goodType === goodType && ev.side === side) {
        return ev.multiplier;
    }
    return 1;
}

function getBuyPrice(planet, goodType) {
    const haggle = hasPerk('market_savvy') ? 0.95 : 1;
    return Math.max(1, Math.round(planet.market.buy[goodType] * marketEventMultiplier(planet, goodType, 'buy') * haggle));
}

function getSellPrice(planet, goodType) {
    const haggle = hasPerk('silver_tongue') ? 1.05 : 1;
    return Math.max(1, Math.round(planet.market.sell[goodType] * marketEventMultiplier(planet, goodType, 'sell') * haggle));
}

// Your own trades move the market: buying drives the price up, flooding drives it down
function applyTradeImpact(planet, goodType, side, amount) {
    if (side === 'buy') {
        planet.market.buy[goodType] = clampPrice(planet.market.buy[goodType] * (1 + 0.02 * amount), planet.produces[goodType]);
    } else {
        planet.market.sell[goodType] = clampPrice(planet.market.sell[goodType] * (1 - 0.02 * amount), planet.demands[goodType]);
    }
}

// --- Market events (shortages and gluts) ---

const MARKET_EVENT_FLAVORS = {
    sell: { food: 'Famine', technology: 'Tech crisis', materials: 'Mining strike', luxury: 'Luxury craze' },
    buy: { food: 'Bumper harvest', technology: 'Factory overrun', materials: 'Ore glut', luxury: 'Warehouse overstock' }
};

function updateEconomy(deltaTime) {
    const ev = economy.marketEvent;
    if (ev) {
        ev.timeLeft -= deltaTime;
        if (ev.timeLeft <= 0) {
            showHudFeedback(`Markets normalize — ${ev.label} is over`, 'info');
            economy.marketEvent = null;
            economy.eventCooldown = 90 + Math.random() * 120;
            updateLedgerUI();
            refreshDockedTradeUI();
        }
        return;
    }
    economy.eventCooldown -= deltaTime;
    if (economy.eventCooldown <= 0) {
        startMarketEvent();
    }
}

function startMarketEvent() {
    const planet = game.planets[Math.floor(Math.random() * game.planets.length)];
    const side = Math.random() < 0.65 ? 'sell' : 'buy'; // shortages are more fun than gluts
    const pool = Object.keys(side === 'sell' ? planet.demands : planet.produces);
    if (pool.length === 0) {
        economy.eventCooldown = 20; // this planet had nothing to disrupt; try again soon
        return;
    }
    const goodType = pool[Math.floor(Math.random() * pool.length)];
    const multiplier = side === 'sell' ? 2 + Math.random() : 0.4 + Math.random() * 0.2;
    const label = `${MARKET_EVENT_FLAVORS[side][goodType]} at ${planet.name}`;

    economy.marketEvent = { planetName: planet.name, goodType, side, multiplier, timeLeft: 180, label };

    const goodName = goods[goodType].name;
    if (side === 'sell') {
        showHudFeedback(`⚡ ${label} — ${goodName} sells at ${multiplier.toFixed(1)}× for 3 min!`, 'warning', 6000);
    } else {
        showHudFeedback(`⚡ ${label} — ${goodName} is dirt cheap for 3 min!`, 'warning', 6000);
    }
    updateLedgerUI();
    refreshDockedTradeUI();
}

function refreshDockedTradeUI() {
    if (game.isDocked && game.currentPlanet) {
        updateBuyingSectionUI();
        updateSellingSectionUI();
    }
}

// --- Trade ledger (prices as of your last visit — stale data is part of the game) ---

function recordLedger(planet) {
    const entry = { buy: {}, sell: {} };
    Object.keys(planet.market.buy).forEach(g => { entry.buy[g] = getBuyPrice(planet, g); });
    Object.keys(planet.market.sell).forEach(g => { entry.sell[g] = getSellPrice(planet, g); });
    economy.ledger[planet.name] = entry;
    updateLedgerUI();
}

function updateLedgerUI() {
    const el = document.getElementById('ledgerList');
    if (!el) return;
    const names = Object.keys(economy.ledger);
    if (names.length === 0) {
        el.innerHTML = '<div style="color:#666;">Dock at stations to record prices</div>';
        return;
    }
    let html = '';
    names.forEach(name => {
        const entry = economy.ledger[name];
        const eventMark = economy.marketEvent && economy.marketEvent.planetName === name ? ' ⚡' : '';
        html += `<div style="color:#00ffff; margin-top:6px;">${name}${eventMark}</div>`;
        Object.keys(entry.buy).forEach(g => {
            html += `<div class="ledger-row"><span>${goods[g].name}</span><span style="color:#88ff88;">buy $${entry.buy[g]}</span></div>`;
        });
        Object.keys(entry.sell).forEach(g => {
            html += `<div class="ledger-row"><span>${goods[g].name}</span><span style="color:#ffaa00;">sell $${entry.sell[g]}</span></div>`;
        });
    });
    html += `<div style="color:#555; margin-top:6px; font-size:10px;">Prices as of last visit</div>`;
    el.innerHTML = html;
}

// --- Mission board (delivery contracts) ---

function averageDemandPrice(goodType) {
    const prices = game.planets.filter(p => p.demands[goodType] !== undefined).map(p => p.demands[goodType]);
    if (prices.length === 0) return 100;
    return prices.reduce((a, b) => a + b, 0) / prices.length;
}

function generateMissionOffers(planet) {
    const offers = [];
    // No station posts contraband runs on its public board
    const produced = Object.keys(planet.produces).filter(g => g !== 'contraband');
    const legalGoods = Object.keys(goods).filter(g => g !== 'contraband');
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
        // Mostly ship what this station produces (buy here, haul there)
        const goodType = produced.length > 0 && Math.random() < 0.7
            ? produced[Math.floor(Math.random() * produced.length)]
            : legalGoods[Math.floor(Math.random() * legalGoods.length)];
        const destinations = game.planets.filter(p => p !== planet && p.demands[goodType] !== undefined);
        if (destinations.length === 0) continue;
        const dest = destinations[Math.floor(Math.random() * destinations.length)];
        const qty = 4 + Math.floor(Math.random() * 8);
        // Pays a premium over the average open-market sell price — the price of a fixed route
        const reward = Math.round(qty * averageDemandPrice(goodType) * 1.25 / 10) * 10;
        offers.push({ id: `${planet.name}-${Date.now()}-${i}`, from: planet.name, dest: dest.name, goodType, qty, reward });
    }
    planet.missionOffers = offers;
}

function acceptMission(offerId) {
    const planet = game.currentPlanet;
    if (!planet || !planet.missionOffers) return;
    if (game.missions.length >= 3) {
        showHudFeedback('Mission log full (3 contracts max)', 'error');
        return;
    }
    const idx = planet.missionOffers.findIndex(o => o.id === offerId);
    if (idx === -1) return;
    game.missions.push(planet.missionOffers.splice(idx, 1)[0]);
    showHudFeedback('Contract accepted', 'success');
    updateMissionBoardUI(planet);
    updateMissionsUI();
}

function completeMissionsAt(planet) {
    for (let i = game.missions.length - 1; i >= 0; i--) {
        const m = game.missions[i];
        if (m.dest !== planet.name) continue;
        const have = game.ship.cargo[m.goodType] || 0;
        if (have >= m.qty) {
            game.ship.cargo[m.goodType] -= m.qty;
            if (game.ship.cargo[m.goodType] === 0) delete game.ship.cargo[m.goodType];
            const pay = Math.round(m.reward * (hasPerk('contract_broker') ? 1.2 : 1)
                * (hasMod('songbird_antenna') ? 1.1 : 1));
            game.ship.credits += pay;
            game.missions.splice(i, 1);
            flashCredits();
            playBountySound();
            showHudFeedback(`Delivery complete: ${m.qty} ${goods[m.goodType].name} — paid $${pay}`, 'success', 5000);
            addXP(30, 'delivery');
        } else {
            showHudFeedback(`Contract for ${planet.name} needs ${m.qty - have} more ${goods[m.goodType].name}`, 'warning', 4000);
        }
    }
    updateMissionsUI();
}

function updateMissionsUI() {
    const el = document.getElementById('missionList');
    if (!el) return;
    if (!game.missions || game.missions.length === 0) {
        el.innerHTML = '<div style="color:#666;">None — check station mission boards</div>';
        return;
    }
    el.innerHTML = game.missions.map(m => {
        if (m.type === 'bounty') {
            return `<div class="ledger-row"><span>☠ ${m.name} — near ${m.nearPlanet}</span>
                <span style="color:#ff6666;">$${m.reward}</span></div>`;
        }
        if (m.type === 'escort') {
            return `<div class="ledger-row"><span>⛡ ${m.traderName} → ${m.dest}</span>
                <span style="color:#44ddff;">$${m.reward}</span></div>`;
        }
        const have = game.ship.cargo[m.goodType] || 0;
        const ready = have >= m.qty;
        return `<div class="ledger-row"><span>${m.qty} ${goods[m.goodType].name} → ${m.dest}</span>
            <span style="color:${ready ? '#00ff88' : '#ffaa00'};">${Math.min(have, m.qty)}/${m.qty} · $${m.reward}</span></div>`;
    }).join('');
}

function updateMissionBoardUI(planet) {
    const el = document.getElementById('missionBoard');
    if (!el) return;
    const logFull = game.missions.length >= 3;

    let html = '';
    if (planet.bountyOffer) {
        const b = planet.bountyOffer;
        html += `<div class="trade-item" style="border-color:#883344;">
            <span style="color:#ff6666;">☠ WANTED: ${b.name}<br>
                <small style="color:#888;">Last seen near ${b.nearPlanet} — pays $${b.reward}</small></span>
            <button onclick="acceptBounty()" ${logFull ? 'disabled' : ''}>Hunt</button>
        </div>`;
    }
    if (planet.escortOffer) {
        const e = planet.escortOffer;
        html += `<div class="trade-item" style="border-color:#336688;">
            <span style="color:#44ddff;">⛡ ESCORT: ${e.traderName} → ${e.dest}<br>
                <small style="color:#888;">Pirates will come — pays $${e.reward} on safe arrival</small></span>
            <button onclick="acceptEscort()" ${logFull ? 'disabled' : ''}>Escort</button>
        </div>`;
    }
    if (planet.missionOffers && planet.missionOffers.length > 0) {
        html += planet.missionOffers.map(o => `<div class="trade-item">
            <span>${o.qty} ${goods[o.goodType].name} → ${o.dest}<br>
                <small style="color:#888;">Pays $${o.reward} on delivery</small></span>
            <button onclick="acceptMission('${o.id}')" ${logFull ? 'disabled' : ''}>Accept</button>
        </div>`).join('');
    }
    el.innerHTML = html || '<div style="color:#666;">No contracts available</div>';
}

// --- Escort contracts (keep a named freighter alive to its destination) ---

function generateEscortOffer(planet) {
    planet.escortOffer = null;
    // One charge at a time, and not every port has a nervous captain
    const alreadyEscorting = game.missions.some(m => m.type === 'escort');
    if (alreadyEscorting || Math.random() > 0.45) return;

    const dests = game.planets.filter(p => p !== planet);
    const dest = dests[Math.floor(Math.random() * dests.length)];
    const dist = Math.sqrt(Math.pow(dest.x - planet.x, 2) + Math.pow(dest.y - planet.y, 2));
    planet.escortOffer = {
        id: `escort-${Date.now()}`,
        type: 'escort',
        traderName: TRADER_NAMES[Math.floor(Math.random() * TRADER_NAMES.length)],
        from: planet.name,
        dest: dest.name,
        // Longer routes pay more — the danger scales with the distance
        reward: 200 + Math.round(dist * 0.5 / 10) * 10
    };
}

function acceptEscort() {
    const planet = game.currentPlanet;
    if (!planet || !planet.escortOffer) return;
    if (game.missions.length >= 3) {
        showHudFeedback('Mission log full (3 contracts max)', 'error');
        return;
    }
    const mission = planet.escortOffer;
    planet.escortOffer = null;
    game.missions.push(mission);
    spawnEscortTrader(mission);
    showHudFeedback(`⛡ Escort accepted — keep Freighter ${mission.traderName} alive to ${mission.dest}`, 'success', 5000);
    updateMissionBoardUI(planet);
    updateMissionsUI();
}

// After a reload, an accepted escort whose freighter isn't flying respawns
// it at the origin port (freighters themselves aren't saved)
function restoreActiveEscorts() {
    (game.missions || []).filter(m => m.type === 'escort').forEach(m => {
        const alive = (game.traders || []).some(t => t.escortId === m.id);
        if (!alive) spawnEscortTrader(m);
    });
}

// --- Wanted posters (named Warlord hunts) ---

const BOUNTY_FIRST_NAMES = ['Crimson', 'Void', 'Iron', 'Silent', 'Black', 'Rust', 'Grim', 'Howling'];
const BOUNTY_LAST_NAMES = ['Vex', 'Harrow', 'Kane', 'Sable', 'Talon', 'Mordant', 'Grin', 'Locke'];

function generateBountyOffer(planet) {
    planet.bountyOffer = null;
    // One hunt at a time, and posters only show up sometimes
    const alreadyHunting = game.missions.some(m => m.type === 'bounty');
    if (alreadyHunting || Math.random() > 0.4) return;

    const target = game.planets[Math.floor(Math.random() * game.planets.length)];
    const name = BOUNTY_FIRST_NAMES[Math.floor(Math.random() * BOUNTY_FIRST_NAMES.length)] + ' ' +
                 BOUNTY_LAST_NAMES[Math.floor(Math.random() * BOUNTY_LAST_NAMES.length)];
    planet.bountyOffer = {
        id: `bounty-${Date.now()}`,
        type: 'bounty',
        name,
        nearPlanet: target.name,
        reward: 1500 + Math.round(Math.random() * 150) * 10
    };
}

function acceptBounty() {
    const planet = game.currentPlanet;
    if (!planet || !planet.bountyOffer) return;
    if (game.missions.length >= 3) {
        showHudFeedback('Mission log full (3 contracts max)', 'error');
        return;
    }
    const bounty = planet.bountyOffer;
    planet.bountyOffer = null;
    game.missions.push(bounty);
    spawnNamedWarlord(bounty);
    showHudFeedback(`Hunt accepted: ${bounty.name}, last seen near ${bounty.nearPlanet}`, 'success', 4500);
    updateMissionBoardUI(planet);
    updateMissionsUI();
}

// After a reload, any accepted hunt whose target isn't alive gets its boss respawned
function restoreActiveBounties() {
    (game.missions || []).filter(m => m.type === 'bounty').forEach(bounty => {
        const alive = (game.enemies || []).some(e => e.bountyId === bounty.id);
        if (!alive) spawnNamedWarlord(bounty);
    });
}
