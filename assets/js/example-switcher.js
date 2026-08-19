// The showcase example switcher: the two behaviours a <details> menu does not
// get for free. Everything else — opening, closing, keyboard operation of the
// summary — is the element's own, so the menu works with this file blocked.
//
// Data-attribute contract (_includes/demo-banner.html):
//   [data-component="example-switcher"]   the <details>; its <summary> is the button
//
// Escape closes it and returns focus to the summary (otherwise focus is left
// inside a menu that is no longer visible), and a click anywhere outside closes
// it, which is what every other menu on the web does and the element does not.
// Nothing is exported; this only attaches DOM event listeners.
(function () {
  const switcher = document.querySelector('[data-component="example-switcher"]');
  if (!switcher) return;
  const summary = switcher.querySelector('summary');

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !switcher.open) return;
    switcher.open = false;
    if (summary) summary.focus();
  });

  document.addEventListener('click', (e) => {
    if (switcher.open && !switcher.contains(e.target)) switcher.open = false;
  });
})();
