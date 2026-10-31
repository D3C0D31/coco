/* Einfacher Lasttest: startet den Server als eigenen Prozess und misst Durchsatz und Antwortzeiten.
 * Start: node tests/load.js [Sekunden=15] [Parallelität=50] */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const SECS = Number(process.argv[2] || 15), CONC = Number(process.argv[3] || 50), USERS = 20;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopot-load-'));
const port = 18000 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}`;
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'autopot' };
const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

(async () => {
  const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, LOG: 'off', POW_BITS: '0', API_RATE_PER_MIN: '1000000', REG_PER_HOUR: '1000', LOGIN_PER_10MIN: '100000', REG_DAILY_MAX: '0' }), stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise(r => srv.stdout.once('data', r));
  const cookies = [];
  for (let i = 0; i < USERS; i++) {
    const r = await fetch(base + '/api/register', { method: 'POST', headers: H, body: JSON.stringify({ email: `last${i}@example.org`, password: 'Last-Test-Passwort-' + i, adult: true, terms: true }) });
    cookies.push(r.headers.get('set-cookie').split(';')[0]);
  }
  /* realistischer Zustand: 200 Einträge */
  const entries = Array.from({ length: 200 }, (_, i) => ({ id: 'e' + i, date: '2026-09-' + String(1 + i % 28).padStart(2, '0'), ec: 1.2, ph: 6, note: 'Notiz ' + i }));
  const versions = new Array(USERS).fill(0);
  for (let i = 0; i < USERS; i++) { const r = await fetch(base + '/api/state', { method: 'PUT', headers: Object.assign({ Cookie: cookies[i] }, H), body: JSON.stringify({ baseVersion: 0, data: { entries } }) }); versions[i] = (await r.json()).version; }

  const lat = [], stats = { ok: 0, err: 0, conflict: 0 };
  const until = Date.now() + SECS * 1000;
  async function worker(w) {
    while (Date.now() < until) {
      const u = (w + lat.length) % USERS, x = Math.random(), t = performance.now();
      let r;
      if (x < 0.7) r = await fetch(base + '/api/state', { headers: { Cookie: cookies[u] } });
      else if (x < 0.9) r = await fetch(base + '/api/state', { method: 'PUT', headers: Object.assign({ Cookie: cookies[u] }, H), body: JSON.stringify({ baseVersion: versions[u], data: { entries } }) });
      else r = await fetch(base + '/api/photos', { headers: { Cookie: cookies[u] } });
      const body = await r.json().catch(() => ({}));
      lat.push(performance.now() - t);
      if (r.status === 200) { stats.ok++; if (body.version && x >= 0.7 && x < 0.9) versions[u] = body.version; }
      else if (r.status === 409) { stats.conflict++; versions[u] = body.version; } else stats.err++;
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONC }, (_, i) => worker(i)));
  const dur = (Date.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  console.log(`Daten-API: ${lat.length} Anfragen in ${dur.toFixed(1)} s = ${(lat.length / dur).toFixed(0)} pro Sekunde bei ${CONC} gleichzeitigen Verbindungen`);
  console.log(`  Antwortzeit p50 ${pct(lat, 0.5).toFixed(1)} ms · p95 ${pct(lat, 0.95).toFixed(1)} ms · p99 ${pct(lat, 0.99).toFixed(1)} ms · Fehler ${stats.err} · Versionskonflikte ${stats.conflict} (erwartet bei parallelem Schreiben)`);

  const lt = [], t1 = Date.now();
  await Promise.all(Array.from({ length: 40 }, async (_, i) => { const s = performance.now(); await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ email: `last${i % USERS}@example.org`, password: 'Last-Test-Passwort-' + (i % USERS) }) }); lt.push(performance.now() - s); }));
  lt.sort((a, b) => a - b);
  console.log(`Logins: 40 gleichzeitig in ${((Date.now() - t1) / 1000).toFixed(1)} s (scrypt, bewusst rechenintensiv) · p50 ${pct(lt, 0.5).toFixed(0)} ms · max ${lt[lt.length - 1].toFixed(0)} ms`);
  const rss = Number(fs.readFileSync(`/proc/${srv.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)?.[1] || 0);
  if (rss) console.log(`Speicherbedarf des Servers: ${(rss / 1024).toFixed(0)} MB`);
  srv.kill(); fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
