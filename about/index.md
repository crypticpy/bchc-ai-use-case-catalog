---
layout: page
title: "About this catalog"
eyebrow: "About"
summary: "What this site is, who maintains it, and how content gets here."
permalink: /about/
---
{% assign cfg = site.data.site %}
{% assign schema = site.data.schema %}

This site is maintained by **{{ cfg.organization.name }}**. It is a shared, public catalog of {{ schema.entry.plural | downcase }} contributed by members and reviewed by maintainers before publication.

## How content gets here

{% if cfg.modules.submit -%}
1. Anyone can propose {{ schema.entry.singular | downcase | with_article }} through the [submission form]({{ '/submit/' | relative_url }}). The form opens a GitHub issue with your answers.
{%- else -%}
1. Anyone can propose {{ schema.entry.singular | downcase | with_article }} by opening a GitHub issue on the repository. Email [{{ cfg.organization.contact_email }}](mailto:{{ cfg.organization.contact_email }}) if you would like to contribute one.
{%- endif %}
2. Automation turns the issue into a page in a pull request.
3. A maintainer reviews the page, asks for changes if needed, and merges it.
4. The site rebuilds and the entry is live within a couple of minutes.

Every change is versioned, so anything can be corrected or rolled back. If you spot an error on a page, use the *Suggest an edit* link at the bottom of that page.
{% if cfg.modules.governance %}
The rules reviewers apply — what may be published, who reviews it, how long that takes, licensing, privacy, accessibility and what happens to an entry after it goes live — are on the [governance page]({{ '/governance/' | relative_url }}).
{% endif %}
## Contact

Questions about the catalog or the review process? Email [{{ cfg.organization.contact_email }}](mailto:{{ cfg.organization.contact_email }}).

## Built with

This site runs on GitHub Pages and is managed entirely through GitHub issues and pull requests. The template is open source; see the repository{% if cfg.github.repository and cfg.github.repository != '' %} at [github.com/{{ cfg.github.repository }}](https://github.com/{{ cfg.github.repository }}){% endif %} for the code and the maintainer guide.
