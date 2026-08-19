---
layout: default
title: "Site setup"
permalink: /setup/
sitemap: false
robots: noindex
---

<section class="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">

  <header class="mb-8">
    <p class="eyebrow">Maintainers</p>
    <h1 class="section-title text-3xl">Configure this site</h1>
    <p class="section-lead mt-2 max-w-3xl">
      Answer a few questions and this page writes the configuration files for you. Nothing changes
      until you copy each file into GitHub yourself, so you can explore freely. No terminal required.
    </p>
  </header>

  <div id="resume-banner" class="card mb-6" hidden>
    <div class="px-6 py-4">
      <p class="text-sm text-brand-ink">
        Picked up where you left off — your answers are saved in this browser. Use <strong>Start over</strong> at the
        bottom of any step to clear them.
      </p>
    </div>
  </div>

  <nav id="wizard-steps" class="mb-6 flex flex-wrap gap-2" aria-label="Setup steps"></nav>

  {%- comment -%}
    No `role="alert"`, for the same reason the submission form's error summary
    has none: the panel the wizard renders in here takes focus the moment it
    fills, so an assistive technology reads it as the new focus target.
    Announcing it as a live region as well makes it arrive twice.
  {%- endcomment -%}
  <div id="wizard-errors" class="mb-6"></div>

  <div id="wizard">
    <noscript>
      <div class="card p-6">
        <p class="text-sm text-brand-ink">
          This setup wizard needs JavaScript. You can configure the site by editing
          <code>_data/site.yml</code>, <code>_data/theme.yml</code> and <code>_data/schema.yml</code> directly, or by
          running <code>npm run setup</code> from a checkout of the repository.
        </p>
      </div>
    </noscript>
  </div>

  <aside class="card mt-10">
    <div class="card-header">
      <p class="card-title">Where these settings live</p>
    </div>
    <div class="space-y-2 px-6 py-5 text-sm text-brand-muted">
      <p><code class="font-mono text-brand-ink">_data/site.yml</code> — branding, contact details, module toggles.</p>
      <p><code class="font-mono text-brand-ink">_data/theme.yml</code> — colors, fonts, corner rounding.</p>
      <p><code class="font-mono text-brand-ink">_data/schema.yml</code> — the fields every entry has.</p>
      <p><code class="font-mono text-brand-ink">_data/navigation.yml</code> — the header links, derived from your modules.</p>
      <p class="pt-2">
        After hand-editing <code class="font-mono text-brand-ink">_data/schema.yml</code>, run
        <code class="font-mono text-brand-ink">npm run generate</code> to rebuild the GitHub issue form — or just use
        this page, which regenerates it for you.
      </p>
    </div>
  </aside>

</section>

<script id="current-config" type="application/json">{{ site.data.site | jsonify }}</script>
<script id="current-theme" type="application/json">{{ site.data.theme | jsonify }}</script>
<script id="current-schema" type="application/json">{{ site.data.schema | jsonify }}</script>
<script id="current-navigation" type="application/json">{{ site.data.navigation | jsonify }}</script>
<script id="current-repository" type="application/json">{{ site.github.repository_nwo | jsonify }}</script>

<script type="module" src="{{ '/assets/js/configurator/setup-page.js' | relative_url }}"></script>
