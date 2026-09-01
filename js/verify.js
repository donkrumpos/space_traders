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
    assert('rank table starts at Deckhand/0', PILOT_RANKS[0].xp === 0);
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
    assert('three berths at Chartbreaker aboard a clipper', crewSlots() === 3);
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
    assert('every hull has a silhouette', HULL_ORDER.every(id => HULL_SHAPES[id] && HULL_SHAPES[id].draw));

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

VERIFY_SUITES.mods = (assert) => {
    assert('catalog holds 9 one-off parts', Object.keys(MODS).length === 9);
    game.ship.mods = [];
    game.ship.hullId = 'skiff';
    recomputeShipStats();

    // Installing at the bench: charges, bolts on, logs, persists
    const planet = game.planets[0];
    game.currentPlanet = planet;
    planet.modOffers = ['vex_compressor'];
    game.ship.credits = 20000;
    const credits = game.ship.credits;
    const cargoBefore = game.ship.cargoMax;
    installMod('vex_compressor');
    assert('install charges and bolts on', game.ship.credits === credits - 1800 && hasMod('vex_compressor'));
    assert('compressor adds +6 cargo through recompute', game.ship.cargoMax === cargoBefore + 6);
    assert('the install lands in the ship\'s log', game.ship.log.some(e => e.text.includes('Vex-Pattern')));
    const exported = JSON.parse(characterManager.exportCharacter());
    assert('mods persist in the save', exported.ship.mods.includes('vex_compressor'));

    // One-of-a-kind: a second install refuses quietly
    const creditsAfter = game.ship.credits;
    installMod('vex_compressor');
    assert('duplicate install refuses', game.ship.credits === creditsAfter && game.ship.mods.length === 1);

    // The bench never re-offers what's already bolted on
    let stocked = 0;
    for (let i = 0; i < 200; i++) {
        generateModOffers(planet);
        if (planet.modOffers.length > 0) stocked++;
        if (planet.modOffers.includes('vex_compressor')) stocked = -999;
    }
    assert('bench stocks rotating unowned parts only', stocked > 0);

    // Quirks: rate effects compose at their call sites
    game.ship.mods.push('grinner_bore');
    assert('heat quirks stack compressor × bore', Math.abs(modHeatFactor() - 1.1 * 1.15) < 1e-9);
    assert('grinner bore hits 15% harder', modDamageFactor() === 1.15);
    game.ship.mods.push('whisper_coil');
    assert('whisperdrive trims fuel burn', modFuelFactor() === 0.9);
    applyMapRange();
    assert('coil interference scrambles the minimap', game.map.miniMapRange === Math.round(MINIMAP_BASE_RANGE
        * (hasPerk('long_range_scanner') ? 1.4 : 1) * 0.9));

    // Flats: plating adds hull, sheds top speed
    game.ship.mods.push('barnacle_plating');
    recomputeShipStats();
    assert('plating adds +40 hull', game.ship.hullMax === HULLS.skiff.baseHull + (game.ship.upgrades.hull - 1) * 50 + 40);
    assert('plating sheds half a point of speed', shipMaxSpeed() === HULLS.skiff.maxSpeed - 0.5);

    // The false deck blinds customs; lawless ports never scanned anyway
    game.ship.cargo.contraband = 5;
    const lawful = game.planets.find(p => !p.lawless);
    const lawless = game.planets.find(p => p.lawless);
    assert('customs sees a bare hold', customsRisk(lawful) === true && customsRisk(lawless) === false);
    game.ship.mods.push('smugglers_deck');
    assert('the false deck blinds customs', customsRisk(lawful) === false);
    delete game.ship.cargo.contraband;

    // Contract pay reads the songbird array live
    game.ship.mods.push('songbird_antenna');
    game.missions = [{ id: 'mod-pay-test', type: 'delivery', dest: lawful.name, goodType: 'food', qty: 1, reward: 1000 }];
    game.ship.cargo.food = 1;
    const payBefore = game.ship.credits;
    completeMissionsAt(lawful);
    const expected = Math.round(1000 * (hasPerk('contract_broker') ? 1.2 : 1) * 1.1);
    assert('songbird array lifts contract pay 10%', game.ship.credits === payBefore + expected);

    // Clean up
    game.ship.mods = [];
    recomputeShipStats();
    applyMapRange();
    game.currentPlanet = null;
    game.missions = [];
    updateMissionsUI();
};

