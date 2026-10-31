'use strict';
/* Konsistente Sicherung der Datenbank im laufenden Betrieb (VACUUM INTO).
 * Aufruf: node server/backup.js [Zielordner]   – behält die letzten BACKUP_KEEP (Standard 14) Sicherungen.
 * Hinweis: Die Daten in der Sicherung bleiben verschlüsselt. Für die Anmeldung wird zusätzlich
 * server-secret.key (bzw. AUTOPOT_SECRET) gebraucht – getrennt aufbewahren! */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'server-data');
const target = process.argv[2] || path.join(dataDir, 'backups');
const keep = Number(process.env.BACKUP_KEEP || 14);
const src = path.join(dataDir, 'autopot.sqlite');
if (!fs.existsSync(src)) { console.error('Keine Datenbank gefunden:', src); process.exit(1); }
fs.mkdirSync(target, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.join(target, `autopot-${stamp}.sqlite`);
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
fs.chmodSync(out, 0o600);
const check = new DatabaseSync(out, { readOnly: true });
const ok = check.prepare('PRAGMA integrity_check').get();
const users = check.prepare('SELECT COUNT(*) AS n FROM users').get().n;
check.close();
const old = fs.readdirSync(target).filter(f => /^autopot-.*\.sqlite$/.test(f)).sort();
old.slice(0, Math.max(0, old.length - keep)).forEach(f => fs.unlinkSync(path.join(target, f)));
console.log(`Sicherung erstellt: ${out} (${users} Konten, Prüfung: ${Object.values(ok)[0]})`);
