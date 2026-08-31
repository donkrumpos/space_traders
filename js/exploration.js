// Exploration: hidden points of interest out in the dark that pilots discover
// by flying to them. POI definitions are shared sim data (js/sim/pois.js →
// globalThis.SIM_POIS); this module owns the client runtime — detection,
// reward, rendering, and persistence. Everything here degrades gracefully with
// no net layer (the solo ?verify gate runs with no net object at all).
//
// Two distinct concepts per POI, deliberately separate:
//   poi.charted  — SHARED: the site is known to exist, drawn on the map as a
//                  landmark with its charter's name. Set by the server snapshot
//                  / broadcast, or by this pilot's own first visit.
//   poi.mine     — PER-PILOT: this pilot has personally reached it and claimed
//                  its reward. Local only (game.pilot.discoveredPOIs). Every
//                  family member gets their own discovery moment; the charter
//                  naming ("first charted by Arthur") is the bragging layer.

// Visual archetypes — a POI's `kind` picks its colour and glyph so sites read
// at a glance. Add kinds here as new archetypes arrive (Slice 2+).
const POI_KINDS = {
    derelict: { color: '#cc99ff', symbol: '⬡', label: 'Derelict' },
    anomaly:  { color: '#66e0ff', symbol: '✦', label: 'Anomaly' },
    cache:    { color: '#ffcc44', symbol: '◆', label: 'Cache' },
    beacon:   { color: '#ff6688', symbol: '◈', label: 'Beacon' },
    outpost:  { color: '#88ff99', symbol: '⌂', label: 'Hidden Outpost' }
};

function poiKind(poi) {
    return POI_KINDS[poi && poi.kind] || POI_KINDS.derelict;
}

// Build game.pois from the shared roster. Called from init() after game.planets.
function loadPOIs() {
    const roster = (typeof SIM_POIS !== 'undefined' && Array.isArray(SIM_POIS)) ? SIM_POIS : [];
    game.pois = roster.map(p => ({
        ...p,
        charted: false,     // shared landmark state
        chartedBy: null,    // name of the first charter (shared)
        mine: false,        // this pilot has personally claimed the reward
        inSensor: false,    // within sensor range this frame (drives the "?" ping)
        dist: Infinity
    }));
}

function poiById(id) {
    return (game.pois || []).find(p => p.id === id) || null;
}

function netPilotName() {
    try {
        if (game.pilot && game.pilot.name) return game.pilot.name;
    } catch (e) { /* fall through */ }
    return 'You';
}

// --- Local persistence: which POIs THIS pilot has claimed ------------------
// Stored on game.pilot (=== characterManager.character.pilot by reference, so
// it rides the normal save). Applied to game.pois on load.

function persistLocalDiscovery(id) {
    if (!game.pilot) return;
    if (!Array.isArray(game.pilot.discoveredPOIs)) game.pilot.discoveredPOIs = [];
    if (!game.pilot.discoveredPOIs.includes(id)) {
        game.pilot.discoveredPOIs.push(id);
        if (typeof characterManager === 'object' && characterManager.saveCharacter) {
            characterManager.saveCharacter(); // throttled — cheap to call
        }
    }
}

// Restore this pilot's personal discoveries onto the runtime POIs (call after
// the character doc is applied). A claimed site is also charted for this pilot.
function applyLocalDiscoveries() {
    if (!game.pois || !game.pilot || !Array.isArray(game.pilot.discoveredPOIs)) return;
    game.pilot.discoveredPOIs.forEach(id => {
        const poi = poiById(id);
        if (poi) {
            poi.mine = true;
            poi.charted = true;
            if (!poi.chartedBy) poi.chartedBy = netPilotName();
        }
    });
}

// --- Server shared state ----------------------------------------------------
// The server snapshot carries discoveredPOIs: { id: { pilot, at } } — the
// galaxy-wide charter record. Applied as landmark state (charted + chartedBy),
// never as a reward (reward is per-pilot, earned by flying there).

function applyDiscoveredPOIsFromServer(map) {
    if (!game.pois || !map) return;
    Object.keys(map).forEach(id => {
        const poi = poiById(id);
        if (!poi) return;
        const rec = map[id] || {};
        poi.charted = true;
        if (rec.pilot) poi.chartedBy = rec.pilot; // server is canonical for the name
    });
}

