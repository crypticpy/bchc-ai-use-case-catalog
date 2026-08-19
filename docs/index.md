# Documentation

Fifteen documents, four different readers. Find your row.

| Page | Who it is for | When to read it |
|---|---|---|
| [launch.md](launch.md) | Someone who just created a repository from the template | First. Start to finish, about 40 minutes, ends with an entry you published yourself. |
| [configuration.md](configuration.md) | Whoever owns `_data/*.yml` | When you want to change a setting and need to know the key, or what a key does. |
| [content-model.md](content-model.md) | Whoever decides what an entry holds | When the shipped fields are not your fields — designing a schema, adding a field type, choosing a taxonomy people will actually filter by. |
| [search.md](search.md) | Whoever owns the taxonomy | When search finds the wrong thing, or nothing — synonyms, tag aliases, the facet landing pages and the A–Z directory, all from `_data/search.yml`. |
| [admin-guide.md](admin-guide.md) | The maintainer of a live site | Day to day: reviewing submissions, editing and removing entries, screenshots, cohorts and events, troubleshooting. |
| [contributor-guide.md](contributor-guide.md) | Someone at a member organization with something to share | Before submitting: what the form asks, what reviewers check hardest, how long review takes, and what happens after an entry is live. Linked from the site's Governance page. |
| [upgrading.md](upgrading.md) | The maintainer of a fork | When a new template release is out: what is yours, what is the template's, and the merge recipe that keeps the two apart. |
| [incidents.md](incidents.md) | The maintainer, under pressure | The day something is public that should not be: a takedown request, a leaked screenshot, a credential in an entry. |
| [glossary.md](glossary.md) | Anyone hitting a word they do not use this way | Entry, slug, facet, card slot, module, preset, scaffold. |
| [decisions.md](decisions.md) | Someone changing the template | Before arguing with a choice — the reasoning is here, not in the commit log. |
| [images.md](images.md) | Someone wondering why a screenshot has five siblings | The responsive-image pipeline: `npm run images`, what gets committed and why, and how to use `picture.html` in a template. |
| [compare.md](compare.md) | Someone changing the compare tray or the print brief | How the shortlist, `/compare/` and the print stylesheet fit together, and the one rule that keeps them schema-driven. |
| [design-system.md](design-system.md) | Someone building UI | Tokens, component classes, browser support. Pair it with `/styleguide/` on the running site. |
| [design-brief.md](design-brief.md) | Nobody, urgently | Historical: the 2026 brief that produced the current design. Kept because it explains intent; `design-system.md` is what shipped. |
| [roadmap.md](roadmap.md) | Someone asking "what was built, and when" | A build log of the v1.0/v1.1 phases, all complete. |

Outside this folder: [README](../README.md) (what the template is),
[CONTRIBUTING](../CONTRIBUTING.md) (working on the template itself),
[ARCHITECTURE](../ARCHITECTURE.md) (how the pieces fit),
[SECURITY](../SECURITY.md) (the trust model behind the issue-to-pull-request pipeline),
[CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md) (how contributors and reviewers engage).

**Submitting an entry?** Almost none of this is for you — use the **Submit** page on the site,
and read [contributor-guide.md](contributor-guide.md) if you want to know what review will
ask. If the Submit page leaves you guessing, that is a bug in the page; please open an issue.
