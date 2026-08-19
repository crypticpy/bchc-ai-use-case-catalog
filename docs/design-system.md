# Design system

The reference for every visual decision in the template: tokens, type, spacing, elevation, motion,
and the component classes that implement them. `docs/design-brief.md` is the *why* (the "Quiet
Instrument" direction and its rubric); this file is the *what*, kept in step with
`assets/css/components/*.css`. A live rendering of everything below is at `/styleguide/` on any
deployment (`styleguide/index.md`; `noindex`, not in the navigation).

Every class in this document is a Tailwind `@apply` composition in `assets/css/components/`. Templates
use these class names, not raw utility soup, so a change to a component is one edit.

**Never `@apply` two classes that set the same property — write the winner as a literal
declaration.** `@apply` inlines each class at *its* position in the generated stylesheet, not at the
position you wrote it, so the loser is decided by Tailwind's sort order and not by your source. This
cost the template its entire prose theme once: `@apply prose prose-slate` sorted slate last, so every
`--tw-prose-*` brand variable was overwritten and every authored page rendered in stock grey with
links at 1.70:1 and no underline — a clean build, a correct-looking config, and an off-brand WCAG
failure. `test/styles/prose.test.mjs` now guards that particular case; the rule guards the rest.

## Tokens

Tokens come from `_data/theme.yml`, are emitted as CSS variables by `_includes/theme.html`, and are
mapped to Tailwind colour names in `tailwind.config.js` (`brand-*`, `surface-*`). Components never
contain a hex value.

### Colour

| Token (`theme.yml`) | Tailwind | Default | Use |
|---|---|---|---|
| `primary` | `brand-primary` | `#1D4E89` | **Interactive only** — links, primary buttons, active facet pills, focus ring, TOC current. Never a decorative fill. |
| `primary_dark` | `brand-primary-dark` | `#12305A` | Headings; hero, footer and lightbox stage grounds. |
| `secondary` | `brand-secondary` | `#0F6357` | Taxonomy identity — the dot on `.chip`, secondary icons. Never tinted-on-tinted text. |
| `accent` | `brand-accent` | `#E07A2F` | "Featured" and nothing else. |
| `warn` | `brand-warn` | `#B45309` | Caution only: sensitive-data signals, validation errors. |
| `ink` | `brand-ink` | `#1B2430` | Body text; the `badge-on-dark` and `featured` badge grounds; the `shadow-e0` ring at 6 %. |
| `muted` | `brand-muted` | `#5A6573` | Secondary text at ≥ 11px semibold / ≥ 14px regular (5.9:1 on white). Do not add opacity — `muted/80` fails AA. |
| `line` | `brand-line` | `#D9E0E8` | Dividers, and the border of anything that is not a card (link rows, wizard choice cards). |
| `line_strong` | `brand-line-strong` | `#7C8A9B` | Borders of interactive controls — inputs, pills, secondary buttons (3.5:1, non-text AA). Not for text. |
| `surface` | `surface-base` | `#F5F7FA` | Page ground. |
| `card` | `surface-card` | `#FFFFFF` | Card ground. |
| `surface_tint` | `surface-tint` | `#EAF0F7` | Bands and panels — a step darker than the page, so a region reads as a region without a border. |
| `on_dark` | `brand-on-dark` | `#F7F9FC` | Text over `primary_dark`. |

Alpha modifiers (`bg-brand-primary/10`) work because the variables are RGB triples. Use them for
*fills* (`primary/5` hover wash, `primary/10` selected wash, `warn/5` error panel), never to lighten
*text*.

Rules of thumb: one interactive hue, one taxonomy hue, one caution hue. If a new element wants a
colour, it is either one of those meanings or it is `ink`/`muted` on `line` structure. Light mode only.

### Type

`fonts.heading` / `fonts.body` from `theme.yml` → `--font-heading` / `--font-body` → `font-heading`
/ `font-sans`. Bundled: Source Serif 4, Source Sans 3 and Inter, one variable latin woff2 subset
each covering weights 400–700 (44 KB + 49 KB + 57 KB; `npm run fonts` rebuilds them —
`assets/fonts/README.md`). Each variable is followed in the stack by a metric-matched
`"<family> Fallback"` face (Georgia for the serif), so the `font-display: swap` handover does not
reflow the page. Other families via `fonts.google_fonts_url`, which loads non-render-blocking and
gets no fallback face.

The default pairing is **serif headings over a sans body**: Source Serif 4 (optical size pinned
at 24, so it is cut for titles, not text) for every `font-heading` role — page and entry titles,
section titles, card titles, rail-card headings, the logo wordmark — and Inter for everything
else. The serif is what keeps a page of controls, chips and facts from reading as a spreadsheet;
the sans keeps the controls crisp. A fork that wants an all-sans site sets `fonts.heading:
"Source Sans 3"` and nothing else changes.

| Role | Size / line | Class or where |
|---|---|---|
| Display | `clamp(36px, 28px + 2vw, 48px)`/1.08, −0.01em | Home hero `h1` (`.hero-title`) |
| H1 | 32/38 | Page and entry titles |
| H2 / section | 28/34 | `.section-title` (`.section-head` stacks eyebrow → title → lead) |
| H3 | 20/26 | Rail card headings, prose `h3` |
| Card title | 18/24 | `.entry-title` (2-line clamp) |
| Body | 16/26 | `body`, `.prose-body` (measure `--measure`) |
| Small | 14/22 | `.section-lead`, `.field-help`, chips' parents |
| Micro | 12/16 | `.signal`, `.chip`, `.filter-count` |
| Eyebrow | 11/16, 0.12em tracking, semibold, uppercase | `.eyebrow`, `.entry-meta`, `.fact-label`, `.rail-title`, `.filter-legend` |

Sentence case everywhere; the eyebrow is the only uppercase style. Never track wider than 0.12em.

**Measure** — `theme.yml → type.measure` (`36rem`, ~74 characters) and `type.measure_display`
(`44rem`) become `--measure` / `--measure-display`. `.prose-body` gets the reading measure through
the typography plugin's `maxWidth`; `.measure-display` applies the wider one to headings, the impact
line and the summary, which should not wrap at 16px body width; card titles (`.entry-title`),
page and section titles carry `text-wrap: balance`. Set them in `rem`, never in `ch`:
the `ch` unit is the advance width of the digit zero (~0.66em in Inter) while an average character
in running English is ~0.48em, so Tailwind's `max-w-prose` (65ch) actually renders about 88
characters. An adopter who switches `fonts.body` to a narrower family widens these to match.

`.page-title` is fluid — `clamp(2rem, 1.72rem + 1.4vw, 2.375rem)` — so the H1 never jumps
mid-resize. `.page-title` and `.section-title` set `text-wrap: balance` and `.prose-body p` sets
`text-wrap: pretty`; both are progressive and do nothing where unsupported.

### Spacing, radius, elevation, motion

- **Spacing** — 4px base; use 4/8/12/16/24/32/48/64/96 only. Card padding 20 (mobile) / 24 (≥ sm);
  grid gutter 24; section rhythm 64/96; inside a card 8 between related lines, 16 between blocks.
- **Radius** — `theme.yml → radius: sharp | soft | round` sets `--radius-xs…2xl`. Prefer the
  semantic Tailwind names, which say what a corner is *for*: `rounded-hairline` (checkbox,
  focus target), `rounded-control` (input, toggle, small panel), `rounded-card`,
  `rounded-sheet` (sheet, dialog, hero), `rounded-pill` (badge, chip, button — never themed).
  Nested elements go one step down from their parent. The numeric names still work and still
  track the theme, but they carry a historical off-by-one — `rounded-lg` returns the *medium*
  token — so use them only where existing markup already does.

  | Semantic | Token | `soft` | `sharp` | `round` |
  |---|---|---|---|---|
  | `rounded-hairline` | `--radius-xs` | 0.25rem | 0.125rem | 0.375rem |
  | `rounded-control` | `--radius-md` | 0.75rem | 0.5rem | 1.5rem |
  | `rounded-card` | `--radius-xl` | 1.25rem | 0.75rem | 2rem |
  | `rounded-sheet` | `--radius-2xl` | 1.75rem | 1rem | 2.5rem |
- **Elevation** — E0 `shadow-e0` (a 1px `ink/10` ring drawn as a shadow, plus a 1px `ink/5`
  contact shadow and a soft `ink/10` ambient), no border: the default for all cards. E1
  `shadow-e1`: hover lift only (`.card-hover`). E2 `shadow-e2`: things that float — mobile sheet,
  search listbox, popovers. Sticky bars and rails sit on `surface_tint` instead of floating.
  Never shadow chips, inputs or badges; never E1 inside E1.
  `forced-colors.css` gives `.card`, `.entry-card`, `.panel` and `.hero-latest` a real
  `CanvasText` border, because Windows high-contrast mode drops box-shadow.

### Surfaces

Three grounds, one step apart, and only one of them has an edge:

| Ground | Class | Token | Edge |
|---|---|---|---|
| Page | `body` | `surface` | — |
| Card | `.card`, `.entry-card` | `card` | `shadow-e0` (ring + ambient) |
| Band / panel | `.band` (full-bleed section), `.panel` (rounded region) | `surface_tint` | none — the tint *is* the edge |

A band is a horizontal region of the page (the home "Browse by" section); a panel is a rounded
region inside a column (the results header, the entry fact strip, rail cards, the stale notice,
the wizard sidebar). Cards can sit *on* a band (white tiles on the tinted browse band) — a panel
never sits on a panel. Warn text on `surface_tint` is 4.4:1, so `.fact-item-warn` puts its
sensitive-data label in a white pill (`bg-surface-card` + `warn/30` ring) rather than on the tint.

The dark grounds — `.hero` and `.site-footer` — are `primary_dark` with a `primary` glow
(`radial-gradient` at one corner, `linear-gradient` across) so the two ends of the page mirror
each other; the hero also carries a 22px dot grid in `on_dark` at 14 %, masked so it only shows
toward the top right. `.hero-latest` is a `white/6` inset on that ground with a `white/15` inset
ring (no backdrop blur: nothing scrolls behind it). `.hero-search` is one pill — the input with the
Search button (`.hero-search-btn`) set inside its right edge; the primary action beside it is
`.btn-on-dark-solid` (white on the gradient) and the secondary is the ghost `.btn-on-dark`.
`.cta-panel` (the home "Share …" section) is a `panel` with a
`primary/10` ring and a 7 % `primary → secondary` wash — the one place two hues meet in a fill.
- **Motion** — a theme token like everything else: `duration-fast` (120ms) state changes,
  `duration-base` (180ms) hover/expand, `duration-slow` (240ms) sheets and page transitions;
  `ease-brand` = `cubic-bezier(0.2,0,0,1)`. All four resolve to `--motion-fast/base/slow` and
  `--ease-brand`, so a fork that wants calmer motion adds a `motion:` block to `theme.yml`
  (see the commented example there) instead of grepping twenty component rules. The old
  `duration-120/180/240` names are aliases of the same three tokens. Animate `transform`/`opacity` only; when the results
  re-render, only the cards that just entered the filtered set fade in (`.entry-card.is-entering`),
  survivors are left alone — the list settles, it does not blink. `prefers-reduced-motion` collapses every
  transition/animation to 0.01ms (`base.css`), carousel autoplay stops, sheet slides become instant.
  Focus rings never animate.
- **Page transitions** — `transitions.css` opts the whole site into cross-document view
  transitions (`@view-transition { navigation: auto }`), so catalog → entry → back crossfades
  instead of flashing white. The opt-in is nested inside `prefers-reduced-motion: no-preference`
  rather than switched off afterwards: the blanket `animation-duration: 0.01ms` above would
  otherwise still run the transition, just as a flash of its own. Snapshot animations are timed
  with `--motion-slow` / `--ease-brand`. No element is named yet, so every navigation is a root
  crossfade; naming a shared element (card thumbnail → entry lead image) is the next step and
  needs a `view-transition-name` on both sides.

### Focus

One ring everywhere: `ring-2 ring-brand-primary ring-offset-2 ring-offset-surface-card` on
`:focus-visible` (8.4:1 on white; the offset gap keeps it visible on primary-filled controls).
`.btn-on-dark` swaps to a white ring with a `primary_dark` offset. Cards ring as a whole via
`.entry-card:focus-within` because the title link's hit area covers the card.

## Components

### Buttons (`buttons.css`)

| Class | Use |
|---|---|
| `.btn-primary` | The one primary action on a view (Submit, Open issue). Filled `primary`. |
| `.btn-secondary` | Everything else that is a button: hairline `line_strong`, `primary` text. |
| `.btn-ghost` | Tertiary in-flow actions (Clear all, Show more). |
| `.btn-on-dark` | Buttons on `primary_dark` grounds (hero, footer). |
| `.btn-sm` | Modifier: 36/32px. |
| `.icon-btn` | Icon-only, 44px (36 ≥ lg). Always `aria-label`. |

Pill shape, 44px min-height under `lg` (40 above), no translate on hover — colour change only.

### Badges, chips, signals (`badges.css`)

- `.badge` + `data-tone` — categorical label. Tones: `primary` (inline card badge), `featured`
  (Featured: `ink` ground, white text, the star icon in `accent` — emphasis by weight, not by an
  orange pill), `accent`, `neutral`, `warn` (caution), `on-dark` (over a screenshot: opaque
  `ink/80` ground so contrast holds on any image), `secondary`. `.badge-md`, `.badge-lg` sizes. Write
  `{% include badge.html label="…" tone="warn" %}`; an unknown tone falls back to `neutral`.
  The tone is an attribute, not part of the class name, which is why `tailwind.config.js` needs
  no `safelist` — see "Adding a tone" below. There is no composed `.badge-<tone>` class; the
  last emitter of that spelling (the `/setup/` live preview) was migrated and the aliases deleted.
- `.chip` — one taxonomy family per card (hairline, `secondary` dot). `.chip-plain` (no dot),
  `.chip-warn` (sensitive values), `.chip-neutral` (the "+n" overflow, same hairline, no dot).
- `.signal` / `.signal-warn` / `.signal-primary` — icon + short text at 12px, monochrome; the
  strip is `.signal-strip` (hairline top). ≤ 4 items including one trailing "+n"
  (`_includes/signal-strip.html`).

Every badge/chip/signal carries visible or `sr-only` text — never colour- or icon-only.

**Adding a tone.** One rule in `badges.css` setting three custom properties:

```css
.badge[data-tone="success"] {
  --tone-bg: var(--c-secondary);
  --tone-bg-a: 0.1;
  --tone-fg: var(--c-ink);
  --tone-ring: var(--c-secondary);
  --tone-ring-a: 0.25;
}
```

Then add the name to the `bd_tones` list in `_includes/badge.html` (the guard that maps unknown
tones to `neutral`) and to `OPTION_TONES` in `assets/js/configurator/schema-validate.js` if the
schema's `option_meta` should be allowed to ask for it. `test/styles/tokens.test.mjs` reads the
list out of the include and fails if a tone is styled but not offered, or offered but purged.

### Dialogs (`dialog.css`)

Modal surfaces are real `<dialog>` elements opened with `showModal()`. The platform supplies the
top layer, the focus trap, Escape, `inert` on everything behind, and focus restoration on close —
do not reimplement any of it. `dialog.css` only clears the UA's alert-box defaults (1em padding, a
border, the `dialog:modal` max-width that crops a full-bleed sheet) and paints `::backdrop`.

