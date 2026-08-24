---
layout: entry
render_with_liquid: false
title: "Forecasting the permit review backlog"
slug: permit-backlog-forecast
summary: "Built a weekly forecast of the permit review queue so the licensing team can see a backlog forming instead of discovering it two months later."
published: 2025-07-08
updated: 2026-02-11
sample: true
finding: "A two-week staffing dip in March explained most of the backlog that was still there in July"
cohort: "2025"
area: "Permitting & Licensing"
track: "Data Science Essentials"
members:
  - "Permit operations analyst"
  - "Licensing team lead"
  - "Business systems administrator"
coach_name: "Senior data scientist (program coach)"
coach_email: "coach.essentials@example.org"
methods:
  - "Time series"
  - "Python"
  - "statsmodels"
  - "Scheduled job"
data_sources:
  - "Permit workflow timestamps from the licensing system"
  - "Weekly reviewer availability, headcount only"
  - "Published permit fee schedule and statutory review windows"
skills:
  - "Statistics"
  - "Automation"
  - "Visualization"
tags:
  - "operations"
  - "forecasting"
  - "backlog"
dashboard_url: "https://example.org/dashboards/permit-backlog"
repo_url: "https://github.com/example-org/permit-backlog-forecast"
screenshots:
  - src: /catalog/permit-backlog-forecast/screenshots/01.png
    alt: "Line chart of weekly open permit reviews across a year with a shaded forecast band widening over the final eight weeks."
resources:
  - label: "Runbook for the weekly refresh"
    url: "https://github.com/example-org/permit-backlog-forecast/blob/main/RUNBOOK.md"
---

## The question

The licensing team knew the backlog by feel — someone would say it was bad, and three weeks later the monthly report would agree. By then the causes were a season old. We wanted a weekly number that arrives early enough to act on.

## What we did

Permits already leave timestamps at each workflow step, so the queue length was recoverable week by week without any new collection. We modelled weekly open reviews as arrivals minus completions, with completions driven by reviewer-weeks available. A seasonal ARIMA on eight years of arrivals turned out to beat every clever thing we tried, which was a useful lesson in itself.

The forecast runs every Monday morning as a scheduled job and posts a chart with an eight-week band to the team's channel. It is one file of Python and one YAML config.

## What we found

Arrivals are far more seasonal than anyone said out loud: two thirds of the annual variation is calendar, not workload. The backlog everyone remembered from that summer traced almost entirely to a two-week stretch in March when two reviewers were out at once — the queue never recovered because arrivals kept climbing into spring.

That reframed the conversation. The fix that mattered was not "hire more" but "do not leave the March fortnight uncovered".

## What we learned

Two thirds of the effort was defining "open". The licensing system has four statuses that all look open and one of them is a parking bay for applications waiting on the applicant, which is nobody's backlog. Once we excluded it the numbers stopped arguing with the team's intuition, and the model got noticeably better at the same time.

## What happens next

The forecast has been running for a year. It has been wrong twice in ways worth studying, both when a fee change pulled applications forward, and the team now treats a widening band as a prompt to check whether a policy change is in flight.
