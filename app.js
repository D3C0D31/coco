(() => {
'use strict';
const $ = id => document.getElementById(id);
const KEY = 'autopot-app-v3';
const PHASES = ['Jungpflanze / Anwachsen', 'Vegetation', 'Übergang / frühe Blüte', 'Hauptblüte', 'Endphase'];
const PH_RANGE = [5.8, 6.2], WATER_RANGE = [18, 22];
/* Richtwerte aus der Anleitung (Kap. 7, 9, 10). Endphase: Klima wie späte Blüte (Kap. 9), EC schrittweise abgesenkt, keine feste PPFD-Vorgabe (Kap. 10). */
const PROFILE = {
  'Jungpflanze / Anwachsen': { ec: [0.6, 1.0], vpd: [0.8, 1.0], temp: [24, 26], rh: [65, 75], ppfd: [200, 350] },
  'Vegetation': { ec: [1.1, 1.6], vpd: [1.0, 1.3], temp: [24, 28], rh: [55, 70], ppfd: [400, 650] },
  'Übergang / frühe Blüte': { ec: [1.5, 1.9], vpd: [1.2, 1.5], temp: [24, 27], rh: [50, 60], ppfd: [650, 850] },
  'Hauptblüte': { ec: [1.8, 2.3], vpd: [1.4, 1.7], temp: [22, 26], rh: [40, 55], ppfd: [800, 1000] },
  'Endphase': { ec: [0.8, 2.3], vpd: [1.4, 1.7], temp: [22, 26], rh: [40, 55], ppfd: null }
};
const SETUP_CHECKS = ['Root Control Disc korrekt eingelegt', 'AirBase-Kanäle mit Substrat gefüllt', 'AirDome-Schlauch nicht geknickt', 'Rückschlagventil verbaut', 'Trays waagerecht', 'AquaValve-Dichtungen korrekt', 'Tankfilter sauber', 'Substrat nicht verdichtet'];
const WEEK_CHECKS = ['pH und EC dokumentiert', 'Wassertemperatur geprüft', 'Tankfilter gereinigt', 'Leitungen auf Lecks geprüft', 'AquaValve gesäubert', 'Schädlinge kontrolliert', 'pH-/EC-Meter kalibriert'];
const SYMPTOMS = [
  ['tips', 'Verbrannte Blattspitzen'], ['pale', 'Helle neue Triebe'], ['claw', 'Dunkle Krallen'],
  ['wet', 'Hängend bei nassem Topf'], ['dry', 'Hängend bei leichtem Topf'], ['spots', 'Flecken / trockene Ränder'],
  ['slow', 'Langsames Wachstum'], ['salt', 'Weiße Krusten / hoher Medium-EC'], ['pest', 'Schädlinge sichtbar'], ['mold', 'Kondenswasser / hohe rF']
];
const CAUSES = [
  { t: 'Salzaufbau / EC zu hoch', s: ['tips', 'salt', 'claw', 'slow'], a: 'Tank-EC und Medium-EC prüfen, Tank-EC moderat absenken, keine weiteren Zusätze geben (Anleitung Kap. 7 und 14). Nicht nur mit reinem Wasser fluten.' },
  { t: 'Rootzone zu nass / Sauerstoffmangel', s: ['wet', 'slow', 'claw'], a: 'AirBase-Kanäle, AirDome-Schlauch, Substratstruktur, Wassertemperatur und AquaValve-Zyklus prüfen (Kap. 4, 5, 12).' },
  { t: 'Unterversorgung oder Zulaufproblem', s: ['dry', 'slow'], a: 'Tank, Filter, Leitung, AquaValve und waagerechte Trays prüfen (Kap. 12).' },
  { t: 'pH-, Ca-/Mg- oder Mikronährstoff-Verfügbarkeit', s: ['pale', 'spots'], a: 'Tank-pH, Wasserhärte, Coco-Buffering und Lampenabstand prüfen (Kap. 3, 7).' },
  { t: 'Zu viel Stickstoff oder Wurzelstress', s: ['claw', 'wet'], a: 'Tank-EC, N-Anteil im Dünger, Wassertemperatur und Wurzelzone prüfen.' },
  { t: 'Lichtstress', s: ['tips', 'pale', 'spots'], a: 'PPFD und Lampenabstand mit den Richtwerten vergleichen (Kap. 10); Licht nur schrittweise ändern.' },
  { t: 'Schädlingsdruck', s: ['pest', 'spots', 'slow'], a: 'Blattunterseiten mit Lupe prüfen, Gelbtafeln kontrollieren, Art sicher bestimmen, bevor etwas gespritzt wird (Kap. 16).' },
  { t: 'Schimmelrisiko / zu hohe Luftfeuchte', s: ['mold'], a: 'rF senken, Umluft und Entfeuchtung verbessern, stehende Nässe und abgestorbene Blätter entfernen (Kap. 9, 16).' },
  { t: 'Allgemeine Limitierung', s: ['slow'], a: 'pH, EC, VPD, PPFD und Wasserverbrauch gemeinsam betrachten; immer nur eine Änderung auf einmal (Kap. 19).' }
];
const BACKUP_EVERY = 10;

/* ---------- Helfer ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null || String(v).trim() === '') return null;
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const nf = (v, d = 2) => (v == null || !Number.isFinite(v)) ? '–' : String(Number(v.toFixed(d))).replace('.', ',');
const fmtPh = v => (v == null || !Number.isFinite(v)) ? '–' : (Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? v.toFixed(1).replace('.', ',') : nf(v, 2));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad2 = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : '–'; };
const shortDate = t => { const d = new Date(t); return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`; };
const daysAgo = iso => Math.round((Date.parse(todayStr() + 'T00:00:00') - Date.parse(iso + 'T00:00:00')) / 864e5);
const calcVpd = (t, rh) => (Number.isFinite(t) && Number.isFinite(rh)) ? Math.max(0, 0.6108 * Math.exp(17.27 * t / (t + 237.3)) * (1 - rh / 100)) : null;
const vpdOf = e => calcVpd(e.airTemp, e.humidity);
const IMG_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

let toastTimer;
function toast(msg, isErr, action) {
  const t = $('toast');
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.addEventListener('click', () => { t.className = ''; action.fn(); }, { once: true });
    t.appendChild(b);
  }
  t.className = 'show' + (isErr ? ' err' : '') + (action ? ' act' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, action ? 8000 : isErr ? 6000 : 2800);
}

function normPhase(p) {
  const s = String(p ?? '').trim().toLowerCase();
  if (!s) return '';
  if (/^veg/.test(s)) return 'Vegetation';
  if (/jung|anwachs|seedling|clone|steck/.test(s)) return PHASES[0];
  if (/übergang|uebergang|früh|frueh|early|stretch/.test(s)) return PHASES[2];
  if (/end|flush|ripen|reif/.test(s)) return PHASES[4];
  if (/haupt|späte|spaete|late|blüte|bluete|flower|bloom/.test(s)) return PHASES[3];
  return String(p).trim().slice(0, 60);
}

/* ---------- Datenmodell (Schema v5) ---------- */
const blank = () => ({
  version: 7,
  settings: { name: '', phase: 'Vegetation', strainId: null, startDate: null, phaseStart: null, flowerStart: null, flowerWeeks: 9, lightHours: 18, tankSize: 40, tankRest: 30, dailyUse: 2, tankInterval: 14, lastTankChange: null, lastBackup: null, entriesSinceBackup: 0 },
  entries: [], recipes: [], events: [], reminders: [],
  checks: { setup: {}, week: {} },
  harvest: { date: '', wet: null, dry: null, watt: null, note: '' },
  archive: [],
  strains: [],
  deleted: { entries: {}, recipes: {}, events: {}, reminders: {}, archive: {}, strains: {} } /* Löschmarker für die Synchronisation */
});

function normEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const date = String(e.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const photo = typeof e.photo === 'string' && IMG_RE.test(e.photo) ? e.photo : '';
  const o = {
    id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : uid(),
    date, phase: normPhase(e.phase),
    ec: num(e.ec), ph: num(e.ph),
    waterTemp: num(e.waterTemp ?? e.water), airTemp: num(e.airTemp ?? e.temp),
    humidity: num(e.humidity ?? e.rh), ppfd: num(e.ppfd), use: num(e.use), height: num(e.height),
    tags: String(e.tags ?? '').slice(0, 200), note: String(e.note ?? '').slice(0, 2000),
    hasPhoto: !!(photo || e.hasPhoto)
  };
  if (photo) o.photo = photo;
  return o;
}
const boolMap = (o, len) => { const r = {}; if (o && typeof o === 'object') for (let i = 0; i < len; i++) if (o[i] === true) r[i] = true; return r; };

function normalize(d) {
  const out = blank();
  if (!d || typeof d !== 'object') return out;
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  out.settings.name = String(s.name ?? s.growName ?? '').slice(0, 60);
  out.settings.phase = PHASES.includes(normPhase(s.phase)) ? normPhase(s.phase) : 'Vegetation';
  out.settings.tankSize = num(s.tankSize) ?? 40;
  out.settings.tankRest = num(s.tankRest) ?? 30;
  out.settings.dailyUse = num(s.dailyUse) ?? 2;
  out.settings.lastBackup = typeof s.lastBackup === 'string' ? s.lastBackup : null;
  out.settings.entriesSinceBackup = Math.max(0, Math.round(num(s.entriesSinceBackup) ?? 0));
  const dstr = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ? v.slice(0, 10) : null;
  out.settings.startDate = dstr(s.startDate); out.settings.phaseStart = dstr(s.phaseStart); out.settings.lastTankChange = dstr(s.lastTankChange);
  const iv = num(s.tankInterval); out.settings.tankInterval = iv != null && iv >= 1 ? Math.min(365, Math.round(iv)) : 14;
  out.settings.flowerStart = dstr(s.flowerStart);
  const fw = num(s.flowerWeeks); out.settings.flowerWeeks = fw != null && fw >= 4 && fw <= 20 ? Math.round(fw) : 9;
  const lh = num(s.lightHours); out.settings.lightHours = lh != null && lh > 0 && lh <= 24 ? lh : (out.settings.phase === 'Hauptblüte' || out.settings.phase === 'Endphase' || out.settings.phase === 'Übergang / frühe Blüte' ? 12 : 18);
  out.entries = (Array.isArray(d.entries) ? d.entries : []).map(normEntry).filter(Boolean);
  out.strains = (Array.isArray(d.strains) ? d.strains : []).filter(x => x && x.name).slice(0, 200).map(x => ({ id: String(x.id || uid()).slice(0, 40), name: String(x.name).slice(0, 60), breeder: String(x.breeder ?? '').slice(0, 60), type: ['photo', 'auto', 'unknown'].includes(x.type) ? x.type : 'unknown', flowerWeeks: Math.min(20, Math.max(4, Math.round(num(x.flowerWeeks) ?? 9))), notes: String(x.notes ?? '').slice(0, 300) }));
  out.settings.strainId = typeof s.strainId === 'string' && out.strains.some(x => x.id === s.strainId) ? s.strainId : null;
  out.recipes = (Array.isArray(d.recipes) ? d.recipes : []).filter(r => r && r.name).map(r => ({ id: String(r.id || uid()), name: String(r.name).slice(0, 60), phase: String(r.phase ?? '').slice(0, 60), text: String(r.text ?? '').slice(0, 500) }));
  out.events = (Array.isArray(d.events) ? d.events : []).filter(e => e && /^\d{4}-\d{2}-\d{2}/.test(e.date || '') && e.title).map(e => ({ id: String(e.id || uid()), date: String(e.date).slice(0, 10), title: String(e.title).slice(0, 80), note: String(e.note ?? '').slice(0, 300) }));
  out.reminders = (Array.isArray(d.reminders) ? d.reminders : []).filter(r => r && r.title && /^\d{4}-\d{2}-\d{2}/.test(r.date || '')).map(r => ({
    id: String(r.id || uid()), title: String(r.title).slice(0, 80), date: String(r.date).slice(0, 10),
    time: /^\d{2}:\d{2}$/.test(r.time || '') ? r.time : '09:00',
    repeat: ['daily', 'weekly'].includes(r.repeat) ? r.repeat : 'once',
    lastDone: typeof r.lastDone === 'string' ? r.lastDone : (r.done === true ? new Date().toISOString() : null),
    notified: typeof r.notified === 'string' ? r.notified : null
  }));
  const c = d.checks && typeof d.checks === 'object' ? d.checks : {};
  out.checks.setup = boolMap(c.setup ?? d.setupState, SETUP_CHECKS.length);
  out.checks.week = boolMap(c.week ?? d.weekState, WEEK_CHECKS.length);
  const hv = d.harvest && typeof d.harvest === 'object' ? d.harvest : {};
  out.harvest = { date: dstr(hv.date) || '', wet: num(hv.wet), dry: num(hv.dry), watt: num(hv.watt), note: String(hv.note ?? '').slice(0, 300) };
  out.archive = (Array.isArray(d.archive) ? d.archive : []).filter(a => a && typeof a === 'object').slice(0, 100).map(a => ({
    id: String(a.id || uid()).slice(0, 40), name: String(a.name ?? 'Grow').slice(0, 60), start: dstr(a.start), end: dstr(a.end),
    entries: Math.max(0, Math.round(num(a.entries) ?? 0)), days: num(a.days), wet: num(a.wet), dry: num(a.dry), watt: num(a.watt), avgEc: num(a.avgEc), avgPh: num(a.avgPh)
  }));
  /* Löschmarker: id -> Zeitpunkt; nach 180 Tagen verworfen */
  const del = d.deleted && typeof d.deleted === 'object' ? d.deleted : {}, cut = Date.now() - 180 * 864e5;
  Object.keys(out.deleted).forEach(k => {
    const src = del[k] && typeof del[k] === 'object' ? del[k] : {};
    Object.keys(src).slice(0, 5000).forEach(id => { const t = Number(src[id]); if (t > cut && id.length <= 40) out.deleted[k][id] = t; });
  });
  return out;
}
const markDeleted = (kind, ids) => { const now = Date.now(); [].concat(ids).forEach(id => { S.deleted[kind][id] = now; }); };

const entryKey = e => [e.date, e.phase, e.ec, e.ph, e.airTemp, e.humidity, e.waterTemp].join('|');
function mergeEntries(base, extra) {
  const seen = new Set(base.map(entryKey)); let added = 0;
  extra.forEach(e => { const k = entryKey(e); if (!seen.has(k)) { seen.add(k); base.push(e); added++; } });
  return added;
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (raw) { try { return normalize(JSON.parse(raw)); } catch (e) { /* defekt: Migration versuchen */ } }
  /* Migration aus Dashboard- und Command-Center-Vorgängern */
  let s = blank();
  try {
    const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
    const dash = { entries: get('autopot-entries'), setupState: get('autopot-setup'), weekState: get('autopot-week'), settings: get('autopot-settings') };
    if (dash.entries || dash.settings) s = normalize(dash);
    const cc = get('growcc-v2');
    if (cc && typeof cc === 'object') {
      const n = normalize(cc);
      mergeEntries(s.entries, n.entries);
      s.recipes = s.recipes.concat(n.recipes); s.events = s.events.concat(n.events); s.reminders = s.reminders.concat(n.reminders);
      if (!s.settings.name) s.settings = Object.assign({}, n.settings, { lastBackup: null });
    }
  } catch (e) { /* ignore */ }
  return s;
}

let S = load();
let editingId = null, pendingPhoto = '', photoDirty = false;

/* Zustand ohne Foto-Daten serialisieren (Fotos gehören nie in localStorage) */
const ser = obj => JSON.stringify(obj, (k, v) => k === 'photo' ? undefined : v);
function save() {
  try { localStorage.setItem(KEY, ser(S)); if (typeof scheduleSync === 'function') scheduleSync(); return true; }
  catch (e) { toast('Speichern fehlgeschlagen (Speicher voll?). Bitte Backup exportieren.', true); return false; }
}

/* ---------- Foto-Speicher (IndexedDB) ---------- */
let idb = null;
const photoCache = new Map();
function openDb() {
  return new Promise(res => {
    if (!('indexedDB' in window)) return res(null);
    let req;
    try { req = indexedDB.open('autopot-app', 1); } catch (e) { return res(null); }
    req.onupgradeneeded = () => { req.result.createObjectStore('photos'); };
    req.onsuccess = () => res(req.result);
    req.onerror = req.onblocked = () => res(null);
  });
}
const idbRun = (mode, fn) => new Promise((res, rej) => {
  if (!idb) return rej(new Error('IndexedDB nicht verfügbar'));
  let t;
  try { t = idb.transaction('photos', mode); fn(t.objectStore('photos')); } catch (e) { return rej(e); }
  t.oncomplete = () => res();
  t.onerror = t.onabort = () => rej(t.error || new Error('IndexedDB-Fehler'));
});
const idbAll = () => new Promise((res, rej) => {
  if (!idb) return rej(new Error('IndexedDB nicht verfügbar'));
  const t = idb.transaction('photos', 'readonly'), s = t.objectStore('photos');
  const k = s.getAllKeys(), v = s.getAll();
  t.oncomplete = () => res(k.result.map((key, i) => [key, v.result[i]]));
  t.onerror = t.onabort = () => rej(t.error || new Error('IndexedDB-Fehler'));
});
/* Fotos aus importierten Einträgen übernehmen: in IndexedDB schreiben, aus dem Eintrag entfernen */
async function adoptPhotos(list) {
  let failed = 0;
  for (const e of list) {
    if (typeof e.photo === 'string' && e.photo) {
      photoCache.set(e.id, e.photo);
      try { await idbRun('readwrite', s => s.put(e.photo, e.id)); } catch (err) { failed++; }
      e.hasPhoto = true;
    }
    delete e.photo;
    if (e.hasPhoto && !photoCache.has(e.id) && !readSync().tag) e.hasPhoto = false;
  }
  if (failed) toast(`${failed} Foto(s) konnten nicht dauerhaft gespeichert werden und gehen beim Schließen verloren. Bitte Backup exportieren.`, true);
}
async function initPhotos() {
  idb = await openDb();
  if (idb) {
    try { (await idbAll()).forEach(([k, v]) => { if (typeof v === 'string' && IMG_RE.test(v)) photoCache.set(String(k), v); }); } catch (e) { /* ignore */ }
  } else {
    $('fPhoto').disabled = true;
    $('fPhoto').title = 'In diesem Browser (z. B. privates Fenster) können keine Fotos gespeichert werden.';
  }
  await adoptPhotos(S.entries);
  save();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
}
const dropPhoto = id => { photoCache.delete(id); if (idb) idbRun('readwrite', s => s.delete(id)).catch(() => {}); };

const sorted = () => S.entries.slice().sort((a, b) => a.date.localeCompare(b.date));

/* ---------- Bewertung ---------- */
function rangeChip(v, r) {
  if (v == null || !r) return ['–', 'mute'];
  if (v < r[0]) return ['zu niedrig', 'warn'];
  if (v > r[1]) return ['zu hoch', 'bad'];
  return ['im Ziel', 'ok'];
}
const rng = (r, unit = '') => r ? `${nf(r[0])}–${nf(r[1])}${unit}` : '–';
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 864e5);
const isoOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const svp = t => 0.6108 * Math.exp(17.27 * t / (t + 237.3));
const phaseProfile = e => PROFILE[e && e.phase] || PROFILE[S.settings.phase] || PROFILE.Vegetation;

function tankDays() {
  const { tankRest: r, dailyUse: u } = S.settings;
  return (u > 0 && r >= 0) ? Math.floor(r / u) : null;
}
function growInfo() {
  const es = sorted();
  const start = S.settings.startDate || (es[0] && es[0].date) || null;
  if (!start) return null;
  const day = Math.max(1, dayDiff(start, todayStr()) + 1);
  const ps = S.settings.phaseStart || start;
  return { start, derived: !S.settings.startDate, day, week: Math.ceil(day / 7), phaseDays: Math.max(1, dayDiff(ps, todayStr()) + 1) };
}
/* Grow-Score: Anteil der Messwerte der letzten 14 Tage (sonst des letzten Eintrags), die im Zielbereich liegen */
function growScore() {
  const all = sorted();
  const recent = all.filter(e => daysAgo(e.date) <= 14);
  const list = recent.length ? recent : all.slice(-1);
  let ok = 0, n = 0;
  list.forEach(e => {
    const p = phaseProfile(e);
    [[e.ph, PH_RANGE], [e.ec, p.ec], [vpdOf(e), p.vpd], [e.waterTemp, WATER_RANGE], [e.airTemp, p.temp], [e.humidity, p.rh], [e.ppfd, p.ppfd]].forEach(([v, r]) => {
      if (v == null || !r) return;
      n++; if (v >= r[0] && v <= r[1]) ok++;
    });
  });
  return n ? Math.round(ok / n * 100) : null;
}
function streak() {
  const days = new Set(S.entries.map(e => e.date));
  const d = new Date();
  if (!days.has(isoOf(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(isoOf(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function findings() {
  const out = [];
  const es = sorted();
  if (!es.length) { out.push(['', 'Noch keine Messwerte – trage unten den ersten Eintrag ein.']); return out; }
  const e = es[es.length - 1];
  const age = daysAgo(e.date);
  if (age >= 3) out.push(['warn', `Der letzte Eintrag ist ${age} Tage alt (${fmtDate(e.date)}). Regelmäßig messen und protokollieren.`]);
  const pn = PROFILE[e.phase] ? e.phase : S.settings.phase, p = PROFILE[pn];
  const chk = (label, v, r, unit) => {
    if (v == null || !r) return;
    if (v < r[0]) out.push(['warn', `${label} ${nf(v)}${unit} liegt unter dem Zielbereich (${rng(r, unit)}).`]);
    else if (v > r[1]) out.push(['warn', `${label} ${nf(v)}${unit} liegt über dem Zielbereich (${rng(r, unit)}).`]);
  };
  chk('Tank-pH', e.ph, PH_RANGE, '');
  chk(`Tank-EC (Phase ${pn})`, e.ec, p.ec, '');
  chk('Wassertemperatur', e.waterTemp, WATER_RANGE, ' °C');
  chk(`VPD (Phase ${pn})`, vpdOf(e), p.vpd, ' kPa');
  chk(`Lufttemperatur (Phase ${pn})`, e.airTemp, p.temp, ' °C');
  chk(`Luftfeuchte (Phase ${pn})`, e.humidity, p.rh, ' %');
  chk(`PPFD (Phase ${pn})`, e.ppfd, p.ppfd, '');
  const td = tankDays();
  if (td != null && td <= 2) out.push(['warn', `Der Tank reicht nur noch etwa ${td} Tag(e). Bald nachfüllen oder wechseln.`]);
  const tc = S.settings.lastTankChange, iv = S.settings.tankInterval;
  if (tc && iv && daysAgo(tc) >= iv) out.push(['warn', `Der letzte Tankwechsel war vor ${daysAgo(tc)} Tagen (Intervall ${iv} Tage). Wechsel fällig.`]);
  /* Trends über die letzten Messungen */
  const l3 = es.slice(-3), l2 = es.slice(-2);
  if (l3.length === 3) {
    const ph = l3.map(x => x.ph), ec = l3.map(x => x.ec), use = l3.map(x => x.use);
    if (ph.every(v => v != null) && ph[0] < ph[1] && ph[1] < ph[2] && ph[2] - ph[0] >= 0.3) out.push(['warn', `Trend: Der pH steigt seit drei Messungen (${fmtPh(ph[0])} → ${fmtPh(ph[2])}). Tank-pH prüfen und nachregeln.`]);
    if (ec.every(v => v != null) && use.every(v => v != null) && ec[0] < ec[1] && ec[1] < ec[2] && ec[2] - ec[0] >= 0.3 && use[2] < use[0]) out.push(['warn', `Trend: Der EC steigt (${nf(ec[0])} → ${nf(ec[2])}), während der Verbrauch sinkt – möglicher Salzaufbau oder ein Wurzelproblem (Anleitung Kap. 14).`]);
  }
  if (l2.length === 2 && l2.every(x => x.waterTemp != null && x.waterTemp > WATER_RANGE[1])) out.push(['warn', 'Trend: Wassertemperatur zweimal in Folge über 22 °C – weniger Sauerstoff an den Wurzeln, mehr Risiko für Wurzelfäule. Tank kühler stellen.']);
  if (l2.length === 2 && ['Hauptblüte', 'Endphase'].includes(pn) && l2.every(x => x.humidity != null && x.humidity > 60)) out.push(['warn', 'Trend: Luftfeuchte in der Blüte zweimal über 60 % – erhöhte Schimmelgefahr. Entfeuchten und Umluft verbessern.']);
  if (!out.length) out.push(['ok', 'Letzte Messwerte liegen im Zielbereich.']);
  const since = S.settings.entriesSinceBackup || 0;
  if (!S.settings.lastBackup) {
    out.push(['warn', 'Es wurde noch kein Backup exportiert. Daten liegen nur in diesem Browser.', 'backup']);
  } else {
    const b = Math.floor((Date.now() - Date.parse(S.settings.lastBackup)) / 864e5);
    if (b >= 14) out.push(['warn', `Das letzte Backup ist ${b} Tage alt. Daten liegen nur in diesem Browser.`, 'backup']);
    else if (since >= BACKUP_EVERY) out.push(['warn', `Seit dem letzten Backup wurden ${since} Einträge hinzugefügt.`, 'backup']);
  }
  return out;
}

/* ---------- Rendering ---------- */
function fillSelect(sel, withEmpty) {
  sel.innerHTML = (withEmpty ? '<option value="">–</option>' : '') + PHASES.map(p => `<option>${esc(p)}</option>`).join('');
}
const hasPrev = () => { try { return !!localStorage.getItem(KEY + '-prev'); } catch (e) { return false; } };
const PH_SHORT = ['Jung', 'Vegetation', 'Übergang', 'Blüte', 'Ende'];

function sparkSvg(vals) {
  vals = vals.filter(v => v != null && Number.isFinite(v)).slice(-12);
  if (vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${(i / (vals.length - 1) * 100).toFixed(1)} ${(26 - (v - lo) / sp * 22).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d} L100 30 L0 30 Z"/><path class="l" d="${d}"/></svg>`;
}
function gaugeHtml(v, r) {
  if (!r) return '';
  const span = r[1] - r[0] || 1, lo = r[0] - span * 0.8, hi = r[1] + span * 0.8;
  const pos = v == null ? null : Math.min(100, Math.max(0, (v - lo) / (hi - lo) * 100));
  return `<div class="gauge" aria-hidden="true"><i class="band" style="left:${(r[0] - lo) / (hi - lo) * 100}%;width:${span / (hi - lo) * 100}%"></i>${pos == null ? '' : `<b style="left:${pos}%"></b>`}</div>`;
}
function setState(id, cls) { const el = $(id); if (cls === 'ok' || cls === 'warn' || cls === 'bad') el.dataset.state = cls; else delete el.dataset.state; }

function renderHero() {
  const gi = growInfo();
  $('heroName').textContent = S.settings.name || 'Mein Grow';
  const stx = activeStrain();
  $('heroEyebrow').textContent = stx ? `Dein Grow · ${stx.name} · ${STRAIN_TYPES[stx.type]}` : 'Dein Grow';
  if (gi) {
    $('heroDay').textContent = `Tag ${gi.day} · Woche ${gi.week}`;
    $('heroSub').textContent = `${S.settings.phase}${S.settings.phaseStart ? ` seit ${gi.phaseDays} ${gi.phaseDays === 1 ? 'Tag' : 'Tagen'}` : ''} · Start ${fmtDate(gi.start)}${gi.derived ? ' (erster Eintrag)' : ''}`;
  } else {
    $('heroDay').textContent = 'Noch kein Start';
    $('heroSub').textContent = 'Trage unten ein Startdatum ein, dann zählt die App Tage und Wochen.';
  }
  const fi = PHASES.indexOf(S.settings.phase) >= 2 ? flowerInfo() : null;
  $('heroFlower').textContent = fi ? (fi.left > 0 ? `🌸 Blütewoche ${fi.week} von ${fi.weeks} · Ernte ca. ab ${fmtDate(fi.harvest)} (noch ${fi.left} Tage)` : `🌾 Erntefenster erreicht (geplant ab ${fmtDate(fi.harvest)}) – Reife an den Trichomen prüfen`) : (PHASES.indexOf(S.settings.phase) < 2 ? `Blüte noch nicht gestartet · Blütedauer laut Sorte: ${S.settings.flowerWeeks} Wochen` : 'Blütebeginn im Bereich „Aktueller Grow“ eintragen, dann berechnet die App den Erntetermin.');
  const idx = PHASES.indexOf(S.settings.phase);
  $('phaseSteps').innerHTML = PHASES.map((p, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"${i === idx ? ' aria-current="step"' : ''}><span title="${esc(p)}">${PH_SHORT[i]}</span></li>`).join('');
  const sc = growScore();
  $('scoreVal').textContent = sc == null ? '–' : sc;
  $('ringPg').style.strokeDashoffset = 207.3 * (1 - (sc || 0) / 100);
  $('scoreRing').setAttribute('aria-label', sc == null ? 'Grow-Score: noch keine Daten' : `Grow-Score ${sc} von 100`);
  const st = streak();
  $('streakVal').textContent = st ? `${st >= 3 ? '🔥 ' : ''}${st} ${st === 1 ? 'Tag' : 'Tage'}` : '–';
  $('entryCount').textContent = S.entries.length;
}

function renderDashboard() {
  renderHero(); renderTip(); renderWeekly(); if ($('todayList')) renderToday();
  const es = sorted(), e = es[es.length - 1];
  const pn = e && PROFILE[e.phase] ? e.phase : S.settings.phase, p = PROFILE[pn];
  const v = e ? vpdOf(e) : null;
  $('kPh').textContent = e ? fmtPh(e.ph) : '–';
  $('kPhSub').textContent = `Ziel ${rng(PH_RANGE)} · ${rangeChip(e?.ph, PH_RANGE)[0]}`;
  $('kEc').textContent = e ? nf(e.ec) : '–';
  $('kEcSub').textContent = `Ziel ${rng(p.ec)} · ${rangeChip(e?.ec, p.ec)[0]}`;
  $('kVpd').textContent = v == null ? '–' : nf(v) + ' kPa';
  $('kVpdSub').textContent = `Ziel ${rng(p.vpd, ' kPa')} · ${rangeChip(v, p.vpd)[0]}`;
  $('gPh').innerHTML = gaugeHtml(e?.ph, PH_RANGE); $('gEc').innerHTML = gaugeHtml(e?.ec, p.ec); $('gVpd').innerHTML = gaugeHtml(v, p.vpd);
  $('spPh').innerHTML = sparkSvg(es.map(x => x.ph)); $('spEc').innerHTML = sparkSvg(es.map(x => x.ec)); $('spVpd').innerHTML = sparkSvg(es.map(vpdOf));
  setState('cardPh', rangeChip(e?.ph, PH_RANGE)[1]); setState('cardEc', rangeChip(e?.ec, p.ec)[1]); setState('cardVpd', rangeChip(v, p.vpd)[1]);
  const td = tankDays();
  if (td != null) {
    $('kTank').textContent = td + ' Tage';
    const d = new Date(); d.setDate(d.getDate() + td);
    $('kTankSub').textContent = 'leer ca. ' + d.toLocaleDateString('de-DE');
    const pct = S.settings.tankSize > 0 ? Math.max(0, Math.min(100, S.settings.tankRest / S.settings.tankSize * 100)) : 0;
    $('gTank').innerHTML = `<div class="gauge" aria-hidden="true"><i class="band" style="left:0;width:${pct}%${pct < 15 ? ';background:var(--orange)' : ''}"></i></div>`;
    setState('cardTank', td <= 2 ? 'bad' : td <= 4 ? 'warn' : 'ok');
  } else { $('kTank').textContent = '–'; $('kTankSub').textContent = 'Verbrauch eintragen'; $('gTank').innerHTML = ''; setState('cardTank', ''); }
  $('kLast').textContent = e ? fmtDate(e.date) : '–';
  $('kLastSub').textContent = e ? (daysAgo(e.date) === 0 ? 'heute' : `vor ${daysAgo(e.date)} Tagen`) : 'keine Einträge';
  const sd = SETUP_CHECKS.filter((_, i) => S.checks.setup[i]).length, wd = WEEK_CHECKS.filter((_, i) => S.checks.week[i]).length;
  $('kChecks').textContent = `${Math.round(sd / SETUP_CHECKS.length * 100)} % / ${Math.round(wd / WEEK_CHECKS.length * 100)} %`;
  const ACTIONS = { backup: 'Jetzt sichern' };
  $('findings').innerHTML = findings().map(([c, m, a]) => `<div class="notice ${c}"><span>${esc(m)}</span>${a ? `<button class="btn small primary" data-act="${a}" type="button">${ACTIONS[a]}</button>` : ''}</div>`).join('');
  $('phaseHint').textContent = S.settings.phase === 'Endphase' ? 'Endphase: Klima und VPD wie späte Blüte, EC schrittweise absenken (Anleitung Kap. 7 und 9). Für PPFD gibt es keine feste Vorgabe.' : '';
  const tc = S.settings.lastTankChange;
  $('tankInfo').textContent = tc ? `Letzter Tankwechsel: ${fmtDate(tc)} (${daysAgo(tc) === 0 ? 'heute' : `vor ${daysAgo(tc)} Tagen`}), Intervall ${S.settings.tankInterval} Tage.` : 'Noch kein Tankwechsel notiert. Mit „Tank gewechselt“ oben festhalten.';
  $('backupState').textContent = S.settings.lastBackup ? `Letztes Backup: ${fmtDate(S.settings.lastBackup.slice(0, 10))}` : 'Noch kein Backup erstellt.';
  $('restorePrev').classList.toggle('hidden', !hasPrev());
}

const LF = { q: '', phase: '', photo: false, limit: 25 };
function filteredEntries() {
  const q = LF.q.trim().toLowerCase();
  return sorted().reverse().filter(e => {
    if (LF.phase && e.phase !== LF.phase) return false;
    if (LF.photo && !photoCache.has(e.id)) return false;
    if (q && !`${e.note} ${e.tags} ${fmtDate(e.date)} ${e.date} ${e.phase}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function renderLog() {
  const body = $('logBody');
  const all = filteredEntries(), es = all.slice(0, LF.limit);
  $('logMore').classList.toggle('hidden', all.length <= LF.limit);
  $('logCount').textContent = S.entries.length ? `${all.length} von ${S.entries.length} Einträgen` : '';
  if (!es.length) { body.innerHTML = `<tr><td colspan="14">${S.entries.length ? 'Keine Treffer für diesen Filter.' : 'Noch keine Einträge.'}</td></tr>`; return; }
  body.innerHTML = es.map(e => {
    const v = vpdOf(e), photo = photoCache.get(e.id);
    return `<tr><td class="num">${esc(fmtDate(e.date))}</td><td>${esc(e.phase || '–')}</td><td class="num">${nf(e.ec)}</td><td class="num">${fmtPh(e.ph)}</td><td class="num">${nf(e.waterTemp, 1)}</td><td class="num">${nf(e.airTemp, 1)}</td><td class="num">${nf(e.humidity, 0)}</td><td class="num">${nf(v)}</td><td class="num">${nf(e.ppfd, 0)}</td><td class="num">${nf(e.use, 1)}</td><td class="num">${nf(e.height, 1)}</td><td>${e.tags ? `<em>${esc(e.tags)}</em><br>` : ''}${esc(e.note)}</td><td>${photo ? `<img class="thumb" data-act="lightbox" data-id="${esc(e.id)}" src="${photo}" alt="Foto vom ${esc(fmtDate(e.date))}">` : ''}</td><td class="num"><button class="btn small" data-act="edit" data-id="${esc(e.id)}" type="button" aria-label="Eintrag bearbeiten">✎</button> <button class="btn small danger" data-act="del-entry" data-id="${esc(e.id)}" type="button" aria-label="Eintrag löschen">✕</button></td></tr>`;
  }).join('');
}
function renderGallery() {
  const list = sorted().reverse().filter(e => photoCache.has(e.id));
  $('galleryGrid').innerHTML = list.map(e => `<button class="gthumb" type="button" data-act="lightbox" data-id="${esc(e.id)}"><img src="${photoCache.get(e.id)}" alt="Foto vom ${esc(fmtDate(e.date))}" loading="lazy"><span>${esc(fmtDate(e.date))}${e.height != null ? ' · ' + nf(e.height, 1) + ' cm' : ''}</span></button>`).join('');
  $('galleryEmpty').classList.toggle('hidden', list.length > 0);
}

/* ---------- Diagramme ---------- */
const CHARTS = [
  { id: 'cEc', get: e => e.ec, color: '--blue', band: p => p.ec, dec: 2, unit: '' },
  { id: 'cPh', get: e => e.ph, color: '--green', band: () => PH_RANGE, dec: 2, unit: '' },
  { id: 'cVpd', get: vpdOf, color: '--violet', band: p => p.vpd, dec: 2, unit: ' kPa' },
  { id: 'cAir', get: e => e.airTemp, color: '--orange', band: p => p.temp, dec: 1, unit: ' °C' },
  { id: 'cRh', get: e => e.humidity, color: '--cyan', band: p => p.rh, dec: 0, unit: ' %' },
  { id: 'cWater', get: e => e.waterTemp, color: '--blue', band: () => WATER_RANGE, dec: 1, unit: ' °C' },
  { id: 'cPpfd', get: e => e.ppfd, color: '--orange', band: p => p.ppfd, dec: 0, unit: '' },
  { id: 'cUse', get: e => e.use, color: '--cyan', band: () => null, dec: 1, unit: ' L' },
  { id: 'cHeight', get: e => e.height, color: '--violet', band: () => null, dec: 1, unit: ' cm' }
];
let rangeDays = 0;
try { const r = parseInt(localStorage.getItem('autopot-range'), 10); if ([7, 14, 30].includes(r)) rangeDays = r; } catch (e) { /* ignore */ }
const rgba = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const chartGeo = {};
function drawChart(cfg, hover) {
  const c = $(cfg.id), dpr = window.devicePixelRatio || 1;
  const w = Math.max(240, c.clientWidth || 300), h = 220;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement);
  const col = n => cs.getPropertyValue(n).trim();
  const grid = col('--border'), muted = col('--muted'), green = col('--green'), line = col(cfg.color), text = col('--text');
  const band = cfg.band(PROFILE[S.settings.phase] || PROFILE.Vegetation);
  x.font = '11px system-ui,sans-serif';
  const pts = sorted().map(e => ({ t: Date.parse(e.date + 'T12:00:00'), v: cfg.get(e), d: e.date })).filter(p => p.v != null && Number.isFinite(p.v) && (!rangeDays || daysAgo(p.d) <= rangeDays));
  chartGeo[cfg.id] = [];
  if (!pts.length) { x.fillStyle = muted; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(rangeDays ? 'Keine Daten im Zeitraum' : 'Keine Daten', w / 2, h / 2); return; }
  let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
  if (band) { lo = Math.min(lo, band[0]); hi = Math.max(hi, band[1]); }
  const padv = (hi - lo) * 0.12 || 0.5; lo -= padv; hi += padv;
  const L = 44, R = 14, T = 12, B = 26, pw = w - L - R, ph = h - T - B;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const px = t => t1 === t0 ? L + pw / 2 : L + (t - t0) / (t1 - t0) * pw;
  const py = v => T + (hi - v) / (hi - lo) * ph;
  if (band) {
    x.fillStyle = rgba(green, 0.16); x.fillRect(L, py(band[1]), pw, py(band[0]) - py(band[1]));
    x.strokeStyle = rgba(green, 0.45); x.lineWidth = 1; x.setLineDash([3, 3]);
    [band[0], band[1]].forEach(b => { x.beginPath(); x.moveTo(L, py(b)); x.lineTo(w - R, py(b)); x.stroke(); });
    x.setLineDash([]);
  }
  x.strokeStyle = rgba(grid, 0.8); x.lineWidth = 1; x.fillStyle = muted; x.textAlign = 'right'; x.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4, y = py(v);
    x.beginPath(); x.moveTo(L, y); x.lineTo(w - R, y); x.stroke();
    x.fillText(nf(v, cfg.dec), L - 6, y);
  }
  x.textBaseline = 'top';
  if (t1 === t0) { x.textAlign = 'center'; x.fillText(shortDate(t0), px(t0), h - B + 8); }
  else {
    const nt = Math.min(4, Math.max(2, Math.floor(pw / 90)));
    for (let i = 0; i < nt; i++) {
      const tt = t0 + (t1 - t0) * i / (nt - 1);
      x.textAlign = i === 0 ? 'left' : i === nt - 1 ? 'right' : 'center';
      x.fillText(shortDate(tt), px(tt), h - B + 8);
    }
  }
  const P = pts.map(p => ({ x: px(p.t), y: py(p.v) }));
  /* Monotone kubische Interpolation (Fritsch-Carlson): Linie geht exakt durch jeden Messpunkt und schießt nicht über */
  const n = P.length, dxs = [], ms = [], tg = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { dxs[i] = P[i + 1].x - P[i].x; ms[i] = dxs[i] > 0 ? (P[i + 1].y - P[i].y) / dxs[i] : 0; }
  if (n > 1) { tg[0] = ms[0]; tg[n - 1] = ms[n - 2]; }
  for (let i = 1; i < n - 1; i++) tg[i] = ms[i - 1] * ms[i] <= 0 ? 0 : (ms[i - 1] + ms[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (ms[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
    const a = tg[i] / ms[i], b = tg[i + 1] / ms[i], q = a * a + b * b;
    if (q > 9) { const tau = 3 / Math.sqrt(q); tg[i] = tau * a * ms[i]; tg[i + 1] = tau * b * ms[i]; }
  }
  const trace = () => {
    x.moveTo(P[0].x, P[0].y);
    for (let i = 0; i < n - 1; i++) {
      const d = dxs[i];
      if (d <= 0) x.lineTo(P[i + 1].x, P[i + 1].y);
      else x.bezierCurveTo(P[i].x + d / 3, P[i].y + tg[i] * d / 3, P[i + 1].x - d / 3, P[i + 1].y - tg[i + 1] * d / 3, P[i + 1].x, P[i + 1].y);
    }
  };
  if (P.length > 1) {
    const gr = x.createLinearGradient(0, T, 0, T + ph);
    gr.addColorStop(0, rgba(line, 0.32)); gr.addColorStop(1, rgba(line, 0));
    x.beginPath(); trace(); x.lineTo(P[P.length - 1].x, T + ph); x.lineTo(P[0].x, T + ph); x.closePath();
    x.fillStyle = gr; x.fill();
    x.strokeStyle = line; x.lineWidth = 2.6; x.lineJoin = 'round'; x.lineCap = 'round';
    x.beginPath(); trace(); x.stroke();
  }
  P.forEach(q => {
    x.fillStyle = cs.getPropertyValue('--surface').trim() || '#fff'; x.beginPath(); x.arc(q.x, q.y, 5, 0, Math.PI * 2); x.fill();
    x.fillStyle = line; x.beginPath(); x.arc(q.x, q.y, 3.4, 0, Math.PI * 2); x.fill();
  });
  chartGeo[cfg.id] = pts.map((p, i) => ({ x: P[i].x, y: P[i].y, v: p.v, d: p.d }));
  if (hover != null && chartGeo[cfg.id][hover]) {
    const g = chartGeo[cfg.id][hover];
    x.strokeStyle = text; x.globalAlpha = 0.35; x.setLineDash([4, 3]);
    x.beginPath(); x.moveTo(g.x, T); x.lineTo(g.x, T + ph); x.stroke();
    x.setLineDash([]); x.globalAlpha = 1;
    x.fillStyle = line; x.beginPath(); x.arc(g.x, g.y, 6.5, 0, Math.PI * 2); x.fill();
    x.strokeStyle = text; x.lineWidth = 2; x.stroke();
  }
}
function bindChartHover() {
  const hideAll = () => { $('tip').classList.add('hidden'); };
  CHARTS.forEach(cfg => {
    const c = $(cfg.id);
    const show = ev => {
      const geo = chartGeo[cfg.id] || [];
      if (!geo.length) return;
      const r = c.getBoundingClientRect(), px = ev.clientX - r.left;
      let best = 0;
      geo.forEach((g, i) => { if (Math.abs(g.x - px) < Math.abs(geo[best].x - px)) best = i; });
      drawChart(cfg, best);
      const g = geo[best], tip = $('tip');
      tip.textContent = `${fmtDate(g.d)} · ${nf(g.v, cfg.dec)}${cfg.unit}`;
      tip.classList.remove('hidden');
      tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 6, Math.max(6, r.left + g.x - tip.offsetWidth / 2)) + 'px';
      tip.style.top = Math.max(4, r.top + g.y - tip.offsetHeight - 12) + 'px';
    };
    c.addEventListener('pointermove', show);
    c.addEventListener('pointerdown', show);
    c.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') { hideAll(); drawChart(cfg); } });
  });
  document.addEventListener('pointerdown', ev => {
    if (ev.target.closest && ev.target.closest('.chartbox')) return;
    hideAll(); CHARTS.forEach(cfg => drawChart(cfg));
  });
  window.addEventListener('scroll', hideAll, { passive: true });
}

function renderCharts() {
  const es = sorted();
  CHARTS.forEach(cfg => {
    drawChart(cfg);
    let last = null;
    for (let i = es.length - 1; i >= 0; i--) { const v = cfg.get(es[i]); if (v != null && Number.isFinite(v)) { last = v; break; } }
    const cur = $(cfg.id).closest('.card').querySelector('.cur');
    if (cur) cur.textContent = last == null ? '' : nf(last, cfg.dec) + cfg.unit;
  });
  const groups = {};
  S.entries.forEach(e => { (groups[e.phase || 'Ohne Phase'] ??= []).push(e); });
  const rank = k => PHASES.indexOf(k) < 0 ? 99 : PHASES.indexOf(k);
  const keys = Object.keys(groups).sort((a, b) => rank(a) - rank(b));
  $('averages').innerHTML = keys.map(k => {
    const a = groups[k];
    const avg = (fn, d) => { const v = a.map(fn).filter(z => z != null && Number.isFinite(z)); return v.length ? nf(v.reduce((s, z) => s + z, 0) / v.length, d) : '–'; };
    return `<div class="card"><h3>${esc(k)} (${a.length})</h3>EC: ${avg(e => e.ec, 2)}<br>pH: ${avg(e => e.ph, 2)}<br>VPD: ${avg(vpdOf, 2)} kPa<br>Luft: ${avg(e => e.airTemp, 1)} °C · rF: ${avg(e => e.humidity, 0)} %<br>PPFD: ${avg(e => e.ppfd, 0)}</div>`;
  }).join('') || '<p class="sub">Noch keine Daten.</p>';
}

/* ---------- Rechner ---------- */
function renderHeatmap() {
  const band = (PROFILE[S.settings.phase] || PROFILE.Vegetation).vpd;
  const off = num($('hLeaf').value) || 0;
  const temps = [20, 22, 24, 26, 28, 30, 32], rhs = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
  const e = sorted().filter(x => x.airTemp != null && x.humidity != null).pop();
  const near = (list, v) => list.reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b, list[0]);
  const curT = e ? near(temps, e.airTemp) : null, curR = e ? near(rhs, e.humidity) : null;
  let html = '<thead><tr><th>rF \\ °C</th>' + temps.map(t => `<th>${t}</th>`).join('') + '</tr></thead><tbody>';
  rhs.forEach(r => {
    html += `<tr><th>${r} %</th>` + temps.map(t => {
      const v = Math.max(0, svp(t + off) - svp(t) * r / 100);
      const cls = v < band[0] ? 'lo' : v <= band[1] ? 'ok' : v <= band[1] + 0.4 ? 'hi' : 'xh';
      return `<td class="${cls}${t === curT && r === curR ? ' now' : ''}" title="${t} °C, ${r} % rF: ${nf(v)} kPa">${nf(v, 1)}</td>`;
    }).join('') + '</tr>';
  });
  $('vpdMap').innerHTML = html + '</tbody>';
  $('heatNote').textContent = `Ziel ${rng(band, ' kPa')} (${S.settings.phase})${e ? ' · Rahmen = letzter Eintrag' : ''}`;
}
function renderCalc() {
  const v = calcVpd(num($('vTemp').value), num($('vRh').value));
  const [lbl, cls] = rangeChip(v, (PROFILE[S.settings.phase] || PROFILE.Vegetation).vpd);
  $('vOut').innerHTML = v == null ? '–' : `<strong>${nf(v)} kPa</strong> <span class="chip ${cls}">${lbl}</span> <span class="sub">(Phase ${esc(S.settings.phase)})</span>`;
  const base = num($('eBase').value) ?? 0, target = num($('eTarget').value) ?? 0, L = num($('eLiter').value) ?? 0, d = target - base;
  $('eOut').innerHTML = d < 0 ? 'Ziel-EC liegt unter dem Ausgangs-EC: mit Wasser verdünnen.' : `EC-Erhöhung <strong>${nf(d)}</strong> · Modellmenge ca. <strong>${Math.round(d * 2 * L)} ml</strong>`;
  const cur = num($('pCur').value), tar = num($('pTar').value);
  if (cur == null || tar == null) $('pOut').textContent = '–';
  else {
    const dif = Math.abs(cur - tar);
    $('pOut').innerHTML = dif < 0.05 ? 'Kein Korrekturbedarf.' : `Differenz <strong>${nf(dif, 1)}</strong> – pH ${cur > tar ? 'senken (pH-Down)' : 'anheben (pH-Up)'} in 0,1er-Schritten, nach jeder Zugabe messen.`;
  }
  const ol = num($('wOldL').value) ?? 0, oe = num($('wOldEc').value) ?? 0, nl = num($('wNewL').value) ?? 0, ne = num($('wNewEc').value) ?? 0;
  $('wOut').innerHTML = ol + nl > 0 ? `Misch-EC: <strong>${nf((ol * oe + nl * ne) / (ol + nl))}</strong> bei ${nf(ol + nl, 1)} L` : '–';
  const rest = S.settings.tankRest, use = S.settings.dailyUse;
  if (use > 0) {
    const days = Math.floor(rest / use), dt = new Date(); dt.setDate(dt.getDate() + days);
    $('tOut').innerHTML = `Restlaufzeit: <strong>${days} Tage</strong><br>Nachfüllen spätestens: <strong>${dt.toLocaleDateString('de-DE')}</strong><br>Füllstand: ${nf(rest, 1)} von ${nf(S.settings.tankSize, 1)} L`;
  } else $('tOut').textContent = 'Verbrauch pro Tag eintragen.';
  const pf = num($('dPpfd').value), hrs = num($('dHours').value);
  if (pf == null || hrs == null || hrs <= 0 || hrs > 24) $('dOut').textContent = '–';
  else {
    const dli = pf * 3600 * hrs / 1e6, pr = (PROFILE[S.settings.phase] || PROFILE.Vegetation).ppfd;
    const tr = pr ? [pr[0] * hrs * 0.0036, pr[1] * hrs * 0.0036] : null;
    const [l2, c2] = rangeChip(dli, tr);
    $('dOut').innerHTML = `<strong>${nf(dli, 1)} mol/m²/Tag</strong>${tr ? ` <span class="chip ${c2}">${l2}</span><br><span class="sub">Zielbereich der Phase bei ${nf(hrs, 1)} h: ${nf(tr[0], 1)}–${nf(tr[1], 1)}</span>` : '<br><span class="sub">Für die Endphase gibt es keine feste Vorgabe.</span>'}`;
  }
  renderHeatmap();
}

/* ---------- Ernte & Archiv ---------- */
function renderHarvest() {
  const h = S.harvest, gi = growInfo();
  const cards = [];
  if (h.dry != null) cards.push(['Trockengewicht', nf(h.dry, 1) + ' g']);
  if (h.wet != null && h.dry != null && h.wet > 0) cards.push(['Trocknungsverlust', nf((1 - h.dry / h.wet) * 100, 0) + ' %']);
  if (h.dry != null && h.watt) cards.push(['Ertrag pro Watt', nf(h.dry / h.watt, 2) + ' g/W']);
  if (h.date && gi) cards.push(['Dauer bis Ernte', Math.max(1, dayDiff(gi.start, h.date) + 1) + ' Tage']);
  if (h.date && gi && h.dry != null) cards.push(['Ertrag pro Tag', nf(h.dry / Math.max(1, dayDiff(gi.start, h.date) + 1), 2) + ' g']);
  $('hOut').innerHTML = cards.map(([t, v]) => `<div class="card"><h3>${esc(t)}</h3><div class="value">${esc(v)}</div></div>`).join('') || '<p class="sub">Trage Erntedatum und Gewichte ein – dann werden Ertrag, Trocknungsverlust und g/W berechnet.</p>';
}
function renderArchive() {
  $('archiveList').innerHTML = S.archive.map(a => `<div class="item"><div><strong>${esc(a.name || 'Grow')}</strong> <span class="meta">${esc(a.start ? fmtDate(a.start) : '–')} → ${esc(a.end ? fmtDate(a.end) : '–')}${a.days ? ` · ${a.days} Tage` : ''}</span><p>${a.entries} Einträge${a.dry != null ? ` · ${nf(a.dry, 1)} g trocken` : ''}${a.dry != null && a.watt ? ` (${nf(a.dry / a.watt, 2)} g/W)` : ''}${a.avgEc != null ? ` · Ø EC ${nf(a.avgEc)}` : ''}${a.avgPh != null ? ` · Ø pH ${nf(a.avgPh)}` : ''}</p></div><button class="btn small danger" data-act="del-archive" data-id="${esc(a.id)}" type="button" aria-label="Archiv-Eintrag löschen">✕</button></div>`).join('') || '<p class="sub">Noch keine abgeschlossenen Grows.</p>';
}

function renderLists() {
  $('recipeList').innerHTML = S.recipes.map(r => `<div class="item"><div><strong>${esc(r.name)}</strong> <span class="meta">${esc(r.phase)}</span><p>${esc(r.text)}</p></div><button class="btn small danger" data-act="del-recipe" data-id="${esc(r.id)}" type="button" aria-label="Rezept löschen">✕</button></div>`).join('') || '<p class="sub">Noch keine Rezepte.</p>';
  const ev = S.events.slice().sort((a, b) => a.date.localeCompare(b.date));
  $('eventList').innerHTML = ev.map(e => `<div class="item"><div><strong>${esc(fmtDate(e.date))} · ${esc(e.title)}</strong><p>${esc(e.note)}</p></div><button class="btn small danger" data-act="del-event" data-id="${esc(e.id)}" type="button" aria-label="Ereignis löschen">✕</button></div>`).join('') || '<p class="sub">Noch keine Meilensteine.</p>';
}


/* ---------- Erinnerungen ---------- */
const STEP = { daily: 1, weekly: 7 };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
function remInfo(r, now = new Date()) {
  const base = new Date(`${r.date}T${r.time || '09:00'}`);
  if (isNaN(base)) return { due: null, label: 'Ungültig', cls: 'bad', done: false };
  const step = STEP[r.repeat];
  let occ = base;
  if (step && base <= now) {
    const k = Math.floor((now - base) / 864e5 / step);
    occ = addDays(base, k * step);
    while (occ > now) occ = addDays(occ, -step);
    while (addDays(occ, step) <= now) occ = addDays(occ, step);
  }
  const done = r.lastDone ? new Date(r.lastDone) : null;
  if (done && done >= occ) return { due: step ? addDays(occ, step) : occ, label: 'Erledigt', cls: 'ok', done: true, occ };
  if (occ <= now) return { due: occ, label: (now - occ) < 432e5 ? 'Fällig' : 'Überfällig', cls: (now - occ) < 432e5 ? 'warn' : 'bad', done: false, occ };
  return { due: occ, label: (occ - now) < 864e5 ? 'Bald fällig' : 'Geplant', cls: (occ - now) < 864e5 ? 'warn' : 'mute', done: false, occ };
}
const REPEAT = { once: 'Einmalig', daily: 'Täglich', weekly: 'Wöchentlich' };
function renderReminders() {
  $('remBody').innerHTML = S.reminders.map(r => {
    const i = remInfo(r);
    return `<tr><td>${esc(r.title)}</td><td class="num">${i.due ? esc(i.due.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })) : '–'}</td><td>${REPEAT[r.repeat]}</td><td><span class="chip ${i.cls}">${i.label}</span></td><td class="num"><button class="btn small" data-act="rem-done" data-id="${esc(r.id)}" type="button">${i.done ? 'Zurücksetzen' : 'Erledigt'}</button> <button class="btn small danger" data-act="del-rem" data-id="${esc(r.id)}" type="button" aria-label="Erinnerung löschen">✕</button></td></tr>`;
  }).join('') || '<tr><td colspan="5">Keine Erinnerungen.</td></tr>';
  $('notifyState').textContent = 'Notification' in window ? `Benachrichtigungen: ${({ granted: 'erlaubt', denied: 'blockiert', default: 'noch nicht erlaubt' })[Notification.permission]}` : 'Dieser Browser unterstützt keine Benachrichtigungen.';
}
function tick() {
  let changed = false;
  S.reminders.forEach(r => {
    const i = remInfo(r);
    if (!i.done && i.occ && i.occ <= new Date() && r.notified !== i.occ.toISOString()) {
      if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('Grow-Erinnerung', { body: r.title }); } catch (e) { /* ignore */ } }
      r.notified = i.occ.toISOString(); changed = true;
    }
  });
  if (changed) save();
  renderReminders();
}

/* Kalenderexport (iCalendar, RFC 5545): Erinnerungen laufen so auch bei geschlossenem Browser */
const icsEscape = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  let out = '', cur = '', n = 0, first = true;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (first ? 75 : 74)) { out += cur + '\r\n '; cur = ''; n = 0; first = false; }
    cur += ch; n += b;
  }
  return out + cur;
}
function exportIcs() {
  if (!S.reminders.length) { toast('Keine Erinnerungen vorhanden.', true); return; }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AutoPot Grow-App//DE', 'CALSCALE:GREGORIAN'];
  S.reminders.forEach(r => {
    const start = r.date.replace(/-/g, '') + 'T' + r.time.replace(':', '') + '00';
    lines.push('BEGIN:VEVENT', `UID:${r.id.replace(/[^A-Za-z0-9-]/g, '')}@autopot-grow-app`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, 'DURATION:PT15M', `SUMMARY:${icsEscape(r.title)}`);
    if (r.repeat === 'daily') lines.push('RRULE:FREQ=DAILY');
    if (r.repeat === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(r.title)}`, 'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  download('autopot-erinnerungen.ics', lines.map(icsFold).join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
  toast('Kalenderdatei exportiert. Zum Importieren in den Kalender öffnen.');
}

/* ---------- Diagnose & Checklisten ---------- */
function renderSymptoms() {
  $('symptoms').innerHTML = SYMPTOMS.map(([id, t]) => `<label class="check"><input type="checkbox" value="${id}"><span>${esc(t)}</span></label>`).join('');
}
function diagnose() {
  const sel = [...document.querySelectorAll('#symptoms input:checked')].map(x => x.value);
  if (!sel.length) { $('diagOut').innerHTML = '<div class="notice">Mindestens ein Symptom auswählen.</div>'; return; }
  const res = CAUSES.map(c => ({ c, n: c.s.filter(s => sel.includes(s)).length })).filter(r => r.n > 0).sort((a, b) => b.n - a.n);
  const e = sorted().pop();
  let extra = '';
  if (e) {
    const hints = [];
    if (e.ph != null && (e.ph < PH_RANGE[0] || e.ph > PH_RANGE[1])) hints.push(`Letzter Tank-pH ${nf(e.ph)} liegt außerhalb ${rng(PH_RANGE)}.`);
    const p = PROFILE[e.phase] || PROFILE[S.settings.phase];
    if (e.ec != null && p && (e.ec < p.ec[0] || e.ec > p.ec[1])) hints.push(`Letzter Tank-EC ${nf(e.ec)} liegt außerhalb ${rng(p.ec)}.`);
    if (hints.length) extra = `<div class="notice warn"><span><strong>Aus deinem Protokoll:</strong> ${hints.map(esc).join(' ')}</span></div>`;
  }
  $('diagOut').innerHTML = extra + res.map(r => `<div class="item"><div><strong>${esc(r.c.t)}</strong> <span class="chip mute">${r.n} Treffer</span><p>${esc(r.c.a)}</p></div></div>`).join('');
}
function renderChecks() {
  const mk = (items, state, key) => items.map((t, i) => `<label class="check"><input type="checkbox" data-check="${key}" data-i="${i}" ${state[i] ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('');
  $('setupList').innerHTML = mk(SETUP_CHECKS, S.checks.setup, 'setup');
  $('weekList').innerHTML = mk(WEEK_CHECKS, S.checks.week, 'week');
}

function renderAll() {
  renderDashboard(); renderLog(); renderGallery(); renderCharts(); renderCalc(); renderHarvest(); renderArchive(); renderLists(); renderReminders(); renderChecks(); if ($('refTable')) { renderKnowledge(); renderPower(); renderPlan(); renderStrains(); }
}

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

/* ---------- Wissen: Tipps, Richtwerte, Nährstoffe, Glossar ---------- */
const TIPS = {
  'Jungpflanze / Anwachsen': ['Die ersten Tage von oben gießen, bis die Wurzeln die AirBase-Kanäle erreichen. Erst dann das AutoPot-System übernehmen lassen (Anleitung Kap. 6).', 'Junge Pflanzen mögen hohe Luftfeuchte (65–75 %) und wenig Licht. Lieber zu wenig als zu viel PPFD.', 'Tank-EC niedrig halten (0,6–1,0). Mehr Dünger beschleunigt jetzt nichts, sondern stresst die Wurzeln.', 'Wassertemperatur 18–22 °C: Kaltes Wasser bremst die Wurzeln, warmes fördert Krankheitserreger.', 'Einmal täglich messen und eintragen – so erkennst du Trends, bevor Blätter Symptome zeigen.'],
  'Vegetation': ['Immer nur eine Sache auf einmal ändern und 2–3 Tage beobachten, sonst weißt du nicht, was gewirkt hat.', 'Steigender Wasserverbrauch ist ein gutes Zeichen: Die Wurzeln arbeiten. Plane den Tankwechsel rechtzeitig ein.', 'Trainingsmethoden wie LST jetzt anwenden – in der Blüte verzeihen Pflanzen weniger.', 'VPD 1,0–1,3 kPa: Bei zu niedrigem VPD transpiriert die Pflanze kaum und nimmt weniger Calcium auf.', 'Blattunterseiten wöchentlich mit der Lupe prüfen. Früh erkannte Schädlinge sind leicht zu stoppen.'],
  'Übergang / frühe Blüte': ['Die Pflanzen strecken sich jetzt stark – Lampenabstand und PPFD regelmäßig kontrollieren.', 'Luftfeuchte schrittweise auf 50–60 % senken, damit sich in den dichter werdenden Trieben keine Feuchtigkeit staut.', 'EC langsam anheben (1,5–1,9). Große Sprünge führen zu verbrannten Spitzen.', 'Blütebeginn im Dashboard eintragen – dann rechnet die App den voraussichtlichen Erntetermin aus.', 'Untere, beschattete Triebe ohne Licht bringen wenig Ertrag. Entlauben behutsam und in Etappen.'],
  'Hauptblüte': ['Luftfeuchte 40–55 % und gute Umluft schützen die Blüten vor Schimmel (Anleitung Kap. 9 und 16).', 'Blätter, die jetzt von unten gelb werden, sind oft normal. Kritisch wird es, wenn junge Blätter betroffen sind.', 'Nachts nicht zu kalt werden lassen: Große Tag-Nacht-Unterschiede erhöhen die Kondensgefahr.', 'Tank-pH 5,8–6,2 konsequent halten – ein abgedrifteter pH ist die häufigste Ursache scheinbarer Mängel.', 'Fotos alle paar Tage machen: In der Galerie siehst du die Entwicklung der Blüten im Zeitraffer.'],
  'Endphase': ['EC schrittweise senken, nicht abrupt auf reines Wasser wechseln (Anleitung Kap. 7).', 'Reife an den Trichomen mit einer Lupe beurteilen, nicht nur am Kalender.', 'Klima wie in der späten Blüte halten: rF 40–55 %, gute Umluft, keine Nässe.', 'Erntedatum und Gewichte im Bereich „Ernte“ eintragen – so vergleichst du deine Grows im Archiv.', 'Nach der Ernte: Grow abschließen, Backup behalten, System gründlich reinigen.']
};
const NUTRIENTS = [
  { n: 'Stickstoff (N)', mob: true, sym: 'Gleichmäßige Aufhellung bis Gelbfärbung, beginnt an den älteren, unteren Blättern; Wachstum verlangsamt.', cause: 'EC zu niedrig, pH außerhalb des Zielbereichs. In der späten Blüte ist leichtes Vergilben unten normal.' },
  { n: 'Phosphor (P)', mob: true, sym: 'Dunkle, matte Blätter, teils bläulich-violette Töne, langsames Wachstum; ältere Blätter zuerst.', cause: 'Kalte Wurzelzone, pH-Problem. Rötliche Stiele allein sind oft sortenbedingt und kein Mangel.' },
  { n: 'Kalium (K)', mob: true, sym: 'Braune, wie verbrannt wirkende Blattränder und -spitzen an älteren und mittleren Blättern.', cause: 'Unterversorgung in der Blüte oder Konkurrenz durch zu viel Calcium/Magnesium.' },
  { n: 'Magnesium (Mg)', mob: true, sym: 'Gelbe Bereiche zwischen grün bleibenden Blattadern (Interkostalchlorose) an älteren und mittleren Blättern.', cause: 'Coco nicht gepuffert, sehr weiches Wasser oder Osmosewasser ohne CalMag, pH zu niedrig.' },
  { n: 'Calcium (Ca)', mob: false, sym: 'Braune, rostartige Flecken, verkrüppelte oder gewellte neue Blätter, schwache Triebspitzen.', cause: 'Coco bindet Calcium, weiches Wasser, zu niedriger VPD (wenig Transpiration), pH-Abweichung.' },
  { n: 'Schwefel (S)', mob: false, sym: 'Gleichmäßige Aufhellung der jungen Blätter (ähnlich Stickstoffmangel, aber oben).', cause: 'Selten bei Komplettdünger; meist pH-bedingt.' },
  { n: 'Eisen (Fe)', mob: false, sym: 'Neue Blätter hellgelb bis fast weiß, Adern bleiben grün.', cause: 'pH zu hoch, kalte oder zu nasse Wurzelzone – selten echter Eisenmangel.' },
  { n: 'Mangan (Mn)', mob: false, sym: 'Interkostalchlorose mit kleinen braunen Flecken an jungen und mittleren Blättern.', cause: 'pH zu hoch.' },
  { n: 'Zink (Zn)', mob: false, sym: 'Kleine, schmale, verdrehte neue Blätter, sehr kurze Abstände zwischen den Blattpaaren.', cause: 'pH zu hoch, Überschuss an Phosphor.' },
  { n: 'Bor (B)', mob: false, sym: 'Verdickte, verkrüppelte Triebspitzen, abgestorbene Wachstumspunkte.', cause: 'Sehr trockene Luft, pH-Abweichung; selten.' }
];
const GLOSSARY = [
  ['EC', 'Elektrische Leitfähigkeit der Nährlösung in mS/cm – Maß für die Salz- bzw. Düngerkonzentration. Leitungswasser hat bereits einen Grund-EC.'],
  ['PPM', 'Andere Darstellung des EC. Hängt von der Skala des Messgeräts ab (500, 640 oder 700) – deshalb rechnet die Anleitung in EC.'],
  ['pH', 'Säuregrad der Lösung. In Coco 5,8–6,2: In diesem Bereich sind alle Nährstoffe gut verfügbar.'],
  ['VPD', 'Dampfdruckdefizit in kPa: wie stark die Luft der Pflanze Wasser „entzieht“. Ergibt sich aus Temperatur und Luftfeuchte.'],
  ['PPFD', 'Photosynthetisch aktive Lichtmenge, die pro Sekunde auf einen Quadratmeter trifft (µmol/m²/s). Messung mit PAR-Meter.'],
  ['DLI', 'Tageslichtsumme (mol/m²/Tag) = PPFD × Lichtstunden × 0,0036. Zeigt, wie viel Licht pro Tag ankommt.'],
  ['Interkostalchlorose', 'Gelbfärbung zwischen den Blattadern, während die Adern grün bleiben – typisch für Mg-, Fe- oder Mn-Probleme.'],
  ['Mobil / immobil', 'Mobile Nährstoffe kann die Pflanze aus alten Blättern umlagern – Mängel zeigen sich unten. Immobile bleiben, wo sie sind – Mängel zeigen sich oben.'],
  ['Lockout', 'Nährstoffe sind vorhanden, aber nicht aufnehmbar, meist wegen falschem pH oder Salzaufbau.'],
  ['CalMag', 'Calcium-Magnesium-Zusatz. In Coco und bei weichem Wasser oft nötig, weil Coco Calcium bindet.'],
  ['Puffern (Coco)', 'Vorbehandlung von Coco mit Ca/Mg-Lösung, damit es später keine Nährstoffe aus der Lösung bindet (Anleitung Kap. 3).'],
  ['AquaValve', 'Ventil des AutoPot-Systems: lässt Wasser in das Tray, sobald es leer ist, und schließt bei etwa 1–2 cm Wasserstand.'],
  ['AirDome / AirBase', 'Bauteile für zusätzliche Luft an den Wurzeln: Die AirBase-Kanäle unter dem Topf, der AirDome versorgt den Boden mit Luft.'],
  ['Trockengewicht', 'Gewicht nach dem Trocknen. Der Trocknungsverlust gegenüber dem Nassgewicht liegt meist bei 70–80 %.']
];
function dayOfYear() { const d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5); }
function renderTip() {
  const list = TIPS[S.settings.phase] || TIPS.Vegetation;
  $('tipBox').innerHTML = `<div class="notice tip"><span>💡 <strong>Tipp für die Phase ${esc(S.settings.phase)}:</strong> ${esc(list[dayOfYear() % list.length])}</span></div>`;
}
function renderKnowledge() {
  const rows = PHASES.map(p => {
    const r = PROFILE[p];
    return `<tr${p === S.settings.phase ? ' class="now"' : ''}><th>${esc(p)}</th><td>${rng(r.ec)}</td><td>${rng(PH_RANGE)}</td><td>${rng(r.vpd)} kPa</td><td>${r.temp[0]}–${r.temp[1]} °C</td><td>${r.rh[0]}–${r.rh[1]} %</td><td>${r.ppfd ? `${r.ppfd[0]}–${r.ppfd[1]}` : 'keine feste Vorgabe'}</td></tr>`;
  }).join('');
  $('refTable').innerHTML = `<thead><tr><th>Phase</th><th>Tank-EC</th><th>pH</th><th>VPD</th><th>Luft</th><th>rF</th><th>PPFD</th></tr></thead><tbody>${rows}</tbody>`;
  const q = ($('nutriSearch').value || '').trim().toLowerCase();
  const list = NUTRIENTS.filter(x => !q || `${x.n} ${x.sym} ${x.cause}`.toLowerCase().includes(q));
  $('nutriList').innerHTML = list.map(x => `<div class="card nutri"><h3>${esc(x.n)} <span class="chip ${x.mob ? 'mute' : 'warn'}">${x.mob ? 'mobil – unten zuerst' : 'immobil – oben zuerst'}</span></h3><p><strong>Anzeichen:</strong> ${esc(x.sym)}</p><p class="sub"><strong>Häufige Ursache:</strong> ${esc(x.cause)}</p></div>`).join('') || '<p class="sub">Kein Treffer.</p>';
  $('glossar').innerHTML = GLOSSARY.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('');
}

/* ---------- Wochenbericht ---------- */
function renderWeekly() {
  const win = (a, b) => S.entries.filter(e => { const d = daysAgo(e.date); return d >= a && d <= b; });
  const cur = win(0, 6), prev = win(7, 13);
  if (!cur.length) { $('weekly').innerHTML = '<p class="sub" style="margin:0">In den letzten 7 Tagen gibt es noch keine Messwerte.</p>'; return; }
  const avg = (list, fn) => { const v = list.map(fn).filter(x => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const M = [['EC', e => e.ec, 2, ''], ['pH', e => e.ph, 2, ''], ['VPD', vpdOf, 2, ' kPa'], ['Lufttemperatur', e => e.airTemp, 1, ' °C'], ['Luftfeuchte', e => e.humidity, 0, ' %'], ['Wassertemperatur', e => e.waterTemp, 1, ' °C'], ['Verbrauch', e => e.use, 1, ' L/Tag']];
  const rows = M.map(([label, fn, d, u]) => {
    const a = avg(cur, fn), b = avg(prev, fn);
    if (a == null) return '';
    let trend = '<span class="sub">–</span>';
    if (b != null) { const diff = a - b, eps = Math.pow(10, -d) / 2; trend = Math.abs(diff) < eps ? '<span class="tr-eq">▶ gleich</span>' : `<span class="${diff > 0 ? 'tr-up' : 'tr-down'}">${diff > 0 ? '▲' : '▼'} ${nf(Math.abs(diff), d)}</span>`; }
    const f = v => (label === 'pH' ? fmtPh(v) : nf(v, d)) + u;
    return `<tr><th>${label}</th><td>${f(a)}</td><td>${b == null ? '–' : f(b)}</td><td>${trend}</td></tr>`;
  }).join('');
  const maxH = list => { const v = list.map(e => e.height).filter(x => x != null); return v.length ? Math.max(...v) : null; };
  const h1 = maxH(cur), h0 = maxH(prev);
  let ok = 0, n = 0;
  cur.forEach(e => { const p = phaseProfile(e); [[e.ph, PH_RANGE], [e.ec, p.ec], [vpdOf(e), p.vpd], [e.airTemp, p.temp], [e.humidity, p.rh]].forEach(([v, r]) => { if (v == null || !r) return; n++; if (v >= r[0] && v <= r[1]) ok++; }); });
  $('weekly').innerHTML = `<p class="sub" style="margin:0 0 8px">${cur.length} ${cur.length === 1 ? 'Eintrag' : 'Einträge'} in den letzten 7 Tagen${n ? ` · ${Math.round(ok / n * 100)} % der Werte im Ziel` : ''}${h1 != null && h0 != null ? ` · Zuwachs ${nf(h1 - h0, 1)} cm` : ''}</p><div class="table-wrap"><table class="mini"><thead><tr><th>Ø Wert</th><th>Diese Woche</th><th>Vorwoche</th><th>Trend</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- Ernteprognose ---------- */
function flowerInfo() {
  const s = S.settings;
  if (!s.flowerStart) return null;
  const days = Math.max(0, dayDiff(s.flowerStart, todayStr()));
  const end = new Date(s.flowerStart + 'T12:00:00'); end.setDate(end.getDate() + s.flowerWeeks * 7);
  const left = dayDiff(todayStr(), isoOf(end));
  return { week: Math.floor(days / 7) + 1, weeks: s.flowerWeeks, harvest: isoOf(end), left };
}

/* ---------- Letzte Werte, Stromkosten ---------- */
function fillLast() {
  const e = sorted().pop();
  if (!e) { toast('Es gibt noch keinen Eintrag zum Übernehmen.', true); return; }
  [['fEc', e.ec], ['fPh', e.ph], ['fWater', e.waterTemp], ['fAir', e.airTemp], ['fRh', e.humidity], ['fPpfd', e.ppfd], ['fUse', e.use], ['fHeight', e.height]].forEach(([id, v]) => { if (v != null) $(id).value = v; });
  toast(`Werte vom ${fmtDate(e.date)} übernommen – bitte vor dem Speichern prüfen.`);
}
function renderPower() {
  if (!$('pwHours').dataset.touched) $('pwHours').value = S.settings.lightHours;
  const w = num($('pwWatt').value) || 0, h = num($('pwHours').value) || 0, extra = num($('pwExtra').value) || 0, price = num($('pwPrice').value) || 0;
  if (h < 0 || h > 24) { $('pwOut').textContent = 'Lichtstunden zwischen 0 und 24 angeben.'; return; }
  const kwh = (w * h + extra * 24) / 1000, day = kwh * price;
  const fi = flowerInfo(), gi = growInfo();
  const eur = v => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  $('pwOut').innerHTML = `<strong>${nf(kwh, 2)} kWh</strong> pro Tag · <strong>${eur(day)}</strong> pro Tag<br>${eur(day * 7)} pro Woche · ${eur(day * 30)} pro Monat${gi ? `<br>Bisher (${gi.day} Tage, grob): ${eur(day * gi.day)}` : ''}${fi && fi.left > 0 ? `<br>Bis zur Ernte (${fi.left} Tage): ${eur(day * fi.left)}` : ''}`;
  try { localStorage.setItem('autopot-power', JSON.stringify({ w, extra, price })); } catch (e) { /* ignore */ }
}

/* ---------- Verschlüsseltes Backup (Web Crypto: PBKDF2-SHA-256 + AES-256-GCM) ---------- */
const ENC_FORMAT = 'autopot-encrypted-backup';
const b64enc = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pbkdfKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptText(text, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 600000;
  const key = await pbkdfKey(pw, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(ENC_FORMAT + ':1') }, key, new TextEncoder().encode(text)));
  return JSON.stringify({ format: ENC_FORMAT, v: 1, kdf: 'PBKDF2-SHA256', iterations: iter, cipher: 'AES-256-GCM', salt: b64enc(salt), iv: b64enc(iv), data: b64enc(ct) });
}
async function decryptText(obj, pw) {
  const iter = Number(obj.iterations);
  if (obj.v !== 1 || !(iter >= 100000 && iter <= 10000000)) throw new Error('Unbekanntes Format');
  const key = await pbkdfKey(pw, b64dec(obj.salt), iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(obj.iv), additionalData: new TextEncoder().encode(ENC_FORMAT + ':1') }, key, b64dec(obj.data));
  return new TextDecoder().decode(pt);
}
let pwAskResolve = null;
function askPassword(title, hint) {
  $('pwAskTitle').textContent = title; $('pwAskHint').textContent = hint || ''; $('pwAskInput').value = '';
  openDlg('pwAsk'); setTimeout(() => $('pwAskInput').focus(), 30);
  return new Promise(res => { pwAskResolve = res; });
}
function finishAsk(v) { const r = pwAskResolve; pwAskResolve = null; closeDlg('pwAsk'); if (r) r(v); }

/* ---------- Passwortstärke ---------- */
function pwScore(pw) {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  if (/(.)\1{2,}/.test(pw)) bits -= 10;
  if (/^[a-zA-ZäöüÄÖÜß]+$|^\d+$/.test(pw)) bits -= 10;
  if (/(passwort|password|qwert|asdf|1234|abcd|grow|autopot|hallo)/i.test(pw)) bits -= 20;
  if (pw.length < 10) return 1;
  return bits < 45 ? 1 : bits < 60 ? 2 : bits < 75 ? 3 : 4;
}
const PW_LABEL = ['', 'schwach', 'mittel', 'gut', 'stark'];
function bindPwMeters() {
  document.querySelectorAll('[data-pwmeter]').forEach(m => {
    const inp = $(m.dataset.pwmeter);
    const upd = () => { const s = pwScore(inp.value); m.dataset.score = s; m.querySelector('span').textContent = inp.value ? `Passwortstärke: ${PW_LABEL[s]}` : ''; };
    inp.addEventListener('input', upd); upd();
  });
}

/* ---------- Sorten, Fahrplan, Heute, News, Teilen, Klimadaten, Vergleich ---------- */
const STRAIN_TYPES = { photo: 'Photoperiodisch', auto: 'Autoflower', unknown: 'unbekannt' };
const activeStrain = () => S.strains.find(x => x.id === S.settings.strainId) || null;
function renderStrains() {
  const cur = S.settings.strainId;
  $('strainList').innerHTML = S.strains.map(x => `<div class="item${x.id === cur ? ' current' : ''}"><div><strong>${esc(x.name)}</strong> <span class="chip mute">${esc(STRAIN_TYPES[x.type] || 'unbekannt')}</span>${x.id === cur ? ' <span class="chip ok">aktueller Grow</span>' : ''}<p class="meta">${x.breeder ? esc(x.breeder) + ' · ' : ''}Blüte ${x.flowerWeeks} Wochen</p>${x.notes ? `<p>${esc(x.notes)}</p>` : ''}</div><div class="rowact"><button class="btn small" data-act="strain-use" data-id="${esc(x.id)}" type="button"${x.id === cur ? ' disabled' : ''}>Für aktuellen Grow</button><button class="btn small danger" data-act="del-strain" data-id="${esc(x.id)}" type="button" aria-label="Sorte löschen">✕</button></div></div>`).join('') || '<p class="sub">Noch keine Sorten. Lege deine Sorten mit Blütedauer an – die App übernimmt sie für Ernteprognose und Fahrplan.</p>';
}
function saveStrain() {
  const name = $('stName').value.trim();
  if (!name) { toast('Bitte einen Sortennamen eingeben.', true); return; }
  const w = num($('stWeeks').value);
  if (w == null || w < 4 || w > 20) { toast('Blütedauer bitte zwischen 4 und 20 Wochen angeben.', true); return; }
  S.strains.push({ id: uid(), name: name.slice(0, 60), breeder: $('stBreeder').value.trim().slice(0, 60), type: $('stType').value, flowerWeeks: Math.round(w), notes: $('stNotes').value.trim().slice(0, 300) });
  ['stName', 'stBreeder', 'stNotes'].forEach(id => { $(id).value = ''; });
  save(); renderStrains(); toast('Sorte gespeichert.');
}
function useStrain(id) {
  const x = S.strains.find(s => s.id === id);
  if (!x) return;
  S.settings.strainId = x.id; S.settings.flowerWeeks = x.flowerWeeks;
  if (x.type === 'auto') S.settings.lightHours = Math.max(S.settings.lightHours, 18);
  save(); loadSettings(); renderAll();
  toast(`„${x.name}“ ist jetzt die Sorte des aktuellen Grows (Blüte ${x.flowerWeeks} Wochen${x.type === 'auto' ? ', Autoflower: Licht bleibt bei 18 h+' : ''}).`);
}

/* Fahrplan: Woche für Woche mit Zielwerten aus der Anleitung */
function buildPlan() {
  const s = S.settings, es = sorted(), start = s.startDate || (es[0] && es[0].date);
  if (!start) return null;
  const st = activeStrain(), auto = !!(st && st.type === 'auto');
  const addD = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
  const fw = s.flowerWeeks;
  const flowerStart = s.flowerStart || addD(start, (auto ? 3 : 6) * 7);
  const weeks = Math.min(40, Math.ceil((dayDiff(start, flowerStart) + fw * 7) / 7));
  const today = todayStr(), rows = [];
  for (let w = 0; w < weeks; w++) {
    const from = addD(start, w * 7), to = addD(start, w * 7 + 6), into = dayDiff(flowerStart, from);
    const phase = w < 2 ? PHASES[0] : into < 0 ? 'Vegetation' : into < 14 ? PHASES[2] : into < (fw - 1) * 7 ? 'Hauptblüte' : 'Endphase';
    const now = today >= from && today <= to, ref = now ? dayDiff(flowerStart, today) : into; /* aktuelle Woche: Blütewoche ab heute gerechnet, passend zur Prognose oben */
    rows.push({ w: w + 1, from, to, phase, light: auto ? 18 : (into >= 0 || (now && ref >= 0) ? 12 : 18), now, fweek: ref >= 0 ? Math.floor(ref / 7) + 1 : null });
  }
  return { rows, estimated: !s.flowerStart, harvest: addD(flowerStart, fw * 7), auto, flowerStart };
}
function renderPlan() {
  const p = buildPlan();
  if (!p) { $('planBody').innerHTML = '<tr><td colspan="9">Startdatum im Bereich „Aktueller Grow“ eintragen – dann entsteht hier dein Fahrplan.</td></tr>'; $('planNote').textContent = ''; return; }
  $('planBody').innerHTML = p.rows.map(r => {
    const pr = PROFILE[r.phase];
    return `<tr${r.now ? ' class="now" aria-current="date"' : ''}><td class="num">${r.w}${r.now ? ' ◀' : ''}</td><td class="num">${esc(fmtDate(r.from).slice(0, 6))}–${esc(fmtDate(r.to).slice(0, 6))}</td><td>${esc(r.phase)}${r.fweek ? ` <span class="sub">(Blüte W${r.fweek})</span>` : ''}</td><td class="num">${r.light} h</td><td class="num">${r.phase === 'Endphase' ? 'absenken' : rng(pr.ec)}</td><td class="num">${rng(pr.vpd)}</td><td class="num">${pr.temp[0]}–${pr.temp[1]} °C</td><td class="num">${pr.rh[0]}–${pr.rh[1]} %</td><td class="num">${pr.ppfd ? pr.ppfd[0] + '–' + pr.ppfd[1] : '–'}</td></tr>`;
  }).join('');
  const st = activeStrain();
  $('planNote').textContent = `${st ? `Sorte: ${st.name} (${STRAIN_TYPES[st.type]}). ` : ''}Blütedauer ${S.settings.flowerWeeks} Wochen · voraussichtliche Ernte ab ${fmtDate(p.harvest)}.${p.estimated ? ` Blütebeginn noch nicht eingetragen – angenommen ab ${fmtDate(p.flowerStart)} (${p.auto ? 'Autoflower: ca. Woche 4' : '2 Wochen Jungpflanze + 4 Wochen Vegetation'}).` : ''} Richtwerte aus der Anleitung (Kap. 7, 9, 10) – Orientierung, keine Vorgabe.`;
}

/* „Heute“: was steht an? */
function renderToday() {
  const t = todayStr(), items = [];
  items.push(S.entries.some(e => e.date === t) ? ['ok', '✅ Heute schon gemessen'] : ['warn', '📝 Heute noch keine Messung', '#log']);
  S.reminders.forEach(r => { const i = remInfo(r); if (!i.done && i.due && isoOf(i.due) <= t) items.push(['warn', `⏰ ${r.title}`, '#reminders']); });
  const td = tankDays();
  if (td != null && td <= 3) items.push(['warn', `💧 Tank reicht nur noch etwa ${td} Tag(e)`]);
  const tc = S.settings.lastTankChange;
  if (tc && daysAgo(tc) >= S.settings.tankInterval) items.push(['warn', '🔄 Tankwechsel ist fällig']);
  const p = buildPlan(), cur = p && p.rows.find(r => r.now);
  if (cur) {
    items.push(['', `📅 Fahrplan Woche ${cur.w}: ${cur.phase}${cur.fweek ? ` (Blütewoche ${cur.fweek})` : ''}, ${cur.light} h Licht`, '#plan']);
    if (cur.phase !== S.settings.phase && !p.estimated) items.push(['warn', `Laut Fahrplan wäre jetzt „${cur.phase}“ – Phase im Bereich „Aktueller Grow“ anpassen?`]);
  }
  if (!S.settings.lastBackup || Date.now() - Date.parse(S.settings.lastBackup) > 14 * 864e5) if (!CLOUD.user) items.push(['warn', '💾 Backup älter als 14 Tage']);
  $('todayList').innerHTML = items.map(([c, txt, href]) => `<li class="${c}">${href ? `<a href="${href}">${esc(txt)}</a>` : esc(txt)}</li>`).join('');
}

/* News-Vorschau, Ankündigung, Team-Knopf */
async function loadNewsTeaser(cfg) {
  const ann = cfg && cfg.announcement ? String(cfg.announcement) : '';
  const annKey = 'autopot-ann-' + cloudPhotoId(ann).slice(1);
  let dismissed = false; try { dismissed = !!localStorage.getItem(annKey); } catch (e) { /* ignore */ }
  $('announceBox').innerHTML = ann && !dismissed ? `<div class="notice announce"><span>📢 ${esc(ann)}</span><button class="btn small" data-act="ann-close" data-key="${esc(annKey)}" type="button" aria-label="Ankündigung ausblenden">✕</button></div>` : '';
  const r = await cloudApi('GET', '/api/news?limit=3');
  if (!r.ok || !r.data || !Array.isArray(r.data.items)) return;
  let seen = 0; try { seen = Number(localStorage.getItem('autopot-news-seen')) || 0; } catch (e) { /* ignore */ }
  const items = r.data.items, unread = items.filter(n => n.id > seen).length;
  $('newsLink').classList.remove('hidden');
  $('newsDot').textContent = unread; $('newsDot').classList.toggle('hidden', !unread);
  const plain = s => (window.NewsFmt ? window.NewsFmt.plain(s, 140) : String(s).slice(0, 140));
  $('newsBox').innerHTML = items.length ? `<div class="panel" style="background:var(--glass)"><div class="head" style="margin-bottom:6px"><h3 style="margin:0">📰 Neuigkeiten</h3><a class="btn small" href="news.html">Alle News</a></div>${items.map(n => `<a class="newsitem" href="news.html#post-${n.id}"><strong>${esc(n.title)}</strong>${n.id > seen ? ' <span class="chip ok">neu</span>' : ''}${n.pinned ? ' 📌' : ''}<span class="sub">${esc(new Date(n.publishedAt).toLocaleDateString('de-DE'))} · ${esc(plain(n.body))}</span></a>`).join('')}</div>` : '';
}
function setRole(role) { CLOUD.role = role || 'user'; $('teamBtn').classList.toggle('hidden', !['moderator', 'admin'].includes(CLOUD.role)); }

/* Grow teilen */
async function openShare() {
  if (!CLOUD.available) { toast('Teilen geht nur, wenn die App über den AutoPot-Server läuft.', true); return; }
  if (!CLOUD.user) { toast('Zum Teilen bitte zuerst anmelden.', true); renderAccount(); openDlg('accountDlg'); return; }
  $('shTitle').value = (S.settings.name || 'Mein Grow').slice(0, 80); $('shResult').innerHTML = '';
  openDlg('shareDlg'); loadMyShares();
}
async function loadMyShares() {
  const r = await cloudApi('GET', '/api/shares/mine');
  if (!r.ok) { $('shList').innerHTML = ''; return; }
  $('shList').innerHTML = r.data.shares.map(x => `<div class="item"><div><strong>${esc(x.title)}</strong>${x.hidden ? ' <span class="chip bad">vom Team entfernt</span>' : ''}<p class="meta">${esc(new Date(x.createdAt).toLocaleDateString('de-DE'))} · ${x.views} Aufrufe · ${Math.round(x.bytes / 1024)} KB</p></div><div class="rowact">${x.hidden ? '' : `<a class="btn small" href="share.html#${esc(x.token)}" target="_blank" rel="noopener">Öffnen</a><button class="btn small" data-act="share-copy" data-id="${esc(x.token)}" type="button">Link kopieren</button>`}<button class="btn small danger" data-act="share-del" data-id="${esc(x.token)}" type="button">Nicht mehr teilen</button></div></div>`).join('') || '<p class="sub">Du teilst derzeit keinen Grow.</p>';
}
const shareUrl = token => `${location.origin}/share.html#${token}`;
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Link kopiert.'); } catch (e) { toast('Kopieren nicht möglich – bitte den Link markieren.', true); } }
async function createShare() {
  if (!$('shConsent').checked) { toast('Bitte bestätigen, dass der Grow öffentlich sichtbar sein darf.', true); return; }
  const st = activeStrain(), es = sorted();
  const photos = $('shPhotos').checked ? es.filter(e => photoCache.has(e.id)).slice(-12).map(e => ({ date: e.date, data: photoCache.get(e.id) })) : [];
  const body = {
    title: $('shTitle').value.trim() || 'Mein Grow', includeNotes: $('shNotes').checked, photos, harvest: S.harvest,
    grow: { name: S.settings.name, strain: st ? st.name : '', breeder: st ? st.breeder : '', type: st ? STRAIN_TYPES[st.type] : '', start: S.settings.startDate || (es[0] && es[0].date) || null, phase: S.settings.phase, flowerStart: S.settings.flowerStart, flowerWeeks: S.settings.flowerWeeks, lightHours: S.settings.lightHours },
    entries: es.map(e => ({ date: e.date, phase: e.phase, ec: e.ec, ph: e.ph, waterTemp: e.waterTemp, airTemp: e.airTemp, humidity: e.humidity, ppfd: e.ppfd, use: e.use, height: e.height, note: e.note }))
  };
  $('shCreate').disabled = true;
  const r = await cloudApi('POST', '/api/shares', body);
  $('shCreate').disabled = false;
  if (!r.ok) { toast((r.data && r.data.message) || 'Teilen fehlgeschlagen.', true); return; }
  const url = shareUrl(r.data.token);
  $('shResult').innerHTML = `<div class="notice ok"><span>Dein Grow ist jetzt unter diesem Link sichtbar:</span></div><input class="sharelink" id="shLink" readonly value="${esc(url)}" aria-label="Link zum geteilten Grow"><div class="row"><button class="btn primary small" data-act="share-copy" data-id="${esc(r.data.token)}" type="button">Link kopieren</button><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">Öffnen</a></div>`;
  loadMyShares();
}

/* Klimadaten aus Hygrometer-CSV (z. B. Govee, Inkbird, SensorPush): Tagesmittel übernehmen */
function parseStamp(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
  if (/^\d{10}(\d{3})?$/.test(s)) { const n = Number(s); return isoOf(new Date(s.length === 10 ? n * 1000 : n)); }
  return null;
}
function parseClimateCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0].map(h => h.toLowerCase());
  const ti = head.findIndex(h => /zeit|time|datum|date|timestamp/.test(h));
  const te = head.findIndex(h => /temp/.test(h) && !/tau|dew|punkt/.test(h));
  const hu = head.findIndex(h => /feucht|humid|\brh\b|\brf\b/.test(h));
  if (ti < 0 || te < 0 || hu < 0) return null;
  const fahr = /°f|fahrenheit|\(f\)|_f\b/.test(head[te]);
  const days = new Map();
  rows.slice(1).forEach(r => {
    const d = parseStamp(r[ti]), t = num(r[te]), h = num(r[hu]);
    if (!d || t == null || h == null || h < 0 || h > 100) return;
    const c = fahr ? (t - 32) * 5 / 9 : t;
    if (c < -20 || c > 60) return;
    const g = days.get(d) || { t: [], h: [] }; g.t.push(c); g.h.push(h); days.set(d, g);
  });
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  return [...days.entries()].sort().map(([date, g]) => ({ date, t: avg(g.t), tmin: Math.min(...g.t), tmax: Math.max(...g.t), h: avg(g.h), hmin: Math.min(...g.h), hmax: Math.max(...g.h), n: g.t.length }));
}
function importClimate(file) {
  const rd = new FileReader();
  rd.onerror = () => toast('Datei konnte nicht gelesen werden.', true);
  rd.onload = () => {
    const days = parseClimateCsv(String(rd.result));
    if (days === null) { toast('Keine passenden Spalten gefunden (Zeit, Temperatur, Luftfeuchte).', true); return; }
    if (!days.length) { toast('Keine gültigen Messwerte in der Datei.', true); return; }
    let added = 0, updated = 0;
    days.forEach(d => {
      const t = Math.round(d.t * 10) / 10, h = Math.round(d.h);
      const sum = `Hygrometer: ${d.n} Werte, ${nf(d.tmin, 1)}–${nf(d.tmax, 1)} °C, ${nf(d.hmin, 0)}–${nf(d.hmax, 0)} % rF`;
      const e = S.entries.find(x => x.date === d.date);
      if (e) {
        let ch = false;
        if (e.airTemp == null) { e.airTemp = t; ch = true; }
        if (e.humidity == null) { e.humidity = h; ch = true; }
        if (ch) { updated++; if (!e.note.includes('Hygrometer:')) e.note = (e.note ? e.note + ' · ' : '') + sum; }
      } else {
        const n = normEntry({ id: uid(), date: d.date, phase: S.settings.phase, airTemp: t, humidity: h, tags: 'Sensor', note: sum });
        if (n) { S.entries.push(n); added++; }
      }
    });
    S.settings.entriesSinceBackup = (S.settings.entriesSinceBackup || 0) + added;
    if (save()) { renderAll(); toast(`Klimadaten übernommen: ${added} neue Tage, ${updated} Einträge ergänzt (vorhandene Werte bleiben unverändert).`); }
  };
  rd.readAsText(file);
}

/* Vorher/Nachher-Vergleich in der Galerie */
const CMP = { on: false, ids: [] };
function toggleCompare(on) {
  CMP.on = on; CMP.ids = [];
  $('cmpBtn').textContent = on ? '✕ Vergleich abbrechen' : '↔ Vorher/Nachher';
  $('cmpHint').classList.toggle('hidden', !on);
  document.querySelectorAll('#galleryGrid .gthumb').forEach(b => b.classList.remove('sel'));
}
function pickCompare(id) {
  const i = CMP.ids.indexOf(id);
  if (i >= 0) CMP.ids.splice(i, 1); else CMP.ids.push(id);
  document.querySelectorAll('#galleryGrid .gthumb').forEach(b => b.classList.toggle('sel', CMP.ids.includes(b.dataset.id)));
  if (CMP.ids.length === 2) {
    const [a, b] = CMP.ids.map(x => S.entries.find(e => e.id === x)).sort((x, y) => x.date.localeCompare(y.date));
    $('cmpA').src = photoCache.get(a.id); $('cmpB').src = photoCache.get(b.id);
    $('cmpCapA').textContent = `Vorher: ${fmtDate(a.date)}`; $('cmpCapB').textContent = `Nachher: ${fmtDate(b.date)} (+${dayDiff(a.date, b.date)} Tage)`;
    $('cmpRange').value = 50; $('cmpB').style.clipPath = 'inset(0 0 0 50%)';
    toggleCompare(false); openDlg('cmpDlg');
  }
}

/* ---------- Cloud-Konto & Synchronisation ---------- */
const CLOUD = { available: false, user: null, status: 'off', last: null, busy: false, again: false, dirty: false, applying: false, timer: null };
const SYNC_KEY = 'autopot-sync';
const readSync = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } };
const writeSync = o => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
const PHOTO_ID_OK = id => /^[A-Za-z0-9_-]{1,40}$/.test(id);
/* Ältere importierte Einträge können IDs mit Sonderzeichen haben – für die Cloud wird daraus eine stabile, gültige ID */
function cloudPhotoId(id) {
  if (PHOTO_ID_OK(id)) return id;
  let h = 0x811c9dc5; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'x' + h.toString(36) + id.length.toString(36);
}

async function cloudApi(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'autopot' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) { return { ok: false, status: 0, data: null }; }
  let data = null; try { data = await res.json(); } catch (e) { /* kein JSON */ }
  if (res.status === 401 && CLOUD.user && !/\/api\/(login|recover|password|account|2fa\/\w+)$/.test(url)) {
    CLOUD.user = null; setSyncStatus('expired'); toast('Sitzung abgelaufen. Bitte im Konto-Dialog neu anmelden.', true); renderAccount();
  }
  return { ok: res.ok, status: res.status, data };
}
const STATUS_TEXT = { off: 'Nicht angemeldet – Daten nur auf diesem Gerät', ok: 'Synchronisiert', syncing: 'Synchronisiere …', offline: 'Offline – Änderungen werden später übertragen', error: 'Synchronisierung fehlgeschlagen', expired: 'Sitzung abgelaufen – bitte neu anmelden' };
function setSyncStatus(s) {
  CLOUD.status = s;
  document.querySelectorAll('.sync-dot').forEach(dot => { dot.className = 'sync-dot ' + s; dot.title = STATUS_TEXT[s] || ''; });
  const t = $('syncText');
  if (t) t.textContent = (STATUS_TEXT[s] || '') + (s === 'ok' && CLOUD.last ? ` (${CLOUD.last.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr)` : '');
}

/* Zwei Stände zusammenführen: Einträge, Rezepte, Ereignisse usw. werden vereinigt, bei Konflikten gewinnt der bevorzugte Stand */
function mergeStates(preferred, other) {
  const out = normalize(JSON.parse(ser(preferred)));
  const o = normalize(JSON.parse(ser(other)));
  const ids = new Set(out.entries.map(e => e.id)), keys = new Set(out.entries.map(entryKey));
  o.entries.forEach(e => { if (!ids.has(e.id) && !keys.has(entryKey(e))) { out.entries.push(e); ids.add(e.id); keys.add(entryKey(e)); } });
  ['recipes', 'events', 'reminders', 'archive', 'strains'].forEach(k => {
    const have = new Set(out[k].map(x => x.id));
    o[k].forEach(x => { if (!have.has(x.id)) out[k].push(x); });
  });
  ['setup', 'week'].forEach(k => Object.keys(o.checks[k]).forEach(i => { out.checks[k][i] = true; }));
  /* Löschungen beider Seiten zusammenführen und anwenden – so tauchen gelöschte Einträge nicht wieder auf */
  Object.keys(out.deleted).forEach(k => {
    Object.entries(o.deleted[k]).forEach(([id, t]) => { if (!(out.deleted[k][id] >= t)) out.deleted[k][id] = t; });
    out[k] = out[k].filter(x => !out.deleted[k][x.id]);
  });
  return out;
}
const hasLocalData = () => S.entries.length || S.strains.length || S.recipes.length || S.events.length || S.settings.name || S.archive.length;
function applyState(next) {
  CLOUD.applying = true;
  try { S = next; save(); } finally { CLOUD.applying = false; }
  loadSettings(); if (!editingId) resetForm(true); renderAll();
}

async function cloudPull(initial) {
  const r = await cloudApi('GET', '/api/state');
  if (r.status === 0) { setSyncStatus('offline'); return false; }
  if (!r.ok) { setSyncStatus('error'); return false; }
  const meta = readSync();
  if (r.data.data == null) { writeSync(Object.assign(meta, { version: 0 })); return true; }  /* Server leer: lokal hochladen */
  const remote = normalize(r.data.data);
  if (r.data.version === meta.version && !initial) return true;
  if (initial && meta.version === r.data.version && !CLOUD.dirty) return true;
  let next;
  if (!hasLocalData() && !CLOUD.dirty) next = remote;
  else if (initial && !meta.version) { next = mergeStates(S, remote); toast('Lokale Daten und Cloud-Daten wurden zusammengeführt.'); CLOUD.dirty = true; }
  else if (CLOUD.dirty) next = mergeStates(S, remote);
  else next = remote;
  applyState(next);
  writeSync(Object.assign(readSync(), { version: r.data.version }));
  pullPhotos();
  return true;
}
async function cloudPush(retry) {
  const meta = readSync();
  const r = await cloudApi('PUT', '/api/state', { baseVersion: meta.version || 0, data: JSON.parse(ser(S)) });
  if (r.status === 0) { setSyncStatus('offline'); return false; }
  if (r.status === 409 && !retry) { CLOUD.dirty = true; if (!(await cloudPull(true))) return false; writeSync(Object.assign(readSync(), { version: r.data.version })); return cloudPush(true); }
  if (r.status === 413 && !CLOUD.quotaWarned) { CLOUD.quotaWarned = true; toast((r.data && r.data.message) || 'Dein Speicherplatz ist voll.', true); }
  if (!r.ok) { setSyncStatus(r.status === 401 ? 'expired' : 'error'); return false; }
  writeSync(Object.assign(readSync(), { version: r.data.version, dirty: false }));
  CLOUD.dirty = false;
  return true;
}
async function pushPhotos() {
  const meta = readSync(), up = new Set(meta.photos || []);
  const local = new Map(S.entries.filter(e => e.hasPhoto).map(e => [cloudPhotoId(e.id), e.id]));
  const want = new Set(local.keys());
  for (const [cid, id] of local) {
    if (up.has(cid) || !photoCache.has(id)) continue;
    const r = await cloudApi('PUT', '/api/photos/' + cid, { data: photoCache.get(id) });
    if (r.status === 0) { setSyncStatus('offline'); return false; }
    if (r.status === 413) { if (!CLOUD.quotaWarned) { CLOUD.quotaWarned = true; toast((r.data && r.data.message) || 'Speicherplatz voll – Fotos werden nicht mehr hochgeladen.', true); } break; }
    if (r.ok) up.add(cid);
  }
  for (const id of [...up]) {
    if (want.has(id)) continue;
    const r = await cloudApi('DELETE', '/api/photos/' + id);
    if (r.status === 0) { setSyncStatus('offline'); return false; }
    if (r.ok) up.delete(id);
  }
  writeSync(Object.assign(readSync(), { photos: [...up] }));
  return true;
}
async function pullPhotos() {
  const list = await cloudApi('GET', '/api/photos');
  if (!list.ok) return;
  const have = new Set(list.data.ids), meta = readSync(), up = new Set(meta.photos || []);
  let got = 0;
  for (const e of S.entries) {
    const cid = cloudPhotoId(e.id);
    if (!e.hasPhoto || photoCache.has(e.id) || !have.has(cid)) continue;
    const r = await cloudApi('GET', '/api/photos/' + cid);
    if (r.ok && typeof r.data.data === 'string' && IMG_RE.test(r.data.data)) {
      photoCache.set(e.id, r.data.data); up.add(cid); got++;
      if (idb) { try { await idbRun('readwrite', s => s.put(r.data.data, e.id)); } catch (err) { /* nur im Speicher */ } }
    }
  }
  if (got) { writeSync(Object.assign(readSync(), { photos: [...up] })); renderLog(); renderGallery(); }
}
async function cloudSync() {
  if (!CLOUD.user) return;
  if (CLOUD.busy) { CLOUD.again = true; return; }
  CLOUD.busy = true; setSyncStatus('syncing');
  try {
    let ok = true;
    if (CLOUD.dirty || !readSync().version) ok = await cloudPush(false);
    else ok = await cloudPull(false);
    if (ok) ok = await pushPhotos();
    if (ok) { CLOUD.last = new Date(); writeSync(Object.assign(readSync(), { lastSync: CLOUD.last.toISOString() })); setSyncStatus('ok'); }
  } catch (e) { console.error(e); setSyncStatus('error'); }
  CLOUD.busy = false;
  if (CLOUD.again) { CLOUD.again = false; scheduleSync(300); }
  renderAccount();
}
function scheduleSync(delay = 1500) {
  if (!CLOUD.user || CLOUD.applying) return;
  CLOUD.dirty = true;
  writeSync(Object.assign(readSync(), { dirty: true }));
  clearTimeout(CLOUD.timer);
  CLOUD.timer = setTimeout(cloudSync, delay);
}

async function wipeLocal() {
  ['', '-prev'].forEach(x => { try { localStorage.removeItem(KEY + x); } catch (e) { /* ignore */ } });
  /* auch Altbestände entfernen – sonst würde load() sie beim nächsten Start wieder übernehmen */
  [SYNC_KEY, 'autopot-range', 'autopot-email', 'autopot-entries', 'autopot-setup', 'autopot-week', 'autopot-settings', 'growcc-v2'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
  photoCache.clear();
  if (idb) { try { await idbRun('readwrite', s => s.clear()); } catch (e) { /* ignore */ } }
  S = blank();
}
async function afterAuth(isNew) {
  const me = await cloudApi('GET', '/api/me');
  if (!me.ok) { setAcctMsg('Anmeldung fehlgeschlagen.', true); return false; }
  CLOUD.user = { createdAt: me.data.createdAt };
  setRole(me.data.role);
  const tag = String(me.data.createdAt), meta = readSync();
  if (meta.tag && meta.tag !== tag) {
    if (!confirm('Auf diesem Gerät liegen noch Daten eines anderen Kontos. Sie werden jetzt von diesem Gerät entfernt, damit sie nicht in dieses Konto gelangen (im anderen Konto bleiben sie erhalten, soweit synchronisiert).\n\nFortfahren?')) {
      await cloudApi('POST', '/api/logout'); CLOUD.user = null; setSyncStatus('off'); renderAccount(); return false;
    }
    await wipeLocal(); loadSettings(); renderAll();
  }
  writeSync(Object.assign(readSync(), { tag }));
  setSyncStatus('syncing');
  const pulled = await cloudPull(true);
  if (pulled && (isNew || !readSync().version || CLOUD.dirty)) { CLOUD.dirty = true; }
  await cloudSync();
  renderAccount();
  return true;
}
async function cloudInit() {
  if (!/^https?:$/.test(location.protocol)) return;
  if (navigator.onLine === false) { window.addEventListener('online', () => cloudInit(), { once: true }); return; }
  const cfg = await cloudApi('GET', '/api/config');
  if (!cfg.ok || !cfg.data || typeof cfg.data.registration !== 'boolean') return;
  loadNewsTeaser(cfg.data);
  CLOUD.available = true; CLOUD.registration = cfg.data.registration; CLOUD.mode = cfg.data.mode || (cfg.data.registration ? 'open' : 'closed'); CLOUD.pow = Number(cfg.data.pow) || 0;
  $('accountBtn').classList.remove('hidden');
  const me = await cloudApi('GET', '/api/session');
  if (me.ok && me.data.authenticated) {
    setRole(me.data.role);
    CLOUD.user = { createdAt: me.data.createdAt };
    const meta = readSync(); if (meta.lastSync) CLOUD.last = new Date(meta.lastSync);
    setSyncStatus('syncing');
    CLOUD.dirty = !!meta.dirty;
    await cloudSync();
  } else setSyncStatus(readSync().tag ? 'expired' : 'off');
  renderAccount();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && CLOUD.user) cloudSync(); });
  window.addEventListener('online', () => { if (CLOUD.user) cloudSync(); });
  setInterval(() => { if (CLOUD.user && document.visibilityState === 'visible') cloudSync(); }, 120000);
}

/* ---------- Konto-Dialog ---------- */
function setAcctMsg(t, bad) { const m = $('acctMsg'); m.textContent = t || ''; m.className = 'sub acct-msg' + (bad ? ' bad' : ''); }
function showTab(tab) {
  document.querySelectorAll('#acctTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  document.querySelectorAll('[data-tabpane]').forEach(f => f.classList.toggle('hidden', f.dataset.tabpane !== tab));
  setAcctMsg('');
}
function renderAccount() {
  const btn = $('accountBtn'); if (!btn) return;
  $('acctNA').classList.toggle('hidden', CLOUD.available);
  $('acctOut').classList.toggle('hidden', !CLOUD.available || !!CLOUD.user);
  $('acctIn').classList.toggle('hidden', !CLOUD.user);
  const regTab = document.querySelector('#acctTabs [data-tab="register"]');
  if (regTab) regTab.classList.toggle('hidden', CLOUD.registration === false);
  $('reInviteWrap').classList.toggle('hidden', CLOUD.mode !== 'invite'); $('reInvite').required = CLOUD.mode === 'invite';
  $('acctSince').textContent = CLOUD.user ? `Konto seit ${new Date(CLOUD.user.createdAt).toLocaleDateString('de-DE')}` : '';
  setSyncStatus(CLOUD.status);
}
function showRecovery(code) {
  $('recoveryCode').textContent = code;
  $('recoveryOk').checked = false; $('recoveryDone').disabled = true;
  $('acctRecovery').classList.remove('hidden'); $('acctOut').classList.add('hidden'); $('acctIn').classList.add('hidden');
  openDlg('accountDlg');
}
const formVals = f => Object.fromEntries([...f.elements].filter(e => e.name).map(e => [e.name, e.type === 'checkbox' ? e.checked : e.value]));
function solvePow(challenge, bits) {
  return new Promise(res => {
    let w;
    try { w = new Worker('pow-worker.js'); } catch (e) { res(null); return; }
    const t = setTimeout(() => { w.terminate(); res(null); }, 60000);
    w.onmessage = ev => { clearTimeout(t); w.terminate(); res(ev.data && ev.data.nonce); };
    w.onerror = () => { clearTimeout(t); w.terminate(); res(null); };
    w.postMessage({ challenge, bits });
  });
}
async function submitAuth(kind, f) {
  const v = formVals(f), btn = f.querySelector('button[type=submit]');
  btn.disabled = true; setAcctMsg('Bitte warten …');
  try {
    if (kind === 'register') {
      if (v.password !== v.password2) { setAcctMsg('Die Passwörter stimmen nicht überein.', true); return; }
      if (!v.adult) { setAcctMsg('Die Nutzung ist erst ab 18 Jahren erlaubt.', true); return; }
      if (!v.terms) { setAcctMsg('Bitte den Nutzungsbedingungen und der Datenschutzerklärung zustimmen.', true); return; }
    }
    const url = { login: '/api/login', register: '/api/register', recover: '/api/recover' }[kind];
    if (kind === 'register' && pwScore(v.password) < 2) { setAcctMsg('Bitte ein stärkeres Passwort wählen (länger, mit Zahlen oder Sonderzeichen).', true); return; }
    const body = kind === 'recover' ? { email: v.email, recoveryCode: v.recoveryCode, newPassword: v.newPassword } : { email: v.email, password: v.password };
    if (kind === 'login' && v.totp) body.totp = v.totp.replace(/\s+/g, '');
    if (kind === 'register') {
      Object.assign(body, { adult: true, terms: true });
      if (CLOUD.mode === 'invite') body.invite = v.invite;
      else if (CLOUD.pow > 0) {
        setAcctMsg('Kurze Sicherheitsprüfung gegen Bots läuft …');
        const ch = await cloudApi('GET', '/api/challenge');
        if (!ch.ok) { setAcctMsg((ch.data && ch.data.message) || 'Sicherheitsprüfung nicht möglich.', true); return; }
        const nonce = await solvePow(ch.data.challenge, ch.data.bits);
        if (nonce == null) { setAcctMsg('Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.', true); return; }
        Object.assign(body, { challenge: ch.data.challenge, nonce });
        setAcctMsg('Konto wird angelegt …');
      }
    }
    const r = await cloudApi('POST', url, body);
    if (r.status === 0) { setAcctMsg('Der Server ist nicht erreichbar.', true); return; }
    if (kind === 'login' && r.data && (r.data.error === 'totp_required' || r.data.error === 'bad_totp')) {
      $('liTotpWrap').classList.remove('hidden'); $('liTotp').required = true; $('liTotp').value = ''; $('liTotp').focus();
      setAcctMsg(r.data.message, r.data.error === 'bad_totp'); return;
    }
    if (!r.ok) { setAcctMsg((r.data && r.data.message) || 'Das hat nicht geklappt.', true); return; }
    try { localStorage.setItem('autopot-email', v.email.trim()); } catch (e) { /* ignore */ }
    f.reset();
    if (kind === 'login') { $('liTotpWrap').classList.add('hidden'); $('liTotp').required = false; }
    if (kind === 'recover' && r.data.totpReset) toast('Die Zwei-Faktor-Anmeldung wurde zurückgesetzt. Bitte im Konto neu einrichten.', true);
    const code = r.data.recoveryCode;
    const ok = await afterAuth(kind === 'register');
    if (ok && code) showRecovery(code); else if (ok) { closeDlg('accountDlg'); toast('Angemeldet.'); }
  } finally { btn.disabled = false; }
}
async function cloudLogout() {
  if (CLOUD.dirty) await cloudSync();
  const unsynced = CLOUD.dirty;
  const r = await cloudApi('POST', '/api/logout');
  /* Ohne Verbindung bliebe die Sitzung auf dem Server gültig – dann lieber gar nicht abmelden */
  if (r.status === 0) { toast('Abmelden ist ohne Internetverbindung nicht möglich. Bitte später erneut versuchen.', true); return; }
  CLOUD.user = null; setSyncStatus('off');
  const warn = unsynced ? '\n\nACHTUNG: Es gibt Änderungen, die noch nicht in der Cloud sind. Beim Entfernen gehen sie verloren – vorher ein Backup speichern!' : '';
  if (confirm('Lokale Daten auf diesem Gerät entfernen?\n\nOK: Alles wird von diesem Gerät gelöscht (empfohlen auf fremden oder gemeinsam genutzten Geräten). Deine Daten bleiben in der Cloud.\nAbbrechen: Daten bleiben lokal erhalten.' + warn)) { await wipeLocal(); location.replace(location.pathname); return; }
  renderAccount(); closeDlg('accountDlg'); toast('Abgemeldet.');
}
async function cloudExport() {
  const r = await cloudApi('GET', '/api/export');
  if (!r.ok) { toast('Export fehlgeschlagen.', true); return; }
  download('autopot-cloud-export.json', JSON.stringify(r.data, null, 2), 'application/json');
  toast('Cloud-Daten exportiert.');
}
function bindAccount() {
  $('accountBtn').addEventListener('click', () => { renderAccount(); openDlg('accountDlg'); renderSecurity(); });
  bindSecurity();
  document.querySelectorAll('#acctTabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  [['login', 'loginForm'], ['register', 'registerForm'], ['recover', 'recoverForm']].forEach(([k, id]) => $(id).addEventListener('submit', ev => { ev.preventDefault(); submitAuth(k, $(id)); }));
  $('recoveryOk').addEventListener('change', () => { $('recoveryDone').disabled = !$('recoveryOk').checked; });
  $('recoveryDone').addEventListener('click', () => { $('acctRecovery').classList.add('hidden'); $('recoveryCode').textContent = ''; renderAccount(); closeDlg('accountDlg'); toast('Konto bereit. Deine Daten werden verschlüsselt synchronisiert.'); });
  $('recoveryCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('recoveryCode').textContent); toast('Code kopiert.'); } catch (e) { toast('Kopieren nicht möglich – bitte markieren und abschreiben.', true); } });
  $('recoverySave').addEventListener('click', () => download('autopot-wiederherstellungscode.txt', `AutoPot Grow – Wiederherstellungscode\r\n\r\n${$('recoveryCode').textContent}\r\n\r\nBewahre diese Datei sicher auf (z. B. im Passwortmanager). Wer den Code kennt, kann das Passwort zurücksetzen.\r\n`, 'text/plain;charset=utf-8'));
  $('syncNow').addEventListener('click', () => { CLOUD.dirty = true; cloudSync(); });
  $('logoutBtn').addEventListener('click', cloudLogout);
  $('cloudExport').addEventListener('click', cloudExport);
  $('pwForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formVals($('pwForm')); if (v.newPassword !== v.newPassword2) { toast('Die neuen Passwörter stimmen nicht überein.', true); return; }
    const r = await cloudApi('POST', '/api/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
    if (!r.ok) { toast((r.data && r.data.message) || 'Passwortwechsel fehlgeschlagen.', true); return; }
    $('pwForm').reset(); $('pwForm').closest('details').open = false;
    toast('Passwort geändert. Es gibt einen neuen Wiederherstellungscode.'); showRecovery(r.data.recoveryCode);
  });
  $('delForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!confirm('Konto und alle Cloud-Daten endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;
    const dv = formVals($('delForm'));
    const r = await cloudApi('DELETE', '/api/account', { password: dv.password, code: dv.code || undefined });
    if (!r.ok) { toast((r.data && r.data.message) || 'Löschen fehlgeschlagen.', true); return; }
    CLOUD.user = null; await wipeLocal(); toast('Konto gelöscht.'); location.replace(location.pathname);
  });
  const em = (() => { try { return localStorage.getItem('autopot-email') || ''; } catch (e) { return ''; } })();
  if (em) { document.querySelectorAll('#loginForm [name=email], #recoverForm [name=email]').forEach(i => { i.value = em; }); }
}

/* ---------- Sicherheit im Konto-Dialog: 2FA, Geräte, Protokoll ---------- */
const EVENT_LABELS = { register: 'Konto erstellt', login: 'Anmeldung', login_failed: 'Fehlgeschlagene Anmeldung', totp_failed: 'Falscher Zwei-Faktor-Code', recovery_used: 'Passwort per Wiederherstellungscode zurückgesetzt', recovery_regenerated: 'Neuer Wiederherstellungscode erzeugt', admin_disabled: 'Konto vom Betreiber gesperrt', admin_enabled: 'Konto vom Betreiber entsperrt', password_changed: 'Passwort geändert', '2fa_enabled': 'Zwei-Faktor-Anmeldung aktiviert', '2fa_disabled': 'Zwei-Faktor-Anmeldung deaktiviert', session_revoked: 'Ein Gerät abgemeldet', sessions_revoked: 'Alle anderen Geräte abgemeldet', export: 'Alle Daten exportiert' };
const BAD_EVENTS = new Set(['login_failed', 'totp_failed']);
const fmtDT = t => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
async function renderSecurity() {
  if (!CLOUD.user) return;
  const [me, ss, lg] = await Promise.all([cloudApi('GET', '/api/me'), cloudApi('GET', '/api/sessions'), cloudApi('GET', '/api/security-log')]);
  if (me.ok) {
    CLOUD.totp = !!me.data.totp;
    if (me.data.quotaBytes) { const mb = b => (b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }); $('acctUsage').textContent = `Speicher: ${mb(me.data.usageBytes)} MB von ${mb(me.data.quotaBytes)} MB belegt (${me.data.photos} Fotos)`; }
    $('tfaState').innerHTML = CLOUD.totp ? '<span class="chip ok">aktiv</span> Beim Anmelden wird zusätzlich ein Code aus deiner Authenticator-App abgefragt.' : '<span class="chip warn">aus</span> Empfohlen: Schützt dein Konto auch dann, wenn jemand dein Passwort kennt.';
    $('tfaStart').classList.toggle('hidden', CLOUD.totp || !$('tfaSetup').classList.contains('hidden'));
    $('tfaOffForm').classList.toggle('hidden', !CLOUD.totp);
    $('delCodeWrap').classList.toggle('hidden', !CLOUD.totp);
    $('delCode').required = CLOUD.totp;
  }
  if (ss.ok) {
    const list = ss.data.sessions;
    $('sessList').innerHTML = list.map(x => `<div class="item"><div><strong>${esc(x.label)}</strong>${x.current ? ' <span class="chip ok">dieses Gerät</span>' : ''}<p class="meta">angemeldet ${esc(fmtDT(x.createdAt))} · zuletzt aktiv ${esc(fmtDT(x.lastSeen))}</p></div>${x.current ? '' : `<button class="btn small danger" data-sess="${esc(x.id)}" type="button">Abmelden</button>`}</div>`).join('');
    $('sessOthers').classList.toggle('hidden', list.length < 2);
    $('sessCount').textContent = `(${list.length})`;
  }
  if (lg.ok) {
    const ev = lg.data.events;
    const bad = ev.filter(e => BAD_EVENTS.has(e.type) && Date.now() - e.at < 7 * 864e5).length;
    $('secLog').innerHTML = (bad ? `<div class="notice warn"><span>${bad} fehlgeschlagene Anmeldeversuche in den letzten 7 Tagen. Wenn du das nicht warst: Passwort ändern und Zwei-Faktor-Anmeldung aktivieren.</span></div>` : '') +
      (ev.map(e => `<div class="logrow${BAD_EVENTS.has(e.type) ? ' bad' : ''}"><span>${esc(EVENT_LABELS[e.type] || e.type)}</span><span class="sub">${esc(fmtDT(e.at))}</span></div>`).join('') || '<p class="sub">Noch keine Einträge.</p>');
  }
}
function bindSecurity() {
  $('tfaStart').addEventListener('click', async () => {
    const r = await cloudApi('POST', '/api/2fa/setup');
    if (!r.ok) { toast((r.data && r.data.message) || 'Einrichtung nicht möglich.', true); return; }
    try { $('tfaQr').innerHTML = window.AutoPotQR ? window.AutoPotQR.svg(r.data.uri, { label: 'QR-Code für die Authenticator-App' }) : ''; } catch (e) { $('tfaQr').innerHTML = ''; }
    $('tfaSecret').textContent = r.data.secret.match(/.{1,4}/g).join(' ');
    $('tfaLink').href = r.data.uri;
    $('tfaSetup').classList.remove('hidden'); $('tfaStart').classList.add('hidden');
    $('tfaCode').value = ''; $('tfaCode').focus();
  });
  $('tfaEnableForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await cloudApi('POST', '/api/2fa/enable', { code: $('tfaCode').value.trim() });
    if (!r.ok) { toast((r.data && r.data.message) || 'Der Code stimmt nicht.', true); return; }
    $('tfaSetup').classList.add('hidden'); $('tfaQr').innerHTML = ''; $('tfaSecret').textContent = '';
    toast('Zwei-Faktor-Anmeldung ist aktiv.'); renderSecurity();
  });
  $('tfaCancel').addEventListener('click', () => { $('tfaSetup').classList.add('hidden'); $('tfaQr').innerHTML = ''; renderSecurity(); });
  $('tfaOffForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formVals($('tfaOffForm'));
    const r = await cloudApi('POST', '/api/2fa/disable', { password: v.password, code: v.code });
    if (!r.ok) { toast((r.data && r.data.message) || 'Deaktivieren fehlgeschlagen.', true); return; }
    $('tfaOffForm').reset(); toast('Zwei-Faktor-Anmeldung deaktiviert.'); renderSecurity();
  });
  $('sessList').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-sess]'); if (!b) return;
    const r = await cloudApi('DELETE', '/api/sessions/' + b.dataset.sess);
    toast(r.ok ? 'Gerät abgemeldet.' : 'Abmelden fehlgeschlagen.', !r.ok); renderSecurity();
  });
  $('rcForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await cloudApi('POST', '/api/recovery-code', { password: $('rcPwd').value });
    if (!r.ok) { toast((r.data && r.data.message) || 'Das hat nicht geklappt.', true); return; }
    $('rcForm').reset(); toast('Neuer Wiederherstellungscode erzeugt – der alte ist ab sofort ungültig.'); showRecovery(r.data.recoveryCode);
  });
  $('sessOthers').addEventListener('click', async () => {
    const r = await cloudApi('DELETE', '/api/sessions/others');
    toast(r.ok ? `${r.data.removed} Gerät(e) abgemeldet.` : 'Abmelden fehlgeschlagen.', !r.ok); renderSecurity();
  });
}

