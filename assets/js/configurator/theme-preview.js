/**
 * Live theme preview for the /setup/ Look step (browser only).
 *
 * The site is themed entirely through CSS custom properties that
 * `_includes/theme.html` writes on `:root` (`--c-*` as "r g b" triplets,
 * `--font-*`, `--radius-*`). This module renders a miniature of the real UI —
 * header, hero, an entry card, controls — built from the production component
 * classes, and re-declares those same variables inline on the preview root, so
 * what the admin sees is the compiled stylesheet under their palette, not an
 * approximation. Colours the wizard does not ask about (ink, muted, line, …)
 * inherit from the page, exactly as they will on the built site.
 *
 * Exports are pure apart from `renderThemePreview`, which touches the DOM.
 */

import { el } from './dom.js';
import { isHexColor, parseHexColor } from './color.js';

/**
 * Corner-radius scales, keyed by the `theme.radius` answer, in the order
 * `RADIUS_STEPS` names them: the `xs` hairline step (checkbox corners, the
 * focus ring) then the five sm…2xl steps.
 *
 * Mirrors the `case` in `_includes/theme.html`, which keeps the same values in
 * two assigns (`th_rxs` and `th_r`) — a test reads both out of that file and
 * compares them with these, so keep the two in step.
 * @type {Record<string, string[]>}
 */
export const RADIUS_SCALES = {
  sharp: ['0.125rem', '0.25rem', '0.375rem', '0.5rem', '0.75rem', '1rem'],
  soft: ['0.25rem', '0.5rem', '0.75rem', '1rem', '1.25rem', '1.75rem'],
  round: ['0.375rem', '0.75rem', '1rem', '1.5rem', '2rem', '2.5rem'],
};

/** The `--radius-*` names, in the order `RADIUS_SCALES` lists their values. */
export const RADIUS_STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

/** Wizard answer key → CSS variable, for the colours the Branding step edits. */
const COLOR_VARS = [
  ['primary', '--c-primary'],
  ['primaryDark', '--c-primary-dark'],
  ['secondary', '--c-secondary'],
  ['accent', '--c-accent'],
  ['lineStrong', '--c-line-strong'],
  ['warn', '--c-warn'],
];

/**
 * Inline `style` text that re-themes a subtree the way `_includes/theme.html`
 * themes the page. Invalid or empty hex values are skipped so the preview
 * falls back to the page's own value instead of going black.
 * @param {object} answers wizard answers (the `COLOR_QUESTIONS` keys, `headingFont`, `bodyFont`, `radius`).
 * @returns {string} CSS declarations, e.g. `--c-primary: 29 78 137; --font-heading: "Inter";`.
 */
export function themeVars(answers = {}) {
  const decls = [];
  for (const [key, cssVar] of COLOR_VARS) {
    const value = answers[key];
    if (!isHexColor(value)) continue;
    const { r, g, b } = parseHexColor(value);
    decls.push(`${cssVar}: ${r} ${g} ${b}`);
  }
  if (answers.headingFont) decls.push(`--font-heading: ${JSON.stringify(String(answers.headingFont))}`);
  if (answers.bodyFont) decls.push(`--font-body: ${JSON.stringify(String(answers.bodyFont))}`);
  const radii = RADIUS_SCALES[answers.radius];
  if (radii) {
    RADIUS_STEPS.forEach((step, i) => decls.push(`--radius-${step}: ${radii[i]}`));
  }
  return decls.length ? decls.join('; ') + ';' : '';
}

/**
 * Text the miniature shows, taken from the answers when present so the preview
 * reads as *their* site, with neutral fallbacks otherwise.
 * @param {object} answers wizard answers.
 * @param {{ singular?: string, plural?: string }} labels entry labels from the schema.
 * @returns {{ mark: string, org: string, site: string, eyebrow: string, title: string, lead: string, singular: string, plural: string }}
 */
export function previewCopy(answers = {}, labels = {}) {
  const singular = labels.singular || 'entry';
  const plural = labels.plural || 'entries';
  const site = answers.siteName || 'Your catalog';
  const mark = (answers.logoText || answers.orgShort || site).slice(0, 4);
  return {
    mark,
    org: answers.orgName || 'Your organization',
    site,
    eyebrow: answers.heroEyebrow || 'Shared by members',
    title: answers.heroTitle || `What our members are building`,
    lead: answers.heroLead || `Browse ${plural} from across the network and share your own.`,
    singular,
    plural,
  };
}

/**
 * Render (or re-render) the preview into `container`.
 * @param {HTMLElement} container emptied and refilled on every call.
 * @param {object} answers wizard answers.
 * @param {{ singular?: string, plural?: string }} [labels] entry labels from the schema.
 * @returns {void}
 */
