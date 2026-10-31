'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dir, 'autopot.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_hash TEXT NOT NULL UNIQUE,
      salt BLOB NOT NULL, verifier BLOB NOT NULL, wrap_dek BLOB NOT NULL,
      rec_salt BLOB NOT NULL, wrap_dek_rec BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dek_wrapped BLOB NOT NULL,
      created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS docs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, version INTEGER NOT NULL, blob BLOB NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, kind)
    );
    CREATE TABLE IF NOT EXISTS photos (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL, blob BLOB NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
  `);
  migrate(db);
  return db;
}

/* Schema-Erweiterungen idempotent nachziehen (PRAGMA user_version) */
function migrate(db) {
  const v = db.prepare('PRAGMA user_version').get().user_version;
  const cols = t => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name));
  if (v < 2) {
    const u = cols('users'), s = cols('sessions');
    if (!u.has('totp_wrapped')) db.exec('ALTER TABLE users ADD COLUMN totp_wrapped BLOB');
    if (!u.has('totp_step')) db.exec('ALTER TABLE users ADD COLUMN totp_step INTEGER NOT NULL DEFAULT 0');
    if (!s.has('label')) db.exec('ALTER TABLE sessions ADD COLUMN label BLOB');
    if (!s.has('absolute_expires')) db.exec('ALTER TABLE sessions ADD COLUMN absolute_expires INTEGER NOT NULL DEFAULT 0');
    db.exec(`CREATE TABLE IF NOT EXISTS sec_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sec_events_user ON sec_events(user_id, at);
      PRAGMA user_version = 2;`);
  }
  if (db.prepare('PRAGMA user_version').get().user_version < 3) {
    const u = cols('users');
    if (!u.has('disabled')) db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
    if (!u.has('last_login')) db.exec('ALTER TABLE users ADD COLUMN last_login INTEGER');
    db.exec(`CREATE TABLE IF NOT EXISTS invites (
      code_hash TEXT PRIMARY KEY, uses_left INTEGER NOT NULL, expires_at INTEGER, created_at INTEGER NOT NULL, note TEXT);
      CREATE TABLE IF NOT EXISTS login_fails (
      key TEXT PRIMARY KEY, n INTEGER NOT NULL, first INTEGER NOT NULL, until INTEGER NOT NULL);
      PRAGMA user_version = 3;`);
  }
  if (db.prepare('PRAGMA user_version').get().user_version < 4) {
    const u = cols('users');
    if (!u.has('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
    if (!u.has('display_name')) db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
    db.exec(`
      CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
        author_id INTEGER, author_name TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER);
      CREATE INDEX IF NOT EXISTS news_pub ON news(published, pinned, published_at);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, actor_role TEXT, action TEXT NOT NULL, target TEXT, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS shares (
        token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, views INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS shares_user ON shares(user_id);
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, share_token TEXT NOT NULL REFERENCES shares(token) ON DELETE CASCADE,
        reason TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open');
      PRAGMA user_version = 4;`);
  }
}

/* Server-Geheimnis (Pepper für den E-Mail-Blindindex): Umgebungsvariable oder Datei mit 0600 */
function loadPepper(dir) {
  if (process.env.AUTOPOT_SECRET && process.env.AUTOPOT_SECRET.length >= 32) return Buffer.from(process.env.AUTOPOT_SECRET);
  const f = path.join(dir, 'server-secret.key');
  try { return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex'); } catch (e) { /* neu anlegen */ }
  const k = crypto.randomBytes(32);
  fs.writeFileSync(f, k.toString('hex'), { mode: 0o600 });
  return k;
}
module.exports = { openDb, loadPepper };
