/**
 * The question model shared by the terminal wizard (`npm run setup`) and the
 * browser wizard (/setup/), plus the merge that turns a flat answers object
 * back into `{site, theme, schema, navigation}`.
 *
 * Questions are phrased for an administrator, not a developer: no YAML keys,
 * no CSS vocabulary.
 */

import { isPlainObject } from './yaml-emit.js';
import { defaultConfig } from './default-config.js';
import { normalizeMotion } from './motion.js';

/**
 * The colour answers both wizards ask for, in the order they ask them.
 * `key` is the answers key; `path` is the `theme.colors` key it writes.
 * @type {{key: string, path: string, label: string, help: string}[]}
 */
export const COLOR_QUESTIONS = [
  {
    key: 'primary',
    path: 'primary',
    label: 'Main colour',
    help: 'Buttons, links and the active state of controls.',
  },
  {
    key: 'primaryDark',
    path: 'primary_dark',
    label: 'Dark banner colour',
    help: 'Background of the home page banner and the footer. Light text sits on it, so keep it dark.',
  },
  {
    key: 'secondary',
    path: 'secondary',
    label: 'Supporting colour',
    help: 'Category markers and secondary icons.',
  },
  { key: 'accent', path: 'accent', label: 'Highlight colour', help: 'Warm highlights on featured entries.' },
  {
    key: 'lineStrong',
    path: 'line_strong',
    label: 'Control outline colour',
    help: 'The border around text boxes, checkboxes and filter buttons. Mid-grey works best.',
  },
  {
    key: 'warn',
    path: 'warn',
    label: 'Caution colour',
    help: 'Only used to flag sensitive data and form errors. Keep it distinct from the main colour.',
  },
];

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** Assign only when the answer is present (undefined/null keep the base value). */
function pick(answers, key, fallback) {
  const value = answers[key];
  return value === undefined || value === null ? fallback : value;
}

/**
 * Primary navigation derived from the module toggles and the entry labels.
 * Items carrying `module` are hidden by the layouts when that module is off.
 *
 * @param {object} site
 * @param {object} schema
 * @returns {{label: string, url: string, module?: string, style?: string}[]}
 */
export function navigationFromSite(site, schema) {
  const plural = String(schema?.entry?.plural ?? 'Catalog').trim() || 'Catalog';
  const path = String(schema?.entry?.path ?? 'catalog').trim() || 'catalog';
  return [
    { label: 'Home', url: '/' },
    { label: plural, url: `/${path}/`, module: 'catalog' },
    { label: 'Events', url: '/events/', module: 'events' },
    { label: 'Cohorts', url: '/cohorts/', module: 'cohorts' },
    { label: 'Resources', url: '/resources/', module: 'resources' },
    { label: 'About', url: '/about/' },
    { label: 'Governance', url: '/governance/', module: 'governance' },
    { label: 'Submit', url: '/submit/', module: 'submit', style: 'button' },
  ];
}

/**
 * Seed a flat answers object from a configuration — what both wizards show as
 * the pre-filled value of every question.
 *
 * @param {{site: object, theme: object, schema: object}} config
 * @returns {Record<string, *>}
 */
export function answersFromConfig(config) {
  const site = config?.site ?? {};
  const theme = config?.theme ?? {};
  const schema = config?.schema ?? {};
  const colors = theme.colors ?? {};

  const answers = {
    siteName: site.name ?? '',
    tagline: site.tagline ?? '',
    description: site.description ?? '',
    orgName: site.organization?.name ?? '',
    orgShort: site.organization?.short_name ?? '',
    orgUrl: site.organization?.url ?? '',
    contactEmail: site.organization?.contact_email ?? '',
    logoText: site.logo?.text ?? '',
    logoImage: site.logo?.image ?? '',
    repository: site.github?.repository ?? '',
    branch: site.github?.branch ?? 'main',
    heroEyebrow: site.hero?.eyebrow ?? '',
    heroTitle: site.hero?.title ?? '',
    heroLead: site.hero?.lead ?? '',
    submitIntro: site.submit?.intro ?? '',
    submitTurnaround: site.submit?.turnaround ?? '',
    submitReviewNote: site.submit?.review_note ?? '',
    submitFallbackEmail: site.submit?.fallback_email ?? '',
    footerAbout: site.footer?.about ?? '',
    copyright: site.footer?.copyright ?? '',
    headingFont: theme.fonts?.heading ?? 'Source Serif 4',
    bodyFont: theme.fonts?.body ?? 'Inter',
    googleFontsUrl: theme.fonts?.google_fonts_url ?? '',
    radius: theme.radius ?? 'soft',
    // `null` when the file has no `motion:` block; the Liquid defaults cover it.
    motion: normalizeMotion(theme.motion),
    modules: { ...(site.modules ?? {}) },
    entrySingular: schema.entry?.singular ?? 'Entry',
    entryPlural: schema.entry?.plural ?? 'Entries',
  };
  for (const question of COLOR_QUESTIONS) answers[question.key] = colors[question.path] ?? '';
  return answers;
}

