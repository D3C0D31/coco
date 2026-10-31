/* AutoPot Grow – Konto & Cloud: Synchronisation, Anmeldung, Zwei-Faktor, Geräte, Protokoll.
   Teil 8/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
'use strict';

/* ---------- Cloud-Konto & Synchronisation ---------- */
const CLOUD = { available: false, user: null, status: 'off', last: null, busy: false, again: false, dirty: false, applying: false, timer: null };
const SYNC_KEY = 'autopot-sync';
const readSync = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } };
const writeSync = o => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
const PHOTO_ID_OK = id => /^[A-Za-z0-9_-]{1,40}$/.test(id);
/* Ältere importierte Einträge können IDs mit Sonderzeichen haben – für die Cloud wird daraus eine stabile, gültige ID */
function cloudPhotoId(id) {
  if (PHOTO_ID_OK(id)) return id;
  let h = 0x811c9dc5; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'x' + h.toString(36) + id.length.toString(36);
}

async function cloudApi(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'autopot' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) { return { ok: false, status: 0, data: null }; }
  let data = null; try { data = await res.json(); } catch (e) { /* kein JSON */ }
  if (res.status === 401 && CLOUD.user && !/\/api\/(login|recover|password|account|2fa\/\w+)$/.test(url)) {
    CLOUD.user = null; setSyncStatus('expired'); toast('Sitzung abgelaufen. Bitte im Konto-Dialog neu anmelden.', true); renderAccount();
  }
  return { ok: res.ok, status: res.status, data };
}
const STATUS_TEXT = { off: 'Nicht angemeldet – Daten nur auf diesem Gerät', ok: 'Synchronisiert', syncing: 'Synchronisiere …', offline: 'Offline – Änderungen werden später übertragen', error: 'Synchronisierung fehlgeschlagen', expired: 'Sitzung abgelaufen – bitte neu anmelden' };
function setSyncStatus(s) {
  CLOUD.status = s;
  document.querySelectorAll('.sync-dot').forEach(dot => { dot.className = 'sync-dot ' + s; dot.title = STATUS_TEXT[s] || ''; });
  const t = $('syncText');
  if (t) t.textContent = (STATUS_TEXT[s] || '') + (s === 'ok' && CLOUD.last ? ` (${CLOUD.last.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr)` : '');
}

/* Zwei Stände zusammenführen: Einträge, Rezepte, Ereignisse usw. werden vereinigt, bei Konflikten gewinnt der bevorzugte Stand */
function mergeStates(preferred, other) {
  const out = normalize(JSON.parse(ser(preferred)));
  const o = normalize(JSON.parse(ser(other)));
  const ids = new Set(out.entries.map(e => e.id)), keys = new Set(out.entries.map(entryKey));
  o.entries.forEach(e => { if (!ids.has(e.id) && !keys.has(entryKey(e))) { out.entries.push(e); ids.add(e.id); keys.add(entryKey(e)); } });
  ['recipes', 'events', 'reminders', 'archive', 'strains'].forEach(k => {
    const have = new Set(out[k].map(x => x.id));
    o[k].forEach(x => { if (!have.has(x.id)) out[k].push(x); });
  });
  ['setup', 'week'].forEach(k => Object.keys(o.checks[k]).forEach(i => { out.checks[k][i] = true; }));
  /* Löschungen beider Seiten zusammenführen und anwenden – so tauchen gelöschte Einträge nicht wieder auf */
  Object.keys(out.deleted).forEach(k => {
    Object.entries(o.deleted[k]).forEach(([id, t]) => { if (!(out.deleted[k][id] >= t)) out.deleted[k][id] = t; });
    out[k] = out[k].filter(x => !out.deleted[k][x.id]);
  });
  return out;
}
const hasLocalData = () => S.entries.length || S.strains.length || S.recipes.length || S.events.length || S.settings.name || S.archive.length;
function applyState(next) {
  CLOUD.applying = true;
  try { S = next; save(); } finally { CLOUD.applying = false; }
  loadSettings(); if (!editingId) resetForm(true); renderAll();
}

