/* Server-Tests (Node >= 22): node --test tests/server.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server/server');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopot-srv-'));
let srv, base;
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'autopot' };

async function start() {
  srv = createServer({ dataDir: dir, registration: true, registerPerHour: 100, loginPer10Min: 200, powBits: 0 });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
}
const stop = () => new Promise(r => srv.close(r));
function client() {
  let cookie = '';
  const call = async (method, url, body, extra = {}) => {
    if (url === '/api/register' && body && body.adult === undefined) body = Object.assign({ adult: true, terms: true }, body);
    const res = await fetch(base + url, { method, headers: Object.assign({}, H, cookie ? { Cookie: cookie } : {}, extra), body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
    let data = null; try { data = await res.json(); } catch (e) { /* kein JSON */ }
    return { status: res.status, data, res };
  };
  call.cookie = () => cookie;
  call.setCookie = c => { cookie = c; };
  return call;
}
const PW = 'Sehr-geheimes-Passwort-42';
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

test.before(start);
test.after(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Registrierung, Anmeldung und Abmeldung', async () => {
  const a = client();
  assert.equal((await a('POST', '/api/register', { email: 'alice@example.org', password: 'kurz' })).status, 400);
  assert.equal((await a('POST', '/api/register', { email: 'kein-email', password: PW })).status, 400);
  const r = await a('POST', '/api/register', { email: 'Alice@Example.org', password: PW });
  assert.equal(r.status, 201);
  assert.match(r.data.recoveryCode, /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  assert.match(r.res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await a('GET', '/api/me')).status, 200);
  assert.equal((await a('POST', '/api/register', { email: 'alice@example.org', password: PW })).status, 409);
  assert.equal((await a('POST', '/api/logout')).status, 200);
  assert.equal((await a('GET', '/api/me')).status, 401);
  const b = client();
  assert.equal((await b('POST', '/api/login', { email: 'alice@example.org', password: 'falsch-falsch-1' })).status, 401);
  assert.equal((await b('POST', '/api/login', { email: 'ALICE@example.org', password: PW })).status, 200);
  assert.equal((await b('GET', '/api/me')).status, 200);
});

test('Zustand: speichern, lesen, Konflikterkennung', async () => {
  const a = client(); await a('POST', '/api/login', { email: 'alice@example.org', password: PW });
  assert.deepEqual((await a('GET', '/api/state')).data, { version: 0, data: null });
  const put = await a('PUT', '/api/state', { baseVersion: 0, data: { entries: [{ note: 'GEHEIMER-TESTWERT-4711' }] } });
  assert.equal(put.status, 200); assert.equal(put.data.version, 1);
  const get = await a('GET', '/api/state');
  assert.equal(get.data.data.entries[0].note, 'GEHEIMER-TESTWERT-4711');
  const conflict = await a('PUT', '/api/state', { baseVersion: 0, data: { entries: [] } });
  assert.equal(conflict.status, 409); assert.equal(conflict.data.version, 1);
  assert.equal((await a('PUT', '/api/state', { baseVersion: 1, data: { entries: [] } })).data.version, 2);
  assert.equal((await a('PUT', '/api/state', { baseVersion: 2, data: 'text' })).status, 400);
});

test('Fotos: Validierung, Abruf, Löschen', async () => {
  const a = client(); await a('POST', '/api/login', { email: 'alice@example.org', password: PW });
  assert.equal((await a('PUT', '/api/photos/abc123', { data: PHOTO })).status, 200);
  assert.equal((await a('PUT', '/api/photos/abc123', { data: 'javascript:alert(1)' })).status, 400);
  assert.equal((await a('PUT', '/api/photos/a%20b', { data: PHOTO })).status, 400);
  assert.deepEqual((await a('GET', '/api/photos')).data.ids, ['abc123']);
  assert.equal((await a('GET', '/api/photos/abc123')).data.data, PHOTO);
  assert.equal((await a('DELETE', '/api/photos/abc123')).status, 200);
  assert.equal((await a('GET', '/api/photos/abc123')).status, 404);
  await a('PUT', '/api/photos/keep1', { data: PHOTO });
});

test('Datenbank enthält weder Klartext-Daten noch E-Mail-Adressen', async () => {
  const files = fs.readdirSync(dir).filter(f => f.startsWith('autopot.sqlite'));
  assert.ok(files.length > 0);
  const raw = Buffer.concat(files.map(f => fs.readFileSync(path.join(dir, f))));
  assert.ok(!raw.includes('GEHEIMER-TESTWERT-4711'), 'Notiz im Klartext gefunden');
  assert.ok(!raw.includes('alice@example.org') && !raw.includes('example.org'), 'E-Mail im Klartext gefunden');
  assert.ok(!raw.includes('/9j/4AAQSkZJRg'), 'Foto im Klartext gefunden');
  assert.ok(!raw.includes(PW), 'Passwort im Klartext gefunden');
  assert.equal((fs.statSync(path.join(dir, 'server-secret.key')).mode & 0o077), 0, 'Geheimnis-Datei nur für den Besitzer');
});