VERIFY_SUITES.cargoScatter = (assert) => {
    // Destruction scatters the hold at the wreck (offline path: local drops)
    const saved = {
        cargo: { ...game.ship.cargo }, credits: game.ship.credits,
        x: game.ship.x, y: game.ship.y,
        hull: game.ship.hull, shield: game.ship.shield, streak: game.combatStreak
    };
    const dropsBefore = game.drops.length;
    game.ship.cargo = { food: 7, materials: 3 };
    handlePlayerDestruction();
    const pods = game.drops.slice(dropsBefore);
    assert('death scatters the hold into pods', pods.length === 3); // 5+2 food, 3 materials
    assert('pods carry every lost unit', pods.reduce((a, d) => a + d.amount, 0) === 10);
    assert('pods scatter around the wreck, not the respawn point',
        pods.every(d => Math.abs(d.x - saved.x) < 400 && Math.abs(d.y - saved.y) < 400));
    assert('the hold is empty after the wreck', Object.keys(game.ship.cargo).length === 0);
    assert('death still costs 25% credits', game.ship.credits === saved.credits - Math.floor(saved.credits * 0.25));

    // Death is a sequence, not a teleport: the ship holds at the wreck,
    // takes no further damage, and only moves home when the timer ends
    assert('death enters the wreck pause', !!game.deathState && game.ship.x === saved.x);
    const hullDuring = game.ship.hull;
    damagePlayer(50);
    assert('the wreck cannot be killed twice', game.ship.hull === hullDuring);
    finishPlayerRespawn();
    assert('respawn lands near the start planet with the pause cleared',
        !game.deathState && game.ship.x === 1050 && game.ship.shield === game.ship.shieldMax);

    // The Reliquary Hold keeps the cargo through a second wreck
    const savedMods = (game.ship.mods || []).slice();
    game.ship.mods = ['reliquary_hold'];
    game.ship.cargo = { food: 7, materials: 3 };
    const dropsBeforeVault = game.drops.length;
    handlePlayerDestruction();
    assert('reliquary hold spills nothing', game.drops.length === dropsBeforeVault);
    assert('reliquary hold keeps the cargo', game.ship.cargo.food === 7 && game.ship.cargo.materials === 3);
    finishPlayerRespawn();
    game.ship.mods = savedMods;

    // Restore — destruction moved and taxed the verify pilot
    game.drops.length = dropsBefore;
    game.ship.cargo = saved.cargo;
    game.ship.credits = saved.credits;
    game.ship.x = saved.x; game.ship.y = saved.y;
    game.ship.hull = saved.hull; game.ship.shield = saved.shield;
    game.combatStreak = saved.streak;
    updateUI();
};

VERIFY_SUITES.exploration = (assert) => {
    assert('POIs loaded from the shared roster', Array.isArray(game.pois) && game.pois.length >= 1);
    const poi = game.pois.find(p => p.id === 'wraith_cache') || game.pois[0];
    assert('a known POI exists', !!poi);

    // Snapshot everything the discovery mutates, so the suite leaves no trace
    const saved = {
        x: game.ship.x, y: game.ship.y,
        vx: game.ship.velocity.x, vy: game.ship.velocity.y,
        credits: game.ship.credits, cargo: { ...game.ship.cargo },
        xp: game.pilot.xp, rank: game.pilot.rank,
        pending: game.pilot.pendingPerkChoices,
        discovered: (game.pilot.discoveredPOIs || []).slice(),
        mine: poi.mine, charted: poi.charted, chartedBy: poi.chartedBy,
        paused: game.paused, mods: (game.ship.mods || []).slice(),
        questSeeds: (game.pilot.questSeeds || []).slice()
    };

    // Fresh site: unknown to this pilot
    poi.mine = false; poi.charted = false; poi.chartedBy = null;
    game.pilot.discoveredPOIs = (game.pilot.discoveredPOIs || []).filter(id => id !== poi.id);

    // Out of range → no discovery
    game.ship.x = poi.x + 99999; game.ship.y = poi.y;
    updatePOIDetection();
    assert('a distant POI is not discovered', poi.mine === false);

    // Fly into range → claim it
    const creditsBefore = game.ship.credits;
    game.ship.x = poi.x - 40; game.ship.y = poi.y;
    game.ship.velocity.x = 0; game.ship.velocity.y = 0;
    updatePOIDetection();
    assert('flying within range charts the POI', poi.mine === true && poi.charted === true);
    assert('the POI records a charter name', typeof poi.chartedBy === 'string' && poi.chartedBy.length > 0);
    assert('discovery is persisted to the pilot', game.pilot.discoveredPOIs.includes(poi.id));

    const r = poi.reward || {};
    if (r.credits) {
        // credits reward + any hold-full overflow payout, minus nothing else here
        assert('credits reward was granted', game.ship.credits >= creditsBefore + r.credits);
    }
    if (r.relics) {
        assert('relics were stowed in the hold', (game.ship.cargo.relics || 0) >= 1);
    }

    // Idempotent: re-entering the same site grants nothing more
    const creditsAfterClaim = game.ship.credits;
    updatePOIDetection();
    assert('re-entering a claimed POI does not re-grant', game.ship.credits === creditsAfterClaim);

    // Server landmark path: a peer's discovery charts the site WITHOUT a reward
    poi.mine = false; poi.charted = false; poi.chartedBy = null;
    game.ship.x = saved.x + 88888; // well away so detection can't re-claim it
    const creditsBeforePeer = game.ship.credits;
    applyDiscoveredPOIsFromServer({ [poi.id]: { pilot: 'Peer', at: 1 } });
    assert('a peer discovery charts the site as a landmark', poi.charted === true && poi.chartedBy === 'Peer');
    assert('a peer discovery grants no reward and no personal claim',
        poi.mine === false && game.ship.credits === creditsBeforePeer);

    // Reward-schema rails (Slice 3): mod + questSeed grants. Cap the rank first
    // so the extra XP can't stack perk-choice overlays mid-suite.
    if (typeof PILOT_RANKS !== 'undefined') game.pilot.rank = PILOT_RANKS.length - 1;

    const choir = game.pois.find(p => p.reward && p.reward.mod);
    if (choir) {
        choir.mine = false; choir.charted = false;
        game.ship.x = choir.x - 40; game.ship.y = choir.y;
        updatePOIDetection();
        assert('a POI can grant a ship mod', hasMod(choir.reward.mod));
    }
    const dig = game.pois.find(p => p.reward && p.reward.questSeed);
    if (dig) {
        dig.mine = false; dig.charted = false;
        game.ship.x = dig.x - 40; game.ship.y = dig.y;
        updatePOIDetection();
        assert('a POI questSeed is recorded for the future quest system',
            Array.isArray(game.pilot.questSeeds) && game.pilot.questSeeds.includes(dig.reward.questSeed));
    }

    // Restore — discovery moved the ship, paid out, and stowed cargo
    if (choir) { choir.mine = false; choir.charted = false; choir.chartedBy = null; }
    if (dig) { dig.mine = false; dig.charted = false; dig.chartedBy = null; }
    game.pilot.questSeeds = saved.questSeeds;
    game.ship.x = saved.x; game.ship.y = saved.y;
    game.ship.velocity.x = saved.vx; game.ship.velocity.y = saved.vy;
    game.ship.credits = saved.credits; game.ship.cargo = saved.cargo;
    game.ship.mods = saved.mods;
    game.pilot.xp = saved.xp; game.pilot.rank = saved.rank;
    game.pilot.pendingPerkChoices = saved.pending;
    game.pilot.discoveredPOIs = saved.discovered;
    poi.mine = saved.mine; poi.charted = saved.charted; poi.chartedBy = saved.chartedBy;
    game.paused = saved.paused;
    updateUI();
};

