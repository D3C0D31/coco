(function () {
  try {
    var key = document.currentScript && document.currentScript.dataset.key || 'autopot-theme';
    var t = localStorage.getItem(key) || localStorage.getItem('autopot-guide-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
