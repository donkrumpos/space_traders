// M7 player factions — a banner is a declared want (lore-bible §9).
// The server owns the registry (world.snapshot.factions + faction.update);
// this module renders it: the charter desk in the Shipyard district, the
// banner card at the top of the Rep tab, invite prompts, and the ghost
// name-tag tint. Founding/joining go through net.js request helpers; the
// fee and rank gate live client-side like every credit spend (M3 rule).

const FACTION_FEE = 15000;       // what the desk keeps, either way
const FACTION_RANK_MIN = 3;      // Veteran — founding is earned

const FACTION_PALETTE = ['#44ddaa', '#ddaa44', '#dd44aa', '#aadd44', '#cc6644', '#66aacc'];
const FACTION_WANTS = [
    { kind: 'place', label: '⚓ a place — hold a site the reach forgot' },
    { kind: 'trade', label: '⇄ a trade — move what nobody else will' },
    { kind: 'grudge', label: '☠ a grudge — break the cartel that broke you' },
];

const factionState = {
    registry: {},        // server truth, keyed by lowercased name
    colorByPilot: {},    // derived: member pilot -> faction color (ghost tint)
    knownInvites: '',    // change detector for the invite HUD nudge
};

// Charter-desk form selections (the inputs live in re-rendered innerHTML,
// so picks are held here across renders)
const charterSel = { color: FACTION_PALETTE[0], kind: 'place' };

function myPilotName() {
    return (typeof netIdentity !== 'undefined' && netIdentity && netIdentity.pilot) || null;
}

// Online: registry truth. Offline: the pilot doc's mirror (render-only).
function myFaction() {
    const me = myPilotName();
    if (window.net && net.online && me) {
        for (const f of Object.values(factionState.registry)) {
            if (f.members && f.members.includes(me)) return f;
        }
        return null;
    }
    return (game.pilot && game.pilot.faction) || null;
}

function myInvites() {
    const me = myPilotName();
    if (!me || !(window.net && net.online)) return [];
    return Object.values(factionState.registry)
        .filter(f => f.invites && f.invites.includes(me) && !f.members.includes(me));
}

function applyFactionRegistry(registry) {
    if (!registry || typeof registry !== 'object') return;
    factionState.registry = registry;
    factionState.colorByPilot = {};
    for (const f of Object.values(registry)) {
        (f.members || []).forEach(p => { factionState.colorByPilot[p] = f.color; });
    }
    // Mirror membership onto the pilot doc so solo boots still show the banner
    const mine = myFaction();
    if (game.pilot) {
        const mirrored = game.pilot.faction && game.pilot.faction.name;
        const truth = mine && mine.name;
        if (mirrored !== truth) {
            game.pilot.faction = mine ? { name: mine.name, color: mine.color, want: mine.want } : null;
            characterManager.saveCharacter(true);
        }
    }
    // A fresh invitation gets one HUD nudge (the desk holds the papers)
    const inviteKey = myInvites().map(f => f.name).sort().join('|');
    if (inviteKey && inviteKey !== factionState.knownInvites && typeof showHudFeedback === 'function') {
        myInvites().forEach(f => showHudFeedback(
            `The ${f.name} signed you an invitation — the charter desk has the papers`, 'info', 8000));
    }
    factionState.knownInvites = inviteKey;
    if (typeof updateFactionUI === 'function') updateFactionUI();
    updateCharterDeskUI();
}

function factionColorOfPilot(pilot) {
    return factionState.colorByPilot[pilot] || null;
}

// --- The Rep tab's banner card (pilot.js updateFactionUI composes this in) --

function factionBannerHTML() {
    const f = myFaction();
    if (!f) return '';
    const me = myPilotName();
    const roster = (f.members || []).map(p => {
        const tag = p === f.founder ? ' — founder' : '';
        return `<div style="font-size:11px;">${p}${tag}</div>`;
    }).join('') || `<div style="font-size:11px;">${me || 'you'} — founder</div>`;
    const invites = (f.invites || []).length
        ? `<div style="font-size:10px; color:#888;">invited: ${f.invites.join(', ')}</div>` : '';
    const offline = (window.net && net.online) ? '' :
        `<div style="font-size:10px; color:#667;">(the roster lives on the reach — offline copy)</div>`;
    return `<div style="border:1px solid ${f.color}; padding:6px 8px; margin-bottom:8px;">
        <div><span style="display:inline-block; width:10px; height:10px; background:${f.color};"></span>
        <strong style="color:${f.color};">${f.name}</strong></div>
        <div style="font-size:11px; font-style:italic; color:#8aa;">"${(f.want && f.want.words) || ''}"</div>
        ${roster}${invites}${offline}</div>`;
}

// --- The charter desk (Shipyard district) -----------------------------------

function charterPickColor(c) { charterSel.color = c; updateCharterDeskUI(); }
function charterPickWant(k) { charterSel.kind = k; updateCharterDeskUI(); }

