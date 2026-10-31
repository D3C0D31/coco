'use strict';
/* AutoPot Grow – Server ohne Fremdpakete (Node >= 22.5). Start: node server/server.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const C = require('./crypto');
const { openDb, loadPepper } = require('./db');

const ROOT = path.join(__dirname, '..');
const CFG = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'server-data'),
  registration: (process.env.REGISTRATION || 'open') !== 'closed',
  trustProxy: process.env.TRUST_PROXY === '1',
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  maxPhotosPerUser: 800,
  maxStateBytes: 3 * 1024 * 1024,
  maxPhotoBytes: 700 * 1024
};
const DAY = 864e5;

function createServer(overrides = {}) {
  const cfg = Object.assign({}, CFG, overrides);
  const db = openDb(cfg.dataDir);
  const pepper = loadPepper(cfg.dataDir);
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email_hash = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    addUser: db.prepare('INSERT INTO users (email_hash, salt, verifier, wrap_dek, rec_salt, wrap_dek_rec, created_at) VALUES (?,?,?,?,?,?,?)'),
    updUser: db.prepare('UPDATE users SET salt=?, verifier=?, wrap_dek=?, rec_salt=?, wrap_dek_rec=? WHERE id=?'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
    addSession: db.prepare('INSERT INTO sessions (token_hash, user_id, dek_wrapped, created_at, last_seen, expires_at) VALUES (?,?,?,?,?,?)'),
    getSession: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    touchSession: db.prepare('UPDATE sessions SET last_seen=?, expires_at=? WHERE token_hash=?'),
    delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
    delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    getDoc: db.prepare('SELECT version, blob, updated_at FROM docs WHERE user_id=? AND kind=?'),
    putDoc: db.prepare('INSERT INTO docs (user_id, kind, version, blob, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id, kind) DO UPDATE SET version=excluded.version, blob=excluded.blob, updated_at=excluded.updated_at'),
    listPhotos: db.prepare('SELECT id FROM photos WHERE user_id=? ORDER BY id'),
    countPhotos: db.prepare('SELECT COUNT(*) AS n FROM photos WHERE user_id=?'),
    getPhoto: db.prepare('SELECT blob FROM photos WHERE user_id=? AND id=?'),
    putPhoto: db.prepare('INSERT INTO photos (user_id, id, blob, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, id) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at'),
    delPhoto: db.prepare('DELETE FROM photos WHERE user_id=? AND id=?'),
    allPhotos: db.prepare('SELECT id, blob FROM photos WHERE user_id=?')
  };

  /* ---------- Begrenzungen (im Speicher) ---------- */
  const hits = new Map();   /* IP -> Zeitstempel */
  const fails = new Map();  /* E-Mail-Hash -> {n, until} */
  const rateOk = (key, max, windowMs) => {
    const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    arr.push(now); hits.set(key, arr);
    return arr.length <= max;
  };
  const locked = h => { const f = fails.get(h); return f && f.until > Date.now(); };
  const failed = h => { const f = fails.get(h) || { n: 0, until: 0 }; f.n++; if (f.n >= 8) { f.until = Date.now() + 15 * 60e3; f.n = 0; } fails.set(h, f); };
  const okLogin = h => fails.delete(h);
  const sweep = setInterval(() => {
    const now = Date.now();
    q.purgeSessions.run(now);
    for (const [k, v] of hits) { const a = v.filter(t => now - t < 3600e3); a.length ? hits.set(k, a) : hits.delete(k); }
    for (const [k, f] of fails) if (f.until < now && f.n === 0) fails.delete(k);
  }, 600e3);
  sweep.unref();

  /* ---------- Helfer ---------- */
  class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const err = (s, c, m) => new HttpError(s, c, m);
  const isSecure = req => !!req.socket.encrypted || (cfg.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const clientIp = req => (cfg.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
  const cookieName = req => isSecure(req) ? '__Host-autopot' : 'autopot';
  function cookies(req) {
    const o = {};
    String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
    return o;
  }
  function setCookie(res, req, token, maxAge) {
    const parts = [`${cookieName(req)}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
    if (isSecure(req)) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }
  function send(res, status, body, headers = {}) {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, Object.assign({ 'Content-Length': Buffer.byteLength(data) }, headers));
    res.end(data);
  }
  const json = (res, status, body) => send(res, status, body, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on('data', c => { n += c.length; if (n > limit) { reject(err(413, 'too_large', 'Die Daten sind zu groß.')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (!n) return resolve({});
        try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {}); }
        catch (e) { reject(err(400, 'bad_json', 'Ungültige Anfrage.')); }
      });
      req.on('error', reject);
    });
  }
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
  const COMMON = new Set(['passwort123', 'password123', '1234567890', 'qwertzuiop', 'qwertyuiop', 'password12', 'passwort12', 'abcdefghij', '0123456789', 'iloveyou12']);
  function checkPassword(pw) {
    if (typeof pw !== 'string' || pw.length < 10) throw err(400, 'weak_password', 'Das Passwort muss mindestens 10 Zeichen lang sein.');
    if (pw.length > 200) throw err(400, 'weak_password', 'Das Passwort ist zu lang (max. 200 Zeichen).');
    if (COMMON.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) throw err(400, 'weak_password', 'Dieses Passwort ist zu einfach.');
  }
  function checkEmail(email) {
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw err(400, 'bad_email', 'Bitte eine gültige E-Mail-Adresse angeben.');
    return email.trim().toLowerCase();
  }

  async function startSession(req, res, userId, dek) {
    const token = crypto.randomBytes(32).toString('base64url'), now = Date.now();
    q.addSession.run(C.sha256(Buffer.from(token)).toString('hex'), userId, C.seal(C.sessionKey(token), dek, 'sess'), now, now, now + cfg.sessionDays * DAY);
    setCookie(res, req, token, cfg.sessionDays * 86400);
  }
  /* Sitzung aus Cookie laden: liefert {userId, dek, tokenHash} oder wirft 401 */
  function auth(req) {
    const token = cookies(req)[cookieName(req)];
    if (!token || token.length > 100) throw err(401, 'unauthorized', 'Bitte anmelden.');
    const th = C.sha256(Buffer.from(token)).toString('hex'), s = q.getSession.get(th), now = Date.now();
    if (!s || s.expires_at < now) throw err(401, 'unauthorized', 'Sitzung abgelaufen. Bitte neu anmelden.');
    let dek;
    try { dek = C.open(C.sessionKey(token), s.dek_wrapped, 'sess'); } catch (e) { throw err(401, 'unauthorized', 'Sitzung ungültig.'); }
    if (now - s.last_seen > 36e5) q.touchSession.run(now, now + cfg.sessionDays * DAY, th);
    return { userId: s.user_id, dek, tokenHash: th };
  }
  function csrfCheck(req) {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return;
    if (req.headers['x-requested-with'] !== 'autopot') throw err(403, 'csrf', 'Anfrage abgelehnt.');
    const o = req.headers.origin;
    if (o) { let h; try { h = new URL(o).host; } catch (e) { h = ''; } if (h !== req.headers.host) throw err(403, 'csrf', 'Anfrage abgelehnt.'); }
  }
  const dummyRow = (async () => { const a = await C.createAccount('dummy-password-for-timing'); return a.row; })();
  const sealJson = (dek, obj, aad) => C.seal(dek, Buffer.from(JSON.stringify(obj)), aad);
  const openJson = (dek, blob, aad) => JSON.parse(C.open(dek, blob, aad).toString('utf8'));
  const PHOTO_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

  /* ---------- API ---------- */
  async function api(req, res, url) {
    const p = url.pathname, m = req.method;
    if (p === '/api/health' && m === 'GET') return json(res, 200, { ok: true });
    if (p === '/api/config' && m === 'GET') return json(res, 200, { registration: cfg.registration });
    if (p === '/api/session' && m === 'GET') {
      try { const s = auth(req); return json(res, 200, { authenticated: true, createdAt: q.userById.get(s.userId).created_at }); }
      catch (e) { if (e instanceof HttpError) return json(res, 200, { authenticated: false }); throw e; }
    }
    csrfCheck(req);
    const ip = clientIp(req);

    if (p === '/api/register' && m === 'POST') {
      if (!cfg.registration) throw err(403, 'closed', 'Die Registrierung ist derzeit geschlossen.');
      if (!rateOk('reg:' + ip, 5, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Registrierungen. Bitte später erneut versuchen.');
      const b = await readBody(req, 4096);
      const email = checkEmail(b.email); checkPassword(b.password);
      const eh = C.emailHash(pepper, email);
      if (q.userByEmail.get(eh)) throw err(409, 'exists', 'Diese E-Mail-Adresse ist bereits registriert.');
      const acc = await C.createAccount(b.password), r = acc.row;
      let id;
      try { id = Number(q.addUser.run(eh, r.salt, r.verifier, r.wrap_dek, r.rec_salt, r.wrap_dek_rec, Date.now()).lastInsertRowid); }
      catch (e) { throw err(409, 'exists', 'Diese E-Mail-Adresse ist bereits registriert.'); }
      await startSession(req, res, id, acc.dek);
      return json(res, 201, { ok: true, recoveryCode: acc.recovery });
    }

    if (p === '/api/login' && m === 'POST') {
      if (!rateOk('login:' + ip, 20, 600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.');
      const b = await readBody(req, 4096);
      const email = checkEmail(b.email), eh = C.emailHash(pepper, email);
      if (locked(eh)) throw err(429, 'locked', 'Zu viele Fehlversuche. Das Konto ist für 15 Minuten gesperrt.');
      const user = q.userByEmail.get(eh);
      const dek = await C.unlock(user || await dummyRow, typeof b.password === 'string' ? b.password.slice(0, 200) : '');
      if (!user || !dek) { failed(eh); throw err(401, 'bad_login', 'E-Mail oder Passwort ist falsch.'); }
      okLogin(eh);
      await startSession(req, res, user.id, dek);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/recover' && m === 'POST') {
      if (!rateOk('rec:' + ip, 8, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche. Bitte später erneut versuchen.');
      const b = await readBody(req, 4096);
      const email = checkEmail(b.email); checkPassword(b.newPassword);
      const eh = C.emailHash(pepper, email), user = q.userByEmail.get(eh);
      if (locked('rec:' + eh)) throw err(429, 'locked', 'Zu viele Fehlversuche. Bitte später erneut versuchen.');
      const dek = user ? await C.unlockWithRecovery(user, b.recoveryCode) : (await C.unlockWithRecovery(await dummyRow, b.recoveryCode), null);
      if (!user || !dek) { failed('rec:' + eh); throw err(401, 'bad_recovery', 'E-Mail oder Wiederherstellungscode ist falsch.'); }
      const nw = await C.rewrap(dek, b.newPassword), r = nw.row;
      q.updUser.run(r.salt, r.verifier, r.wrap_dek, r.rec_salt, r.wrap_dek_rec, user.id);
      q.delUserSessions.run(user.id);
      await startSession(req, res, user.id, dek);
      return json(res, 200, { ok: true, recoveryCode: nw.recovery });
    }

    /* ab hier: angemeldet */
    const s = auth(req);
    if (p === '/api/logout' && m === 'POST') { q.delSession.run(s.tokenHash); setCookie(res, req, '', 0); return json(res, 200, { ok: true }); }
    if (p === '/api/me' && m === 'GET') {
      const u = q.userById.get(s.userId);
      return json(res, 200, { ok: true, createdAt: u.created_at, photos: q.countPhotos.get(s.userId).n });
    }

    if (p === '/api/state' && m === 'GET') {
      const d = q.getDoc.get(s.userId, 'state');
      if (!d) return json(res, 200, { version: 0, data: null });
      let data;
      try { data = openJson(s.dek, d.blob, `u${s.userId}:state`); } catch (e) { throw err(500, 'decrypt_failed', 'Die Daten konnten nicht entschlüsselt werden.'); }
      return json(res, 200, { version: d.version, updatedAt: d.updated_at, data });
    }
    if (p === '/api/state' && m === 'PUT') {
      const b = await readBody(req, cfg.maxStateBytes);
      if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data) || !Number.isInteger(b.baseVersion) || b.baseVersion < 0) throw err(400, 'bad_request', 'Ungültige Anfrage.');
      const cur = q.getDoc.get(s.userId, 'state'), curV = cur ? cur.version : 0;
      if (curV !== b.baseVersion) return json(res, 409, { error: 'conflict', message: 'Auf dem Server liegt ein neuerer Stand.', version: curV });
      const now = Date.now();
      q.putDoc.run(s.userId, 'state', curV + 1, sealJson(s.dek, b.data, `u${s.userId}:state`), now);
      return json(res, 200, { ok: true, version: curV + 1, updatedAt: now });
    }

    if (p === '/api/photos' && m === 'GET') return json(res, 200, { ids: q.listPhotos.all(s.userId).map(r => r.id) });
    const pm = /^\/api\/photos\/([^/]+)$/.exec(p);
    if (pm) {
      const id = pm[1];
      if (!ID_RE.test(id)) throw err(400, 'bad_id', 'Ungültige Foto-ID.');
      if (m === 'GET') {
        const r = q.getPhoto.get(s.userId, id);
        if (!r) throw err(404, 'not_found', 'Foto nicht gefunden.');
        return json(res, 200, { data: C.open(s.dek, r.blob, `u${s.userId}:photo:${id}`).toString('utf8') });
      }
      if (m === 'PUT') {
        const b = await readBody(req, cfg.maxPhotoBytes + 1024);
        if (typeof b.data !== 'string' || b.data.length > cfg.maxPhotoBytes || !PHOTO_RE.test(b.data)) throw err(400, 'bad_photo', 'Ungültiges oder zu großes Foto.');
        if (!q.getPhoto.get(s.userId, id) && q.countPhotos.get(s.userId).n >= cfg.maxPhotosPerUser) throw err(413, 'quota', 'Foto-Limit erreicht.');
        q.putPhoto.run(s.userId, id, C.seal(s.dek, Buffer.from(b.data), `u${s.userId}:photo:${id}`), Date.now());
        return json(res, 200, { ok: true });
      }
      if (m === 'DELETE') { q.delPhoto.run(s.userId, id); return json(res, 200, { ok: true }); }
    }

    if (p === '/api/password' && m === 'POST') {
      const b = await readBody(req, 4096);
      checkPassword(b.newPassword);
      const user = q.userById.get(s.userId);
      if (!rateOk('pw:' + s.userId, 10, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche.');
      const dek = await C.unlock(user, typeof b.currentPassword === 'string' ? b.currentPassword.slice(0, 200) : '');
      if (!dek) throw err(401, 'bad_login', 'Das aktuelle Passwort ist falsch.');
      const nw = await C.rewrap(dek, b.newPassword), r = nw.row;
      q.updUser.run(r.salt, r.verifier, r.wrap_dek, r.rec_salt, r.wrap_dek_rec, user.id);
      q.delOtherSessions.run(user.id, s.tokenHash);
      return json(res, 200, { ok: true, recoveryCode: nw.recovery });
    }

    if (p === '/api/export' && m === 'GET') {
      const d = q.getDoc.get(s.userId, 'state');
      const state = d ? openJson(s.dek, d.blob, `u${s.userId}:state`) : null;
      const photos = {};
      q.allPhotos.all(s.userId).forEach(r => { photos[r.id] = C.open(s.dek, r.blob, `u${s.userId}:photo:${r.id}`).toString('utf8'); });
      const u = q.userById.get(s.userId);
      return json(res, 200, { exportedAt: new Date().toISOString(), accountCreatedAt: new Date(u.created_at).toISOString(), state, photos });
    }

    if (p === '/api/account' && m === 'DELETE') {
      const b = await readBody(req, 4096);
      if (!rateOk('del:' + s.userId, 5, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche.');
      const user = q.userById.get(s.userId);
      if (!(await C.unlock(user, typeof b.password === 'string' ? b.password.slice(0, 200) : ''))) throw err(401, 'bad_login', 'Das Passwort ist falsch.');
      q.delUser.run(user.id);   /* Sitzungen, Dokumente und Fotos folgen per ON DELETE CASCADE */
      setCookie(res, req, '', 0);
      return json(res, 200, { ok: true });
    }
    throw err(404, 'not_found', 'Nicht gefunden.');
  }

  /* ---------- Statische Dateien (nur freigegebene Liste) ---------- */
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const PUBLIC = new Set(['index.html', 'app.html', 'anleitung.html', 'datenschutz.html', 'impressum.html', 'app.js', 'app.css', 'anleitung.js', 'theme-init.js', 'site.css', 'site.js', 'sw.js', 'img/preview-dark.jpg', 'img/preview-light.jpg', 'img/preview-mobile.jpg', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png']);
  const ALIASES = { '/': 'index.html', '/app': 'app.html', '/anleitung': 'anleitung.html', '/datenschutz': 'datenschutz.html', '/impressum': 'impressum.html' };
  const zcache = new Map();
  function serveStatic(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) throw err(405, 'method', 'Methode nicht erlaubt.');
    const rel = ALIASES[pathname] || pathname.replace(/^\/+/, '');
    if (!PUBLIC.has(rel)) throw err(404, 'not_found', 'Seite nicht gefunden.');
    const file = path.join(ROOT, rel);
    let st; try { st = fs.statSync(file); } catch (e) { throw err(404, 'not_found', 'Seite nicht gefunden.'); }
    const ext = path.extname(rel);
    const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': rel === 'sw.js' || ext === '.html' ? 'no-cache' : 'public, max-age=3600' };
    let body = fs.readFileSync(file);
    if (/gzip/.test(req.headers['accept-encoding'] || '') && ['.html', '.js', '.css', '.svg', '.json', '.webmanifest'].includes(ext)) {
      const k = rel + st.mtimeMs; let z = zcache.get(k);
      if (!z) { z = zlib.gzipSync(body); zcache.set(k, z); }
      body = z; h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding';
    }
    send(res, 200, req.method === 'HEAD' ? '' : body, Object.assign(h, { 'Content-Length': body.length }));
  }

  const SEC = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin'
  };
  const server = http.createServer(async (req, res) => {
    Object.entries(SEC).forEach(([k, v]) => res.setHeader(k, v));
    if (isSecure(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else serveStatic(req, res, decodeURIComponent(url.pathname));
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return json(res, e.status, { error: e.code, message: e.message });
      console.error('Serverfehler:', e && e.stack || e);
      json(res, 500, { error: 'server', message: 'Interner Fehler.' });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  server.on('close', () => { clearInterval(sweep); try { db.close(); } catch (e) { /* ignore */ } });
  return server;
}

module.exports = { createServer };
if (require.main === module) {
  const s = createServer();
  s.listen(CFG.port, CFG.host, () => console.log(`AutoPot Grow läuft auf http://${CFG.host === '0.0.0.0' ? 'localhost' : CFG.host}:${CFG.port} (Registrierung: ${CFG.registration ? 'offen' : 'geschlossen'})`));
  const stop = () => s.close(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
