/* Light / dark theme: remembers the choice, otherwise follows the device setting. */
(function () {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = t => {
    root.dataset.theme = t;
    if (meta) meta.content = t === 'dark' ? '#150a10' : '#4b1027';
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.setAttribute('aria-pressed', String(t === 'dark'));
      b.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      b.title = t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    });
  };
  apply(root.dataset.theme || 'light');
  document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('bb_theme', next); } catch {}
    apply(next);
  }));
  try { matchMedia('(prefers-color-scheme:dark)').addEventListener('change', e => { if (!localStorage.getItem('bb_theme')) apply(e.matches ? 'dark' : 'light'); }); } catch {}
})();
