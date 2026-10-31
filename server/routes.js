'use strict';
/* Erweiterte Schnittstellen: News, geteilte Grows mit Meldungen, Team-Bereich (Moderation/Administration).
 * Wird von server.js mit einem Kontext-Objekt eingebunden. */
const crypto = require('crypto');

const ROLES = { user: 0, moderator: 1, admin: 2 };
const DAY = 864e5;

module.exports = function routes(ctx) {
  const { db, cfg, C, json, send, err, readBody, rateOk, str, HttpError } = ctx;
  const q = {
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    newsPublic: db.prepare('SELECT id, title, body, pinned, author_name, published_at, updated_at FROM news WHERE published = 1 ORDER BY pinned DESC, published_at DESC LIMIT ? OFFSET ?'),
    newsCountPublic: db.prepare('SELECT COUNT(*) n FROM news WHERE published = 1'),
    newsOne: db.prepare('SELECT * FROM news WHERE id = ?'),
    newsAll: db.prepare('SELECT * FROM news ORDER BY pinned DESC, COALESCE(published_at, created_at) DESC LIMIT 200'),
    newsAdd: db.prepare('INSERT INTO news (title, body, published, pinned, author_id, author_name, created_at, updated_at, published_at) VALUES (?,?,?,?,?,?,?,?,?)'),
    newsUpd: db.prepare('UPDATE news SET title=?, body=?, published=?, pinned=?, updated_at=?, published_at=? WHERE id=?'),
    newsDel: db.prepare('DELETE FROM news WHERE id=?'),
    shareAdd: db.prepare('INSERT INTO shares (token, user_id, title, data, created_at) VALUES (?,?,?,?,?)'),
    shareGet: db.prepare('SELECT * FROM shares WHERE token = ?'),
    shareView: db.prepare('UPDATE shares SET views = views + 1 WHERE token = ?'),
    sharesMine: db.prepare('SELECT token, title, created_at, views, hidden, length(data) AS bytes FROM shares WHERE user_id = ? ORDER BY created_at DESC'),
    shareCount: db.prepare('SELECT COUNT(*) n FROM shares WHERE user_id = ?'),
    shareDel: db.prepare('DELETE FROM shares WHERE token = ?'),
    shareHide: db.prepare('UPDATE shares SET hidden = ? WHERE token = ?'),
    reportAdd: db.prepare('INSERT INTO reports (share_token, reason, at) VALUES (?,?,?)'),
    reportsOpen: db.prepare(`SELECT r.id, r.share_token, r.reason, r.at, s.title, s.hidden, s.user_id, s.views,
      (SELECT COUNT(*) FROM reports r2 WHERE r2.share_token = r.share_token AND r2.status = 'open') AS total
      FROM reports r JOIN shares s ON s.token = r.share_token WHERE r.status = 'open' ORDER BY r.at DESC LIMIT 200`),
    reportsClose: db.prepare("UPDATE reports SET status = 'done' WHERE share_token = ? AND status = 'open'"),
    audit: db.prepare('INSERT INTO audit (actor_id, actor_role, action, target, at) VALUES (?,?,?,?,?)'),
    auditList: db.prepare('SELECT a.*, u.display_name FROM audit a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.at DESC, a.id DESC LIMIT 300'),
    setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    allSettings: db.prepare('SELECT key, value FROM settings'),
    usage: db.prepare('SELECT (SELECT COALESCE(SUM(length(blob)),0) FROM docs WHERE user_id=?) + (SELECT COALESCE(SUM(length(blob)),0) FROM photos WHERE user_id=?) AS b')
  };

  /* ---------- Einstellungen zur Laufzeit (überschreiben Umgebungsvariablen) ---------- */
  const SETTINGS = {
    regMode: v => (['open', 'invite', 'closed'].includes(v) ? v : null),
    maxUsers: v => (Number.isInteger(+v) && +v >= 0 && +v <= 1e7 ? +v : null),
    regDailyMax: v => (Number.isInteger(+v) && +v >= 0 && +v <= 1e6 ? +v : null),
    userQuotaMB: v => (+v >= 1 && +v <= 10240 ? +v : null),
    announcement: v => (typeof v === 'string' ? v.slice(0, 300) : null),
    sharingEnabled: v => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null)
  };
  function applySetting(k, raw) {
    const v = SETTINGS[k] ? SETTINGS[k](raw) : null;
    if (v === null) return false;
    cfg[k] = v;
    if (k === 'regMode') cfg.registration = v !== 'closed';
    return true;
  }
  if (cfg.sharingEnabled === undefined) cfg.sharingEnabled = true;
  if (cfg.announcement === undefined) cfg.announcement = '';
  q.allSettings.all().forEach(r => { try { applySetting(r.key, JSON.parse(r.value)); } catch (e) { /* ignorieren */ } });

  /* ---------- Hilfen ---------- */
  const rank = u => ROLES[u && u.role] || 0;
  function staff(s, min) {
    const u = q.user.get(s.userId);
    if (rank(u) < min) throw err(403, 'forbidden', 'Dafür fehlen dir die Rechte.');
    if (cfg.staffRequire2fa !== false && !u.totp_wrapped) throw err(403, 'staff_2fa', 'Für den Team-Bereich muss die Zwei-Faktor-Anmeldung aktiv sein (Konto & Cloud → Zwei-Faktor-Anmeldung).');
    return u;
  }
  const audit = (u, action, target) => { try { q.audit.run(u.id, u.role, action, target == null ? null : String(target).slice(0, 200), Date.now()); } catch (e) { /* ignorieren */ } };
  const bool = v => (v === true || v === 1 || v === '1' || v === 'true');
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null));
  const dstr = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
  const newsOut = n => ({ id: n.id, title: n.title, body: n.body, pinned: !!n.pinned, author: n.author_name || 'Redaktion', publishedAt: n.published_at, updatedAt: n.updated_at });

  /* Momentaufnahme eines Grows: nur erlaubte Felder, Typen und Größen */
  function cleanSnapshot(b) {
    const g = b && typeof b.grow === 'object' && b.grow ? b.grow : {};
    const entries = (Array.isArray(b.entries) ? b.entries : []).slice(0, 1000).map(e => ({
      date: dstr(e && e.date), phase: str(e && e.phase, 40), ec: num(e && e.ec), ph: num(e && e.ph), waterTemp: num(e && e.waterTemp),
      airTemp: num(e && e.airTemp), humidity: num(e && e.humidity), ppfd: num(e && e.ppfd), use: num(e && e.use), height: num(e && e.height),
      note: b.includeNotes ? str(e && e.note, 500) : ''
    })).filter(e => e.date);
    const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 12).filter(p => p && typeof p.data === 'string' && p.data.length <= cfg.maxPhotoBytes && PHOTO_RE.test(p.data)).map(p => ({ date: dstr(p.date), data: p.data }));
    const h = b.harvest && typeof b.harvest === 'object' ? b.harvest : {};
    return {
      grow: { name: str(g.name, 60), strain: str(g.strain, 60), breeder: str(g.breeder, 60), type: str(g.type, 20), start: dstr(g.start), phase: str(g.phase, 40), flowerStart: dstr(g.flowerStart), flowerWeeks: num(g.flowerWeeks), lightHours: num(g.lightHours) },
      entries, photos, harvest: { date: dstr(h.date), dry: num(h.dry), wet: num(h.wet), watt: num(h.watt) }, includeNotes: !!b.includeNotes, createdAt: Date.now()
    };
  }

  /* ---------- Öffentlich ---------- */
  async function pub(req, res, url, ip) {
    const p = url.pathname, m = req.method;
    if (p === '/api/news' && m === 'GET') {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20)), offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      return json(res, 200, { total: q.newsCountPublic.get().n, items: q.newsPublic.all(limit, offset).map(newsOut), announcement: cfg.announcement || '' }), true;
    }
    const nm = /^\/api\/news\/(\d{1,9})$/.exec(p);
    if (nm && m === 'GET') {
      const n = q.newsOne.get(Number(nm[1]));
      if (!n || !n.published) throw err(404, 'not_found', 'Beitrag nicht gefunden.');
      return json(res, 200, newsOut(n)), true;
    }
    const sm = /^\/api\/shares\/([A-Za-z0-9_-]+)(\/report)?$/.exec(p);
    if (sm && sm[1] !== 'mine' && ((m === 'GET' && !sm[2]) || (m === 'POST' && sm[2]))) {
      if (!TOKEN_RE.test(sm[1])) throw err(404, 'not_found', 'Geteilter Grow nicht gefunden.');
      const sh = q.shareGet.get(sm[1]);
      if (!sh || (sh.hidden && !sm[2])) throw err(404, 'not_found', sh && sh.hidden ? 'Dieser Grow wurde vom Team entfernt.' : 'Geteilter Grow nicht gefunden oder nicht mehr freigegeben.');
      if (!sm[2] && m === 'GET') {
        if (rateOk('view:' + ip + ':' + sh.token, 1, 3600e3)) q.shareView.run(sh.token);
        return json(res, 200, { title: sh.title, createdAt: sh.created_at, views: sh.views, data: JSON.parse(sh.data) }), true;
      }
      if (sm[2] && m === 'POST') {
        if (!rateOk('report:' + ip, 5, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Meldungen. Bitte später erneut versuchen.');
        const b = await readBody(req, 4096);
        const reason = str(b.reason, 300).trim();
        if (reason.length < 3) throw err(400, 'bad_reason', 'Bitte kurz beschreiben, was nicht in Ordnung ist.');
        q.reportAdd.run(sh.token, reason, Date.now());
        return json(res, 200, { ok: true }), true;
      }
    }
    return false;
  }

  /* Atom-Feed der News: /news/feed.xml */
  function feed(req, res, base) {
    const x = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
    const items = q.newsPublic.all(30, 0);
    const updated = new Date(Math.max(Date.now() - 365 * DAY, ...items.map(n => n.updated_at || n.published_at || 0))).toISOString();
    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n<title>AutoPot Grow – News</title>\n<id>${x(base)}/news.html</id>\n<link href="${x(base)}/news.html"/>\n<link rel="self" href="${x(base)}/news/feed.xml"/>\n<updated>${updated}</updated>\n` +
      items.map(n => `<entry>\n<title>${x(n.title)}</title>\n<id>${x(base)}/news.html#post-${n.id}</id>\n<link href="${x(base)}/news.html#post-${n.id}"/>\n<published>${new Date(n.published_at).toISOString()}</published>\n<updated>${new Date(n.updated_at || n.published_at).toISOString()}</updated>\n<author><name>${x(n.author_name || 'Redaktion')}</name></author>\n<content type="text">${x(n.body)}</content>\n</entry>`).join('\n') + '\n</feed>\n';
    send(res, 200, req.method === 'HEAD' ? '' : xml, { 'Content-Type': 'application/atom+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  }

  /* ---------- Angemeldet ---------- */
  async function priv(req, res, url, s) {
    const p = url.pathname, m = req.method;

    /* Eigene geteilte Grows */
    if (p === '/api/shares' && m === 'POST') {
      if (!cfg.sharingEnabled) throw err(403, 'sharing_off', 'Das Teilen ist derzeit deaktiviert.');
      if (!rateOk('share:' + s.userId, 20, 3600e3)) throw err(429, 'rate_limited', 'Zu viele Freigaben. Bitte später erneut versuchen.');
      if (q.shareCount.get(s.userId).n >= 10) throw err(409, 'limit', 'Du kannst höchstens 10 Grows gleichzeitig teilen. Bitte erst eine alte Freigabe löschen.');
      const b = await readBody(req, 12 * 1024 * 1024);
      const title = str(b.title, 80).trim();
      if (!title) throw err(400, 'bad_title', 'Bitte einen Titel angeben.');
      const snap = cleanSnapshot(b), data = JSON.stringify(snap);
      if (data.length > 10 * 1024 * 1024) throw err(413, 'too_large', 'Die Freigabe ist zu groß. Bitte weniger Fotos auswählen.');
      const token = crypto.randomBytes(16).toString('base64url');
      q.shareAdd.run(token, s.userId, title, data, Date.now());
      ctx.logEvent(s.userId, 'share_created');
      return json(res, 201, { ok: true, token, path: '/share.html#' + token }), true;
    }
    if (p === '/api/shares/mine' && m === 'GET') return json(res, 200, { shares: q.sharesMine.all(s.userId).map(r => ({ token: r.token, title: r.title, createdAt: r.created_at, views: r.views, hidden: !!r.hidden, bytes: r.bytes })) }), true;
    const sd = /^\/api\/shares\/([A-Za-z0-9_-]{22})$/.exec(p);
    if (sd && m === 'DELETE') {
      const sh = q.shareGet.get(sd[1]);
      if (!sh || sh.user_id !== s.userId) throw err(404, 'not_found', 'Freigabe nicht gefunden.');
      q.shareDel.run(sh.token);
      return json(res, 200, { ok: true }), true;
    }

    if (!p.startsWith('/api/admin/')) return false;
    /* ---------- Team-Bereich ---------- */
    const me = staff(s, ROLES.moderator);
    const isAdmin = rank(me) >= ROLES.admin;
    const needAdmin = () => { if (!isAdmin) throw err(403, 'forbidden', 'Nur für Administratoren.'); };

    if (p === '/api/admin/me' && m === 'GET') return json(res, 200, { id: me.id, role: me.role, displayName: me.display_name || '' }), true;

    if (p === '/api/admin/stats' && m === 'GET') {
      const now = Date.now(), n = (sql, ...a) => db.prepare(sql).get(...a).n;
      const days = [];
      for (let i = 29; i >= 0; i--) days.push(new Date(now - i * DAY).toISOString().slice(0, 10));
      const byDay = sql => { const m2 = new Map(db.prepare(sql).all(now - 30 * DAY).map(r => [r.d, r.n])); return days.map(d => m2.get(d) || 0); };
      return json(res, 200, {
        users: n('SELECT COUNT(*) n FROM users'), disabled: n('SELECT COUNT(*) n FROM users WHERE disabled=1'), with2fa: n('SELECT COUNT(*) n FROM users WHERE totp_wrapped IS NOT NULL'),
        new7: n('SELECT COUNT(*) n FROM users WHERE created_at > ?', now - 7 * DAY), active30: n('SELECT COUNT(*) n FROM users WHERE last_login > ?', now - 30 * DAY),
        sessions: n('SELECT COUNT(*) n FROM sessions'), photos: n('SELECT COUNT(*) n FROM photos'), shares: n('SELECT COUNT(*) n FROM shares'),
        openReports: n("SELECT COUNT(*) n FROM reports WHERE status='open'"), failed24: n("SELECT COUNT(*) n FROM sec_events WHERE type IN ('login_failed','totp_failed') AND at > ?", now - DAY),
        news: n('SELECT COUNT(*) n FROM news WHERE published=1'), storage: n('SELECT (SELECT COALESCE(SUM(length(blob)),0) FROM docs) + (SELECT COALESCE(SUM(length(blob)),0) FROM photos) AS n'),
        uptime: Math.round(process.uptime()), days,
        registrations: byDay("SELECT date(created_at/1000,'unixepoch') d, COUNT(*) n FROM users WHERE created_at > ? GROUP BY d"),
        logins: byDay("SELECT date(at/1000,'unixepoch') d, COUNT(*) n FROM sec_events WHERE type='login' AND at > ? GROUP BY d"),
        failedLogins: byDay("SELECT date(at/1000,'unixepoch') d, COUNT(*) n FROM sec_events WHERE type IN ('login_failed','totp_failed') AND at > ? GROUP BY d"),
        regMode: cfg.regMode, isAdmin
      }), true;
    }

    /* Nutzer */
    if (p === '/api/admin/users' && m === 'GET') {
      const page = Math.max(0, Number(url.searchParams.get('page')) || 0), search = String(url.searchParams.get('q') || '').trim();
      const filter = String(url.searchParams.get('filter') || '');
      let where = '1=1'; const args = [];
      if (/^\d+$/.test(search)) { where = 'u.id = ?'; args.push(Number(search)); }
      else if (search.includes('@')) { where = 'u.email_hash = ?'; args.push(C.emailHash(ctx.pepper, search)); }
      if (filter === 'disabled') where += ' AND u.disabled = 1';
      if (filter === 'staff') where += " AND u.role IN ('moderator','admin')";
      if (filter === 'inactive') { where += ' AND COALESCE(u.last_login, u.created_at) < ?'; args.push(Date.now() - 180 * DAY); }
      const total = db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${where}`).get(...args).n;
      const rows = db.prepare(`SELECT u.id, u.created_at, u.last_login, u.disabled, u.role, u.display_name, (u.totp_wrapped IS NOT NULL) AS totp,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions, (SELECT COUNT(*) FROM shares s WHERE s.user_id = u.id) AS shares
        FROM users u WHERE ${where} ORDER BY u.id DESC LIMIT 50 OFFSET ?`).all(...args, page * 50);
      return json(res, 200, { total, page, users: rows.map(r => ({ id: r.id, createdAt: r.created_at, lastLogin: r.last_login, disabled: !!r.disabled, role: r.role, displayName: r.display_name || '', totp: !!r.totp, sessions: r.sessions, shares: r.shares, storage: q.usage.get(r.id, r.id).b })) }), true;
    }
    const um = /^\/api\/admin\/users\/(\d{1,9})(?:\/(disable|enable|logout|role|name))?$/.exec(p);
    if (um) {
      const target = q.user.get(Number(um[1]));
      if (!target) throw err(404, 'not_found', 'Konto nicht gefunden.');
      const action = um[2];
      const protect = () => { if (target.id === me.id) throw err(400, 'self', 'Das geht nicht mit dem eigenen Konto.'); if (rank(target) >= rank(me)) throw err(403, 'forbidden', 'Konten mit gleicher oder höherer Rolle kannst du nicht ändern.'); };
      if (m === 'POST' && (action === 'disable' || action === 'enable')) {
        protect();
        db.prepare('UPDATE users SET disabled=? WHERE id=?').run(action === 'disable' ? 1 : 0, target.id);
        if (action === 'disable') db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
        ctx.logEvent(target.id, action === 'disable' ? 'admin_disabled' : 'admin_enabled'); audit(me, 'user_' + action, '#' + target.id);
        return json(res, 200, { ok: true }), true;
      }
      if (m === 'POST' && action === 'logout') {
        protect();
        const n = db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id).changes;
        audit(me, 'user_logout', '#' + target.id);
        return json(res, 200, { ok: true, removed: Number(n) }), true;
      }
      if (m === 'POST' && action === 'role') {
        needAdmin();
        if (target.id === me.id) throw err(400, 'self', 'Die eigene Rolle kann nur ein anderer Admin oder die Kommandozeile ändern.');
        const b = await readBody(req, 1024);
        if (!(b.role in ROLES)) throw err(400, 'bad_role', 'Unbekannte Rolle.');
        db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, target.id);
        audit(me, 'user_role:' + b.role, '#' + target.id);
        return json(res, 200, { ok: true }), true;
      }
      if (m === 'POST' && action === 'name') {
        if (target.id !== me.id) needAdmin();
        const b = await readBody(req, 1024);
        const name = str(b.displayName, 40).trim();
        db.prepare('UPDATE users SET display_name=? WHERE id=?').run(name || null, target.id);
        audit(me, 'user_name', '#' + target.id);
        return json(res, 200, { ok: true }), true;
      }
      if (m === 'DELETE' && !action) {
        needAdmin(); protect();
        db.prepare('DELETE FROM users WHERE id=?').run(target.id);
        audit(me, 'user_delete', '#' + target.id);
        return json(res, 200, { ok: true }), true;
      }
    }

    /* News */
    if (p === '/api/admin/news' && m === 'GET') return json(res, 200, { items: q.newsAll.all().map(n => ({ id: n.id, title: n.title, body: n.body, published: !!n.published, pinned: !!n.pinned, author: n.author_name || 'Redaktion', createdAt: n.created_at, updatedAt: n.updated_at, publishedAt: n.published_at })) }), true;
    const nw = /^\/api\/admin\/news(?:\/(\d{1,9}))?$/.exec(p);
    if (nw && (m === 'POST' || m === 'PUT' || m === 'DELETE')) {
      if (m === 'DELETE') {
        if (!nw[1]) throw err(400, 'bad_request', 'ID fehlt.');
        q.newsDel.run(Number(nw[1])); audit(me, 'news_delete', '#' + nw[1]);
        return json(res, 200, { ok: true }), true;
      }
      const b = await readBody(req, 64 * 1024);
      const title = str(b.title, 140).trim(), body = str(b.body, 20000).trim(), published = bool(b.published), pinned = bool(b.pinned), now = Date.now();
      if (title.length < 3 || body.length < 3) throw err(400, 'bad_news', 'Titel und Text dürfen nicht leer sein.');
      if (m === 'POST' && !nw[1]) {
        const id = Number(q.newsAdd.run(title, body, published ? 1 : 0, pinned ? 1 : 0, me.id, me.display_name || 'Redaktion', now, now, published ? now : null).lastInsertRowid);
        audit(me, published ? 'news_publish' : 'news_draft', '#' + id);
        return json(res, 201, { ok: true, id }), true;
      }
      if (m === 'PUT' && nw[1]) {
        const old = q.newsOne.get(Number(nw[1]));
        if (!old) throw err(404, 'not_found', 'Beitrag nicht gefunden.');
        q.newsUpd.run(title, body, published ? 1 : 0, pinned ? 1 : 0, now, published ? (old.published_at || now) : null, old.id);
        audit(me, 'news_update', '#' + old.id);
        return json(res, 200, { ok: true }), true;
      }
    }

    /* Meldungen und geteilte Grows */
    if (p === '/api/admin/reports' && m === 'GET') return json(res, 200, { reports: q.reportsOpen.all().map(r => ({ id: r.id, token: r.share_token, reason: r.reason, at: r.at, title: r.title, hidden: !!r.hidden, owner: r.user_id, views: r.views, total: r.total })) }), true;
    const sa = /^\/api\/admin\/shares\/([A-Za-z0-9_-]{22})\/(hide|unhide|dismiss|delete)$/.exec(p);
    if (sa && m === 'POST') {
      const sh = q.shareGet.get(sa[1]);
      if (!sh) throw err(404, 'not_found', 'Freigabe nicht gefunden.');
      if (sa[2] === 'hide') { q.shareHide.run(1, sh.token); q.reportsClose.run(sh.token); }
      if (sa[2] === 'unhide') q.shareHide.run(0, sh.token);
      if (sa[2] === 'dismiss') q.reportsClose.run(sh.token);
      if (sa[2] === 'delete') q.shareDel.run(sh.token);
      audit(me, 'share_' + sa[2], sh.title.slice(0, 60));
      return json(res, 200, { ok: true }), true;
    }

    /* Einladungen (nur Admin) */
    if (p === '/api/admin/invites' && m === 'GET') {
      needAdmin();
      return json(res, 200, { invites: db.prepare('SELECT code_hash, uses_left, expires_at, created_at, note FROM invites ORDER BY created_at DESC LIMIT 200').all().map(r => ({ id: r.code_hash.slice(0, 12), usesLeft: r.uses_left, expiresAt: r.expires_at, createdAt: r.created_at, note: r.note || '' })) }), true;
    }
    if (p === '/api/admin/invites' && m === 'POST') {
      needAdmin();
      const b = await readBody(req, 1024);
      const uses = Math.max(1, Math.min(1000, Math.round(Number(b.uses) || 1))), days = Math.max(0, Math.min(365, Math.round(Number(b.days) || 0)));
      const code = C.newInviteCode();
      db.prepare('INSERT INTO invites (code_hash, uses_left, expires_at, created_at, note) VALUES (?,?,?,?,?)').run(C.inviteHash(code), uses, days ? Date.now() + days * DAY : null, Date.now(), str(b.note, 80));
      audit(me, 'invite_create', `${uses}× ${days ? days + ' Tage' : 'unbegrenzt'}`);
      return json(res, 201, { ok: true, code }), true;
    }
    const iv = /^\/api\/admin\/invites\/([a-f0-9]{12})$/.exec(p);
    if (iv && m === 'DELETE') {
      needAdmin();
      const n = db.prepare("UPDATE invites SET uses_left = 0 WHERE substr(code_hash, 1, 12) = ?").run(iv[1]).changes;
      audit(me, 'invite_revoke', iv[1]);
      return json(res, 200, { ok: true, revoked: Number(n) }), true;
    }

    /* Einstellungen (nur Admin) */
    if (p === '/api/admin/settings' && m === 'GET') {
      needAdmin();
      return json(res, 200, { regMode: cfg.regMode, maxUsers: cfg.maxUsers, regDailyMax: cfg.regDailyMax, userQuotaMB: cfg.userQuotaMB, announcement: cfg.announcement || '', sharingEnabled: cfg.sharingEnabled !== false }), true;
    }
    if (p === '/api/admin/settings' && m === 'PUT') {
      needAdmin();
      const b = await readBody(req, 4096), changed = [];
      for (const k of Object.keys(SETTINGS)) {
        if (!(k in b)) continue;
        if (!applySetting(k, b[k])) throw err(400, 'bad_setting', `Ungültiger Wert für ${k}.`);
        q.setSetting.run(k, JSON.stringify(cfg[k])); changed.push(k);
      }
      audit(me, 'settings', changed.join(', '));
      return json(res, 200, { ok: true, changed }), true;
    }

    if (p === '/api/admin/audit' && m === 'GET') {
      needAdmin();
      return json(res, 200, { entries: q.auditList.all().map(a => ({ at: a.at, actor: a.actor_id, actorName: a.display_name || '', role: a.actor_role, action: a.action, target: a.target })) }), true;
    }
    throw err(404, 'not_found', 'Nicht gefunden.');
  }

  return { pub, priv, feed, ROLES };
};
