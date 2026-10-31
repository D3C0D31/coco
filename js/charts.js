/* AutoPot Grow – Diagramme mit Zielband, Zeitraum und Tooltip.
   Teil 4/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
'use strict';

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
