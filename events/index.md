---
layout: default
title: "Events"
summary: "Upcoming and past events."
permalink: /events/
---
{%- assign all = site.data.events_all -%}
{%- assign upcoming = all | where: 'past', false -%}
{%- assign past = all | where: 'past', true | reverse -%}
<section class="mb-10 max-w-3xl">
  <span class="eyebrow">Calendar</span>
  <h1 class="mt-2 font-heading text-4xl font-semibold text-brand-primary-dark sm:text-5xl">Events</h1>
  <p class="mt-4 text-lg text-brand-muted">Meetings, webinars, deadlines and program milestones. {% if site.data.site.modules.cohorts %}Cohort events link to their detail pages when available.{% endif %}</p>
</section>

<div class="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
  <section class="min-w-0" aria-labelledby="upcoming-heading">
    <h2 id="upcoming-heading" class="section-title mb-4">Upcoming</h2>
    {% if upcoming.size > 0 %}
      {% assign current_month = '' %}
      {% for ev in upcoming %}
        {% if ev.month != current_month %}
          {% unless forloop.first %}</div></div>{% endunless %}
          {% assign current_month = ev.month %}
          <div class="card mb-6"><div class="card-header"><h3 class="card-title">{{ ev.month }}</h3></div><div class="px-6">
        {% endif %}
        {% assign one_list = "" | split: "" | push: ev %}
        {% include event-list.html events=one_list %}
        {% if forloop.last %}</div></div>{% endif %}
      {% endfor %}
    {% else %}
      {% include empty-state.html icon='calendar' title='No upcoming events' body='Nothing is scheduled right now. Check back soon.' %}
    {% endif %}
  </section>
  <aside class="space-y-6">
    <section class="card" aria-labelledby="past-heading">
      <div class="card-header"><h2 id="past-heading" class="card-title">Past events</h2></div>
      <div class="px-6">
        {% if past.size > 0 %}{% include event-list.html events=past limit=12 compact=true %}{% else %}<p class="py-6 text-sm text-brand-muted">No past events yet.</p>{% endif %}
      </div>
    </section>
  </aside>
</div>
