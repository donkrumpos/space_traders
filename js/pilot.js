// Pilot progression: XP, ranks, and the celebrations between them.
// Credits get spent; XP only ever goes up — it belongs to the PILOT, not the
// ship. Kills, trades, deliveries, and discoveries all feed it.

const PILOT_RANKS = [
    { title: 'Cadet',         xp: 0,    icon: '·' },
    { title: 'Ensign',        xp: 60,   icon: '▸' },
    { title: 'Pilot',         xp: 150,  icon: '★' },
    { title: 'Veteran',       xp: 320,  icon: '★★' },
    { title: 'Ace',           xp: 600,  icon: '✦' },
    { title: 'Captain',       xp: 1000, icon: '✪' },
    { title: 'Commodore',     xp: 1600, icon: '✪✪' },
    { title: 'Star Marshal',  xp: 2500, icon: '❂' },
    { title: 'Living Legend', xp: 4000, icon: '❂❂' }
];

// Perks / grudges / crew live here from day one so the save format is stable;
// the systems that consume them arrive in their own features.
function createDefaultPilot() {
    return { xp: 0, rank: 0, perks: [], pendingPerkChoices: 0, grudges: {}, crew: [] };
}

function rankForXP(xp) {
    let rank = 0;
    while (rank < PILOT_RANKS.length - 1 && xp >= PILOT_RANKS[rank + 1].xp) rank++;
    return rank;
}

function addXP(amount, label) {
    const pilot = game.pilot;
    if (!pilot) return;
    amount = Math.round(amount);
    if (amount <= 0) return;

    pilot.xp += amount;
    spawnFloater(game.ship.x, game.ship.y - 42,
        `+${amount} XP${label ? ' · ' + label : ''}`, '#88bbff', 12);

    while (pilot.rank < PILOT_RANKS.length - 1 && pilot.xp >= PILOT_RANKS[pilot.rank + 1].xp) {
        pilot.rank++;
        pilot.pendingPerkChoices++;
        celebratePromotion(PILOT_RANKS[pilot.rank]);
    }

    updateUI();
    characterManager.saveCharacter(); // throttled — cheap to call per award
    maybeShowPerkChoice();
}

