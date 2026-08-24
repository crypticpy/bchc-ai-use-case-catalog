/**
 * Starting points for the setup wizard.
 *
 * Each preset is `{ id, name, description, config }` where `config` is
 * `{ site, theme, schema }`. Navigation is always derived from the site modules
 * and the entry labels by `navigationFromSite()`, so presets never carry it.
 *
 * `ai-use-cases` is not written out here: it is `defaultConfig()`, compiled
 * from this repository's own `_data/*.yml`. Picking it reproduces the shipped
 * configuration exactly.
 */

import { defaultConfig } from './default-config.js';
import { cohortPortal } from './presets/cohort-portal.js';
import { resourceLibrary } from './presets/resource-library.js';
import { blank } from './presets/blank.js';

const shipped = defaultConfig();

/** @type {{id: string, name: string, description: string, config: object}[]} */
export const presets = [
  {
    id: 'ai-use-cases',
    name: 'AI use case catalog',
    description:
      'The configuration this template ships with: a catalog of AI projects shared between public-sector teams, grouped by what it is, how it is built, what it takes to reuse, and the data it touches.',
    config: { site: shipped.site, theme: shipped.theme, schema: shipped.schema },
  },
  {
    id: 'cohort-portal',
    name: 'Program / cohort portal',
    description:
      'A gallery of team projects from a training program: cohort year, department and track filters, team rosters, dashboards and posters. Turns on the cohorts and events modules.',
    config: cohortPortal,
  },
  {
    id: 'resource-library',
    name: 'Resource library',
    description:
      'A curated library of guides, toolkits, datasets and training, filtered by type, topic, audience, format and what it takes to get access.',
    config: resourceLibrary,
  },
  {
    id: 'blank',
    name: 'Blank catalog',
    description:
      'The smallest useful starting point: title, summary, one category, tags, links and images. Rename everything and add your own fields.',
    config: blank,
  },
];

/**
 * Look up a preset by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getPreset(id) {
  return presets.find((preset) => preset.id === id) || null;
}

export default presets;
