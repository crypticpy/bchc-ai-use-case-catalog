/**
 * /setup/ wizard state: the answers, the field list, persistence, and the
 * configuration derived from them.
 *
 * Nothing here renders. Every step module reads and mutates the wizard through
 * this module, so the orchestrator and the steps always agree on what "now"
 * looks like without passing state down by hand.
 */

import { answersFromConfig, applyAnswers, defaultConfig } from '../core.js';
import { presets } from '../presets.js';

export const STORAGE_KEY = 'catalog-setup-wizard-v1';

/** Step ids, in order. `STEP_META` in setup-page.js carries the prose. */
export const STEPS = ['start', 'basics', 'look', 'words', 'modules', 'fields', 'review'];

/**
 * Step ids as v1.2.0 numbered them, for a session saved before the Branding
 * step was split. A stored *position* would resume on the wrong step now, so
 * the id is what gets written; this only reads the older shape back.
 */
const LEGACY_STEPS = ['start', 'basics', 'modules', 'fields', 'review'];

/**
 * Parse a Liquid-rendered `<script type="application/json" id="…">` block.
 * @param {string} id element id.
 * @returns {object|null} null when absent, unparseable, or not a JSON object.
 */
function readEmbeddedJson(id) {
  const node = typeof document === 'undefined' ? null : document.getElementById(id);
  if (!node) return null;
  try {
    const parsed = JSON.parse(node.textContent || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const fallback = defaultConfig();

/** The site's live configuration, embedded by Liquid; falls back to defaults. */
export const currentConfig = {
  site: readEmbeddedJson('current-config') || fallback.site,
  theme: readEmbeddedJson('current-theme') || fallback.theme,
  schema: readEmbeddedJson('current-schema') || fallback.schema,
};

/** `owner/repo` from `site.github.repository_nwo`, when GitHub Pages provided it. */
export const detectedRepository = (() => {
  const node = typeof document === 'undefined' ? null : document.getElementById('current-repository');
  if (!node) return null;
  try {
    const value = JSON.parse(node.textContent || 'null');
    return typeof value === 'string' && value.includes('/') ? value : null;
  } catch {
    return null;
  }
})();

/** The "start from" choices offered on step 1: the live site, then the presets. */
export const startingPoints = [
  {
    id: 'current',
    name: 'Current site configuration',
    description: 'Start from what this site is running right now and change only what you need.',
    config: currentConfig,
  },
  ...presets,
];

/** @type {{step: number, startId: string, answers: object|null, fields: object[]|null}} */
export const state = {
  step: 0,
  startId: 'current',
  answers: null,
  fields: null,
};

/**
 * A starting point's config, deep-cloned and back-filled with defaults for
 * anything a hand-edited `_data` file might be missing.
 * @param {string} startId id from `startingPoints`.
 * @returns {{site: object, theme: object, schema: object}}
 */
export function baseConfigFor(startId) {
  const start = startingPoints.find((item) => item.id === startId) || startingPoints[0];
  const config = JSON.parse(JSON.stringify(start.config));
  // A hand-edited _data file can be missing pieces; fall back rather than crash.
  config.site = { ...fallback.site, ...(config.site || {}) };
  config.theme = { ...fallback.theme, ...(config.theme || {}) };
  config.schema = { ...fallback.schema, ...(config.schema || {}) };
  if (!Array.isArray(config.schema.fields)) config.schema.fields = fallback.schema.fields;
  if (!config.site.modules) config.site.modules = { ...fallback.site.modules };
  return config;
}

/** @returns {{key: string, title: string}[]} the groups a field may be assigned to. */
export function availableGroups() {
  const groups = baseConfigFor(state.startId).schema.groups;
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((group) => group && typeof group.key === 'string' && group.key.trim() !== '')
    .map((group) => ({ key: group.key.trim(), title: String(group.title || group.key).trim() }));
}

/**
 * Reset the wizard's answers to a starting point's values.
 * @param {string} startId id from `startingPoints`.
 */
export function loadStartingPoint(startId) {
  const base = baseConfigFor(startId);
  state.startId = startId;
  state.fields = base.schema.fields.map((field) => ({ ...field, enabled: true }));
  // One mapping for both wizards: `answersFromConfig` seeds every question the
  // CLI asks, so a colour added there shows up here without a second edit.
  state.answers = answersFromConfig(base);
  if (detectedRepository) state.answers.repository = detectedRepository;
}

/** Persist `state` to localStorage so the wizard survives a reload. Silently no-ops if storage is unavailable. */
export function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step: STEPS[state.step],
        startId: state.startId,
        answers: state.answers,
        fields: state.fields,
      })
    );
  } catch {
    /* private browsing / quota — the wizard still works, it just will not resume */
  }
}

/** Forget the saved session. Silently no-ops if storage is unavailable. */
export function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * The index a stored `step` resumes on: an id from `STEPS`, or a position in
 * the v1.2.0 step list. Anything else starts at the beginning.
 * @param {unknown} stored the `step` value read back from localStorage.
 * @returns {number} index into `STEPS`.
 */
function storedStepIndex(stored) {
  const id = typeof stored === 'string' ? stored : LEGACY_STEPS[Number(stored)];
  const index = STEPS.indexOf(id);
  return index === -1 ? 0 : index;
}

/**
 * Load `state` from localStorage, falling back to the "current site" starting
 * point when nothing usable is stored.
 * @returns {boolean} true when a previous session was actually resumed.
 */
export function restore() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    stored = null;
  }
  if (!stored || !stored.answers || !Array.isArray(stored.fields)) {
    loadStartingPoint('current');
    return false;
  }
  state.step = storedStepIndex(stored.step);
  state.startId = stored.startId || 'current';
  state.answers = stored.answers;
  state.fields = stored.fields;
  if (!state.answers.modules || typeof state.answers.modules !== 'object') {
    state.answers.modules = { ...baseConfigFor(state.startId).site.modules };
  }
  return true;
}

/** Keys whose empty string means "unset" rather than "set to an empty value". */
const BLANKABLE_KEYS = ['description', 'placeholder', 'section', 'filename', 'group'];

/** @returns {object[]} `state.fields` as schema fields: enabled only, wizard-only keys stripped. */
export function enabledFields() {
  return state.fields.filter((field) => field.enabled !== false);
}

/** Strip the wizard-only `enabled` flag and drop disabled fields. */
export function schemaFields() {
  return enabledFields().map((field) => {
    const out = {};
    for (const [key, value] of Object.entries(field)) {
      if (key === 'enabled') continue;
      if (value === undefined || value === null) continue;
      if (value === '' && BLANKABLE_KEYS.includes(key)) continue;
      if (value === false && ['required', 'facet', 'card', 'search'].includes(key)) continue;
      out[key] = value;
    }
    return out;
  });
}

/** @returns {object} the full config (site/theme/schema) derived from the current answers. */
export function buildConfig() {
  const base = baseConfigFor(state.startId);
  return applyAnswers(base, { ...state.answers, fields: schemaFields() });
}
