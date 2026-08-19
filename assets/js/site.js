// Global site behaviour: the mobile navigation toggle.
//
// Data-attribute contract (_includes/header.html):
//   [data-nav-toggle]              button; its aria-expanded mirrors the panel state
//   [data-nav-panel]               the collapsible nav; `hidden` + .hidden when closed
//   [data-nav-icon="open|close"]   the two glyphs inside the toggle
//
// Esc closes the panel and returns focus to the toggle. Nothing here depends on
// any other script.
(function () {
  const toggle = document.querySelector('[data-nav-toggle]');
  const panel = document.querySelector('[data-nav-panel]');
  if (!toggle || !panel) return;
  const icons = toggle.querySelectorAll('[data-nav-icon]');

  /**
   * Show/hide the nav panel and swap the toggle's open/close glyph.
   * @param {boolean} open
   */
  function setOpen(open) {
    panel.hidden = !open;
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    icons.forEach((i) => {
      i.classList.toggle('hidden', (i.dataset.navIcon === 'open') === open);
    });
  }

  setOpen(false);
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
})();