async function cloudPull(initial) {
  const r = await cloudApi('GET', '/api/state');
  if (r.status === 0) { setSyncStatus('offline'); return false; }
  if (!r.ok) { setSyncStatus('error'); return false; }
  const meta = readSync();
  if (r.data.data == null) { writeSync(Object.assign(meta, { version: 0 })); return true; }  /* Server leer: lokal hochladen */
  const remote = normalize(r.data.data);
  if (r.data.version === meta.version && !initial) return true;
  if (initial && meta.version === r.data.version && !CLOUD.dirty) return true;
  let next;
  if (!hasLocalData() && !CLOUD.dirty) next = remote;
  else if (initial && !meta.version) { next = mergeStates(S, remote); toast('Lokale Daten und Cloud-Daten wurden zusammengeführt.'); CLOUD.dirty = true; }
  else if (CLOUD.dirty) next = mergeStates(S, remote);
  else next = remote;
  applyState(next);
  writeSync(Object.assign(readSync(), { version: r.data.version }));
  pullPhotos();
  return true;
}
async function cloudPush(retry) {
  const meta = readSync();
  const r = await cloudApi('PUT', '/api/state', { baseVersion: meta.version || 0, data: JSON.parse(ser(S)) });
  if (r.status === 0) { setSyncStatus('offline'); return false; }
  if (r.status === 409 && !retry) { CLOUD.dirty = true; if (!(await cloudPull(true))) return false; writeSync(Object.assign(readSync(), { version: r.data.version })); return cloudPush(true); }
  if (r.status === 413 && !CLOUD.quotaWarned) { CLOUD.quotaWarned = true; toast((r.data && r.data.message) || 'Dein Speicherplatz ist voll.', true); }
  if (!r.ok) { setSyncStatus(r.status === 401 ? 'expired' : 'error'); return false; }
  writeSync(Object.assign(readSync(), { version: r.data.version, dirty: false }));
  CLOUD.dirty = false;
  return true;
}
async function pushPhotos() {
  const meta = readSync(), up = new Set(meta.photos || []);
  const local = new Map(S.entries.filter(e => e.hasPhoto).map(e => [cloudPhotoId(e.id), e.id]));
  const want = new Set(local.keys());
  for (const [cid, id] of local) {
    if (up.has(cid) || !photoCache.has(id)) continue;
    const r = await cloudApi('PUT', '/api/photos/' + cid, { data: photoCache.get(id) });
    if (r.status === 0) { setSyncStatus('offline'); return false; }
    if (r.status === 413) { if (!CLOUD.quotaWarned) { CLOUD.quotaWarned = true; toast((r.data && r.data.message) || 'Speicherplatz voll – Fotos werden nicht mehr hochgeladen.', true); } break; }
    if (r.ok) up.add(cid);
  }
  for (const id of [...up]) {
    if (want.has(id)) continue;
    const r = await cloudApi('DELETE', '/api/photos/' + id);
    if (r.status === 0) { setSyncStatus('offline'); return false; }
    if (r.ok) up.delete(id);
  }
  writeSync(Object.assign(readSync(), { photos: [...up] }));
  return true;
}
async function pullPhotos() {
  const list = await cloudApi('GET', '/api/photos');
  if (!list.ok) return;
  const have = new Set(list.data.ids), meta = readSync(), up = new Set(meta.photos || []);
  let got = 0;
  for (const e of S.entries) {
    const cid = cloudPhotoId(e.id);
    if (!e.hasPhoto || photoCache.has(e.id) || !have.has(cid)) continue;
    const r = await cloudApi('GET', '/api/photos/' + cid);
    if (r.ok && typeof r.data.data === 'string' && IMG_RE.test(r.data.data)) {
      photoCache.set(e.id, r.data.data); up.add(cid); got++;
      if (idb) { try { await idbRun('readwrite', s => s.put(r.data.data, e.id)); } catch (err) { /* nur im Speicher */ } }
    }
  }
  if (got) { writeSync(Object.assign(readSync(), { photos: [...up] })); renderLog(); renderGallery(); }
}
async function cloudSync() {
  if (!CLOUD.user) return;
  if (CLOUD.busy) { CLOUD.again = true; return; }
  CLOUD.busy = true; setSyncStatus('syncing');
  try {
    let ok = true;
    if (CLOUD.dirty || !readSync().version) ok = await cloudPush(false);
    else ok = await cloudPull(false);
    if (ok) ok = await pushPhotos();
    if (ok) { CLOUD.last = new Date(); writeSync(Object.assign(readSync(), { lastSync: CLOUD.last.toISOString() })); setSyncStatus('ok'); }
  } catch (e) { console.error(e); setSyncStatus('error'); }
  CLOUD.busy = false;
  if (CLOUD.again) { CLOUD.again = false; scheduleSync(300); }
  renderAccount();
}
function scheduleSync(delay = 1500) {
  if (!CLOUD.user || CLOUD.applying) return;
  CLOUD.dirty = true;
  writeSync(Object.assign(readSync(), { dirty: true }));
  clearTimeout(CLOUD.timer);
  CLOUD.timer = setTimeout(cloudSync, delay);
}