VERIFY_SUITES.starfield = (assert) => {
    assert('stars carry a tiling field', game.stars.length > 0 &&
        game.stars.every(s => s.fieldW > 0 && s.fieldH > 0));
    // The old fixed-rectangle starfield emptied when the camera flew far
    // (especially negative). The wrap must tile every star back into its field
    // at any camera — so the origin region of screen space is always populated.
    const camX = -73000.5, camY = 61234.25; // far-flung, deliberately unaligned
    let inField = 0;
    game.stars.forEach(s => {
        let x = s.x - camX * s.depth;
        let y = s.y - camY * s.depth;
        x = ((x % s.fieldW) + s.fieldW) % s.fieldW;
        y = ((y % s.fieldH) + s.fieldH) % s.fieldH;
        if (x >= 0 && x < s.fieldW && y >= 0 && y < s.fieldH) inField++;
    });
    assert('every star tiles back into its field far from origin (no empty sky)',
        inField === game.stars.length);
};

VERIFY_SUITES.salvage = (assert) => {
    // Client half of M6 regenerating caches. Readiness/ETA/reward-apply are
    // exercised directly; the claim wire itself is verify-net's job.
    const poi = game.pois.find(p => p.id === 'wraith_cache') || game.pois[0];
    const now = Date.now();
    const saved = {
        charted: poi.charted, mine: poi.mine, next: poi.nextSalvageAt, asked: poi._salvageAskedAt,
        occ: poi.occupation,
        credits: game.ship.credits, cargo: { ...game.ship.cargo }, cargoMax: game.ship.cargoMax,
        xp: game.pilot.xp, rank: game.pilot.rank, pending: game.pilot.pendingPerkChoices,
        x: game.ship.x, y: game.ship.y, logLen: (game.ship.log || []).length
    };

    assert('salvage module loaded', typeof applyPOIState === 'function'
        && typeof poiSalvageReady === 'function' && typeof grantSalvageReward === 'function');
    assert('roster carries salvage tables', game.pois.every(p =>
        !SIM_POIS.find(s => s.id === p.id).salvage || typeof p.salvage === 'object'));

    // State apply + readiness math
    poi.charted = true;
    applyPOIState({ [poi.id]: { nextSalvageAt: now + 5 * 3600 * 1000 } });
    assert('poiState snapshot lands on the runtime POI', poi.nextSalvageAt === now + 5 * 3600 * 1000);
    assert('a future window is not ready', poiSalvageReady(poi) === false);
    assert('ETA reads in hours', poiSalvageEtaText(poi) === 'salvage in 5h');
    applyPOIStateUpdate({ id: poi.id, nextSalvageAt: now + 20 * 60 * 1000 });
    assert('poi.state broadcast updates the window', poiSalvageEtaText(poi) === 'salvage in 20m');
    poi.nextSalvageAt = now - 1000;
    assert('a past window is ready', poiSalvageReady(poi) === true && poiSalvageEtaText(poi) === 'salvage ready');
    poi.charted = false;
    assert('an uncharted site is never ready', poiSalvageReady(poi) === false);
    poi.charted = true;

    // Occupations (M6 slice 3): a dug-in band blocks the cache; liberation
    // (occupation cleared, window opened) hands it straight back.
    applyPOIStateUpdate({ id: poi.id, nextSalvageAt: now - 1000,
        occupation: { faction: 'Rustfang Cartel', color: '#ff5555', since: now } });
    assert('a dug-in band blocks salvage readiness',
        !!poi.occupation && poi.occupation.faction === 'Rustfang Cartel' && poiSalvageReady(poi) === false);
    applyPOIStateUpdate({ id: poi.id, nextSalvageAt: now - 1000, occupation: null });
    assert('liberation clears the block', poi.occupation === null && poiSalvageReady(poi) === true);

    // Reward apply: credits, relic stow with overflow payout, log line
    if (typeof PILOT_RANKS !== 'undefined') game.pilot.rank = PILOT_RANKS.length - 1; // no perk modal
    game.ship.cargo = {};
    game.ship.cargoMax = 1; // room for exactly one relic
    const c0 = game.ship.credits;
    grantSalvageReward(poi, { credits: 300, relics: 2, xp: 10 });
    assert('salvage pays credits + overflow for the unstowable relic',
        game.ship.credits === c0 + 300 + 120);
    assert('one relic stowed to the cap', game.ship.cargo.relics === 1);
    assert('salvage writes the ship log', (game.ship.log || []).some(e =>
        e && e.text && e.text.includes(`Salvaged ${poi.name}`)));

    // Offline: detection must not grant anything (the claim is server-owned)
    poi.mine = true;
    poi.nextSalvageAt = now - 1000;
    poi._salvageAskedAt = 0;
    game.ship.x = poi.x - 30; game.ship.y = poi.y;
    const c1 = game.ship.credits;
    updatePOIDetection();
    assert('offline fly-in claims nothing locally (server owns salvage)', game.ship.credits === c1);

    // Restore
    poi.charted = saved.charted; poi.mine = saved.mine;
    poi.nextSalvageAt = saved.next; poi._salvageAskedAt = saved.asked;
    poi.occupation = saved.occ;
    game.ship.credits = saved.credits; game.ship.cargo = saved.cargo; game.ship.cargoMax = saved.cargoMax;
    game.pilot.xp = saved.xp; game.pilot.rank = saved.rank; game.pilot.pendingPerkChoices = saved.pending;
    game.ship.x = saved.x; game.ship.y = saved.y;
    if (game.ship.log) game.ship.log.length = saved.logLen;
    updateUI();
};

