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
const TYPES = { '.css': 'text/css', '.jpg': 'image/jpeg', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.csv': 'text/csv' };

function serve() {
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; } /* statisches Hosting ohne Server: Cloud bleibt aus */
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
  page.on('pageerror', e => { errors.push('pageerror: ' + e.message); if (process.env.DEBUG_TEST) console.log('PAGEERROR', e.message); });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  const toastText = () => page.textContent('#toast');

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
  const viaData = sel => download(async () => { await page.click('#dataBtn'); await page.click(sel); });
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
  const bkPath = await viaData('#backupJson');
  const bj = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  ok(bj.version === 6 && bj.deleted && bj.harvest && Array.isArray(bj.archive) && bj.entries.length === 4 && bj.entries.some(e => /^data:image\//.test(e.photo)), 'Backup: Schema v6 (mit Löschmarkern), enthält das Foto');
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
  const csvPath = await viaData('#exportCsv');
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


  /* ---------- Neue Funktionen (v4) ---------- */
  await page.goto(base + '/app.html'); await page.waitForSelector('#logBody');
  await wipe();
  const isoDay = off => page.evaluate(o => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }, off);
  ok((await page.textContent('#heroDay')).includes('Noch kein Start'), 'v4: Hero ohne Startdatum');
  await page.fill('#sStart', await isoDay(-10));
  ok(/Tag 11 · Woche 2/.test(await page.textContent('#heroDay')), 'v4: Tag-/Wochenzähler (' + (await page.textContent('#heroDay')) + ')');
  await page.selectOption('#sPhase', 'Hauptblüte');
  ok((await page.textContent('#eventList')).includes('Phase: Hauptblüte') && /Blüte/.test(await page.textContent('#phaseSteps li.now')), 'v4: Phasenwechsel erzeugt Timeline-Ereignis und Stepper');
  await page.fill('#fEc', '2.0'); await page.fill('#fPh', '6.0'); await page.fill('#fAir', '24'); await page.fill('#fRh', '50'); await page.fill('#fHeight', '12.5');
  await page.click('[data-tag="Gedüngt"]');
  ok((await page.inputValue('#fTags')).includes('Gedüngt'), 'v4: Schnell-Tag wird eingetragen');
  await page.setInputFiles('#fPhoto', pngPath);
  await page.waitForSelector('#photoPreview:not(.hidden)');
  await page.click('#saveEntry'); await page.waitForTimeout(300);
  ok((await page.textContent('#scoreVal')) === '100', 'v4: Grow-Score 100 bei Werten im Ziel');
  ok((await page.textContent('#streakVal')).includes('1 Tag'), 'v4: Messserie');
  await page.fill('#fDate', await isoDay(-1)); await page.fill('#fNote', 'Wurzeln prüfen'); await page.fill('#fEc', '2.1');
  await page.click('#saveEntry'); await page.waitForTimeout(200);
  ok((await rowsCount()) === 2 && (await page.textContent('#streakVal')).includes('2 Tage'), 'v4: zweiter Eintrag, Serie 2 Tage');
  await page.fill('#lSearch', 'wurzeln');
  ok((await rowsCount()) === 1 && (await page.textContent('#logCount')).includes('1 von 2'), 'v4: Protokoll-Suche filtert');
  await page.fill('#lSearch', '');
  await page.check('#lPhoto');
  ok((await rowsCount()) === 1 && (await page.locator('#logBody img.thumb').count()) === 1, 'v4: Filter „nur mit Foto“');
  await page.uncheck('#lPhoto');
  ok((await page.locator('#galleryGrid .gthumb').count()) === 1, 'v4: Galerie zeigt das Foto');
  await page.click('#galleryGrid .gthumb');
  ok(await page.evaluate(() => document.getElementById('lightbox').open), 'v4: Lightbox öffnet');
  await page.keyboard.press('Escape');
  ok(!(await page.evaluate(() => document.getElementById('lightbox').open)), 'v4: Lightbox schließt per Escape');
  await page.click('#rangeSeg [data-range="7"]');
  ok((await page.getAttribute('#rangeSeg [data-range="7"]', 'aria-pressed')) === 'true' && (await page.evaluate(() => localStorage.getItem('autopot-range'))) === '7', 'v4: Diagramm-Zeitraum gewählt und gespeichert');
  ok((await page.textContent('#cHeight ~ *, #charts')).includes('12,5'), 'v4: Höhe erscheint im Diagrammbereich');
  ok((await page.locator('#vpdMap td').count()) === 77 && (await page.locator('#vpdMap td.now').count()) === 1, 'v4: VPD-Heatmap mit Markierung des letzten Eintrags');
  ok((await page.textContent('#dOut')).includes('38,9'), 'v4: DLI (600 µmol, 18 h = 38,9)');
  await page.selectOption('#ppScale', '700');
  ok((await page.inputValue('#ppPpm')) === '1120', 'v4: EC→PPM (1,6 × 700)');
  await page.fill('#ppPpm', '1400');
  ok((await page.inputValue('#ppEc')) === '2', 'v4: PPM→EC');
  await page.fill('#sTankRest', '5');
  await page.click('#tankChange');
  ok((await page.inputValue('#sTankRest')) === (await page.inputValue('#sTankSize')) && (await page.textContent('#eventList')).includes('Tank gewechselt') && (await page.textContent('#tankInfo')).includes('heute'), 'v4: „Tank gewechselt“ füllt den Tank und notiert das Ereignis');
  await page.fill('#hDate', await isoDay(0)); await page.fill('#hWet', '100'); await page.fill('#hDry', '25'); await page.fill('#hWatt', '100');
  const hout = await page.textContent('#hOut');
  ok(hout.includes('75 %') && hout.includes('0,25 g/W'), 'v4: Ernte-Auswertung (' + hout.replace(/\s+/g, ' ').slice(0, 90) + ')');
  const csv2 = fs.readFileSync(await viaData('#exportCsv'), 'utf8');
  ok(csv2.split('\r\n')[0].endsWith('"Höhe"') && csv2.includes('"12,5"'), 'v4: CSV enthält Spalte Höhe');
  await page.click('#dataBtn');
  ok(await page.evaluate(() => document.getElementById('dataDlg').open), 'v4: Daten-Dialog öffnet');
  await page.keyboard.press('Escape');
  ok(!(await page.evaluate(() => document.getElementById('dataDlg').open)), 'v4: Daten-Dialog schließt per Escape');
  /* Grow abschließen */
  await viaNewGrow();
  async function viaNewGrow() {
    await download(() => page.click('#newGrow'));
    await page.waitForTimeout(300);
  }
  ok((await page.locator('[data-act="del-archive"]').count()) === 1 && (await rowsCount()) === 1 && (await page.textContent('#heroDay')).includes('Noch kein Start'), 'v4: Grow archiviert, Protokoll leer');
  ok((await page.textContent('#archiveList')).includes('25 g trocken'), 'v4: Archiv zeigt Ertrag');
  ok(await page.locator('#restorePrev').isVisible(), 'v4: Rückgängig nach „Grow abschließen“ möglich');
  await page.click('#restorePrev'); await page.waitForTimeout(400);
  ok((await rowsCount()) === 2 && (await page.locator('[data-act="del-archive"]').count()) === 0 && (await page.locator('#logBody img.thumb').count()) === 1, 'v4: Wiederherstellung bringt Einträge und Foto zurück');
  /* Mobile Navigation */
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  ok((await page.locator('.bottomnav').isVisible()) && (await page.locator('#fab').isVisible()) && !(await page.locator('nav.tabs').isVisible()), 'v4: Mobil zeigt Bottom-Navigation und Plus-Button');
  await page.click('#moreBtn');
  ok(await page.evaluate(() => document.getElementById('moreSheet').open), 'v4: „Mehr“-Sheet öffnet');
  await page.click('#moreSheet a[href="#harvest"]');
  ok(!(await page.evaluate(() => document.getElementById('moreSheet').open)), 'v4: Sheet schließt nach Auswahl');
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), 'v4: Mobil ohne horizontalen Überlauf (mit Daten)');
  await page.setViewportSize({ width: 1200, height: 900 });


  /* ---------- v6: Wissen, Wochenbericht, Rückgängig, Ernteprognose, Strom, verschlüsseltes Backup ---------- */
  await page.goto(base + '/app.html'); await page.waitForSelector('#logBody');
  await wipe();
  ok((await page.textContent('#tipBox')).includes('Tipp für die Phase'), 'v6: Tipp des Tages');
  ok((await page.locator('#refTable tbody tr').count()) === 5 && (await page.locator('#refTable tr.now').count()) === 1, 'v6: Richtwerte-Tabelle mit hervorgehobener Phase');
  ok((await page.locator('#nutriList .card').count()) === 10, 'v6: Nährstoff-Lexikon mit 10 Nährstoffen');
  await page.fill('#nutriSearch', 'spitzen');
  const nHits = await page.locator('#nutriList .card').count();
  ok(nHits >= 1 && nHits < 10, 'v6: Lexikon-Suche filtert (' + nHits + ' Treffer)');
  await page.fill('#nutriSearch', '');
  ok((await page.locator('#glossar dt').count()) >= 12, 'v6: Glossar');
  const iso6 = off => page.evaluate(o => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }, off);
  await page.fill('#fDate', await iso6(-8)); await page.fill('#fEc', '1.2'); await page.fill('#fPh', '6.0'); await page.fill('#fAir', '25'); await page.fill('#fRh', '60'); await page.fill('#fHeight', '10'); await page.fill('#fNote', 'Geheime-Notiz-77');
  await page.click('#saveEntry'); await page.waitForTimeout(150);
  await page.fill('#fDate', await iso6(0)); await page.fill('#fEc', '-1'); await page.click('#saveEntry');
  ok((await toastText()).includes('nicht negativ') && (await rowsCount()) === 1, 'v8: negative Messwerte werden abgelehnt');
  await page.fill('#fEc', '1500'); await page.click('#saveEntry');
  ok((await toastText()).includes('Einheit prüfen') && (await rowsCount()) === 1, 'v8: EC in falscher Einheit (µS) wird erkannt');
  await page.fill('#fEc', '');
  await page.click('#fillLast');
  ok((await page.inputValue('#fEc')) === '1.2' && (await page.inputValue('#fHeight')) === '10' && (await page.inputValue('#fNote')) === '', 'v6: „Letzte Werte übernehmen“ füllt Messwerte, nicht die Notiz');
  await page.fill('#fEc', '1.4'); await page.fill('#fHeight', '15');
  await page.click('#saveEntry'); await page.waitForTimeout(150);
  const wk = (await page.textContent('#weekly')).replace(/\s+/g, ' ');
  ok(wk.includes('Zuwachs 5 cm') && wk.includes('▲ 0,2'), 'v6: Wochenbericht mit Trend und Zuwachs (' + wk.slice(0, 120) + ')');
  await page.locator('[data-act="del-entry"]').first().click();
  ok((await rowsCount()) === 1 && (await toastText()).includes('gelöscht'), 'v6: Eintrag gelöscht, Hinweis mit Rückgängig');
  await page.click('#toast .toast-act');
  await page.waitForTimeout(200);
  ok((await rowsCount()) === 2, 'v6: Löschen rückgängig gemacht');
  await page.selectOption('#sPhase', 'Übergang / frühe Blüte');
  ok((await page.inputValue('#sFlowerStart')) === await iso6(0) && (await page.inputValue('#sLight')) === '12', 'v6: Blütebeginn und 12 h Licht automatisch gesetzt');
  ok((await page.textContent('#heroFlower')).includes('Blütewoche 1 von 9'), 'v6: Ernteprognose im Übersichtsbereich');
  await page.fill('#sFlowerWeeks', '8');
  ok((await page.textContent('#heroFlower')).includes('von 8') && (await page.textContent('#heroFlower')).includes('noch 56 Tage'), 'v6: Erntetermin aus Blütedauer (' + (await page.textContent('#heroFlower')) + ')');
  await page.fill('#pwWatt', '200'); await page.fill('#pwHours', '12'); await page.fill('#pwExtra', '0'); await page.fill('#pwPrice', '0.40');
  const pw = (await page.textContent('#pwOut')).replace(/\s+/g, ' ');
  ok(pw.includes('2,4 kWh') && pw.includes('0,96'), 'v6: Stromkosten 200 W × 12 h × 0,40 € (' + pw.slice(0, 60) + ')');
  await page.click('#dataBtn'); await page.check('#bkEncrypt');
  await page.fill('#bkPw', 'kurz'); await page.fill('#bkPw2', 'kurz'); await page.click('#backupJson');
  ok((await toastText()).includes('mindestens 8'), 'v6: zu kurzes Backup-Passwort abgelehnt');
  await page.fill('#bkPw', 'Backup-Geheim-1'); await page.fill('#bkPw2', 'Backup-Geheim-1');
  const encPath = await download(() => page.click('#backupJson'));
  const encTxt = fs.readFileSync(encPath, 'utf8'), enc = JSON.parse(encTxt);
  ok(enc.format === 'autopot-encrypted-backup' && enc.cipher === 'AES-256-GCM' && enc.iterations >= 600000 && !encTxt.includes('Geheime-Notiz-77'), 'v6: verschlüsseltes Backup ohne Klartext');
  await wipe();
  await page.setInputFiles('#importFile', encPath);
  await page.waitForSelector('#pwAsk[open]');
  await page.fill('#pwAskInput', 'falsches-pw'); await page.click('#pwAskOk');
  await page.waitForTimeout(1500);
  ok((await toastText()).includes('Falsches Passwort') && (await rowsCount()) === 1, 'v6: falsches Backup-Passwort wird erkannt');
  await page.setInputFiles('#importFile', encPath);
  await page.waitForSelector('#pwAsk[open]');
  await page.fill('#pwAskInput', 'Backup-Geheim-1'); await page.click('#pwAskOk');
  ok(await (async () => { for (let i = 0; i < 40; i++) { if ((await rowsCount()) === 2) return true; await page.waitForTimeout(150); } return false; })() && (await page.textContent('#logBody')).includes('Geheime-Notiz-77'), 'v6: verschlüsseltes Backup wiederhergestellt');

  /* ---------- Mobil & Direktstart ohne Server ---------- */
  await page.goto(base + '/app.html'); await page.waitForSelector('#logBody');
  await page.setViewportSize({ width: 375, height: 740 });
  await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)), 'Mobil: kein horizontaler Seitenüberlauf');
  await page.setViewportSize({ width: 320, height: 640 });
  for (const pg of ['/app.html', '/', '/anleitung.html', '/datenschutz.html', '/impressum.html', '/nutzungsbedingungen.html']) {
    await page.goto(base + pg); await page.waitForTimeout(250);
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'Kleinstes Handy (320 px): kein Überlauf auf ' + pg);
  }
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
