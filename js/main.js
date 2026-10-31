/* AutoPot Grow – Ereignisse und Start (init) – muss als letztes Skript geladen werden.
   Teil 9/9 der App. Alle Teile teilen sich einen gemeinsamen Skript-Bereich (klassische Skripte, kein Build nötig,
   funktioniert auch per Doppelklick/file://). Ladereihenfolge siehe app.html – sie ist wichtig. */
'use strict';

/* ---------- Events ---------- */
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'lightbox': if (CMP.on) pickCompare(id); else openLightbox(id); break;
    case 'edit': startEdit(id); break;
    case 'backup': exportJson(); break;
    case 'tag': {
      const cur = $('fTags').value.split(',').map(x => x.trim()).filter(Boolean);
      if (!cur.includes(b.dataset.tag)) cur.push(b.dataset.tag);
      $('fTags').value = cur.join(', ').slice(0, 120);
      break;
    }
    case 'del-entry': {
      const removed = S.entries.find(e => e.id === id);
      if (!removed) break;
      const photo = photoCache.get(id);
      S.entries = S.entries.filter(e => e.id !== id); dropPhoto(id); markDeleted('entries', id);
      if (editingId === id) resetForm();
      save(); renderAll();
      toast(`Eintrag vom ${fmtDate(removed.date)} gelöscht.`, false, { label: 'Rückgängig', fn: async () => {
        if (S.entries.some(e => e.id === id)) return;
        S.entries.push(removed); delete S.deleted.entries[id];
        if (photo) { photoCache.set(id, photo); if (idb) { try { await idbRun('readwrite', st => st.put(photo, id)); } catch (e) { /* nur im Speicher */ } } }
        save(); renderAll(); toast('Eintrag wiederhergestellt.');
      } });
      break;
    }
    case 'del-recipe': S.recipes = S.recipes.filter(r => r.id !== id); markDeleted('recipes', id); save(); renderLists(); break;
    case 'del-event': S.events = S.events.filter(r => r.id !== id); markDeleted('events', id); save(); renderLists(); break;
    case 'strain-use': useStrain(id); break;
    case 'del-strain': S.strains = S.strains.filter(x => x.id !== id); markDeleted('strains', id); if (S.settings.strainId === id) S.settings.strainId = null; save(); renderStrains(); renderHero(); renderPlan(); break;
    case 'share-copy': copyText(shareUrl(id)); break;
    case 'share-del': (async () => { if (!confirm('Diesen Grow nicht mehr teilen? Der Link funktioniert danach nicht mehr.')) return; const r = await cloudApi('DELETE', '/api/shares/' + id); toast(r.ok ? 'Freigabe beendet.' : 'Das hat nicht geklappt.', !r.ok); loadMyShares(); })(); break;
    case 'ann-close': try { localStorage.setItem(b.dataset.key, '1'); } catch (e) { /* ignore */ } $('announceBox').innerHTML = ''; break;
    case 'del-archive': S.archive = S.archive.filter(r => r.id !== id); markDeleted('archive', id); save(); renderArchive(); break;
    case 'del-rem': S.reminders = S.reminders.filter(r => r.id !== id); markDeleted('reminders', id); save(); renderReminders(); break;
    case 'rem-done': {
      const r = S.reminders.find(x => x.id === id);
      if (r) { r.lastDone = remInfo(r).done ? null : new Date().toISOString(); save(); renderReminders(); }
      break;
    }
  }
});
document.addEventListener('change', ev => {
  const c = ev.target.closest('[data-check]');
  if (!c) return;
  S.checks[c.dataset.check][c.dataset.i] = c.checked;
  if (!c.checked) delete S.checks[c.dataset.check][c.dataset.i];
  save(); renderDashboard();
});

