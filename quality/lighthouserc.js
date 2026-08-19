// Lighthouse CI config for `npm run lighthouse` / quality.yml. The entry page
// is discovered from the built site (./urls.js).
//
// Two lanes, selected by QUALITY_LANE:
//
//   npm run lighthouse                     desktop (the default)
//   QUALITY_LANE=mobile npm run lighthouse mobile, on Lighthouse's throttled 4G
//
// Desktop alone was measuring a machine nobody uses this site on: the catalog
// is the page a caseworker opens on a phone between visits, and the desktop
// preset's unthrottled CPU and network hides every cost that matters there —
// the same page scores 0.98 desktop and 0.74 mobile. Lighthouse cannot vary the
// form factor within one run, so the workflow invokes this file twice.
//
// Budgets are measured, not aspirational: each threshold sits roughly 10% below
// (or above, for timings) what this site scores today over the same harness the
// workflow uses — a python http.server with no compression and no HTTP/2, which
// is slower than Pages. They are a regression alarm, not a target.
const { qualityUrls } = require('./urls.js');

const { home, catalog, submit, entries } = qualityUrls(
  process.env.QUALITY_BASE_URL || 'http://127.0.0.1:4173'
);

const MOBILE = process.env.QUALITY_LANE === 'mobile';

// Lighthouse's default settings *are* the mobile lane (Moto G Power, simulated
// slow 4G, 4x CPU); only desktop needs a preset.
const settings = {
  chromeFlags: '--no-sandbox --disable-dev-shm-usage',
  ...(MOBILE ? {} : { preset: 'desktop' }),
};

// Accessibility is the one category that is an error in both lanes: it is
// deterministic, and a fork that ships an inaccessible catalog has shipped a
// broken one. The performance score is a composite of noisy timings on a shared
// runner, so it warns; the individual metrics carry the specific budgets.
const assertions = {
  'categories:performance': ['warn', { minScore: MOBILE ? 0.65 : 0.9 }],
  'categories:accessibility': ['error', { minScore: 0.95 }],
  'categories:best-practices': ['warn', { minScore: 0.9 }],
  'categories:seo': ['warn', { minScore: 0.9 }],
  // Layout shift is deterministic and the one metric a careless change (an
  // unsized image, a late-loading font) moves immediately. Measured: 0.02.
  'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
  // Measured worst case: 3.5s / 5.2s mobile, 0.7s / 1.0s desktop.
  'first-contentful-paint': ['warn', { maxNumericValue: MOBILE ? 3800 : 900 }],
  'largest-contentful-paint': ['warn', { maxNumericValue: MOBILE ? 5700 : 1200 }],
  // This site ships ~10 KB of hand-written JS and no framework; blocking time
  // has been 0 in every run. A budget here is an alarm on a new dependency.
  'total-blocking-time': ['warn', { maxNumericValue: 200 }],
};

module.exports = {
  ci: {
    collect: {
      url: [home, catalog, ...entries.slice(0, 1), submit],
      // Three runs on the mobile lane: simulated throttling makes a single run
      // swing by several points, and Lighthouse CI asserts on the median.
      numberOfRuns: MOBILE ? 3 : 1,
      settings,
    },
    assert: { assertions },
    upload: { target: 'temporary-public-storage' },
  },
};
