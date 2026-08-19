---
layout: default
title: "Style guide"
summary: "Live rendering of the design system — tokens, type, components — from this deployment's theme."
permalink: /styleguide/
robots: noindex
sitemap: false
---
{%- comment -%}
Living style guide. Everything here is rendered with the same includes and component classes the
site uses, against the deployment's own _data/theme.yml, so it doubles as a theme preview.
Reference: docs/design-system.md. Local assigns are prefixed `sg_`.
{%- endcomment -%}
{%- assign sg_theme = site.data.theme -%}
{%- assign sg_entries = site.pages | where: 'layout', 'entry' | sort: 'published', 'first' | reverse -%}
{%- assign sg_entry = sg_entries | first -%}
{%- assign sg_fields = site.data.schema.fields -%}
{%- assign sg_swatches = "primary:Interactive — links, buttons, focus, active filters|primary_dark:Headings, hero and footer ground|secondary:Taxonomy dot / secondary icons|accent:Featured only|warn:Caution — sensitive data, validation|ink:Body text|muted:Secondary text|line:Dividers|line_strong:Interactive control borders|surface:Page ground|surface_tint:Bands and panels|card:Card ground|on_dark:Text on primary_dark" | split: "|" -%}

<div class="mx-auto max-w-5xl">
  <span class="eyebrow">Design system</span>
  <h1 class="page-title mt-2">Style guide</h1>
  <p class="mt-4 max-w-prose text-lg leading-relaxed text-brand-muted">{{ page.summary }} Reference: <code>docs/design-system.md</code>. Colours and fonts below are read from <code>_data/theme.yml</code>, so this page is also a preview of your theme.</p>

  <nav aria-label="Sections" class="mt-8 flex flex-wrap gap-2 text-sm">
    {%- assign sg_nav = "colour:Colour|type:Type|buttons:Buttons|badges:Badges, chips, signals|card:Entry card|row:Entry row|filters:Filters and results|entry:Entry page pieces|forms:Forms|elevation:Elevation and motion" | split: "|" -%}
    {%- comment -%} The card, row and entry sections below need an entry to render; on an empty catalog their pills would point at anchors that do not exist. {%- endcomment -%}
    {%- assign sg_needs_entry = "card|row|entry" | split: "|" -%}
    {%- for sg_n in sg_nav -%}{%- assign sg_np = sg_n | split: ":" -%}{%- unless sg_entry -%}{%- if sg_needs_entry contains sg_np[0] -%}{%- continue -%}{%- endif -%}{%- endunless -%}<a class="filter-pill" href="#sg-{{ sg_np[0] }}">{{ sg_np[1] }}</a>{%- endfor -%}
  </nav>

  <section id="sg-colour" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Colour</h2>
    <p class="section-lead mt-2">One interactive hue, one taxonomy hue, one caution hue. Everything else is ink on line-structured white.</p>
    <ul role="list" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {%- for sg_sw in sg_swatches -%}
        {%- assign sg_p = sg_sw | split: ":" -%}
        {%- assign sg_key = sg_p[0] -%}
        {%- assign sg_hex = sg_theme.colors[sg_key] -%}
        {%- assign sg_var = sg_key | replace: '_', '-' -%}
        <li class="card overflow-hidden">
          <div class="h-16 border-b border-brand-line" style="background: rgb(var(--c-{{ sg_var }}))"></div>
          <div class="p-4">
            <p class="flex items-baseline justify-between gap-3 text-sm font-semibold text-brand-ink"><code>{{ sg_key }}</code><span class="font-mono text-xs font-normal text-brand-muted">{{ sg_hex }}</span></p>
            <p class="mt-1 text-xs text-brand-muted">{{ sg_p[1] }}</p>
          </div>
        </li>
      {%- endfor -%}
    </ul>
  </section>

  <section id="sg-type" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Type</h2>
    <p class="section-lead mt-2">Headings: <strong>{{ sg_theme.fonts.heading }}</strong> · Body: <strong>{{ sg_theme.fonts.body }}</strong>. Sentence case everywhere; the eyebrow is the only uppercase style.</p>
    <div class="card mt-6 divide-y divide-brand-line">
      <div class="p-6"><p class="eyebrow">Display clamp(36–48)/1.08 · .hero-title</p><p class="hero-title mt-2 text-brand-primary-dark">Every pixel reduces a decision</p></div>
      <div class="p-6"><p class="eyebrow">H1 32/38 · .page-title</p><p class="page-title mt-2">Syndromic surveillance signal triage assistant</p></div>
      <div class="p-6"><p class="eyebrow">H2 28/34 · .section-title</p><p class="section-title mt-2">What we built</p></div>
      <div class="p-6"><p class="eyebrow">Card title 18/24 · .entry-title</p><p class="entry-title mt-2">Plain-language rewrites for public notices</p></div>
      <div class="p-6"><p class="eyebrow">Body 16/26 · measure --measure</p><p class="mt-2 text-base leading-relaxed text-brand-ink" style="max-width: var(--measure)">A scheduled job pulls the alert export each night. For every signal it assembles fourteen days of visit history, the expected count from a simple seasonal baseline, and the relevant syndrome definition.</p></div>
      <div class="p-6"><p class="eyebrow">Small 14/22 · .section-lead</p><p class="section-lead mt-2">Secondary text stays at 14px or larger in <code>muted</code>.</p></div>
      <div class="p-6"><p class="eyebrow">Eyebrow 11/16 · 0.12em</p><p class="entry-meta mt-2"><span class="entry-meta-seg entry-meta-seg--text">Lakeshore City Department of Public Health</span><span class="entry-meta-seg">Pilot</span></p></div>
    </div>
  </section>

  <section id="sg-buttons" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Buttons</h2>
    <p class="section-lead mt-2">One primary action per view. Pills, 44px targets under <code>lg</code>, colour change on hover, one focus ring.</p>
    <div class="card mt-6 flex flex-wrap items-center gap-3 p-6">
      <button type="button" class="btn-primary">{% include icon.html name="plus" size="sm" %}Primary</button>
      <button type="button" class="btn-secondary">Secondary</button>
      <button type="button" class="btn-ghost">Ghost</button>
      <button type="button" class="btn-secondary btn-sm">Small</button>
      <button type="button" class="icon-btn" aria-label="Copy link">{% include icon.html name="copy" size="sm" %}</button>
      <span class="inline-flex rounded-xl bg-brand-primary-dark p-3"><button type="button" class="btn-on-dark">On dark</button></span>
    </div>
  </section>

  <section id="sg-badges" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Badges, chips, signals</h2>
    <p class="section-lead mt-2">Badges are categorical labels; a card shows one chip family; signals are monochrome glyph + short text. Never colour- or icon-only.</p>
    <div class="card mt-6 divide-y divide-brand-line">
      <div class="flex flex-wrap items-center gap-2 p-6">
        {% include badge.html label="Primary" tone="primary" %}
        {% include badge.html label="Accent" tone="accent" %}
        {% include badge.html label="Featured" tone="featured" icon="star" %}
        {% include badge.html label="Neutral" tone="neutral" %}
        {% include badge.html label="Warn" tone="warn" icon="warning" %}
        <span class="inline-flex rounded-lg bg-brand-primary-dark/80 p-2">{% include badge.html label="On dark" tone="on-dark" icon="code" %}</span>
        {% include badge.html label="Large" tone="primary" size="lg" %}
      </div>
      <div class="flex flex-wrap items-center gap-2 p-6">
        <span class="chip">Epi &amp; surveillance</span><span class="chip">Data</span><span class="chip-neutral">+2</span>
        <span class="chip-plain">Plain</span><span class="chip-warn">PII</span>
      </div>
      <div class="p-6">
        <div class="signal-strip !border-t-0 !pt-0">
          <span class="signal">{% include icon.html name="academic-cap" size="xs" %}Analyst</span>
          <span class="signal-warn">{% include icon.html name="shield" size="xs" %}PII</span>
          <span class="signal">{% include icon.html name="lock" size="xs" %}Internal</span>
          <span class="signal-primary">{% include icon.html name="rocket" size="xs" %}Ready</span>
          <span class="signal">+2</span>
        </div>
      </div>
    </div>
  </section>

  {%- if sg_entry -%}
  <section id="sg-card" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Entry card</h2>
    <p class="section-lead mt-2"><code>_includes/entry-card.html</code> rendered for the newest entry: media band · badge · meta · title (the only link) · impact line · summary · one chip family · signal strip.</p>
    <ul role="list" class="entry-grid mt-6 max-w-[720px]" data-view="grid">
      {% include entry-card.html entry=sg_entry %}
      {%- assign sg_second = sg_entries[1] -%}{%- if sg_second %}{% include entry-card.html entry=sg_second %}{% endif -%}
    </ul>
  </section>

  <section id="sg-row" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Entry row</h2>
    <p class="section-lead mt-2"><code>_includes/entry-row.html</code> — the compact variant used for related entries and dense lists.</p>
    <ul role="list" class="card mt-6 divide-y divide-brand-line px-5 [&>li]:border-b-0">
      {%- for sg_e in sg_entries limit: 3 %}{% include entry-row.html entry=sg_e %}{% endfor -%}
    </ul>
  </section>
  {%- endif -%}

  <section id="sg-filters" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Filters and results</h2>
    <p class="section-lead mt-2">Facet pills (<code>aria-pressed</code>), zero-count pills dim but stay, active-filter pills in the results header, view toggle.</p>
    <div class="card mt-6 divide-y divide-brand-line">
      <div class="p-6">
        <p class="filter-legend">Stage <span class="font-normal normal-case tracking-normal">(any of)</span></p>
        <div class="filter-options">
          <button type="button" class="filter-pill" aria-pressed="true"><span>Pilot</span><span class="filter-count">3</span></button>
          <button type="button" class="filter-pill" aria-pressed="false"><span>In production</span><span class="filter-count">6</span></button>
          <button type="button" class="filter-pill" aria-pressed="false"><span>Exploring</span><span class="filter-count">1</span></button>
          <button type="button" class="filter-pill is-empty" aria-pressed="false" aria-disabled="true"><span>Retired</span><span class="filter-count">0</span></button>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3 p-6">
        <span class="results-count">3 use cases <span class="results-total">of 10</span></span>
        <button type="button" class="active-pill">Pilot {% include icon.html name="close" size="xs" %}<span class="sr-only">Remove filter: Pilot</span></button>
        <button type="button" class="btn-ghost btn-sm">Clear all</button>
        <select class="results-select" aria-label="Sort"><option>Newest</option><option>A–Z</option></select>
        <span class="inline-flex gap-1"><button type="button" class="view-toggle" aria-pressed="true" aria-label="Grid view">{% include icon.html name="grid" size="sm" %}</button><button type="button" class="view-toggle" aria-pressed="false" aria-label="List view">{% include icon.html name="list" size="sm" %}</button></span>
      </div>
      <div class="p-6"><div class="relative max-w-md"><span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-brand-muted">{% include icon.html name="search" size="sm" %}</span><input class="search-box" type="text" placeholder="Search…" aria-label="Search (demo)"></div></div>
    </div>
  </section>

  {%- if sg_entry -%}
  <section id="sg-entry" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Entry page pieces</h2>
    <p class="section-lead mt-2">Fact strip and rail card for the same entry. Facts with no value disappear; the strip vanishes when nothing is left.</p>
    <div class="mt-6">{% include fact-strip.html fields=sg_fields entry=sg_entry shown="" %}</div>
    <div class="mt-6 grid gap-6 sm:grid-cols-2">
      <div class="rail-card">
        <p class="rail-title">On this page</p>
        <nav class="mt-3" aria-label="Demo table of contents"><a class="toc-link" href="#sg-entry" aria-current="true">Problem</a><a class="toc-link" href="#sg-entry">What we built</a><a class="toc-link" href="#sg-entry">Results</a></nav>
      </div>
      <div class="rail-card">
        <p class="rail-title">Contact</p>
        <div class="rail-person mt-3"><p class="text-sm font-semibold text-brand-ink">A. Person</p><a class="rail-link" href="#sg-entry">{% include icon.html name="mail" size="sm" class="mt-0.5" %}<span>person@example.org</span></a></div>
      </div>
    </div>
  </section>
  {%- endif -%}

  <section id="sg-forms" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Forms</h2>
    <p class="section-lead mt-2">Help text above the control, errors below, "Required" spelled out, option cards for choices.</p>
    <div class="card mt-6 grid gap-6 p-6 sm:grid-cols-2">
      <div class="field">
        <label class="field-label" for="sg-title">Title <span class="field-required">Required</span></label>
        <p class="field-help" id="sg-title-help">A short, specific name — what someone would call it in a meeting.</p>
        <input id="sg-title" class="field-input" type="text" aria-describedby="sg-title-help" placeholder="Syndromic signal triage assistant">
      </div>
      <div class="field">
        <label class="field-label" for="sg-url">Source URL</label>
        <p class="field-help" id="sg-url-help">Must start with https://</p>
        <input id="sg-url" class="field-input" type="url" aria-invalid="true" aria-describedby="sg-url-help sg-url-err" value="github.com/example">
        <p class="field-error" id="sg-url-err">{% include icon.html name="warning" size="sm" class="mt-0.5" %}Enter a full URL, starting with https://</p>
      </div>
      <fieldset class="field sm:col-span-2">
        <legend class="field-label">Stage</legend>
        <div class="field-options mt-2">
          <label class="field-option"><input class="radio" type="radio" name="sg-stage" checked><span>Pilot<span class="field-option-desc">Running with real users, not yet routine.</span></span></label>
          <label class="field-option"><input class="radio" type="radio" name="sg-stage"><span>In production<span class="field-option-desc">Part of normal operations.</span></span></label>
        </div>
      </fieldset>
      <label class="field-option sm:col-span-2"><input class="checkbox" type="checkbox"><span>Public-facing<span class="field-option-desc">Residents or partners see the output.</span></span></label>
    </div>
  </section>

  <section id="sg-elevation" class="mt-16 scroll-mt-24">
    <h2 class="section-title">Elevation and motion</h2>
    <p class="section-lead mt-2">Three grounds one step apart — page, tinted band/panel, white card — and only the card has an edge: E0 is a 1px ink/10 ring drawn as a shadow, no border. E1 on hover; E2 only for surfaces that float. 120 / 180 / 240 ms with <code>ease-brand</code>; transforms and opacity only.</p>
    <div class="mt-6 grid gap-6 sm:grid-cols-3">
      <div class="card p-6"><p class="eyebrow">E0</p><p class="mt-2 text-sm text-brand-muted">Cards — <code>shadow-e0</code> (ink/6 ring + faint ambient), no border.</p></div>
      <div class="card card-hover p-6"><p class="eyebrow">E1 (hover me)</p><p class="mt-2 text-sm text-brand-muted"><code>.card-hover</code>: 1px lift, <code>shadow-e1</code>.</p></div>
      <div class="card p-6 shadow-e2"><p class="eyebrow">E2</p><p class="mt-2 text-sm text-brand-muted">Sticky results header, mobile sheet, listbox, progress rail.</p></div>
    </div>
    <div class="band mt-6 rounded-card p-6">
      <p class="eyebrow">Band / panel</p>
      <p class="mt-2 text-sm text-brand-muted"><code>.band</code> (full-bleed section) and <code>.panel</code> (rounded region) sit on <code>surface_tint</code> and carry no edge — the tint is the edge. Cards can sit on a band:</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="card p-4"><p class="font-heading text-base font-semibold text-brand-primary-dark">A card on a band</p><p class="mt-1 text-sm text-brand-muted">White on tint, raised by E0.</p></div>
        <div class="card p-4"><p class="font-heading text-base font-semibold text-brand-primary-dark">Another</p><p class="mt-1 text-sm text-brand-muted">A panel never sits on a panel.</p></div>
      </div>
    </div>
    <p class="section-lead mt-8">Radius is a theme token, drawn live below from <code>_data/theme.yml → radius: {{ site.data.theme.radius | default: 'soft' }}</code>. Prefer the semantic names — they say what the corner is <em>for</em> — over the numeric ones, which carry a historical off-by-one.</p>
    {%- comment -%} Every class below is written out in full rather than composed in a loop:
    Tailwind's scanner reads this file as plain text, and a `rounded-{{ name }}` it cannot see
    is a class it does not generate. That is the same reason badge tones are an attribute.
    {%- endcomment -%}
    <div class="card mt-4 flex flex-wrap items-end gap-6 p-6">
      <div class="text-center"><div class="h-16 w-16 rounded-hairline border border-brand-line-strong bg-surface-base"></div><p class="eyebrow mt-2">rounded-hairline</p><p class="mt-1 text-xs text-brand-muted">checkbox, focus target</p></div>
      <div class="text-center"><div class="h-16 w-16 rounded-control border border-brand-line-strong bg-surface-base"></div><p class="eyebrow mt-2">rounded-control</p><p class="mt-1 text-xs text-brand-muted">input, toggle, small panel</p></div>
      <div class="text-center"><div class="h-16 w-16 rounded-card border border-brand-line-strong bg-surface-base"></div><p class="eyebrow mt-2">rounded-card</p><p class="mt-1 text-xs text-brand-muted">card, panel</p></div>
      <div class="text-center"><div class="h-16 w-16 rounded-sheet border border-brand-line-strong bg-surface-base"></div><p class="eyebrow mt-2">rounded-sheet</p><p class="mt-1 text-xs text-brand-muted">sheet, dialog, hero</p></div>
      <div class="text-center"><div class="h-16 w-16 rounded-pill border border-brand-line-strong bg-surface-base"></div><p class="eyebrow mt-2">rounded-pill</p><p class="mt-1 text-xs text-brand-muted">badge, chip, button</p></div>
    </div>
    <p class="section-lead mt-8">So is duration. Hover a swatch to feel its timing; all three come from <code>--motion-fast/base/slow</code> and are overridden together by a <code>motion:</code> block in <code>theme.yml</code>.</p>
    <div class="card mt-4 grid gap-4 p-6 sm:grid-cols-3">
      <div><div class="h-10 rounded-control bg-brand-primary/10 transition-colors duration-fast ease-brand hover:bg-brand-primary/40"></div><p class="eyebrow mt-2">duration-fast</p><p class="mt-1 text-xs text-brand-muted">colour, opacity, pressed</p></div>
      <div><div class="h-10 rounded-control bg-brand-primary/10 transition-colors duration-base ease-brand hover:bg-brand-primary/40"></div><p class="eyebrow mt-2">duration-base</p><p class="mt-1 text-xs text-brand-muted">hover lift, expand</p></div>
      <div><div class="h-10 rounded-control bg-brand-primary/10 transition-colors duration-slow ease-brand hover:bg-brand-primary/40"></div><p class="eyebrow mt-2">duration-slow</p><p class="mt-1 text-xs text-brand-muted">sheets, dialogs, page transitions</p></div>
    </div>
  </section>

  <p class="mt-16 border-t border-brand-line pt-6 text-sm text-brand-muted">This page is <code>noindex</code> and outside the sitemap. Remove <code>styleguide/</code> if you don't want it on your deployment.</p>
</div>
