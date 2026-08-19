/**
 * Pieces every non-default preset builds on.
 *
 * Presets carry `{site, theme, schema}` only — navigation is always derived
 * from the module toggles and the entry labels by `navigationFromSite()`.
 */

import { defaultConfig } from '../default-config.js';

/**
 * Site copy for a generic preset: the shipped site.yml with `overrides`
 * merged one level deep, so a preset only states what it changes.
 *
 * @param {object} overrides
 * @returns {object}
 */
export function genericSite(overrides) {
  const base = defaultConfig().site;
  return {
    ...base,
    ...overrides,
    organization: { ...base.organization, ...(overrides.organization || {}) },
    logo: { ...base.logo, ...(overrides.logo || {}) },
    github: { ...base.github, ...(overrides.github || {}) },
    modules: { ...base.modules, ...(overrides.modules || {}) },
    hero: { ...base.hero, ...(overrides.hero || {}) },
    home: { ...base.home, ...(overrides.home || {}) },
    submit: { ...base.submit, ...(overrides.submit || {}) },
    footer: { ...base.footer, ...(overrides.footer || {}) },
    analytics: { ...base.analytics, ...(overrides.analytics || {}) },
  };
}

/**
 * A theme built on the shipped neutrals. `ink`, `muted`, `line`, `line_strong`,
 * `surface`, `card`, `on_dark` and `warn` are tuned for AA contrast and are
 * inherited unless a preset deliberately overrides them.
 *
 * @param {Record<string, string>} colors brand colours to override
 * @param {Record<string, string>} [fonts]
 * @returns {{colors: object, fonts: object, radius: string, type: object, motion: object}}
 */
export function theme(colors, fonts = {}) {
  const base = defaultConfig().theme;
  return {
    colors: { ...base.colors, ...colors },
    fonts: { ...base.fonts, ...fonts },
    radius: 'soft',
    // Measure is a typographic setting, not a brand one: every preset inherits
    // the shipped values so the block survives a round trip through the wizard.
    type: { ...base.type },
    // Same reasoning for motion: a preset changes the brand, not the tempo.
    motion: { ...base.motion },
  };
}

/** The title field, identical in shape everywhere; `placeholder` differs. */
export const TITLE_FIELD = {
  key: 'title',
  label: 'Title',
  prompt: 'What is it called?',
  type: 'text',
  required: true,
  group: 'about',
  weight: 1,
  description: 'Short, descriptive name.',
  placeholder: 'A clear, specific title',
};

/** The summary field — always the card blurb. */
export const SUMMARY_FIELD = {
  key: 'summary',
  label: 'One-sentence summary',
  prompt: 'In one or two sentences, what is it?',
  type: 'textarea',
  required: true,
  group: 'about',
  weight: 2,
  description: 'One or two sentences shown on the catalog card. Plain language, no jargon.',
  placeholder: 'What it is and who it is for, in one sentence.',
};

/** The write-up field that becomes the page body. */
export function bodyField({ label, description, placeholder, group = 'story', weight = 1, required = true }) {
  return {
    key: 'body',
    label,
    prompt: 'Tell the full story',
    type: 'markdown',
    required,
    group,
    weight,
    description,
    placeholder,
  };
}