Two things to know before adding one:

- **A display utility on a `<dialog>` makes the closed dialog visible.** Author styles beat UA
  styles at any specificity, so `@apply flex` defeats `dialog:not([open]) { display: none }`.
  `dialog.css` restates that rule as an author rule at 0,1,1; anything that needs to outrank it
  must do so deliberately.
- **Scroll lock is the `is-dialog-open` class on `<html>`**, set by the dialog's own module and
  cleared on the `close` event (so Escape and a form submission release it too). `<html>` rather
  than `<body>` because iOS Safari keeps scrolling the viewport when only `<body>` is locked.

The mobile filter sheet (`.filter-sheet`, styled in `catalog.css`, wired by
`assets/js/filter-sheet.js`) is the only one today.

### Catalog surfaces (`catalog.css`)

- `.entry-grid` (`data-view="grid|list"`) → `.entry-card` (E0, `card-hover`), `.entry-media` (16:9
  band + top scrim), `.entry-badges`, `.entry-body`, `.entry-meta` (eyebrow; segments are
  `.entry-meta-seg`, the lead one flexes and truncates, later ones get a `·` via `::before`),
  `.entry-title`, `.entry-line` (impact), `.entry-summary` (2-line clamp; 4 on `.entry-card--text`),
  `.entry-chips`, `.entry-foot`.
