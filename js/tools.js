/* AutoPot Grow – Rechner, Ernte & Archiv, Erinnerungen (inkl. Kalenderexport), Diagnose, Checklisten.
   Teil 5/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
'use strict';

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
