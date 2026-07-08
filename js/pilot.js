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

function maybeShowPerkChoice() {
    if (location.search.includes('verify')) return; // harness drives perk flow explicitly
    if (!game.pilot || game.pilot.pendingPerkChoices <= 0) return;
    if (document.getElementById('perkChoiceOverlay')) return;
    // Let the promotion banner have its moment first
    setTimeout(showPerkChoice, 1200);
}

function showPerkChoice() {
    if (document.getElementById('perkChoiceOverlay')) return;
    const choices = availablePerkChoices();
    if (choices.length === 0 || game.pilot.pendingPerkChoices <= 0) {
        game.pilot.pendingPerkChoices = 0;
        return;
    }

    game.paused = true;

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
    `;
    document.body.appendChild(overlay);
}

function choosePerk(id) {
    const pilot = game.pilot;
    if (!pilot || pilot.perks.includes(id)) return;
    pilot.perks.push(id);
    pilot.pendingPerkChoices = Math.max(0, pilot.pendingPerkChoices - 1);

    // Perks that grant flat stats apply once, right here; the save carries them.
    // Rate perks (cooldown, prices, fuel) are read live via hasPerk().
    switch (id) {
        case 'missile_racks':
            game.ship.weapons.missiles.maxAmmo += 3;
            game.ship.weapons.missiles.ammo += 3;
            break;
        case 'packrat':
            game.ship.cargoMax += 3;
            break;
        case 'deflector_tuning':
            game.ship.shieldMax += 10;
            game.ship.shield += 10;
            break;
        case 'long_range_scanner':
            game.map.miniMapRange = Math.round(MINIMAP_BASE_RANGE * 1.4);
            break;
    }

    const perk = Object.values(PERK_LANES).flatMap(l => l.perks).find(p => p.id === id);
    showHudFeedback(`Training complete: ${perk.name} — ${perk.blurb}`, 'success', 4000);
    playPickupSound();

    const overlay = document.getElementById('perkChoiceOverlay');
    if (overlay) overlay.remove();
    game.paused = false;

    updateUI();
    characterManager.saveCharacter(true);

    // Stacked promotions (retroactive commissions) choose again immediately
    if (pilot.pendingPerkChoices > 0) maybeShowPerkChoice();
}
window.choosePerk = choosePerk;

// Effects that live outside the save (map range) re-apply on every load
function reapplyPerkEffects() {
    if (hasPerk('long_range_scanner')) {
        game.map.miniMapRange = Math.round(MINIMAP_BASE_RANGE * 1.4);
    }
}

window.grantXP = function(amount) {
    addXP(amount || 50, 'console');
    return game.pilot.xp;
};
