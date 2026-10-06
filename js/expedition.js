// The Singing Reactor expedition, client side (docs/expedition-design.md).
// Slice 1: the dispatcher at Lastlight, the preparation check, the mission
// row, and the signal pulse that leads a pilot to the hidden hauler.
//
// Everything here is PERSONAL (fork 1: one reactor per pilot): the contract
// lives on game.missions (saved with the character like escorts/bounties),
// the dispatcher entry is per-pilot (never a shared board slot), and the
// pulse is local math against ExpeditionCore.HAULER. Online and offline run
// the same path; nothing in slice 1 touches the wire.
//
// Timing rides the fixed-step tick (dt from physics update()), never
// performance.now() — headless virtual time must see the same pulses.

const EXP_PIPS_KEPT = 3; // the full map shows the last few fixes, fading

function expeditionMission() {
    return (game.missions || []).find(m => m && m.type === 'expedition') || null;
}

function expeditionRuntime() {
    if (!game.expedition) game.expedition = { t: 0, pips: [], announced: false };
    return game.expedition;
}

// --- The dispatcher (Frontier Outpost's mission board) -----------------------

function expeditionPrep() {
    const T = ExpeditionCore.EXPEDITION_TUNING;
    return ExpeditionCore.prepCheck({
        freeHold: Math.max(0, game.ship.cargoMax - cargoUnitsCarried()),
        kits: game.ship.cargo.parts || 0,
        logCount: (game.missions || []).length,
        logMax: 3
    });
}

function expeditionDispatchHtml(planet) {
    if (!planet || planet.name !== ExpeditionCore.DISPATCH_PORT) return '';
    const T = ExpeditionCore.EXPEDITION_TUNING;
    const active = expeditionMission();
    if (active) {
        return `<div class="trade-item" id="expeditionDispatch" style="border-color:#7744aa;">
            <span style="color:#cc99ff;">♪ THE SINGING REACTOR — under contract<br>
                <small style="color:#888;">${active.found ? 'You found the hauler. The reactor is still in its cradle.' : 'Follow the song. It comes in pulses, out of the SE dark.'}</small></span>
            <button onclick="abandonExpedition()">Abandon</button>
        </div>`;
    }
    if (!ExpeditionCore.offerAvailable(game.missions, game.ship.cargo, game.ship.mods)) return '';
    const prep = expeditionPrep();
    const checklist = prep.lines.map(l =>
        `<span style="color:${l.ok ? '#66ff88' : '#ff7766'};">${l.ok ? '✔' : '✖'} ${l.label}</span>`).join(' · ');
    return `<div class="trade-item" id="expeditionDispatch" style="border-color:#7744aa;">
        <span style="color:#cc99ff;">♪ DISPATCH: THE SINGING REACTOR<br>
            <small style="color:#aaa;">A Combine extraction hauler went dark in the Withdrawal with its cores still
            racked. One of them has started to sing. The last squawk came from the SE dark, past Lastlight,
            short of the Choir. Bring a reactor home.</small><br>
            <small style="color:#888;">Needs: ${checklist}</small><br>
            <small style="color:#888;">The pull draws on your drive — top the tank. The song carries; the Void Choir
            will hear you on the way back.</small><br>
            <small style="color:#ffdd44;">Pays $${T.reward.credits} and the reactor itself, fitted.</small></span>
        <button onclick="acceptExpedition()" ${prep.ok ? '' : 'disabled'}>Take it</button>
    </div>`;
}

function acceptExpedition() {
    const planet = game.currentPlanet;
    if (!planet || planet.name !== ExpeditionCore.DISPATCH_PORT) return;
    if (!ExpeditionCore.offerAvailable(game.missions, game.ship.cargo, game.ship.mods)) return;
    const prep = expeditionPrep();
    if (!prep.ok) {
        const missing = prep.lines.filter(l => !l.ok).map(l => l.label).join(', ');
        showHudFeedback(`Not ready: ${missing}`, 'error', 3500);
        return;
    }
    // Stamp from the sim clock where we have one; the id only needs to be unique.
    const mission = ExpeditionCore.makeExpedition(Date.now());
    game.missions.push(mission);
    const rt = expeditionRuntime();
    rt.t = ExpeditionCore.EXPEDITION_TUNING.pulsePeriodSec - 2; // first pulse soon after undock
    rt.pips = [];
    rt.announced = false;
    addShipLog('Took the Lastlight dispatch: a singing reactor, somewhere in the SE dark.');
    showHudFeedback('♪ Contract taken — listen for the song once you clear the port', 'success', 5000);
    updateMissionBoardUI(planet);
    updateMissionsUI();
    if (typeof autoSave === 'function') autoSave('mission');
}

