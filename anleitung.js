    (function () {
        var top = document.getElementById('toTop');
        window.addEventListener('scroll', function () { top.classList.toggle('visible', window.scrollY > 600); }, { passive: true });
        top.addEventListener('click', function () { window.scrollTo({ top: 0 }); });
        if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
    })();
    (function () {
        var btn = document.getElementById('themeToggle');
        var root = document.documentElement;
        function isDark() {
            var t = root.getAttribute('data-theme');
            if (t) return t === 'dark';
            return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        }
        function label() { btn.textContent = isDark() ? '☀️ Light Mode' : '🌙 Dark Mode'; }
        btn.addEventListener('click', function () {
            var next = isDark() ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('autopot-guide-theme', next); } catch (e) {}
            label();
        });
        label();
    })();