VERIFY_SUITES.chronicle = (assert) => {
    // Client half of the M6 chronicle: ledger apply, digest math, panel.
    // Exercised with synthetic entries — no net layer involved (solo gate).
    const saved = {
        entries: chronicle.entries.slice(),
        lastSeen: chronicle.lastSeen,
        digestShown: chronicle.digestShown
    };
    const now = Date.now();

    assert('chronicle module loaded', typeof applyChronicleSnapshot === 'function'
        && typeof applyChronicleAdd === 'function' && typeof setChronicleLastSeen === 'function');
    assert('netChronicle console hook present', typeof netChronicle === 'function');

    assert('timeAgo buckets read right',
        chronicleTimeAgo(now - 30 * 1000, now) === 'just now' &&
        chronicleTimeAgo(now - 10 * 60 * 1000, now) === '10m ago' &&
        chronicleTimeAgo(now - 5 * 3600 * 1000, now) === '5h ago' &&
        chronicleTimeAgo(now - 3 * 86400 * 1000, now) === '3d ago');

    assert('every ledger kind formats to a human line',
        formatChronicleEntry({ kind: 'poi.charted', pilot: 'Arthur', poi: 'wraith_cache', name: 'The Wraith Cache' }) === 'Arthur charted The Wraith Cache' &&
        formatChronicleEntry({ kind: 'market.event', label: 'medicine shortage at Ossuary Drift', planet: 'Ossuary Drift' }) === 'medicine shortage at Ossuary Drift' &&
        formatChronicleEntry({ kind: 'boss.killed', pilot: 'Foggy', faction: 'Rustfang Cartel' }) === 'Foggy broke a Rustfang Cartel raid' &&
        formatChronicleEntry({ kind: 'poi.salvaged', pilot: 'Arthur', poi: 'p', name: 'The Site' }) === 'Arthur salvaged The Site' &&
        formatChronicleEntry({ kind: 'poi.occupied', faction: 'Iron Shoal', poi: 'p', name: 'The Site' }) === 'Iron Shoal raiders dug in at The Site' &&
        formatChronicleEntry({ kind: 'poi.liberated', pilot: 'Foggy', faction: 'Iron Shoal', poi: 'p', name: 'The Site' }) === 'Foggy drove the Iron Shoal out of The Site');
    assert('unknown kinds still print something',
        formatChronicleEntry({ kind: 'future.thing', pilot: 'X' }).includes('future.thing'));

    // Digest math: lastSeen splits the ledger into seen/unseen
    setChronicleLastSeen(now - 3600 * 1000); // "last flew an hour ago"
    applyChronicleSnapshot([
        { at: now - 2 * 3600 * 1000, kind: 'market.event', label: 'old news', planet: 'X' },
        { at: now - 30 * 60 * 1000, kind: 'poi.charted', pilot: 'Peer', poi: 'p', name: 'Site' },
        { at: now - 60 * 1000, kind: 'boss.killed', pilot: 'Peer', faction: 'Void Choir' }
    ]);
    let view = netChronicle();
    assert('snapshot adopted into the ledger', view.count === 3);
    assert('unseen counts only entries after lastSeen', view.unseen === 2);
    assert('digest fires once per connect', view.digestShown === true);
    assert('panel is visible with entries',
        document.getElementById('chroniclePanel').style.display === 'block' &&
        document.getElementById('chronicleList').textContent.includes('Peer charted Site'));

    // Live append rides chronicle.add
    applyChronicleAdd({ at: now, kind: 'poi.charted', pilot: 'Live', poi: 'q', name: 'New Site' });
    view = netChronicle();
    assert('chronicle.add appends', view.count === 4 &&
        view.latest[view.latest.length - 1].text === 'Live charted New Site');

    // A brand-new pilot (lastSeen 0) missed nothing by definition
    setChronicleLastSeen(0);
    assert('new pilot has no unseen backlog', netChronicle().unseen === 0);

    // Ledger cap holds
    const flood = [];
    for (let i = 0; i < 150; i++) flood.push({ at: now - i, kind: 'market.event', label: `e${i}`, planet: 'X' });
    applyChronicleSnapshot(flood);
    assert('client ledger caps at 100', netChronicle().count === 100);

    // Restore — empty ledger hides the panel again for a clean sidebar
    chronicle.entries = saved.entries;
    chronicle.lastSeen = saved.lastSeen;
    chronicle.digestShown = saved.digestShown;
    updateChroniclePanelUI();
    assert('restored ledger leaves no trace',
        netChronicle().count === saved.entries.length &&
        (saved.entries.length > 0 || document.getElementById('chroniclePanel').style.display === 'none'));
};