- `.entry-row` — compact variant for related lists; its title link is `.entry-row-title`.
- Filter rail: `.filter-rail`, `.filter-group`, `.filter-group-toggle` (its chevron is
  `.filter-chevron`, its collapsible body `.filter-group-panel`), `.filter-legend`,
  `.filter-pill` (`aria-pressed`, `.is-empty` for zero-count) inside a `.filter-options` wrapper,
  `.filter-showall`.
- Results header: `.results-header` (sticky, E2), `.results-count` (with `.results-total` as the
  "of N" suffix), `.results-select`, `.active-pill`, `.view-toggle`. Search: `.search-box`,
  `.search-listbox` (E2), `.search-option`.
- Mobile: `.filter-bar` (fixed bottom), `.filter-sheet` (`role=dialog`, focus trap, siblings
  `inert`) structured as `.filter-sheet-head` / `-body` / `-foot`.

### Entry page (`entry.css`)

`.fact-strip` / `.fact` / `.fact-label` / `.fact-value` / `.fact-item(-warn)`; `.rail-card`,
`.rail-title`, `.rail-list`, `.rail-term`, `.rail-def`, `.rail-link`, `.rail-person`; `.toc-link`
(`aria-current`); `.gallery-lead`, `.gallery-thumb`; `.lightbox*` (native `<dialog>`). The sidebar wraps in
`.entry-rail`; `.entry-no-print` hides an element in print. Print styles
drop interactive chrome and flow the rail after the prose.

