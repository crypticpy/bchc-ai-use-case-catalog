---
layout: default
title: "Resources"
summary: "Curated guides, toolkits and links."
permalink: /resources/
---
<section class="mb-10 max-w-3xl">
  <span class="eyebrow">Library</span>
  <h1 class="mt-2 font-heading text-4xl font-semibold text-brand-primary-dark sm:text-5xl">Resources</h1>
  <p class="mt-4 text-lg text-brand-muted">Curated by the maintainers. Edit <code>_data/resources.yml</code> to add or change items.</p>
</section>
{% if site.data.resources and site.data.resources.size > 0 %}
<div class="grid gap-8 lg:grid-cols-2">
  {% for group in site.data.resources %}
    <section class="card" aria-labelledby="group-{{ forloop.index }}">
      <div class="card-header"><h2 id="group-{{ forloop.index }}" class="card-title">{{ group.group }}</h2>{% if group.description %}<p class="text-sm text-brand-muted">{{ group.description }}</p>{% endif %}</div>
      <ul class="space-y-3 px-6 py-6">
        {% for item in group.items %}
          <li><a class="link-row" href="{{ item.url }}" {% if item.url contains '://' %}target="_blank" rel="noopener noreferrer"{% endif %}>
            <span class="flex min-w-0 items-center gap-3"><span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">{% include icon.html name='document' size='sm' %}</span><span class="flex min-w-0 flex-col"><span class="truncate">{{ item.title }}</span>{% if item.description %}<span class="truncate text-xs font-normal text-brand-muted">{{ item.description }}</span>{% endif %}</span></span>
            {% if item.type %}<span class="chip-neutral shrink-0">{{ item.type }}</span>{% endif %}
          </a></li>
        {% endfor %}
      </ul>
    </section>
  {% endfor %}
</div>
{% else %}
{% include empty-state.html icon='document' title='No resources yet' body='Add groups and items to _data/resources.yml to populate this page.' %}
{% endif %}
