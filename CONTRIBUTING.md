# Contributing

Thanks for helping. This file is for people changing the **template itself** — templates, styles,
scripts, workflows, docs. If you want to add or edit a *catalog entry*, you don't need any of this:
use the site's **Submit** page, or follow `docs/admin-guide.md` if you maintain a deployment. If you
have just created a repository from the template and want it launched, that is
`docs/launch.md`. [`docs/index.md`](docs/index.md) routes to the rest.

## Local setup

Runtime and package-manager versions are exact, not ranges. They live in `.ruby-version`,
`.node-version`, `.bundler-version`, `Gemfile.lock`, and `package.json`; `mise.toml` is the combined
installer definition. Chrome/Chromium is needed only for the browser quality lanes.

```sh
mise trust mise.toml # after inspecting the pinned runtime definitions
mise install          # optional; equivalent version managers are fine
gem install bundler -v "$(cat .bundler-version)"
bundle install
npm ci
npm run doctor        # fix every FAIL before relying on a local result
npm run serve          # builds CSS, then `jekyll serve --livereload` on http://127.0.0.1:4000
```

Mise requires this per-clone trust step before it will read the repository configuration. If your
organization does not allow trusted project configuration, use other version managers with
`.ruby-version`, `.node-version`, and `.nvmrc` instead.

`npm run watch:css` in a second terminal rebuilds Tailwind as you edit `assets/css/components/*.css`.

## The gates (what CI runs)

Run these before opening a pull request; `validate.yml` and `quality.yml` run the same commands.
`npm run verify` is the single non-browser gate and stops at the first failing section.

| Command | Checks |
|---|---|
| `npm run doctor` | Exact Node/npm/Ruby/Bundler versions, installed dependencies, generated parity, the ownership contract, downstream merge-driver setup, and browser availability. |
| `npm run verify` | All non-browser rows below, every preset/module build, image parity, Jekyll doctor, and the production build. |
| `node scripts/generate.mjs --check` | The issue template, `_config.yml` title/description and `defaults.generated.js` match `_data/schema.yml` / `_data/site.yml`. If it fails: `npm run generate` and commit. |
| `npm run lint` | ESLint over the JS in `assets/js/`, `scripts/` and `test/`. |
| `npm run format:check` | Prettier, checked but not applied — run `npm run format` locally to fix. Scope is JavaScript only: `.prettierignore` leaves Markdown, YAML, HTML/Liquid, generated files and the component CSS (one selector per line, see `docs/design-system.md`) alone. |
| `npm test` | Node unit tests (`test/**/*.test.mjs`) — configurator, issue parsing, images, YAML, submit form (jsdom). |
| `npm run coverage` | Uses the pinned runtimes' built-in coverage over the complete Node and Ruby suites, plus focused security-parser and parent-updater Node suites. It enforces reviewed regression floors and writes raw TAP plus JSON under `coverage/`; percentages are evidence, not a substitute for behavioral, fuzz, browser, accessibility, or human review. |
| `npm run test:ruby` | Minitest for the Ruby plugins and validators (`test/plugins/**/*_test.rb`, `test/scripts/**/*_test.rb`). |
| `npm run validate` | Every `_data/*.yml` parses; every entry's front matter passes `scripts/check_front_matter.rb`; no oversize files. |
| `npm run build:css && bundle exec jekyll build` | The site builds without Liquid errors. |
| `npm run a11y` | pa11y-ci (axe + HTML_CodeSniffer, WCAG 2 AA) over the pages in `quality/pa11yci.js` (sample entry URLs are discovered from the built site). Needs the built site served on port 4173: `node scripts/serve_built_site.mjs --directory _site &`. |
| `npm run test:flows` | The assistive-technology flow tests (`test/a11y/flows.test.mjs`): keyboard-only walkthroughs — home → catalog → filter → entry → Back, search → result, the submission form's errors, the setup wizard's first step change — asserting focus order, a visible focus ring, live-region announcements and no dead ends. Needs the same served build as `npm run a11y`, plus puppeteer (`npm install --no-save puppeteer@$(node -p "require('./quality/package.json').devDependencies.puppeteer")`). Point it elsewhere with `FLOW_BASE_URL`. |
| `npm run lighthouse` | Lighthouse CI (`quality/lighthouserc.js`) against the same local server; every performance, accessibility, best-practice, SEO, layout-shift, and timing budget blocks release. Set `LHCI_LOCAL_OUTPUT=/tmp/phct-lighthouse` to keep local reports off temporary public storage. |

