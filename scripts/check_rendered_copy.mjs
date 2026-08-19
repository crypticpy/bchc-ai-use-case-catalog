#!/usr/bin/env node
/**
 * Prose and structure checks over a *built* site.
 *
 *   node scripts/check_rendered_copy.mjs [_site]
 *
 * The template's copy is assembled from `_data/schema.yml` at render time
 * ("Submit {{ singular | downcase | with_article }}"), so a sentence that reads
 * correctly for one entry noun can be broken for another — and only the built
 * HTML shows it. These are the regressions that survived review in the shipped
 * config because the shipped noun happens to fit: "Submit a entry", a sentence
 * whose first word got `downcase`d along with the noun, a call to action that
 * points at a page a disabled module removed from the build.
 *
 * Deliberately not part of `npm run validate` — that gate is build-free and
 * must stay runnable without Ruby. This runs under `npm run test:build`, which
 * builds each preset first (scripts/build_variants.mjs).
 *
 * Findings are data, not prose: `{ rule, file, message }`, so the build matrix
 * can group them and the CLI can print them.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { JSDOM } from 'jsdom';
import * as yaml from 'js-yaml';

/** Rule ids, so a caller can filter or count them without matching on prose. */
export const RULES = ['article', 'sentence-case', 'heading', 'link', 'liquid'];

/**
 * Elements whose text is not read as prose. `<code>` deliberately stays in:
 * a paragraph that opens with an inline code span ("`_includes/entry-card.html`
 * rendered for…") is correctly capitalised, and dropping the span would make
 * the sentence-case rule read the second word as the first.
 */
const NON_PROSE = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

/** Block elements that hold one sentence each, for the sentence-case rule. */
const PROSE_BLOCKS = 'p, h1, h2, h3, h4';

/**
 * What counts as a sentence for the sentence-case rule: three or more words
 * ending in sentence punctuation. Labels, token names and button text are
 * legitimately not capitalised like sentences, and only a full sentence can
 * carry the `'No ' | append: plural | downcase` bug this rule exists for.
 */
const SENTENCE = /^\S+(?: \S+){2,}[.!?…]$/;

/**
 * Lowercase openers that are correct: identifiers and paths the docs pages name
 * in running prose.
 */
const LOWERCASE_OPENERS = /^(?:[a-z0-9_.-]*[/_.][a-z0-9_./-]*|npm|https?|e\.g\.|i\.e\.)\b/;

/**
 * The indefinite article that fits a noun, by sound rather than spelling.
 * A port of `with_article` in `_plugins/text_filters.rb`; the two are checked
 * against each other in test/build/rendered-copy.test.mjs.
 * @param {string} noun
 * @returns {'a'|'an'}
 */
export function articleFor(noun) {
  const text = String(noun ?? '').trim();
  const consonantSound = /^(?:u[^aeiou][aeiou]|eu|one\b|uni)/i.test(text);
  const vowelSound = /^(?:[aeiou]|hour|honest|honou?r|heir)/i.test(text);
  return vowelSound && !consonantSound ? 'an' : 'a';
}

/** Every `<dir>/index.html` under `root`, as paths relative to `root`. */
function htmlPages(root) {
  const found = [];
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.isFile() && item.name.endsWith('.html')) found.push(path.relative(root, full));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found.sort();
}

