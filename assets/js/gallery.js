// Entry gallery lightbox.
//
// Progressive enhancement over the markup in _includes/gallery.html: every
// thumbnail is already a real <button> and every image already renders without
// JS. This wires those buttons to the <dialog> so they open a larger view with
// prev/next, arrow keys and Esc, returning focus to the button that opened it.
(function () {
  document.querySelectorAll('[data-gallery]').forEach(setupGallery);

  /**
   * Wire one gallery root (a `[data-gallery]` element) to its `<dialog>`.
   * @param {HTMLElement} root
   */
  function setupGallery(root) {
    const dialog = root.querySelector('[data-gallery-dialog]');
    const triggers = Array.from(root.querySelectorAll('[data-gallery-open]'));
    if (!dialog || triggers.length === 0 || typeof dialog.showModal !== 'function') return;

    const image = dialog.querySelector('[data-gallery-image]');
    const caption = dialog.querySelector('[data-gallery-caption]');
    const counter = dialog.querySelector('[data-gallery-counter]');
    const live = dialog.querySelector('[data-gallery-live]');
    const prev = dialog.querySelector('[data-gallery-prev]');
    const next = dialog.querySelector('[data-gallery-next]');
    const close = dialog.querySelector('[data-gallery-close]');
    const single = triggers.length === 1;
    let index = 0;
    let opener = null;

    if (single) {
      [prev, next].forEach((b) => {
        if (b) b.hidden = true;
      });
    }

    /**
     * Show image `i`, wrapping around both ends.
     * @param {number} i
     */
    function show(i) {
      index = (i + triggers.length) % triggers.length;
      const trigger = triggers[index];
      const alt = trigger.dataset.galleryAlt || '';
      if (image) {
        image.src = trigger.dataset.gallerySrc || '';
        image.alt = alt;
      }
      if (caption) {
        caption.textContent = alt;
        caption.hidden = alt === '';
      }
      const position = 'Image ' + (index + 1) + ' of ' + triggers.length;
      if (counter) counter.textContent = position;
      // The counter itself cannot be the live region: it is the dialog's own
      // caption furniture, so a screen reader reads it as part of the dialog on
      // open and then again as an announcement. The sr-only region carries the
      // alt text too, which the visible caption shows but never announces.
      if (live) live.textContent = alt ? position + '. ' + alt : position;
    }

    /**
     * Open the lightbox at image `i` and remember what to focus on close.
     * @param {number} i
     * @param {HTMLElement} trigger
     */
    function open(i, trigger) {
      opener = trigger;
      // showModal() first: a live region inside a `display:none` dialog is not
      // in the accessibility tree yet, so writing to it before the dialog opens
      // announces nothing and the first image arrives silently.
      dialog.showModal();
      show(i);
      (close || dialog).focus();
    }

    triggers.forEach((trigger, i) => {
      trigger.addEventListener('click', () => open(i, trigger));
    });

    if (prev) prev.addEventListener('click', () => show(index - 1));
    if (next) next.addEventListener('click', () => show(index + 1));
    if (close) close.addEventListener('click', () => dialog.close());

    dialog.addEventListener('keydown', (event) => {
      if (single) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + 1);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(index - 1);
      }
    });

    // Clicking the backdrop (the dialog itself, outside its content) closes it.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });

    // Esc fires `close` natively; both paths return focus to the trigger.
    dialog.addEventListener('close', () => {
      if (opener && typeof opener.focus === 'function') opener.focus();
      opener = null;
    });
  }
})();