function abandonExpedition() {
    const m = expeditionMission();
    if (!m) return;
    game.missions = game.missions.filter(x => x !== m);
    game.expedition = null;
    addShipLog('Let the Lastlight dispatch go. The song keeps on without us.');
    showHudFeedback('Expedition abandoned — the dispatcher will offer it again', 'info', 3500);
    if (game.currentPlanet) updateMissionBoardUI(game.currentPlanet);
    updateMissionsUI();
    if (typeof autoSave === 'function') autoSave('mission');
}

// --- The hunt (called every fixed tick from physics update()) ---------------

function updateExpedition(dt) {
    const m = expeditionMission();
    if (!m) return;
    const rt = expeditionRuntime();
    const T = ExpeditionCore.EXPEDITION_TUNING;

    // Pips age; the oldest fall off once there are more than we keep.
    rt.pips.forEach(p => { p.age += dt; });

    const dist = ExpeditionCore.distToHauler(game.ship.x, game.ship.y);
    m.lastDist = dist; // read by the Now zone + console helper

    // The pulse runs only in flight — a docked ship hears nothing.
    if (!game.isDocked) {
        rt.t += dt;
        if (rt.t >= T.pulsePeriodSec) {
            rt.t = 0;
            emitExpeditionPulse(m);
        }
    }

    // Arrival: the hauler is personal knowledge once you've been inside the ring.
    // Not while running silent — the Crawl's no-interactions-while-dark rule.
    if (!m.found && !game.hulkState && dist <= ExpeditionCore.HAULER.radius) {
        m.found = true;
        addShipLog(`Found ${ExpeditionCore.HAULER.name} — the song is coming from inside it.`);
        showHudFeedback(`♪ ${ExpeditionCore.HAULER.name}. Dead hull, racked cores — and one of them is singing.`, 'success', 6000);
        if (typeof spawnFloater === 'function') {
            spawnFloater(game.ship.x, game.ship.y - 30, 'HAULER FOUND', '#cc99ff', 16);
        }
        updateMissionsUI();
        if (typeof autoSave === 'function') autoSave('discovery');
    }
}

function emitExpeditionPulse(m) {
    const rt = expeditionRuntime();
    const fix = ExpeditionCore.pulseFix(game.ship.x, game.ship.y);
    rt.pips.push({ x: fix.x, y: fix.y, jitter: fix.jitter, age: 0 });
    while (rt.pips.length > EXP_PIPS_KEPT) rt.pips.shift();
    if (!rt.announced) {
        rt.announced = true;
        showHudFeedback('♪ The song — a pulse on the minimap. Fly toward where they cluster.', 'info', 5000);
    }
}

// --- Rendering ---------------------------------------------------------------

