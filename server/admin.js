'use strict';
/* Verwaltung auf der Kommandozeile (läuft auch, während der Server läuft).
 *   node server/admin.js stats
 *   node server/admin.js invite create [--uses 1] [--days 14] [--note "für Max"]
 *   node server/admin.js invite list
 *   node server/admin.js invite revoke <ID>
 *   node server/admin.js users [--inactive 180]
 *   node server/admin.js find <email>
 *   node server/admin.js disable <Nutzer-ID> | enable <Nutzer-ID> | logout <Nutzer-ID>
 *   node server/admin.js delete <Nutzer-ID> --yes
 *   node server/admin.js purge-inactive <Tage> --yes
 * Inhalte der Nutzer sind verschlüsselt und hier nicht lesbar – das ist Absicht. */
const fs = require('fs');
const path = require('path');
const C = require('./crypto');
const { openDb, loadPepper } = require('./db');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'server-data');
const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const has = name => args.includes('--' + name);
const day = 864e5;
const d = t => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '–');
const kb = b => (b / 1024).toFixed(0) + ' KB';
const out = (...a) => console.log(...a);
const fail = msg => { console.error('Fehler: ' + msg); process.exit(1); };

if (!fs.existsSync(path.join(dataDir, 'autopot.sqlite')) && args[0] !== 'help') fail('Keine Datenbank in ' + dataDir + ' (DATA_DIR setzen).');
const db = openDb(dataDir);
const userId = () => { const id = Number(args[1]); if (!Number.isInteger(id) || id < 1) fail('Bitte eine Nutzer-ID angeben (siehe „users“).'); const u = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!u) fail('Nutzer ' + id + ' nicht gefunden.'); return u; };
const usage = id => db.prepare('SELECT (SELECT COALESCE(SUM(length(blob)),0) FROM docs WHERE user_id=?) + (SELECT COALESCE(SUM(length(blob)),0) FROM photos WHERE user_id=?) AS b').get(id, id).b;

