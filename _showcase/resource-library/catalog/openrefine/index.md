---
layout: entry
render_with_liquid: false
title: "OpenRefine"
slug: openrefine
summary: "A free desktop tool for cleaning messy spreadsheets — clustering near-duplicate values, splitting columns and reconciling names — that records every step so the clean-up can be replayed on next month's file."
published: 2025-04-15
updated: 2026-05-12
featured: true
sample: true
resource_type: "Tool"
publisher: "OpenRefine community"
year: 2025
contact_email: "library@example.org"
topics:
  - "data cleaning"
  - "spreadsheets"
  - "reproducibility"
audience:
  - "Analysts"
  - "IT & data teams"
  - "Program staff"
language: "English"
format: "Code"
access:
  - "Freely available"
resource_url: "https://openrefine.org/"
related_links:
  - label: "Official user manual"
    url: "https://openrefine.org/docs"
  - label: "Library of Congress introductory tutorial"
    url: "https://www.loc.gov/programs/digital-collections-management/for-libraries/tools/openrefine/"
---

## What it is

OpenRefine runs on your own machine and opens in a browser tab. You load a spreadsheet or CSV, and it gives you the operations that are painful in a spreadsheet and awkward in code: cluster values that are probably the same thing spelled four ways, split one column into three, mass-edit by facet, and undo any of it.

The part that matters most for repeat work is the operation history. Every step is recorded as JSON you can export and re-apply, so a clean-up you worked out once becomes a script you run on next month's extract in a few seconds.

## Who it is for

Anyone who is handed a file that a person typed. It is the standard first recommendation for staff who are comfortable in spreadsheets but not yet writing code, and it stays useful long after they are.

## Notes from the library

The clustering feature is the reason to try it; run it on any column of free-typed organisation names and the result usually decides the argument about whether the data needs cleaning. Two cautions: it holds the whole dataset in memory, so very large files want a different tool, and the project file is local — put the exported operation history in version control if the clean-up is going to be repeated.
