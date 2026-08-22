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
// Budgets are measured, not aspirational. The 2026-08-22 exact-toolchain parent
// baseline scored 97–99 mobile and 100 desktop over the same gzip/no-HTTP/2
// harness. The margin below catches regressions without making shared-runner
// noise a release event.
const { qualityUrls } = require('./urls.js');

const { home, catalog, submit, entries } = qualityUrls(
  process.env.QUALITY_BASE_URL || 'http://127.0.0.1:4173'
);

const MOBILE = process.env.QUALITY_LANE === 'mobile';
const LOCAL_OUTPUT = process.env.LHCI_LOCAL_OUTPUT;

// Lighthouse's default settings *are* the mobile lane (Moto G Power, simulated
// slow 4G, 4x CPU); only desktop needs a preset.
const settings = {
  chromeFlags: '--no-sandbox --disable-dev-shm-usage',
  ...(MOBILE ? {} : { preset: 'desktop' }),
};

// Every release assertion blocks. Multiple runs absorb shared-runner noise;
// turning a failed budget into a warning made the quality job green while its
// own report described a known regression.
const assertions = {
  'categories:performance': ['error', { minScore: MOBILE ? 0.9 : 0.95 }],
  'categories:accessibility': ['error', { minScore: 0.95 }],
  'categories:best-practices': ['error', { minScore: 0.95 }],
  'categories:seo': ['error', { minScore: 0.95 }],
  // Layout shift is deterministic and the one metric a careless change (an
  // unsized image, a late-loading font) moves immediately. Measured: 0.02.
  'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
  // Exact parent worst case: 1.28s / 2.64s mobile, 0.33s / 0.55s desktop.
  'first-contentful-paint': ['error', { maxNumericValue: MOBILE ? 2500 : 700 }],
  'largest-contentful-paint': ['error', { maxNumericValue: MOBILE ? 4000 : 900 }],
  // This site ships ~10 KB of hand-written JS and no framework; blocking time
  // has been 0 in every run. A budget here is an alarm on a new dependency.
  'total-blocking-time': ['error', { maxNumericValue: 200 }],
};

module.exports = {
  ci: {
    collect: {
      url: [home, catalog, ...entries.slice(0, 1), submit],
      // Three runs on the mobile lane: simulated throttling makes a single run
      // swing by several points, and Lighthouse CI asserts on the median.
      numberOfRuns: MOBILE ? 3 : 2,
      settings,
    },
    assert: { assertions },
    // CI publishes short-lived links for reviewers. Local audits can remain
    // entirely on the workstation by setting LHCI_LOCAL_OUTPUT to a directory.
    upload: LOCAL_OUTPUT
      ? { target: 'filesystem', outputDir: LOCAL_OUTPUT }
      : { target: 'temporary-public-storage' },
  },
};
