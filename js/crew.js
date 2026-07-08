// Named crew: hire hands at station bars. Each brings one passive knack.
// Crew are people, not stat lines — names and quirks are where a six-year-old
// attaches. Berths unlock with pilot rank: 1 at Pilot, 2 at Captain.

const CREW_ROLES = {
    engineer: {
        label: 'Engineer', color: '#88ffee', cost: 900,
        blurb: 'Patches knocked-out systems in 10s, no kit needed'
    },
    gunner: {
        label: 'Tail Gunner', color: '#ff8866', cost: 1100,
        blurb: 'Covers your six — rear bolt with every other volley'
    },
    navigator: {
        label: 'Navigator', color: '#aaccff', cost: 800,
        blurb: 'Plots leaner burns — 15% less fuel'
    }
};

const CREW_POOL = [
    { name: 'Sparks', quirk: 'Hums to the engines. They hum back.' },
    { name: 'Old Marlow', quirk: 'Flew freighters before you were born.' },
    { name: 'Juno', quirk: 'Keeps a pet rock named Gravel.' },
    { name: 'Pip', quirk: 'Smallest hands, fastest fixes.' },
    { name: 'Brick', quirk: 'Once punched an asteroid. The asteroid lost.' },
    { name: 'Moth', quirk: 'Only speaks in whispers. Aims loudly.' },
    { name: 'Doc Halide', quirk: 'Rates every station\'s noodles. All get 2 stars.' },
    { name: 'Wren', quirk: 'Navigates by starlight, checks the charts after.' },
    { name: 'Cabbage', quirk: 'Nobody remembers why. Cabbage doesn\'t say.' },
    { name: 'Tessa Twelve-Fingers', quirk: 'Counts higher than you.' },
    { name: 'Gully', quirk: 'Sleeps through raids, wakes for meals.' },
    { name: 'Sil', quirk: 'Bets on everything. Usually wins.' }
];

// Rank decides how many hands will sign on under you...
function crewRankSlots() {
    const rank = (game.pilot && game.pilot.rank) || 0;
    if (rank >= 7) return 3;
    if (rank >= 5) return 2;
    if (rank >= 2) return 1;
    return 0;
}

// ...but berths are physical: the hull decides how many bunks exist.
// A one-seater skiff carries nobody, whatever your rank says.
function crewSlots() {
    return Math.min(crewRankSlots(), currentHull().berths);
}

function crewHasRole(role) {
    return !!(game.pilot && game.pilot.crew.some(c => c.role === role));
}

function crewByRole(role) {
    return game.pilot && game.pilot.crew.find(c => c.role === role);
}

// Who's drinking at this station's bar right now (0-2 candidates, per docking)
function generateCrewOffers(planet) {
    planet.crewOffers = [];
    if (Math.random() > 0.6) return;
    const hiredNames = (game.pilot ? game.pilot.crew : []).map(c => c.name);
    const pool = CREW_POOL.filter(p => !hiredNames.includes(p.name));
    const roles = Object.keys(CREW_ROLES);
    const count = 1 + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < count && pool.length > 0; i++) {
        const person = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        const role = roles[Math.floor(Math.random() * roles.length)];
        planet.crewOffers.push({
            id: `crew-${Date.now()}-${i}`,
            name: person.name,
            quirk: person.quirk,
            role,
            cost: CREW_ROLES[role].cost
        });
    }
}

function hireCrew(offerId) {
    const planet = game.currentPlanet;
    if (!planet || !planet.crewOffers) return;
    const idx = planet.crewOffers.findIndex(o => o.id === offerId);
    if (idx === -1) return;
    const offer = planet.crewOffers[idx];

    if (game.pilot.crew.length >= crewSlots()) {
        showHudFeedback('No crew berths free — rank up or dismiss someone', 'error');
        return;
    }
    if (crewHasRole(offer.role)) {
        showHudFeedback(`You already have a ${CREW_ROLES[offer.role].label}`, 'error');
        return;
    }
    if (game.ship.credits < offer.cost) {
        showHudFeedback(`Insufficient credits! ${offer.name} signs on for $${offer.cost}.`, 'error');
        return;
    }

    game.ship.credits -= offer.cost;
    planet.crewOffers.splice(idx, 1);
    game.pilot.crew.push({ name: offer.name, role: offer.role, quirk: offer.quirk });
    showHudFeedback(`${offer.name} joins the crew as ${CREW_ROLES[offer.role].label}!`, 'success', 4000);
    playPickupSound();
    updateCrewPanelUI();
    updateCrewSectionUI(planet);
    updateUI();
    autoSave('hire');
}
window.hireCrew = hireCrew;

