/* Sichere Mini-Formatierung für News: erst alles maskieren, dann wenige Muster erlauben.
   **fett**, *kursiv*, `Code`, ## Zwischenüberschrift, - Liste, [Linktext](https://…), Leerzeile = neuer Absatz */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function inline(t) {
    return t
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/g, '<a href="$2" target="_blank" rel="noopener nofollow ugc">$1</a>');
  }
  function render(text) {
    var blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/), out = [];
    blocks.forEach(function (b) {
      var lines = b.split('\n').filter(function (l) { return l.trim() !== ''; });
      if (!lines.length) return;
      if (lines.every(function (l) { return /^\s*[-•]\s+/.test(l); })) {
        out.push('<ul>' + lines.map(function (l) { return '<li>' + inline(esc(l.replace(/^\s*[-•]\s+/, ''))) + '</li>'; }).join('') + '</ul>');
      } else if (/^##\s+/.test(lines[0]) && lines.length === 1) {
        out.push('<h3>' + inline(esc(lines[0].replace(/^##\s+/, ''))) + '</h3>');
      } else {
        out.push('<p>' + lines.map(function (l) { return inline(esc(l)); }).join('<br>') + '</p>');
      }
    });
    return out.join('');
  }
  function plain(text, max) {
    var s = String(text || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`#]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
    return max && s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + ' …' : s;
  }
  var api = { render: render, plain: plain, esc: esc };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.NewsFmt = api;
})(this);
