/**
 * Motion preferences, in one place.
 *
 * `assets/css/components/base.css` already sets `scroll-behavior: auto` on the
 * root under `prefers-reduced-motion: reduce`, but an explicit `behavior`
 * argument to `scrollIntoView`/`scrollBy` overrides the CSS — so every call
 * site that passes `behavior: 'smooth'` has to ask first. This is that ask.
 *
 * ES module, imported by the configurator. The classic scripts on /submit/ and
 * `assets/js/carousel.js` are emitted as plain `<script defer>` by
 * `_layouts/default.html` and cannot import, so they carry the same two-line
 * check inline (`window.SubmitForm.scrollBehavior`, and `behavior()` in
 * carousel.js); keep the three in step.
 */

/** @returns {boolean} true when the reader has asked for less animation. */
export function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * The `behavior` to pass to a scroll call.
 * Re-read on every call, so a mid-session change of the OS setting is honoured.
 * @param {ScrollBehavior} [reduced] what to use when motion is unwelcome.
 *   Defaults to `'auto'` (the element's own CSS decides); pass `'instant'` to
 *   force an immediate jump even where CSS asks for smooth scrolling.
 * @returns {ScrollBehavior}
 */
export function scrollBehavior(reduced = 'auto') {
  return prefersReducedMotion() ? reduced : 'smooth';
}