test('Nutzer sind voneinander getrennt', async () => {
  const bob = client();
  assert.equal((await bob('POST', '/api/register', { email: 'bob@example.org', password: PW + 'x' })).status, 201);
  assert.deepEqual((await bob('GET', '/api/state')).data, { version: 0, data: null });
  assert.deepEqual((await bob('GET', '/api/photos')).data.ids, []);
  assert.equal((await bob('GET', '/api/photos/keep1')).status, 404);
  /* Bobs Sitzung mit Alices Datensatz: derselbe Pfad liefert nichts */
  await bob('PUT', '/api/state', { baseVersion: 0, data: { entries: [{ note: 'bob' }] } });
  const alice = client(); await alice('POST', '/api/login', { email: 'alice@example.org', password: PW });
  assert.equal((await alice('GET', '/api/state')).data.data.entries.length, 0);
});

test('Sicherheit: CSRF-Schutz, Header, Dateifreigabe', async () => {
  const noHeader = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  const foreign = await fetch(base + '/api/login', { method: 'POST', headers: Object.assign({ Origin: 'https://evil.example' }, H), body: '{}' });
  assert.equal(foreign.status, 403);
  const home = await fetch(base + '/');
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/server/server.js', '/server-data/autopot.sqlite', '/package.json', '/tests/server.test.js', '/..%2fpackage.json', '/data/autopot-grow-backup.json']) {
    assert.equal((await fetch(base + p)).status, 404, p + ' darf nicht ausgeliefert werden');
  }
  assert.equal((await fetch(base + '/api/state')).status, 401);
});

test('Sitzung überlebt Server-Neustart (DEK steckt nur im Cookie-Token)', async () => {
  const a = client(); await a('POST', '/api/login', { email: 'alice@example.org', password: PW });
  const ck = a.cookie();
  await stop(); await start();
  const b = client(); b.setCookie(ck);
  assert.equal((await b('GET', '/api/state')).status, 200);
  const forged = client(); forged.setCookie(ck.slice(0, -2) + 'AA');
  assert.equal((await forged('GET', '/api/state')).status, 401);
});

test('Passwort ändern und Wiederherstellung per Code', async () => {
  const a = client(); const reg = await a('POST', '/api/register', { email: 'carol@example.org', password: PW });
  await a('PUT', '/api/state', { baseVersion: 0, data: { entries: [{ note: 'carol-daten' }] } });
  const other = client(); await other('POST', '/api/login', { email: 'carol@example.org', password: PW });
  assert.equal((await a('POST', '/api/password', { currentPassword: 'falsch-falsch-9', newPassword: 'Neues-Passwort-77' })).status, 401);
  const ch = await a('POST', '/api/password', { currentPassword: PW, newPassword: 'Neues-Passwort-77' });
  assert.equal(ch.status, 200);
  assert.equal((await other('GET', '/api/me')).status, 401, 'andere Sitzungen werden beendet');
  assert.equal((await a('GET', '/api/me')).status, 200, 'aktuelle Sitzung bleibt');
  const c = client();
  assert.equal((await c('POST', '/api/login', { email: 'carol@example.org', password: PW })).status, 401);
  assert.equal((await c('POST', '/api/login', { email: 'carol@example.org', password: 'Neues-Passwort-77' })).status, 200);
  assert.equal((await c('GET', '/api/state')).data.data.entries[0].note, 'carol-daten', 'Daten nach Passwortwechsel lesbar');
  /* Passwort vergessen: Wiederherstellungscode (nach dem Wechsel gilt der neue Code, der alte nicht mehr) */
  const lost = client();
  assert.equal((await lost('POST', '/api/recover', { email: 'carol@example.org', recoveryCode: reg.data.recoveryCode, newPassword: 'Anderes-Passwort-88' })).status, 401, 'alter Code ungültig');
  const rec = await lost('POST', '/api/recover', { email: 'carol@example.org', recoveryCode: ch.data.recoveryCode.toLowerCase(), newPassword: 'Anderes-Passwort-88' });
  assert.equal(rec.status, 200);
  assert.equal((await lost('GET', '/api/state')).data.data.entries[0].note, 'carol-daten', 'Daten nach Wiederherstellung lesbar');
  assert.equal((await client()('POST', '/api/login', { email: 'carol@example.org', password: 'Anderes-Passwort-88' })).status, 200);
});

test('Konto sperrt nach Fehlversuchen', async () => {
  const a = client();
  await a('POST', '/api/register', { email: 'dave@example.org', password: PW });
  const x = client();
  let last;
  for (let i = 0; i < 8; i++) last = await x('POST', '/api/login', { email: 'dave@example.org', password: 'falsch-falsch-' + i });
  assert.equal(last.status, 401);
  assert.equal((await x('POST', '/api/login', { email: 'dave@example.org', password: PW })).status, 429, 'auch das richtige Passwort wird gesperrt');
});