switch (args[0]) {
  case 'stats': {
    const now = Date.now(), n = sql => db.prepare(sql).get().n;
    let size = 0; try { size = fs.statSync(path.join(dataDir, 'autopot.sqlite')).size; } catch (e) { /* ignore */ }
    out(`Konten:            ${n('SELECT COUNT(*) n FROM users')} (gesperrt: ${n('SELECT COUNT(*) n FROM users WHERE disabled=1')}, mit 2FA: ${n('SELECT COUNT(*) n FROM users WHERE totp_wrapped IS NOT NULL')})`);
    out(`Neu (7 Tage):      ${db.prepare('SELECT COUNT(*) n FROM users WHERE created_at > ?').get(now - 7 * day).n}`);
    out(`Aktiv (30 Tage):   ${db.prepare('SELECT COUNT(*) n FROM users WHERE last_login > ?').get(now - 30 * day).n}`);
    out(`Sitzungen:         ${n('SELECT COUNT(*) n FROM sessions')}`);
    out(`Fotos:             ${n('SELECT COUNT(*) n FROM photos')}`);
    out(`Einladungen offen: ${db.prepare('SELECT COUNT(*) n FROM invites WHERE uses_left > 0 AND (expires_at IS NULL OR expires_at > ?)').get(now).n}`);
    out(`Fehlversuche 24 h: ${db.prepare("SELECT COUNT(*) n FROM sec_events WHERE type IN ('login_failed','totp_failed') AND at > ?").get(now - day).n}`);
    out(`Datenbank:         ${(size / 1048576).toFixed(1)} MB`);
    break;
  }
  case 'invite': {
    const sub = args[1];
    if (sub === 'create') {
      const uses = Math.max(1, Math.min(1000, Number(flag('uses', 1)) || 1)), days = Number(flag('days', 14)) || 0, note = String(flag('note', '')).slice(0, 80);
      const code = C.newInviteCode();
      db.prepare('INSERT INTO invites (code_hash, uses_left, expires_at, created_at, note) VALUES (?,?,?,?,?)').run(C.inviteHash(code), uses, days > 0 ? Date.now() + days * day : null, Date.now(), note);
      out(`Einladungscode: ${code}`);
      out(`Gültig für ${uses} Registrierung(en)${days > 0 ? `, bis ${d(Date.now() + days * day)}` : ', ohne Ablauf'}.`);
      out('Der Code wird nur als Hash gespeichert und kann später nicht mehr angezeigt werden.');
    } else if (sub === 'list') {
      const rows = db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all();
      if (!rows.length) out('Keine Einladungen.');
      rows.forEach(r => out(`${r.code_hash.slice(0, 10)}  übrig: ${r.uses_left}  erstellt: ${d(r.created_at)}  läuft ab: ${d(r.expires_at)}  ${r.expires_at && r.expires_at < Date.now() ? '(abgelaufen) ' : ''}${r.note || ''}`));
    } else if (sub === 'revoke') {
      const pre = String(args[2] || '');
      if (!/^[a-f0-9]{6,64}$/.test(pre)) fail('Bitte die ID aus „invite list“ angeben.');
      const n = db.prepare("UPDATE invites SET uses_left = 0 WHERE code_hash LIKE ? || '%'").run(pre).changes;
      out(n ? `${n} Einladung(en) widerrufen.` : 'Keine passende Einladung gefunden.');
    } else fail('invite create | list | revoke <ID>');
    break;
  }
  case 'users': {
    const inactive = Number(flag('inactive', 0));
    const rows = db.prepare('SELECT u.*, (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id) AS sess FROM users u ORDER BY u.id').all()
      .filter(u => !inactive || (u.last_login || u.created_at) < Date.now() - inactive * day);
    out('ID    erstellt          letzte Anmeldung  2FA  Status    Sitzungen  Speicher');
    rows.forEach(u => out(`${String(u.id).padEnd(5)} ${d(u.created_at)}  ${d(u.last_login).padEnd(16)}  ${u.totp_wrapped ? 'ja ' : 'nein'} ${u.disabled ? 'gesperrt' : 'aktiv   '}  ${String(u.sess).padEnd(9)}  ${kb(usage(u.id))}`));
    out(`${rows.length} Konto/Konten.`);
    break;
  }
  case 'find': {
    const email = String(args[1] || '').trim().toLowerCase();
    if (!email.includes('@')) fail('Bitte eine E-Mail-Adresse angeben.');
    const u = db.prepare('SELECT id, created_at, last_login, disabled FROM users WHERE email_hash=?').get(C.emailHash(loadPepper(dataDir), email));
    out(u ? `Nutzer-ID ${u.id} (erstellt ${d(u.created_at)}, letzte Anmeldung ${d(u.last_login)}${u.disabled ? ', gesperrt' : ''})` : 'Kein Konto mit dieser Adresse.');
    break;
  }
  case 'disable': case 'enable': {
    const u = userId(), on = args[0] === 'disable';
    db.prepare('UPDATE users SET disabled=? WHERE id=?').run(on ? 1 : 0, u.id);
    if (on) db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    db.prepare('INSERT INTO sec_events (user_id, type, at) VALUES (?,?,?)').run(u.id, on ? 'admin_disabled' : 'admin_enabled', Date.now());
    out(`Konto ${u.id} ${on ? 'gesperrt und überall abgemeldet' : 'entsperrt'}.`);
    break;
  }
  case 'logout': {
    const u = userId();
    out(`${db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id).changes} Sitzung(en) von Konto ${u.id} beendet.`);
    break;
  }
  case 'delete': {
    const u = userId();
    if (!has('yes')) fail(`Konto ${u.id} würde endgültig gelöscht (inkl. aller Daten). Zum Bestätigen --yes anhängen.`);
    db.prepare('DELETE FROM users WHERE id=?').run(u.id);
    out(`Konto ${u.id} und alle zugehörigen Daten gelöscht.`);
    break;
  }
  case 'purge-inactive': {
    const days = Number(args[1]);
    if (!(days >= 30)) fail('Bitte mindestens 30 Tage angeben, z. B. „purge-inactive 365 --yes“.');
    const cut = Date.now() - days * day;
    const ids = db.prepare('SELECT id FROM users WHERE COALESCE(last_login, created_at) < ?').all(cut).map(r => r.id);
    if (!has('yes')) { out(`${ids.length} Konto/Konten seit über ${days} Tagen inaktiv: ${ids.join(', ') || '–'}. Zum Löschen --yes anhängen.`); break; }
    ids.forEach(id => db.prepare('DELETE FROM users WHERE id=?').run(id));
    out(`${ids.length} inaktive(s) Konto/Konten gelöscht.`);
    break;
  }
  default:
    out(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 14).map(l => l.replace(/^\/?\s?\*\/?\s?/, '')).join('\n'));
}
db.close();
