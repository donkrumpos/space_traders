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

window.grantXP = function(amount) {
    addXP(amount || 50, 'console');
    return game.pilot.xp;
};