### Forms (`forms.css`)

`.field` → `.field-label` (+ `.field-required` spelled out), `.field-help` **above** the control,
`.field-input` (`line_strong` border, `aria-invalid` → warn), `.field-error` below, `.field-option`
(card-style radio/checkbox with `has-[:checked]`, secondary text `.field-option-desc`) laid out in a
`.field-options` / `.field-options-wide` grid, `.checkbox`, `.radio`, `.field-note`. Submit page:
`.form-section`, `.progress-rail`/`.progress-link`/`.progress-dot` (`.progress-count` for the
answered/total text), `.error-summary*`, `.links-row`, `.image-previews` (each thumbnail is an
`.image-preview`), `.preview-panel` (its collapsible label below `lg` is `.preview-summary`),
`.draft-bar`/`.draft-status`.

### Page furniture (`site.css`)

`.card`, `.card-hover`, `.card-header`, `.card-title`, `.eyebrow` (muted variant `.eyebrow-muted`,
on-dark variant `.eyebrow-on-dark`), `.page-title` (the one H1 size everywhere; `.page-title-on-dark`
for dark grounds), `.section-title`, `.section-lead`, `.link-row`, `.prose-body`,
`.sr-only-focusable`.

Home: `.hero` (dark gradient ground + masked dot grid — see "Surfaces"), `.hero-title`,
`.hero-stat` (stat-line segment; its `·` separator is a `::before`, never text),
`.hero-latest` / `-item` / `-link` / `-title` / `-meta` — the inset "Latest additions" panel in
the hero's right column at ≥1024 px (`home.hero_latest_count`), `.band` for the "Browse by"
section, `.value-props` / `.value-prop-title` / `.value-prop-body` (the three value propositions
as text over a hairline, not cards), `.cta-panel` for the "Contribute" section, and
`.site-footer` (the hero's gradient mirrored).

### Setup wizard (`setup.css`)

`.theme-preview` (root; the wizard re-declares `--c-*`, `--font-*` and `--radius-*` inline on it
so the miniature is themed like the built site), `.theme-preview-header`, `-mark`, `-hero`,
`-body` (two columns from `sm`), `-controls`. Everything inside the preview is a production
component class (`.entry-card`, `.btn-*`, `.badge-*`, `.filter-pill`, `.signal-*`) — never a copy.
`.wizard-actions` is the wizard's footer action bar (`.is-sticky` pins it on long steps). The
field builder's collapsible rows are `.schema-field-row` → `-head` / `-toggle` / `-name` / `-caret`
(`.is-open` rotates it) and the expanded `-details`.

## Accessibility baseline

WCAG 2.2 AA is the floor and `quality.yml` checks it (axe + HTML_CodeSniffer, Lighthouse
accessibility ≥ 0.95). The recurring rules:

- Text ≥ 4.5:1, non-text UI ≥ 3:1 — checked against `theme.yml` defaults; a deployment that changes
  colours re-runs `npm run a11y`.
- 44px targets under `lg` for anything tappable; 32–36px is fine on desktop.
- Visible focus for every control; keyboard path for the sheet, lightbox, search combobox and
  carousel; Esc closes and returns focus.
- Icon-only controls have `aria-label`; external links carry an sr-only "(opens in a new tab)".
- One `role="status"` per surface, debounced.
- Decorative separators are CSS `::before`, so they are neither read nor contrast-checked.

### Forced colours

Windows High Contrast Mode (`forced-colors: active`) replaces `color`, `background-color`,
`border-color`, `outline-color`, `fill` and `stroke` with the OS palette and **drops `box-shadow`
and CSS gradients entirely**. This system encodes selection as a brand fill (`.filter-pill` active,
`.view-toggle[aria-pressed]`), progress as a gradient (`.progress-dot` half-fill) and focus as a
`ring-*` box-shadow — all three vanish, and a pressed pill computes identically to an unpressed one.

The rule: **a selected, current or complete state must survive as a shape or as a system colour,
never as a brand fill.** The corrections live in `assets/css/components/forced-colors.css`, imported
last from `tailwind.css` so it outranks the layers it fixes. `forced-color-adjust: none` is only
used on a pair that is then repainted in `Highlight`/`HighlightText` — never to smuggle brand colour
back in. Add a rule there whenever a new state is expressed as a fill, a tint or a gradient.

Verify with Chrome over CDP — Puppeteer's `emulateMediaFeatures()` rejects the feature name:

```js
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'forced-colors', value: 'active' }],
});
```

Then compare the computed `background-color` / `color` / `border-color` of a pressed control against
an unpressed one: they must differ.

## Browser support

The CSS is built with **Tailwind 3.4, on purpose**. Tailwind 4 needs Safari 16.4, Chrome 111 or
Firefox 128 (all March 2023 or later) and degrades without colour or spacing on anything older; a
public-sector catalog is read from managed desktops and hand-me-down phones that lag those floors
by years. Version 3 output works back to Safari 15 / Chrome 88-era browsers (`aspect-ratio` on media
frames is the oldest hard requirement), and the newest feature the components use —
`grid-template-rows: subgrid` on the fact strip — falls back to a plain stack. Revisit when Tailwind 3 stops receiving fixes or the audience's browser mix has moved on;
`.github/dependabot.yml` ignores the major bump until then so the weekly PR is not a standing
temptation.

That floor is also why several newer platform features are used only where they can be *ignored*
rather than polyfilled. Each one degrades to exactly today's behaviour on a browser that does not
have it:

| Feature | Where | Without it |
|---|---|---|
| `<dialog>` + `showModal()` | mobile filter sheet | falls back to the non-modal `open` attribute — the sheet works, the focus trap does not |
| Cross-document view transitions | every navigation | the navigation is not animated |
| Speculation rules | catalog → entry | the entry page loads on click, as now |
| Web Share | entry rail | the Share button never appears; Copy link is unchanged |
| Container queries | cards | behind `@supports`; the breakpoint layout is the fallback |
| `size-adjust` / `*-override` | font fallbacks | the swap-in reflows slightly, as it did before |

## Changing the system

1. Token change → `theme.yml` (per deployment) or the defaults in `_includes/theme.html`
   (template). Re-check contrast.
2. New component → add to the matching `components/*.css` file with a one-line comment on when
   to use it, add it to `/styleguide/`, and add a row here.
3. Never write a colour, radius, shadow or duration inline in a template; if it is not a token or a
   component, it is not part of the system yet.