VERIFY_SUITES.vitals = (assert) => {
    // The schematic Vitals band (docs/ship-design-vision.md §7): the drawn
    // ship must exist, encode capacity as form, and flash damage in place.
    const ship = game.ship;
    const saved = {
        cargo: { ...ship.cargo }, fuel: ship.fuel, shield: ship.shield,
        engines: ship.systems.engines, ammo: ship.weapons.missiles.ammo
    };

    updateUI();
    assert('schematic slots drawn', document.querySelectorAll('#shipSchematic .slot').length === 7);
    assert('bay grid holds one cell per cargo unit',
        document.querySelectorAll('#svCargoGrid rect').length === ship.cargoMax);
    assert('missile pips match the rack',
        document.querySelectorAll('#svMissilePips circle').length === ship.weapons.missiles.maxAmmo);

    // Cargo fills cells in the good's own color and writes the manifest
    ship.cargo = { relics: 2 };
    updateUI();
    const cells = document.querySelectorAll('#svCargoGrid rect');
    assert('cargo fills bay cells in good colors',
        cells[0].getAttribute('fill') === goods.relics.color &&
        cells[1].getAttribute('fill') === goods.relics.color &&
        cells[2].getAttribute('fill') === '#081808');
    assert('manifest names the cargo',
        document.getElementById('cargoManifest').textContent.includes('Precursor Relics'));

    // Shield envelope thins as the charge drops
    ship.shield = ship.shieldMax;
    updateUI();
    const wFull = parseFloat(document.getElementById('svShieldEnv').getAttribute('stroke-width'));
    ship.shield = ship.shieldMax / 4;
    updateUI();
    const wLow = parseFloat(document.getElementById('svShieldEnv').getAttribute('stroke-width'));
    assert('shield envelope thins as charge drops', wLow < wFull);

    // Damage flashes the exact part
    ship.systems.engines = 'damaged';
    updateUI();
    assert('downed engines turn red and flash on the drawing',
        document.getElementById('svEngL').getAttribute('stroke') === '#ff4d4d' &&
        document.getElementById('svEngL').classList.contains('schem-flash'));
    ship.systems.engines = 'ok';
    updateUI();
    assert('repair clears the flash',
        !document.getElementById('svEngL').classList.contains('schem-flash'));

    // Fuel spine fill tracks the tank
    ship.fuel = ship.fuelMax / 2;
    updateUI();
    assert('fuel spine sits at half tank',
        Math.abs(parseFloat(document.getElementById('svFuelFill').getAttribute('height')) - 26) < 1);

    // Spent missile tubes go dark
    ship.weapons.missiles.ammo = 1;
    updateUI();
    const pips = document.querySelectorAll('#svMissilePips circle');
    assert('spent missile tubes go dark',
        pips[0].getAttribute('fill') === '#ffdd44' &&
        (pips.length < 2 || pips[1].getAttribute('fill') === '#333333'));

    // Restore
    ship.cargo = saved.cargo; ship.fuel = saved.fuel; ship.shield = saved.shield;
    ship.systems.engines = saved.engines; ship.weapons.missiles.ammo = saved.ammo;
    updateUI();
};

VERIFY_SUITES.records = (assert) => {
    // Records tabs (UI Slice 2): the reference panels share one tabbed area.
    // Tab visibility mirrors each page's inline "has content" display signal;
    // .rec-on marks the selected page; badges keep news visible while its
    // panel is hidden. The pages' own display semantics are asserted by the
    // factions/crew/chronicle suites — this one covers the tab layer.
    const tab = key => document.getElementById('recTab-' + key);
    const badge = key => document.getElementById('recBadge-' + key);
    const page = id => document.getElementById(id);
    const saved = {
        missions: game.missions, grudges: game.pilot.grudges,
        entries: chronicle.entries.slice(), lastSeen: chronicle.lastSeen
    };
    const now = Date.now();

    assert('permanent records always earn a tab',
        tab('ship').style.display !== 'none' &&
        tab('missions').style.display !== 'none' &&
        tab('ledger').style.display !== 'none');

    selectRecordsTab('ledger');
    assert('selected page is the one shown',
        page('ledgerPanel').classList.contains('rec-on') &&
        getComputedStyle(page('ledgerPanel')).display !== 'none' &&
        !page('shipPanel').classList.contains('rec-on') &&
        getComputedStyle(page('shipPanel')).display === 'none');
    assert('selection persists for the next session',
        localStorage.getItem('space_trader_records_tab') === 'ledger');

    // Attention cues: hiding the missions panel never hides the count
    game.missions = [{ type: 'bounty', name: 'Test Mark', nearPlanet: 'X', reward: 100 }];
    updateMissionsUI();
    assert('missions tab badges the active count',
        badge('missions').textContent === '1' && badge('missions').style.display !== 'none');
    game.missions = [];
    updateMissionsUI();
    assert('missions badge clears with the log', badge('missions').style.display === 'none');

    // Conditional tabs ride their record's content signal
    game.pilot.grudges = { 'Rustfang Cartel': 2, 'Iron Shoal': 1 };
    updateFactionUI();
    assert('rep tab appears with grudges held',
        tab('rep').style.display !== 'none' && badge('rep').textContent === '2');
    selectRecordsTab('rep');
    assert('rep page selectable once available',
        page('factionPanel').classList.contains('rec-on') &&
        getComputedStyle(page('factionPanel')).display !== 'none');
    game.pilot.grudges = {};
    updateFactionUI();
    assert('cleared grudges retire the rep tab and fall back',
        tab('rep').style.display === 'none' &&
        !page('factionPanel').classList.contains('rec-on') &&
        (page('shipPanel').classList.contains('rec-on') || page('missionsPanel').classList.contains('rec-on')));

    // Galaxy Log: unseen count rides the tab; reading the log clears it
    setChronicleLastSeen(now - 3600 * 1000);
    applyChronicleSnapshot([
        { at: now - 2 * 3600 * 1000, kind: 'market.event', label: 'old news', planet: 'X' },
        { at: now - 60 * 1000, kind: 'poi.charted', pilot: 'Peer', poi: 'p', name: 'Site' }
    ]);
    assert('log tab appears with entries and badges the unseen count',
        tab('log').style.display !== 'none' && badge('log').textContent === '1');
    selectRecordsTab('log');
    assert('reading the log clears its unseen badge',
        page('chroniclePanel').classList.contains('rec-on') &&
        badge('log').style.display === 'none');

    // Restore — and the stored tab preference back to something permanent
    game.missions = saved.missions;
    game.pilot.grudges = saved.grudges;
    chronicle.entries = saved.entries;
    chronicle.lastSeen = saved.lastSeen;
    updateMissionsUI();
    updateFactionUI();
    updateChroniclePanelUI();
    selectRecordsTab('ship');
    assert('restored state leaves a permanent tab selected',
        page('shipPanel').classList.contains('rec-on'));
};

