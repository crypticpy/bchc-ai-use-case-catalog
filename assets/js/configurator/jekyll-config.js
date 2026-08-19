/**
 * `_config.yml` emission.
 *
 * The wizard owns exactly four lines of that file — title, description, url and
 * baseurl. Everything else (excludes, plugins, defaults, sass) is build
 * mechanics maintainers may extend, so it is patched in place rather than
 * rewritten. The template used when the file is missing is the repository's own
 * `_config.yml`, compiled in by scripts/build_defaults.mjs.
 */

import { quoteYamlString } from './yaml-emit.js';
import { DEFAULT_JEKYLL_CONFIG } from './default-config.js';

/**
 * Update only the top-level `title` / `description` (and `url` / `baseurl` when
 * given) lines of an existing `_config.yml`, leaving comments, ordering and
 * every other build setting untouched.
 *
 * @param {string} existing current file text
 * @param {object} [site] parsed `_data/site.yml`
 * @param {{url?: string, baseurl?: string}} [options]
 * @returns {{text: string, changed: string[]}}
 */
export function patchJekyllConfig(existing, site = {}, options = {}) {
  const updates = [
    ['title', site?.name ?? ''],
    ['description', site?.description ?? ''],
  ];
  if (options.url !== undefined) updates.push(['url', options.url]);
  if (options.baseurl !== undefined) updates.push(['baseurl', options.baseurl]);

  let text = String(existing ?? '');
  const changed = [];
  for (const [key, value] of updates) {
    const line = `${key}: ${quoteYamlString(value)}`;
    const pattern = new RegExp(`^${key}:[^\\n]*$`, 'm');
    const next = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n*$/, '\n')}${line}\n`;
    if (next !== text) changed.push(key);
    text = next;
  }
  return { text, changed };
}

/**
 * Full `_config.yml` text with the wizard-owned values substituted.
 *
 * @param {object} [site] parsed `_data/site.yml`
 * @param {{url?: string, baseurl?: string, template?: string}} [options]
 * @returns {string}
 */
export function jekyllConfig(site = {}, options = {}) {
  const template = options.template ?? DEFAULT_JEKYLL_CONFIG;
  return patchJekyllConfig(template, site, {
    url: options.url ?? '',
    baseurl: options.baseurl ?? '',
  }).text;
}