The coverage regression floors are line / branch / function percentages: complete loaded Node
production code 82 / 72 / 75; focused security parsers 88 / 78 / 90; parent updater and release-lock
logic 70 / 75 / 85. Loaded Ruby production code is held to 90 / 82 / 75 for lines / branches /
methods. A new Ruby source that is neither represented in-process nor explicitly inventoried as a
subprocess-only CLI fails the gate. Change a floor only with an explained, reviewed tradeoff.

## Ground rules

1. **The schema is the source of truth.** Never write a field key into a layout, include, script or
   workflow — read `site.data.schema.fields` and act on its hints (`facet`, `card`, `search`,
   `group`, `placement`, `option_meta`…). If a feature needs to know something about a field, add a
   hint to the schema and document it in `docs/content-model.md`. After editing `_data/schema.yml`
   run `npm run generate` and commit the regenerated files with your change.
2. **Configuration over code.** Anything a deployment might want different belongs in `_data/*.yml`
   with a documented key, not in a template.
3. **Prefix Liquid assigns inside includes** (`ec_`, `fv_`, `gal_`…). Jekyll includes share the
   caller's scope, so an unprefixed `v` or `entries` silently clobbers the page's. Use `x.first` to
   detect arrays; assign before passing anything with bracket access to an include. Details in
   `CLAUDE.md`.
4. **Escape at the edge.** Anything from front matter or issue bodies that lands in an attribute or
   URL goes through `| escape` (Liquid) or the helpers in `scripts/lib/`. Scripts treat issue text as
   untrusted; see `SECURITY.md`.
5. **Small, readable JavaScript.** One IIFE per concern, no build step, no dependencies beyond the
   vendored Lunr. Every script starts with a header comment stating what DOM it expects and what
   events/globals it exposes.
6. **Design system, not one-offs.** New UI uses the tokens and component classes in
   `docs/design-system.md` (and the `/styleguide/` page). New colours, radii or shadows are a
   design-system change first.
7. **Accessibility is part of "done".** Keyboard path, focus visibility, 4.5:1 text contrast,
   `prefers-reduced-motion`, and names for icon-only controls. The a11y gate must stay green.
8. **Document what you add.** New config keys → `docs/configuration.md`; new schema hints →
   `docs/content-model.md`; new workflows/scripts → `ARCHITECTURE.md` and `docs/admin-guide.md`;
   a new document → a row in `docs/index.md`. A choice a future contributor would otherwise argue
   with → `docs/decisions.md`. User-facing changes get a line in `CHANGELOG.md`.

## Adding a schema hint or field type (walkthrough)

Most feature work touches the same chain. Suppose you add a new presentation hint:

1. `_data/schema.yml` — use it on at least one field; describe it in the header comment.
2. `assets/js/configurator/schema-validate.js` — accept it (warn, don't error, on unknown values).
3. `_plugins/schema_filters.rb` — a filter if templates need to query it.
4. The consumer (`_includes/entry-card.html`, `_layouts/entry.html`, `submit/index.md`,
   `scripts/new_entry_from_issue.mjs`, `scripts/check_front_matter.rb` …) — read the hint, never the key.
5. Presets in `assets/js/configurator/presets/` if the hint should ship with a preset.
6. `docs/content-model.md` — one row in the hints table.
7. `npm run generate`, then all the gates above.

## Pull requests

- Conventional titles: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`; one concern per PR.
- Say what you verified (which gates, which pages you looked at, at which widths). Screenshots for UI.
- Keep generated files (`.github/ISSUE_TEMPLATE/new-entry.yml`, `assets/js/configurator/defaults.generated.js`)
  in the same commit as the schema change that produced them.
- Don't hand-edit generated files — CI's `generate.mjs --check` will fail.

## Code of conduct

[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) applies to this repository and to every deployment's
review threads; it is short. Concerns go to the maintainers' address in the site footer.

## Reporting problems

Open an issue with the page URL (or file), what you expected, what happened, and browser/width if it
is a UI problem. Security concerns: see `SECURITY.md`.
