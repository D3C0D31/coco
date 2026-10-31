(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = window.NewsFmt.esc;
  const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'autopot' };
  const fdt = t => (t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
  const fd = t => (t ? new Date(t).toLocaleDateString('de-DE') : '–');
  const mb = b => (b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB';
  let ME = null, toastTimer;
  function toast(msg, bad) {
    const t = $('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, bad ? 6000 : 2800);
  }
  async function api(method, url, body) {
    let r;
    try { r = await fetch(url, { method, credentials: 'same-origin', headers: H, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { return { ok: false, status: 0, data: { message: 'Keine Verbindung zum Server.' } }; }
    let data = {}; try { data = await r.json(); } catch (e) { /* ignorieren */ }
    return { ok: r.ok, status: r.status, data };
  }
  const fail = r => toast((r.data && r.data.message) || 'Das hat nicht geklappt.', true);

  /* ---------- Zugang ---------- */
  function gate(html) {
    document.querySelectorAll('.tab').forEach(s => s.classList.add('hidden'));
    $('adminTabs').classList.add('hidden');
    $('gate').classList.remove('hidden');
    $('gateMsg').innerHTML = `<div class="gate-box">${html}</div>`;
  }
  async function init() {
    const s = await api('GET', '/api/session');
    if (!s.ok) return gate('<p>Der Team-Bereich ist nur verfügbar, wenn die Seite über den AutoPot-Server läuft.</p>');
    if (!s.data.authenticated) return gate('<p>Bitte zuerst in der App anmelden.</p><a class="btn primary" href="app.html?mode=login">Zur Anmeldung</a>');
    const me = await api('GET', '/api/admin/me');
    if (!me.ok) {
      if (me.data.error === 'staff_2fa') return gate(`<div class="notice warn"><span>${esc(me.data.message)}</span></div><a class="btn primary" href="app.html">Zur App – Zwei-Faktor einrichten</a>`);
      return gate('<p>Dein Konto hat keine Team-Rechte. Ein Admin kann sie vergeben (oder auf dem Server: <code>node server/admin.js role &lt;ID&gt; moderator</code>).</p><a class="btn" href="app.html">Zur App</a>');
    }
    ME = me.data;
    ME.isAdmin = ME.role === 'admin';
    $('whoami').textContent = `${ME.displayName || 'Konto #' + ME.id} · ${ME.role === 'admin' ? 'Admin' : 'Moderator'}`;
    $('myName').value = ME.displayName || '';
    document.querySelectorAll('[data-admin]').forEach(a => a.classList.toggle('hidden', !ME.isAdmin));
    window.addEventListener('hashchange', route);
    route();
    refreshBadge();
  }
  const TABS = ['overview', 'users', 'news', 'reports', 'invites', 'settings', 'audit'];
  const ADMIN_TABS = new Set(['invites', 'settings', 'audit']);
  function route() {
    let tab = (location.hash || '#overview').slice(1);
    if (!TABS.includes(tab) || (ADMIN_TABS.has(tab) && !ME.isAdmin)) tab = 'overview';
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('hidden', s.id !== tab));
    document.querySelectorAll('#adminTabs a').forEach(a => { const on = a.dataset.tab === tab; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    ({ overview: loadOverview, users: loadUsers, news: loadNews, reports: loadReports, invites: loadInvites, settings: loadSettings, audit: loadAudit })[tab]();
  }
  async function refreshBadge() {
    const r = await api('GET', '/api/admin/reports');
    const n = r.ok ? new Set(r.data.reports.map(x => x.token)).size : 0;
    $('repBadge').textContent = n; $('repBadge').classList.toggle('hidden', !n);
  }

  /* ---------- Übersicht ---------- */
  function bars(el, values, days) {
    const max = Math.max(1, ...values), realMax = Math.max(0, ...values);
    el.innerHTML = values.map((v, i) => `<i style="height:${Math.max(2, v / max * 100)}%" title="${esc(days[i].split('-').reverse().join('.'))}: ${v}"></i>`).join('');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `Summe ${values.reduce((a, b) => a + b, 0)}, höchster Tageswert ${realMax}`);
    const old = el.nextElementSibling; if (old && old.classList.contains('bars-legend')) old.remove();
    el.insertAdjacentHTML('afterend', `<div class="bars-legend"><span>${esc(days[0].slice(8))}.${esc(days[0].slice(5, 7))}.</span><span>Summe ${values.reduce((a, b) => a + b, 0)} · max ${realMax}</span><span>heute</span></div>`);
  }
  async function loadOverview() {
    const r = await api('GET', '/api/admin/stats');
    if (!r.ok) return fail(r);
    const d = r.data;
    const k = [['Konten', d.users, `${d.new7} neu in 7 Tagen`], ['Aktiv (30 Tage)', d.active30, `${d.users ? Math.round(d.active30 / d.users * 100) : 0} % der Konten`], ['Mit 2FA', d.with2fa, `${d.users ? Math.round(d.with2fa / d.users * 100) : 0} %`],
      ['Gesperrt', d.disabled, ''], ['Sitzungen', d.sessions, ''], ['Fotos', d.photos, mb(d.storage) + ' gesamt'], ['Geteilte Grows', d.shares, `${d.openReports} offene Meldungen`],
      ['Fehlversuche 24 h', d.failed24, d.failed24 > 50 ? 'auffällig hoch' : ''], ['News', d.news, 'veröffentlicht'], ['Registrierung', { open: 'offen', invite: 'Einladung', closed: 'geschlossen' }[d.regMode], ''], ['Laufzeit', Math.floor(d.uptime / 3600) + ' h', '']];
    $('kpis').innerHTML = k.map(([t, v, s]) => `<div class="card"${t.startsWith('Fehlversuche') && d.failed24 > 50 ? ' data-state="warn"' : ''}><h3>${esc(t)}</h3><div class="value">${esc(v)}</div><p class="sub">${esc(s)}</p></div>`).join('');
    bars($('chReg'), d.registrations, d.days); bars($('chLog'), d.logins, d.days); bars($('chFail'), d.failedLogins, d.days);
  }
  $('nameForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await api('POST', `/api/admin/users/${ME.id}/name`, { displayName: $('myName').value });
    if (!r.ok) return fail(r);
    ME.displayName = $('myName').value.trim(); $('whoami').textContent = `${ME.displayName || 'Konto #' + ME.id} · ${ME.isAdmin ? 'Admin' : 'Moderator'}`;
    toast('Anzeigename gespeichert.');
  });

  /* ---------- Nutzer ---------- */
  let uPage = 0, uTotal = 0;
  const ROLE = { user: 'Nutzer', moderator: 'Moderator', admin: 'Admin' };
  async function loadUsers() {
    const qs = new URLSearchParams({ page: uPage, q: $('uq').value.trim(), filter: $('uf').value });
    const r = await api('GET', '/api/admin/users?' + qs);
    if (!r.ok) return fail(r);
    uTotal = r.data.total;
    $('uPage').textContent = `Seite ${uPage + 1} von ${Math.max(1, Math.ceil(uTotal / 50))} · ${uTotal} Konten`;
    $('uPrev').disabled = uPage === 0; $('uNext').disabled = (uPage + 1) * 50 >= uTotal;
    $('userBody').innerHTML = r.data.users.map(u => {
      const self = u.id === ME.id, higher = ['moderator', 'admin'].indexOf(u.role) >= ['moderator', 'admin'].indexOf(ME.role) && u.role !== 'user';
      const can = !self && !higher;
      return `<tr><td class="num">#${u.id}${u.displayName ? `<br><span class="sub">${esc(u.displayName)}</span>` : ''}</td><td class="num">${esc(fd(u.createdAt))}</td><td class="num">${esc(fdt(u.lastLogin))}</td>
        <td>${ME.isAdmin && !self ? `<select data-role="${u.id}" aria-label="Rolle von #${u.id}">${Object.keys(ROLE).map(k => `<option value="${k}"${k === u.role ? ' selected' : ''}>${ROLE[k]}</option>`).join('')}</select>` : esc(ROLE[u.role] || u.role)}</td>
        <td>${u.totp ? '<span class="chip ok">ja</span>' : '<span class="chip mute">nein</span>'}</td>
        <td>${u.disabled ? '<span class="chip bad">gesperrt</span>' : '<span class="chip ok">aktiv</span>'}</td>
        <td class="num">${u.sessions}</td><td class="num">${u.shares}</td><td class="num">${esc(mb(u.storage))}</td>
        <td><div class="rowact">${can ? (u.disabled ? `<button class="btn small" data-u="enable" data-id="${u.id}" type="button">Entsperren</button>` : `<button class="btn small" data-u="disable" data-id="${u.id}" type="button">Sperren</button>`) + `<button class="btn small" data-u="logout" data-id="${u.id}" type="button">Abmelden</button>` : ''}${can && ME.isAdmin ? `<button class="btn small danger" data-u="delete" data-id="${u.id}" type="button">Löschen</button>` : ''}${self ? '<span class="sub">du</span>' : ''}</div></td></tr>`;
    }).join('') || '<tr><td colspan="10">Keine Treffer.</td></tr>';
  }
  $('userSearch').addEventListener('submit', ev => { ev.preventDefault(); uPage = 0; loadUsers(); });
  $('uf').addEventListener('change', () => { uPage = 0; loadUsers(); });
  $('uPrev').addEventListener('click', () => { if (uPage > 0) { uPage--; loadUsers(); } });
  $('uNext').addEventListener('click', () => { uPage++; loadUsers(); });
  $('userBody').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-u]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.u;
    const confirmText = { disable: `Konto #${id} sperren? Es wird überall abgemeldet.`, logout: `Konto #${id} auf allen Geräten abmelden?`, delete: `Konto #${id} mit ALLEN Daten endgültig löschen? Das kann nicht rückgängig gemacht werden.` }[act];
    if (confirmText && !confirm(confirmText)) return;
    const r = act === 'delete' ? await api('DELETE', `/api/admin/users/${id}`) : await api('POST', `/api/admin/users/${id}/${act}`);
    if (!r.ok) return fail(r);
    toast({ disable: 'Konto gesperrt.', enable: 'Konto entsperrt.', logout: `${r.data.removed} Sitzung(en) beendet.`, delete: 'Konto gelöscht.' }[act]);
    loadUsers();
  });
  $('userBody').addEventListener('change', async ev => {
    const s = ev.target.closest('[data-role]'); if (!s) return;
    if (!confirm(`Rolle von Konto #${s.dataset.role} auf „${ROLE[s.value]}“ ändern?`)) { loadUsers(); return; }
    const r = await api('POST', `/api/admin/users/${s.dataset.role}/role`, { role: s.value });
    if (!r.ok) { fail(r); loadUsers(); return; }
    toast('Rolle geändert.' + (s.value !== 'user' ? ' Das Konto braucht die Zwei-Faktor-Anmeldung für den Team-Bereich.' : ''));
  });

  /* ---------- News ---------- */
  let editId = null, newsItems = [];
  function preview() {
    $('nPreview').innerHTML = `<h2>${esc($('nTitle').value || 'Titel')}</h2><p class="sub">${$('nPublished').checked ? 'wird veröffentlicht' : 'Entwurf'}${$('nPinned').checked ? ' · angeheftet' : ''}</p>${window.NewsFmt.render($('nBody').value || '…')}`;
  }
  function resetNews() { editId = null; $('newsForm').reset(); $('newsFormTitle').textContent = 'Neuer Beitrag'; $('nSave').textContent = 'Speichern'; preview(); }
  async function loadNews() {
    const r = await api('GET', '/api/admin/news');
    if (!r.ok) return fail(r);
    newsItems = r.data.items;
    $('newsList').innerHTML = newsItems.map(n => `<div class="item"><div><strong>${esc(n.title)}</strong> ${n.published ? '<span class="chip ok">veröffentlicht</span>' : '<span class="chip mute">Entwurf</span>'}${n.pinned ? ' <span class="chip warn">angeheftet</span>' : ''}<p class="meta">${esc(n.author)} · ${esc(fdt(n.publishedAt || n.createdAt))}${n.updatedAt !== n.createdAt ? ' · bearbeitet ' + esc(fdt(n.updatedAt)) : ''}</p><p>${esc(window.NewsFmt.plain(n.body, 160))}</p></div><div class="rowact"><button class="btn small" data-n="edit" data-id="${n.id}" type="button">Bearbeiten</button>${n.published ? `<a class="btn small" href="news.html#post-${n.id}" target="_blank" rel="noopener">Ansehen</a>` : ''}<button class="btn small danger" data-n="del" data-id="${n.id}" type="button">Löschen</button></div></div>`).join('') || '<p class="sub">Noch keine Beiträge.</p>';
    preview();
  }
  ['nTitle', 'nBody', 'nPublished', 'nPinned'].forEach(id => $(id).addEventListener('input', preview));
  $('nReset').addEventListener('click', resetNews);
  $('newsForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const body = { title: $('nTitle').value, body: $('nBody').value, published: $('nPublished').checked, pinned: $('nPinned').checked };
    const r = editId ? await api('PUT', `/api/admin/news/${editId}`, body) : await api('POST', '/api/admin/news', body);
    if (!r.ok) return fail(r);
    toast(body.published ? 'Beitrag veröffentlicht.' : 'Entwurf gespeichert.');
    resetNews(); loadNews();
  });
  $('newsList').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-n]'); if (!b) return;
    const n = newsItems.find(x => String(x.id) === b.dataset.id); if (!n) return;
    if (b.dataset.n === 'edit') {
      editId = n.id; $('nTitle').value = n.title; $('nBody').value = n.body; $('nPublished').checked = n.published; $('nPinned').checked = n.pinned;
      $('newsFormTitle').textContent = 'Beitrag bearbeiten'; $('nSave').textContent = 'Änderung speichern'; preview();
      $('newsForm').scrollIntoView({ behavior: 'smooth' });
    } else if (confirm(`„${n.title}“ löschen?`)) {
      const r = await api('DELETE', `/api/admin/news/${n.id}`);
      if (!r.ok) return fail(r);
      toast('Beitrag gelöscht.'); if (editId === n.id) resetNews(); loadNews();
    }
  });

  /* ---------- Meldungen ---------- */
  async function loadReports() {
    const r = await api('GET', '/api/admin/reports');
    if (!r.ok) return fail(r);
    const groups = new Map();
    r.data.reports.forEach(x => { if (!groups.has(x.token)) groups.set(x.token, Object.assign({ reasons: [] }, x)); groups.get(x.token).reasons.push({ reason: x.reason, at: x.at }); });
    $('reportList').innerHTML = [...groups.values()].map(g => `<div class="item" style="border-left-color:var(--red)"><div><strong>${esc(g.title)}</strong> <span class="chip bad">${g.total} Meldung(en)</span>${g.hidden ? ' <span class="chip mute">ausgeblendet</span>' : ''}<p class="meta">Konto #${g.owner} · ${g.views} Aufrufe</p><ul>${g.reasons.map(x => `<li>${esc(x.reason)} <span class="sub">(${esc(fdt(x.at))})</span></li>`).join('')}</ul></div>
      <div class="rowact"><a class="btn small" href="share.html#${esc(g.token)}" target="_blank" rel="noopener">Ansehen</a><button class="btn small danger" data-r="hide" data-t="${esc(g.token)}" type="button">Ausblenden</button><button class="btn small" data-r="dismiss" data-t="${esc(g.token)}" type="button">Verwerfen</button>${ME.isAdmin ? `<button class="btn small danger" data-r="delete" data-t="${esc(g.token)}" type="button">Löschen</button>` : ''}</div></div>`).join('') || '<p class="sub">Keine offenen Meldungen. 🎉</p>';
    refreshBadge();
  }
  $('reportList').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'delete' && !confirm('Diese Freigabe endgültig löschen?')) return;
    const r = await api('POST', `/api/admin/shares/${b.dataset.t}/${b.dataset.r}`);
    if (!r.ok) return fail(r);
    toast({ hide: 'Ausgeblendet.', dismiss: 'Meldung verworfen.', delete: 'Freigabe gelöscht.' }[b.dataset.r]);
    loadReports();
  });

  /* ---------- Einladungen ---------- */
  async function loadInvites() {
    const r = await api('GET', '/api/admin/invites');
    if (!r.ok) return fail(r);
    const now = Date.now();
    $('inviteBody').innerHTML = r.data.invites.map(i => `<tr><td class="num"><code>${esc(i.id)}</code></td><td class="num">${i.usesLeft}</td><td class="num">${esc(fd(i.createdAt))}</td><td class="num">${i.expiresAt ? esc(fd(i.expiresAt)) + (i.expiresAt < now ? ' <span class="chip mute">abgelaufen</span>' : '') : 'nie'}</td><td>${esc(i.note)}</td><td>${i.usesLeft > 0 && (!i.expiresAt || i.expiresAt > now) ? `<button class="btn small danger" data-i="${esc(i.id)}" type="button">Widerrufen</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">Noch keine Einladungen.</td></tr>';
  }
  $('inviteForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await api('POST', '/api/admin/invites', { uses: Number($('iUses').value), days: Number($('iDays').value), note: $('iNote').value });
    if (!r.ok) return fail(r);
    $('inviteNew').innerHTML = `<div class="notice ok code-new"><span>Neuer Einladungscode (wird nur jetzt angezeigt): <strong class="secret" id="newCode">${esc(r.data.code)}</strong></span><button class="btn small" id="copyCode" type="button">Kopieren</button></div>`;
    $('copyCode').addEventListener('click', async () => { try { await navigator.clipboard.writeText(r.data.code); toast('Kopiert.'); } catch (e) { toast('Bitte markieren und kopieren.', true); } });
    $('inviteForm').reset(); loadInvites();
  });
  $('inviteBody').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-i]'); if (!b) return;
    const r = await api('DELETE', `/api/admin/invites/${b.dataset.i}`);
    if (!r.ok) return fail(r);
    toast('Einladung widerrufen.'); loadInvites();
  });

  /* ---------- Einstellungen ---------- */
  async function loadSettings() {
    const r = await api('GET', '/api/admin/settings');
    if (!r.ok) return fail(r);
    const s = r.data;
    $('sRegMode').value = s.regMode; $('sMaxUsers').value = s.maxUsers; $('sDaily').value = s.regDailyMax; $('sQuota').value = s.userQuotaMB; $('sSharing').checked = s.sharingEnabled; $('sAnnounce').value = s.announcement;
  }
  $('settingsForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await api('PUT', '/api/admin/settings', { regMode: $('sRegMode').value, maxUsers: Number($('sMaxUsers').value), regDailyMax: Number($('sDaily').value), userQuotaMB: Number($('sQuota').value), sharingEnabled: $('sSharing').checked, announcement: $('sAnnounce').value });
    if (!r.ok) return fail(r);
    toast('Einstellungen gespeichert und sofort aktiv.');
  });

  /* ---------- Protokoll ---------- */
  const ACTION = { user_disable: 'Konto gesperrt', user_enable: 'Konto entsperrt', user_logout: 'Konto abgemeldet', user_delete: 'Konto gelöscht', user_name: 'Anzeigename geändert', news_publish: 'News veröffentlicht', news_draft: 'News-Entwurf angelegt', news_update: 'News bearbeitet', news_delete: 'News gelöscht', share_hide: 'Freigabe ausgeblendet', share_unhide: 'Freigabe wieder sichtbar', share_dismiss: 'Meldung verworfen', share_delete: 'Freigabe gelöscht', invite_create: 'Einladung erstellt', invite_revoke: 'Einladung widerrufen', settings: 'Einstellungen geändert' };
  async function loadAudit() {
    const r = await api('GET', '/api/admin/audit');
    if (!r.ok) return fail(r);
    $('auditBody').innerHTML = r.data.entries.map(a => `<tr><td class="num">${esc(fdt(a.at))}</td><td>${a.actor ? '#' + a.actor + (a.actorName ? ' ' + esc(a.actorName) : '') : 'Server (Kommandozeile)'}</td><td>${esc(a.role || '')}</td><td>${esc(ACTION[a.action] || (a.action.startsWith('user_role:') ? 'Rolle gesetzt: ' + a.action.slice(10) : a.action))}</td><td>${esc(a.target || '')}</td></tr>`).join('') || '<tr><td colspan="5">Noch keine Einträge.</td></tr>';
  }

  init();
})();
