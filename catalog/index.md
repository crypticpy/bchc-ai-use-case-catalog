---
layout: catalog
permalink: /catalog/
---
{%- comment -%}
No `title` / `summary` in the front matter on purpose. _layouts/catalog.html derives
both from _data/schema.yml's `entry.plural` / `entry.singular`, which is also where the
navigation label and the entry-page breadcrumb get the noun — so a fork that renames
the entry noun renames this page with it, instead of leaving "Catalog" behind. Add
`title:` here only if this page should be called something the noun does not say.
{%- endcomment -%}
