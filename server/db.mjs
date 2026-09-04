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
    backupsNewest: db.prepare('SELECT doc, created FROM backups WHERE pilot = ? ORDER BY id DESC'),
    pruneBackups: db.prepare(`DELETE FROM backups WHERE pilot = ? AND id NOT IN
        (SELECT id FROM backups WHERE pilot = ? ORDER BY id DESC LIMIT 20)`),
    getWorld: db.prepare('SELECT snapshot FROM world WHERE id = 1'),
    saveWorld: db.prepare(`INSERT INTO world (id, snapshot, updated) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, updated = excluded.updated`)
};

export function getPilot(name) {
    const row = stmts.getPilot.get(name);
    return row ? { doc: row.doc, updated: row.updated } : null;
}

// Backup-before-overwrite is the contract: a pilot doc is never silently
// replaced. Kept to the last 20 per pilot — one row per save would grow
// world.db without bound.
export const savePilot = db.transaction((name, docJson) => {
    const existing = stmts.getPilot.get(name);
    const now = Date.now();
    if (existing) {
        stmts.backup.run(name, existing.doc, now);
        stmts.pruneBackups.run(name, name);
    }
    stmts.upsertPilot.run(name, docJson, now);
    return now;
});

// Connect-path self-heal: when a pilots row no longer parses, fall back to
// the newest backup that does and repair the row so the next connect is
// clean (savePilot tucks the corrupt doc into backups for forensics —
// backup-before-overwrite holds even here). `updated` is the backup's
// created stamp: the last moment that doc is known to have been current,
// which keeps the away-digest window honest. Nothing parses → null.
export function restorePilotFromBackup(name) {
    let found = null;
    // Find first, write after: savePilot mid-iterate would throw ("connection
    // busy") — better-sqlite3 forbids writes while a cursor is open. The
    // break closes the cursor.
    for (const row of stmts.backupsNewest.iterate(name)) {
        try { found = { parsed: JSON.parse(row.doc), doc: row.doc, updated: row.created }; break; }
        catch { /* corrupt backup — keep walking back */ }
    }
    if (!found) return null;
    savePilot(name, found.doc);
    return { parsed: found.parsed, updated: found.updated };
}

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
