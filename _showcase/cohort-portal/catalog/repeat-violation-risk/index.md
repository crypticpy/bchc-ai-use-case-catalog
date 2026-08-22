---
layout: entry
render_with_liquid: false
title: "How soon does a critical violation come back?"
slug: repeat-violation-risk
summary: "Measured how long facilities go after a critical inspection violation before the next one, and whether an early re-inspection changes that."
published: 2026-07-02
updated: 2026-08-05
featured: true
sample: true
finding: "A re-inspection within 30 days cut the one-year repeat rate from roughly one in three to one in eight"
cohort: "2026"
area: "Environmental Health"
track: "Civic Analytics"
members:
  - "Environmental health specialist"
  - "Inspections program analyst"
  - "Licensing data steward"
coach_name: "Analytics manager (program coach)"
coach_email: "coach.civic@example.org"
methods:
  - "Survival analysis"
  - "Python"
  - "pandas"
  - "lifelines"
data_sources:
  - "Routine and follow-up inspection records, published open data"
  - "Facility licensing register"
  - "Inspector assignment roster, counts only"
skills:
  - "Statistics"
  - "Data cleaning"
  - "Visualization"
tags:
  - "food safety"
  - "inspections"
  - "prioritization"
dashboard_url: "https://example.org/dashboards/repeat-violation-risk"
repo_url: "https://github.com/example-org/repeat-violation-risk"
screenshots:
  - src: /catalog/repeat-violation-risk/screenshots/01.png
    alt: "Two survival curves over twelve months showing repeat-violation-free share staying near 88 percent with an early re-inspection and falling to 67 percent without one."
resources:
  - label: "Cohort showcase poster (PDF)"
    url: "https://example.org/cohorts/2026/repeat-violation-risk-poster.pdf"
  - label: "Method notes and sensitivity checks"
    url: "https://github.com/example-org/repeat-violation-risk/blob/main/docs/method.md"
---

## The question

Inspectors have long argued that going back quickly after a critical violation is what actually changes behaviour, and that the current 90-day follow-up window is too slow to matter. The counter-argument is that early re-inspections eat the schedule. Neither side had a number.

## What we did

This is a time-to-event question, not a rate question, so we treated it as one. For every facility with a critical violation, the clock starts on the inspection date and stops at the next critical violation, at the end of the study window, or when the facility closes — the last two being censored rather than missing.

We compared facilities re-inspected within 30 days against those re-inspected later or not at all, using Kaplan-Meier curves and then a Cox model to hold facility type, size band and prior history steady. All of it runs on published open inspection data, which means anyone can reproduce the figure without a data agreement.

## What we found

Twelve months after a critical violation, 88% of facilities re-inspected inside 30 days had no second critical violation, against 67% of those that were not. Adjusting for facility type and prior history narrows the gap but does not close it.

The honest caveat is selection: inspectors choose who to go back to quickly, and they are good at their jobs, so some of the difference is their judgement rather than the visit. We say so in the write-up, and we scoped what a fair test would look like — the program is now considering one.

## What we learned

Half the work was the licensing register. Facilities change names, change owners and keep the same address; treating each name as a separate facility made the early results look far better than they were. Reconciling identity across the two systems took three weeks of the six.

## What happens next

The inspections program is piloting a 30-day follow-up for the highest-severity violation codes in two districts, with the same notebook re-run each quarter as the measurement.