// A single poi.discovered broadcast (someone charted a site just now).
function applyPOIDiscovered(msg) {
    const poi = poiById(msg && msg.id);
    if (!poi) return;
    const wasCharted = poi.charted;
    poi.charted = true;
    if (msg.pilot) poi.chartedBy = msg.pilot;
    // A peer's discovery is a quiet map update unless it's brand-new to us and
    // not our own claim — then a small note that the sector was charted.
    if (!wasCharted && !poi.mine && msg.pilot && msg.pilot !== netPilotName()
        && typeof showHudFeedback === 'function') {
        showHudFeedback(`${msg.pilot} charted ${poi.name}`, 'info', 4000);
    }
}

// --- Regenerating caches (M6) ----------------------------------------------
// The server owns cache readiness (world.poiState → poi.nextSalvageAt here).
// A pilot who has already claimed a site (poi.mine) and flies back in when the
// cache is ready sends poi.salvage; FIRST claim galaxy-wide wins (the shared
// mission-board precedent), and the server rolls the next 12-24h window.
// A pilot who never claimed the site gets their discovery moment instead —
// salvage never fires for them (no double reward). Offline: nextSalvageAt
// never arrives, so nothing here runs — solo play is untouched.

// world.snapshot.poiState: { id: { nextSalvageAt } }
function applyPOIState(map) {
    if (!game.pois || !map) return;
    Object.keys(map).forEach(id => {
        const poi = poiById(id);
        if (poi && map[id]) poi.nextSalvageAt = map[id].nextSalvageAt;
    });
}

// poi.state broadcast: one site's window moved (someone salvaged, or a charter
// seeded the first cycle).
function applyPOIStateUpdate(msg) {
    const poi = poiById(msg && msg.id);
    if (poi) poi.nextSalvageAt = msg.nextSalvageAt;
}

function poiSalvageReady(poi) {
    return !!(poi && poi.charted && typeof poi.nextSalvageAt === 'number'
        && Date.now() >= poi.nextSalvageAt);
}

// "salvage in 5h" map annotation for a site you've already claimed
function poiSalvageEtaText(poi) {
    if (!poi || typeof poi.nextSalvageAt !== 'number') return null;
    const ms = poi.nextSalvageAt - Date.now();
    if (ms <= 0) return 'salvage ready';
    if (ms < 3600 * 1000) return `salvage in ${Math.max(1, Math.round(ms / 60000))}m`;
    return `salvage in ${Math.round(ms / 3600000)}h`;
}

const SALVAGE_RETRY_MS = 10000; // don't spam claims while parked in the radius

function trySalvagePOI(poi) {
    if (!window.net || !window.net.online || typeof window.net.salvagePOI !== 'function') return;
    const now = Date.now();
    if (poi._salvageAskedAt && now - poi._salvageAskedAt < SALVAGE_RETRY_MS) return;
    poi._salvageAskedAt = now;
    window.net.salvagePOI(poi.id).then(res => {
        if (res && typeof res.nextSalvageAt === 'number') poi.nextSalvageAt = res.nextSalvageAt;
        if (res && res.ok) grantSalvageReward(poi, res.reward || {});
        // ok:false = someone beat us to it (or not ready after all) — the
        // reply's nextSalvageAt already pushed the marker out; stay quiet.
    }).catch(() => { /* offline blip — detection retries next pass */ });
}