test('Export und Konto löschen', async () => {
  const a = client(); await a('POST', '/api/login', { email: 'alice@example.org', password: PW });
  const ex = await a('GET', '/api/export');
  assert.equal(ex.status, 200); assert.ok(ex.data.photos.keep1);
  assert.equal((await a('DELETE', '/api/account', { password: 'falsch-falsch-1' })).status, 401);
  assert.equal((await a('DELETE', '/api/account', { password: PW })).status, 200);
  assert.equal((await a('GET', '/api/me')).status, 401);
  assert.equal((await client()('POST', '/api/login', { email: 'alice@example.org', password: PW })).status, 401);
  const db = new (require('node:sqlite').DatabaseSync)(path.join(dir, 'autopot.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM photos WHERE id=?').get('keep1').n, 0, 'Fotos sind mit dem Konto gelöscht');
  db.close();
});

/* ---------- Erweiterungen v6 ---------- */
const T = require('../server/totp');

test('Zwei-Faktor-Anmeldung: Einrichtung, Pflicht beim Login, Replay-Schutz, Rücksetzen per Wiederherstellung', async () => {
  const a = client();
  const reg = await a('POST', '/api/register', { email: 'erin@example.org', password: PW });
  const setup = await a('POST', '/api/2fa/setup');
  assert.equal(setup.status, 200);
  assert.match(setup.data.uri, /^otpauth:\/\/totp\/AutoPot%20Grow:.+secret=[A-Z2-7]{32}&issuer=AutoPot%20Grow/);
  const secret = Buffer.from(setup.data.secret.split('').reduce((acc, ch) => acc + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch).toString(2).padStart(5, '0'), '').match(/.{8}/g).map(b => parseInt(b, 2)));
  assert.equal((await a('POST', '/api/2fa/enable', { code: '000000' === T.code(secret, T.currentStep()) ? '111111' : '000000' })).status, 400);
  const step = T.currentStep();
  assert.equal((await a('POST', '/api/2fa/enable', { code: T.code(secret, step) })).status, 200);
  assert.equal((await a('GET', '/api/me')).data.totp, true);
  const b = client();
  const need = await b('POST', '/api/login', { email: 'erin@example.org', password: PW });
  assert.equal(need.status, 401); assert.equal(need.data.error, 'totp_required');
  assert.equal((await b('POST', '/api/login', { email: 'erin@example.org', password: PW, totp: T.code(secret, step) })).data.error, 'bad_totp', 'bereits benutzter Code wird abgelehnt');
  assert.equal((await b('POST', '/api/login', { email: 'erin@example.org', password: PW, totp: T.code(secret, step + 1) })).status, 200);
  assert.equal((await b('POST', '/api/2fa/disable', { password: 'falsch-falsch-1', code: '123456' })).status, 401);
  const db = new (require('node:sqlite').DatabaseSync)(path.join(dir, 'autopot.sqlite'));
  const raw = db.prepare("SELECT totp_wrapped FROM users WHERE totp_wrapped IS NOT NULL").all();
  db.close();
  assert.ok(raw.length && raw.every(r => !Buffer.from(r.totp_wrapped).includes(secret)), 'TOTP-Geheimnis liegt verschlüsselt vor');
  const c = client();
  const rec = await c('POST', '/api/recover', { email: 'erin@example.org', recoveryCode: reg.data.recoveryCode, newPassword: 'Ganz-neues-Kennwort-7' });
  assert.equal(rec.status, 200); assert.equal(rec.data.totpReset, true);
  assert.equal((await client()('POST', '/api/login', { email: 'erin@example.org', password: 'Ganz-neues-Kennwort-7' })).status, 200, 'nach Wiederherstellung ohne 2FA');
  const log = (await c('GET', '/api/security-log')).data.events.map(e => e.type);
  for (const t of ['register', '2fa_enabled', 'login', 'recovery_used', '2fa_disabled']) assert.ok(log.includes(t), 'Protokoll enthält ' + t);
});

test('Geräte: Liste mit Bezeichnung, einzelne und alle anderen abmelden', async () => {
  const UA = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' };
  const a = client(), b = client(), c = client();
  await a('POST', '/api/register', { email: 'frank@example.org', password: PW });
  await b('POST', '/api/login', { email: 'frank@example.org', password: PW }, UA);
  await c('POST', '/api/login', { email: 'frank@example.org', password: PW });
  const list = (await a('GET', '/api/sessions')).data.sessions;
  assert.equal(list.length, 3);
  assert.equal(list.filter(x => x.current).length, 1);
  assert.ok(list.some(x => x.label === 'Chrome · Android'), 'Gerätebezeichnung aus User-Agent');
  const bId = (await b('GET', '/api/sessions')).data.sessions.find(x => x.current).id;
  assert.equal((await a('DELETE', '/api/sessions/' + bId)).status, 200);
  assert.equal((await b('GET', '/api/me')).status, 401, 'abgemeldetes Gerät verliert Zugriff');
  assert.equal((await a('DELETE', '/api/sessions/others')).data.removed, 1);
  assert.equal((await c('GET', '/api/me')).status, 401);
  assert.equal((await a('GET', '/api/me')).status, 200, 'eigene Sitzung bleibt');
  const db = new (require('node:sqlite').DatabaseSync)(path.join(dir, 'autopot.sqlite'));
  const labels = db.prepare('SELECT label FROM sessions').all();
  db.close();
  assert.ok(labels.every(r => !r.label || !Buffer.from(r.label).includes('Android')), 'Gerätebezeichnung verschlüsselt gespeichert');
});

