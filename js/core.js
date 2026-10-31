/* AutoPot Grow – Grundlagen: Konstanten, Richtwerte, Hilfsfunktionen, Datenmodell, Foto-Speicher.
   Teil 1/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
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
