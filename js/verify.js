// Headless verify harness. Loads only with ?verify in the URL; the game plays
// normally without it. Run:
//   chrome-headless-shell --headless --dump-dom --virtual-time-budget=8000 \
//     "http://localhost:8377/index.html?verify" | grep VERIFY
// Results land in <pre id="verifyOut"> and document.title (VERIFY-PASS/FAIL).

const VERIFY_SUITES = {}; // name -> fn(assert); features register themselves below

function verifyAssert(results, suite) {
    return (name, cond) => results.push({ suite, name, pass: !!cond });
}

VERIFY_SUITES.boot = (assert) => {
    assert('game object exists', typeof game === 'object' && game.ship);
    assert('7 planets initialized', game.planets && game.planets.length === 7);
    assert('character loaded', typeof characterManager === 'object' && characterManager.character);
    assert('markets initialized', game.planets.every(p => p.market && p.market.buy));
    assert('traffic initialized', Array.isArray(game.traders));
    assert('UI rendered credits', document.getElementById('credits').textContent !== '');
};

VERIFY_SUITES.xp = (assert) => {
    const pilot = game.pilot;
    assert('pilot state exists', pilot && typeof pilot.xp === 'number');
    assert('rank table starts at Cadet/0', PILOT_RANKS[0].xp === 0);
    assert('rankForXP walks thresholds',
        rankForXP(0) === 0 && rankForXP(60) === 1 && rankForXP(999999) === PILOT_RANKS.length - 1);

    const startXP = pilot.xp;
    const startRank = pilot.rank;
    addXP(10, 'verify');
    assert('addXP accrues', pilot.xp === startXP + 10);

    const next = PILOT_RANKS[pilot.rank + 1];
    if (next) {
        const pendingBefore = pilot.pendingPerkChoices;
        addXP(next.xp - pilot.xp, 'verify');
        assert('promotion increments rank', pilot.rank === startRank + 1);
        assert('promotion queues a perk choice', pilot.pendingPerkChoices === pendingBefore + 1);
        assert('promotion banner shown', !!document.getElementById('promotionBanner'));
    }

    assert('retroactive commission math',
        retroactivePilotXP({ enemiesDestroyed: 10, planetsVisited: ['a', 'b'], distanceTraveled: 50000 }) === 250);
    assert('HUD shows rank', document.getElementById('pilotRank').textContent.includes(PILOT_RANKS[pilot.rank].title));
    assert('save carries pilot', JSON.parse(characterManager.exportCharacter()).pilot.xp === pilot.xp);
};

VERIFY_SUITES.perks = (assert) => {
    const pilot = game.pilot;
    assert('three lanes with four perks each',
        Object.keys(PERK_LANES).length === 3 &&
        Object.values(PERK_LANES).every(l => l.perks.length === 4));
    assert('choices offer one perk per lane', availablePerkChoices().length === 3);

    // Modal renders and pauses; choosing applies, unpauses, and persists
    pilot.pendingPerkChoices = 1;
    showPerkChoice();
    assert('modal shown + game paused', !!document.getElementById('perkChoiceOverlay') && game.paused === true);

    const cargoBefore = game.ship.cargoMax;
    choosePerk('packrat');
    assert('packrat grants +3 cargo', game.ship.cargoMax === cargoBefore + 3);
    assert('choice consumes pending + unpauses',
        pilot.pendingPerkChoices === 0 && game.paused === false && !document.getElementById('perkChoiceOverlay'));
    assert('perk persists in save', JSON.parse(characterManager.exportCharacter()).pilot.perks.includes('packrat'));
    assert('taken perk leaves lane offering its successor',
        availablePerkChoices().find(c => c.laneKey === 'trader').perk.id === 'silver_tongue');

    // Rate perks read live at their call sites
    const baseSell = getSellPrice(game.planets[0], Object.keys(game.planets[0].demands)[0]);
    pilot.perks.push('silver_tongue');
    const boostedSell = getSellPrice(game.planets[0], Object.keys(game.planets[0].demands)[0]);
    assert('silver tongue lifts sell price', boostedSell === Math.max(1, Math.round(baseSell / 1 * 1.05)) || boostedSell > baseSell);

    pilot.perks.push('gunners_instinct');
    game.ship.weapons.lasers.cooldown = 0;
    game.ship.weapons.lasers.heat = 0;
    fireLaser();
    assert('gunners instinct trims cooldown', game.ship.weapons.lasers.cooldown === LASER_MODES[game.ship.weapons.lasers.mode].cooldown * 0.85);

    // Flat perks survive the shields/weapons upgrade recompute
    pilot.perks.push('deflector_tuning', 'missile_racks');
    game.ship.weapons.missiles.maxAmmo += 3;
    applyUpgradeEffects('shields');
    assert('deflector survives shield recompute', game.ship.shieldMax === 20 * game.ship.upgrades.shields + 10);
    applyUpgradeEffects('weapons');
    assert('missile racks survive weapons recompute',
        game.ship.weapons.missiles.maxAmmo === 5 + (game.ship.upgrades.weapons - 1) * 3 + 3);
};

function runVerify() {
    const params = new URLSearchParams(location.search);
    const wanted = params.get('verify');
    const names = wanted ? wanted.split(',') : Object.keys(VERIFY_SUITES);
    const results = [];

    names.forEach(name => {
        const suite = VERIFY_SUITES[name];
        if (!suite) {
            results.push({ suite: name, name: 'suite exists', pass: false });
            return;
        }
        try {
            suite(verifyAssert(results, name));
        } catch (err) {
            results.push({ suite: name, name: `threw: ${err.message}`, pass: false });
        }
    });

    const failed = results.filter(r => !r.pass);
    const lines = results.map(r => `${r.pass ? 'PASS' : 'FAIL'} [${r.suite}] ${r.name}`);
    lines.push(`VERIFY-${failed.length === 0 ? 'PASS' : 'FAIL'} ${results.length - failed.length}/${results.length}`);

    const out = document.createElement('pre');
    out.id = 'verifyOut';
    out.textContent = lines.join('\n');
    document.body.appendChild(out);
    document.title = `VERIFY-${failed.length === 0 ? 'PASS' : 'FAIL'}`;
    lines.forEach(l => console.log(l));
}

if (location.search.includes('verify')) {
    // Game boots synchronously via startGame(); give one tick of the loop
    // (and any async autosave) time to settle before asserting.
    window.addEventListener('load', () => setTimeout(runVerify, 800));
}