test('Sperre gilt pro Konto und IP – ein Angreifer sperrt dich nicht aus', async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'autopot-srv2-'));
  const s2 = createServer({ dataDir: d2, trustProxy: true, loginPer10Min: 200, powBits: 0 });
  await new Promise(r => s2.listen(0, '127.0.0.1', r));
  const b2 = `http://127.0.0.1:${s2.address().port}`;
  const call = (ip, body, url = '/api/login') => fetch(b2 + url, { method: 'POST', headers: Object.assign({ 'X-Forwarded-For': ip }, H), body: JSON.stringify(body) }).then(r => r.status);
  assert.equal(await call('9.9.9.9', { email: 'gina@example.org', password: PW, adult: true, terms: true }, '/api/register'), 201);
  for (let i = 0; i < 8; i++) await call('6.6.6.6', { email: 'gina@example.org', password: 'falsch-falsch-' + i });
  assert.equal(await call('6.6.6.6', { email: 'gina@example.org', password: PW }), 429, 'Angreifer-IP gesperrt');
  assert.equal(await call('7.7.7.7', { email: 'gina@example.org', password: PW }), 200, 'Inhaberin von anderer IP weiter erlaubt');
  await new Promise(r => s2.close(r));
  fs.rmSync(d2, { recursive: true, force: true });
});

test('Härtung: Content-Type, Cache, robots/security.txt, Header', async () => {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Requested-With': 'autopot' }, body: '{"email":"a@b.cd","password":"x"}' });
  assert.equal(r.status, 415);
  const cross = await fetch(base + '/api/login', { method: 'POST', headers: Object.assign({ 'Sec-Fetch-Site': 'cross-site' }, H), body: '{}' });
  assert.equal(cross.status, 403);
  const app = await fetch(base + '/js/core.js');
  const etag = app.headers.get('etag');
  assert.ok(etag);
  assert.equal((await fetch(base + '/js/core.js', { headers: { 'If-None-Match': etag } })).status, 304);
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/api\//);
  const fav = await fetch(base + '/favicon.ico');
  assert.equal(fav.status, 200); assert.equal(fav.headers.get('content-type'), 'image/png');
  assert.match(await (await fetch(base + '/.well-known/security.txt')).text(), /Contact:/);
  assert.equal((await fetch(base + '/' + 'x'.repeat(3000))).status, 414);
  const h = (await fetch(base + '/')).headers;
  assert.equal(h.get('x-frame-options'), 'DENY');
  assert.match(h.get('permissions-policy'), /camera=\(\)/);
});

test('Backup-Skript erzeugt geprüfte Sicherung', async () => {
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'backup.js')], { env: Object.assign({}, process.env, { DATA_DIR: dir }) }).toString();
  assert.match(out, /Sicherung erstellt: .*\(\d+ Konten, Prüfung: ok\)/);
  const files = fs.readdirSync(path.join(dir, 'backups'));
  assert.equal(files.length, 1);
  assert.equal(fs.statSync(path.join(dir, 'backups', files[0])).mode & 0o077, 0);
});

/* ---------- v7: Registrierungsschutz, Verwaltung, Betrieb ---------- */
const { execFileSync } = require('child_process');
const nodeArgs = ['--disable-warning=ExperimentalWarning'];
const cli = (d, script, ...a) => execFileSync(process.execPath, [...nodeArgs, path.join(__dirname, '..', 'server', script), ...a], { env: Object.assign({}, process.env, { DATA_DIR: d }) }).toString();
async function tempServer(opts) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'autopot-v7-'));
  const s = createServer(Object.assign({ dataDir: d, registerPerHour: 100, loginPer10Min: 200 }, opts));
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const call = async (method, url, body, extra = {}) => { const r = await fetch(b + url, { method, headers: Object.assign({}, H, extra), body: body === undefined ? undefined : JSON.stringify(body) }); let data = null; try { data = await r.json(); } catch (e) { /* ignore */ } return { status: r.status, data, headers: r.headers, text: null }; };
  return { d, s, b, call, close: () => new Promise(r => s.close(r)), rm: () => fs.rmSync(d, { recursive: true, force: true }) };
}
const solvePow = (challenge, bits) => {
  const cr = require('crypto');
  for (let n = 0; ; n++) {
    const h = cr.createHash('sha256').update(challenge + ':' + n).digest();
    let z = 0; for (const x of h) { if (x === 0) { z += 8; continue; } z += Math.clz32(x) - 24; break; }
    if (z >= bits) return String(n);
  }
};