// Minimap: the latest pip glows while fresh. Out of range it clamps to the
// edge as a bearing (the escort precedent) — far out, the song is a direction.
function renderExpeditionMinimap(ctx, centerX, centerY, scale, range) {
    const m = expeditionMission();
    if (!m) return;
    const rt = expeditionRuntime();
    const T = ExpeditionCore.EXPEDITION_TUNING;
    const H = ExpeditionCore.HAULER;

    if (m.found) {
        const dx = H.x - game.ship.x, dy = H.y - game.ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const c = Math.min(dist, range - 8);
        ctx.fillStyle = '#cc99ff';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('♪', centerX + dx / dist * c * scale, centerY + dy / dist * c * scale + 3);
        return;
    }

    const pip = rt.pips[rt.pips.length - 1];
    if (!pip || pip.age > T.pulseLifeSec) return;
    const dx = pip.x - game.ship.x, dy = pip.y - game.ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const c = Math.min(dist, range - 8);
    const x = centerX + dx / dist * c * scale;
    const y = centerY + dy / dist * c * scale;
    const fade = 1 - pip.age / T.pulseLifeSec;
    ctx.globalAlpha = 0.3 + 0.7 * fade;
    ctx.fillStyle = '#cc99ff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    // A ring that grows as it fades: reads as "a sound", not a contact
    ctx.strokeStyle = '#cc99ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 3 + (1 - fade) * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

// Full map: the last few fixes, oldest faintest — the cluster IS the clue.
function renderExpeditionFullMap(ctx, scale, offsetX, offsetY) {
    const m = expeditionMission();
    if (!m) return;
    const rt = expeditionRuntime();
    const H = ExpeditionCore.HAULER;
    if (m.found) {
        ctx.fillStyle = '#cc99ff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('♪', H.x * scale + offsetX, H.y * scale + offsetY + 5);
        ctx.font = '9px Courier New';
        ctx.fillText(H.name, H.x * scale + offsetX, H.y * scale + offsetY - 10);
        return;
    }
    rt.pips.forEach((p, i) => {
        ctx.globalAlpha = 0.25 + 0.6 * ((i + 1) / rt.pips.length);
        ctx.fillStyle = '#cc99ff';
        ctx.beginPath();
        ctx.arc(p.x * scale + offsetX, p.y * scale + offsetY, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

// World: the hauler is drawn only for a pilot under contract who is close
// enough to see it (or has found it) — never a landmark for anyone else.
function renderExpeditionWorld(ctx, camera) {
    const m = expeditionMission();
    if (!m) return;
    const H = ExpeditionCore.HAULER;
    const dist = ExpeditionCore.distToHauler(game.ship.x, game.ship.y);
    if (!m.found && dist > 600) return;
    const sx = H.x - camera.x, sy = H.y - camera.y;
    if (sx < -260 || sx > game.canvas.width + 260 || sy < -260 || sy > game.canvas.height + 260) return;
    const t = Date.now();

    // The hull: a long dead box with its spine broken
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#2a2833';
    ctx.strokeStyle = '#555066';
    ctx.lineWidth = 2;
    ctx.fillRect(-46, -14, 60, 28);
    ctx.strokeRect(-46, -14, 60, 28);
    ctx.fillRect(18, -11, 30, 22);
    ctx.strokeRect(18, -11, 30, 22);
    // The singing core: a slow purple throb in the hold
    const throb = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.0025));
    ctx.globalAlpha = 0.4 + 0.6 * throb;
    ctx.fillStyle = '#cc99ff';
    ctx.beginPath();
    ctx.arc(-16, 0, 5 + throb * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.fillStyle = '#ddccff';
    ctx.font = '11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(H.name, sx, sy + 40);

    // The tether ring, shown when you're inside or near it
    if (dist < H.radius + 120) {
        ctx.strokeStyle = '#cc99ff';
        ctx.globalAlpha = dist <= H.radius ? 0.5 : 0.2;
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, H.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }
}

// --- The Now zone line (appended by ui.js updateNowZone in flight states) ---

function expeditionNowHtml() {
    const m = expeditionMission();
    if (!m) return '';
    const dist = m.lastDist != null ? m.lastDist : ExpeditionCore.distToHauler(game.ship.x, game.ship.y);
    if (m.found) {
        const inside = dist <= ExpeditionCore.HAULER.radius;
        return `<div class="now-dim" style="color:#cc99ff">♪ ${ExpeditionCore.HAULER.name}${inside ? ' — inside the ring' : ` · ${Math.floor(dist)}u ${nowCompass(ExpeditionCore.HAULER.x - game.ship.x, ExpeditionCore.HAULER.y - game.ship.y)}`}</div>`;
    }
    return `<div class="now-dim" style="color:#cc99ff">♪ the song is ${ExpeditionCore.signalWord(dist)}</div>`;
}

// --- Mission log row (economy.js updateMissionsUI) ----------------------------

function expeditionMissionRow(m) {
    const status = m.found ? 'hauler found' : 'following the song';
    return `<div class="ledger-row"><span>♪ Singing reactor — ${status}</span>
        <span style="color:#cc99ff;">$${m.reward}</span></div>`;
}

// --- Console helper ------------------------------------------------------------
window.expeditionStatus = function () {
    const m = expeditionMission();
    const rt = game.expedition;
    return {
        available: ExpeditionCore.offerAvailable(game.missions, game.ship.cargo, game.ship.mods),
        prep: expeditionPrep(),
        mission: m ? { stage: m.stage, found: m.found, dist: Math.round(m.lastDist || 0) } : null,
        pips: rt ? rt.pips.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), jitter: Math.round(p.jitter), age: +p.age.toFixed(1) })) : []
    };
};
