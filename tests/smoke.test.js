/* Browser-Smoke-Test für Anleitung und App.
 *
 * Start:   node tests/smoke.test.js
 * Braucht: Playwright (npm i -D playwright) und einen Chromium/Chrome.
 *   CHROME_PATH      Pfad zur Chrome-/Chromium-Datei (optional, sonst Playwrights eigener Browser)
 *   PLAYWRIGHT_PATH  Pfad zum Playwright-Modul, falls es nicht regulär auflösbar ist (optional)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

let playwright;
try { playwright = require('playwright'); }
catch (e) { playwright = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright'); }
const { chromium } = playwright;

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'autopot-test-'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.csv': 'text/csv' };

function serve() {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'app.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  const wipe = async () => {
    await page.evaluate(async () => {
      localStorage.clear();
      await new Promise(r => { const q = indexedDB.deleteDatabase('autopot-app'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    });
    await page.reload();
    await page.waitForSelector('#logBody');
  };
  const rowsCount = () => page.locator('#logBody tr').count();
  const download = async click => { const [d] = await Promise.all([page.waitForEvent('download'), click()]); const p = path.join(TMP, d.suggestedFilename()); await d.saveAs(p); return p; };
  const pngPath = path.join(TMP, 'foto.png');
  fs.writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

  /* ---------- Anleitung ---------- */
  await page.goto(base + '/anleitung.html');
  ok((await page.locator('h2[id^="k"]').count()) === 20, 'Anleitung: 20 Kapitel mit Anker');
  ok((await page.locator('.toc a').count()) === 20, 'Anleitung: Inhaltsverzeichnis mit 20 Links');
  ok((await page.textContent('#k9 ~ .table-wrap')).includes('Endphase') && (await page.textContent('#k10 ~ .table-wrap')).includes('Endphase'), 'Anleitung: Endphase in Kap. 9 und 10');
  await page.click('.toc a[href="#k14"]');
  ok((await page.evaluate(() => location.hash)) === '#k14', 'Anleitung: TOC-Link springt zum Kapitel');
  await page.click('#themeToggle');
  ok(['light', 'dark'].includes(await page.evaluate(() => document.documentElement.dataset.theme)), 'Anleitung: Theme-Toggle');
  const guideText = (await page.textContent('body')).replace(/\s+/g, ' ');
  const brokenUmlaut = guideText.match(/[a-z] (?:hrend|hren|hrt|ngig|rzt|ssen|lt|sung)\b|[a-zäöü][ÄÖÜ][a-z]|\bu über\b/g) || [];
  ok(brokenUmlaut.length === 0, 'Anleitung: keine kaputten Umlaute mehr' + (brokenUmlaut.length ? ': ' + brokenUmlaut.slice(0, 5).join(', ') : ''));

  /* ---------- App: Grundfunktionen ---------- */
  await page.goto(base + '/app.html');
  await page.waitForSelector('#logBody');
  await wipe();
  ok((await page.textContent('#logBody')).includes('Noch keine Einträge'), 'App: leerer Zustand');
  await page.setInputFiles('#importFile', path.join(ROOT, 'data/autopot-grow-backup.json'));
  await page.waitForTimeout(400);
  ok((await rowsCount()) === 2, 'App: 2 importierte Einträge');
  ok((await page.inputValue('#sName')) === 'FATBASTARD', 'App: Grow-Name übernommen');
  ok((await page.textContent('#kLast')).includes('03.10.2026'), 'App: letzter Eintrag nach Datum');
  ok((await page.textContent('#findings')).includes('Tank-EC'), 'App: EC-Auffälligkeit für Vegetation');

  /* Eintrag mit pH 6,0 → "6,0" (nicht "6") */
  await page.fill('#fEc', '1.3'); await page.fill('#fPh', '6.0'); await page.fill('#fAir', '26'); await page.fill('#fRh', '60');
  await page.fill('#fNote', '<img src=x onerror=window.__xss=1>'); await page.fill('#fTags', '<b>x</b>');
  await page.click('#saveEntry');
  await page.waitForTimeout(150);
  ok((await rowsCount()) === 3, 'App: Eintrag gespeichert');
  ok((await page.textContent('#kPh')) === '6,0', 'App: pH-Kachel zeigt „6,0“');
  ok(!(await page.evaluate(() => window.__xss)) && (await page.locator('#logBody img[src="x"]').count()) === 0, 'App: HTML in Notiz wird escaped (kein XSS)');
  await page.locator('[data-act="edit"]').first().click();
  await page.fill('#fEc', '1.4');
  await page.click('#saveEntry');
  await page.waitForTimeout(150);
  ok((await page.locator('#logBody tr').first().textContent()).includes('1,4'), 'App: Bearbeiten funktioniert');

  /* ---------- Fotos in IndexedDB ---------- */
  await page.fill('#fEc', '1.5'); await page.fill('#fNote', 'mit Foto');
  await page.setInputFiles('#fPhoto', pngPath);
  await page.waitForSelector('#photoPreview:not(.hidden)');
  await page.click('#saveEntry');
  await page.waitForTimeout(300);
  ok((await page.locator('#logBody img.thumb').count()) === 1, 'Foto: Vorschau in der Tabelle');
  const lsHasImage = await page.evaluate(() => Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('data:image')));
  ok(!lsHasImage, 'Foto: keine Bilddaten in localStorage');
  const idbCount = () => page.evaluate(() => new Promise(r => { const q = indexedDB.open('autopot-app'); q.onsuccess = () => { const c = q.result.transaction('photos').objectStore('photos').count(); c.onsuccess = () => r(c.result); }; q.onerror = () => r(-1); }));
  ok((await idbCount()) === 1, 'Foto: liegt in IndexedDB');
  await page.reload(); await page.waitForSelector('#logBody img.thumb');
  ok((await page.locator('#logBody img.thumb').count()) === 1, 'Foto: überlebt Neuladen');

  /* Backup mit Foto → alles löschen → Import stellt Foto wieder her */
  const bkPath = await download(() => page.click('#backupJson'));
  const bj = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  ok(bj.version === 3 && bj.entries.length === 4 && bj.entries.some(e => /^data:image\//.test(e.photo)), 'Backup: Schema v3, enthält das Foto');
  await wipe();
  ok((await rowsCount()) === 1 && (await page.textContent('#logBody')).includes('Noch keine'), 'Foto: Speicher komplett geleert');
  await page.setInputFiles('#importFile', bkPath);
  await page.waitForTimeout(500);
  ok((await rowsCount()) === 4 && (await page.locator('#logBody img.thumb').count()) === 1, 'Backup-Import: Einträge und Foto zurück');
  ok((await idbCount()) === 1, 'Backup-Import: Foto wieder in IndexedDB');
  ok(await page.locator('#restorePrev').isVisible(), 'Import: „Rückgängig“-Knopf sichtbar');
  await page.click('#restorePrev');
  await page.waitForTimeout(300);
  ok((await rowsCount()) === 1, 'Import rückgängig: alter (leerer) Stand zurück');
  await page.setInputFiles('#importFile', bkPath);
  await page.waitForTimeout(400);
  /* Löschen entfernt auch das Foto */
  await page.locator('[data-act="del-entry"]').first().click();
  await page.waitForTimeout(300);
  ok((await rowsCount()) === 3, 'Löschen: Eintrag entfernt');
  ok((await idbCount()) === 0, 'Löschen: Foto aus IndexedDB entfernt');

  /* ---------- Diagramme ---------- */
  const px = await page.evaluate(() => { const c = document.getElementById('cEc'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  ok(px > 500, 'Diagramm: EC gezeichnet');
  await page.locator('#cEc').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800); /* Smooth-Scrolling abwarten, sonst blendet der Scroll-Handler den Tooltip aus */
  const box = await page.locator('#cEc').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(100);
  const tipText = await page.textContent('#tip');
  ok(await page.locator('#tip').isVisible() && /\d{2}\.\d{2}\.\d{4} · /.test(tipText), 'Diagramm: Tooltip zeigt Datum und Wert (' + tipText + ')');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(100);
  ok(!(await page.locator('#tip').isVisible()), 'Diagramm: Tooltip verschwindet');

  /* ---------- CSV ---------- */
  const csvPath = await download(() => page.click('#exportCsv'));
  const csv = fs.readFileSync(csvPath, 'utf8');
  ok(csv.startsWith('﻿"Datum";"Phase"') && csv.includes('\r\n') && csv.includes('"2026-10-02";"Vegetation";"0,7"'), 'CSV: BOM, Header, CRLF, Dezimalkomma');
  await page.setInputFiles('#importFile', csvPath);
  await page.waitForTimeout(300);
  ok((await rowsCount()) === 3, 'CSV: Re-Import ohne Duplikate');

  /* ---------- Backup-Hinweis ---------- */
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('autopot-app-v3')); s.settings.lastBackup = new Date().toISOString(); s.settings.entriesSinceBackup = 10; localStorage.setItem('autopot-app-v3', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('#logBody');
  ok((await page.textContent('#findings')).includes('Seit dem letzten Backup'), 'Backup-Hinweis nach 10 Einträgen');
  await download(() => page.click('#findings [data-act="backup"]'));
  ok(!(await page.textContent('#findings')).includes('Seit dem letzten Backup'), 'Backup-Hinweis verschwindet nach Sicherung');

  /* ---------- Erinnerungen & Kalenderexport ---------- */
  await page.click('#tplMeasure');
  await page.fill('#mTitle', 'Ein sehr langer Titel, mit Komma; Semikolon und Umlauten äöü damit die Zeile gefaltet werden muss');
  await page.selectOption('#mRepeat', 'weekly');
  await page.click('#saveRem');
  ok((await page.locator('#remBody tr').count()) === 2, 'Erinnerung: zwei angelegt');
  ok(/Fällig|Überfällig|Bald fällig/.test(await page.textContent('#remBody')), 'Erinnerung: Status berechnet');
  await page.locator('[data-act="rem-done"]').first().click();
  ok((await page.textContent('#remBody')).includes('Erledigt'), 'Erinnerung: erledigt');
  const icsPath = await download(() => page.click('#exportIcs'));
  const ics = fs.readFileSync(icsPath, 'utf8');
  ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && (ics.match(/BEGIN:VEVENT/g) || []).length === 2 && ics.includes('RRULE:FREQ=DAILY') && ics.includes('RRULE:FREQ=WEEKLY'), 'ICS: gültige Struktur, 2 Termine, RRULE täglich/wöchentlich');
  ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'ICS: alle Zeilen ≤ 75 Byte (gefaltet)');
  ok(ics.includes('\\,') && ics.includes('\\;'), 'ICS: Komma und Semikolon maskiert');

  /* ---------- Altformat-Migration ---------- */
  const oldPath = path.join(TMP, 'old.json');
  fs.writeFileSync(oldPath, JSON.stringify({ entries: [{ date: '2026-09-20', phase: 'Frühe Blüte', ec: 1.7, ph: 6, temp: 25, rh: 55, water: 20 }], settings: { growName: 'Alt', phase: 'Endphase' } }));
  await page.setInputFiles('#importFile', oldPath);
  await page.waitForTimeout(400);
  const t = await page.locator('#logBody tr').first().textContent();
  ok(t.includes('Übergang / frühe Blüte') && t.includes('25') && t.includes('55'), 'Migration: temp/rh/water und Phase');
  ok((await page.textContent('#phaseHint')).includes('Endphase'), 'Endphase: Hinweis im Dashboard');
  const badPath = path.join(TMP, 'bad.json'); fs.writeFileSync(badPath, '{"foo":1}');
  const before = await rowsCount();
  await page.setInputFiles('#importFile', badPath);
  await page.waitForTimeout(300);
  ok((await rowsCount()) === before, 'Import: fremdes JSON ändert nichts');

  /* ---------- Rechner, Diagnose, Checklisten ---------- */
  await page.fill('#vTemp', '25'); await page.fill('#vRh', '60');
  ok((await page.textContent('#vOut')).includes('1,27'), 'Rechner: VPD(25 °C, 60 %) = 1,27 kPa');
  await page.check('#symptoms input[value="tips"]');
  await page.click('#diagBtn');
  ok((await page.textContent('#diagOut')).includes('Salzaufbau'), 'Diagnose liefert Ursache');
  await page.check('#setupList input[data-i="0"]');
  ok((await page.textContent('#kChecks')).includes('%'), 'Checkliste → KPI');

  /* ---------- PWA: Manifest, Service Worker, Offline ---------- */
  const man = await page.evaluate(async () => { const r = await fetch(document.querySelector('link[rel=manifest]').href); return { ok: r.ok, j: await r.json() }; });
  ok(man.ok && man.j.display === 'standalone' && man.j.icons.length >= 2, 'PWA: Manifest erreichbar und gültig');
  const iconOk = await page.evaluate(async () => (await fetch('icons/icon-512.png')).ok);
  ok(iconOk, 'PWA: Icon erreichbar');
  const swActive = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  ok(swActive, 'PWA: Service Worker aktiv');
  await page.reload(); await page.waitForSelector('#logBody');
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#logBody');
  ok((await page.title()) === 'AutoPot Grow-App' && (await page.textContent('#logBody')).includes('20.09.2026'), 'PWA: App lädt offline, Daten vorhanden');
  await page.goto(base + '/anleitung.html');
  ok((await page.locator('h2[id^="k"]').count()) === 20, 'PWA: Anleitung lädt offline');
  await ctx.setOffline(false);

  /* ---------- Mobil & Direktstart ohne Server ---------- */
  await page.goto(base + '/app.html'); await page.waitForSelector('#logBody');
  await page.setViewportSize({ width: 380, height: 800 });
  await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), 'Mobil: kein horizontaler Seitenüberlauf');
  await page.setViewportSize({ width: 1200, height: 900 });
  const filePage = await ctx.newPage();
  const fileErrors = [];
  filePage.on('pageerror', e => fileErrors.push(e.message));
  await filePage.goto('file://' + path.join(ROOT, 'app.html'));
  await filePage.waitForSelector('#logBody');
  ok(fileErrors.length === 0, 'file://: App startet ohne Server fehlerfrei');

  ok(errors.length === 0, 'Keine JS-/Konsolenfehler' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('TESTFEHLER', e); process.exit(2); });