test('Bot-Schutz (Proof-of-Work), Altersbestätigung, Tageslimit, Höchstzahl', async () => {
  const t = await tempServer({ powBits: 10, maxUsers: 2, regDailyMax: 5 });
  const cfg = (await t.call('GET', '/api/config')).data;
  assert.equal(cfg.mode, 'open'); assert.equal(cfg.pow, 10);
  const base = { email: 'pow@example.org', password: PW, adult: true, terms: true };
  assert.equal((await t.call('POST', '/api/register', base)).data.error, 'bad_challenge', 'ohne Lösung abgelehnt');
  const ch = (await t.call('GET', '/api/challenge')).data;
  assert.equal((await t.call('POST', '/api/register', Object.assign({}, base, { challenge: ch.challenge, nonce: 'falsch' }))).data.error, 'bad_challenge');
  const nonce = solvePow(ch.challenge, 10);
  assert.equal((await t.call('POST', '/api/register', Object.assign({}, base, { adult: false, challenge: ch.challenge, nonce }))).data.error, 'adult_required');
  assert.equal((await t.call('POST', '/api/register', Object.assign({}, base, { terms: false, challenge: ch.challenge, nonce }))).data.error, 'terms_required');
  assert.equal((await t.call('POST', '/api/register', Object.assign({}, base, { challenge: ch.challenge, nonce }))).status, 201);
  assert.equal((await t.call('POST', '/api/register', Object.assign({}, base, { email: 'pow2@example.org', challenge: ch.challenge, nonce }))).data.error, 'bad_challenge', 'Lösung nur einmal gültig');
  const forged = ch.challenge.replace(/^\d+/, String(Date.now()));
  assert.equal((await t.call('POST', '/api/register', Object.assign({}, base, { email: 'pow3@example.org', challenge: forged, nonce: solvePow(forged, 10) }))).data.error, 'bad_challenge', 'gefälschte Aufgabe abgelehnt');
  const reg = async e => { const c = (await t.call('GET', '/api/challenge')).data.challenge; return t.call('POST', '/api/register', Object.assign({}, base, { email: e, challenge: c, nonce: solvePow(c, 10) })); };
  assert.equal((await reg('two@example.org')).status, 201);
  assert.equal((await reg('three@example.org')).data.error, 'full', 'Höchstzahl an Konten erreicht');
  await t.close(); t.rm();
});

test('Einladungen: per Verwaltung erzeugt, einmal gültig, widerrufbar', async () => {
  const t = await tempServer({ regMode: 'invite' });
  assert.equal((await t.call('GET', '/api/config')).data.mode, 'invite');
  const out = cli(t.d, 'admin.js', 'invite', 'create', '--uses', '1', '--days', '7', '--note', 'Test');
  const code = /Einladungscode: ([0-9A-Z-]+)/.exec(out)[1];
  const body = e => ({ email: e, password: PW, adult: true, terms: true });
  assert.equal((await t.call('POST', '/api/register', body('i1@example.org'))).data.error, 'bad_invite');
  assert.equal((await t.call('POST', '/api/register', Object.assign(body('i1@example.org'), { invite: code.toLowerCase().replace(/-/g, ' ') }))).status, 201, 'Code unabhängig von Schreibweise');
  assert.equal((await t.call('POST', '/api/register', Object.assign(body('i2@example.org'), { invite: code }))).data.error, 'bad_invite', 'verbraucht');
  const out2 = cli(t.d, 'admin.js', 'invite', 'create', '--uses', '5');
  const code2 = /Einladungscode: ([0-9A-Z-]+)/.exec(out2)[1];
  const id = cli(t.d, 'admin.js', 'invite', 'list').split('\n').find(l => / übrig: 5 /.test(l)).split(' ')[0];
  assert.match(cli(t.d, 'admin.js', 'invite', 'revoke', id), /1 Einladung/);
  assert.equal((await t.call('POST', '/api/register', Object.assign(body('i3@example.org'), { invite: code2 }))).data.error, 'bad_invite', 'widerrufen');
  const db = new (require('node:sqlite').DatabaseSync)(path.join(t.d, 'autopot.sqlite'));
  assert.ok(!db.prepare('SELECT code_hash FROM invites').all().some(r => r.code_hash.includes(code.replace(/-/g, ''))), 'Code nur als Hash gespeichert');
  db.close();
  await t.close(); t.rm();
});

