'use strict';
/* Wiederherstellung und Wiederherstellungsprobe.
 *   node server/restore.js --test [Sicherung]    Probe: Sicherung in einen Temp-Ordner kopieren, Server darauf starten, prüfen
 *   node server/restore.js <Sicherung> --yes     Echte Wiederherstellung nach DATA_DIR (Server vorher stoppen!)
 * Ohne Angabe nimmt --test die neueste Sicherung aus DATA_DIR/backups. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'server-data');
const args = process.argv.slice(2);
const fail = m => { console.error('Fehler: ' + m); process.exit(1); };
const latest = () => {
  const dir = path.join(dataDir, 'backups');
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).filter(x => /^autopot-.*\.sqlite$/.test(x)).sort().pop() : null;
  return f ? path.join(dir, f) : null;
};
function inspect(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const ok = Object.values(db.prepare('PRAGMA integrity_check').get())[0];
  const users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const docs = db.prepare('SELECT COUNT(*) n FROM docs').get().n;
  const photos = db.prepare('SELECT COUNT(*) n FROM photos').get().n;
  db.close();
  return { ok, users, docs, photos };
}

(async () => {
  const test = args.includes('--test');
  const file = args.find(a => !a.startsWith('--')) || (test ? latest() : null);
  if (!file || !fs.existsSync(file)) fail('Keine Sicherung gefunden. Erst „npm run backup“ ausführen oder Pfad angeben.');
  const info = inspect(file);
  if (info.ok !== 'ok') fail('Integritätsprüfung der Sicherung fehlgeschlagen: ' + info.ok);
  console.log(`Sicherung ${path.basename(file)}: ${info.users} Konten, ${info.docs} Datensätze, ${info.photos} Fotos, Integrität ok.`);

  if (test) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopot-restoretest-'));
    try {
      fs.copyFileSync(file, path.join(tmp, 'autopot.sqlite'));
      const secret = path.join(dataDir, 'server-secret.key');
      if (fs.existsSync(secret)) fs.copyFileSync(secret, path.join(tmp, 'server-secret.key'));
      else if (!process.env.AUTOPOT_SECRET) console.warn('Warnung: Kein server-secret.key und kein AUTOPOT_SECRET – Anmeldungen würden nach einer Wiederherstellung scheitern!');
      const { createServer } = require('./server');
      const srv = createServer({ dataDir: tmp });
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/health`);
      const h = await res.json();
      const users = srv.db.prepare('SELECT COUNT(*) n FROM users').get().n;
      await new Promise(r => srv.close(r));
      if (!h.ok || users !== info.users) fail('Server startet auf der Sicherung nicht korrekt.');
      console.log(`Probe erfolgreich: Server startet auf der Sicherung, Zustand gesund, ${users} Konten erreichbar.`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    return;
  }

  if (!args.includes('--yes')) fail('Echte Wiederherstellung überschreibt die aktuelle Datenbank. Server stoppen und mit --yes bestätigen.');
  const target = path.join(dataDir, 'autopot.sqlite');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (fs.existsSync(target)) {
    fs.renameSync(target, `${target}.vor-wiederherstellung-${stamp}`);
    ['-wal', '-shm'].forEach(x => { if (fs.existsSync(target + x)) fs.renameSync(target + x, `${target}${x}.vor-wiederherstellung-${stamp}`); });
  }
  fs.copyFileSync(file, target); fs.chmodSync(target, 0o600);
  console.log(`Wiederhergestellt nach ${target}. Die bisherige Datenbank liegt daneben (…vor-wiederherstellung-${stamp}). Server jetzt starten.`);
})().catch(e => fail(e.message));
