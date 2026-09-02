#!/usr/bin/env node
// backup.mjs — online SQLite backup + rotation for the world db.
// Run from cron (see docs/RUNBOOK.md "Backups"):
//   node server/backup.mjs
// Env: DB_PATH (default /var/lib/space-traders/world.db),
//      BACKUP_DIR (default <db dir>/backups), BACKUP_KEEP (default 30).
//
// Uses better-sqlite3's .backup() (SQLite online backup API) so it is safe
// against a live server mid-write — never copy world.db/-wal by hand.
// Output: world-YYYYMMDD-HHMMSS.db.gz, pruned to the newest BACKUP_KEEP.
// Off-box: a machine with ssh access pulls BACKUP_DIR (RUNBOOK has the
// launchd recipe) — this script itself never needs credentials.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DB_PATH = process.env.DB_PATH || '/var/lib/space-traders/world.db';
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);

function stamp(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
        + `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const tmp = path.join(BACKUP_DIR, `.inprogress-${process.pid}.db`);
const out = path.join(BACKUP_DIR, `world-${stamp(new Date())}.db.gz`);

const db = new Database(DB_PATH, { readonly: true });
try {
    await db.backup(tmp);
} finally {
    db.close();
}
fs.writeFileSync(out, zlib.gzipSync(fs.readFileSync(tmp), { level: 9 }));
fs.unlinkSync(tmp);

const all = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^world-\d{8}-\d{6}\.db\.gz$/.test(f))
    .sort(); // stamp format sorts chronologically
for (const f of all.slice(0, Math.max(0, all.length - KEEP))) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
}
console.log(`[backup] ${out} (${fs.statSync(out).size} bytes), keeping ${Math.min(all.length, KEEP)}/${KEEP}`);