test('Verwaltung: Statistik, Suche, Sperren, Löschen', async () => {
  const t = await tempServer({ powBits: 0 });
  let cookie = '';
  const r = await fetch(t.b + '/api/register', { method: 'POST', headers: H, body: JSON.stringify({ email: 'adm@example.org', password: PW, adult: true, terms: true }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
  const recCode = (await r.json()).recoveryCode;
  const me = () => fetch(t.b + '/api/me', { headers: { Cookie: cookie } }).then(x => x.status);
  assert.equal(await me(), 200);
  assert.match(cli(t.d, 'admin.js', 'stats'), /Konten:\s+1/);
  const id = /Nutzer-ID (\d+)/.exec(cli(t.d, 'admin.js', 'find', 'ADM@example.org'))[1];
  assert.match(cli(t.d, 'admin.js', 'users'), /1 Konto/);
  cli(t.d, 'admin.js', 'disable', id);
  assert.equal((await t.call('POST', '/api/recover', { email: 'adm@example.org', recoveryCode: recCode, newPassword: 'Neues-Kennwort-99' })).data.error, 'disabled', 'gesperrtes Konto kann sich nicht per Wiederherstellung zurückholen');
  assert.equal(await me(), 401, 'gesperrtes Konto verliert die Sitzung');
  assert.equal((await t.call('POST', '/api/login', { email: 'adm@example.org', password: PW })).data.error, 'disabled');
  cli(t.d, 'admin.js', 'enable', id);
  assert.equal((await t.call('POST', '/api/login', { email: 'adm@example.org', password: PW })).status, 200);
  assert.match(cli(t.d, 'admin.js', 'delete', id, '--yes'), /gelöscht/);
  assert.equal((await t.call('POST', '/api/login', { email: 'adm@example.org', password: PW })).status, 401);
  await t.close(); t.rm();
});

test('Speicherkontingent, neuer Wiederherstellungscode, Sperre übersteht Neustart', async () => {
  const t = await tempServer({ powBits: 0, userQuotaMB: 0.01 }); /* ca. 10 KB */
  const r = await fetch(t.b + '/api/register', { method: 'POST', headers: H, body: JSON.stringify({ email: 'q@example.org', password: PW, adult: true, terms: true }) });
  const ck = { Cookie: r.headers.get('set-cookie').split(';')[0] };
  assert.equal((await t.call('PUT', '/api/state', { baseVersion: 0, data: { note: 'x'.repeat(5000) } }, ck)).status, 200);
  assert.equal((await t.call('PUT', '/api/state', { baseVersion: 1, data: { note: 'x'.repeat(20000) } }, ck)).data.error, 'quota');
  const me = (await t.call('GET', '/api/me', undefined, ck)).data;
  assert.ok(me.usageBytes > 5000 && me.quotaBytes > 0);
  assert.equal((await t.call('POST', '/api/recovery-code', { password: 'falsch-falsch-1' }, ck)).status, 401);
  const rc = await t.call('POST', '/api/recovery-code', { password: PW }, ck);
  assert.match(rc.data.recoveryCode, /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  assert.equal((await t.call('POST', '/api/recover', { email: 'q@example.org', recoveryCode: rc.data.recoveryCode, newPassword: 'Anderes-Kennwort-55' })).status, 200);
  for (let i = 0; i < 8; i++) await t.call('POST', '/api/login', { email: 'q@example.org', password: 'falsch-falsch-' + i });
  await t.close();
  const s2 = createServer({ dataDir: t.d, loginPer10Min: 200 });
  await new Promise(res => s2.listen(0, '127.0.0.1', res));
  const st = (await fetch(`http://127.0.0.1:${s2.address().port}/api/login`, { method: 'POST', headers: H, body: JSON.stringify({ email: 'q@example.org', password: 'Anderes-Kennwort-55' }) })).status;
  assert.equal(st, 429, 'Sperre bleibt nach Neustart bestehen');
  const raw = fs.readFileSync(path.join(t.d, 'autopot.sqlite'));
  assert.ok(!raw.includes('127.0.0.1') && !raw.includes('::ffff'), 'keine IP-Adressen in der Datenbank');
  await new Promise(res => s2.close(res)); t.rm();
});

test('Betrieb: Health, Metriken mit Token, Wiederherstellungsprobe', async () => {
  const t = await tempServer({ powBits: 0, metricsToken: 'geheimes-metrik-token' });
  const h = await t.call('GET', '/api/health');
  assert.equal(h.status, 200); assert.equal(h.data.ok, true);
  assert.equal(h.data.release, require('../package.json').version, 'Health meldet die Release-Version');
  assert.equal((await fetch(t.b + '/api/metrics')).status, 404, 'ohne Token unsichtbar');
  assert.equal((await fetch(t.b + '/api/metrics', { headers: { Authorization: 'Bearer falsch' } })).status, 404);
  await t.call('POST', '/api/register', { email: 'm@example.org', password: PW, adult: true, terms: true });
  const m = await (await fetch(t.b + '/api/metrics', { headers: { Authorization: 'Bearer geheimes-metrik-token' } })).text();
  assert.match(m, /autopot_users 1/); assert.match(m, /autopot_registrations_total 1/); assert.match(m, /autopot_requests_total\{class="2xx"\} \d+/);
  await t.close();
  assert.match(cli(t.d, 'backup.js'), /Sicherung erstellt/);
  assert.match(cli(t.d, 'restore.js', '--test'), /Probe erfolgreich: .*1 Konten erreichbar/);
  assert.throws(() => cli(t.d, 'restore.js', fs.readdirSync(path.join(t.d, 'backups')).map(f => path.join(t.d, 'backups', f))[0]), /mit --yes bestätigen|Command failed/);
  t.rm();
});

/* ---------- v9: Team-Bereich, News, geteilte Grows ---------- */
test('Team-Bereich: Rollen, 2FA-Pflicht, News, Einstellungen, Freigaben, Meldungen, Protokoll', async (tc) => {
  const t = await tempServer({ powBits: 0 });
  tc.after(async () => { try { await t.close(); } catch (e) { /* schon zu */ } t.rm(); });
  const mk = async email => {
    const r = await fetch(t.b + '/api/register', { method: 'POST', headers: H, body: JSON.stringify({ email, password: PW, adult: true, terms: true }) });
    const ck = { Cookie: r.headers.get('set-cookie').split(';')[0] };
    const id = Number(/Nutzer-ID (\d+)/.exec(cli(t.d, 'admin.js', 'find', email))[1]);
    const self = { ck, id, call: (m, u, b) => t.call(m, u, b, self.ck) };
    return self;
  };
  const admin = await mk('chef@example.org'), mod = await mk('mod@example.org'), user = await mk('user@example.org');
  assert.equal((await user.call('GET', '/api/admin/stats')).data.error, 'forbidden', 'normale Nutzer haben keinen Zugriff');
  cli(t.d, 'admin.js', 'role', String(admin.id), 'admin'); cli(t.d, 'admin.js', 'role', String(mod.id), 'moderator');
  cli(t.d, 'admin.js', 'name', String(admin.id), 'Chefredaktion');
  assert.equal((await admin.call('GET', '/api/admin/stats')).data.error, 'staff_2fa', 'Team braucht Zwei-Faktor-Anmeldung');
  const enable2fa = async who => { const s = (await who.call('POST', '/api/2fa/setup')).data; const sec = Buffer.from(s.secret.split('').map(ch => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch).toString(2).padStart(5, '0')).join('').match(/.{8}/g).map(x => parseInt(x, 2))); assert.equal((await who.call('POST', '/api/2fa/enable', { code: T.code(sec, T.currentStep()) })).status, 200); };
  await enable2fa(admin); await enable2fa(mod);
  const st = (await admin.call('GET', '/api/admin/stats')).data;
  assert.equal(st.users, 3); assert.equal(st.registrations.length, 30); assert.equal(st.isAdmin, true);
  assert.equal((await mod.call('GET', '/api/admin/stats')).data.isAdmin, false);

  /* News */
  const draft = await mod.call('POST', '/api/admin/news', { title: 'Entwurf', body: 'Noch geheim', published: false });
  assert.equal(draft.status, 201);
  const post = await admin.call('POST', '/api/admin/news', { title: 'Neue Version <3', body: 'Text mit <script>alert(1)</script> & **fett**', published: true, pinned: true });
  const pubList = (await t.call('GET', '/api/news')).data;
  assert.equal(pubList.total, 1, 'Entwürfe sind nicht öffentlich'); assert.equal(pubList.items[0].author, 'Chefredaktion'); assert.equal(pubList.items[0].pinned, true);
  assert.equal((await t.call('GET', '/api/news/' + draft.data.id)).status, 404);
  assert.equal((await mod.call('PUT', '/api/admin/news/' + draft.data.id, { title: 'Jetzt öffentlich', body: 'Hallo', published: true })).status, 200);
  assert.equal((await t.call('GET', '/api/news')).data.total, 2);
  const feed = await (await fetch(t.b + '/news/feed.xml')).text();
  assert.match(feed, /^<\?xml/); assert.match(feed, /<title>Neue Version &lt;3<\/title>/); assert.ok(!feed.includes('<script>'), 'Feed ist korrekt maskiert');
  assert.equal((await mod.call('DELETE', '/api/admin/news/' + post.data.id)).status, 200);
  assert.equal((await t.call('GET', '/api/news')).data.total, 1);

  /* Nutzerverwaltung */
  assert.equal((await mod.call('POST', `/api/admin/users/${user.id}/disable`)).status, 200);
  assert.equal((await user.call('GET', '/api/me')).status, 401, 'gesperrt durch Moderator');
  assert.equal((await mod.call('POST', `/api/admin/users/${user.id}/enable`)).status, 200);
  { const r = await fetch(t.b + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ email: 'user@example.org', password: PW }) }); user.ck.Cookie = r.headers.get('set-cookie').split(';')[0]; }
  assert.equal((await mod.call('POST', `/api/admin/users/${admin.id}/disable`)).data.error, 'forbidden', 'Moderator kann Admin nicht sperren');
  assert.equal((await mod.call('DELETE', `/api/admin/users/${user.id}`)).data.error, 'forbidden', 'Löschen nur für Admins');
  assert.equal((await mod.call('POST', `/api/admin/users/${user.id}/role`, { role: 'admin' })).data.error, 'forbidden', 'Rollen nur für Admins');
  const list = (await admin.call('GET', '/api/admin/users?filter=staff')).data;
  assert.equal(list.total, 2);
  assert.equal((await admin.call('GET', '/api/admin/users?q=USER@example.org')).data.users[0].id, user.id, 'Suche per E-Mail');

  /* Einstellungen zur Laufzeit */
  assert.equal((await mod.call('GET', '/api/admin/settings')).status, 403);
  assert.equal((await admin.call('PUT', '/api/admin/settings', { regMode: 'quatsch' })).status, 400);
  assert.equal((await admin.call('PUT', '/api/admin/settings', { regMode: 'closed', announcement: 'Wartung am Sonntag', sharingEnabled: true })).status, 200);
  assert.equal((await t.call('GET', '/api/config')).data.announcement, 'Wartung am Sonntag');
  assert.equal((await t.call('POST', '/api/register', { email: 'neu@example.org', password: PW, adult: true, terms: true })).data.error, 'closed');
  const inv = await admin.call('POST', '/api/admin/invites', { uses: 2, days: 3, note: 'Test' });
  assert.match(inv.data.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal((await admin.call('GET', '/api/admin/invites')).data.invites[0].usesLeft, 2);

  /* Geteilter Grow + Meldung + Moderation */
  const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const sh = await user.call('POST', '/api/shares', { title: 'Mein erster Grow', grow: { name: 'Gelato', strain: 'Gelato #41', start: '2026-09-01', evil: '<x>' }, entries: [{ date: '2026-09-02', ec: 1.2, note: 'geheim', extra: 'weg' }], photos: [{ date: '2026-09-02', data: photo }, { data: 'javascript:alert(1)' }], includeNotes: false });
  assert.equal(sh.status, 201); assert.match(sh.data.token, /^[A-Za-z0-9_-]{22}$/);
  const pubShare = await t.call('GET', '/api/shares/' + sh.data.token);
  assert.equal(pubShare.status, 200);
  assert.equal(pubShare.data.data.entries[0].note, '', 'Notizen nur auf Wunsch');
  assert.equal(pubShare.data.data.photos.length, 1, 'ungültige Fotos werden verworfen');
  assert.ok(!('evil' in pubShare.data.data.grow) && !('extra' in pubShare.data.data.entries[0]), 'nur erlaubte Felder');
  assert.equal((await t.call('POST', `/api/shares/${sh.data.token}/report`, { reason: 'x' })).status, 400);
  assert.equal((await t.call('POST', `/api/shares/${sh.data.token}/report`, { reason: 'Unangemessener Inhalt' })).status, 200);
  const reps = (await mod.call('GET', '/api/admin/reports')).data.reports;
  assert.equal(reps.length, 1); assert.equal(reps[0].token, sh.data.token);
  assert.equal((await mod.call('POST', `/api/admin/shares/${sh.data.token}/hide`)).status, 200);
  const gone = await t.call('GET', '/api/shares/' + sh.data.token);
  assert.equal(gone.status, 404); assert.match(gone.data.message, /vom Team entfernt/);
  assert.equal((await mod.call('GET', '/api/admin/reports')).data.reports.length, 0, 'Meldung erledigt');
  assert.equal((await user.call('GET', '/api/shares/mine')).data.shares[0].hidden, true);
  assert.equal((await mod.call('DELETE', '/api/shares/' + sh.data.token)).status, 404, 'fremde Freigabe nicht löschbar');
  assert.equal((await user.call('DELETE', '/api/shares/' + sh.data.token)).status, 200);

  /* Protokoll */
  assert.equal((await mod.call('GET', '/api/admin/audit')).status, 403);
  const au = (await admin.call('GET', '/api/admin/audit')).data.entries.map(e => e.action);
  for (const a of ['news_publish', 'user_disable', 'settings', 'invite_create', 'share_hide']) assert.ok(au.includes(a), 'Protokoll enthält ' + a);
});

/* ---------- Proxy, der den Host umschreibt (z. B. nginx ohne "proxy_set_header Host") ---------- */
test('Proxy: Origin wird gegen X-Forwarded-Host bzw. PUBLIC_URL geprüft', async () => {
  const http = require('http');
  const raw = (port, headers) => new Promise((res, rej) => {
    const body = JSON.stringify({ email: 'proxy@example.org', password: 'falsch-falsch-1' });
    const r = http.request({ host: '127.0.0.1', port, path: '/api/login', method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'autopot', 'Content-Length': Buffer.byteLength(body) }, headers) }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, data: JSON.parse(d || '{}') })); });
    r.on('error', rej); r.end(body);
  });
  const warn = console.warn; console.warn = () => {};
  try {
    const t = await tempServer({ trustProxy: true });
    const port = t.s.address().port;
    const rewritten = { Host: 'app:8080', Origin: 'https://grow.example.org' };
    assert.equal((await raw(port, rewritten)).data.error, 'csrf', 'ohne Hinweis auf den echten Host abgelehnt');
    assert.notEqual((await raw(port, Object.assign({ 'X-Forwarded-Host': 'grow.example.org' }, rewritten))).data.error, 'csrf', 'mit X-Forwarded-Host angenommen');
    assert.equal((await raw(port, { Host: 'app:8080', Origin: 'https://evil.example', 'X-Forwarded-Host': 'grow.example.org' })).data.error, 'csrf', 'fremde Herkunft bleibt gesperrt');
    await t.close(); t.rm();
    const t2 = await tempServer({ publicUrl: 'https://grow.example.org' });
    assert.notEqual((await raw(t2.s.address().port, rewritten)).data.error, 'csrf', 'mit PUBLIC_URL angenommen');
    await t2.close(); t2.rm();
  } finally { console.warn = warn; }
});
