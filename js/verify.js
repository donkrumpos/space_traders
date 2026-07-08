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

VERIFY_SUITES.factions = (assert) => {
    const pilot = game.pilot;
    pilot.grudges = {};
    assert('grudge starts clean', factionGrudge('Rustfang Cartel') === 0);
    assert('faction panel hidden when clean',
        (updateFactionUI(), document.getElementById('factionPanel').style.display === 'none'));

    recordRaidBroken('Rustfang Cartel');
    recordRaidBroken('Rustfang Cartel');
    assert('broken raids accrue grudge', factionGrudge('Rustfang Cartel') === 2);
    assert('faction panel shows held grudges',
        document.getElementById('factionPanel').style.display === 'block' &&
        document.getElementById('factionList').textContent.includes('Rustfang Cartel'));
    assert('grudge tiers escalate',
        grudgeTierLabel(1).label === 'Marked' && grudgeTierLabel(2).label === 'Hunted' && grudgeTierLabel(4).label === 'VENDETTA');
    assert('grudge persists in save',
        JSON.parse(characterManager.exportCharacter()).pilot.grudges['Rustfang Cartel'] === 2);

    // A vendetta-heavy faction should dominate the weighted pick
    pilot.grudges['Rustfang Cartel'] = 50;
    let rustfang = 0;
    for (let i = 0; i < 60; i++) {
        if (pickRaidFaction().name === 'Rustfang Cartel') rustfang++;
    }
    assert('grudge weights the muster', rustfang > 45);

    // Grudge scales the band itself
    pilot.grudges = { 'Rustfang Cartel': 4, 'Void Choir': 0, 'Iron Shoal': 0 };
    game.enemies = [];
    // Force the grudged faction via the weighted pick being near-certain
    pilot.grudges['Rustfang Cartel'] = 500;
    spawnRaidBand();
    const boss = game.enemies.find(e => e.isBandBoss);
    const minions = game.enemies.filter(e => e.bandId && !e.isBandBoss);
    assert('vendetta boss is buffed to the +60% cap', boss && boss.maxHull === Math.round(170 * 1.6));
    assert('vendetta brings +2 reinforcements', minions.length >= 5);
    game.enemies = [];
    pilot.grudges = {};
    updateFactionUI();
};

VERIFY_SUITES.crew = (assert) => {
    const pilot = game.pilot;
    pilot.crew = [];

    // Berths gate on BOTH rank (who signs on) and hull (where they sleep)
    game.ship.hullId = 'skiff';
    pilot.rank = 5;
    assert('a one-seater has no bunks at any rank', crewSlots() === 0);
    game.ship.hullId = 'clipper';
    pilot.rank = 0;
    assert('no berths below Pilot rank', crewSlots() === 0);
    pilot.rank = 2;
    assert('one berth at Pilot', crewSlots() === 1);
    pilot.rank = 5;
    assert('two berths at Captain', crewSlots() === 2);
    pilot.rank = 7;
    assert('three berths at Star Marshal aboard a clipper', crewSlots() === 3);
    pilot.rank = 5;

    // Hiring through a station offer
    const planet = game.planets[0];
    planet.crewOffers = [{ id: 'crew-test-1', name: 'Sparks', quirk: 'test', role: 'engineer', cost: 900 }];
    game.currentPlanet = planet;
    const credits = game.ship.credits = 2000;
    hireCrew('crew-test-1');
    assert('hire deducts cost and signs crew',
        game.ship.credits === credits - 900 && crewHasRole('engineer'));
    assert('crew persists in save',
        JSON.parse(characterManager.exportCharacter()).pilot.crew.some(c => c.name === 'Sparks'));
    assert('crew panel lists the hire',
        document.getElementById('crewPanel').style.display === 'block' &&
        document.getElementById('crewList').textContent.includes('Sparks'));

    // Engineer auto-repairs after 10 uninterrupted seconds
    game.ship.systems.engines = 'damaged';
    game.crewRepairTimer = 0;
    updateCrew(9);
    assert('engineer still working at 9s', game.ship.systems.engines === 'damaged');
    updateCrew(1.5);
    assert('engineer fixes at 10s', game.ship.systems.engines === 'ok');

    // Tail gunner fires a rear bolt every other volley
    pilot.crew.push({ name: 'Moth', role: 'gunner', quirk: 'test' });
    game.projectiles = [];
    game.gunnerToggle = false;
    game.ship.weapons.lasers.cooldown = 0;
    game.ship.weapons.lasers.heat = 0;
    game.ship.weapons.lasers.overheated = false;
    fireLaser();
    const withRear = game.projectiles.length;
    game.projectiles = [];
    game.ship.weapons.lasers.cooldown = 0;
    fireLaser();
    assert('gunner alternates rear bolts', withRear === game.projectiles.length + 1);

    // Dismissal frees the berth
    dismissCrew(0);
    assert('dismiss frees the role', !crewHasRole('engineer'));
    pilot.crew = [];
    game.currentPlanet = null;
    game.ship.hullId = 'skiff'; // restore the fresh-save hull
    recomputeShipStats();
};

