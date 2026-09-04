#!/usr/bin/env node
// verify-solo.mjs — the solo gate as one command (npm test runs this, then
// verify-net.mjs). Serves the repo statically on a scratch port, drives
// index.html?verify through chrome-headless-shell under virtual time, and
// mirrors the page's <pre id="verifyOut"> verdict: VERIFY-PASS n/n → exit 0.
// Same contract as the hand-run incantation in CLAUDE.md / README.md.

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VIRTUAL_TIME_MS = 12000;
const HARD_TIMEOUT_MS = 120000; // virtual time compresses; real time stays bounded

function chromePath() {
    const base = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
    let versions;
    try {
        versions = fs.readdirSync(base);
    } catch {
        throw new Error(`no chrome-headless-shell cache at ${base} — install once with:\n`
            + `  npx @puppeteer/browsers install chrome-headless-shell@stable`);
    }
    versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (let i = versions.length - 1; i >= 0; i--) {
        const dir = path.join(base, versions[i]);
        for (const sub of fs.readdirSync(dir)) {
            const bin = path.join(dir, sub,
                process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
            if (fs.existsSync(bin)) return bin;
        }
    }
    throw new Error(`no chrome-headless-shell binary under ${base}`);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2'
};

function startStaticServer() {
    return new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
            let urlPath;
            try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
            catch { res.writeHead(400); res.end(); return; }
            if (urlPath.endsWith('/')) urlPath += 'index.html';
            const filePath = path.join(ROOT, urlPath);
            if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
                res.writeHead(403); res.end(); return;
            }
            fs.readFile(filePath, (err, data) => {
                if (err) { res.writeHead(404); res.end(); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
                res.end(data);
            });
        });
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

async function main() {
    const chrome = chromePath();
    const srv = await startStaticServer();
    const port = srv.address().port;
    const url = `http://127.0.0.1:${port}/index.html?verify`;

    let dom = '';
    const code = await new Promise((resolve) => {
        const proc = spawn(chrome, [
            '--headless', '--dump-dom', `--virtual-time-budget=${VIRTUAL_TIME_MS}`, url
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        proc.stdout.on('data', d => { dom += d; });
        proc.stderr.on('data', () => {}); // CHS logs GPU noise; the DOM is the verdict
        const killer = setTimeout(() => {
            console.error(`VERIFY-FAIL: chrome-headless-shell exceeded ${HARD_TIMEOUT_MS / 1000}s`);
            proc.kill('SIGKILL');
        }, HARD_TIMEOUT_MS);
        proc.on('close', c => { clearTimeout(killer); resolve(c); });
    });
    srv.close();

    const verdict = dom.match(/VERIFY-(PASS|FAIL) \d+\/\d+/);
    if (!verdict) {
        console.error(`VERIFY-FAIL: no verdict in the dumped DOM (chrome exit ${code}) — `
            + `did the page throw before runVerify()?`);
        process.exit(1);
    }
    if (verdict[1] === 'FAIL') {
        // Surface the individual failures from the verifyOut <pre>
        for (const line of dom.match(/^FAIL \[[^\n]*/gm) || []) console.error(line);
    }
    console.log(verdict[0]);
    process.exit(verdict[1] === 'PASS' ? 0 : 1);
}

main().catch(err => {
    console.error(`VERIFY-FAIL: ${err.message}`);
    process.exit(1);
});
