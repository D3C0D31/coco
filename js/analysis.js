/* AutoPot Grow – Bewertung: Zielbereiche, Grow-Infos, Score, Serie, Auffälligkeiten und Trends.
   Teil 2/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
'use strict';

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
