---
layout: compare
permalink: /compare/
---

{%- comment -%}
No `title` / `summary` here on purpose, the same way catalog/index.md leaves them
out: _layouts/compare.html builds both from _data/schema.yml's `entry.plural`, so a
fork that renames the entry noun renames this page with it. Add `title:` only if the
page should be called something the noun does not say.

The body below is prose that prints with the brief, so keep it to what a reader
holding the paper still needs. Everything about how the table works belongs in
docs/compare.md, not here.
{%- endcomment -%}