export function renderThemePreview(container, answers, labels = {}) {
  if (!container) return;
  const copy = previewCopy(answers, labels);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const header = el('div', { class: 'theme-preview-header' }, [
    el('span', { class: 'theme-preview-mark', 'aria-hidden': 'true', text: copy.mark }),
    el('span', { class: 'min-w-0' }, [
      el('span', {
        class: 'block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-muted',
        text: copy.org,
      }),
      el('span', {
        class: 'block truncate font-heading text-sm font-semibold text-brand-primary-dark',
        text: copy.site,
      }),
    ]),
    el('span', { class: 'ml-auto hidden items-center gap-3 text-xs font-medium text-brand-ink sm:flex' }, [
      el('span', { text: 'Home' }),
      el('span', { text: cap(copy.plural) }),
      el('span', { class: 'btn-primary !min-h-0 !px-3 !py-1 !text-xs', text: 'Submit' }),
    ]),
  ]);

  const hero = el('div', { class: 'theme-preview-hero' }, [
    el('p', { class: 'eyebrow !text-brand-on-dark/80', text: copy.eyebrow }),
    el('p', { class: 'mt-1 font-heading text-xl font-semibold leading-tight text-white', text: copy.title }),
    el('p', { class: 'mt-2 max-w-md text-sm text-brand-on-dark/90', text: copy.lead }),
    el('div', { class: 'mt-3 flex flex-wrap gap-2' }, [
      el('span', { class: 'btn-on-dark !min-h-0 !px-3 !py-1.5 !text-xs', text: `Browse ${copy.plural}` }),
      el('span', {
        class: 'btn-primary !min-h-0 !bg-white !px-3 !py-1.5 !text-xs !text-brand-primary-dark',
        text: 'Search',
      }),
    ]),
  ]);

  const card = el('div', { class: 'entry-card' }, [
    el('div', { class: 'entry-body !gap-1.5 !p-4' }, [
      el('p', { class: 'entry-meta' }, [
        el('span', { class: 'badge badge-md', 'data-tone': 'primary', text: 'Source code' }),
        el('span', { class: 'entry-meta-seg entry-meta-seg--text', text: copy.org }),
        el('span', { class: 'entry-meta-seg', text: 'Pilot' }),
      ]),
      el('p', { class: 'entry-title !text-base', text: `A sample ${copy.singular} title` }),
      el('p', {
        class: 'entry-summary',
        text: 'One or two plain-language sentences about what it does and who it is for.',
      }),
      el('div', { class: 'entry-chips' }, [
        el('span', { class: 'chip', text: 'Topic' }),
        el('span', { class: 'chip', text: 'Audience' }),
        el('span', { class: 'chip-neutral', text: '+2' }),
      ]),
    ]),
    el('div', { class: 'entry-foot !px-4 !pb-4' }, [
      el('div', { class: 'signal-strip' }, [
        el('span', { class: 'signal-primary', text: 'Ready' }),
        el('span', { class: 'signal', text: 'Anyone' }),
        el('span', { class: 'signal-warn', text: 'PII' }),
      ]),
    ]),
  ]);

  const controls = el('div', { class: 'theme-preview-controls' }, [
    el('div', { class: 'flex flex-wrap gap-2' }, [
      el('span', { class: 'btn-primary !min-h-0 !px-3 !py-1.5 !text-xs', text: 'Primary' }),
      el('span', { class: 'btn-secondary !min-h-0 !px-3 !py-1.5 !text-xs', text: 'Secondary' }),
    ]),
    el('div', { class: 'flex flex-wrap gap-1.5' }, [
      el('span', { class: 'filter-pill is-active !min-h-0 !py-1 !text-xs', text: 'Active filter' }),
      el('span', { class: 'filter-pill !min-h-0 !py-1 !text-xs', text: 'Filter' }),
    ]),
    el('div', { class: 'flex flex-wrap gap-1.5' }, [
      el('span', { class: 'badge badge-md', 'data-tone': 'featured' }, [
        el('span', { class: 'badge-star', 'aria-hidden': 'true', text: '★' }),
        el('span', { text: 'Featured' }),
      ]),
      el('span', { class: 'badge badge-md', 'data-tone': 'secondary', text: 'Secondary' }),
      el('span', { class: 'badge badge-md', 'data-tone': 'warn', text: 'Sensitive data' }),
    ]),
    el('p', { class: 'text-xs text-brand-muted' }, [
      el('span', { class: 'font-semibold text-brand-primary', text: 'A link' }),
      el('span', { text: ' in body text, with a ' }),
      el('span', { class: 'font-heading font-semibold text-brand-primary-dark', text: 'heading' }),
      el('span', { text: ' beside it.' }),
    ]),
  ]);

  const root = el('div', { class: 'theme-preview', style: themeVars(answers), 'aria-hidden': 'true' }, [
    header,
    hero,
    el('div', { class: 'theme-preview-body' }, [card, controls]),
  ]);

  container.replaceChildren(root);
}
