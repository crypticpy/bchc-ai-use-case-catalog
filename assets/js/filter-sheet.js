/**
 * The mobile filter sheet. It is a real `<dialog>`, so the focus trap, Escape,
 * `inert` on the rest of the page and focus restoration on close are the
 * platform's — this module only opens it, keeps `aria-expanded` and the scroll
 * lock in sync, and closes it when the viewport crosses into the desktop layout.
 * The facet controls inside are the same markup as the desktop rail and are
 * driven by assets/js/filters.js, which imports and owns this module.
 *
 * Markup contract (_includes/filter-sheet.html):
 *   [data-sheet-open]   trigger(s); aria-expanded is mirrored here
 *   [data-filter-sheet] the <dialog>
 *   [data-sheet-close] / [data-sheet-apply]  close the sheet
 */

/**
 * Wire the sheet up. Safe to call on a page without one.
 * @returns {{close: () => void, isOpen: () => boolean}}
 */
export function initFilterSheet() {
  const sheet = document.querySelector('[data-filter-sheet]');
  const openers = Array.from(document.querySelectorAll('[data-sheet-open]'));
  if (!sheet) return { close() {}, isOpen: () => false };

  const modal = typeof sheet.showModal === 'function';

  /** Open the sheet and move focus into it. */
  function open() {
    if (sheet.open) return;
    // showModal() puts the sheet in the top layer and inerts everything else.
    // Without it (a browser predating dialog, or a dialog inside a detached
    // tree) the `open` attribute still shows it: no trap, but a usable sheet.
    if (modal) sheet.showModal();
    else sheet.open = true;
    document.documentElement.classList.add('is-dialog-open');
    openers.forEach((b) => b.setAttribute('aria-expanded', 'true'));
    // Autofocus lands on the close button otherwise, which reads as "you are
    // leaving" before the user has heard what they opened.
    const first = sheet.querySelector('.filter-sheet-body button, .filter-sheet-body input');
    if (first) first.focus();
  }

  /** Close the sheet. `close` fires the `close` event, which does the cleanup. */
  function close() {
    if (!sheet.open) return;
    sheet.close();
  }

  // Bound on the element, not called from close(): ESC and a form submission
  // close a dialog without going through us, and all three must clean up.
  sheet.addEventListener('close', () => {
    document.documentElement.classList.remove('is-dialog-open');
    openers.forEach((b) => b.setAttribute('aria-expanded', 'false'));
  });

  openers.forEach((b) => b.addEventListener('click', open));
  document
    .querySelectorAll('[data-sheet-close],[data-sheet-apply]')
    .forEach((b) => b.addEventListener('click', close));

  // Crossing into the desktop layout (resize, rotation, zooming back out) hides
  // the sheet with CSS; close it properly so the scroll lock and the top layer
  // go with it.
  const desktop = window.matchMedia('(min-width: 1024px)');
  const onDesktop = (mq) => {
    if (mq.matches) close();
  };
  if (typeof desktop.addEventListener === 'function') desktop.addEventListener('change', onDesktop);
  else if (typeof desktop.addListener === 'function') desktop.addListener(onDesktop);

  return { close, isOpen: () => sheet.open };
}
