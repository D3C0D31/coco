/* Browser-Test mit echtem Server: Registrierung, Anmeldung, Synchronisation zwischen zwei Geräten.
 * Start: node tests/e2e.test.js   (CHROME_PATH / PLAYWRIGHT_PATH wie bei smoke.test.js) */
const fs = require('fs');
const os = require('os');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright'); }
const { createServer } = require('../server/server');

let failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };
const waitFor = async (fn, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (e) { /* weiter */ } await new Promise(r => setTimeout(r, 150)); } return false; };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopot-e2e-'));
  const srv = createServer({ dataDir: dir });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const png = path.join(dir, 'foto.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const errors = [];
  const device = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', d => d.accept());
    return { ctx, page };
  };
  const EMAIL = 'tester@example.org', PW = 'Ein-langes-Passwort-2026';

  /* ---------- Landingpage ---------- */
  const A = await device(); const a = A.page;
  await a.goto(base + '/');
  ok((await a.title()).includes('AutoPot Grow') && (await a.locator('#features .card').count()) === 9, 'Landingpage lädt mit 9 Funktionskarten');
  ok(await a.locator('a[data-needs-reg]').first().isVisible(), 'Landingpage: Registrieren-Knopf sichtbar');
  ok((await a.locator('img.dark-only').getAttribute('src')) === 'img/preview-dark.jpg' && (await (await a.request.get(base + '/img/preview-dark.jpg')).ok()), 'Landingpage: Vorschaubild erreichbar');
  for (const p of ['/datenschutz.html', '/impressum.html']) ok((await a.request.get(base + p)).ok(), p + ' erreichbar');

  /* ---------- Registrierung im Browser ---------- */
  await a.goto(base + '/app.html?mode=register');
  await a.waitForSelector('#accountDlg[open]');
  await a.fill('#reEmail', EMAIL); await a.fill('#rePw', PW); await a.fill('#rePw2', PW + 'x');
  await a.check('#registerForm [name=consent]');
  await a.click('#registerForm button[type=submit]');
  ok((await a.textContent('#acctMsg')).includes('stimmen nicht überein'), 'Registrierung: ungleiche Passwörter werden abgelehnt');
  await a.fill('#rePw2', PW);
  await a.click('#registerForm button[type=submit]');
  await a.waitForSelector('#acctRecovery:not(.hidden)');
  const code = (await a.textContent('#recoveryCode')).trim();
  ok(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/.test(code), 'Registrierung: Wiederherstellungscode wird angezeigt');
  ok(await a.locator('#recoveryDone').isDisabled(), 'Registrierung: „Weiter“ erst nach Bestätigung aktiv');
  await a.check('#recoveryOk'); await a.click('#recoveryDone');
  ok(await waitFor(async () => (await a.getAttribute('#syncDot', 'class')).includes('ok')), 'Status-Punkt zeigt „synchronisiert“');

  /* ---------- Eintrag mit Foto → Cloud ---------- */
  await a.fill('#fEc', '1.7'); await a.fill('#fPh', '6.0'); await a.fill('#fNote', 'Cloud-Test-Notiz-8812');
  await a.setInputFiles('#fPhoto', png); await a.waitForSelector('#photoPreview:not(.hidden)');
  await a.click('#saveEntry');
  const serverHas = () => a.evaluate(async () => {
    const h = { 'X-Requested-With': 'autopot' };
    const s = await (await fetch('/api/state', { headers: h })).json(), p = await (await fetch('/api/photos', { headers: h })).json();
    return { notes: JSON.stringify(s.data || {}), photos: p.ids.length, version: s.version };
  });
  ok(await waitFor(async () => { const r = await serverHas(); return r.notes.includes('Cloud-Test-Notiz-8812') && r.photos === 1; }), 'Cloud: Eintrag und Foto liegen auf dem Server');
  const files = fs.readdirSync(dir).filter(f => f.startsWith('autopot.sqlite'));
  const raw = Buffer.concat(files.map(f => fs.readFileSync(path.join(dir, f))));
  ok(!raw.includes('Cloud-Test-Notiz-8812') && !raw.includes(EMAIL), 'Datenbankdatei enthält Notiz und E-Mail nicht im Klartext');
  ok(!(await a.evaluate(() => Object.values(localStorage).join('').includes('data:image'))), 'Browser: keine Bilddaten in localStorage');

  /* ---------- Zweites Gerät ---------- */
  const B = await device(); const b = B.page;
  await b.goto(base + '/app.html?mode=login');
  await b.waitForSelector('#accountDlg[open]');
  await b.fill('#liEmail', EMAIL); await b.fill('#liPw', 'falsches-Passwort-1');
  await b.click('#loginForm button[type=submit]');
  ok(await waitFor(async () => (await b.textContent('#acctMsg')).includes('falsch')), 'Login: falsches Passwort zeigt Fehlermeldung');
  await b.fill('#liPw', PW); await b.click('#loginForm button[type=submit]');
  ok(await waitFor(async () => (await b.textContent('#logBody')).includes('Cloud-Test-Notiz-8812')), 'Gerät B: Eintrag aus der Cloud sichtbar');
  ok(await waitFor(async () => (await b.locator('#logBody img.thumb').count()) === 1), 'Gerät B: Foto aus der Cloud geladen');
  await b.fill('#fNote', 'Von-Gerät-B'); await b.fill('#fEc', '1.9'); await b.click('#saveEntry');
  ok(await waitFor(async () => (await serverHas()).notes.includes('Von-Gerät-B')), 'Gerät B: neuer Eintrag landet in der Cloud');
  await a.click('#accountBtn'); await a.click('#syncNow');
  ok(await waitFor(async () => (await a.textContent('#logBody')).includes('Von-Gerät-B')), 'Gerät A: übernimmt den Eintrag von Gerät B per Sync');
  await a.keyboard.press('Escape');

  /* ---------- Gleichzeitige Änderung: Zusammenführen ---------- */
  await a.fill('#fNote', 'A-offline'); await a.fill('#fEc', '1.1'); await a.click('#saveEntry');
  await b.fill('#fNote', 'B-parallel'); await b.fill('#fEc', '1.2'); await b.click('#saveEntry');
  ok(await waitFor(async () => { const n = (await serverHas()).notes; return n.includes('A-offline') && n.includes('B-parallel'); }, 15000), 'Parallele Änderungen beider Geräte werden zusammengeführt');

  /* ---------- Passwort ändern ---------- */
  await a.click('#accountBtn');
  await a.click('#acctIn summary:has-text("Passwort ändern")');
  await a.fill('#pwCur', PW); await a.fill('#pwNew', 'Neues-Passwort-2026!'); await a.fill('#pwNew2', 'Neues-Passwort-2026!');
  await a.click('#pwForm button[type=submit]');
  await a.waitForSelector('#acctRecovery:not(.hidden)');
  const code2 = (await a.textContent('#recoveryCode')).trim();
  ok(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/.test(code2) && code2 !== code, 'Passwortwechsel: neuer Wiederherstellungscode');
  await a.check('#recoveryOk'); await a.click('#recoveryDone');

  /* ---------- Abmelden löscht lokale Daten, Login holt sie zurück ---------- */
  await a.click('#accountBtn'); await a.click('#logoutBtn');
  ok(await waitFor(async () => (await a.textContent('#logBody')).includes('Noch keine Einträge') && !(await a.evaluate(() => document.getElementById('accountDlg').open))), 'Abmelden: lokale Daten entfernt');
  ok(await waitFor(async () => a.evaluate(() => { const st = JSON.parse(localStorage.getItem('autopot-app-v3') || '{}'); return (st.entries || []).length === 0 && !localStorage.getItem('autopot-sync') && !localStorage.getItem('autopot-app-v3-prev'); })), 'Abmelden: Speicher geleert (keine Einträge, keine Sync-Daten)');
  await a.click('#accountBtn'); await a.fill('#liEmail', EMAIL); await a.fill('#liPw', PW);
  await a.click('#loginForm button[type=submit]');
  ok(await waitFor(async () => (await a.textContent('#acctMsg')).includes('falsch')), 'Altes Passwort funktioniert nach dem Wechsel nicht mehr');
  await a.fill('#liPw', 'Neues-Passwort-2026!'); await a.click('#loginForm button[type=submit]');
  ok(await waitFor(async () => (await a.textContent('#logBody')).includes('Cloud-Test-Notiz-8812')), 'Neu anmelden: Daten sind wieder da');

  /* ---------- Konto löschen ---------- */
  await a.click('#accountBtn');
  await a.click('#acctIn summary:has-text("Konto löschen")');
  await a.fill('#delPw', 'Neues-Passwort-2026!');
  await a.click('#delForm button[type=submit]');
  ok(await waitFor(async () => (await a.textContent('#logBody')).includes('Noch keine Einträge') && !(await a.evaluate(() => document.getElementById('accountDlg').open))), 'Konto löschen: lokale Daten entfernt');
  const gone = await a.evaluate(async (e) => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'autopot' }, body: JSON.stringify({ email: e, password: 'Neues-Passwort-2026!' }) })).status, EMAIL);
  ok(gone === 401, 'Konto löschen: Anmeldung danach unmöglich');

  /* Registrierung geschlossen */
  await A.ctx.close(); await B.ctx.close();
  srv.close();
  const closed = createServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'autopot-e2e2-')), registration: false });
  await new Promise(r => closed.listen(0, '127.0.0.1', r));
  const C = await device();
  await C.page.goto(`http://127.0.0.1:${closed.address().port}/`);
  ok(await waitFor(async () => !(await C.page.locator('a[data-needs-reg]').first().isVisible())), 'Geschlossene Registrierung: Knöpfe auf der Landingpage verschwinden');
  closed.close();

  const real = errors.filter(e => !/401|409|429/.test(e));
  ok(real.length === 0, 'Keine JS-/Konsolenfehler' + (real.length ? ': ' + real.slice(0, 4).join(' | ') : ''));
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle E2E-Tests bestanden');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('TESTFEHLER', e); process.exit(2); });