VERIFY_SUITES.escort = (assert) => {
    game.missions = [];
    const planet = game.planets[0];
    game.currentPlanet = planet;

    // Offer generation is stochastic — roll until it lands (bounded)
    let tries = 0;
    while (!planet.escortOffer && tries++ < 300) generateEscortOffer(planet);
    assert('escort offer generates', !!planet.escortOffer);
    const offer = planet.escortOffer;
    assert('reward floors at $200 + distance', offer.reward >= 200);

    acceptEscort();
    assert('accept logs mission + spawns marked freighter',
        game.missions.some(m => m.type === 'escort') &&
        game.traders.some(t => t.escortId === offer.id && t.isEscort));
    assert('mission log renders escort row',
        document.getElementById('missionList').textContent.includes(offer.traderName));

    const t = game.traders.find(tr => tr.escortId === offer.id);
    const enemiesBefore = (game.enemies || []).length;
    traderDepart(t);
    assert('escort flies the contract route', t.dest === offer.dest);
    assert('departure springs a 2-raider ambush', game.enemies.length === enemiesBefore + 2);

    const credits = game.ship.credits;
    traderDock(t, game.planets.find(p => p.name === offer.dest));
    assert('arrival pays and releases the freighter',
        game.ship.credits >= credits + 200 && !t.isEscort);
    assert('mission closes on arrival', !game.missions.some(m => m.type === 'escort'));

    // Failure path: a dead escort voids the contract
    tries = 0;
    while (!planet.escortOffer && tries++ < 300) generateEscortOffer(planet);
    const offer2 = planet.escortOffer;
    acceptEscort();
    destroyTrader(game.traders.findIndex(tr => tr.escortId === offer2.id));
    assert('death voids the contract', !game.missions.some(m => m.type === 'escort'));

    // Reload path: an accepted escort with no freighter flying respawns one
    game.missions.push({ id: 'escort-restore', type: 'escort', traderName: 'Kestrel',
        from: planet.name, dest: game.planets[1].name, reward: 500 });
    restoreActiveEscorts();
    assert('restore respawns the freighter', game.traders.some(tr => tr.escortId === 'escort-restore'));
    game.missions = game.missions.filter(m => m.id !== 'escort-restore');
    const ri = game.traders.findIndex(tr => tr.escortId === 'escort-restore');
    if (ri !== -1) game.traders.splice(ri, 1);

    // Distress plumbing: a fleeing trader sets the flag the minimap reads
    const civilian = game.traders.find(tr => !tr.isEscort);
    if (civilian) {
        civilian.state = 'traveling';
        civilian.dest = game.planets[1].name;
        game.enemies.push(makeEnemyFromTier('scout', civilian.x + 50, civilian.y));
        updateTraffic(1 / 60);
        assert('chased freighter raises distress flag', civilian.fleeing === true);
    }
    game.enemies = [];
    game.currentPlanet = null;
    updateMissionsUI();
};

