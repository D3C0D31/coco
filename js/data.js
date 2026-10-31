/* AutoPot Grow – Eingabeformular, Export/Import, Einstellungen, Theme, Dialoge und Navigation.
   Teil 6/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
'use strict';

/* ---------- Formular ---------- */
const FORM_IDS = ['fEc', 'fPh', 'fWater', 'fAir', 'fRh', 'fPpfd', 'fUse', 'fHeight', 'fTags', 'fNote'];
function setPhoto(data, dirty) {
  pendingPhoto = data || ''; photoDirty = !!dirty;
  const img = $('photoPreview');
  if (pendingPhoto) { img.src = pendingPhoto; img.classList.remove('hidden'); $('photoRemove').classList.remove('hidden'); }
  else { img.removeAttribute('src'); img.classList.add('hidden'); $('photoRemove').classList.add('hidden'); }
  $('fPhoto').value = '';
}
function resetForm(keepDate) {
  FORM_IDS.forEach(id => { $(id).value = ''; });
  if (!keepDate) $('fDate').value = todayStr();
  $('fPhase').value = S.settings.phase;
  setPhoto('', false);
  editingId = null;
  $('formTitle').textContent = 'Neuer Eintrag';
  $('saveEntry').textContent = 'Eintrag speichern';
  $('cancelEdit').classList.add('hidden');
}
function startEdit(id) {
  const e = S.entries.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  $('fDate').value = e.date;
  $('fPhase').value = PHASES.includes(e.phase) ? e.phase : S.settings.phase;
  const set = (el, v) => { $(el).value = v ?? ''; };
  set('fEc', e.ec); set('fPh', e.ph); set('fWater', e.waterTemp); set('fAir', e.airTemp); set('fRh', e.humidity); set('fPpfd', e.ppfd); set('fUse', e.use); set('fHeight', e.height); set('fTags', e.tags); set('fNote', e.note);
  setPhoto(photoCache.get(id) || '', false);
  $('formTitle').textContent = 'Eintrag bearbeiten';
  $('saveEntry').textContent = 'Änderung speichern';
  $('cancelEdit').classList.remove('hidden');
  $('formTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function saveEntry() {
  const date = $('fDate').value;
  if (!date) { toast('Bitte ein Datum angeben.', true); return; }
  const raw = { ec: $('fEc').value, ph: $('fPh').value, waterTemp: $('fWater').value, airTemp: $('fAir').value, humidity: $('fRh').value, ppfd: $('fPpfd').value, use: $('fUse').value, height: $('fHeight').value };
  const e = normEntry(Object.assign({ id: editingId || uid(), date, phase: $('fPhase').value, tags: $('fTags').value.trim(), note: $('fNote').value.trim() }, raw));
  if (!e) { toast('Ungültiges Datum.', true); return; }
  if (e.ph != null && (e.ph < 0 || e.ph > 14)) { toast('pH muss zwischen 0 und 14 liegen.', true); return; }
  const neg = [['EC', e.ec], ['PPFD', e.ppfd], ['Verbrauch', e.use], ['Höhe', e.height]].find(([, v]) => v != null && v < 0);
  if (neg) { toast(`${neg[0]} darf nicht negativ sein.`, true); return; }
  if (e.ec != null && e.ec > 10) { toast('EC über 10 ist unrealistisch – bitte Einheit prüfen (mS/cm, nicht µS oder PPM).', true); return; }
  if ([e.airTemp, e.waterTemp].some(v => v != null && (v < -10 || v > 60))) { toast('Temperatur bitte in °C zwischen −10 und 60 angeben.', true); return; }
  if (e.humidity != null && (e.humidity < 0 || e.humidity > 100)) { toast('Luftfeuchte muss zwischen 0 und 100 % liegen.', true); return; }
  if ([e.ec, e.ph, e.waterTemp, e.airTemp, e.humidity, e.ppfd, e.use, e.height].every(v => v == null) && !e.note && !pendingPhoto) { toast('Bitte mindestens einen Messwert, eine Notiz oder ein Foto eintragen.', true); return; }
  const prior = S.entries.find(x => x.id === e.id);
  let hasPhoto = photoCache.has(e.id) || !!(prior && prior.hasPhoto);
  if (photoDirty) {
    try {
      if (pendingPhoto) { await idbRun('readwrite', s => s.put(pendingPhoto, e.id)); photoCache.set(e.id, pendingPhoto); hasPhoto = true; }
      else { if (idb) await idbRun('readwrite', s => s.delete(e.id)); photoCache.delete(e.id); hasPhoto = false; }
    } catch (err) { toast('Das Foto konnte nicht gespeichert werden (Speicher voll?). Der Eintrag wird ohne die Foto-Änderung gespeichert.', true); }
  }
  e.hasPhoto = hasPhoto;
  const before = JSON.stringify(S);
  const wasEdit = !!editingId;
  if (wasEdit) { const i = S.entries.findIndex(x => x.id === editingId); if (i >= 0) S.entries[i] = e; else S.entries.push(e); }
  else { S.entries.push(e); S.settings.entriesSinceBackup = (S.settings.entriesSinceBackup || 0) + 1; }
  if (!save()) { S = JSON.parse(before); return; }
  resetForm(true);
  renderAll();
  toast(wasEdit ? 'Änderung gespeichert.' : 'Eintrag gespeichert.');
}
function resizeImage(file, max = 800, q = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}

/* ---------- Export / Import ---------- */
function download(name, text, type) {
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const CSV_HEAD = ['Datum', 'Phase', 'EC', 'pH', 'Wassertemperatur', 'Lufttemperatur', 'Luftfeuchte', 'VPD', 'PPFD', 'Verbrauch', 'Notiz', 'Tags', 'Höhe'];
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+@\t\r]/.test(s) || /^-[^\d.,]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportCsv() {
  const n = (v, d) => v == null ? '' : String(Number(v.toFixed(d))).replace('.', ',');
  const rows = sorted().map(e => [e.date, e.phase, n(e.ec, 2), n(e.ph, 2), n(e.waterTemp, 1), n(e.airTemp, 1), n(e.humidity, 0), n(vpdOf(e), 2), n(e.ppfd, 0), n(e.use, 1), e.note, e.tags, n(e.height, 1)]);
  download('autopot-grow-log.csv', '\ufeff' + [CSV_HEAD, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
  toast('CSV exportiert.');
}
async function exportJson(password) {
  const stamp = new Date().toISOString();
  const data = Object.assign({ exportedAt: stamp }, S, { settings: Object.assign({}, S.settings, { lastBackup: stamp, entriesSinceBackup: 0 }), entries: S.entries.map(e => Object.assign({}, e, { photo: photoCache.get(e.id) || '' })) });
  let text = JSON.stringify(data, null, 2), name = 'autopot-grow-backup.json';
  if (password) {
    try { text = await encryptText(text, password); name = 'autopot-grow-backup.verschluesselt.json'; }
    catch (e) { toast('Verschlüsseln ist in diesem Browser nicht möglich (nur über https oder lokal).', true); return false; }
  }
  download(name, text, 'application/json');
  S.settings.lastBackup = stamp; S.settings.entriesSinceBackup = 0;
  save(); renderDashboard();
  toast(password ? 'Verschlüsseltes Backup exportiert (inklusive Fotos).' : 'Backup exportiert (inklusive Fotos).');
  return true;
}
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delim = first.split(';').length >= first.split(',').length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(c => c !== '')) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(c => c !== '')) rows.push(row);
  return rows;
}
const CSV_MAP = { datum: 'date', phase: 'phase', ec: 'ec', ph: 'ph', wassertemperatur: 'waterTemp', lufttemperatur: 'airTemp', luftfeuchte: 'humidity', ppfd: 'ppfd', verbrauch: 'use', notiz: 'note', tags: 'tags', höhe: 'height', hoehe: 'height' };
function csvToEntries(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const cols = rows[0].map(h => CSV_MAP[h.toLowerCase().replace(/[^a-zäöü]/g, '')] || null);
  return rows.slice(1).map(r => {
    const o = {};
    cols.forEach((k, i) => { if (k) o[k] = String(r[i] ?? '').replace(/^'(?=[=+@\-])/, ''); });
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(o.date || '');
    if (m) o.date = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    return normEntry(o);
  }).filter(Boolean);
}
function importFile(file) {
  const r = new FileReader();
  r.onerror = () => toast('Datei konnte nicht gelesen werden.', true);
  r.onload = async () => {
    const text = String(r.result);
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
      const list = csvToEntries(text);
      if (!list.length) { toast('Keine gültigen Zeilen in der CSV gefunden.', true); return; }
      const added = mergeEntries(S.entries, list);
      S.settings.entriesSinceBackup = (S.settings.entriesSinceBackup || 0) + added;
      if (save()) { renderAll(); toast(`${added} Einträge importiert (${list.length - added} Duplikate übersprungen).`); }
      return;
    }
    let data;
    try { data = JSON.parse(text); } catch (e) { toast('Ungültige JSON-Datei.', true); return; }
    if (data && data.format === ENC_FORMAT) {
      const pw = await askPassword('Verschlüsseltes Backup öffnen', 'Gib das Passwort ein, mit dem das Backup gesichert wurde.');
      if (!pw) return;
      try { data = JSON.parse(await decryptText(data, pw)); }
      catch (e) { toast('Falsches Passwort oder beschädigte Datei.', true); return; }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !(Array.isArray(data.entries) || data.settings)) { toast('Die Datei ist kein Grow-Backup.', true); return; }
    const n = normalize(data);
    if (!confirm(`Backup mit ${n.entries.length} Einträgen laden?\nDie aktuellen Daten (${S.entries.length} Einträge) werden ersetzt. Über „Letzten Import rückgängig machen“ kannst du den alten Stand zurückholen.`)) return;
    try { localStorage.setItem(KEY + '-prev', ser(S)); } catch (e) { /* ignore */ }
    S = n;
    await adoptPhotos(S.entries);
    if (save()) { loadSettings(); resetForm(); renderAll(); toast('Backup geladen.'); }
  };
  r.readAsText(file);
}
async function restorePrev() {
  let raw = null;
  try { raw = localStorage.getItem(KEY + '-prev'); } catch (e) { /* ignore */ }
  if (!raw) return;
  if (!confirm('Den Stand vor dem letzten Import wiederherstellen? Der aktuelle Stand wird dabei ersetzt (und bleibt seinerseits als „vorheriger Stand“ erhalten).')) return;
  let prev;
  try { prev = normalize(JSON.parse(raw)); } catch (e) { toast('Der gesicherte Stand ist nicht lesbar.', true); return; }
  try { localStorage.setItem(KEY + '-prev', ser(S)); } catch (e) { /* ignore */ }
  S = prev;
  await adoptPhotos(S.entries);
  if (save()) { loadSettings(); resetForm(); renderAll(); toast('Vorheriger Stand wiederhergestellt.'); }
}

/* ---------- Einstellungen / Theme ---------- */
function loadSettings() {
  const s = S.settings;
  $('sName').value = s.name; $('sPhase').value = s.phase; $('sStart').value = s.startDate || '';
  $('sTankSize').value = s.tankSize; $('sTankRest').value = s.tankRest; $('sDailyUse').value = s.dailyUse; $('sInterval').value = s.tankInterval;
  $('sLight').value = s.lightHours; $('sFlowerWeeks').value = s.flowerWeeks; $('sFlowerStart').value = s.flowerStart || '';
  if (!$('pwHours').dataset.touched) $('pwHours').value = s.lightHours;
  const h = S.harvest;
  $('hDate').value = h.date || ''; $('hWet').value = h.wet ?? ''; $('hDry').value = h.dry ?? ''; $('hWatt').value = h.watt ?? ''; $('hNote').value = h.note || '';
}
function onSettings() {
  const s = S.settings, old = s.phase;
  s.name = $('sName').value.slice(0, 60); s.phase = $('sPhase').value;
  s.startDate = /^\d{4}-\d{2}-\d{2}$/.test($('sStart').value) ? $('sStart').value : null;
  s.tankSize = num($('sTankSize').value) ?? s.tankSize; s.tankRest = num($('sTankRest').value) ?? s.tankRest; s.dailyUse = num($('sDailyUse').value) ?? s.dailyUse;
  const iv = num($('sInterval').value); if (iv != null && iv >= 1) s.tankInterval = Math.round(iv);
  const lh = num($('sLight').value); if (lh != null && lh > 0 && lh <= 24) s.lightHours = lh;
  const fw = num($('sFlowerWeeks').value); if (fw != null && fw >= 4 && fw <= 20) s.flowerWeeks = Math.round(fw);
  s.flowerStart = /^\d{4}-\d{2}-\d{2}$/.test($('sFlowerStart').value) ? $('sFlowerStart').value : null;
  if (old !== s.phase) {
    s.phaseStart = todayStr();
    if (s.phase === 'Übergang / frühe Blüte' && !s.flowerStart) { s.flowerStart = todayStr(); $('sFlowerStart').value = s.flowerStart; s.lightHours = 12; $('sLight').value = 12; toast('Blütebeginn auf heute gesetzt, Lichtstunden auf 12 – beides im Bereich „Aktueller Grow“ änderbar.'); }
    S.events.push({ id: uid(), date: todayStr(), title: 'Phase: ' + s.phase, note: '' });
    renderLists();
  }
  save();
  if (!editingId) $('fPhase').value = s.phase;
  renderCharts(); renderCalc(); renderHarvest(); renderKnowledge(); renderPower(); renderPlan(); renderDashboard();
}
function onHarvest() {
  S.harvest = { date: /^\d{4}-\d{2}-\d{2}$/.test($('hDate').value) ? $('hDate').value : '', wet: num($('hWet').value), dry: num($('hDry').value), watt: num($('hWatt').value), note: $('hNote').value.slice(0, 300) };
  save(); renderHarvest();
}
function tankChange() {
  const s = S.settings;
  s.lastTankChange = todayStr(); s.tankRest = s.tankSize;
  S.events.push({ id: uid(), date: todayStr(), title: 'Tank gewechselt', note: `${nf(s.tankSize, 1)} L frisch angesetzt` });
  save(); loadSettings(); renderAll();
  toast('Tankwechsel notiert, Tank wieder voll.');
}
function newGrow() {
  if (!S.entries.length && !S.settings.startDate) { toast('Es gibt noch nichts abzuschließen.', true); return; }
  if (!confirm('Grow abschließen und neu starten?\n\nZuerst wird ein Backup heruntergeladen. Der Grow landet im Archiv, Protokoll, Timeline und Ernte werden geleert (Rezepte und Erinnerungen bleiben). Über „Letzten Import rückgängig machen“ kannst du den Stand zurückholen.')) return;
  exportJson();
  const es = sorted(), h = S.harvest;
  const avg = fn => { const v = es.map(fn).filter(z => z != null && Number.isFinite(z)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const start = S.settings.startDate || (es[0] && es[0].date) || null;
  const end = h.date || (es.length ? es[es.length - 1].date : todayStr());
  const item = { id: uid(), name: S.settings.name || 'Grow', start, end, entries: es.length, days: start ? Math.max(1, dayDiff(start, end) + 1) : null, wet: h.wet, dry: h.dry, watt: h.watt, avgEc: avg(e => e.ec), avgPh: avg(e => e.ph) };
  const keep = new Set();
  try {
    localStorage.setItem(KEY + '-prev', ser(S));
    (JSON.parse(localStorage.getItem(KEY + '-prev')).entries || []).forEach(e => { if (e.hasPhoto) keep.add(e.id); });
  } catch (e) { /* ignore */ }
  S.archive.unshift(item);
  markDeleted('entries', S.entries.map(e => e.id)); markDeleted('events', S.events.map(e => e.id));
  S.entries = []; S.events = []; S.harvest = blank().harvest; S.checks.week = {};
  Object.assign(S.settings, { strainId: null, startDate: null, phaseStart: null, flowerStart: null, lastTankChange: null, phase: PHASES[0], lightHours: 18, tankRest: S.settings.tankSize });
  [...photoCache.keys()].forEach(id => { if (!keep.has(id)) dropPhoto(id); });
  save(); loadSettings(); resetForm(); renderAll();
  toast('Grow archiviert. Neues Protokoll gestartet.');
  $('dashboard').scrollIntoView({ behavior: 'smooth' });
}
const THEMES = { system: '🌗 System', light: '☀️ Hell', dark: '🌙 Dunkel' };
const readTheme = () => { try { const t = localStorage.getItem('autopot-theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch (e) { return 'system'; } };
function applyTheme(p) {
  const root = document.documentElement;
  if (p === 'system') delete root.dataset.theme; else root.dataset.theme = p;
  $('themeToggle').textContent = THEMES[p];
  const dark = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#09100c' : '#eef4ef');
}

/* ---------- Dialoge, Lightbox, Navigation ---------- */
const openDlg = id => { const d = $(id); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } };
const closeDlg = id => { const d = $(id); if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } };
const lb = { list: [], i: 0 };
function showLb() {
  const id = lb.list[lb.i], e = S.entries.find(x => x.id === id);
  if (!e || !photoCache.has(id)) return;
  $('lbImg').src = photoCache.get(id);
  $('lbCap').textContent = `${fmtDate(e.date)} · ${e.phase || '–'}${e.height != null ? ' · ' + nf(e.height, 1) + ' cm' : ''}  (${lb.i + 1}/${lb.list.length})`;
  $('lbNote').textContent = e.note || '';
  $('lbPrev').disabled = lb.i <= 0; $('lbNext').disabled = lb.i >= lb.list.length - 1;
}
function openLightbox(id) {
  lb.list = sorted().filter(e => photoCache.has(e.id)).map(e => e.id);
  lb.i = Math.max(0, lb.list.indexOf(id));
  showLb(); openDlg('lightbox');
}
const SECTIONS = ['dashboard', 'log', 'charts', 'gallery', 'calc', 'plan', 'wissen', 'strains', 'harvest', 'recipes', 'timeline', 'reminders', 'diagnose', 'checks'];
let navRaf = 0;
function updateNav() {
  navRaf = 0;
  let cur = SECTIONS[0];
  SECTIONS.forEach(id => { if ($(id).getBoundingClientRect().top <= 150) cur = id; });
  document.querySelectorAll('nav.tabs a').forEach(a => { const on = a.getAttribute('href') === '#' + cur; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  const main4 = ['dashboard', 'log', 'charts', 'calc'];
  document.querySelectorAll('.bottomnav [data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === cur));
  $('moreBtn').classList.toggle('on', !main4.includes(cur));
}
const QUICK_TAGS = ['pH korrigiert', 'Tank gewechselt', 'Gedüngt', 'Entlaubt', 'LST / Training', 'Umgetopft', 'Schädlinge', 'Mangel', 'Filter gereinigt'];
