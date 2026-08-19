---
layout: default
title: "Cohorts"
summary: "Browse every published cohort."
permalink: /cohorts/
---
{%- assign schema = site.data.schema -%}
{%- assign plural = schema.entry.plural | default: 'Entries' | downcase -%}
{%- assign cohorts = site.data.cohorts | sort -%}
<section class="mb-10 max-w-3xl">
  <span class="eyebrow">Program</span>
  <h1 class="mt-2 font-heading text-4xl font-semibold text-brand-primary-dark sm:text-5xl">Cohorts</h1>
  <p class="mt-4 text-lg text-brand-muted">Each cohort has its own timeline, learning materials and gallery of {{ plural }}.</p>
</section>
<div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
  {% for c in cohorts reversed %}
    {% assign year = c[0] %}{% assign data = c[1] %}
    {% assign n = site.pages | where: 'layout', 'entry' | where: 'cohort', year | size %}
    {% assign first_event = data.events | first %}
    <a class="card group relative p-6 transition hover:-translate-y-1 hover:border-brand-primary/40 hover:shadow-card" href="{{ '/cohorts/' | append: year | append: '/' | relative_url }}">
      <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-brand-primary/10 transition group-hover:bg-brand-primary/20" aria-hidden="true"></div>
      <div class="flex items-center justify-between gap-4"><span class="eyebrow">Cohort {{ year }}</span><span class="chip">{{ n }} {{ plural }}</span></div>
      <h2 class="mt-4 font-heading text-xl font-semibold text-brand-primary-dark group-hover:text-brand-primary">{{ data.title | default: first_event.name | default: 'Explore projects' }}</h2>
      {% if first_event %}<p class="mt-1 text-sm text-brand-muted">Kicks off {{ first_event.date | date: '%B %-d, %Y' }}</p>{% endif %}
    </a>
  {% endfor %}
</div>
{% if cohorts.size == 0 %}{% include empty-state.html icon='users' title='No cohorts yet' body='Cohort pages appear here once a cohort year is scaffolded.' %}{% endif %}
