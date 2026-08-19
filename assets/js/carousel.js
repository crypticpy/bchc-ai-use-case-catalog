// Scroll-snap carousel with prev/next buttons. No autoplay.
//
// Data-attribute contract:
//   [data-carousel]        root; one instance is wired per match
//   [data-carousel-track]  the scrollable strip (CSS scroll-snap does the rest)
//   [data-carousel-prev]   optional "previous" button, aria-disabled at the start
//   [data-carousel-next]   optional "next" button, aria-disabled at the end
// The ends are marked with aria-disabled rather than `disabled`: a real
// `disabled` attribute drops the button out of the tab ring the moment the
// track reaches an end, which silently throws away the focus that was on it.
// Nothing is exported; this only attaches DOM event listeners.
(function () {
  // Checked per scroll so a mid-session change of the OS setting is honoured.
  // 'instant' (not 'auto') so the jump is immediate even where the element's
  // own scroll-behavior is smooth — assets/css/components/base.css also drops
  // `scroll-smooth` on the track under prefers-reduced-motion.
  // The same decision lives in assets/js/lib/motion.js (`scrollBehavior`) for
  // the configurator and in `SubmitForm.scrollBehavior` for /submit/; this file
  // is emitted as a classic `<script defer>` and cannot import the module, so
  // it repeats the two lines. Keep the three in step.
  const reduced = () =>
    Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const behavior = () => (reduced() ? 'instant' : 'smooth');
  document.querySelectorAll('[data-carousel]').forEach((root) => {
    const track = root.querySelector('[data-carousel-track]');
    const prev = root.querySelector('[data-carousel-prev]');
    const next = root.querySelector('[data-carousel-next]');
    if (!track) return;
    /** @returns {number} px to scroll per step: one card's width (+ gap), or 80% of the track as a fallback. */
    function step() {
      const first = track.firstElementChild;
      return first ? first.getBoundingClientRect().width + 24 : track.clientWidth * 0.8;
    }
    /** @param {Element|null} b @returns {boolean} whether the button is at its end of the track. */
    const off = (b) => Boolean(b) && b.getAttribute('aria-disabled') === 'true';
    /** Sync the prev/next buttons' aria-disabled state with the current scroll position. */
    function update() {
      const max = track.scrollWidth - track.clientWidth - 2;
      const ends = [
        [prev, track.scrollLeft <= 2],
        [next, track.scrollLeft >= max],
      ];
      // Nothing to scroll (every item fits): hide both arrows rather than leave two dimmed,
      // permanently inert circles beside the heading.
      const scrollable = track.scrollWidth > track.clientWidth + 2;
      ends.forEach(([b, atEnd]) => {
        if (!b) return;
        // The `hidden` utility, not the attribute: .icon-btn is inline-flex and outranks [hidden].
        b.classList.toggle('hidden', !scrollable);
        b.setAttribute('aria-disabled', String(atEnd));
        b.classList.toggle('opacity-40', atEnd);
      });
    }
    /**
     * Scroll one step, unless the button that asked is already at its end.
     * @param {Element|null} button the control that triggered it, or null for the arrow keys.
     * @param {number} direction -1 back, 1 forward.
     */
    function scrollStep(button, direction) {
      if (off(button)) return;
      track.scrollBy({ left: direction * step(), behavior: behavior() });
    }
    prev && prev.addEventListener('click', () => scrollStep(prev, -1));
    next && next.addEventListener('click', () => scrollStep(next, 1));
    track.addEventListener('scroll', update, { passive: true });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollStep(null, 1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollStep(null, -1);
      }
    });
    window.addEventListener('resize', update);
    update();
  });
})();
