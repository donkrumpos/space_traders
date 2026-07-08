// Living economy: drifting prices, player market impact, market events,
// a trade ledger of visited stations, and station mission boards.
//
// M3 split (docs/PROTOCOL.md "Economy sim extraction"): the pure market/
// mission math lives in js/sim/economy-core.js (globalThis.EconomyCore).
// This file is the browser adapter — same public function names/signatures
// as before, delegating the math to EconomyCore while owning cadence,
// cooldowns, game state, and DOM. Escort offers stay fully client-local
// (they touch game.traders — M4 territory).

const economy = {
    marketEvent: null,   // { planetName, goodType, side, multiplier, timeLeft, label }
    eventCooldown: 75,   // seconds until the market first stirs
    ledger: {}           // planetName -> { buy: {...}, sell: {...} }
};

function initEconomy() {
    game.planets.forEach(planet => {
        // Live market prices start at the static base values in the planet meta
        planet.market = EconomyCore.makeMarket(planet);
    });
    game.missions = []; // active delivery contracts (max 3)
    game.combatStreak = 0;
}

function clampPrice(value, base) {
    return EconomyCore.clampPrice(value, base);
}

// Every docking, all markets wander a little — the galaxy trades while you fly
function driftMarkets() {
    game.planets.forEach(planet => {
        EconomyCore.drift(planet.market, planet);
    });
}

function marketEventMultiplier(planet, goodType, side) {
    return EconomyCore.eventMultiplier(economy.marketEvent, planet.name, goodType, side);
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
    EconomyCore.tradeImpact(planet.market, planet, goodType, side, amount);
}

// --- Market events (shortages and gluts) ---

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
    const ev = EconomyCore.rollMarketEvent(game.planets);
    if (!ev) {
        economy.eventCooldown = 20; // that planet had nothing to disrupt; try again soon
        return;
    }
    economy.marketEvent = ev;

    const goodName = goods[ev.goodType].name;
    if (ev.side === 'sell') {
        showHudFeedback(`⚡ ${ev.label} — ${goodName} sells at ${ev.multiplier.toFixed(1)}× for 3 min!`, 'warning', 6000);
    } else {
        showHudFeedback(`⚡ ${ev.label} — ${goodName} is dirt cheap for 3 min!`, 'warning', 6000);
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

function generateMissionOffers(planet) {
    // Delivery contracts come from the shared board roll; the bounty half of
    // the roll is discarded here (generateBountyOffer does its own roll)
    planet.missionOffers = EconomyCore.generateMissionOffers(planet, game.planets).offers;
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

function generateBountyOffer(planet) {
    planet.bountyOffer = null;
    // One hunt at a time is player state — gated here, not in the core.
    // The core's roll includes the "posters only show up sometimes" odds.
    const alreadyHunting = game.missions.some(m => m.type === 'bounty');
    if (alreadyHunting) return;
    planet.bountyOffer = EconomyCore.generateMissionOffers(planet, game.planets).bountyOffer;
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