VERIFY_SUITES.ships = (assert) => {
    const lv1 = { cargo: 1, engine: 1, shields: 1, fuel_tank: 1, hull: 1, weapons: 1 };
    assert('five hulls in the ladder', HULL_ORDER.length === 5 && HULL_ORDER.every(id => HULLS[id]));
    assert('skiff matches the legacy baseline',
        HULLS.skiff.baseCargo === 10 && HULLS.skiff.baseFuel === 500 &&
        HULLS.skiff.baseHull === 100 && HULLS.skiff.maxSpeed === 8 && HULLS.skiff.agility === 1.0);
    assert('every hull is sold somewhere', HULL_ORDER.every(id => stockedAt(id).length > 0));

    // Legacy commissioning: smallest hull that fits levels AND crew
    assert('level-1 loner commissions a skiff', assignLegacyHull(lv1, 0) === 'skiff');
    assert('cargo levels outgrow the skiff', assignLegacyHull({ ...lv1, cargo: 4 }, 0) === 'courier');
    assert('crew aboard needs a bunk', assignLegacyHull(lv1, 1) === 'courier');
    assert('gun-heavy save commissions the gunship', assignLegacyHull({ ...lv1, weapons: 5 }, 0) === 'gunship');
    assert('outgrown saves grandfather into the clipper', assignLegacyHull({ ...lv1, cargo: 12 }, 0) === 'clipper');

    // Recompute reproduces the legacy formulas on a skiff
    const saved = {
        hullId: game.ship.hullId, upgrades: { ...game.ship.upgrades },
        credits: game.ship.credits, cargo: { ...game.ship.cargo }, name: game.ship.name
    };
    const perksSaved = [...game.pilot.perks];
    game.pilot.perks = game.pilot.perks.filter(p => p !== 'packrat' && p !== 'deflector_tuning' && p !== 'missile_racks');
    game.ship.hullId = 'skiff';
    game.ship.upgrades = { cargo: 2, engine: 1, shields: 2, fuel_tank: 2, hull: 2, weapons: 2 };
    recomputeShipStats();
    assert('recompute matches legacy math',
        game.ship.cargoMax === 15 && game.ship.fuelMax === 700 && game.ship.hullMax === 150 &&
        game.ship.shieldMax === 40 && game.ship.weapons.missiles.maxAmmo === 8);

    // Buying a hull: charges net of trade-in, keeps upgrades, leaves ready
    const yard = game.planets.find(p => (p.shipyard || []).includes('courier'));
    game.currentPlanet = yard;
    game.ship.cargo = {};
    game.ship.credits = 50000;
    const before = game.ship.credits;
    buyHull('courier');
    assert('purchase swaps hull and charges net of trade-in',
        game.ship.hullId === 'courier' &&
        game.ship.credits === before - (HULLS.courier.price - tradeInValue('skiff')));
    assert('new hull raises the ceilings', game.ship.cargoMax === 21 && game.ship.hullMax === 190);
    assert('new ship leaves the yard ready',
        game.ship.hull === game.ship.hullMax && game.ship.fuel === game.ship.fuelMax);
    assert('the trade lands in the ship\'s log', game.ship.log.some(e => e.text.includes('Magpie Courier')));

    // An overflowing hold blocks the downgrade
    game.ship.cargo = { food: 999 };
    buyHull('skiff');
    assert('overflowing hold blocks the trade', game.ship.hullId === 'courier');
    game.ship.cargo = {};

    // Hull caps gate upgrade purchases
    game.ship.upgrades.cargo = HULLS.courier.caps.cargo;
    game.ship.credits = 99999;
    buyUpgrade('cargo', 100);
    assert('hull cap blocks over-leveling', game.ship.upgrades.cargo === HULLS.courier.caps.cargo);

    // Christening persists
    nameShip('Verify Wren');
    const exported = JSON.parse(characterManager.exportCharacter());
    assert('christening sticks and persists',
        game.ship.name === 'Verify Wren' && exported.ship.name === 'Verify Wren' &&
        exported.ship.hullId === 'courier' && Array.isArray(exported.ship.log));

    // Restore the pre-suite ship
    game.ship.hullId = saved.hullId;
    game.ship.upgrades = saved.upgrades;
    game.ship.credits = saved.credits;
    game.ship.cargo = saved.cargo;
    game.ship.name = saved.name;
    game.pilot.perks = perksSaved;
    recomputeShipStats();
    game.currentPlanet = null;
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