async function wipeLocal() {
  ['', '-prev'].forEach(x => { try { localStorage.removeItem(KEY + x); } catch (e) { /* ignore */ } });
  /* auch Altbestände entfernen – sonst würde load() sie beim nächsten Start wieder übernehmen */
  [SYNC_KEY, 'autopot-range', 'autopot-email', 'autopot-entries', 'autopot-setup', 'autopot-week', 'autopot-settings', 'growcc-v2'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
  photoCache.clear();
  if (idb) { try { await idbRun('readwrite', s => s.clear()); } catch (e) { /* ignore */ } }
  S = blank();
}
async function afterAuth(isNew) {
  const me = await cloudApi('GET', '/api/me');
  if (!me.ok) { setAcctMsg('Anmeldung fehlgeschlagen.', true); return false; }
  CLOUD.user = { createdAt: me.data.createdAt };
  setRole(me.data.role);
  const tag = String(me.data.createdAt), meta = readSync();
  if (meta.tag && meta.tag !== tag) {
    if (!confirm('Auf diesem Gerät liegen noch Daten eines anderen Kontos. Sie werden jetzt von diesem Gerät entfernt, damit sie nicht in dieses Konto gelangen (im anderen Konto bleiben sie erhalten, soweit synchronisiert).\n\nFortfahren?')) {
      await cloudApi('POST', '/api/logout'); CLOUD.user = null; setSyncStatus('off'); renderAccount(); return false;
    }
    await wipeLocal(); loadSettings(); renderAll();
  }
  writeSync(Object.assign(readSync(), { tag }));
  setSyncStatus('syncing');
  const pulled = await cloudPull(true);
  if (pulled && (isNew || !readSync().version || CLOUD.dirty)) { CLOUD.dirty = true; }
  await cloudSync();
  renderAccount();
  return true;
}
async function cloudInit() {
  if (!/^https?:$/.test(location.protocol)) return;
  if (navigator.onLine === false) { window.addEventListener('online', () => cloudInit(), { once: true }); return; }
  const cfg = await cloudApi('GET', '/api/config');
  if (!cfg.ok || !cfg.data || typeof cfg.data.registration !== 'boolean') return;
  loadNewsTeaser(cfg.data);
  CLOUD.available = true; CLOUD.registration = cfg.data.registration; CLOUD.mode = cfg.data.mode || (cfg.data.registration ? 'open' : 'closed'); CLOUD.pow = Number(cfg.data.pow) || 0;
  $('accountBtn').classList.remove('hidden');
  const me = await cloudApi('GET', '/api/session');
  if (me.ok && me.data.authenticated) {
    setRole(me.data.role);
    CLOUD.user = { createdAt: me.data.createdAt };
    const meta = readSync(); if (meta.lastSync) CLOUD.last = new Date(meta.lastSync);
    setSyncStatus('syncing');
    CLOUD.dirty = !!meta.dirty;
    await cloudSync();
  } else setSyncStatus(readSync().tag ? 'expired' : 'off');
  renderAccount();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && CLOUD.user) cloudSync(); });
  window.addEventListener('online', () => { if (CLOUD.user) cloudSync(); });
  setInterval(() => { if (CLOUD.user && document.visibilityState === 'visible') cloudSync(); }, 120000);
}