function dismissCrew(index) {
    const member = game.pilot.crew[index];
    if (!member) return;
    game.pilot.crew.splice(index, 1);
    showHudFeedback(`${member.name} packs their bunk and heads for the bar`, 'info', 3000);
    updateCrewPanelUI();
    if (game.isDocked && game.currentPlanet) updateCrewSectionUI(game.currentPlanet);
    characterManager.saveCharacter(true);
}
window.dismissCrew = dismissCrew;

// Sidebar panel: who's aboard
function updateCrewPanelUI() {
    const panel = document.getElementById('crewPanel');
    const list = document.getElementById('crewList');
    if (!panel || !list) return;
    const crew = (game.pilot && game.pilot.crew) || [];
    const slots = crewSlots();
    if (crew.length === 0 && slots === 0) {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = 'block';
    const rows = crew.map((c, i) => {
        const role = CREW_ROLES[c.role];
        return `<div style="margin-bottom:6px;">
            <div class="ledger-row"><span style="color:${role.color};">${c.name} · ${role.label}</span>
            <span onclick="dismissCrew(${i})" style="color:#664444; cursor:pointer;" title="Dismiss">✕</span></div>
            <div style="color:#777; font-size:10px;">${c.quirk}</div>
        </div>`;
    }).join('');
    const hullLimited = currentHull().berths <= slots && currentHull().berths < crewRankSlots();
    const hint = hullLimited ? ' — a bigger hull adds bunks'
        : slots < 1 ? '' : slots < 2 ? ' — next berth at Captain'
        : slots < 3 ? ' — third berth at Star Marshal' : '';
    const berths = `<div style="color:#666; font-size:10px;">Berths: ${crew.length}/${slots}${hint}</div>`;
    list.innerHTML = (rows || '<div style="color:#666;">Empty bunks — check station bars</div>') + berths;
}

// Station bar section inside the trading panel
function updateCrewSectionUI(planet) {
    const el = document.getElementById('crewSection');
    if (!el || !planet) return;
    const slots = crewSlots();
    if (slots === 0) {
        el.innerHTML = currentHull().berths === 0
            ? '<div style="color:#666;">No bunks on a one-seater — shipyards sell bigger hulls</div>'
            : '<div style="color:#666;">Crews sign on with ranked pilots — make Pilot rank first</div>';
        return;
    }
    const offers = planet.crewOffers || [];
    if (offers.length === 0) {
        el.innerHTML = '<div style="color:#666;">The bar is quiet — nobody\'s looking for a berth</div>';
        return;
    }
    el.innerHTML = offers.map(o => {
        const role = CREW_ROLES[o.role];
        const full = game.pilot.crew.length >= slots || crewHasRole(o.role);
        return `<div class="trade-item">
            <span><span style="color:${role.color};">${o.name}</span> · ${role.label}<br>
                <small style="color:#888;">${role.blurb}<br><em>${o.quirk}</em></small></span>
            <span>$${o.cost}</span>
            <button onclick="hireCrew('${o.id}')" ${full || game.ship.credits < o.cost ? 'disabled' : ''}>Hire</button>
        </div>`;
    }).join('');
}

// The engineer works while you fly: any knocked-out subsystem comes back
// online after 10 uninterrupted seconds, triage order same as field repair
function updateCrew(deltaTime) {
    const engineer = crewByRole('engineer');
    if (!engineer) return;
    const systems = game.ship.systems || {};
    const damaged = ['lifeSupport', 'engines', 'lasers'].filter(s => systems[s] === 'damaged');
    if (damaged.length === 0) {
        game.crewRepairTimer = 0;
        return;
    }
    game.crewRepairTimer = (game.crewRepairTimer || 0) + deltaTime;
    if (game.crewRepairTimer >= 10) {
        game.crewRepairTimer = 0;
        const fixed = damaged[0];
        systems[fixed] = 'ok';
        spawnFloater(game.ship.x, game.ship.y - 30, `${engineer.name.toUpperCase()} FIXED ${SUBSYSTEMS[fixed].label}`, '#66ff88', 14);
        showHudFeedback(`${engineer.name} patches the ${SUBSYSTEMS[fixed].label.toLowerCase()} back together`, 'success', 3500);
        playPickupSound();
        updateUI();
    }
}