/** Visible text of an element with markup-only descendants removed. */
function proseText(element) {
  const clone = element.cloneNode(true);
  for (const node of clone.querySelectorAll('*')) {
    if (NON_PROSE.has(node.tagName.toUpperCase())) node.remove();
  }
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

/** The whole document's visible text, for the phrase-level rules. */
function documentText(document) {
  return document.body ? proseText(document.body) : '';
}

/**
 * The entry noun from a variant's `_data/schema.yml`.
 * @param {string} sourceDir repo (or scratch copy) root.
 * @returns {{singular: string, plural: string, path: string}}
 */
export function entryNoun(sourceDir) {
  let entry = {};
  try {
    entry = yaml.load(fs.readFileSync(path.join(sourceDir, '_data', 'schema.yml'), 'utf8'))?.entry ?? {};
  } catch {
    // A missing or unparseable schema is validate.mjs's problem, not this one.
  }
  return {
    singular: String(entry.singular || 'Entry'),
    plural: String(entry.plural || 'Entries'),
    path: String(entry.path || 'catalog').replace(/^\/+|\/+$/g, ''),
  };
}

/* -------------------------------------------------------------------------- */

/**
 * @param {string} siteDir a built `_site`.
 * @param {{sourceDir?: string, noun?: {singular: string, plural: string, path: string}}} [options]
 *   `sourceDir` is the repo the site was built from (default: `siteDir`'s
 *   parent); it supplies the entry noun. Pass `noun` to skip reading it.
 * @returns {{rule: string, file: string, message: string}[]} empty when clean.
 */
export function checkRenderedCopy(siteDir, options = {}) {
  const sourceDir = options.sourceDir ?? path.dirname(path.resolve(siteDir));
  const noun = options.noun ?? entryNoun(sourceDir);
  const findings = [];
  const add = (rule, file, message) => findings.push({ rule, file, message });

  // A noun can appear downcased ("Submit a use case") or capitalised at the
  // start of a sentence, so both cases are matched, and both articles are
  // checked: the wrong one is the finding either way.
  const wrong = articleFor(noun.singular) === 'a' ? 'an' : 'a';
  const escaped = noun.singular.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const articleRe = new RegExp(`\\b${wrong} (${escaped})\\b`, 'i');

  for (const file of htmlPages(siteDir)) {
    const html = fs.readFileSync(path.join(siteDir, file), 'utf8');
    const { document } = new JSDOM(html).window;
    const text = documentText(document);

    const stutter = text.match(articleRe);
    if (stutter) {
      add(
        'article',
        file,
        `"${stutter[0]}" — "${noun.singular}" takes "${articleFor(noun.singular)}". ` +
          'Render the article with the `with_article` filter instead of hard-coding it.'
      );
    }

    for (const block of document.querySelectorAll(PROSE_BLOCKS)) {
      const sentence = proseText(block);
      if (!/^[a-z]/.test(sentence)) continue;
      if (!SENTENCE.test(sentence) || LOWERCASE_OPENERS.test(sentence)) continue;
      add(
        'sentence-case',
        file,
        `"${sentence.slice(0, 72)}" starts in lower case. A \`| downcase\` on a whole ` +
          'concatenation lowercases the sentence, not just the noun — downcase the noun on its own.'
      );
    }

    const headings = document.querySelectorAll('h1');
    if (headings.length !== 1) {
      add('heading', file, `${headings.length} <h1> elements; every page needs exactly one.`);
    }

    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href');
      if (!href.startsWith('/') || href.startsWith('//')) continue; // external, anchor or relative
      const target = href.replace(/[?#].*$/, '');
      const candidates = target.endsWith('/')
        ? [path.join(siteDir, target, 'index.html')]
        : [path.join(siteDir, target), path.join(siteDir, target, 'index.html')];
      if (candidates.some((candidate) => fs.existsSync(candidate))) continue;
      add('link', file, `"${href}" (${proseText(anchor) || 'no text'}) is not in the built site.`);
    }

    // Liquid that failed to render leaves its source in the output; Jekyll only
    // logs it, so a broken include ships as literal `{{ … }}` on the page.
    const leftover = html.match(/(Liquid (?:Exception|Warning|error)[^\n<]*|\{\{[^}]{1,60}\}\})/i);
    if (leftover) add('liquid', file, `unrendered Liquid or a render error: ${leftover[0].trim()}`);
  }

  return findings;
}

/** Findings as a printable report, grouped by rule. */
export function formatFindings(findings) {
  if (findings.length === 0) return 'Rendered copy check passed.';
  const byRule = new Map();
  for (const finding of findings) {
    if (!byRule.has(finding.rule)) byRule.set(finding.rule, []);
    byRule.get(finding.rule).push(finding);
  }
  return [...byRule.entries()]
    .map(([rule, items]) =>
      [`${rule} (${items.length})`, ...items.map((i) => `  ${i.file}: ${i.message}`)].join('\n')
    )
    .join('\n\n');
}

/* -------------------------------------------------------------------------- */

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const siteDir = path.resolve(process.argv[2] || '_site');
  if (!fs.existsSync(siteDir)) {
    console.error(`No built site at ${siteDir}. Run \`bundle exec jekyll build\` first.`);
    process.exit(1);
  }
  const findings = checkRenderedCopy(siteDir, { sourceDir: process.cwd() });
  console.log(formatFindings(findings));
  process.exit(findings.length === 0 ? 0 : 1);
}