/**
 * Merge a flat answers object into a base config.
 *
 * @param {{site: object, theme: object, schema: object}} baseConfig
 * @param {Record<string, *>} [answers]
 * @returns {{site: object, theme: object, schema: object, navigation: object[]}}
 */
export function applyAnswers(baseConfig, answers = {}) {
  const base = clone(baseConfig || defaultConfig());
  const site = base.site;
  const theme = base.theme;
  const schema = base.schema;

  site.name = pick(answers, 'siteName', site.name);
  site.tagline = pick(answers, 'tagline', site.tagline);
  site.description = pick(answers, 'description', site.description);

  site.organization = site.organization || {};
  site.organization.name = pick(answers, 'orgName', site.organization.name);
  site.organization.short_name = pick(answers, 'orgShort', site.organization.short_name);
  site.organization.url = pick(answers, 'orgUrl', site.organization.url);
  site.organization.contact_email = pick(answers, 'contactEmail', site.organization.contact_email);

  site.logo = site.logo || {};
  site.logo.image = pick(answers, 'logoImage', site.logo.image);
  site.logo.text = pick(answers, 'logoText', site.logo.text);

  site.github = site.github || {};
  site.github.repository = pick(answers, 'repository', site.github.repository);
  site.github.branch = pick(answers, 'branch', site.github.branch);

  if (isPlainObject(answers.modules)) {
    site.modules = { ...site.modules, ...clone(answers.modules) };
  }

  site.hero = site.hero || {};
  site.hero.eyebrow = pick(answers, 'heroEyebrow', site.hero.eyebrow);
  site.hero.title = pick(answers, 'heroTitle', site.hero.title);
  site.hero.lead = pick(answers, 'heroLead', site.hero.lead);

  site.submit = site.submit || {};
  site.submit.intro = pick(answers, 'submitIntro', site.submit.intro);
  site.submit.turnaround = pick(answers, 'submitTurnaround', site.submit.turnaround);
  site.submit.review_note = pick(answers, 'submitReviewNote', site.submit.review_note);
  site.submit.fallback_email = pick(answers, 'submitFallbackEmail', site.submit.fallback_email);

  site.footer = site.footer || {};
  site.footer.about = pick(answers, 'footerAbout', site.footer.about);
  site.footer.copyright = pick(answers, 'copyright', site.footer.copyright);

  theme.colors = theme.colors || {};
  for (const question of COLOR_QUESTIONS) {
    theme.colors[question.path] = pick(answers, question.key, theme.colors[question.path]);
  }

  theme.fonts = theme.fonts || {};
  theme.fonts.heading = pick(answers, 'headingFont', theme.fonts.heading);
  theme.fonts.body = pick(answers, 'bodyFont', theme.fonts.body);
  theme.fonts.google_fonts_url = pick(answers, 'googleFontsUrl', theme.fonts.google_fonts_url);
  theme.radius = pick(answers, 'radius', theme.radius);
  // Optional block: an answer adds or replaces it, and never deletes one the
  // starting point already carries. Every other key of the starting point's
  // `site`/`theme` rides along untouched for the same reason — this merge only
  // assigns, so a key no question asks about (`demo`, `contact.ask_in_open`, a
  // hand-added one) survives the round trip through the wizard.
  const motion = normalizeMotion(answers.motion);
  if (motion) theme.motion = motion;

  schema.entry = schema.entry || {};
  schema.entry.singular = pick(answers, 'entrySingular', schema.entry.singular);
  schema.entry.plural = pick(answers, 'entryPlural', schema.entry.plural);
  if (Array.isArray(answers.groups)) schema.groups = clone(answers.groups);
  if (Array.isArray(answers.fields)) schema.fields = clone(answers.fields);

  // Hero and footer CTAs follow the entry path so links never dangle.
  const entryPath = String(schema.entry.path || 'catalog');
  if (site.hero.primary_cta) site.hero.primary_cta.url = `/${entryPath}/`;

  return { site, theme, schema, navigation: navigationFromSite(site, schema) };
}
