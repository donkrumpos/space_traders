#!/usr/bin/env node
// verify-net.mjs — M1 two-client convergence harness. Contract: docs/PROTOCOL.md.
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
const RUN_TIMEOUT_MS = 120000;

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
async function newGamePage(browser, pilot, { seedIdentity = true, stubNaming = true } = {}) {
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
    // Headless safety net: never block on a native dialog.
    await page.evaluateOnNewDocument(() => { window.prompt = () => null; });
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

const SUITES = [
    ['solo', soloSuite],
    ['handshake', handshakeSuite],
    ['savesync', savesyncSuite],
    ['conflict', conflictSuite],
    ['reconnect', reconnectSuite],
    ['offline', offlineSuite],
    ['ghosts', ghostSuite],
    // M3: ['market', marketSuite],
    // M4: ['combat', combatSuite],
];

// ---------------------------------------------------------------------------

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
    let server = null;
    let browser = null;
    let exitCode = 1;

    const watchdog = setTimeout(() => {
        console.error(`VERIFY-NET-FAIL (run exceeded ${RUN_TIMEOUT_MS / 1000}s)`);
        try { if (server) server.kill('SIGKILL'); } catch {}
        if (browser) browser.close().catch(() => {}).finally(() => process.exit(1));
        else process.exit(1);
    }, RUN_TIMEOUT_MS);

    try {
        server = spawn(process.execPath, [SERVER_MJS], {
            env: {
                ...process.env,
                PORT: String(port),
                DB_PATH: dbPath,
                STATIC_DIR: ROOT,
                FAMILY_SECRET: SECRET,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        server.stdout.on('data', d => serverLog.push(String(d)));
        server.stderr.on('data', d => serverLog.push(String(d)));
        server.on('exit', code => serverLog.push(`[server exited code=${code}]`));

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
        if (server && server.exitCode === null) {
            server.kill('SIGTERM');
            await sleep(300);
            if (server.exitCode === null) server.kill('SIGKILL');
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
