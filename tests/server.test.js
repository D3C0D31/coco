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
  srv = createServer({ dataDir: dir, registration: true });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
}
const stop = () => new Promise(r => srv.close(r));
function client() {
  let cookie = '';
  const call = async (method, url, body, extra = {}) => {
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