/* ---------- Konto-Dialog ---------- */
function setAcctMsg(t, bad) { const m = $('acctMsg'); m.textContent = t || ''; m.className = 'sub acct-msg' + (bad ? ' bad' : ''); }
function showTab(tab) {
  document.querySelectorAll('#acctTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  document.querySelectorAll('[data-tabpane]').forEach(f => f.classList.toggle('hidden', f.dataset.tabpane !== tab));
  setAcctMsg('');
}
function renderAccount() {
  const btn = $('accountBtn'); if (!btn) return;
  $('acctNA').classList.toggle('hidden', CLOUD.available);
  $('acctOut').classList.toggle('hidden', !CLOUD.available || !!CLOUD.user);
  $('acctIn').classList.toggle('hidden', !CLOUD.user);
  const regTab = document.querySelector('#acctTabs [data-tab="register"]');
  if (regTab) regTab.classList.toggle('hidden', CLOUD.registration === false);
  $('reInviteWrap').classList.toggle('hidden', CLOUD.mode !== 'invite'); $('reInvite').required = CLOUD.mode === 'invite';
  $('acctSince').textContent = CLOUD.user ? `Konto seit ${new Date(CLOUD.user.createdAt).toLocaleDateString('de-DE')}` : '';
  setSyncStatus(CLOUD.status);
}
function showRecovery(code) {
  $('recoveryCode').textContent = code;
  $('recoveryOk').checked = false; $('recoveryDone').disabled = true;
  $('acctRecovery').classList.remove('hidden'); $('acctOut').classList.add('hidden'); $('acctIn').classList.add('hidden');
  openDlg('accountDlg');
}
const formVals = f => Object.fromEntries([...f.elements].filter(e => e.name).map(e => [e.name, e.type === 'checkbox' ? e.checked : e.value]));
function solvePow(challenge, bits) {
  return new Promise(res => {
    let w;
    try { w = new Worker('pow-worker.js'); } catch (e) { res(null); return; }
    const t = setTimeout(() => { w.terminate(); res(null); }, 60000);
    w.onmessage = ev => { clearTimeout(t); w.terminate(); res(ev.data && ev.data.nonce); };
    w.onerror = () => { clearTimeout(t); w.terminate(); res(null); };
    w.postMessage({ challenge, bits });
  });
}
async function submitAuth(kind, f) {
  const v = formVals(f), btn = f.querySelector('button[type=submit]');
  btn.disabled = true; setAcctMsg('Bitte warten …');
  try {
    if (kind === 'register') {
      if (v.password !== v.password2) { setAcctMsg('Die Passwörter stimmen nicht überein.', true); return; }
      if (!v.adult) { setAcctMsg('Die Nutzung ist erst ab 18 Jahren erlaubt.', true); return; }
      if (!v.terms) { setAcctMsg('Bitte den Nutzungsbedingungen und der Datenschutzerklärung zustimmen.', true); return; }
    }
    const url = { login: '/api/login', register: '/api/register', recover: '/api/recover' }[kind];
    if (kind === 'register' && pwScore(v.password) < 2) { setAcctMsg('Bitte ein stärkeres Passwort wählen (länger, mit Zahlen oder Sonderzeichen).', true); return; }
    const body = kind === 'recover' ? { email: v.email, recoveryCode: v.recoveryCode, newPassword: v.newPassword } : { email: v.email, password: v.password };
    if (kind === 'login' && v.totp) body.totp = v.totp.replace(/\s+/g, '');
    if (kind === 'register') {
      Object.assign(body, { adult: true, terms: true });
      if (CLOUD.mode === 'invite') body.invite = v.invite;
      else if (CLOUD.pow > 0) {
        setAcctMsg('Kurze Sicherheitsprüfung gegen Bots läuft …');
        const ch = await cloudApi('GET', '/api/challenge');
        if (!ch.ok) { setAcctMsg((ch.data && ch.data.message) || 'Sicherheitsprüfung nicht möglich.', true); return; }
        const nonce = await solvePow(ch.data.challenge, ch.data.bits);
        if (nonce == null) { setAcctMsg('Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.', true); return; }
        Object.assign(body, { challenge: ch.data.challenge, nonce });
        setAcctMsg('Konto wird angelegt …');
      }
    }
    const r = await cloudApi('POST', url, body);
    if (r.status === 0) { setAcctMsg('Der Server ist nicht erreichbar.', true); return; }
    if (kind === 'login' && r.data && (r.data.error === 'totp_required' || r.data.error === 'bad_totp')) {
      $('liTotpWrap').classList.remove('hidden'); $('liTotp').required = true; $('liTotp').value = ''; $('liTotp').focus();
      setAcctMsg(r.data.message, r.data.error === 'bad_totp'); return;
    }
    if (!r.ok) { setAcctMsg((r.data && r.data.message) || 'Das hat nicht geklappt.', true); return; }
    try { localStorage.setItem('autopot-email', v.email.trim()); } catch (e) { /* ignore */ }
    f.reset();
    if (kind === 'login') { $('liTotpWrap').classList.add('hidden'); $('liTotp').required = false; }
    if (kind === 'recover' && r.data.totpReset) toast('Die Zwei-Faktor-Anmeldung wurde zurückgesetzt. Bitte im Konto neu einrichten.', true);
    const code = r.data.recoveryCode;
    const ok = await afterAuth(kind === 'register');
    if (ok && code) showRecovery(code); else if (ok) { closeDlg('accountDlg'); toast('Angemeldet.'); }
  } finally { btn.disabled = false; }
}
async function cloudLogout() {
  if (CLOUD.dirty) await cloudSync();
  const unsynced = CLOUD.dirty;
  const r = await cloudApi('POST', '/api/logout');
  /* Ohne Verbindung bliebe die Sitzung auf dem Server gültig – dann lieber gar nicht abmelden */
  if (r.status === 0) { toast('Abmelden ist ohne Internetverbindung nicht möglich. Bitte später erneut versuchen.', true); return; }
  CLOUD.user = null; setSyncStatus('off');
  const warn = unsynced ? '\n\nACHTUNG: Es gibt Änderungen, die noch nicht in der Cloud sind. Beim Entfernen gehen sie verloren – vorher ein Backup speichern!' : '';
  if (confirm('Lokale Daten auf diesem Gerät entfernen?\n\nOK: Alles wird von diesem Gerät gelöscht (empfohlen auf fremden oder gemeinsam genutzten Geräten). Deine Daten bleiben in der Cloud.\nAbbrechen: Daten bleiben lokal erhalten.' + warn)) { await wipeLocal(); location.replace(location.pathname); return; }
  renderAccount(); closeDlg('accountDlg'); toast('Abgemeldet.');
}
async function cloudExport() {
  const r = await cloudApi('GET', '/api/export');
  if (!r.ok) { toast('Export fehlgeschlagen.', true); return; }
  download('autopot-cloud-export.json', JSON.stringify(r.data, null, 2), 'application/json');
  toast('Cloud-Daten exportiert.');
}
function bindAccount() {
  $('accountBtn').addEventListener('click', () => { renderAccount(); openDlg('accountDlg'); renderSecurity(); });
  bindSecurity();
  document.querySelectorAll('#acctTabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  [['login', 'loginForm'], ['register', 'registerForm'], ['recover', 'recoverForm']].forEach(([k, id]) => $(id).addEventListener('submit', ev => { ev.preventDefault(); submitAuth(k, $(id)); }));
  $('recoveryOk').addEventListener('change', () => { $('recoveryDone').disabled = !$('recoveryOk').checked; });
  $('recoveryDone').addEventListener('click', () => { $('acctRecovery').classList.add('hidden'); $('recoveryCode').textContent = ''; renderAccount(); closeDlg('accountDlg'); toast('Konto bereit. Deine Daten werden verschlüsselt synchronisiert.'); });
  $('recoveryCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('recoveryCode').textContent); toast('Code kopiert.'); } catch (e) { toast('Kopieren nicht möglich – bitte markieren und abschreiben.', true); } });
  $('recoverySave').addEventListener('click', () => download('autopot-wiederherstellungscode.txt', `AutoPot Grow – Wiederherstellungscode\r\n\r\n${$('recoveryCode').textContent}\r\n\r\nBewahre diese Datei sicher auf (z. B. im Passwortmanager). Wer den Code kennt, kann das Passwort zurücksetzen.\r\n`, 'text/plain;charset=utf-8'));
  $('syncNow').addEventListener('click', () => { CLOUD.dirty = true; cloudSync(); });
  $('logoutBtn').addEventListener('click', cloudLogout);
  $('cloudExport').addEventListener('click', cloudExport);
  $('pwForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formVals($('pwForm')); if (v.newPassword !== v.newPassword2) { toast('Die neuen Passwörter stimmen nicht überein.', true); return; }
    const r = await cloudApi('POST', '/api/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
    if (!r.ok) { toast((r.data && r.data.message) || 'Passwortwechsel fehlgeschlagen.', true); return; }
    $('pwForm').reset(); $('pwForm').closest('details').open = false;
    toast('Passwort geändert. Es gibt einen neuen Wiederherstellungscode.'); showRecovery(r.data.recoveryCode);
  });
  $('delForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!confirm('Konto und alle Cloud-Daten endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;
    const dv = formVals($('delForm'));
    const r = await cloudApi('DELETE', '/api/account', { password: dv.password, code: dv.code || undefined });
    if (!r.ok) { toast((r.data && r.data.message) || 'Löschen fehlgeschlagen.', true); return; }
    CLOUD.user = null; await wipeLocal(); toast('Konto gelöscht.'); location.replace(location.pathname);
  });
  const em = (() => { try { return localStorage.getItem('autopot-email') || ''; } catch (e) { return ''; } })();
  if (em) { document.querySelectorAll('#loginForm [name=email], #recoverForm [name=email]').forEach(i => { i.value = em; }); }
}

/* ---------- Sicherheit im Konto-Dialog: 2FA, Geräte, Protokoll ---------- */
const EVENT_LABELS = { register: 'Konto erstellt', login: 'Anmeldung', login_failed: 'Fehlgeschlagene Anmeldung', totp_failed: 'Falscher Zwei-Faktor-Code', recovery_used: 'Passwort per Wiederherstellungscode zurückgesetzt', recovery_regenerated: 'Neuer Wiederherstellungscode erzeugt', admin_disabled: 'Konto vom Betreiber gesperrt', admin_enabled: 'Konto vom Betreiber entsperrt', password_changed: 'Passwort geändert', '2fa_enabled': 'Zwei-Faktor-Anmeldung aktiviert', '2fa_disabled': 'Zwei-Faktor-Anmeldung deaktiviert', session_revoked: 'Ein Gerät abgemeldet', sessions_revoked: 'Alle anderen Geräte abgemeldet', export: 'Alle Daten exportiert' };
const BAD_EVENTS = new Set(['login_failed', 'totp_failed']);
const fmtDT = t => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
async function renderSecurity() {
  if (!CLOUD.user) return;
  const [me, ss, lg] = await Promise.all([cloudApi('GET', '/api/me'), cloudApi('GET', '/api/sessions'), cloudApi('GET', '/api/security-log')]);
  if (me.ok) {
    CLOUD.totp = !!me.data.totp;
    if (me.data.quotaBytes) { const mb = b => (b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }); $('acctUsage').textContent = `Speicher: ${mb(me.data.usageBytes)} MB von ${mb(me.data.quotaBytes)} MB belegt (${me.data.photos} Fotos)`; }
    $('tfaState').innerHTML = CLOUD.totp ? '<span class="chip ok">aktiv</span> Beim Anmelden wird zusätzlich ein Code aus deiner Authenticator-App abgefragt.' : '<span class="chip warn">aus</span> Empfohlen: Schützt dein Konto auch dann, wenn jemand dein Passwort kennt.';
    $('tfaStart').classList.toggle('hidden', CLOUD.totp || !$('tfaSetup').classList.contains('hidden'));
    $('tfaOffForm').classList.toggle('hidden', !CLOUD.totp);
    $('delCodeWrap').classList.toggle('hidden', !CLOUD.totp);
    $('delCode').required = CLOUD.totp;
  }
  if (ss.ok) {
    const list = ss.data.sessions;
    $('sessList').innerHTML = list.map(x => `<div class="item"><div><strong>${esc(x.label)}</strong>${x.current ? ' <span class="chip ok">dieses Gerät</span>' : ''}<p class="meta">angemeldet ${esc(fmtDT(x.createdAt))} · zuletzt aktiv ${esc(fmtDT(x.lastSeen))}</p></div>${x.current ? '' : `<button class="btn small danger" data-sess="${esc(x.id)}" type="button">Abmelden</button>`}</div>`).join('');
    $('sessOthers').classList.toggle('hidden', list.length < 2);
    $('sessCount').textContent = `(${list.length})`;
  }
  if (lg.ok) {
    const ev = lg.data.events;
    const bad = ev.filter(e => BAD_EVENTS.has(e.type) && Date.now() - e.at < 7 * 864e5).length;
    $('secLog').innerHTML = (bad ? `<div class="notice warn"><span>${bad} fehlgeschlagene Anmeldeversuche in den letzten 7 Tagen. Wenn du das nicht warst: Passwort ändern und Zwei-Faktor-Anmeldung aktivieren.</span></div>` : '') +
      (ev.map(e => `<div class="logrow${BAD_EVENTS.has(e.type) ? ' bad' : ''}"><span>${esc(EVENT_LABELS[e.type] || e.type)}</span><span class="sub">${esc(fmtDT(e.at))}</span></div>`).join('') || '<p class="sub">Noch keine Einträge.</p>');
  }
}
function bindSecurity() {
  $('tfaStart').addEventListener('click', async () => {
    const r = await cloudApi('POST', '/api/2fa/setup');
    if (!r.ok) { toast((r.data && r.data.message) || 'Einrichtung nicht möglich.', true); return; }
    try { $('tfaQr').innerHTML = window.AutoPotQR ? window.AutoPotQR.svg(r.data.uri, { label: 'QR-Code für die Authenticator-App' }) : ''; } catch (e) { $('tfaQr').innerHTML = ''; }
    $('tfaSecret').textContent = r.data.secret.match(/.{1,4}/g).join(' ');
    $('tfaLink').href = r.data.uri;
    $('tfaSetup').classList.remove('hidden'); $('tfaStart').classList.add('hidden');
    $('tfaCode').value = ''; $('tfaCode').focus();
  });
  $('tfaEnableForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await cloudApi('POST', '/api/2fa/enable', { code: $('tfaCode').value.trim() });
    if (!r.ok) { toast((r.data && r.data.message) || 'Der Code stimmt nicht.', true); return; }
    $('tfaSetup').classList.add('hidden'); $('tfaQr').innerHTML = ''; $('tfaSecret').textContent = '';
    toast('Zwei-Faktor-Anmeldung ist aktiv.'); renderSecurity();
  });
  $('tfaCancel').addEventListener('click', () => { $('tfaSetup').classList.add('hidden'); $('tfaQr').innerHTML = ''; renderSecurity(); });
  $('tfaOffForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = formVals($('tfaOffForm'));
    const r = await cloudApi('POST', '/api/2fa/disable', { password: v.password, code: v.code });
    if (!r.ok) { toast((r.data && r.data.message) || 'Deaktivieren fehlgeschlagen.', true); return; }
    $('tfaOffForm').reset(); toast('Zwei-Faktor-Anmeldung deaktiviert.'); renderSecurity();
  });
  $('sessList').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-sess]'); if (!b) return;
    const r = await cloudApi('DELETE', '/api/sessions/' + b.dataset.sess);
    toast(r.ok ? 'Gerät abgemeldet.' : 'Abmelden fehlgeschlagen.', !r.ok); renderSecurity();
  });
  $('rcForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await cloudApi('POST', '/api/recovery-code', { password: $('rcPwd').value });
    if (!r.ok) { toast((r.data && r.data.message) || 'Das hat nicht geklappt.', true); return; }
    $('rcForm').reset(); toast('Neuer Wiederherstellungscode erzeugt – der alte ist ab sofort ungültig.'); showRecovery(r.data.recoveryCode);
  });
  $('sessOthers').addEventListener('click', async () => {
    const r = await cloudApi('DELETE', '/api/sessions/others');
    toast(r.ok ? `${r.data.removed} Gerät(e) abgemeldet.` : 'Abmelden fehlgeschlagen.', !r.ok); renderSecurity();
  });
}