// Full-screen banner moment: a 6-year-old making Captain should FEEL it
function celebratePromotion(rank) {
    playBountySound();
    addShake(0.3);
    updateCrewPanelUI(); // a promotion can open a crew berth
    spawnFloater(game.ship.x, game.ship.y - 60, 'PROMOTED', '#ffdd44', 20);

    const old = document.getElementById('promotionBanner');
    if (old) old.remove();

    const banner = document.createElement('div');
    banner.id = 'promotionBanner';
    banner.style.cssText = `
        position: fixed; top: 25%; left: 50%; transform: translateX(-50%);
        background: #110d00; border: 3px solid #ffdd44; padding: 22px 44px;
        font-family: 'Courier New', monospace; text-align: center;
        z-index: 2000; box-shadow: 0 0 40px #ffdd4488;
    `;
    banner.innerHTML = `
        <div style="color:#ffdd44; font-size:13px; letter-spacing:4px;">PROMOTION</div>
        <div style="color:#ffffff; font-size:26px; margin-top:8px;">${rank.icon} ${rank.title}</div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
}

// Retroactive commission for saves that predate the pilot system — the
// logbook already proves the deeds, so the first load promotes on the spot.
function retroactivePilotXP(progress) {
    return Math.round(
        progress.enemiesDestroyed * 15 +
        progress.planetsVisited.length * 25 +
        Math.min(300, (progress.distanceTraveled || 0) / 1000)
    );
}

// --- Perks: one choice per promotion, three lanes matching the game's verbs ---
// Each rank-up offers the next untaken perk from each lane. Choosing is the
// RPG moment — two pilots diverge after their second promotion.

const PERK_LANES = {
    fighter: {
        label: 'FIGHTER', icon: '⚔', color: '#ff6666', perks: [
            { id: 'gunners_instinct', name: "Gunner's Instinct", blurb: 'Lasers cycle 15% faster' },
            { id: 'missile_racks', name: 'Missile Racks', blurb: '+3 missile capacity' },
            { id: 'cold_barrels', name: 'Cold Barrels', blurb: 'Shots build 25% less heat' },
            { id: 'warhead_tuning', name: 'Warhead Tuning', blurb: 'Missiles hit 30% harder' }
        ]
    },
    trader: {
        label: 'TRADER', icon: '⚖', color: '#ffcc44', perks: [
            { id: 'silver_tongue', name: 'Silver Tongue', blurb: 'Sell everything for 5% more' },
            { id: 'packrat', name: 'Packrat', blurb: '+3 cargo space' },
            { id: 'market_savvy', name: 'Market Savvy', blurb: 'Buy everything 5% cheaper' },
            { id: 'contract_broker', name: 'Contract Broker', blurb: 'Contracts pay 20% more' }
        ]
    },
    explorer: {
        label: 'EXPLORER', icon: '✧', color: '#66ffcc', perks: [
            { id: 'fuel_sipper', name: 'Fuel Sipper', blurb: 'Burn 20% less fuel' },
            { id: 'long_range_scanner', name: 'Long-Range Scanner', blurb: 'Minimap sees 40% further' },
            { id: 'emergency_thrusters', name: 'Emergency Thrusters', blurb: 'Damaged engines limp at 60%, not 40%' },
            { id: 'deflector_tuning', name: 'Deflector Tuning', blurb: '+10 shield capacity' }
        ]
    }
};

const MINIMAP_BASE_RANGE = 1500;

function hasPerk(id) {
    return !!(game.pilot && game.pilot.perks.includes(id));
}

// The next untaken perk in each lane — up to three cards per choice
function availablePerkChoices() {
    return Object.keys(PERK_LANES).map(laneKey => {
        const lane = PERK_LANES[laneKey];
        const perk = lane.perks.find(p => !game.pilot.perks.includes(p.id));
        return perk ? { laneKey, lane, perk } : null;
    }).filter(Boolean);
}

// Promotions no longer force the training modal open mid-flight (it paused
// the game — meaningless online, where the server world keeps moving, and an
// interruption everywhere else). Instead a pending choice lights the pulsing
// HUD chip; the pilot opens the cards when THEY choose — by clicking the
// chip, or via the dock prompt (docked = the natural safe moment).
function maybeShowPerkChoice() {
    if (location.search.includes('verify')) return; // harness drives perk flow explicitly
    updateTrainingChip();
}

function updateTrainingChip() {
    const chip = document.getElementById('trainingChip');
    if (!chip) return;
    chip.style.display = (game.pilot && game.pilot.pendingPerkChoices > 0) ? 'block' : 'none';
}

function showPerkChoice() {
    if (document.getElementById('perkChoiceOverlay')) return;
    const choices = availablePerkChoices();
    if (choices.length === 0 || game.pilot.pendingPerkChoices <= 0) {
        game.pilot.pendingPerkChoices = 0;
        updateTrainingChip();
        return;
    }

    // Solo can freeze time for the choice; online the world doesn't stop
    // for anyone — the pilot picked this moment, so it's on them.
    if (!(typeof net !== 'undefined' && net.online)) game.paused = true;

    const overlay = document.createElement('div');
    overlay.id = 'perkChoiceOverlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.82); z-index: 2001;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        font-family: 'Courier New', monospace;
    `;

    const cards = choices.map(({ lane, perk }) => `
        <div onclick="choosePerk('${perk.id}')" style="
            border: 2px solid ${lane.color}; background: #050a08; cursor: pointer;
            padding: 20px; width: 190px; text-align: center;
            box-shadow: 0 0 18px ${lane.color}44;">
            <div style="font-size: 26px;">${lane.icon}</div>
            <div style="color: ${lane.color}; font-size: 11px; letter-spacing: 3px; margin-top: 6px;">${lane.label}</div>
            <div style="color: #ffffff; font-size: 15px; margin-top: 10px;">${perk.name}</div>
            <div style="color: #999999; font-size: 11px; margin-top: 8px; line-height: 1.4;">${perk.blurb}</div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div style="color: #ffdd44; font-size: 14px; letter-spacing: 4px; margin-bottom: 20px;">
            CHOOSE YOUR TRAINING
        </div>
        <div style="display: flex; gap: 18px;">${cards}</div>
        <div onclick="dismissPerkChoice()" style="color: #888888; font-size: 12px; margin-top: 22px;
            cursor: pointer; text-decoration: underline;">train later</div>
    `;
    document.body.appendChild(overlay);
}

// Close without choosing — the chip keeps pulsing, nothing is lost. Nobody
// should ever be trapped in a menu while pirates are shooting.
function dismissPerkChoice() {
    const overlay = document.getElementById('perkChoiceOverlay');
    if (overlay) overlay.remove();
    game.paused = false;
    updateTrainingChip();
}
window.dismissPerkChoice = dismissPerkChoice;

function choosePerk(id) {
    const pilot = game.pilot;
    if (!pilot || pilot.perks.includes(id)) return;
    pilot.perks.push(id);
    pilot.pendingPerkChoices = Math.max(0, pilot.pendingPerkChoices - 1);

    // Flat-stat perks flow through the recompute (ships.js) so hull swaps
    // keep them; buying the perk also tops up the pool it grows.
    // Rate perks (cooldown, prices, fuel) are read live via hasPerk().
    recomputeShipStats();
    switch (id) {
        case 'missile_racks':
            game.ship.weapons.missiles.ammo = Math.min(
                game.ship.weapons.missiles.ammo + 3, game.ship.weapons.missiles.maxAmmo);
            break;
        case 'deflector_tuning':
            game.ship.shield = Math.min(game.ship.shield + 10, game.ship.shieldMax);
            break;
        case 'long_range_scanner':
            applyMapRange();
            break;
    }

    const perk = Object.values(PERK_LANES).flatMap(l => l.perks).find(p => p.id === id);
    showHudFeedback(`Training complete: ${perk.name} — ${perk.blurb}`, 'success', 4000);
    playPickupSound();

    const overlay = document.getElementById('perkChoiceOverlay');
    if (overlay) overlay.remove();
    game.paused = false;
    updateTrainingChip();

    updateUI();
    characterManager.saveCharacter(true);

    // Stacked promotions (retroactive commissions): the pilot is already in
    // choosing mode, so offer the next card set immediately
    if (pilot.pendingPerkChoices > 0 && !location.search.includes('verify')) showPerkChoice();
}
window.choosePerk = choosePerk;
window.showPerkChoice = showPerkChoice;

// Minimap range composes the scanner perk with the whisperdrive coil's
// interference — one place computes it so nothing stomps anything
function applyMapRange() {
    game.map.miniMapRange = Math.round(MINIMAP_BASE_RANGE
        * (hasPerk('long_range_scanner') ? 1.4 : 1)
        * (hasMod('whisper_coil') ? 0.9 : 1));
}

// Effects that live outside the save (map range) re-apply on every load
function reapplyPerkEffects() {
    applyMapRange();
}

// --- Faction grudges: bands remember who broke their raids ---
// Every broken raid deepens that faction's grudge. Grudge-heavy factions
// muster more often, bring bigger escorts and tougher bosses — and pay more.

function factionGrudge(name) {
    return (game.pilot && game.pilot.grudges[name]) || 0;
}

function grudgeTierLabel(grudge) {
    if (grudge >= 4) return { label: 'VENDETTA', color: '#ff4444' };
    if (grudge >= 2) return { label: 'Hunted', color: '#ff8844' };
    return { label: 'Marked', color: '#ffcc44' };
}

function recordRaidBroken(factionName) {
    if (!game.pilot || !factionName) return;
    const g = game.pilot.grudges;
    g[factionName] = (g[factionName] || 0) + 1;
    const tier = grudgeTierLabel(g[factionName]);
    showHudFeedback(`The ${factionName} will remember this — you are ${tier.label} (grudge ×${g[factionName]})`, 'warning', 5000);
    updateFactionUI();
    characterManager.saveCharacter(true);
}

function updateFactionUI() {
    const panel = document.getElementById('factionPanel');
    const list = document.getElementById('factionList');
    if (!panel || !list) return;
    const grudges = (game.pilot && game.pilot.grudges) || {};
    const held = Object.keys(grudges).filter(name => grudges[name] > 0);
    if (held.length === 0) {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = 'block';
    list.innerHTML = held.map(name => {
        const tier = grudgeTierLabel(grudges[name]);
        return `<div class="ledger-row"><span>${name}</span>
            <span style="color:${tier.color};">${tier.label} ×${grudges[name]}</span></div>`;
    }).join('');
}

window.grantXP = function(amount) {
    addXP(amount || 50, 'console');
    return game.pilot.xp;
};
