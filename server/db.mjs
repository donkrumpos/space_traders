// SQLite persistence (better-sqlite3, WAL). Schema per docs/PROTOCOL.md.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH
    || path.join(path.dirname(fileURLToPath(import.meta.url)), 'world.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS pilots (name TEXT PRIMARY KEY, doc TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS world  (id INTEGER PRIMARY KEY CHECK (id=1), snapshot TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, pilot TEXT NOT NULL, doc TEXT NOT NULL, created INTEGER NOT NULL);
`);

const stmts = {
    getPilot: db.prepare('SELECT doc, updated FROM pilots WHERE name = ?'),
    upsertPilot: db.prepare(`INSERT INTO pilots (name, doc, updated) VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET doc = excluded.doc, updated = excluded.updated`),
    backup: db.prepare('INSERT INTO backups (pilot, doc, created) VALUES (?, ?, ?)'),
    getWorld: db.prepare('SELECT snapshot FROM world WHERE id = 1'),
    saveWorld: db.prepare(`INSERT INTO world (id, snapshot, updated) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, updated = excluded.updated`)
};

export function getPilot(name) {
    const row = stmts.getPilot.get(name);
    return row ? { doc: row.doc, updated: row.updated } : null;
}

// Backup-before-overwrite is the contract: a pilot doc is never silently replaced.
export const savePilot = db.transaction((name, docJson) => {
    const existing = stmts.getPilot.get(name);
    const now = Date.now();
    if (existing) stmts.backup.run(name, existing.doc, now);
    stmts.upsertPilot.run(name, docJson, now);
    return now;
});

export function getWorld() {
    const row = stmts.getWorld.get();
    return row ? row.snapshot : null;
}

export function saveWorld(json) {
    stmts.saveWorld.run(json, Date.now());
}

export function closeDb() {
    db.close();
}
