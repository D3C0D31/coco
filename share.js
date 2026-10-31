(function () {
  'use strict';
  var esc = window.NewsFmt.esc, out = document.getElementById('shareOut');
  var token = (location.hash || '').slice(1).replace(/[^A-Za-z0-9_-]/g, '');
  var nf = function (v, d) { return v == null || !isFinite(v) ? '–' : String(Number(v.toFixed(d == null ? 2 : d))).replace('.', ','); };
  var fph = function (v) { return v == null || !isFinite(v) ? '–' : (Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? v.toFixed(1).replace('.', ',') : nf(v, 2)); };
  var fd = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : '–'; };
  var vpd = function (t, rh) { return t == null || rh == null ? null : Math.max(0, 0.6108 * Math.exp(17.27 * t / (t + 237.3)) * (1 - rh / 100)); };
  function spark(entries, key, label, unit, d) {
    var pts = entries.map(function (e) { return { d: e.date, v: typeof key === 'function' ? key(e) : e[key] }; }).filter(function (p) { return p.v != null && isFinite(p.v); });
    if (pts.length < 2) return '';
    var lo = Math.min.apply(null, pts.map(function (p) { return p.v; })), hi = Math.max.apply(null, pts.map(function (p) { return p.v; })), sp = hi - lo || 1;
    var W = 300, H = 90, P = 8;
    var xy = pts.map(function (p, i) { return [P + i / (pts.length - 1) * (W - 2 * P), H - P - (p.v - lo) / sp * (H - 2 * P)]; });
    var path = xy.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ');
    var dots = xy.map(function (c, i) { return '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="3"><title>' + esc(fd(pts[i].d) + ': ' + nf(pts[i].v, d) + unit) + '</title></circle>'; }).join('');
    return '<div class="card chart"><h3>' + esc(label) + ' <span class="sub">' + nf(pts[pts.length - 1].v, d) + esc(unit) + '</span></h3><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Verlauf ' + esc(label) + '"><path d="' + path + ' L' + xy[xy.length - 1][0].toFixed(1) + ' ' + H + ' L' + xy[0][0].toFixed(1) + ' ' + H + ' Z" class="area"/><path d="' + path + '" class="line"/>' + dots + '</svg><p class="sub">' + nf(lo, d) + ' – ' + nf(hi, d) + esc(unit) + '</p></div>';
  }
  function render(r) {
    var g = r.data.grow || {}, es = (r.data.entries || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }), h = r.data.harvest || {};
    var avg = function (k) { var v = es.map(function (e) { return e[k]; }).filter(function (x) { return x != null; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; };
    var days = g.start && es.length ? Math.round((Date.parse(es[es.length - 1].date) - Date.parse(g.start)) / 864e5) + 1 : null;
    var heights = es.map(function (e) { return e.height; }).filter(function (x) { return x != null; });
    var kpi = [['Einträge', String(es.length)], ['Dauer', days ? days + ' Tage' : '–'], ['Ø EC', nf(avg('ec'))], ['Ø pH', fph(avg('ph'))], ['Höhe', heights.length ? nf(heights[heights.length - 1], 1) + ' cm' : '–']];
    if (h.dry) kpi.push(['Ertrag', nf(h.dry, 1) + ' g' + (h.watt ? ' · ' + nf(h.dry / h.watt, 2) + ' g/W' : '')]);
    var photos = (r.data.photos || []).filter(function (p) { return /^data:image\/(jpeg|png|webp);base64,/.test(p.data); });
    out.innerHTML =
      '<p class="eyebrow">Geteilter Grow · ' + esc(r.views) + ' Aufrufe</p><h1 class="title">' + esc(r.title) + '</h1>' +
      '<p class="sub" style="margin-bottom:18px">' + [g.strain && ('Sorte: ' + esc(g.strain) + (g.breeder ? ' (' + esc(g.breeder) + ')' : '')), g.type && esc(g.type), g.start && ('Start ' + fd(g.start)), g.phase && ('Phase: ' + esc(g.phase)), g.flowerStart && ('Blüte seit ' + fd(g.flowerStart)), g.lightHours && (nf(g.lightHours, 1) + ' h Licht')].filter(Boolean).join(' · ') + '</p>' +
      '<div class="grid kpis">' + kpi.map(function (k) { return '<div class="card"><p class="sub">' + esc(k[0]) + '</p><b>' + esc(k[1]) + '</b></div>'; }).join('') + '</div>' +
      '<h2 class="title small">Verlauf</h2><div class="grid charts">' + spark(es, 'ec', 'EC', '', 2) + spark(es, 'ph', 'pH', '', 2) + spark(es, function (e) { return vpd(e.airTemp, e.humidity); }, 'VPD', ' kPa', 2) + spark(es, 'height', 'Pflanzenhöhe', ' cm', 1) + spark(es, 'airTemp', 'Lufttemperatur', ' °C', 1) + spark(es, 'humidity', 'Luftfeuchte', ' %', 0) + '</div>' +
      (photos.length ? '<h2 class="title small">Fotos</h2><div class="photos">' + photos.map(function (p) { return '<figure><img src="' + p.data + '" alt="Foto vom ' + esc(fd(p.date)) + '" loading="lazy"><figcaption>' + esc(fd(p.date)) + '</figcaption></figure>'; }).join('') + '</div>' : '') +
      '<h2 class="title small">Protokoll</h2><div class="tablewrap"><table><thead><tr><th>Datum</th><th>Phase</th><th>EC</th><th>pH</th><th>Luft °C</th><th>rF %</th><th>PPFD</th><th>Höhe</th>' + (r.data.includeNotes ? '<th>Notiz</th>' : '') + '</tr></thead><tbody>' +
      es.slice().reverse().map(function (e) { return '<tr><td>' + fd(e.date) + '</td><td>' + esc(e.phase || '–') + '</td><td>' + nf(e.ec) + '</td><td>' + fph(e.ph) + '</td><td>' + nf(e.airTemp, 1) + '</td><td>' + nf(e.humidity, 0) + '</td><td>' + nf(e.ppfd, 0) + '</td><td>' + nf(e.height, 1) + '</td>' + (r.data.includeNotes ? '<td>' + esc(e.note) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="sub" style="margin-top:14px">Geteilt am ' + esc(new Date(r.createdAt).toLocaleDateString('de-DE')) + '. Momentaufnahme – spätere Änderungen im Original erscheinen hier nicht.</p>';
    document.getElementById('reportBox').classList.remove('hidden');
  }
  if (!token) { out.innerHTML = '<h1 class="title">Kein Grow ausgewählt</h1><p class="sub">Dieser Link ist unvollständig.</p>'; return; }
  fetch('/api/shares/' + token).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (x) {
    if (!x.ok) { out.innerHTML = '<h1 class="title">Nicht verfügbar</h1><p class="sub">' + esc(x.d && x.d.message || 'Dieser Grow ist nicht (mehr) freigegeben.') + '</p>'; return; }
    document.title = x.d.title + ' – AutoPot Grow';
    render(x.d);
  }).catch(function () { out.innerHTML = '<h1 class="title">Nicht verfügbar</h1><p class="sub">Der Server ist nicht erreichbar.</p>'; });
  document.getElementById('reportForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = document.getElementById('reportMsg');
    fetch('/api/shares/' + token + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'autopot' }, body: JSON.stringify({ reason: document.getElementById('reportReason').value }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) { msg.textContent = x.ok ? 'Danke! Das Team schaut sich die Meldung an.' : (x.d.message || 'Meldung nicht möglich.'); if (x.ok) document.getElementById('reportForm').reset(); })
      .catch(function () { msg.textContent = 'Meldung nicht möglich – keine Verbindung.'; });
  });
})();