VERIFY_SUITES.now = (assert) => {
    // The Now zone (UI Slice 3): the old Navigation panel reads the situation
    // and shows only what matters there. Force each state, assert the zone
    // swaps (data-now + body content), and check the priority order:
    // engaged > docked > combat > fuel > dockrange > event > poi > cruise.
    const ship = game.ship;
    const zone = document.getElementById('nowZone');
    const body = document.getElementById('nowBody');
    const saved = {
        fuel: ship.fuel, emergencyFuel: ship.emergencyFuel, shield: ship.shield,
        enemies: game.enemies, pois: game.pois,
        isDocked: game.isDocked, isEngaged: game.isEngaged,
        inDockingRange: game.inDockingRange, nearPlanet: game.nearPlanet,
        currentPlanet: game.currentPlanet, streak: game.combatStreak,
        evRange: typeof eventSystem !== 'undefined' && eventSystem.inEventRange,
        evNear: typeof eventSystem !== 'undefined' && eventSystem.nearEvent
    };

    // Neutral baseline: nothing near, tank full → cruising
    game.enemies = []; game.pois = [];
    game.isDocked = false; game.isEngaged = false;
    game.inDockingRange = false; game.nearPlanet = null;
    ship.fuel = Math.max(ship.fuel, 100);
    if (typeof eventSystem !== 'undefined') { eventSystem.inEventRange = false; eventSystem.nearEvent = null; }
    updateUI();
    assert('quiet space reads as cruising',
        zone.getAttribute('data-now') === 'cruise' &&
        body.textContent.includes('Nearest:') && body.innerHTML.includes('for map'));

    // Near a POI: uncharted = a teasing contact, no name spoiler
    const poi = { id: 'vt', name: 'Verify Hulk', kind: 'derelict', x: ship.x + 300, y: ship.y,
                  dist: 300, inSensor: true, charted: false, mine: false, blurb: 'A test derelict.' };
    game.pois = [poi];
    updateUI();
    assert('uncharted contact teases without spoiling the name',
        zone.getAttribute('data-now') === 'poi' &&
        body.textContent.includes('Unknown contact') && !body.textContent.includes('Verify Hulk'));

    // Charted = name, glyph, charter credit, lore line — no market data
    poi.charted = true; poi.chartedBy = 'Tester';
    updateUI();
    assert('charted site shows name, glyph, and charter',
        body.textContent.includes('Verify Hulk') && body.textContent.includes('⬡') &&
        body.textContent.includes('charted by Tester') && body.textContent.includes('300u E'));
    assert('site lore line rides along', body.textContent.includes('A test derelict.'));

    // Salvage window and occupation both surface on the card
    poi.mine = true; poi.nextSalvageAt = Date.now() - 1000;
    updateUI();
    assert('ready cache reads salvage ready', body.textContent.includes('salvage ready'));
    poi.occupation = { faction: 'Rustfang Cartel', color: '#ff5555' };
    updateUI();
    assert('occupied site flies the ⚑ instead of salvage',
        body.textContent.includes('Occupied by Rustfang Cartel') && !body.textContent.includes('salvage ready'));

    // Docking range outranks the POI card
    game.inDockingRange = true; game.nearPlanet = game.planets[0];
    updateUI();
    assert('docking range owns the zone with SPACE prompt',
        zone.getAttribute('data-now') === 'dockrange' &&
        body.textContent.includes(game.planets[0].name) && body.innerHTML.includes('SPACE'));

    // Combat outranks everything undocked; boss, count, range, weapon keys
    game.enemies = [
        { x: ship.x + 200, y: ship.y, isBoss: false, tierName: 'Scout' },
        { x: ship.x + 400, y: ship.y, isBoss: true, tierName: 'Warlord Redjaw', reward: 800 }
    ];
    updateUI();
    assert('hostiles in range flip the zone to combat',
        zone.getAttribute('data-now') === 'combat' &&
        body.textContent.includes('2 hostiles') && body.textContent.includes('nearest 200u'));
    assert('bounty target and weapon keys shown',
        body.textContent.includes('Warlord Redjaw') && body.textContent.includes('$800') &&
        body.innerHTML.includes('>X<'));
    ship.shield = 0;
    updateUI();
    assert('shields-down alarm fires in combat', body.textContent.includes('SHIELDS DOWN'));
    ship.shield = saved.shield;

    // Fuel emergency (no hostiles left): banner + nearest fuel stop
    game.enemies = [];
    ship.fuel = 0; ship.emergencyFuel = 10;
    updateUI();
    assert('dry tank turns the zone into the fuel emergency',
        zone.getAttribute('data-now') === 'fuel' &&
        body.textContent.includes('emergency power') && body.textContent.includes('Nearest fuel:'));
    ship.emergencyFuel = 0;
    updateUI();
    assert('spent emergency reserve reads solar sail', body.textContent.includes('solar sail'));
    ship.fuel = saved.fuel; ship.emergencyFuel = saved.emergencyFuel;

    // Docked is modal: it outranks combat and fuel both
    game.enemies = saved.enemies && saved.enemies.length ? saved.enemies
        : [{ x: ship.x + 100, y: ship.y, isBoss: false, tierName: 'Scout' }];
    game.isDocked = true; game.currentPlanet = game.planets[0];
    updateUI();
    assert('docked outranks the fight outside',
        zone.getAttribute('data-now') === 'docked' &&
        body.textContent.includes(game.planets[0].name));

    // Restore
    ship.fuel = saved.fuel; ship.emergencyFuel = saved.emergencyFuel; ship.shield = saved.shield;
    game.enemies = saved.enemies; game.pois = saved.pois;
    game.isDocked = saved.isDocked; game.isEngaged = saved.isEngaged;
    game.inDockingRange = saved.inDockingRange; game.nearPlanet = saved.nearPlanet;
    game.currentPlanet = saved.currentPlanet; game.combatStreak = saved.streak;
    if (typeof eventSystem !== 'undefined') { eventSystem.inEventRange = saved.evRange; eventSystem.nearEvent = saved.evNear; }
    updateUI();
};

