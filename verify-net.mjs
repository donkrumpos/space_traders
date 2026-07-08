#!/usr/bin/env node
// verify-net.mjs — M1–M4 two-client convergence harness. Contract: docs/PROTOCOL.md.
// Spawns server/server.mjs on a scratch port with a temp SQLite DB, drives
// chrome-headless-shell pages via puppeteer-core, asserts PASS/FAIL lines,
// prints VERIFY-NET-PASS n/n (exit 0) or VERIFY-NET-FAIL (exit 1).
//
// The secret is preseeded into localStorage instead of passed as ?secret=verify:
// js/verify.js fires the solo suite on location.search.includes('verify'), so no
// harness URL may contain the lowercase substring "verify" (pilot=VerifyA is safe).

import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SERVER_MJS = path.join(ROOT, 'server', 'server.mjs');
const SECRET = 'verify';
const RUN_TIMEOUT_MS = 360000; // bumped 240s→360s at M4: [combat] adds retry loops (drop RNG, band-size sampling)

const results = [];
const S = {}; // shared cross-suite state (pages, port, expected xp)

function record(suite, name, pass, detail) {
    results.push({ suite, name, pass });
    console.log(`${pass ? 'PASS' : 'FAIL'} [${suite}] ${name}${!pass && detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Poll an async condition instead of fixed sleeps. Returns last truthy value or false.
async function until(fn, { timeout = 10000, every = 150 } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        try {
            const v = await fn();
            if (v) return v;
        } catch { /* hook not defined yet, page mid-navigation, etc. — keep polling */ }
        await sleep(every);
    }
    return false;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
    });
}

function portAccepts(port) {
    return new Promise(resolve => {
        const sock = net.connect({ port, host: '127.0.0.1' });
        sock.on('connect', () => { sock.destroy(); resolve(true); });
        sock.on('error', () => resolve(false));
    });
}

function chromePath() {
    const base = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
    let dirs;
    try {
        dirs = fs.readdirSync(base);
    } catch {
        throw new Error(`no chrome-headless-shell cache at ${base} — run the solo ?verify one-liner once to download it`);
    }
    dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (let i = dirs.length - 1; i >= 0; i--) {
        const p = path.join(base, dirs[i], 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
        if (fs.existsSync(p)) return p;
    }
    throw new Error(`no chrome-headless-shell binary under ${base}`);
}

// Fresh isolated context (own localStorage) + page with identity preseeded.
// `charDoc` extends the localStorage seeding pattern: a full character doc
// (see seedCharDoc) written before any script runs, so the game boots with
// seeded cargo/position instead of a blank default character.
// `tap` wires a WebSocket message recorder (window.__wsTap) so the harness can
// observe server messages the client ignores or doesn't store (debug.state
// replies, drop.taken, enemy.killed) without needing net.js to expose them.
// `stubPerks` no-ops the perk rank-up overlay (pilot.js) — [combat] kills grant
// XP past the 60-XP rank-up, and the modal sets game.paused (trap #2).
async function newGamePage(browser, pilot, { seedIdentity = true, stubNaming = true, charDoc = null, tap = false, stubPerks = false } = {}) {
    const context = await (browser.createBrowserContext
        ? browser.createBrowserContext()
        : browser.createIncognitoBrowserContext());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(String(err && err.message || err)));
    if (seedIdentity) {
        await page.evaluateOnNewDocument((p, s) => {
            localStorage.setItem('space_trader_pilot', p);
            localStorage.setItem('space_trader_secret', s);
        }, pilot, SECRET);
    }
    if (charDoc) {
        await page.evaluateOnNewDocument(doc => {
            localStorage.setItem('space_trader_character', JSON.stringify(doc));
        }, charDoc);
    }
    // Headless safety net: never block on a native dialog.
    await page.evaluateOnNewDocument(() => { window.prompt = () => null; });
    if (tap) await page.evaluateOnNewDocument(() => {
        window.__wsTap = [];
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
            constructor(...args) {
                super(...args);
                this.addEventListener('message', ev => {
                    try {
                        const m = JSON.parse(ev.data);
                        // skip the 10Hz firehose; keep the discrete events
                        if (m && m.t && m.t !== 'world.tick' && m.t !== 'peer.state') {
                            window.__wsTap.push(m);
                            if (window.__wsTap.length > 300) window.__wsTap.splice(0, 150);
                        }
                    } catch { /* non-JSON frame */ }
                });
            }
        };
    });
    if (stubPerks) await page.evaluateOnNewDocument(() => {
        window.addEventListener('load', () => {
            window.maybeShowPerkChoice = () => {};
            window.showPerkChoice = () => {};
        });
    });
    // An unnamed ship gets a christening overlay 600ms after load/adopt
    // (character.js applyCharacterToGame) which sets game.paused = true.
    // js/verify.js escapes it via the 'verify' URL substring, which harness
    // URLs must not contain — so name the ship directly, like verify.js does.
    // (Skipped for the ?verify solo page, which manages naming itself.)
    if (stubNaming) await page.evaluateOnNewDocument(() => {
        window.addEventListener('load', () => {
            window.showShipNaming = () => {};
            if (window.game && game.ship && !game.ship.name) game.ship.name = 'Verify Skiff';
            const overlay = document.getElementById('shipNamingOverlay');
            if (overlay) { overlay.remove(); game.paused = false; }
        });
    });
    return { context, page, errors };
}

// Character doc for localStorage preseeding — mirrors character.js
// createDefaultCharacter (version "1.0"). Ship comes NAMED (no christening
// modal) with 0 XP (dock +25 and a small sale stay under the 60-XP perk modal).
function seedCharDoc({ shipName, x, y, cargo = {}, credits = 1000 }) {
    return {
        version: '1.0',
        id: 'char_seed_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        created: Date.now(),
        lastPlayed: Date.now(),
        ship: {
            x, y, angle: 0, velocity: { x: 0, y: 0 },
            fuel: 500, fuelMax: 500, emergencyFuel: 25, emergencyFuelMax: 25,
            hull: 100, hullMax: 100, shield: 20, shieldMax: 20,
            credits, cargo, cargoMax: 10, hullId: 'skiff',
            name: shipName, mods: [], log: [],
            upgrades: { cargo: 1, engine: 1, shields: 1, fuel_tank: 1, hull: 1, weapons: 1 },
            weapons: {
                lasers: { cooldown: 0, maxCooldown: 500 },
                missiles: { cooldown: 0, maxCooldown: 2000, ammo: 5, maxAmmo: 5 }
            },
            systems: { lasers: 'ok', engines: 'ok', lifeSupport: 'ok' }
        },
        pilot: { xp: 0, rank: 0, perks: [], pendingPerkChoices: 0, grudges: {}, crew: [] },
        progress: {
            planetsVisited: [], eventsCompleted: [], enemiesDestroyed: 0,
            totalCreditsEarned: 0, distanceTraveled: 0, playtimeMinutes: 0
        },
        gameState: {
            isDocked: false, currentPlanet: null, isEngaged: false,
            currentEvent: null, lastPosition: { x, y }
        }
    };
}

// Key-order-independent equality for market/board objects that round-trip
// through different serializers (server snapshot vs client rebuild).
function stableStringify(v) {
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    if (v && typeof v === 'object') {
        return '{' + Object.keys(v).sort()
            .map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
}

// netWorld() console-hook readers (M3). Both tolerate the hook not existing
// yet so `until` can poll through page boot.
function marketFor(page, planetName) {
    return page.evaluate(p => {
        if (typeof netWorld !== 'function') return null;
        const w = netWorld();
        return (w && typeof w.marketFor === 'function' && w.marketFor(p)) || null;
    }, planetName);
}

function boardOffers(page, planetName) {
    return page.evaluate(p => {
        if (typeof netWorld !== 'function') return null;
        const w = netWorld();
        if (!w || typeof w.boardFor !== 'function') return null;
        const b = w.boardFor(p);
        if (!b) return null;
        return Array.isArray(b) ? b : (b.offers || []);
    }, planetName);
}

// ---------------------------------------------------------------------------
// Suites. M2-M4 append entries to SUITES; unknown message types are the
// server/client's forward-compat concern, new suites are the harness's.
// ---------------------------------------------------------------------------

// Suite 0 — solo gate: ?verify (no ws param) must stay green with the ws layer present.
async function soloSuite(t, { browser, base }) {
    const { context, page } = await newGamePage(browser, 'VerifySolo', { stubNaming: false });
    try {
        await page.goto(`${base}/index.html?verify`, { waitUntil: 'load' });
        const done = await until(async () => (await page.title()).startsWith('VERIFY-'), { timeout: 20000 });
        t('solo suite completed', !!done, 'document.title never became VERIFY-*');
        if (!done) return;
        const out = await page.evaluate(() => (document.getElementById('verifyOut') || {}).textContent || '');
        const final = out.trim().split('\n').pop() || '';
        const m = final.match(/^VERIFY-PASS (\d+)\/(\d+)$/);
        t(`solo gate green (${final || 'no verifyOut'})`, !!m && m[1] === m[2], out.split('\n').filter(l => l.startsWith('FAIL')).slice(0, 3).join(' | '));
    } finally {
        await context.close();
    }
}

async function handshakeSuite(t, { browser, base, wsUrl }) {
    S.A = await newGamePage(browser, 'VerifyA');
    S.B = await newGamePage(browser, 'VerifyB');
    await S.A.page.goto(`${base}/index.html?pilot=VerifyA&ws=${wsUrl}`, { waitUntil: 'load' });
    await S.B.page.goto(`${base}/index.html?pilot=VerifyB&ws=${wsUrl}`, { waitUntil: 'load' });

    const hooks = await S.A.page.evaluate(() =>
        typeof netStatus === 'function' && typeof netConnect === 'function' && typeof netForceDisconnect === 'function');
    t('net console hooks present', hooks, 'js/net.js missing netStatus/netConnect/netForceDisconnect');

    const aOn = await until(() => S.A.page.evaluate(() => netStatus().online === true));
    const bOn = await until(() => S.B.page.evaluate(() => netStatus().online === true));
    t('A online', !!aOn);
    t('B online', !!bOn);

    const nsA = await S.A.page.evaluate(() => netStatus());
    const nsB = await S.B.page.evaluate(() => netStatus());
    t('A pilot name', nsA && nsA.pilot === 'VerifyA', `got ${JSON.stringify(nsA && nsA.pilot)}`);
    t('B pilot name', nsB && nsB.pilot === 'VerifyB', `got ${JSON.stringify(nsB && nsB.pilot)}`);

    const aSeesB = await until(() => S.A.page.evaluate(() => (netStatus().peers || []).includes('VerifyB')));
    const bSeesA = await until(() => S.B.page.evaluate(() => (netStatus().peers || []).includes('VerifyA')));
    t('A sees B in peers', !!aSeesB);
    t('B sees A in peers', !!bSeesA);
}

async function savesyncSuite(t, { browser, base, wsUrl }) {
    const xp = await S.A.page.evaluate(() => grantXP(50));
    t('A grantXP(50)', xp === 50, `xp=${xp}`);
    S.charId = await S.A.page.evaluate(() => characterManager.character.id);

    const ackBase = await S.A.page.evaluate(() => netStatus().lastSaveAck || 0);
    await S.A.page.evaluate(() => characterManager.saveCharacter(true));
    const acked = await until(() => S.A.page.evaluate(b => (netStatus().lastSaveAck || 0) > b, ackBase));
    t('A save acked (lastSaveAck advanced)', !!acked);

    // Freeze A's local doc and take it offline so A2 becomes canonical for [conflict]:
    // any later local save on A would bump lastPlayed and legitimately win the sync rule.
    await S.A.page.evaluate(() => {
        characterManager.autoSaveEnabled = false;
        characterManager.pendingSave = false;
        netForceDisconnect();
    });

    // Fresh context, same pilot, empty localStorage → server-doc-vs-none: adopt server doc.
    S.A2 = await newGamePage(browser, 'VerifyA');
    await S.A2.page.goto(`${base}/index.html?pilot=VerifyA&ws=${wsUrl}`, { waitUntil: 'load' });
    const a2On = await until(() => S.A2.page.evaluate(() => netStatus().online === true));
    t('A2 online', !!a2On);
    const adopted = await until(() => S.A2.page.evaluate(() => game.pilot && game.pilot.xp === 50));
    t('A2 adopted server doc (xp 50)', !!adopted, `xp=${await S.A2.page.evaluate(() => game.pilot && game.pilot.xp)}`);
    const a2Id = await S.A2.page.evaluate(() => characterManager.character.id);
    t('A2 character id matches A', a2Id === S.charId, `A=${S.charId} A2=${a2Id}`);
    const stats = await S.A2.page.evaluate(() => getCharacterStats());
    t('A2 getCharacterStats returns doc', !!stats && typeof stats.credits === 'number');
}

async function conflictSuite(t) {
    // +5 keeps total xp at 55, under the 60-xp rank-up (perk overlay would pause the game).
    const xp = await S.A2.page.evaluate(() => grantXP(5));
    t('A2 grantXP(5) → 55', xp === 55, `xp=${xp}`);
    const ackBase = await S.A2.page.evaluate(() => netStatus().lastSaveAck || 0);
    await S.A2.page.evaluate(() => characterManager.saveCharacter(true));
    const acked = await until(() => S.A2.page.evaluate(b => (netStatus().lastSaveAck || 0) > b, ackBase));
    t('A2 save acked', !!acked);

    await S.A.page.evaluate(() => netConnect());
    const aOn = await until(() => S.A.page.evaluate(() => netStatus().online === true));
    t('A reconnected', !!aOn);
    const adopted = await until(() => S.A.page.evaluate(() => game.pilot && game.pilot.xp === 55));
    t('A adopted newer server doc (xp 55)', !!adopted, `xp=${await S.A.page.evaluate(() => game.pilot && game.pilot.xp)}`);
    const backup = await S.A.page.evaluate(() => localStorage.getItem('space_trader_character_backup'));
    t('A wrote backup before overwrite', !!backup);
}

async function reconnectSuite(t) {
    await S.A.page.evaluate(() => netForceDisconnect());
    const off = await until(() => S.A.page.evaluate(() => netStatus().online === false));
    t('A offline after forced disconnect', !!off);
    const running = await S.A.page.evaluate(() =>
        game.paused !== true && typeof game.ship.x === 'number');
    t('game still running offline', running);

    await S.A.page.evaluate(() => netConnect());
    const on = await until(() => S.A.page.evaluate(() => netStatus().online === true));
    t('A back online', !!on);
    const intact = await until(() => S.A.page.evaluate(() => game.pilot && game.pilot.xp === 55));
    t('character intact across reconnect (xp 55)', !!intact);
}

async function offlineSuite(t, { browser, base }) {
    // ws points at a dead port; param spelled without the substring "verify" (see header).
    S.O = await newGamePage(browser, 'VerifyOff');
    await S.O.page.goto(`${base}/index.html?netoffline&pilot=VerifyOff&ws=ws://127.0.0.1:1`, { waitUntil: 'load' });

    const booted = await until(() => S.O.page.evaluate(() => typeof game === 'object' && !!game.ship));
    t('game boots with dead ws', !!booted);
    const off = await until(() => S.O.page.evaluate(() => typeof netStatus === 'function' && netStatus().online === false));
    t('netStatus reports offline', !!off);

    const moved = await S.O.page.evaluate(async () => {
        const x0 = game.ship.x, y0 = game.ship.y;
        game.keys['ArrowUp'] = true;
        await new Promise(r => setTimeout(r, 700));
        game.keys['ArrowUp'] = false;
        const dist = Math.hypot(game.ship.x - x0, game.ship.y - y0);
        const vel = Math.hypot(game.ship.velocity ? game.ship.velocity.x : 0, game.ship.velocity ? game.ship.velocity.y : 0);
        return dist > 0.5 || vel > 0.01;
    });
    t('ship moves under thrust (solo physics ticks)', moved);
    t('no page errors', S.O.errors.length === 0, S.O.errors.slice(0, 2).join(' | '));
}

// Suite — M2 ghost presence (docs/PROTOCOL.md M2). Ghosts are render-only;
// reuses S.A/S.B from handshakeSuite. Destructive: closes S.A2 (dup VerifyA
// socket) up front and S.A itself for [leave] — later suites needing a second
// pilot must open fresh pages.
async function ghostSuite(t) {
    // Two live VerifyA sockets (S.A + S.A2 from savesync) make presence
    // ambiguous — retire A2 so S.A is the only VerifyA the server relays.
    if (S.A2) { await S.A2.context.close().catch(() => {}); S.A2 = null; }

    const hook = await S.B.page.evaluate(() => typeof netGhosts === 'function');
    t('netGhosts console hook present', hook, 'js/net.js missing netGhosts');
    if (!hook) return;

    // A2's close may broadcast peer.leave for VerifyA (same-pilot trap);
    // S.A's 10Hz ship.state re-establishes it — settle before asserting.
    const peered = await until(() => S.B.page.evaluate(() => (netStatus().peers || []).includes('VerifyA')));
    t('B still peers VerifyA after A2 retires', !!peered);

    // 1. presence: B's ghost of VerifyA carries A's real hull + ship name.
    const aShip = await S.A.page.evaluate(() => ({ hullId: game.ship.hullId, name: game.ship.name }));
    const ghost = await until(() => S.B.page.evaluate(() =>
        (netGhosts() || []).find(g => g.pilot === 'VerifyA') || false));
    t('B sees VerifyA ghost', !!ghost);
    t('ghost hullId matches A', !!ghost && ghost.hullId === aShip.hullId,
        `A=${JSON.stringify(aShip.hullId)} ghost=${JSON.stringify(ghost && ghost.hullId)}`);
    t('ghost shipName matches A', !!ghost && ghost.shipName === aShip.name,
        `A=${JSON.stringify(aShip.name)} ghost=${JSON.stringify(ghost && ghost.shipName)}`);

    // 2. render: the instrumented draw counter advances across frames. Must
    // run BEFORE the tracking teleport — renderGhosts viewport-culls, and both
    // pilots spawn together, so the ghost is only on B's screen right now.
    const c0 = await S.B.page.evaluate(() => window.__ghostDrawCount || 0);
    await sleep(500);
    const c1 = await S.B.page.evaluate(() => window.__ghostDrawCount || 0);
    t('ghost draw count grows across frames', c1 > c0, `before=${c0} after=${c1}`);

    // 3. tracking: teleport A and give it velocity; B's extrapolated ghost
    // (pos + vel * elapsed, ≤500ms) must converge within 60 units.
    await S.A.page.evaluate(() => {
        game.ship.x += 1500;
        game.ship.y += 900;
        game.ship.velocity.x = 2;
        game.ship.velocity.y = 1;
    });
    const tracked = await until(async () => {
        const a = await S.A.page.evaluate(() => ({ x: game.ship.x, y: game.ship.y }));
        const g = await S.B.page.evaluate(() => (netGhosts() || []).find(g => g.pilot === 'VerifyA'));
        return !!g && Math.hypot(g.x - a.x, g.y - a.y) <= 60;
    });
    t('ghost tracks A within 60 units', !!tracked, "ghost never converged on A's position");

    // 4. thrust flag: physics recomputes isThrusting from input every tick
    // (js/physics.js updateThrustSystem), so hold the key, not just the flag.
    await S.A.page.evaluate(() => {
        game.keys['ArrowUp'] = true;
        game.ship.thrust.isThrusting = true;
    });
    const thrusting = await until(() => S.B.page.evaluate(() =>
        ((netGhosts() || []).find(g => g.pilot === 'VerifyA') || {}).thrusting === true));
    t('ghost thrusting flag relayed', !!thrusting);

    // 5. leave: closing A clears the ghost (peer.leave or 5s expiry), B stays online.
    await S.A.context.close();
    S.A = null;
    const gone = await until(() => S.B.page.evaluate(() =>
        !(netGhosts() || []).some(g => g.pilot === 'VerifyA')), { timeout: 12000 });
    t('ghost gone after A leaves', !!gone);
    const bOn = await S.B.page.evaluate(() => netStatus().online === true);
    t('B still online after A leaves', bOn);

    // 6. no-collision sanity: ghosts never leak into sim arrays (friendly fire OFF).
    const leaked = await S.B.page.evaluate(() =>
        [...(game.enemies || []), ...(game.traders || [])].filter(e => e && 'pilot' in e).length);
    t('no ghost leaked into enemies/traders', leaked === 0, `${leaked} sim entries carry a pilot field`);
}

// Suite — M3 shared world (docs/PROTOCOL.md M3): server-authoritative markets,
// market events, mission boards. Runs on FRESH pilots C and D (ghostSuite
// destroyed A/A2). Reads go through the netWorld() console hook; writes go
// through the REAL game paths (dock/sellGood/acceptMission) so the net wiring
// itself is what's under test. Requires the server spawned with VERIFY_DEBUG=1
// for the debug.* hooks.
async function worldSuite(t, { browser, base, wsUrl, restartServer }) {
    const AGRICON = 'Agricon Prime';   // demands technology — C's seeded cargo
    const MERIDIAN = 'Meridian Deep';  // untouched planet for the drift test
    const OSSUARY = 'Ossuary Drift';   // untouched planet for the event test

    // C boots pre-seeded with cargo Agricon buys, parked beside it.
    S.C = await newGamePage(browser, 'VerifyC', {
        charDoc: seedCharDoc({ shipName: 'Verify Lugger', x: 1000, y: 830, cargo: { technology: 4 } })
    });
    S.D = await newGamePage(browser, 'VerifyD');
    await S.C.page.goto(`${base}/index.html?pilot=VerifyC&ws=${wsUrl}`, { waitUntil: 'load' });
    await S.D.page.goto(`${base}/index.html?pilot=VerifyD&ws=${wsUrl}`, { waitUntil: 'load' });
    t('C online', !!(await until(() => S.C.page.evaluate(() => netStatus().online === true))));
    t('D online', !!(await until(() => S.D.page.evaluate(() => netStatus().online === true))));

    const hook = await S.C.page.evaluate(() => typeof netWorld === 'function'
        && typeof netWorld().marketFor === 'function'
        && typeof netWorld().boardFor === 'function');
    t('netWorld console hook present', hook, 'client missing netWorld().{marketFor,marketEvent,boardFor}');
    if (!hook) return;

    // 1. convergence: two fresh clients read the same server market snapshot.
    const converged = await until(async () => {
        const c = await marketFor(S.C.page, AGRICON);
        const d = await marketFor(S.D.page, AGRICON);
        return (!!c && !!d && stableStringify(c) === stableStringify(d)) ? c : false;
    }, { timeout: 15000 });
    t('C and D converge on the same Agricon market', !!converged);

    // 2. trade moves the shared price: C docks and sells via the real paths.
    const docked = await S.C.page.evaluate(pn => {
        const planet = game.planets.find(p => p.name === pn);
        if (!planet) return false;
        game.ship.x = planet.x;
        game.ship.y = planet.y + 30;
        dock(planet);
        return game.isDocked === true;
    }, AGRICON);
    t('C docked at Agricon (real dock path)', docked);

    // C's dock drifts that planet server-side — settle on the post-dock market
    // before recording the pre-TRADE baseline.
    const pre = await until(async () => {
        const c = await marketFor(S.C.page, AGRICON);
        const d = await marketFor(S.D.page, AGRICON);
        return (!!c && !!d && stableStringify(c) === stableStringify(d)) ? c : false;
    }, { timeout: 15000 });
    t('post-dock baseline converged', !!pre);
    if (!pre) return;

    const creditsBefore = await S.C.page.evaluate(() => game.ship.credits);
    await S.C.page.evaluate(() => sellGood('technology', 2));
    const paid = await until(() => S.C.page.evaluate(b => game.ship.credits > b, creditsBefore));
    t('C sale resolved (credits rose)', !!paid,
        `credits stuck at ${await S.C.page.evaluate(() => game.ship.credits)}`);

    const moved = await until(async () => {
        const c = await marketFor(S.C.page, AGRICON);
        const d = await marketFor(S.D.page, AGRICON);
        return (!!c && !!d
            && c.sell.technology !== pre.sell.technology
            && d.sell.technology === c.sell.technology) ? d.sell.technology : false;
    });
    t('D reads the price C moved', moved !== false,
        `pre=${pre.sell.technology} D=${JSON.stringify(await marketFor(S.D.page, AGRICON))}`);

    // 3. dock drift: D's dock makes the server drift that planet and broadcast
    // market.update — C's copy changes. Drift is random and could no-op, so a
    // genuinely-unchanged market after the timeout gets asserted via re-docks.
    const cPreDock = await marketFor(S.C.page, MERIDIAN);
    let drifted = false;
    for (let attempt = 0; attempt < 3 && !drifted; attempt++) {
        await S.D.page.evaluate(pn => {
            const planet = game.planets.find(p => p.name === pn);
            game.ship.x = planet.x;
            game.ship.y = planet.y + 30;
            if (game.isDocked) undock();
            dock(planet);
        }, MERIDIAN);
        drifted = !!(await until(async () => {
            const c = await marketFor(S.C.page, MERIDIAN);
            return !!c && stableStringify(c) !== stableStringify(cPreDock);
        }, { timeout: 6000 }));
    }
    t("C received market.update from D's dock (drift)", drifted,
        'Meridian market never changed on C across 3 docks by D');

    // 4. market event: forced via the debug hook (VERIFY_DEBUG=1), broadcast
    // to both, and the affected side's READ price reflects the multiplier.
    await S.C.page.evaluate((pn, g) =>
        net.send({ t: 'debug.marketEvent', planetName: pn, goodType: g, side: 'sell', multiplier: 2 }),
        OSSUARY, 'medicine');
    const cEv = await until(() => S.C.page.evaluate(pn => {
        const ev = netWorld().marketEvent;
        return !!ev && ev.planetName === pn;
    }, OSSUARY));
    const dEv = await until(() => S.D.page.evaluate(pn => {
        const ev = netWorld().marketEvent;
        return !!ev && ev.planetName === pn;
    }, OSSUARY));
    t('C sees the forced market event', !!cEv);
    t('D sees the forced market event', !!dEv);
    const evCheck = await S.C.page.evaluate((pn, g) => {
        const base2 = netWorld().marketFor(pn).sell[g];
        const read = getSellPrice(game.planets.find(p => p.name === pn), g);
        return { base: base2, read };
    }, OSSUARY, 'medicine');
    t('sell-shortage raises the read price above base', !!evCheck && evCheck.read >= evCheck.base * 1.5,
        `base=${evCheck && evCheck.base} read=${evCheck && evCheck.read}`);

    // 5. mission board: C (docked at Agricon) takes a delivery via the real
    // path; D's board drops that id and still shows offers (regen).
    const offers = await until(async () => {
        const o = await boardOffers(S.C.page, AGRICON);
        const deliveries = (o || []).filter(x => x && x.goodType);
        return deliveries.length > 0 ? deliveries : false;
    });
    t('Agricon board has delivery offers', !!offers);
    if (!offers) return;
    const missionId = offers[0].id;
    await S.C.page.evaluate(id => acceptMission(id), missionId);
    const taken = await until(() => S.C.page.evaluate(id =>
        (game.missions || []).some(m => m.id === id), missionId));
    t("mission landed in C's game.missions (real acceptMission path)", !!taken);
    const regen = await until(async () => {
        const o = await boardOffers(S.D.page, AGRICON);
        if (!o) return false;
        return !o.some(x => x && x.id === missionId)
            && o.filter(x => x && x.goodType).length >= 1;
    });
    t("D's board dropped the taken mission and still has ≥1 offer", !!regen);

    // 6. persistence: moved prices survive a server restart (same port + DB).
    await S.C.page.evaluate(() => net.send({ t: 'debug.snapshot' }));
    await sleep(500); // let the snapshot reply land
    const recA = await marketFor(S.C.page, AGRICON);
    const recM = await marketFor(S.C.page, MERIDIAN);
    t('recorded moved prices via debug.snapshot', !!recA && !!recM);
    const up = await restartServer();
    t('server restarted on same port/db', !!up);
    if (!up) return;
    await S.C.page.evaluate(() => netConnect()); // skip the 30s retry wait
    await S.D.page.evaluate(() => netConnect());
    t('C back online after restart', !!(await until(() => S.C.page.evaluate(() => netStatus().online === true))));
    t('D back online after restart', !!(await until(() => S.D.page.evaluate(() => netStatus().online === true))));
    const survived = await until(async () => {
        const a = await marketFor(S.C.page, AGRICON);
        const m = await marketFor(S.C.page, MERIDIAN);
        return !!a && !!m
            && stableStringify(a) === stableStringify(recA)
            && stableStringify(m) === stableStringify(recM);
    }, { timeout: 15000 });
    t('markets survived the restart (SQLite snapshot)', !!survived);
    const dSurvived = await until(async () => {
        const a = await marketFor(S.D.page, AGRICON);
        return !!a && stableStringify(a) === stableStringify(recA);
    });
    t("D's post-restart view matches too", !!dSurvived);
}

// ---------------------------------------------------------------------------
// M4 [combat] helpers. All server reads go through the netCombat() console
// hook (contract: { enemies, drops, lastTickN }); request/reply debug hooks
// (debug.state) are observed via the __wsTap WebSocket recorder because the
// client ignores unknown message types by design.
// ---------------------------------------------------------------------------

function combatView(page) {
    return page.evaluate(() => {
        if (typeof netCombat !== 'function') return null;
        const c = netCombat();
        if (!c) return null;
        return {
            enemies: (c.enemies || []).map(e => ({
                id: e.id, hull: e.hull, x: e.x, y: e.y,
                shielded: !!e.shielded, isBandBoss: !!e.isBandBoss,
                bandId: e.bandId || null, factionName: e.factionName || null,
                tierName: e.tierName || null,
            })),
            drops: (c.drops || []).map(d => ({ id: d.id, kind: d.kind, goodType: d.goodType || null })),
            lastTickN: c.lastTickN || 0,
        };
    });
}

function claimDamage(page, enemyId, damage) {
    return page.evaluate((id, d) => net.send({ t: 'damage.claim', enemyId: id, damage: d }), enemyId, damage);
}

// debug.state round-trip: send, then poll the tap for the
// { t:'debug.state', state: {enemies, traders, drops, pilots, grudges,
// simNow, tickN} } reply that arrives after the send (server/combat.mjs,
// PROTOCOL M4 debug row). Resolves to the inner `state` object.
async function debugState(page) {
    const since = await page.evaluate(() => (window.__wsTap || []).length);
    await page.evaluate(() => net.send({ t: 'debug.state' }));
    const msg = await until(() => page.evaluate(s => {
        const hits = (window.__wsTap || []).slice(s).filter(m => m && m.t === 'debug.state' && m.state);
        return hits.length ? hits[hits.length - 1] : false;
    }, since), { timeout: 8000 });
    return (msg && msg.state) || null;
}

// Send a debug.spawn* message and wait for its debug.spawned ack, matched by
// the payload field that distinguishes the two hooks (enemyId vs bandId).
async function debugSpawn(page, msg, ackField) {
    const since = await page.evaluate(() => (window.__wsTap || []).length);
    await page.evaluate(o => net.send(o), msg);
    return await until(() => page.evaluate((s, f) => {
        const hits = (window.__wsTap || []).slice(s).filter(m => m && m.t === 'debug.spawned' && m[f] != null);
        return hits.length ? hits[hits.length - 1] : false;
    }, since, ackField), { timeout: 8000 });
}

// Spawn an enemy via debug.spawnEnemy; resolves to the page's netCombat view
// of it (so callers get the synced hull), keyed by the acked enemyId.
async function spawnEnemyNear(page, x, y, tier) {
    const ack = await debugSpawn(page, { t: 'debug.spawnEnemy', x, y, tier }, 'enemyId');
    if (!ack) return null;
    return await until(async () => {
        const v = await combatView(page);
        return (v && v.enemies.find(e => e.id === ack.enemyId)) || false;
    }, { timeout: 8000 }) || null;
}

// Spawn a faction band via debug.spawnBand. Size comes from the ack's
// enemyIds (boss included). waitVisible=false skips the netCombat poll for
// fast size sampling in the [scaling] test.
async function spawnBandOf(page, factionName, { waitVisible = true } = {}) {
    const ack = await debugSpawn(page, { t: 'debug.spawnBand', factionName }, 'bandId');
    if (!ack || ack.faction !== factionName) return null;
    const band = {
        bandId: ack.bandId, bossId: ack.bossId,
        enemyIds: ack.enemyIds || [], size: (ack.enemyIds || []).length,
    };
    if (waitVisible) {
        const boss = await until(async () => {
            const v = await combatView(page);
            return (v && v.enemies.find(e => e.id === ack.bossId)) || false;
        }, { timeout: 8000 });
        if (!boss) return null;
        band.boss = boss;
    }
    return band;
}

// Claim-kill an enemy, re-claiming inside the poll in case the first claim
// raced a shield/tick boundary. True once the id is gone from the page's view.
async function killEnemy(page, enemyId, timeout = 12000) {
    return await until(async () => {
        await claimDamage(page, enemyId, 999999);
        const v = await combatView(page);
        return !!v && !v.enemies.some(e => e.id === enemyId);
    }, { timeout, every: 400 });
}

// Suite — M4 shared combat (docs/PROTOCOL.md M4): server-sim enemies/bands/
// drops/grudges, client damage claims, kill-reward locality, raid scaling,
// offline transition. Runs on FRESH pilots E and F; retires every earlier
// page first because raid scaling counts pilots online and enemy AI anchors
// to connected pilots. Requires VERIFY_DEBUG=1 (debug.spawnEnemy/spawnBand/
// state) and the client netCombat() hook. Leaves unkilled [scaling] bands in
// the world — it's the last suite; scratch DB is deleted after the run.
async function combatSuite(t, { browser, base, wsUrl }) {
    for (const k of ['A', 'A2', 'B', 'C', 'D', 'O']) {
        if (S[k]) { await S[k].context.close().catch(() => {}); S[k] = null; }
    }

    // Empty space far from every planet (cluster is x 500-3000, y 400-2000)
    // so docking/traffic can't graze the tests; enemies despawn >3000 from the
    // nearest pilot, so spawns stay within that radius of E. F sits 600 off —
    // the client AUTO-claims server drops within 26 units (netUpdateServerDrops),
    // so kills must never land loot on top of either ship.
    const EX = 8000, EY = 8000;
    const pageOpts = (shipName, y = EY) => ({
        charDoc: seedCharDoc({ shipName, x: EX, y }),
        tap: true, stubPerks: true,
    });
    S.E = await newGamePage(browser, 'VerifyE', pageOpts('Verify Cutter'));
    S.F = await newGamePage(browser, 'VerifyF', pageOpts('Verify Ketch', EY + 600));
    await S.E.page.goto(`${base}/index.html?pilot=VerifyE&ws=${wsUrl}`, { waitUntil: 'load' });
    await S.F.page.goto(`${base}/index.html?pilot=VerifyF&ws=${wsUrl}`, { waitUntil: 'load' });
    t('E online', !!(await until(() => S.E.page.evaluate(() => netStatus().online === true))));
    t('F online', !!(await until(() => S.F.page.evaluate(() => netStatus().online === true))));

    const hook = await until(() => S.E.page.evaluate(() => typeof netCombat === 'function' && !!netCombat()));
    t('netCombat console hook present', !!hook, 'client missing netCombat() → {enemies,drops,lastTickN}');
    if (!hook) return;

    // Server enemies WILL engage and fire; own-ship damage is client-
    // authoritative, so a local god-mode keeps the harness ships alive
    // without touching anything the suite asserts on.
    const godMode = page => page.evaluate(() => {
        game.ship.hullMax = 1e9; game.ship.hull = 1e9;
        game.ship.shieldMax = 1e9; game.ship.shield = 1e9;
    });
    await godMode(S.E.page);
    await godMode(S.F.page);

    // 1. convergence: a debug-spawned enemy shows up on BOTH clients with the
    // same id + hull, and ticks are flowing on both.
    const spawned = await spawnEnemyNear(S.E.page, EX + 350, EY, 'scout');
    t('debug.spawnEnemy lands in E netCombat', !!spawned, 'no new enemy near the requested spawn point');
    if (!spawned) return;
    const eid = spawned.id;
    const conv = await until(async () => {
        const e = await combatView(S.E.page);
        const f = await combatView(S.F.page);
        const ee = e && e.enemies.find(x => x.id === eid);
        const fe = f && f.enemies.find(x => x.id === eid);
        return (ee && fe && ee.hull === fe.hull) ? { hull: ee.hull } : false;
    }, { timeout: 10000 });
    t('E and F converge on the enemy (same id, same hull)', !!conv);
    const eN0 = (await combatView(S.E.page)).lastTickN;
    const fN0 = (await combatView(S.F.page)).lastTickN;
    t('ticks advance on E', !!(await until(async () => (await combatView(S.E.page)).lastTickN > eN0, { timeout: 5000 })), `stuck at ${eN0}`);
    t('ticks advance on F', !!(await until(async () => (await combatView(S.F.page)).lastTickN > fN0, { timeout: 5000 })), `stuck at ${fN0}`);
    if (!conv) return;

    // 2. damage claim: E's claim reduces the hull F sees (the MULTIPLAYER.md
    // linchpin). Nothing else damages enemies — the harness never fires.
    const h0 = conv.hull;
    await claimDamage(S.E.page, eid, 10);
    const dropped = await until(async () => {
        const f = await combatView(S.F.page);
        const fe = f && f.enemies.find(x => x.id === eid);
        return !!fe && fe.hull === h0 - 10;
    }, { timeout: 8000 });
    t("E's damage.claim drops the hull F sees by 10", !!dropped,
        `hull F sees: ${JSON.stringify(await S.F.page.evaluate(id => (netCombat().enemies.find(e => e.id === id) || {}).hull, eid))} (want ${h0 - 10})`);

    // 3. kill + reward locality: E lands the kill; enemy leaves both views,
    // E's credits rise, F's do not. Loot is RNG (60% cargo / 15% powerup on
    // commons) — assert drop sync only when one actually rolled, else confirm
    // the kill via debug.state.
    const credE0 = await S.E.page.evaluate(() => game.ship.credits);
    const credF0 = await S.F.page.evaluate(() => game.ship.credits);
    const dropsBefore = new Set(((await combatView(S.E.page)) || { drops: [] }).drops.map(d => d.id));
    // The enemy has been closing on E since test 1 — step E clear before the
    // kill so the loot doesn't land inside E's 26-unit auto-claim radius.
    await S.E.page.evaluate(() => { game.ship.x += 2000; game.ship.velocity.x = 0; game.ship.velocity.y = 0; });
    const killed = await killEnemy(S.E.page, eid);
    t('lethal claim removes the enemy from E', !!killed);
    const goneF = await until(async () => {
        const f = await combatView(S.F.page);
        return !!f && !f.enemies.some(e => e.id === eid);
    }, { timeout: 8000 });
    t('enemy gone from F too', !!goneF);
    let dropId = null;
    const newDrop = await until(async () => {
        const v = await combatView(S.E.page);
        return (v && v.drops.find(d => d.id != null && !dropsBefore.has(d.id))) || false;
    }, { timeout: 4000 });
    if (newDrop) {
        dropId = newDrop.id;
        const dropOnF = await until(async () => {
            const f = await combatView(S.F.page);
            return !!f && f.drops.some(d => d.id === dropId);
        }, { timeout: 6000 });
        t('kill drop synced to both clients', !!dropOnF);
    } else {
        const st = await debugState(S.E.page);
        t('server confirms the kill via debug.state (no loot rolled)',
            !!st && !((st.enemies || []).some(e => e.id === eid)), 'enemy still in server state');
    }
    const eRose = await until(() => S.E.page.evaluate(b => game.ship.credits > b, credE0), { timeout: 8000 });
    t("E's credits rose on the kill (enemy.killed reward, client-side)", !!eRose,
        `credits ${await S.E.page.evaluate(() => game.ship.credits)} (started ${credE0})`);
    const credF1 = await S.F.page.evaluate(() => game.ship.credits);
    t("F's credits did NOT rise (kill-reward locality)", credF1 === credF0, `F: ${credF0} → ${credF1}`);

    // 4. drop first-wins: both pilots race drop.claim on the same drop;
    // exactly one drop.taken lands (one `by`), and the drop leaves both views.
    for (let i = 0; !dropId && i < 5; i++) {
        const extra = await spawnEnemyNear(S.E.page, EX + 500, EY + 250, 'scout');
        if (!extra) break;
        const before = new Set(((await combatView(S.E.page)) || { drops: [] }).drops.map(d => d.id));
        await killEnemy(S.E.page, extra.id);
        const d = await until(async () => {
            const v = await combatView(S.E.page);
            return (v && v.drops.find(x => x.id != null && !before.has(x.id))) || false;
        }, { timeout: 4000 });
        if (d) dropId = d.id;
    }
    t('a loot drop exists to race for', dropId != null, 'no drop rolled across 5 spawn+kill attempts (60%+15% odds each)');
    if (dropId != null) {
        const seenByF = await until(async () => {
            const f = await combatView(S.F.page);
            return !!f && f.drops.some(d => d.id === dropId);
        }, { timeout: 6000 });
        t('the race drop is visible to F', !!seenByF);
        const sinceE = await S.E.page.evaluate(() => (window.__wsTap || []).length);
        const sinceF = await S.F.page.evaluate(() => (window.__wsTap || []).length);
        await Promise.all([
            S.E.page.evaluate(id => net.send({ t: 'drop.claim', dropId: id }), dropId),
            S.F.page.evaluate(id => net.send({ t: 'drop.claim', dropId: id }), dropId),
        ]);
        const takens = await until(async () => {
            const [te, tf] = await Promise.all([
                S.E.page.evaluate((s, id) => (window.__wsTap || []).slice(s).filter(m => m && m.t === 'drop.taken' && m.dropId === id), sinceE, dropId),
                S.F.page.evaluate((s, id) => (window.__wsTap || []).slice(s).filter(m => m && m.t === 'drop.taken' && m.dropId === id), sinceF, dropId),
            ]);
            return (te.length && tf.length) ? { te, tf } : false;
        }, { timeout: 8000 });
        t('drop.taken broadcast reached both', !!takens);
        if (takens) {
            const bys = new Set([...takens.te, ...takens.tf].map(m => m.by));
            t(`exactly one claimer won (${[...bys].join(', ') || 'nobody'})`,
                bys.size === 1 && (bys.has('VerifyE') || bys.has('VerifyF')),
                `distinct winners: ${JSON.stringify([...bys])}`);
        }
        const cleared = await until(async () => {
            const e = await combatView(S.E.page);
            const f = await combatView(S.F.page);
            return !!e && !!f && !e.drops.some(d => d.id === dropId) && !f.drops.some(d => d.id === dropId);
        }, { timeout: 8000 });
        t('drop removed from both views after the race', !!cleared);
    }

    // 5. shared vendetta: E breaks a Void Choir band; F's grudge rises via
    // grudge.update without F firing a shot. Boss is escort-shielded — kill
    // the minions first (updateEnemies unshields it once they're gone).
    const FACTION = 'Void Choir';
    const g0 = await S.F.page.evaluate(f => (game.pilot.grudges || {})[f] || 0, FACTION);
    const band = await spawnBandOf(S.E.page, FACTION);
    t('debug.spawnBand fields a Void Choir band (boss + escort)', !!band && band.size >= 2,
        band ? `size=${band.size}` : 'no debug.spawned ack / boss never synced');
    if (band) {
        for (const id of band.enemyIds.filter(id => id !== band.bossId)) {
            await killEnemy(S.E.page, id); // minions first — the escort shield eats boss claims
        }
        const unshielded = await until(async () => {
            const v = await combatView(S.E.page);
            const b = v && v.enemies.find(e => e.id === band.bossId);
            return !!b && !b.shielded;
        }, { timeout: 10000 });
        t('boss unshields once the escort is dead', !!unshielded);
        const bossDead = await killEnemy(S.E.page, band.bossId);
        t('E kills the band boss', !!bossDead);
        const vendetta = await until(() => S.F.page.evaluate((f, g) =>
            ((game.pilot.grudges || {})[f] || 0) > g, FACTION, g0), { timeout: 10000 });
        t(`F's ${FACTION} grudge rose without F firing (shared vendetta)`, !!vendetta,
            `F grudge still ${await S.F.page.evaluate(f => (game.pilot.grudges || {})[f] || 0, FACTION)} (started ${g0})`);
    }

    // 6. raid scaling: same faction (Iron Shoal — its grudge is untouched, so
    // the grudge reinforcement term is constant), one pilot vs two. The server
    // adds +1 minion per extra pilot on top of a 3-or-4 RNG base, so single
    // samples tie ~50% of the time — compare SUMS of 4 cheap ack-sized spawns
    // per config instead (residual flake odds (1/16)² ≈ 0.4%).
    await S.F.context.close().catch(() => {});
    S.F = null;
    const fGone = await until(() => S.E.page.evaluate(() => !(netStatus().peers || []).includes('VerifyF')), { timeout: 10000 });
    t('server down to one pilot (F left peers)', !!fGone);
    const sampleBands = async n => {
        const sizes = [];
        for (let i = 0; i < n; i++) {
            const b = await spawnBandOf(S.E.page, 'Iron Shoal', { waitVisible: false });
            if (b) sizes.push(b.size);
        }
        return sizes;
    };
    const soloSizes = await sampleBands(4);
    t('bands muster with one pilot online', soloSizes.length === 4 && soloSizes.every(s => s >= 2),
        `sizes=${JSON.stringify(soloSizes)}`);
    S.F = await newGamePage(browser, 'VerifyF', pageOpts('Verify Ketch II'));
    await S.F.page.goto(`${base}/index.html?pilot=VerifyF&ws=${wsUrl}`, { waitUntil: 'load' });
    t('F back online', !!(await until(() => S.F.page.evaluate(() => netStatus().online === true))));
    await godMode(S.F.page);
    await until(() => S.E.page.evaluate(() => (netStatus().peers || []).includes('VerifyF')), { timeout: 10000 });
    const duoSizes = await sampleBands(4);
    const sum = a => a.reduce((x, y) => x + y, 0);
    t(`raid bands scale to pilots online (1p=${JSON.stringify(soloSizes)} 2p=${JSON.stringify(duoSizes)})`,
        soloSizes.length === 4 && duoSizes.length === 4 && sum(duoSizes) > sum(soloSizes),
        'two-pilot bands not larger in aggregate');
    // NOTE: the 8 sampled bands stay alive (unkilled) — acceptable leftovers,
    // this is the last suite and they feed the reconnect leg below.

    // 7. offline transition: E drops — server enemies clear client-side and
    // the LOCAL sim takes over; reconnect brings server enemies + ticks back.
    // (The [scaling] bands keep the server world populated for the return leg;
    // F stays connected so the server still has a pilot to anchor to.)
    await S.E.page.evaluate(() => netForceDisconnect());
    t('E offline', !!(await until(() => S.E.page.evaluate(() => netStatus().online === false))));
    const serverCleared = await until(async () => {
        const v = await combatView(S.E.page);
        return !v || v.enemies.length === 0;
    }, { timeout: 10000 });
    t('server enemies cleared from E after disconnect', !!serverCleared);
    const localSim = await S.E.page.evaluate(async () => {
        if ((game.enemies || []).some(e => e && e.id != null)) {
            return { ok: false, why: 'server-id enemies still in game.enemies' };
        }
        // prove the local update loop is live again: a pushed local enemy moves
        const e = CombatCore.makeEnemy('scout', game.ship.x + 900, game.ship.y);
        game.enemies.push(e);
        const x0 = e.x, y0 = e.y, a0 = e.angle;
        await new Promise(r => setTimeout(r, 1200));
        const moved = Math.hypot(e.x - x0, e.y - y0) > 1 || e.angle !== a0;
        const i = game.enemies.indexOf(e);
        if (i !== -1) game.enemies.splice(i, 1); // don't pollute the reconnect
        return { ok: moved, why: moved ? '' : 'pushed local enemy never updated (local sim not resumed)' };
    });
    t('local enemy sim resumes offline', !!localSim.ok, localSim.why);
    t('no page errors on E across the transition', S.E.errors.length === 0, S.E.errors.slice(0, 2).join(' | '));
    await S.E.page.evaluate(() => netConnect());
    t('E back online', !!(await until(() => S.E.page.evaluate(() => netStatus().online === true))));
    let returned = await until(async () => {
        const v = await combatView(S.E.page);
        return !!v && v.enemies.length > 0;
    }, { timeout: 8000 });
    if (!returned) returned = await spawnEnemyNear(S.E.page, EX + 300, EY - 200, 'scout');
    t('server enemies present again after reconnect', !!returned);
    const nBack = (await combatView(S.E.page)).lastTickN;
    t('ticks resume after reconnect', !!(await until(async () => (await combatView(S.E.page)).lastTickN > nBack, { timeout: 5000 })), `stuck at ${nBack}`);
}

const SUITES = [
    ['solo', soloSuite],
    ['handshake', handshakeSuite],
    ['savesync', savesyncSuite],
    ['conflict', conflictSuite],
    ['reconnect', reconnectSuite],
    ['offline', offlineSuite],
    ['ghosts', ghostSuite],
    ['world', worldSuite],
    ['combat', combatSuite],
];

// ---------------------------------------------------------------------------

// Server child spawner — reused by the [world] persistence test, which kills
// and respawns the SAME port + DB_PATH to prove the SQLite snapshot survives.
// VERIFY_DEBUG=1 enables the debug.* hooks (PROTOCOL M3); harness-only, never prod.
function spawnServer(port, dbPath, serverLog) {
    const proc = spawn(process.execPath, [SERVER_MJS], {
        env: {
            ...process.env,
            PORT: String(port),
            DB_PATH: dbPath,
            STATIC_DIR: ROOT,
            FAMILY_SECRET: SECRET,
            VERIFY_DEBUG: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', d => serverLog.push(String(d)));
    proc.stderr.on('data', d => serverLog.push(String(d)));
    proc.on('exit', code => serverLog.push(`[server exited code=${code}]`));
    return proc;
}

async function main() {
    if (!fs.existsSync(SERVER_MJS)) {
        console.error(`VERIFY-NET-FAIL: ${SERVER_MJS} does not exist yet — build the M1 server first (docs/PROTOCOL.md).`);
        process.exit(1);
    }
    if (!fs.existsSync(path.join(ROOT, 'js', 'net.js'))) {
        console.error(`VERIFY-NET-FAIL: ${path.join(ROOT, 'js', 'net.js')} does not exist yet — build the M1 client net layer first.`);
        process.exit(1);
    }

    let puppeteer;
    try {
        puppeteer = (await import('puppeteer-core')).default;
    } catch {
        console.error('VERIFY-NET-FAIL: puppeteer-core not installed in root node_modules (npm i -D puppeteer-core).');
        process.exit(1);
    }

    const port = await freePort();
    const dbPath = path.join(os.tmpdir(), `space-traders-verify-${process.pid}-${Date.now()}.db`);
    const serverLog = [];
    const srv = { proc: null }; // holder — restartServer swaps the child in place
    let browser = null;
    let exitCode = 1;

    const watchdog = setTimeout(() => {
        console.error(`VERIFY-NET-FAIL (run exceeded ${RUN_TIMEOUT_MS / 1000}s)`);
        try { if (srv.proc) srv.proc.kill('SIGKILL'); } catch {}
        if (browser) browser.close().catch(() => {}).finally(() => process.exit(1));
        else process.exit(1);
    }, RUN_TIMEOUT_MS);

    try {
        srv.proc = spawnServer(port, dbPath, serverLog);

        const up = await until(() => portAccepts(port), { timeout: 10000, every: 200 });
        if (!up) {
            console.error(`VERIFY-NET-FAIL: server never accepted connections on 127.0.0.1:${port}`);
            console.error(serverLog.join('').slice(-2000));
            return;
        }

        browser = await puppeteer.launch({
            executablePath: chromePath(),
            headless: true,
            args: ['--no-sandbox', '--disable-gpu'],
        });

        const ctx = {
            browser,
            port,
            base: `http://127.0.0.1:${port}`,
            wsUrl: `ws://127.0.0.1:${port}`,
            // Kill + respawn the server child on the SAME port/DB ([world]
            // persistence). SIGTERM first so its shutdown path flushes SQLite.
            restartServer: async () => {
                const old = srv.proc;
                old.kill('SIGTERM');
                await until(() => old.exitCode !== null, { timeout: 5000, every: 100 });
                if (old.exitCode === null) {
                    old.kill('SIGKILL');
                    await until(() => old.exitCode !== null, { timeout: 3000, every: 100 });
                }
                await until(async () => !(await portAccepts(port)), { timeout: 5000, every: 100 });
                srv.proc = spawnServer(port, dbPath, serverLog);
                return await until(() => portAccepts(port), { timeout: 10000, every: 200 });
            },
        };

        for (const [suite, fn] of SUITES) {
            const t = (name, pass, detail) => record(suite, name, !!pass, detail);
            try {
                await fn(t, ctx);
            } catch (err) {
                record(suite, `threw: ${err.message}`, false);
            }
        }

        const failed = results.filter(r => !r.pass);
        if (failed.length) {
            console.log(`VERIFY-NET-FAIL ${results.length - failed.length}/${results.length}`);
            const tail = serverLog.join('').slice(-2000);
            if (tail) console.error(`--- server log tail ---\n${tail}`);
        } else {
            console.log(`VERIFY-NET-PASS ${results.length}/${results.length}`);
            exitCode = 0;
        }
    } finally {
        clearTimeout(watchdog);
        if (browser) await browser.close().catch(() => {});
        if (srv.proc && srv.proc.exitCode === null) {
            srv.proc.kill('SIGTERM');
            await sleep(300);
            if (srv.proc.exitCode === null) srv.proc.kill('SIGKILL');
        }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(dbPath + suffix); } catch {}
        }
    }
    process.exit(exitCode);
}

main().catch(err => {
    console.error(`VERIFY-NET-FAIL: ${err.stack || err}`);
    process.exit(1);
});