// Apply exactly what the server granted. Same hold-cap rule as discovery:
// relics that don't fit pay out instead of vanishing.
function grantSalvageReward(poi, r) {
    if (r.credits) {
        game.ship.credits += r.credits;
        if (characterManager && characterManager.character) {
            characterManager.character.progress.totalCreditsEarned += r.credits;
        }
    }
    let stowed = 0;
    if (r.relics) {
        const free = Math.max(0, game.ship.cargoMax - cargoUnitsCarried());
        stowed = Math.min(r.relics, free);
        if (stowed > 0) game.ship.cargo.relics = (game.ship.cargo.relics || 0) + stowed;
        if (stowed < r.relics) game.ship.credits += (r.relics - stowed) * 120;
    }
    if (typeof addShipLog === 'function') addShipLog(`Salvaged ${poi.name}.`);
    const kind = poiKind(poi);
    if (typeof playPickupSound === 'function') playPickupSound();
    if (typeof spawnFloater === 'function') {
        spawnFloater(game.ship.x, game.ship.y - 54, `${kind.symbol} Salvaged: ${poi.name}`, kind.color, 15);
        if (r.credits) spawnFloater(game.ship.x, game.ship.y - 34, `+$${r.credits}`, '#ffdd44', 13);
        if (stowed > 0) spawnFloater(game.ship.x, game.ship.y - 18, `+${stowed} relics`, kind.color, 13);
    }
    if (typeof showHudFeedback === 'function') {
        showHudFeedback(`${kind.symbol} Salvaged ${poi.name} — the cache will rebuild in time`, 'success', 5000);
    }
    if (r.xp && typeof addXP === 'function') {
        addXP(r.xp, 'salvage'); // saves + updates UI
    } else {
        if (typeof updateUI === 'function') updateUI();
        if (typeof characterManager === 'object' && characterManager.saveCharacter) {
            characterManager.saveCharacter();
        }
    }
}

// --- Detection: fly within discoveryRadius to claim ------------------------
// Called from update() on the alive path (never while paused or dead). Sensor
// range = the minimap range, which perks/mods already scale (long_range_scanner,
// whisper_coil) — so exploration gear does double duty.

function updatePOIDetection() {
    if (!game.pois || game.pois.length === 0) return;
    const sensor = (game.map && game.map.miniMapRange) || 1500;
    for (const poi of game.pois) {
        const dx = poi.x - game.ship.x;
        const dy = poi.y - game.ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        poi.dist = dist;
        poi.inSensor = dist <= sensor;
        if (dist <= (poi.discoveryRadius || 75)) {
            if (!poi.mine) {
                claimPOI(poi);
            } else if (poiSalvageReady(poi)) {
                trySalvagePOI(poi); // regenerated cache — first claim wins
            }
        }
    }
}

// This pilot reaches a site for the first time: grant the reward, mark it mine,
// chart it, persist, and (online) tell the server so it becomes a shared
// landmark under whoever charted it first.
function claimPOI(poi) {
    if (poi.mine) return;
    poi.mine = true;
    const firstEver = !poi.charted;      // nobody (we know of) had charted it
    poi.charted = true;
    if (!poi.chartedBy) poi.chartedBy = netPilotName();
    grantPOIReward(poi);
    persistLocalDiscovery(poi.id);
    announceDiscovery(poi, firstEver);
    if (window.net && window.net.online && typeof window.net.discoverPOI === 'function') {
        window.net.discoverPOI(poi.id); // fire-and-forget; server owns the charter name
    }
}

// Apply a POI reward. Every field is optional (forward-compatible with the
// RPG/quest milestone). Returns a short list of human-readable reward lines.
function grantPOIReward(poi) {
    const r = poi.reward || {};
    const lines = [];

    if (r.credits) {
        game.ship.credits += r.credits;
        if (characterManager && characterManager.character) {
            characterManager.character.progress.totalCreditsEarned += r.credits;
        }
        lines.push(`+$${r.credits}`);
    }

    if (r.relics) {
        const free = Math.max(0, game.ship.cargoMax - cargoUnitsCarried());
        const stowed = Math.min(r.relics, free);
        if (stowed > 0) {
            game.ship.cargo.relics = (game.ship.cargo.relics || 0) + stowed;
            lines.push(`+${stowed} ${goods.relics.name}`);
        }
        if (stowed < r.relics) {
            // No room for the rest — pay it out so a full hold never wastes loot
            const overflowPay = (r.relics - stowed) * 120;
            game.ship.credits += overflowPay;
            lines.push(`+$${overflowPay} (hold full)`);
        }
    }

    if (r.mod && typeof MODS === 'object' && MODS[r.mod] && !hasMod(r.mod)) {
        if (!game.ship.mods) game.ship.mods = [];
        game.ship.mods.push(r.mod);
        if (typeof recomputeShipStats === 'function') recomputeShipStats();
        lines.push(`Mod: ${MODS[r.mod].name}`);
    }

    if (r.lore) {
        // addShipLog wraps in the { t, text } shape the ship panel renders
        // (a raw string push showed as "undefined" in the log — M5 bug).
        if (typeof addShipLog === 'function') addShipLog(r.lore);
        else if (game.ship.log) game.ship.log.push({ t: Date.now(), text: r.lore });
    }

    // questSeed is reserved for the future quest system — record it so the
    // rail exists, but it grants nothing yet.
    if (r.questSeed) {
        if (!game.pilot.questSeeds) game.pilot.questSeeds = [];
        if (!game.pilot.questSeeds.includes(r.questSeed)) game.pilot.questSeeds.push(r.questSeed);
    }

    // XP last so its promotion check sees the credits/cargo already banked.
    if (r.xp && typeof addXP === 'function') {
        addXP(r.xp, 'discovery'); // addXP saves + updates UI
    } else {
        if (typeof updateUI === 'function') updateUI();
        if (typeof characterManager === 'object' && characterManager.saveCharacter) {
            characterManager.saveCharacter();
        }
    }

    return lines;
}