/* ---------- Events ---------- */
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'lightbox': if (CMP.on) pickCompare(id); else openLightbox(id); break;
    case 'edit': startEdit(id); break;
    case 'backup': exportJson(); break;
    case 'tag': {
      const cur = $('fTags').value.split(',').map(x => x.trim()).filter(Boolean);
      if (!cur.includes(b.dataset.tag)) cur.push(b.dataset.tag);
      $('fTags').value = cur.join(', ').slice(0, 120);
      break;
    }
    case 'del-entry': {
      const removed = S.entries.find(e => e.id === id);
      if (!removed) break;
      const photo = photoCache.get(id);
      S.entries = S.entries.filter(e => e.id !== id); dropPhoto(id); markDeleted('entries', id);
      if (editingId === id) resetForm();
      save(); renderAll();
      toast(`Eintrag vom ${fmtDate(removed.date)} gelöscht.`, false, { label: 'Rückgängig', fn: async () => {
        if (S.entries.some(e => e.id === id)) return;
        S.entries.push(removed); delete S.deleted.entries[id];
        if (photo) { photoCache.set(id, photo); if (idb) { try { await idbRun('readwrite', st => st.put(photo, id)); } catch (e) { /* nur im Speicher */ } } }
        save(); renderAll(); toast('Eintrag wiederhergestellt.');
      } });
      break;
    }
    case 'del-recipe': S.recipes = S.recipes.filter(r => r.id !== id); markDeleted('recipes', id); save(); renderLists(); break;
    case 'del-event': S.events = S.events.filter(r => r.id !== id); markDeleted('events', id); save(); renderLists(); break;
    case 'strain-use': useStrain(id); break;
    case 'del-strain': S.strains = S.strains.filter(x => x.id !== id); markDeleted('strains', id); if (S.settings.strainId === id) S.settings.strainId = null; save(); renderStrains(); renderHero(); renderPlan(); break;
    case 'share-copy': copyText(shareUrl(id)); break;
    case 'share-del': (async () => { if (!confirm('Diesen Grow nicht mehr teilen? Der Link funktioniert danach nicht mehr.')) return; const r = await cloudApi('DELETE', '/api/shares/' + id); toast(r.ok ? 'Freigabe beendet.' : 'Das hat nicht geklappt.', !r.ok); loadMyShares(); })(); break;
    case 'ann-close': try { localStorage.setItem(b.dataset.key, '1'); } catch (e) { /* ignore */ } $('announceBox').innerHTML = ''; break;
    case 'del-archive': S.archive = S.archive.filter(r => r.id !== id); markDeleted('archive', id); save(); renderArchive(); break;
    case 'del-rem': S.reminders = S.reminders.filter(r => r.id !== id); markDeleted('reminders', id); save(); renderReminders(); break;
    case 'rem-done': {
      const r = S.reminders.find(x => x.id === id);
      if (r) { r.lastDone = remInfo(r).done ? null : new Date().toISOString(); save(); renderReminders(); }
      break;
    }
  }
});
document.addEventListener('change', ev => {
  const c = ev.target.closest('[data-check]');
  if (!c) return;
  S.checks[c.dataset.check][c.dataset.i] = c.checked;
  if (!c.checked) delete S.checks[c.dataset.check][c.dataset.i];
  save(); renderDashboard();
});

