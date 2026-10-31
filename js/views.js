/* AutoPot Grow – Ansichten: Übersicht, Protokoll, Galerie.
   Teil 3/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
'use strict';

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
