'use strict';
/* AutoPot Grow – Server ohne Fremdpakete (Node >= 22.5). Start: node server/server.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const C = require('./crypto');
const T = require('./totp');
const { openDb, loadPepper } = require('./db');

const ROOT = path.join(__dirname, '..');
const CFG = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'server-data'),
  regMode: ['open', 'invite', 'closed'].includes(process.env.REGISTRATION) ? process.env.REGISTRATION : 'open', /* open | invite | closed */
  powBits: Number(process.env.POW_BITS ?? 16),          /* Rechenaufgabe gegen Bots bei offener Registrierung (0 = aus) */
  maxUsers: Number(process.env.MAX_USERS || 0),           /* 0 = unbegrenzt */
  regDailyMax: Number(process.env.REG_DAILY_MAX || 50),   /* neue Konten pro 24 h insgesamt */
  userQuotaMB: Number(process.env.USER_QUOTA_MB || 200),  /* Speicher pro Konto */
  metricsToken: process.env.METRICS_TOKEN || '',          /* aktiviert /api/metrics (Bearer-Token) */
  accessLog: false,
  trustProxy: process.env.TRUST_PROXY === '1',
  ipHeader: (process.env.CLIENT_IP_HEADER || '').toLowerCase(),
  sessionDays: Number(process.env.SESSION_DAYS || 30),     /* gleitend: verlängert sich bei Nutzung */
  sessionMaxDays: Number(process.env.SESSION_MAX_DAYS || 90), /* absolut: danach immer neu anmelden */
  apiPerMinute: Number(process.env.API_RATE_PER_MIN || 300),
  registerPerHour: Number(process.env.REG_PER_HOUR || 5),     /* pro IP */
  loginPer10Min: Number(process.env.LOGIN_PER_10MIN || 20),   /* pro IP */
  kdfConcurrency: Number(process.env.KDF_CONCURRENCY || 4),
  kdfQueue: 64,
  maxPhotosPerUser: 800,
  maxStateBytes: 3 * 1024 * 1024,
  maxPhotoBytes: 700 * 1024,
  logLimit: 60
};
const DAY = 864e5;