async function init() {
  await initPhotos();
  fillSelect($('sPhase')); fillSelect($('fPhase')); fillSelect($('rPhase'), true); fillSelect($('lPhase'), true);
  $('lPhase').options[0].textContent = 'Alle Phasen';
  loadSettings(); resetForm(); renderSymptoms();
  $('tDate').value = todayStr(); $('mDate').value = todayStr();
  $('tagChips').innerHTML = QUICK_TAGS.map(t => `<button class="qchip" type="button" data-act="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  $('ppPpm').value = Math.round((num($('ppEc').value) || 0) * Number($('ppScale').value));
  document.querySelectorAll('#rangeSeg button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === rangeDays)));
  applyTheme(readTheme());
  renderAll();
  bindChartHover();

  ['sName', 'sStart', 'sTankSize', 'sTankRest', 'sDailyUse', 'sInterval'].forEach(id => $(id).addEventListener('input', onSettings));
  $('sPhase').addEventListener('change', onSettings);
  ['hDate', 'hWet', 'hDry', 'hWatt', 'hNote'].forEach(id => $(id).addEventListener('input', onHarvest));
  ['vTemp', 'vRh', 'eBase', 'eTarget', 'eLiter', 'pCur', 'pTar', 'wOldL', 'wOldEc', 'wNewL', 'wNewEc', 'dPpfd', 'dHours', 'hLeaf'].forEach(id => $(id).addEventListener('input', renderCalc));
  const ppFromEc = () => { const e = num($('ppEc').value); $('ppPpm').value = e == null ? '' : Math.round(e * Number($('ppScale').value)); };
  $('ppEc').addEventListener('input', ppFromEc);
  $('ppScale').addEventListener('change', ppFromEc);
  $('ppPpm').addEventListener('input', () => { const p = num($('ppPpm').value); $('ppEc').value = p == null ? '' : Number((p / Number($('ppScale').value)).toFixed(2)); });

  $('saveEntry').addEventListener('click', saveEntry);
  $('cancelEdit').addEventListener('click', () => resetForm());
  $('clearForm').addEventListener('click', () => resetForm());
  $('photoRemove').addEventListener('click', () => setPhoto('', true));
  $('fPhoto').addEventListener('change', async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    try { setPhoto(await resizeImage(f), true); } catch (e) { toast('Das Foto konnte nicht verarbeitet werden.', true); }
  });
  $('lSearch').addEventListener('input', () => { LF.q = $('lSearch').value; LF.limit = 25; renderLog(); });
  $('lPhase').addEventListener('change', () => { LF.phase = $('lPhase').value; LF.limit = 25; renderLog(); });
  $('lPhoto').addEventListener('change', () => { LF.photo = $('lPhoto').checked; LF.limit = 25; renderLog(); });
  $('logMore').addEventListener('click', () => { LF.limit += 25; renderLog(); });
  document.querySelectorAll('#rangeSeg button').forEach(b => b.addEventListener('click', () => {
    rangeDays = Number(b.dataset.range);
    try { localStorage.setItem('autopot-range', String(rangeDays)); } catch (e) { /* ignore */ }
    document.querySelectorAll('#rangeSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderCharts();
  }));

  /* Daten-Dialog */
  $('dataBtn').addEventListener('click', () => openDlg('dataDlg'));
  $('moreBtn').addEventListener('click', () => openDlg('moreSheet'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeDlg(b.dataset.close)));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', ev => { if (ev.target === d) closeDlg(d.id); }));
  $('moreSheet').addEventListener('click', ev => {
    const a = ev.target.closest('a');
    if (!a) return;
    closeDlg('moreSheet');
    if (a.dataset.open) { ev.preventDefault(); openDlg(a.dataset.open); }
  });
  $('lbPrev').addEventListener('click', () => { if (lb.i > 0) { lb.i--; showLb(); } });
  $('lbNext').addEventListener('click', () => { if (lb.i < lb.list.length - 1) { lb.i++; showLb(); } });
  document.addEventListener('keydown', ev => {
    if (!$('lightbox').open) return;
    if (ev.key === 'ArrowLeft') $('lbPrev').click();
    if (ev.key === 'ArrowRight') $('lbNext').click();
  });

  $('exportCsv').addEventListener('click', () => { closeDlg('dataDlg'); exportCsv(); });
  $('bkEncrypt').addEventListener('change', () => { $('bkPwWrap').classList.toggle('hidden', !$('bkEncrypt').checked); });
  $('backupJson').addEventListener('click', async () => {
    let pw = '';
    if ($('bkEncrypt').checked) {
      pw = $('bkPw').value;
      if (pw.length < 8) { toast('Backup-Passwort: mindestens 8 Zeichen.', true); return; }
      if (pw !== $('bkPw2').value) { toast('Die Backup-Passwörter stimmen nicht überein.', true); return; }
    }
    closeDlg('dataDlg');
    if (await exportJson(pw)) { $('bkPw').value = ''; $('bkPw2').value = ''; }
  });
  $('pwAskForm').addEventListener('submit', ev => { ev.preventDefault(); finishAsk($('pwAskInput').value); });
  $('pwAskCancel').addEventListener('click', () => finishAsk(null));
  $('pwAsk').addEventListener('close', () => { if (pwAskResolve) finishAsk(null); });
  $('fillLast').addEventListener('click', fillLast);
  $('nutriSearch').addEventListener('input', renderKnowledge);
  try { const pwr = JSON.parse(localStorage.getItem('autopot-power') || 'null'); if (pwr) { $('pwWatt').value = pwr.w; $('pwExtra').value = pwr.extra; $('pwPrice').value = pwr.price; } } catch (e) { /* ignore */ }
  if (!num($('pwWatt').value) && S.harvest.watt) $('pwWatt').value = S.harvest.watt;
  ['pwWatt', 'pwExtra', 'pwPrice'].forEach(id => $(id).addEventListener('input', renderPower));
  $('pwHours').addEventListener('input', () => { $('pwHours').dataset.touched = '1'; renderPower(); });
  ['sLight', 'sFlowerWeeks', 'sFlowerStart'].forEach(id => $(id).addEventListener('input', onSettings));
  bindPwMeters();
  renderKnowledge(); renderPower(); renderPlan(); renderStrains(); renderToday();
  $('stSave').addEventListener('click', saveStrain);
  $('shareBtn').addEventListener('click', openShare);
  $('shCreate').addEventListener('click', createShare);
  $('climateFile').addEventListener('change', ev => { closeDlg('dataDlg'); if (ev.target.files[0]) importClimate(ev.target.files[0]); ev.target.value = ''; });
  $('cmpBtn').addEventListener('click', () => { if (photoCache.size < 2) { toast('Für einen Vergleich braucht es mindestens zwei Fotos.', true); return; } toggleCompare(!CMP.on); });
  $('cmpRange').addEventListener('input', () => { $('cmpB').style.clipPath = `inset(0 0 0 ${$('cmpRange').value}%)`; });
  $('exportIcs').addEventListener('click', exportIcs);
  $('restorePrev').addEventListener('click', restorePrev);
  $('importFile').addEventListener('change', ev => { closeDlg('dataDlg'); if (ev.target.files[0]) importFile(ev.target.files[0]); ev.target.value = ''; });
  $('tankChange').addEventListener('click', tankChange);
  $('newGrow').addEventListener('click', newGrow);
  ['printBtn', 'printBtn2'].forEach(id => $(id).addEventListener('click', () => { closeDlg('dataDlg'); setTimeout(() => window.print(), 50); }));
  $('themeToggle').addEventListener('click', () => {
    const order = ['system', 'light', 'dark'], next = order[(order.indexOf(readTheme()) + 1) % 3];
    try { localStorage.setItem('autopot-theme', next); } catch (e) { /* ignore */ }
    applyTheme(next); renderCharts();
  });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(readTheme()); renderCharts(); });

  /* App installieren */
  let deferred = null;
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); deferred = ev; $('installBtn').classList.remove('hidden'); });
  window.addEventListener('appinstalled', () => { deferred = null; $('installBtn').classList.add('hidden'); toast('App installiert.'); });
  $('installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) { /* ignore */ }
    deferred = null; $('installBtn').classList.add('hidden');
  });

  $('saveRecipe').addEventListener('click', () => {
    const name = $('rName').value.trim();
    if (!name) { toast('Bitte einen Namen eingeben.', true); return; }
    S.recipes.push({ id: uid(), name: name.slice(0, 60), phase: $('rPhase').value, text: $('rText').value.trim().slice(0, 500) });
    save(); $('rName').value = ''; $('rText').value = ''; renderLists();
  });
  $('saveEvent').addEventListener('click', () => {
    const date = $('tDate').value, title = $('tTitle').value.trim();
    if (!date || !title) { toast('Datum und Ereignis angeben.', true); return; }
    S.events.push({ id: uid(), date, title: title.slice(0, 80), note: $('tNote').value.trim().slice(0, 300) });
    save(); $('tTitle').value = ''; $('tNote').value = ''; renderLists();
  });
  const addRem = (title, date, time, repeat) => { S.reminders.push({ id: uid(), title, date, time, repeat, lastDone: null, notified: null }); save(); tick(); };
  $('saveRem').addEventListener('click', () => {
    const title = $('mTitle').value.trim();
    if (!title || !$('mDate').value) { toast('Aufgabe und Datum angeben.', true); return; }
    addRem(title.slice(0, 80), $('mDate').value, $('mTime').value || '09:00', $('mRepeat').value);
    $('mTitle').value = '';
  });
  $('tplMeasure').addEventListener('click', () => addRem('pH/EC messen', todayStr(), '09:00', 'daily'));
  $('tplFilter').addEventListener('click', () => addRem('Tankfilter reinigen', todayStr(), '09:00', 'weekly'));
  $('notifyBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) { toast('Benachrichtigungen werden nicht unterstützt.', true); return; }
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
    renderReminders();
  });
  $('diagBtn').addEventListener('click', diagnose);
  $('diagReset').addEventListener('click', () => { document.querySelectorAll('#symptoms input').forEach(x => { x.checked = false; }); $('diagOut').innerHTML = ''; });
  $('weekReset').addEventListener('click', () => { S.checks.week = {}; save(); renderChecks(); renderDashboard(); });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderCharts, 150); });
  window.addEventListener('scroll', () => { if (!navRaf) navRaf = requestAnimationFrame(updateNav); }, { passive: true });
  updateNav();
  setInterval(tick, 60000);
  tick();

  /* Einblend-Animation (nicht bei reduzierter Bewegung) */
  if ('IntersectionObserver' in window && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    document.documentElement.classList.add('js-reveal');
    const io = new IntersectionObserver(list => list.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -4% 0px' });
    document.querySelectorAll('main > section').forEach(s => io.observe(s));
  }

  bindAccount();
  cloudInit().then(() => {
    const mode = new URLSearchParams(location.search).get('mode');
    if (!CLOUD.available && ['login', 'register'].includes(mode)) { renderAccount(); openDlg('accountDlg'); }
    else if (CLOUD.available && !CLOUD.user && ['login', 'register'].includes(mode)) {
      const closed = mode === 'register' && CLOUD.registration === false;
      showTab(closed ? 'login' : mode); openDlg('accountDlg');
      if (closed) setAcctMsg('Die Registrierung ist derzeit geschlossen.', true);
    }
  });

  /* Offline-Nutzung (nur über http/https, nicht bei file://) */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init().catch(err => { console.error(err); toast('Fehler beim Start der App: ' + err.message, true); });
