---
layout: default
title: "Governance"
permalink: /governance/
description: "How this catalog is governed: what may be published, who reviews it, how long that takes, and what happens after."
---
{%- comment -%}
The governance page. Everything on it comes from _data/governance.yml; each
block renders only when its data exists, and _plugins/modules.rb drops the page
entirely when `modules.governance` is off. Local assigns are prefixed `gv_`.

Order on the page follows the order a submitter meets it: what the review is,
who does it, how the catalog is doing (from _data/metrics.json — sample figures
in the template, your own once the monthly metrics workflow has run; the block
is absent while the file is), then the standing policies, then where to take a
question.
{%- endcomment -%}
{%- assign gv = site.data.governance -%}
{%- assign gv_cfg = site.data.site -%}
{%- assign gv_repo = gv_cfg.github.repository | default: '' -%}
{%- assign gv_branch = gv_cfg.github.branch | default: 'main' -%}
{%- assign gv_mail = gv_cfg.organization.contact_email | default: '' -%}
{%- assign gv_steps = gv.review.steps | default: empty -%}
{%- assign gv_criteria = gv.review.criteria | default: empty -%}
{%- assign gv_roles = gv.roles | default: empty -%}
{%- assign gv_policies = gv.policies | default: empty -%}
{%- assign gv_metrics = site.data.metrics -%}
{%- assign gv_entry_path = site.data.schema.entry.path | default: 'catalog' -%}
{%- assign gv_feed = '/' | append: gv_entry_path | append: '/feed.xml' -%}
{%- comment -%} The feed exists only when the catalog has entries (catalog_feed.rb) — same guard as head.html and footer.html. {%- endcomment -%}
{%- assign gv_entry_pages = site.data.entry_pages -%}
{%- unless gv_entry_pages -%}{%- assign gv_entry_pages = site.pages | where: 'layout', 'entry' -%}{%- endunless -%}
{%- assign gv_entry_count = gv_entry_pages | size -%}

