---
layout: entry
render_with_liquid: false
title: "IPUMS USA harmonised census microdata"
slug: ipums-usa-extracts
summary: "Harmonised individual-level census and American Community Survey microdata going back to 1850, with an extract builder that lets you pick only the variables and years you need."
published: 2026-02-09
sample: true
resource_type: "Dataset"
publisher: "IPUMS"
year: 2026
contact_email: "analytics@example.org"
topics:
  - "demographics"
  - "census"
  - "microdata"
  - "small-area analysis"
audience:
  - "Analysts"
  - "External partners"
language: "English"
format: "Web page"
access:
  - "Free account required"
resource_url: "https://usa.ipums.org/usa/"
related_links:
  - label: "Variable documentation and comparability notes"
    url: "https://usa.ipums.org/usa-action/variables/group"
  - label: "American Community Survey documentation at the Census Bureau"
    url: "https://www.census.gov/programs-surveys/acs/microdata.html"
---

## What it is

IPUMS takes decades of census and survey microdata and does the tedious, essential work of harmonising it: the same variable means the same thing across years, with the exceptions documented rather than hidden. You build an extract on the site — choose samples, choose variables — and download only what you asked for.

## Who it is for

Analysts who need to go below the published summary tables: custom age bands, cross-tabulations the pre-built tables do not offer, or a consistent series across more years than a single survey release covers.

## What it takes to use it

Registration is free but required, and each extract takes a few minutes to build. Plan for the variable documentation to take longer than the download — comparability across years is usually the real work, and the notes on each variable are where the traps are described.

## Notes from the library

Read the sample weights documentation before computing anything. Microdata without weights answers a different question than the one people usually mean, and this is the single most common mistake we see in draft analyses that use it.
