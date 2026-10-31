/* AutoPot Grow – Wissen, Wochenbericht, Prognose, Strom, verschlüsseltes Backup, Sorten, Fahrplan, Heute, News, Teilen, Klimadaten, Vergleich.
   Teil 7/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
'use strict';

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