// The discovery flourish: floaters at the ship, a HUD banner, a little shake.
function announceDiscovery(poi, firstEver) {
    const kind = poiKind(poi);
    if (typeof addShake === 'function') addShake(0.25);
    if (typeof playBountySound === 'function') playBountySound();
    if (typeof spawnFloater === 'function') {
        spawnFloater(game.ship.x, game.ship.y - 54, `${kind.symbol} ${poi.name}`, kind.color, 18);
        const r = poi.reward || {};
        let dy = -34;
        if (r.credits) { spawnFloater(game.ship.x, game.ship.y + dy, `+$${r.credits}`, '#ffdd44', 13); dy += 16; }
        if (r.relics)  { spawnFloater(game.ship.x, game.ship.y + dy, `+${r.relics} relics`, kind.color, 13); }
    }
    if (typeof showHudFeedback === 'function') {
        const tag = firstEver ? 'DISCOVERED' : 'Reached';
        showHudFeedback(`${kind.symbol} ${tag}: ${poi.name}`, 'warning', 6000);
        if (poi.blurb) showHudFeedback(poi.blurb, 'info', 8000);
    }
}

// --- Rendering: main view ---------------------------------------------------
// Charted sites draw as their icon + name; uncharted sites within sensor range
// draw as a faint pulsing "?" contact (the tease). Uncharted + out of sensor =
// invisible (fog). Called from render() after planets.