function createServer(overrides = {}) {
  const cfg = Object.assign({}, CFG, overrides);
  if (typeof overrides.registration === 'boolean' && !overrides.regMode) cfg.regMode = overrides.registration ? 'open' : 'closed';
  cfg.registration = cfg.regMode !== 'closed';
  const db = openDb(cfg.dataDir);
  const pepper = loadPepper(cfg.dataDir);
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email_hash = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    addUser: db.prepare('INSERT INTO users (email_hash, salt, verifier, wrap_dek, rec_salt, wrap_dek_rec, created_at) VALUES (?,?,?,?,?,?,?)'),
    updUser: db.prepare('UPDATE users SET salt=?, verifier=?, wrap_dek=?, rec_salt=?, wrap_dek_rec=? WHERE id=?'),
    setTotp: db.prepare('UPDATE users SET totp_wrapped=?, totp_step=? WHERE id=?'),
    setTotpStep: db.prepare('UPDATE users SET totp_step=? WHERE id=?'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
    addSession: db.prepare('INSERT INTO sessions (token_hash, user_id, dek_wrapped, created_at, last_seen, expires_at, absolute_expires, label) VALUES (?,?,?,?,?,?,?,?)'),
    getSession: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    listSessions: db.prepare('SELECT token_hash, created_at, last_seen, label FROM sessions WHERE user_id = ? ORDER BY last_seen DESC'),
    touchSession: db.prepare('UPDATE sessions SET last_seen=?, expires_at=? WHERE token_hash=?'),
    delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    delSessionById: db.prepare('DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, 24) = ? AND token_hash != ?'),
    delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
    delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ? OR (absolute_expires > 0 AND absolute_expires < ?)'),
    getDoc: db.prepare('SELECT version, blob, updated_at FROM docs WHERE user_id=? AND kind=?'),
    putDoc: db.prepare('INSERT INTO docs (user_id, kind, version, blob, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id, kind) DO UPDATE SET version=excluded.version, blob=excluded.blob, updated_at=excluded.updated_at'),
    listPhotos: db.prepare('SELECT id FROM photos WHERE user_id=? ORDER BY id'),
    countPhotos: db.prepare('SELECT COUNT(*) AS n FROM photos WHERE user_id=?'),
    getPhoto: db.prepare('SELECT blob FROM photos WHERE user_id=? AND id=?'),
    putPhoto: db.prepare('INSERT INTO photos (user_id, id, blob, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, id) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at'),
    delPhoto: db.prepare('DELETE FROM photos WHERE user_id=? AND id=?'),
    allPhotos: db.prepare('SELECT id, blob FROM photos WHERE user_id=?'),
    addEvent: db.prepare('INSERT INTO sec_events (user_id, type, at) VALUES (?,?,?)'),
    listEvents: db.prepare('SELECT type, at FROM sec_events WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT ?'),
    countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
    countNewUsers: db.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at > ?'),
    countSessions: db.prepare('SELECT COUNT(*) AS n FROM sessions'),
    setLastLogin: db.prepare('UPDATE users SET last_login=? WHERE id=?'),
    usage: db.prepare('SELECT (SELECT COALESCE(SUM(length(blob)),0) FROM docs WHERE user_id=?) + (SELECT COALESCE(SUM(length(blob)),0) FROM photos WHERE user_id=?) AS b'),
    docLen: db.prepare('SELECT COALESCE(length(blob),0) AS b FROM docs WHERE user_id=? AND kind=?'),
    photoLen: db.prepare('SELECT COALESCE(length(blob),0) AS b FROM photos WHERE user_id=? AND id=?'),
    useInvite: db.prepare('UPDATE invites SET uses_left = uses_left - 1 WHERE code_hash=? AND uses_left > 0 AND (expires_at IS NULL OR expires_at > ?)'),
    refundInvite: db.prepare('UPDATE invites SET uses_left = uses_left + 1 WHERE code_hash=?'),
    getFail: db.prepare('SELECT * FROM login_fails WHERE key=?'),
    putFail: db.prepare('INSERT OR REPLACE INTO login_fails (key, n, first, until) VALUES (?,?,?,?)'),
    delFail: db.prepare('DELETE FROM login_fails WHERE key=?'),
    purgeFails: db.prepare('DELETE FROM login_fails WHERE until < ? AND first < ?'),
    trimEvents: db.prepare('DELETE FROM sec_events WHERE user_id = ? AND id NOT IN (SELECT id FROM sec_events WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT ?)')
  };
  const logEvent = (userId, type) => { try { const now = Date.now(); q.addEvent.run(userId, type, now); q.trimEvents.run(userId, userId, cfg.logLimit); } catch (e) { /* Protokoll darf nie den Ablauf stören */ } };

  /* ---------- Begrenzungen (im Speicher) ---------- */
  const hits = new Map();   /* Schlüssel -> Zeitstempel */
  /* Fehlversuche/Sperren liegen in der Datenbank (überstehen Neustarts); Schlüssel nur als HMAC – keine IP-Adressen im Klartext */
  const fkey = k => crypto.createHmac('sha256', pepper).update('fail:' + k).digest('hex').slice(0, 40);
  const rateOk = (key, max, windowMs) => {
    const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) { hits.set(key, arr); return false; }
    arr.push(now); hits.set(key, arr);
    return true;
  };
  const locked = key => { const f = q.getFail.get(fkey(key)); return !!(f && f.until > Date.now()); };
  /* Fehlversuch zählen: nach `max` Fehlern im Fenster wird der Schlüssel 15 min gesperrt */
  const failed = (key, max, windowMs = 3600e3) => {
    const now = Date.now();
    const k = fkey(key), row = q.getFail.get(k);
    const f = !row || now - row.first > windowMs ? { n: 0, first: now, until: row ? row.until : 0 } : { n: row.n, first: row.first, until: row.until };
    f.n++;
    if (f.n >= max) { f.until = now + 15 * 60e3; f.n = 0; f.first = now; }
    q.putFail.run(k, f.n, f.first, f.until);
  };
  /* Sperre pro (Konto + IP) – und zusätzlich pro Konto mit höherer Schwelle.
     So kann ein Angreifer von einer IP aus dein Konto nicht dauerhaft für dich sperren. */
  const loginKeys = (eh, ip) => [`${eh}|${ip}`, eh];
  const isLocked = (eh, ip) => locked(`${eh}|${ip}`) || locked(eh);
  const loginFailed = (eh, ip) => { failed(`${eh}|${ip}`, 8); failed(eh, 40); };
  const loginOk = (eh, ip) => loginKeys(eh, ip).forEach(k => q.delFail.run(fkey(k)));

  /* Schlüsselableitung (scrypt, 32 MB RAM) begrenzen: schützt vor Überlastung durch Massen-Logins */
  let kdfActive = 0;
  const kdfWaiting = [];
  async function kdf(fn) {
    if (kdfActive >= cfg.kdfConcurrency) {
      if (kdfWaiting.length >= cfg.kdfQueue) throw err(503, 'busy', 'Der Server ist gerade ausgelastet. Bitte gleich noch einmal versuchen.');
      await new Promise(r => kdfWaiting.push(r));
    }
    kdfActive++;
    try { return await fn(); }
    finally { kdfActive--; const next = kdfWaiting.shift(); if (next) next(); }
  }

  const pendingTotp = new Map(); /* Sitzung -> {secret, until} während der Einrichtung */
  const usedChallenges = new Map(); /* Bot-Schutz: bereits verwendete Aufgaben -> Ablaufzeit */
  const powKey = crypto.createHmac('sha256', pepper).update('pow-key').digest();
  const METRICS = { started: Date.now(), req: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, login_ok: 0, login_fail: 0, register: 0, rate_limited: 0 };
  function newChallenge() {
    const body = `${Date.now()}.${crypto.randomBytes(12).toString('base64url')}`;
    return `${body}.${crypto.createHmac('sha256', powKey).update(body).digest('base64url').slice(0, 22)}`;
  }
  const leadingZeroBits = buf => { let n = 0; for (const b of buf) { if (b === 0) { n += 8; continue; } n += Math.clz32(b) - 24; break; } return n; };
  function checkPow(challenge, nonce) {
    if (typeof challenge !== 'string' || typeof nonce !== 'string' || challenge.length > 120 || nonce.length > 24) return false;
    const parts = challenge.split('.');
    if (parts.length !== 3) return false;
    const body = parts[0] + '.' + parts[1], mac = crypto.createHmac('sha256', powKey).update(body).digest('base64url').slice(0, 22);
    if (!C.safeEq(Buffer.from(mac), Buffer.from(parts[2]))) return false;
    const ts = Number(parts[0]);
    if (!(ts > Date.now() - 10 * 60e3 && ts <= Date.now() + 5e3) || usedChallenges.has(challenge)) return false;
    if (leadingZeroBits(crypto.createHash('sha256').update(challenge + ':' + nonce).digest()) < cfg.powBits) return false;
    usedChallenges.set(challenge, ts + 10 * 60e3);
    return true;
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    q.purgeSessions.run(now, now);
    for (const [k, v] of hits) { const a = v.filter(t => now - t < 3600e3); a.length ? hits.set(k, a) : hits.delete(k); }
    q.purgeFails.run(now, now - 3600e3);
    for (const [k, t] of usedChallenges) if (t < now) usedChallenges.delete(k);
    for (const [k, p] of pendingTotp) if (p.until < now) pendingTotp.delete(k);
  }, 300e3);
  sweep.unref();

  /* ---------- Helfer ---------- */
  class HttpError extends Error { constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; } }
  const err = (s, c, m, x) => new HttpError(s, c, m, x);
  const isSecure = req => !!req.socket.encrypted || (cfg.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  /* Client-IP: hinter einem Proxy der rechte (vom Proxy selbst angehängte) Eintrag in X-Forwarded-For – linke Einträge kann der Client fälschen.
     Hinter Cloudflare: CLIENT_IP_HEADER=cf-connecting-ip (nur sicher, wenn der Server ausschließlich Cloudflare-Verbindungen annimmt). */
  const clientIp = req => {
    if (cfg.trustProxy) {
      if (cfg.ipHeader) { const v = String(req.headers[cfg.ipHeader] || '').trim(); if (v) return v.slice(0, 64); }
      const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
      if (xff.length) return xff[xff.length - 1].slice(0, 64);
    }
    return req.socket.remoteAddress || '?';
  };
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
      const ct = String(req.headers['content-type'] || '');
      if (req.headers['content-length'] && Number(req.headers['content-length']) > limit) { reject(err(413, 'too_large', 'Die Daten sind zu groß.')); return; }
      const chunks = []; let n = 0;
      req.on('data', c => { n += c.length; if (n > limit) { reject(err(413, 'too_large', 'Die Daten sind zu groß.')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (!n) return resolve({});
        if (!/^application\/json\b/i.test(ct)) return reject(err(415, 'bad_type', 'Nur JSON wird angenommen.'));
        try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {}); }
        catch (e) { reject(err(400, 'bad_json', 'Ungültige Anfrage.')); }
      });
      req.on('error', reject);
    });
  }
  const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
  const COMMON = new Set(['passwort123', 'password123', '1234567890', 'qwertzuiop', 'qwertyuiop', 'password12', 'passwort12', 'abcdefghij', '0123456789', 'iloveyou12', 'hallo12345', 'autopotgrow', 'autopot123', 'growgrow12', 'cannabis123', 'qwertz1234', 'asdfghjkl1', '1q2w3e4r5t', 'passwort1234', 'password1234']);
  function checkPassword(pw, email) {
    if (typeof pw !== 'string' || pw.length < 10) throw err(400, 'weak_password', 'Das Passwort muss mindestens 10 Zeichen lang sein.');
    if (pw.length > 200) throw err(400, 'weak_password', 'Das Passwort ist zu lang (max. 200 Zeichen).');
    const low = pw.toLowerCase();
    if (COMMON.has(low) || /^(.)\1+$/.test(pw) || new Set(pw).size < 5) throw err(400, 'weak_password', 'Dieses Passwort ist zu einfach.');
    if (/^(?:0123456789|1234567890|abcdefghij)/.test(low)) throw err(400, 'weak_password', 'Dieses Passwort ist zu einfach.');
    if (email) { const local = email.split('@')[0]; if (local.length >= 4 && low.includes(local)) throw err(400, 'weak_password', 'Das Passwort darf deine E-Mail-Adresse nicht enthalten.'); }
  }
  function checkEmail(email) {
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email.trim())) throw err(400, 'bad_email', 'Bitte eine gültige E-Mail-Adresse angeben.');
    return email.trim().toLowerCase();
  }
  /* Grobe Gerätebezeichnung aus dem User-Agent (wird verschlüsselt gespeichert) */
  function deviceLabel(ua) {
    ua = String(ua || '');
    const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const o = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unbekannt';
    return `${b} · ${o}`;
  }

  async function startSession(req, res, userId, dek) {
    const token = crypto.randomBytes(32).toString('base64url'), now = Date.now();
    const exp = Math.min(now + cfg.sessionDays * DAY, now + cfg.sessionMaxDays * DAY);
    q.addSession.run(C.sha256(Buffer.from(token)).toString('hex'), userId, C.seal(C.sessionKey(token), dek, 'sess'), now, now, exp, now + cfg.sessionMaxDays * DAY, C.seal(dek, Buffer.from(deviceLabel(req.headers['user-agent'])), `u${userId}:label`));
    setCookie(res, req, token, Math.round((exp - now) / 1000));
  }
  /* Sitzung aus Cookie laden: liefert {userId, dek, tokenHash} oder wirft 401 */
  function auth(req) {
    const token = cookies(req)[cookieName(req)];
    if (!token || token.length > 100) throw err(401, 'unauthorized', 'Bitte anmelden.');
    const th = C.sha256(Buffer.from(token)).toString('hex'), s = q.getSession.get(th), now = Date.now();
    if (!s || s.expires_at < now || (s.absolute_expires && s.absolute_expires < now)) throw err(401, 'unauthorized', 'Sitzung abgelaufen. Bitte neu anmelden.');
    let dek;
    try { dek = C.open(C.sessionKey(token), s.dek_wrapped, 'sess'); } catch (e) { throw err(401, 'unauthorized', 'Sitzung ungültig.'); }
    const owner = q.userById.get(s.user_id);
    if (!owner || owner.disabled) throw err(401, 'unauthorized', 'Dieses Konto ist gesperrt.');
    if (now - s.last_seen > 36e5) q.touchSession.run(now, Math.min(now + cfg.sessionDays * DAY, s.absolute_expires || Infinity), th);
    return { userId: s.user_id, dek, tokenHash: th };
  }
  function csrfCheck(req) {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return;
    if (req.headers['x-requested-with'] !== 'autopot') throw err(403, 'csrf', 'Anfrage abgelehnt.');
    const o = req.headers.origin;
    if (o) { let h; try { h = new URL(o).host; } catch (e) { h = ''; } if (h !== req.headers.host) throw err(403, 'csrf', 'Anfrage abgelehnt.'); }
    const site = req.headers['sec-fetch-site'];
    if (site && !['same-origin', 'none'].includes(site)) throw err(403, 'csrf', 'Anfrage abgelehnt.');
  }
  const dummyRow = (async () => { const a = await C.createAccount('dummy-password-for-timing'); return a.row; })();
  const sealJson = (dek, obj, aad) => C.seal(dek, Buffer.from(JSON.stringify(obj)), aad);
  const openJson = (dek, blob, aad) => JSON.parse(C.open(dek, blob, aad).toString('utf8'));
  const PHOTO_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const totpSecretOf = (user, dek) => (user.totp_wrapped ? C.open(dek, user.totp_wrapped, `u${user.id}:totp`) : null);

  /* ---------- API ---------- */
  async function api(req, res, url) {
    const p = url.pathname, m = req.method, ip = clientIp(req);
    if (!rateOk('api:' + ip, cfg.apiPerMinute, 60e3)) throw err(429, 'rate_limited', 'Zu viele Anfragen. Bitte kurz warten.');
    if (p === '/api/health' && m === 'GET') {
      let dbOk = false; try { dbOk = db.prepare('SELECT 1 AS x').get().x === 1; } catch (e) { /* unten */ }
      return json(res, dbOk ? 200 : 503, { ok: dbOk, uptime: Math.round((Date.now() - METRICS.started) / 1000) });
    }
    if (p === '/api/config' && m === 'GET') return json(res, 200, { registration: cfg.registration, mode: cfg.regMode, pow: cfg.regMode === 'open' ? cfg.powBits : 0, version: 7 });
    if (p === '/api/metrics' && m === 'GET') {
      const auth2 = String(req.headers.authorization || '');
      if (!cfg.metricsToken || !C.safeEq(Buffer.from(auth2), Buffer.from('Bearer ' + cfg.metricsToken))) throw err(404, 'not_found', 'Nicht gefunden.');
      let dbBytes = 0; try { dbBytes = fs.statSync(path.join(cfg.dataDir, 'autopot.sqlite')).size; } catch (e) { /* ignore */ }
      const lines = ['# TYPE autopot_users gauge', `autopot_users ${q.countUsers.get().n}`, '# TYPE autopot_sessions gauge', `autopot_sessions ${q.countSessions.get().n}`,
        '# TYPE autopot_db_bytes gauge', `autopot_db_bytes ${dbBytes}`, '# TYPE autopot_uptime_seconds gauge', `autopot_uptime_seconds ${Math.round((Date.now() - METRICS.started) / 1000)}`,
        '# TYPE autopot_requests_total counter', ...Object.entries(METRICS.req).map(([k, v]) => `autopot_requests_total{class="${k}"} ${v}`),
        '# TYPE autopot_logins_total counter', `autopot_logins_total{result="ok"} ${METRICS.login_ok}`, `autopot_logins_total{result="fail"} ${METRICS.login_fail}`,
        '# TYPE autopot_registrations_total counter', `autopot_registrations_total ${METRICS.register}`, '# TYPE autopot_rate_limited_total counter', `autopot_rate_limited_total ${METRICS.rate_limited}`];
      return send(res, 200, lines.join('\n') + '\n', { 'Content-Type': 'text/plain; version=0.0.4', 'Cache-Control': 'no-store' });
    }
    if (p === '/api/challenge' && m === 'GET') {
      if (!rateOk('chal:' + ip, 30, 60e3)) throw err(429, 'rate_limited', 'Zu viele Anfragen. Bitte kurz warten.');
      return json(res, 200, { challenge: newChallenge(), bits: cfg.powBits });
    }
    if (p === '/api/session' && m === 'GET') {
      try { const s = auth(req), u = q.userById.get(s.userId); return json(res, 200, { authenticated: true, createdAt: u.created_at, totp: !!u.totp_wrapped }); }
      catch (e) { if (e instanceof HttpError) return json(res, 200, { authenticated: false }); throw e; }
    }
    csrfCheck(req);

    if (p === '/api/register' && m === 'POST') {
      if (cfg.regMode === 'closed') throw err(403, 'closed', 'Die Registrierung ist derzeit geschlossen.');
      if (!rateOk('reg:' + ip, cfg.registerPerHour, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Registrierungen. Bitte später erneut versuchen.');
      const b = await readBody(req, 4096);
      if (b.adult !== true) throw err(400, 'adult_required', 'Die Nutzung ist erst ab 18 Jahren erlaubt. Bitte das Alter bestätigen.');
      if (b.terms !== true) throw err(400, 'terms_required', 'Bitte den Nutzungsbedingungen und der Datenschutzerklärung zustimmen.');
      const email = checkEmail(b.email); checkPassword(b.password, email);
      let inviteHash = null;
      if (cfg.regMode === 'invite') {
        inviteHash = C.inviteHash(str(b.invite, 40));
        if (!str(b.invite, 40) || Number(q.useInvite.run(inviteHash, Date.now()).changes) !== 1) throw err(403, 'bad_invite', 'Der Einladungscode ist ungültig, abgelaufen oder bereits verbraucht.');
      } else if (cfg.powBits > 0 && !checkPow(b.challenge, b.nonce)) throw err(400, 'bad_challenge', 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte erneut versuchen.');
      const refund = () => { if (inviteHash) q.refundInvite.run(inviteHash); };
      if (cfg.maxUsers > 0 && q.countUsers.get().n >= cfg.maxUsers) { refund(); throw err(403, 'full', 'Es können derzeit keine neuen Konten angelegt werden.'); }
      if (cfg.regDailyMax > 0 && q.countNewUsers.get(Date.now() - DAY).n >= cfg.regDailyMax) { refund(); throw err(429, 'busy', 'Heute wurden bereits sehr viele Konten angelegt. Bitte morgen erneut versuchen.'); }
      const eh = C.emailHash(pepper, email);
      if (q.userByEmail.get(eh)) { refund(); throw err(409, 'exists', 'Diese E-Mail-Adresse ist bereits registriert.'); }
      let acc;
      try { acc = await kdf(() => C.createAccount(b.password)); } catch (e) { refund(); throw e; }
      const r = acc.row;
      let id;
      try { id = Number(q.addUser.run(eh, r.salt, r.verifier, r.wrap_dek, r.rec_salt, r.wrap_dek_rec, Date.now()).lastInsertRowid); }
      catch (e) { refund(); throw err(409, 'exists', 'Diese E-Mail-Adresse ist bereits registriert.'); }
      METRICS.register++; q.setLastLogin.run(Date.now(), id);
      await startSession(req, res, id, acc.dek);
      logEvent(id, 'register');
      return json(res, 201, { ok: true, recoveryCode: acc.recovery });
    }

    if (p === '/api/login' && m === 'POST') {
      if (!rateOk('login:' + ip, cfg.loginPer10Min, 600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.');
      const b = await readBody(req, 4096);
      const email = checkEmail(b.email), eh = C.emailHash(pepper, email);
      if (isLocked(eh, ip)) throw err(429, 'locked', 'Zu viele Fehlversuche. Anmelden ist für 15 Minuten gesperrt.');
      const user = q.userByEmail.get(eh);
      const row = user || await dummyRow;   /* unbekanntes Konto: gleiche Rechenzeit, damit Konten nicht erratbar sind */
      const dek = await kdf(() => C.unlock(row, str(b.password)));
      const dk = user ? dek : null;
      if (!user || !dk) { METRICS.login_fail++; loginFailed(eh, ip); if (user) logEvent(user.id, 'login_failed'); throw err(401, 'bad_login', 'E-Mail oder Passwort ist falsch.'); }
      if (user.totp_wrapped) {
        if (!b.totp) return json(res, 401, { error: 'totp_required', message: 'Bitte den 6-stelligen Code aus deiner Authenticator-App eingeben.' });
        const step = T.verify(totpSecretOf(user, dk), b.totp, user.totp_step);
        if (step < 0) { loginFailed(eh, ip); logEvent(user.id, 'totp_failed'); throw err(401, 'bad_totp', 'Der Code ist falsch oder abgelaufen.'); }
        q.setTotpStep.run(step, user.id);
      }
      if (user.disabled) throw err(403, 'disabled', 'Dieses Konto ist gesperrt. Bitte wende dich an den Betreiber.');
      loginOk(eh, ip);
      await startSession(req, res, user.id, dk);
      METRICS.login_ok++; q.setLastLogin.run(Date.now(), user.id);
      logEvent(user.id, 'login');
      return json(res, 200, { ok: true });
    }

    if (p === '/api/recover' && m === 'POST') {
      if (!rateOk('rec:' + ip, 8, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche. Bitte später erneut versuchen.');
      const b = await readBody(req, 4096);
      const email = checkEmail(b.email); checkPassword(b.newPassword, email);
      const eh = C.emailHash(pepper, email), user = q.userByEmail.get(eh);
      if (locked('rec:' + eh)) throw err(429, 'locked', 'Zu viele Fehlversuche. Bitte später erneut versuchen.');
      const recRow = user || await dummyRow;
      const dek = await kdf(() => C.unlockWithRecovery(recRow, str(b.recoveryCode, 80)));
      if (!user || !dek) { failed('rec:' + eh, 8); throw err(401, 'bad_recovery', 'E-Mail oder Wiederherstellungscode ist falsch.'); }
      const nw = await kdf(() => C.rewrap(dek, b.newPassword)), r = nw.row;
      q.updUser.run(r.salt, r.verifier, r.wrap_dek, r.rec_salt, r.wrap_dek_rec, user.id);
      const had2fa = !!user.totp_wrapped;
      if (had2fa) q.setTotp.run(null, 0, user.id);   /* Wiederherstellungscode = Generalschlüssel: setzt auch 2FA zurück */
      q.delUserSessions.run(user.id);
      loginOk(eh, ip);
      await startSession(req, res, user.id, dek);
      logEvent(user.id, 'recovery_used'); if (had2fa) logEvent(user.id, '2fa_disabled');
      return json(res, 200, { ok: true, recoveryCode: nw.recovery, totpReset: had2fa });
    }

    /* ab hier: angemeldet */
    const s = auth(req);
    if (!rateOk('user:' + s.userId, cfg.apiPerMinute, 60e3)) throw err(429, 'rate_limited', 'Zu viele Anfragen. Bitte kurz warten.');
    if (p === '/api/logout' && m === 'POST') { q.delSession.run(s.tokenHash); pendingTotp.delete(s.tokenHash); setCookie(res, req, '', 0); return json(res, 200, { ok: true }); }
    if (p === '/api/me' && m === 'GET') {
      const u = q.userById.get(s.userId);
      return json(res, 200, { ok: true, createdAt: u.created_at, photos: q.countPhotos.get(s.userId).n, totp: !!u.totp_wrapped, usageBytes: q.usage.get(s.userId, s.userId).b, quotaBytes: cfg.userQuotaMB * 1048576 });
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
      const now = Date.now(), blob = sealJson(s.dek, b.data, `u${s.userId}:state`);
      const old = q.docLen.get(s.userId, 'state');
      if (q.usage.get(s.userId, s.userId).b - (old ? old.b : 0) + blob.length > cfg.userQuotaMB * 1048576) throw err(413, 'quota', 'Dein Speicherplatz ist voll. Bitte alte Fotos löschen oder einen Grow abschließen.');
      q.putDoc.run(s.userId, 'state', curV + 1, blob, now);
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
        const blob = C.seal(s.dek, Buffer.from(b.data), `u${s.userId}:photo:${id}`), old = q.photoLen.get(s.userId, id);
        if (q.usage.get(s.userId, s.userId).b - (old ? old.b : 0) + blob.length > cfg.userQuotaMB * 1048576) throw err(413, 'quota', 'Dein Speicherplatz ist voll. Bitte alte Fotos löschen.');
        q.putPhoto.run(s.userId, id, blob, Date.now());
        return json(res, 200, { ok: true });
      }
      if (m === 'DELETE') { q.delPhoto.run(s.userId, id); return json(res, 200, { ok: true }); }
    }

    /* Geräte / Sitzungen */
    if (p === '/api/sessions' && m === 'GET') {
      const list = q.listSessions.all(s.userId).map(r => {
        let label = 'Unbekanntes Gerät';
        if (r.label) { try { label = C.open(s.dek, r.label, `u${s.userId}:label`).toString('utf8'); } catch (e) { /* ignorieren */ } }
        return { id: r.token_hash.slice(0, 24), current: r.token_hash === s.tokenHash, createdAt: r.created_at, lastSeen: r.last_seen, label };
      });
      return json(res, 200, { sessions: list });
    }
    if (p === '/api/sessions/others' && m === 'DELETE') { const n = q.delOtherSessions.run(s.userId, s.tokenHash).changes; if (n) logEvent(s.userId, 'sessions_revoked'); return json(res, 200, { ok: true, removed: Number(n) }); }
    const sm = /^\/api\/sessions\/([a-f0-9]{24})$/.exec(p);
    if (sm && m === 'DELETE') {
      const n = q.delSessionById.run(s.userId, sm[1], s.tokenHash).changes;
      if (!n) throw err(404, 'not_found', 'Sitzung nicht gefunden.');
      logEvent(s.userId, 'session_revoked');
      return json(res, 200, { ok: true });
    }

    if (p === '/api/security-log' && m === 'GET') return json(res, 200, { events: q.listEvents.all(s.userId, cfg.logLimit) });

    /* Zwei-Faktor-Anmeldung */
    if (p === '/api/2fa/setup' && m === 'POST') {
      const u = q.userById.get(s.userId);
      if (u.totp_wrapped) throw err(409, 'exists', 'Die Zwei-Faktor-Anmeldung ist bereits aktiv.');
      const secret = T.newSecret();
      pendingTotp.set(s.tokenHash, { secret, until: Date.now() + 10 * 60e3 });
      return json(res, 200, { secret: T.base32(secret), uri: T.uri(secret, 'Konto ' + new Date(u.created_at).toISOString().slice(0, 10)) });
    }
    if (p === '/api/2fa/enable' && m === 'POST') {
      const b = await readBody(req, 1024), pend = pendingTotp.get(s.tokenHash);
      if (!pend || pend.until < Date.now()) throw err(400, 'expired', 'Die Einrichtung ist abgelaufen. Bitte neu starten.');
      if (!rateOk('2fa:' + s.userId, 10, 600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche.');
      const step = T.verify(pend.secret, b.code, 0);
      if (step < 0) throw err(400, 'bad_totp', 'Der Code stimmt nicht. Uhrzeit des Handys prüfen und erneut versuchen.');
      q.setTotp.run(C.seal(s.dek, pend.secret, `u${s.userId}:totp`), step, s.userId);
      pendingTotp.delete(s.tokenHash);
      logEvent(s.userId, '2fa_enabled');
      return json(res, 200, { ok: true });
    }
    if (p === '/api/2fa/disable' && m === 'POST') {
      const b = await readBody(req, 4096), u = q.userById.get(s.userId);
      if (!u.totp_wrapped) return json(res, 200, { ok: true });
      if (!rateOk('2fa:' + s.userId, 10, 600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche.');
      if (!(await kdf(() => C.unlock(u, str(b.password))))) throw err(401, 'bad_login', 'Das Passwort ist falsch.');
      if (T.verify(totpSecretOf(u, s.dek), b.code, u.totp_step) < 0) throw err(401, 'bad_totp', 'Der Code ist falsch oder abgelaufen.');
      q.setTotp.run(null, 0, s.userId);
      logEvent(s.userId, '2fa_disabled');
      return json(res, 200, { ok: true });
    }

    if (p === '/api/password' && m === 'POST') {
      const b = await readBody(req, 4096);
      checkPassword(b.newPassword);
      if (!rateOk('pw:' + s.userId, 10, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche.');
      const user = q.userById.get(s.userId);
      const dek = await kdf(() => C.unlock(user, str(b.currentPassword)));
      if (!dek) throw err(401, 'bad_login', 'Das aktuelle Passwort ist falsch.');
      const nw = await kdf(() => C.rewrap(dek, b.newPassword)), r = nw.row;
      q.updUser.run(r.salt, r.verifier, r.wrap_dek, r.rec_salt, r.wrap_dek_rec, user.id);
      q.delOtherSessions.run(user.id, s.tokenHash);
      logEvent(user.id, 'password_changed');
      return json(res, 200, { ok: true, recoveryCode: nw.recovery });
    }

    if (p === '/api/recovery-code' && m === 'POST') {
      const b = await readBody(req, 4096);
      if (!rateOk('rc:' + s.userId, 5, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche.');
      const user = q.userById.get(s.userId), pw = str(b.password);
      const dek = await kdf(() => C.unlock(user, pw));
      if (!dek) throw err(401, 'bad_login', 'Das Passwort ist falsch.');
      const nw = await kdf(() => C.rewrap(dek, pw)), r = nw.row;
      q.updUser.run(r.salt, r.verifier, r.wrap_dek, r.rec_salt, r.wrap_dek_rec, user.id);
      logEvent(user.id, 'recovery_regenerated');
      return json(res, 200, { ok: true, recoveryCode: nw.recovery });
    }

    if (p === '/api/export' && m === 'GET') {
      if (!rateOk('export:' + s.userId, 10, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Exporte. Bitte später erneut versuchen.');
      const d = q.getDoc.get(s.userId, 'state');
      const state = d ? openJson(s.dek, d.blob, `u${s.userId}:state`) : null;
      const photos = {};
      q.allPhotos.all(s.userId).forEach(r => { photos[r.id] = C.open(s.dek, r.blob, `u${s.userId}:photo:${r.id}`).toString('utf8'); });
      const u = q.userById.get(s.userId);
      logEvent(s.userId, 'export');
      return json(res, 200, { exportedAt: new Date().toISOString(), accountCreatedAt: new Date(u.created_at).toISOString(), twoFactor: !!u.totp_wrapped, securityLog: q.listEvents.all(s.userId, cfg.logLimit).map(e => ({ type: e.type, at: new Date(e.at).toISOString() })), state, photos });
    }

    if (p === '/api/account' && m === 'DELETE') {
      const b = await readBody(req, 4096);
      if (!rateOk('del:' + s.userId, 5, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Versuche.');
      const user = q.userById.get(s.userId);
      if (!(await kdf(() => C.unlock(user, str(b.password))))) throw err(401, 'bad_login', 'Das Passwort ist falsch.');
      if (user.totp_wrapped && T.verify(totpSecretOf(user, s.dek), b.code, user.totp_step) < 0) throw err(401, 'bad_totp', 'Bitte zusätzlich einen gültigen Code aus der Authenticator-App eingeben.');
      q.delUser.run(user.id);   /* Sitzungen, Dokumente, Fotos und Protokoll folgen per ON DELETE CASCADE */
      setCookie(res, req, '', 0);
      return json(res, 200, { ok: true });
    }
    throw err(404, 'not_found', 'Nicht gefunden.');
  }

  /* ---------- Statische Dateien (nur freigegebene Liste) ---------- */
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
  const PUBLIC = new Set(['index.html', 'app.html', 'anleitung.html', 'datenschutz.html', 'impressum.html', 'nutzungsbedingungen.html', 'app.js', 'app.css', 'qr.js', 'pow-worker.js', 'anleitung.js', 'theme-init.js', 'site.css', 'site.js', 'sw.js', 'robots.txt', '.well-known/security.txt',
    'img/preview-dark.jpg', 'img/preview-light.jpg', 'img/preview-mobile.jpg', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png']);
  const ALIASES = { '/': 'index.html', '/app': 'app.html', '/anleitung': 'anleitung.html', '/datenschutz': 'datenschutz.html', '/impressum': 'impressum.html', '/nutzungsbedingungen': 'nutzungsbedingungen.html' };
  const fcache = new Map();
  function serveStatic(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) throw err(405, 'method', 'Methode nicht erlaubt.');
    const rel = ALIASES[pathname] || pathname.replace(/^\/+/, '');
    if (!PUBLIC.has(rel)) throw err(404, 'not_found', 'Seite nicht gefunden.');
    const file = path.join(ROOT, rel);
    let st; try { st = fs.statSync(file); } catch (e) { throw err(404, 'not_found', 'Seite nicht gefunden.'); }
    const ext = path.extname(rel);
    const key = rel + ':' + st.mtimeMs;
    let ent = fcache.get(key);
    if (!ent) {
      const raw = fs.readFileSync(file);
      ent = { raw, etag: '"' + crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 20) + '"', gz: ['.html', '.js', '.css', '.svg', '.json', '.webmanifest', '.txt'].includes(ext) ? zlib.gzipSync(raw) : null };
      for (const k of fcache.keys()) if (k.startsWith(rel + ':')) fcache.delete(k);
      fcache.set(key, ent);
    }
    const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': rel === 'sw.js' || ext === '.html' ? 'no-cache' : 'public, max-age=3600', ETag: ent.etag, Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === ent.etag) { res.writeHead(304, h); return res.end(); }
    let body = ent.raw;
    if (ent.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = ent.gz; h['Content-Encoding'] = 'gzip'; }
    h['Content-Length'] = body.length;
    res.writeHead(200, h);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const SEC = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Permitted-Cross-Domain-Policies': 'none'
  };
  const routeOf = p => p.replace(/^\/api\/(photos|sessions)\/[^/]+$/, '/api/$1/:id');
  const server = http.createServer(async (req, res) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const cls = `${String(res.statusCode)[0]}xx`; if (METRICS.req[cls] != null) METRICS.req[cls]++;
      if (res.statusCode === 429) METRICS.rate_limited++;
      if (cfg.accessLog) { /* Zugriffsprotokoll ohne IP-Adressen und ohne Inhalte */
        let pth = '?'; try { pth = routeOf(new URL(req.url, 'http://x').pathname).slice(0, 80); } catch (e) { /* ignore */ }
        process.stdout.write(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: pth, s: res.statusCode, ms: Number((process.hrtime.bigint() - t0) / 1000000n) }) + '\n');
      }
    });
    Object.entries(SEC).forEach(([k, v]) => res.setHeader(k, v));
    if (!isSecure(req)) res.setHeader('Content-Security-Policy', SEC['Content-Security-Policy'].replace('; upgrade-insecure-requests', ''));
    else res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    try {
      if ((req.url || '').length > 2048) throw err(414, 'uri_too_long', 'Adresse zu lang.');
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else { let pn; try { pn = decodeURIComponent(url.pathname); } catch (e) { throw err(400, 'bad_path', 'Ungültige Adresse.'); } serveStatic(req, res, pn); }
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return json(res, e.status, Object.assign({ error: e.code, message: e.message }, e.extra || {}));
      console.error('Serverfehler:', e && e.stack || e);
      json(res, 500, { error: 'server', message: 'Interner Fehler.' });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 60;
  server.on('close', () => { clearInterval(sweep); try { db.close(); } catch (e) { /* ignore */ } });
  server.db = db; /* für Wartung/Backup */
  return server;
}

module.exports = { createServer, CFG };
if (require.main === module) {
  const s = createServer({ accessLog: process.env.LOG !== 'off' });
  const MODE = { open: 'offen', invite: 'nur mit Einladung', closed: 'geschlossen' };
  s.listen(CFG.port, CFG.host, () => console.log(`AutoPot Grow läuft auf http://${CFG.host === '0.0.0.0' ? 'localhost' : CFG.host}:${CFG.port} (Registrierung: ${MODE[CFG.regMode]}${CFG.regMode === 'open' && CFG.powBits ? `, Bot-Schutz ${CFG.powBits} Bit` : ''})`));
  const stop = () => s.close(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