function updateCharterDeskUI() {
    const el = document.getElementById('charterDesk');
    if (!el) return;
    if (!(window.net && net.online)) {
        el.innerHTML = `<div style="color:#667; font-size:11px;">The desk clerk is out —
            banners are signed on the living reach.</div>`;
        return;
    }
    const mine = myFaction();
    if (mine) {
        const isFounder = mine.founder === myPilotName();
        const inviteRow = isFounder
            ? `<div style="margin-top:6px;"><input id="charterInvitee" type="text" maxlength="40"
                 placeholder="pilot name" style="width:120px;">
                 <button onclick="charterInvite()">sign an invitation</button></div>`
            : '';
        const leaveLabel = isFounder
            ? (mine.members.length > 1 ? '' : `<button onclick="charterLeave()" style="margin-top:6px;">fold the banner</button>`)
            : `<button onclick="charterLeave()" style="margin-top:6px;">walk from the banner</button>`;
        el.innerHTML = `<div style="font-size:11px;">You fly under
            <strong style="color:${mine.color};">${mine.name}</strong>.</div>${inviteRow}${leaveLabel}`;
        return;
    }
    const invites = myInvites();
    const inviteBlock = invites.map(f =>
        `<div style="margin-bottom:6px; font-size:11px;">The <strong style="color:${f.color};">${f.name}</strong>
         left papers for you — "<em>${(f.want && f.want.words) || ''}</em>"
         <button onclick="charterJoin('${f.name.replace(/'/g, "\\'")}')">sign on</button></div>`).join('');
    const rank = (game.pilot && game.pilot.rank) || 0;
    const gateOK = rank >= FACTION_RANK_MIN && game.credits >= FACTION_FEE;
    const gateNote = rank < FACTION_RANK_MIN
        ? `the clerk wants a ${PILOT_RANKS[FACTION_RANK_MIN].title}'s name on the articles (you're a ${PILOT_RANKS[rank].title})`
        : (game.credits < FACTION_FEE ? `the fee is ${FACTION_FEE.toLocaleString()} cr — the desk keeps it either way` : '');
    const swatches = FACTION_PALETTE.map(c =>
        `<span onclick="charterPickColor('${c}')" style="display:inline-block; width:16px; height:16px;
         background:${c}; cursor:pointer; margin-right:4px;
         ${c === charterSel.color ? 'outline:2px solid #ccffcc;' : ''}"></span>`).join('');
    const wants = FACTION_WANTS.map(w =>
        `<div onclick="charterPickWant('${w.kind}')" style="cursor:pointer; font-size:11px; padding:2px 4px;
         border:1px solid ${w.kind === charterSel.kind ? charterSel.color : '#234'};
         margin-top:3px;">${w.label}</div>`).join('');
    el.innerHTML = `${inviteBlock}
        <div style="font-size:11px; color:#8a8;">"Names are cheap. Names in the ledger aren't.
        Say what your crew wants and sign." — ${FACTION_FEE.toLocaleString()} cr</div>
        <div style="margin-top:6px;"><input id="charterName" type="text" maxlength="24"
            placeholder="banner name" style="width:140px;"></div>
        <div style="margin-top:6px;">${swatches}</div>
        ${wants}
        <div style="margin-top:6px;"><input id="charterWords" type="text" maxlength="60"
            placeholder="the want, in your own words" style="width:200px;"></div>
        <button onclick="charterFound()" ${gateOK ? '' : 'disabled'} style="margin-top:6px;">sign the articles</button>
        ${gateNote ? `<div style="font-size:10px; color:#a86;">${gateNote}</div>` : ''}
        <div style="font-size:10px; color:#966;">⚠ founding is chronicled — broadcast, permanent, never erased</div>`;
}

function charterFound() {
    const name = (document.getElementById('charterName') || {}).value || '';
    const words = (document.getElementById('charterWords') || {}).value || '';
    const rank = (game.pilot && game.pilot.rank) || 0;
    if (rank < FACTION_RANK_MIN || game.credits < FACTION_FEE) return;
    net.factionFound(name.trim(), charterSel.color, { kind: charterSel.kind, words: words.trim() })
        .then(res => {
            if (!res.ok) { showHudFeedback(res.reason || 'the clerk shakes their head', 'warning', 5000); return; }
            game.credits -= FACTION_FEE;
            showHudFeedback(`The ${res.faction.name} banner is in the ledger now — that's forever`, 'success', 6000);
            addShipLog(`Signed the articles: the ${res.faction.name} flies`);
            characterManager.saveCharacter(true);
            if (typeof updateUI === 'function') updateUI();
        })
        .catch(() => showHudFeedback('the ledger did not answer — try again', 'warning', 4000));
}

function charterInvite() {
    const pilot = ((document.getElementById('charterInvitee') || {}).value || '').trim();
    if (!pilot) return;
    net.factionInvite(pilot).then(res => {
        showHudFeedback(res.ok ? `Invitation signed for ${pilot}` : (res.reason || 'no'), res.ok ? 'info' : 'warning', 4000);
    }).catch(() => {});
}

function charterJoin(name) {
    net.factionJoin(name).then(res => {
        if (!res.ok) { showHudFeedback(res.reason || 'the papers fell through', 'warning', 5000); return; }
        showHudFeedback(`You fly under the ${res.faction.name} now`, 'success', 6000);
        addShipLog(`Signed on with the ${res.faction.name}`);
    }).catch(() => {});
}

function charterLeave() {
    net.factionLeave().then(res => {
        if (!res.ok) { showHudFeedback(res.reason || 'the clerk refuses', 'warning', 5000); return; }
        showHudFeedback('Your name is off the roster — the ledger remembers it was on', 'info', 6000);
    }).catch(() => {});
}

// Console hook (PROTOCOL M7)
window.netFactions = function() {
    return {
        registry: factionState.registry,
        mine: myFaction(),
        invites: myInvites().map(f => f.name),
    };
};