function renderPOIs(ctx, camera) {
    if (!game.pois || game.pois.length === 0) return;
    const t = Date.now();
    game.pois.forEach(poi => {
        const screenX = poi.x - camera.x;
        const screenY = poi.y - camera.y;
        if (screenX < -60 || screenX > game.canvas.width + 60 ||
            screenY < -60 || screenY > game.canvas.height + 60) return;

        const kind = poiKind(poi);

        if (!poi.charted) {
            if (!poi.inSensor) return; // fog: unknown and out of sensor range
            // Unknown contact — a faint, pulsing "?" that pulls you in
            const pulse = 0.35 + 0.25 * Math.abs(Math.sin(t * 0.004));
            ctx.globalAlpha = pulse;
            ctx.strokeStyle = '#88aacc';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#aaccee';
            ctx.font = '14px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('?', screenX, screenY + 5);
            ctx.globalAlpha = 1;
            return;
        }

        // Charted landmark: icon, name, charter, and a discovery ring up close
        ctx.fillStyle = kind.color;
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(kind.symbol, screenX, screenY + 6);

        ctx.fillStyle = '#ffffff';
        ctx.font = '11px Courier New';
        ctx.fillText(poi.name, screenX, screenY + 22);

        if (poi.chartedBy) {
            ctx.fillStyle = '#7788aa';
            ctx.font = '8px Courier New';
            ctx.fillText(`charted by ${poi.chartedBy}${poi.mine ? ' ✓' : ''}`, screenX, screenY + 33);
        }

        // Regenerating cache (M6): a ready cache glows gold — the fly-back-out
        // pull; a claimed-but-cooling site shows when it's worth returning.
        const eta = poiSalvageEtaText(poi);
        if (eta) {
            const ready = poiSalvageReady(poi);
            ctx.fillStyle = ready ? '#ffcc44' : '#556677';
            if (ready) ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(t * 0.004));
            ctx.font = '8px Courier New';
            ctx.fillText(ready ? '✦ salvage ready' : eta, screenX, screenY + 44);
            ctx.globalAlpha = 1;
        }

        const ringR = poi.discoveryRadius || 75;
        if (poi.dist < ringR) {
            ctx.strokeStyle = kind.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(screenX, screenY, Math.min(ringR, 44), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    });
}

// --- Rendering: minimap -----------------------------------------------------
// Charted sites always blip (in range); uncharted-but-in-sensor sites show the
// pulsing "?" tease. Called from updateMiniMap().

function renderPOIMinimap(ctx, centerX, centerY, scale, range) {
    if (!game.pois) return;
    const t = Date.now();
    game.pois.forEach(poi => {
        const dx = poi.x - game.ship.x;
        const dy = poi.y - game.ship.y;
        if (dx * dx + dy * dy > range * range) return;
        const mapX = centerX + dx * scale;
        const mapY = centerY + dy * scale;
        const kind = poiKind(poi);

        if (!poi.charted) {
            const blink = Math.floor(t / 300) % 2 === 0;
            if (!blink) return;
            ctx.fillStyle = '#aaccee';
            ctx.font = '8px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('?', mapX, mapY + 3);
            return;
        }
        ctx.fillStyle = kind.color;
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(kind.symbol, mapX, mapY + 3);
    });
}

// --- Rendering: full map ----------------------------------------------------
// Only charted sites appear (landmarks). Uncharted stay hidden — the reward for
// exploring is filling in the map. Called from updateFullMap().

function renderPOIFullMap(ctx, scale, offsetX, offsetY) {
    if (!game.pois) return;
    game.pois.forEach(poi => {
        if (!poi.charted) return;
        const mapX = poi.x * scale + offsetX;
        const mapY = poi.y * scale + offsetY;
        const kind = poiKind(poi);
        ctx.fillStyle = kind.color;
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(kind.symbol, mapX, mapY + 5);
        ctx.fillStyle = '#ddddff';
        ctx.font = '10px Courier New';
        ctx.fillText(poi.name, mapX, mapY - 12);
        ctx.fillStyle = '#7788aa';
        ctx.font = '8px Courier New';
        ctx.fillText(kind.label + (poi.chartedBy ? ` · ${poi.chartedBy}` : ''), mapX, mapY + 18);
        if (poiSalvageReady(poi)) {
            ctx.fillStyle = '#ffcc44';
            ctx.fillText('✦ salvage ready', mapX, mapY + 28);
        }
    });
}

// Feed charted POIs into the full-map bounds so they fit on screen. Called from
// updateFullMap()'s bounds pass. Returns nothing; mutates the bounds object.
function extendBoundsWithPOIs(bounds) {
    if (!game.pois) return;
    game.pois.forEach(poi => {
        if (!poi.charted) return; // don't reveal uncharted positions via bounds
        bounds.minX = Math.min(bounds.minX, poi.x);
        bounds.maxX = Math.max(bounds.maxX, poi.x);
        bounds.minY = Math.min(bounds.minY, poi.y);
        bounds.maxY = Math.max(bounds.maxY, poi.y);
    });
}

// --- Console helpers (testing/playtest) ------------------------------------
window.listPOIs = function () {
    return (game.pois || []).map(p => ({
        id: p.id, name: p.name, kind: p.kind,
        charted: p.charted, chartedBy: p.chartedBy, mine: p.mine,
        dist: Math.round(p.dist), at: `(${p.x}, ${p.y})`,
        salvage: poiSalvageEtaText(p)
    }));
};
// Warp the ship next to a POI to test discovery without the long flight.
window.warpToPOI = function (id) {
    const poi = poiById(id) || (game.pois || [])[0];
    if (!poi) return 'no POIs';
    game.ship.x = poi.x - 40; game.ship.y = poi.y;
    game.ship.velocity.x = 0; game.ship.velocity.y = 0;
    return `warped to ${poi.name} at (${poi.x}, ${poi.y})`;
};