<article class="mx-auto max-w-3xl">
  {% if gv.eyebrow %}<span class="eyebrow">{{ gv.eyebrow }}</span>{% endif %}
  <h1 class="page-title mt-2">{{ gv.title | default: page.title }}</h1>
  {% if gv.summary %}<p class="mt-4 text-lg leading-relaxed text-brand-muted">{{ gv.summary }}</p>{% endif %}

  {%- comment -%} "On this page": only the blocks that will actually render. {%- endcomment -%}
  {%- capture gv_nav -%}
    {%- if gv_steps.size > 0 -%}<li><a href="#review">How review works</a></li>{%- endif -%}
    {%- if gv_criteria.size > 0 -%}<li><a href="#criteria">What reviewers look for</a></li>{%- endif -%}
    {%- if gv_roles.size > 0 -%}<li><a href="#roles">Who does what</a></li>{%- endif -%}
    {%- if gv_metrics.quarters -%}<li><a href="#metrics">How the catalog is doing</a></li>{%- endif -%}
    {%- for gv_p in gv_policies -%}<li><a href="#{{ gv_p.id | default: gv_p.title | slugify }}">{{ gv_p.title }}</a></li>{%- endfor -%}
    {%- if gv.outro or gv_mail != '' -%}<li><a href="#questions">Questions and appeals</a></li>{%- endif -%}
  {%- endcapture -%}
  {%- assign gv_nav = gv_nav | strip -%}
  {%- if gv_nav != '' -%}
  <nav class="gov-nav" aria-labelledby="gov-nav-heading">
    <h2 class="rail-title" id="gov-nav-heading">On this page</h2>
    <ol class="gov-nav-list" role="list">{{ gv_nav }}</ol>
  </nav>
  {%- endif -%}

  {% if gv.intro %}<div class="prose-body mt-8">{{ gv.intro | markdownify }}</div>{% endif %}

  {%- if gv_steps.size > 0 -%}
  <section class="mt-12" aria-labelledby="review">
    <h2 class="section-title" id="review">How review works</h2>
    {% if gv.review.intro %}<p class="mt-3 max-w-prose text-base leading-relaxed text-brand-muted">{{ gv.review.intro }}</p>{% endif %}
    <ol class="gov-steps mt-8" role="list">
      {%- for gv_s in gv_steps -%}
      <li class="gov-step">
        <span class="gov-step-num" aria-hidden="true">{{ forloop.index }}</span>
        <div class="min-w-0">
          <h3 class="gov-step-title"><span class="sr-only">Step {{ forloop.index }}: </span>{{ gv_s.name }}</h3>
          {%- if gv_s.who or gv_s.target -%}
          <p class="gov-step-meta">
            {%- if gv_s.who -%}<span>{{ gv_s.who }}</span>{%- endif -%}
            {%- if gv_s.target -%}<span class="gov-step-target">{% include icon.html name='clock' size='xs' class='shrink-0' %}{{ gv_s.target }}</span>{%- endif -%}
          </p>
          {%- endif -%}
          {% if gv_s.body %}<div class="prose-body prose-sm mt-2">{{ gv_s.body | markdownify }}</div>{% endif %}
        </div>
      </li>
      {%- endfor -%}
    </ol>
  </section>
  {%- endif -%}

  {%- if gv_criteria.size > 0 -%}
  <section class="panel mt-12 px-6 py-6 sm:px-8" aria-labelledby="criteria">
    <h2 class="section-title" id="criteria">What reviewers look for</h2>
    {% if gv.review.criteria_intro %}<p class="mt-3 max-w-prose text-base leading-relaxed text-brand-muted">{{ gv.review.criteria_intro }}</p>{% endif %}
    <dl class="gov-criteria mt-6">
      {%- for gv_c in gv_criteria -%}
      <div class="gov-criterion">
        <dt>{% include icon.html name='check' size='sm' class='shrink-0 text-brand-secondary' %}<span>{{ gv_c.name }}</span></dt>
        <dd>{{ gv_c.body }}</dd>
      </div>
      {%- endfor -%}
    </dl>
  </section>
  {%- endif -%}

  {%- if gv_roles.size > 0 -%}
  <section class="mt-12" aria-labelledby="roles">
    <h2 class="section-title" id="roles">Who does what</h2>
    {% if gv.roles_intro %}<p class="mt-3 max-w-prose text-base leading-relaxed text-brand-muted">{{ gv.roles_intro }}</p>{% endif %}
    <ul class="gov-roles mt-6" role="list">
      {%- for gv_r in gv_roles -%}
      <li class="gov-role">
        <h3 class="gov-role-title">{{ gv_r.name }}</h3>
        <p class="gov-role-body">{{ gv_r.body }}</p>
      </li>
      {%- endfor -%}
    </ul>
  </section>
  {%- endif -%}

  {%- if gv_metrics.quarters -%}
  {%- assign gv_t = gv_metrics.totals -%}
  {%- assign gv_ta = gv_t.turnaround_days -%}
  <section class="mt-12" aria-labelledby="metrics">
    <h2 class="section-title" id="metrics">How the catalog is doing</h2>
    <p class="mt-3 max-w-prose text-base leading-relaxed text-brand-muted">
      {{ gv.metrics_intro | default: 'Counted from this repository’s own issues and pull requests, refreshed monthly.' }}
      Last {{ gv_metrics.window.quarters }} quarters, {{ gv_metrics.window.from | date: '%b %Y' }} to {{ gv_metrics.window.to | date: '%b %-d, %Y' }}.
    </p>
    <dl class="gov-metrics mt-6">
      <div class="gov-metric"><dt>Submissions</dt><dd><span class="gov-metric-value">{{ gv_t.submissions }}</span></dd></div>
      <div class="gov-metric"><dt>Published</dt><dd><span class="gov-metric-value">{{ gv_t.published }}</span></dd></div>
      {%- if gv_t.organizations > 0 -%}
      <div class="gov-metric"><dt>Contributing organizations</dt><dd><span class="gov-metric-value">{{ gv_t.organizations }}</span><span class="gov-metric-note">all time</span></dd></div>
      {%- endif -%}
      {%- if gv_ta.count > 0 -%}
      <div class="gov-metric"><dt>Median review time</dt><dd><span class="gov-metric-value">{% if gv_ta.median < 1 %}&lt;1{% else %}{{ gv_ta.median }}{% endif %}<span class="gov-metric-unit"> {% if gv_ta.median <= 1 %}day{% else %}days{% endif %}</span></span><span class="gov-metric-note">9 in 10 within {% if gv_ta.p90 < 1 %}a day{% elsif gv_ta.p90 == 1 %}1 day{% else %}{{ gv_ta.p90 }} days{% endif %} · {{ gv_ta.count }} reviewed</span></dd></div>
      {%- endif -%}
    </dl>
    <div class="mt-6 overflow-x-auto">
      <table class="gov-metrics-table">
        <caption class="sr-only">Submissions and publications by quarter</caption>
        <thead>
          <tr><th scope="col">Quarter</th><th scope="col" class="num">Submissions</th><th scope="col" class="num">Published</th>{% if gv_t.organizations > 0 %}<th scope="col" class="num">Organizations</th>{% endif %}</tr>
        </thead>
        <tbody>
          {%- for gv_q in gv_metrics.quarters -%}
          <tr><th scope="row">{{ gv_q.quarter | replace: '-Q', ' Q' }}</th><td class="num">{{ gv_q.submissions }}</td><td class="num">{{ gv_q.published }}</td>{% if gv_t.organizations > 0 %}<td class="num">{{ gv_q.organizations }}</td>{% endif %}</tr>
          {%- endfor -%}
        </tbody>
      </table>
    </div>
    {%- if gv_cfg.modules.catalog != false and gv_entry_count > 0 -%}
    <p class="mt-4 text-sm text-brand-muted">New and updated entries are announced in the <a class="text-brand-primary underline underline-offset-2" href="{{ gv_feed | relative_url }}">catalog feed</a>{% if gv_repo != '' %} and, to each submitter, on their own submission when it goes live{% endif %}.</p>
    {%- endif -%}
  </section>
  {%- endif -%}

  {%- for gv_p in gv_policies -%}
  {%- assign gv_pid = gv_p.id | default: gv_p.title | slugify -%}
  <section class="mt-12" aria-labelledby="{{ gv_pid }}">
    <h2 class="section-title" id="{{ gv_pid }}">{{ gv_p.title }}</h2>
    <div class="prose-body mt-4">{{ gv_p.body | markdownify }}</div>
  </section>
  {%- endfor -%}

  {%- if gv.outro or gv_mail != '' -%}
  <section class="cta-panel mt-14" aria-labelledby="questions">
    <h2 class="section-title" id="questions">Questions and appeals</h2>
    {% if gv.outro %}<p class="mt-3 max-w-prose text-base leading-relaxed text-brand-muted">{{ gv.outro }}</p>{% endif %}
    <div class="mt-6 flex flex-wrap items-center gap-3">
      {%- if gv_mail != '' -%}
      <a class="btn-primary" href="mailto:{{ gv_mail }}?subject={{ 'Question about the catalog governance' | query_encode }}">{% include icon.html name='mail' size='sm' %} Email the maintainers</a>
      {%- endif -%}
      {%- if gv_repo != '' -%}
      <a class="btn-secondary" href="https://github.com/{{ gv_repo }}/blob/{{ gv_branch }}/docs/contributor-guide.md" target="_blank" rel="noopener noreferrer">Contributor guide<span class="sr-only"> (opens in a new tab)</span></a>
      <a class="btn-secondary" href="https://github.com/{{ gv_repo }}/blob/{{ gv_branch }}/CODE_OF_CONDUCT.md" target="_blank" rel="noopener noreferrer">Code of conduct<span class="sr-only"> (opens in a new tab)</span></a>
      {%- endif -%}
    </div>
  </section>
  {%- endif -%}
</article>