async function init() {
  await initPhotos();
  fillSelect($('sPhase')); fillSelect($('fPhase')); fillSelect($('rPhase'), true); fillSelect($('lPhase'), true);
  $('lPhase').options[0].textContent = 'Alle Phasen';
  loadSettings(); resetForm(); renderSymptoms();
  $('tDate').value = todayStr(); $('mDate').value = todayStr();
  $('tagChips').innerHTML = QUICK_TAGS.map(t => `<button class="qchip" type="button" data-act="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  $('ppPpm').value = Math.round((num($('ppEc').value) || 0) * Number($('ppScale').value));
  document.querySelectorAll('#rangeSeg button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === rangeDays)));
  applyTheme(readTheme());
  renderAll();
  bindChartHover();

  ['sName', 'sStart', 'sTankSize', 'sTankRest', 'sDailyUse', 'sInterval'].forEach(id => $(id).addEventListener('input', onSettings));
  $('sPhase').addEventListener('change', onSettings);
  ['hDate', 'hWet', 'hDry', 'hWatt', 'hNote'].forEach(id => $(id).addEventListener('input', onHarvest));
  ['vTemp', 'vRh', 'eBase', 'eTarget', 'eLiter', 'pCur', 'pTar', 'wOldL', 'wOldEc', 'wNewL', 'wNewEc', 'dPpfd', 'dHours', 'hLeaf'].forEach(id => $(id).addEventListener('input', renderCalc));
  const ppFromEc = () => { const e = num($('ppEc').value); $('ppPpm').value = e == null ? '' : Math.round(e * Number($('ppScale').value)); };
  $('ppEc').addEventListener('input', ppFromEc);
  $('ppScale').addEventListener('change', ppFromEc);
  $('ppPpm').addEventListener('input', () => { const p = num($('ppPpm').value); $('ppEc').value = p == null ? '' : Number((p / Number($('ppScale').value)).toFixed(2)); });

  $('saveEntry').addEventListener('click', saveEntry);
  $('cancelEdit').addEventListener('click', () => resetForm());
  $('clearForm').addEventListener('click', () => resetForm());
  $('photoRemove').addEventListener('click', () => setPhoto('', true));
  $('fPhoto').addEventListener('change', async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    try { setPhoto(await resizeImage(f), true); } catch (e) { toast('Das Foto konnte nicht verarbeitet werden.', true); }
  });
  $('lSearch').addEventListener('input', () => { LF.q = $('lSearch').value; LF.limit = 25; renderLog(); });
  $('lPhase').addEventListener('change', () => { LF.phase = $('lPhase').value; LF.limit = 25; renderLog(); });
  $('lPhoto').addEventListener('change', () => { LF.photo = $('lPhoto').checked; LF.limit = 25; renderLog(); });
  $('logMore').addEventListener('click', () => { LF.limit += 25; renderLog(); });
  document.querySelectorAll('#rangeSeg button').forEach(b => b.addEventListener('click', () => {
    rangeDays = Number(b.dataset.range);
    try { localStorage.setItem('autopot-range', String(rangeDays)); } catch (e) { /* ignore */ }
    document.querySelectorAll('#rangeSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderCharts();
  }));

  /* Daten-Dialog */
  $('dataBtn').addEventListener('click', () => openDlg('dataDlg'));
  $('moreBtn').addEventListener('click', () => openDlg('moreSheet'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeDlg(b.dataset.close)));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', ev => { if (ev.target === d) closeDlg(d.id); }));
  $('moreSheet').addEventListener('click', ev => {
    const a = ev.target.closest('a');
    if (!a) return;
    closeDlg('moreSheet');
    if (a.dataset.open) { ev.preventDefault(); openDlg(a.dataset.open); }
  });
  $('lbPrev').addEventListener('click', () => { if (lb.i > 0) { lb.i--; showLb(); } });
  $('lbNext').addEventListener('click', () => { if (lb.i < lb.list.length - 1) { lb.i++; showLb(); } });
  document.addEventListener('keydown', ev => {
    if (!$('lightbox').open) return;
    if (ev.key === 'ArrowLeft') $('lbPrev').click();
    if (ev.key === 'ArrowRight') $('lbNext').click();
  });

  $('exportCsv').addEventListener('click', () => { closeDlg('dataDlg'); exportCsv(); });
  $('bkEncrypt').addEventListener('change', () => { $('bkPwWrap').classList.toggle('hidden', !$('bkEncrypt').checked); });
  $('backupJson').addEventListener('click', async () => {
    let pw = '';
    if ($('bkEncrypt').checked) {
      pw = $('bkPw').value;
      if (pw.length < 8) { toast('Backup-Passwort: mindestens 8 Zeichen.', true); return; }
      if (pw !== $('bkPw2').value) { toast('Die Backup-Passwörter stimmen nicht überein.', true); return; }
    }
    closeDlg('dataDlg');
    if (await exportJson(pw)) { $('bkPw').value = ''; $('bkPw2').value = ''; }
  });
  $('pwAskForm').addEventListener('submit', ev => { ev.preventDefault(); finishAsk($('pwAskInput').value); });
  $('pwAskCancel').addEventListener('click', () => finishAsk(null));
  $('pwAsk').addEventListener('close', () => { if (pwAskResolve) finishAsk(null); });
  $('fillLast').addEventListener('click', fillLast);
  $('nutriSearch').addEventListener('input', renderKnowledge);
  try { const pwr = JSON.parse(localStorage.getItem('autopot-power') || 'null'); if (pwr) { $('pwWatt').value = pwr.w; $('pwExtra').value = pwr.extra; $('pwPrice').value = pwr.price; } } catch (e) { /* ignore */ }
  if (!num($('pwWatt').value) && S.harvest.watt) $('pwWatt').value = S.harvest.watt;
  ['pwWatt', 'pwExtra', 'pwPrice'].forEach(id => $(id).addEventListener('input', renderPower));
  $('pwHours').addEventListener('input', () => { $('pwHours').dataset.touched = '1'; renderPower(); });
  ['sLight', 'sFlowerWeeks', 'sFlowerStart'].forEach(id => $(id).addEventListener('input', onSettings));
  bindPwMeters();
  renderKnowledge(); renderPower(); renderPlan(); renderStrains(); renderToday();
  $('stSave').addEventListener('click', saveStrain);
  $('shareBtn').addEventListener('click', openShare);
  $('shCreate').addEventListener('click', createShare);
  $('climateFile').addEventListener('change', ev => { closeDlg('dataDlg'); if (ev.target.files[0]) importClimate(ev.target.files[0]); ev.target.value = ''; });
  $('cmpBtn').addEventListener('click', () => { if (photoCache.size < 2) { toast('Für einen Vergleich braucht es mindestens zwei Fotos.', true); return; } toggleCompare(!CMP.on); });
  $('cmpRange').addEventListener('input', () => { $('cmpB').style.clipPath = `inset(0 0 0 ${$('cmpRange').value}%)`; });
  $('exportIcs').addEventListener('click', exportIcs);
  $('restorePrev').addEventListener('click', restorePrev);
  $('importFile').addEventListener('change', ev => { closeDlg('dataDlg'); if (ev.target.files[0]) importFile(ev.target.files[0]); ev.target.value = ''; });
  $('tankChange').addEventListener('click', tankChange);
  $('newGrow').addEventListener('click', newGrow);
  ['printBtn', 'printBtn2'].forEach(id => $(id).addEventListener('click', () => { closeDlg('dataDlg'); setTimeout(() => window.print(), 50); }));
  $('themeToggle').addEventListener('click', () => {
    const order = ['system', 'light', 'dark'], next = order[(order.indexOf(readTheme()) + 1) % 3];
    try { localStorage.setItem('autopot-theme', next); } catch (e) { /* ignore */ }
    applyTheme(next); renderCharts();
  });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(readTheme()); renderCharts(); });

  /* App installieren */
  let deferred = null;
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); deferred = ev; $('installBtn').classList.remove('hidden'); });
  window.addEventListener('appinstalled', () => { deferred = null; $('installBtn').classList.add('hidden'); toast('App installiert.'); });
  $('installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) { /* ignore */ }
    deferred = null; $('installBtn').classList.add('hidden');
  });

  $('saveRecipe').addEventListener('click', () => {
    const name = $('rName').value.trim();
    if (!name) { toast('Bitte einen Namen eingeben.', true); return; }
    S.recipes.push({ id: uid(), name: name.slice(0, 60), phase: $('rPhase').value, text: $('rText').value.trim().slice(0, 500) });
    save(); $('rName').value = ''; $('rText').value = ''; renderLists();
  });
  $('saveEvent').addEventListener('click', () => {
    const date = $('tDate').value, title = $('tTitle').value.trim();
    if (!date || !title) { toast('Datum und Ereignis angeben.', true); return; }
    S.events.push({ id: uid(), date, title: title.slice(0, 80), note: $('tNote').value.trim().slice(0, 300) });
    save(); $('tTitle').value = ''; $('tNote').value = ''; renderLists();
  });
  const addRem = (title, date, time, repeat) => { S.reminders.push({ id: uid(), title, date, time, repeat, lastDone: null, notified: null }); save(); tick(); };
  $('saveRem').addEventListener('click', () => {
    const title = $('mTitle').value.trim();
    if (!title || !$('mDate').value) { toast('Aufgabe und Datum angeben.', true); return; }
    addRem(title.slice(0, 80), $('mDate').value, $('mTime').value || '09:00', $('mRepeat').value);
    $('mTitle').value = '';
  });
  $('tplMeasure').addEventListener('click', () => addRem('pH/EC messen', todayStr(), '09:00', 'daily'));
  $('tplFilter').addEventListener('click', () => addRem('Tankfilter reinigen', todayStr(), '09:00', 'weekly'));
  $('notifyBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) { toast('Benachrichtigungen werden nicht unterstützt.', true); return; }
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
    renderReminders();
  });
  $('diagBtn').addEventListener('click', diagnose);
  $('diagReset').addEventListener('click', () => { document.querySelectorAll('#symptoms input').forEach(x => { x.checked = false; }); $('diagOut').innerHTML = ''; });
  $('weekReset').addEventListener('click', () => { S.checks.week = {}; save(); renderChecks(); renderDashboard(); });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderCharts, 150); });
  window.addEventListener('scroll', () => { if (!navRaf) navRaf = requestAnimationFrame(updateNav); }, { passive: true });
  updateNav();
  setInterval(tick, 60000);
  tick();

  /* Einblend-Animation (nicht bei reduzierter Bewegung) */
  if ('IntersectionObserver' in window && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    document.documentElement.classList.add('js-reveal');
    const io = new IntersectionObserver(list => list.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -4% 0px' });
    document.querySelectorAll('main > section').forEach(s => io.observe(s));
  }

  bindAccount();
  cloudInit().then(() => {
    const mode = new URLSearchParams(location.search).get('mode');
    if (CLOUD.available && !CLOUD.user && ['login', 'register'].includes(mode)) {
      const closed = mode === 'register' && CLOUD.registration === false;
      showTab(closed ? 'login' : mode); openDlg('accountDlg');
      if (closed) setAcctMsg('Die Registrierung ist derzeit geschlossen.', true);
    }
  });

  /* Offline-Nutzung (nur über http/https, nicht bei file://) */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init().catch(err => { console.error(err); toast('Fehler beim Start der App: ' + err.message, true); });
})();
