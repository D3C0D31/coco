(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'autopot-theme';
  var btn = document.getElementById('themeBtn');
  function isDark() {
    var t = root.getAttribute('data-theme');
    if (t) return t === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function label() { if (btn) btn.textContent = isDark() ? '☀️' : '🌙'; }
  if (btn) btn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
    label();
  });
  label();

  /* Einblenden beim Scrollen */
  if ('IntersectionObserver' in window && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    root.classList.add('js-reveal');
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } });
    }, { rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });
  }

  /* Server erreichbar? Dann Anmelde-Knöpfe anpassen */
  if (/^https?:$/.test(location.protocol)) {
    fetch('/api/config', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (cfg) {
      if (!cfg) return;
      if (cfg.registration === false) document.querySelectorAll('[data-needs-reg]').forEach(function (e) { e.classList.add('hidden'); });
      return fetch('/api/session', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
        if (!s || !s.authenticated) return;
        document.querySelectorAll('[data-login]').forEach(function (e) { e.textContent = 'Zur App →'; e.setAttribute('href', 'app.html'); });
        document.querySelectorAll('[data-needs-reg]').forEach(function (e) { e.classList.add('hidden'); });
      });
    }).catch(function () {});
  }
})();