VERIFY_SUITES.icons = (assert) => {
    // Goods glyph language (visual-language Slice A): one drawn symbol per
    // good in the injected sprite, rendered only through goodIcon(), and
    // present on every surface that names a good.
    const ship = game.ship;
    const saved = { cargo: { ...ship.cargo }, missions: game.missions, ledger: economy.ledger };

    const goodKeys = Object.keys(goods);
    assert('sprite carries one symbol per good',
        document.querySelectorAll('#glyphSprite symbol').length === goodKeys.length &&
        goodKeys.every(g => document.getElementById('g-' + g)));
    assert('goodIcon renders a use of the right symbol',
        goodIcon('relics').includes('href="#g-relics"') &&
        goodIcon('relics').includes('<title>Precursor Relics</title>'));
    assert('unknown goods degrade to a colored square, not a hole',
        goodIcon('nonsense') === '' && !goodIcon('nonsense').includes('<use'));

    ship.cargo = { materials: 3 };
    updateUI();
    assert('cargo manifest leads with the glyph',
        document.getElementById('cargoManifest').innerHTML.includes('#g-materials'));

    economy.ledger = { 'Verify Port': { buy: { food: 12 }, sell: { technology: 55 } } };
    updateLedgerUI();
    const ledgerHtml = document.getElementById('ledgerList').innerHTML;
    assert('ledger rows carry glyphs for both sides',
        ledgerHtml.includes('#g-food') && ledgerHtml.includes('#g-technology'));

    game.missions = [{ type: 'delivery', qty: 2, goodType: 'medicine', dest: 'Verify Port', reward: 100 }];
    updateMissionsUI();
    assert('delivery missions carry the cargo glyph',
        document.getElementById('missionList').innerHTML.includes('#g-medicine'));

    ship.cargo = saved.cargo;
    game.missions = saved.missions;
    economy.ledger = saved.ledger;
    updateMissionsUI();
    updateLedgerUI();
    updateUI();
};

VERIFY_SUITES.districts = (assert) => {
    // Dock districts (visual-language Slice B): the docked panel splits into
    // THE DOCK (services strip + market + board + crew) and THE SHIPYARD
    // (hulls + upgrades + weapons + bench) behind a walk-out door. Docking
    // always lands at the Dock; the door swaps districts.
    const dockD = document.getElementById('district-dock');
    const yardD = document.getElementById('district-yard');
    const id = x => document.getElementById(x);
    const filled = x => (id(x) ? id(x).innerHTML.trim().length > 0 : false);

    const planet = game.planets[0];
    const saved = {
        isDocked: game.isDocked, currentPlanet: game.currentPlanet,
        credits: game.ship.credits, cargo: { ...game.ship.cargo },
        xp: game.pilot.xp, rank: game.pilot.rank, pending: game.pilot.pendingPerkChoices,
        missions: game.missions.slice(), visited: (characterManager.character &&
            characterManager.character.progress.planetsVisited.slice()) || null
    };
    // Cap the rank so the docking XP can't stack a perk-choice overlay mid-suite
    if (typeof PILOT_RANKS !== 'undefined') game.pilot.rank = PILOT_RANKS.length - 1;

    dock(planet);
    assert('docking lands on the Dock, not the Shipyard',
        dockD.classList.contains('on') && !yardD.classList.contains('on'));
    assert('door reads walk-to-the-Shipyard on arrival',
        id('districtDoor').textContent.includes('walk to the Shipyard'));

    // The Dock renders the seconds loop
    assert('the Dock carries market + board + crew',
        filled('buyingSection') && filled('sellingSection') &&
        filled('missionBoard') && filled('crewSection'));
    assert('the services strip carries live costs',
        id('fuelCost').textContent.trim() !== '' &&
        id('missileCost').textContent.trim() !== '' &&
        id('repairCost').textContent.trim() !== '');
    assert('the services strip draws its three service glyphs',
        !!document.querySelector('#servicesStrip use[href="#s-fuel"]') &&
        !!document.querySelector('#servicesStrip use[href="#s-rearm"]') &&
        !!document.querySelector('#servicesStrip use[href="#s-repair"]'));

    // The door swaps to the Shipyard, which renders the considered purchases
    walkDistrict();
    assert('the door swaps to the Shipyard',
        yardD.classList.contains('on') && !dockD.classList.contains('on') &&
        id('districtDoor').textContent.includes('walk back'));
    assert('the Shipyard carries hulls + upgrades + weapons + bench',
        filled('shipyardSection') && filled('upgradesSection') &&
        filled('weaponSystemsSection') && filled('modsSection'));

    // Walking back returns to the Dock
    walkDistrict();
    assert('walking back returns to the Dock', dockD.classList.contains('on'));

    // Re-docking always re-lands at the Dock, even left out at the yard
    walkDistrict(); // out to the Shipyard
    dock(planet);
    assert('re-docking always re-lands at the Dock',
        dockD.classList.contains('on') && !yardD.classList.contains('on'));

    // Restore — docking drifted markets and posted offers; undo the pilot state
    undock();
    game.isDocked = saved.isDocked;
    game.currentPlanet = saved.currentPlanet;
    game.ship.credits = saved.credits;
    game.ship.cargo = saved.cargo;
    game.pilot.xp = saved.xp;
    game.pilot.rank = saved.rank;
    game.pilot.pendingPerkChoices = saved.pending;
    game.missions = saved.missions;
    if (saved.visited) characterManager.character.progress.planetsVisited = saved.visited;
    updateUI();
    updateMissionsUI();
};

