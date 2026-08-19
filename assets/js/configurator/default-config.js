/**
 * The configuration this repository ships with, as plain data.
 *
 * Derived from `_data/*.yml` at build time (scripts/build_defaults.mjs writes
 * ./defaults.generated.js), never hand-maintained — so the wizard's starting
 * point and the live site cannot drift apart.
 */

import {
  SITE,
  THEME,
  SCHEMA,
  NAVIGATION,
  JEKYLL_CONFIG,
  JEKYLL_DEFAULTS,
  ICON_NAMES,
} from './defaults.generated.js';

/** Structured clone via JSON — every value here is JSON-shaped. */
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * A fresh, mutable copy of the shipped configuration.
 * @returns {{site: object, theme: object, schema: object, navigation: object[]}}
 */
export function defaultConfig() {
  return {
    site: clone(SITE),
    theme: clone(THEME),
    schema: clone(SCHEMA),
    navigation: clone(NAVIGATION),
  };
}

/** The verbatim `_config.yml` the wizard patches title/description into. */
export const DEFAULT_JEKYLL_CONFIG = JEKYLL_CONFIG;

/** Build-mechanics values `_config.yml` ships with (title, url, baseurl, …). */
export const DEFAULT_JEKYLL_VALUES = JEKYLL_DEFAULTS;

/** Icon names `_includes/icon.html` can render. */
export { ICON_NAMES };
