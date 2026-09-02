// Chronicle (M6): the world's memory. The server keeps a capped ledger of
// notable happenings (POI charters, broken raid bands, market events) in the
// persisted world snapshot; this module owns the client side — the Galaxy Log
// sidebar panel and the "while you were away" digest shown once per connect.
//
// Wire (docs/PROTOCOL.md M6): entries arrive in world.snapshot.chronicle
// (full ledger, newest last) and as chronicle.add broadcasts while connected.
// welcome.lastSeen is the server's save-stamp for THIS pilot's doc — anything
// newer happened while this pilot was away. Everything degrades gracefully
// offline: no entries → panel hidden, no digest (the solo ?verify gate runs
// with no net layer at all).

const CHRONICLE_CLIENT_MAX = 100; // mirror of the server cap

const chronicle = {
    entries: [],        // shared ledger, oldest → newest (server order)
    lastSeen: 0,        // welcome.lastSeen; 0 = brand-new pilot (no "away")
    digestShown: false  // one digest per (re)connect
};

// welcome landed: stamp lastSeen and re-arm the digest for this connection.
function setChronicleLastSeen(ts) {
    chronicle.lastSeen = Number(ts) || 0;
    chronicle.digestShown = false;
}

// world.snapshot.chronicle: adopt the server ledger wholesale, then (once per
// connect) surface what happened while this pilot was away.
function applyChronicleSnapshot(entries) {
    if (!Array.isArray(entries)) return;
    chronicle.entries = entries.slice(-CHRONICLE_CLIENT_MAX);
    updateChroniclePanelUI();
    maybeShowChronicleDigest();
}

// chronicle.add broadcast: something notable just happened. No toast here —
// live events already announce themselves (poi.discovered, market.event); the
// ledger just keeps the record.
function applyChronicleAdd(entry) {
    if (!entry || !entry.kind) return;
    chronicle.entries.push(entry);
    if (chronicle.entries.length > CHRONICLE_CLIENT_MAX) chronicle.entries.shift();
    updateChroniclePanelUI();
}

function chronicleUnseen() {
    if (!(chronicle.lastSeen > 0)) return []; // new pilot: nothing was missed
    return chronicle.entries.filter(e => e && e.at > chronicle.lastSeen);
}

function chronicleTimeAgo(at, now) {
    const ms = (now === undefined ? Date.now() : now) - at;
    if (ms < 90 * 1000) return 'just now';
    const mins = Math.round(ms / 60000);
    if (mins < 90) return `${mins}m ago`;
    const hours = Math.round(ms / 3600000);
    if (hours < 36) return `${hours}h ago`;
    return `${Math.round(ms / 86400000)}d ago`;
}

// One human line per entry. Unknown kinds print raw-ish rather than vanish —
// an old client should still show SOMETHING for a future server's entries.
function formatChronicleEntry(e) {
    if (!e) return '';
    switch (e.kind) {
        case 'poi.charted':
            return `${e.pilot} charted ${e.name || e.poi}`;
        case 'poi.salvaged':
            return `${e.pilot} salvaged ${e.name || e.poi}`;
        case 'poi.occupied':
            return `${e.faction} raiders dug in at ${e.name || e.poi}`;
        case 'poi.liberated':
            return `${e.pilot} drove the ${e.faction} out of ${e.name || e.poi}`;
        case 'market.event':
            return e.label || `market event at ${e.planet}`;
        case 'boss.killed':
            return e.faction ? `${e.pilot} broke a ${e.faction} raid` : `${e.pilot} broke a raid band`;
        default:
            return `${e.kind}${e.pilot ? ` — ${e.pilot}` : ''}`;
    }
}

// The once-per-connect "while you were away" digest: a headline plus the
// last few missed entries, through the same HUD channel everything else uses.
function maybeShowChronicleDigest() {
    if (chronicle.digestShown) return;
    chronicle.digestShown = true;
    const unseen = chronicleUnseen();
    if (unseen.length === 0 || typeof showHudFeedback !== 'function') return;
    showHudFeedback(`While you were away — ${unseen.length} ${unseen.length === 1 ? 'thing' : 'things'} happened out there`, 'warning', 8000);
    unseen.slice(-3).forEach(e => {
        showHudFeedback(`✦ ${formatChronicleEntry(e)} (${chronicleTimeAgo(e.at)})`, 'info', 8000);
    });
}

// --- The Log page: one history surface --------------------------------------
// Your ship's journal above, the galaxy's chronicle below (visual-language
// Slice D — the old Ship tab's log lines merged in here). Hidden until either
// has a line (offline/solo keeps the sidebar clean until the ship has a
// story). Chronicle entries newer than lastSeen glow — "new since you last
// flew".

function updateChroniclePanelUI() {
    const panel = document.getElementById('chroniclePanel');
    const list = document.getElementById('chronicleList');
    const journal = document.getElementById('journalList');
    if (!panel || !list) return;
    const shipLog = (typeof game !== 'undefined' && game.ship && game.ship.log) || [];
    if (chronicle.entries.length === 0 && shipLog.length === 0) {
        panel.style.display = 'none';
        updateRecordsTabs();
        return;
    }
    panel.style.display = 'block';

    if (journal) {
        journal.innerHTML = shipLog.length === 0 ? '' :
            `<div class="log-sect">ship's log</div>` +
            shipLog.slice(-6).reverse().map(e => `<div class="log-journal">${e.text}</div>`).join('');
    }

    const recent = chronicle.entries.slice(-8).reverse(); // newest first
    list.innerHTML = (recent.length === 0 ? '' : `<div class="log-sect">the reach's chronicle</div>`) +
        recent.map(e => {
            const fresh = chronicle.lastSeen > 0 && e.at > chronicle.lastSeen;
            return `<div style="font-size:10px; margin-top:3px; color:${fresh ? '#ffdd88' : '#8899aa'};">` +
                `${formatChronicleEntry(e)} <span style="color:#556677;">· ${chronicleTimeAgo(e.at)}</span></div>`;
        }).join('');
    updateRecordsTabs(); // Log tab appears with the first line; badge = unseen
}

// Relative timestamps drift while the panel sits open; a slow re-render keeps
// "just now" honest without touching the frame loop.
setInterval(() => {
    if (chronicle.entries.length > 0) updateChroniclePanelUI();
}, 60000);

// Console hook (playtest + verify-net harness)
window.netChronicle = function () {
    return {
        count: chronicle.entries.length,
        lastSeen: chronicle.lastSeen,
        unseen: chronicleUnseen().length,
        digestShown: chronicle.digestShown,
        latest: chronicle.entries.slice(-8).map(e => ({ at: e.at, kind: e.kind, text: formatChronicleEntry(e) }))
    };
};