VERIFY_SUITES.deals = (assert) => {
    // Ledger-fed deal bars (visual-language Slice C): market rows grade the
    // here-price against YOUR best recorded price at OTHER ports; the Ledger
    // tab regroups by good with the best-known price glowing. An empty ledger
    // draws nothing — scouting is what builds your market sense.
    const saved = { ledger: economy.ledger, currentPlanet: game.currentPlanet };
    const planet = game.planets[0]; // Agricon Prime: produces food, demands 3 goods
    game.currentPlanet = planet;
    const buyEl = document.getElementById('buyingSection');
    const sellEl = document.getElementById('sellingSection');

    const gBuy = Object.keys(planet.produces)[0];
    const gSell = Object.keys(planet.demands)[0];
    const buyHere = getBuyPrice(planet, gBuy);
    const sellHere = getSellPrice(planet, gSell);

    // Empty ledger = no comparison anywhere
    economy.ledger = {};
    updateBuyingSectionUI();
    updateSellingSectionUI();
    assert('an empty ledger draws no deal bars',
        buyEl.querySelectorAll('.deal-line').length === 0 &&
        sellEl.querySelectorAll('.deal-line').length === 0);

    // Scouted ledger: the here-port is recorded (must NOT compare against
    // itself) plus one rival port that's worse both ways
    economy.ledger[planet.name] = { buy: { [gBuy]: buyHere }, sell: { [gSell]: sellHere } };
    economy.ledger['Verify Rival'] = {
        buy: { [gBuy]: buyHere + 20 },
        sell: { [gSell]: Math.max(1, sellHere - 20) }
    };
    updateBuyingSectionUI();
    updateSellingSectionUI();
    assert('a cheaper-than-known buy row reads cheapest known',
        !!buyEl.querySelector(`.deal-line[data-good="${gBuy}"][data-verdict="best"]`) &&
        buyEl.textContent.includes('cheapest known'));
    assert('a better-than-known sell row reads best sell known',
        !!sellEl.querySelector(`.deal-line[data-good="${gSell}"][data-verdict="best"]`) &&
        sellEl.textContent.includes('best sell known'));
    assert('a good never priced elsewhere shows no comparison',
        buyEl.querySelectorAll('.deal-line').length === 1 &&
        sellEl.querySelectorAll('.deal-line').length === 1);

    // Flip the rival to beat the here-price — the row grades red
    economy.ledger['Verify Rival'].buy[gBuy] = Math.max(1, buyHere - 20);
    economy.ledger['Verify Rival'].sell[gSell] = sellHere + 20;
    updateBuyingSectionUI();
    updateSellingSectionUI();
    assert('a pricier-than-known buy row reads worse than known',
        !!buyEl.querySelector(`.deal-line[data-good="${gBuy}"][data-verdict="bad"]`) &&
        buyEl.textContent.includes('worse than known'));
    assert('a weaker-than-known sell row reads worse than known',
        !!sellEl.querySelector(`.deal-line[data-good="${gSell}"][data-verdict="bad"]`));

    // The Ledger tab as a chart: grouped by good, best price marked
    economy.ledger = {
        'Verify Port A': { buy: { food: 12 }, sell: { technology: 58 } },
        'Verify Port B': { buy: { food: 19 }, sell: { technology: 41 } }
    };
    updateLedgerUI();
    const led = document.getElementById('ledgerList');
    const foodGroup = led.querySelector('.lgood[data-good="food"][data-side="buy"]');
    const techGroup = led.querySelector('.lgood[data-good="technology"][data-side="sell"]');
    assert('the ledger tab groups by good, a bar per station',
        !!foodGroup && !!techGroup &&
        foodGroup.querySelectorAll('.lrow').length === 2 &&
        techGroup.querySelectorAll('.lrow').length === 2);
    assert('the best-known price glows in each group',
        foodGroup.querySelector('.lrow.best').getAttribute('data-station') === 'Verify Port A' &&
        techGroup.querySelector('.lrow.best').getAttribute('data-station') === 'Verify Port A');
    assert('every price stays visible on the chart',
        led.textContent.includes('$12') && led.textContent.includes('$19') &&
        led.textContent.includes('$58') && led.textContent.includes('$41'));

    // Restore
    economy.ledger = saved.ledger;
    game.currentPlanet = saved.currentPlanet;
    updateLedgerUI();
    if (game.currentPlanet) {
        updateBuyingSectionUI();
        updateSellingSectionUI();
    }
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
