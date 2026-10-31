(function () {
  'use strict';
  var F = window.NewsFmt, list = document.getElementById('newsList'), more = document.getElementById('more'), offset = 0, total = 0;
  var fmt = function (t) { return new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }); };
  function card(n) {
    return '<article class="post card" id="post-' + n.id + '">' + (n.pinned ? '<span class="pin">📌 Angeheftet</span>' : '') +
      '<h2>' + F.esc(n.title) + '</h2><p class="meta">' + F.esc(fmt(n.publishedAt)) + ' · ' + F.esc(n.author) + '</p><div class="postbody">' + F.render(n.body) + '</div></article>';
  }
  function load() {
    fetch('/api/news?limit=10&offset=' + offset).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      if (offset === 0) {
        list.innerHTML = '';
        if (d.announcement) document.getElementById('announce').innerHTML = '<div class="honest" role="status">📢 ' + F.esc(d.announcement) + '</div>';
      }
      total = d.total;
      if (!d.items.length && offset === 0) list.innerHTML = '<p class="sub">Noch keine Beiträge.</p>';
      list.insertAdjacentHTML('beforeend', d.items.map(card).join(''));
      offset += d.items.length;
      more.classList.toggle('hidden', offset >= total);
      try { var maxId = Math.max.apply(null, d.items.map(function (n) { return n.id; }).concat([Number(localStorage.getItem('autopot-news-seen')) || 0])); localStorage.setItem('autopot-news-seen', String(maxId)); } catch (e) {}
      if (location.hash && offset <= 10) { var el = document.querySelector(location.hash.replace(/[^#\w-]/g, '')); if (el) el.scrollIntoView(); }
    }).catch(function () {
      list.innerHTML = '<p class="sub">News sind nur verfügbar, wenn die Seite über den AutoPot-Server läuft.</p>';
    });
  }
  more.addEventListener('click', load);
  load();
})();
