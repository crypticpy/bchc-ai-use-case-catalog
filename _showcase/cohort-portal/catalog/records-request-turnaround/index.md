---
layout: entry
render_with_liquid: false
title: "Where the two weeks go in a records request"
slug: records-request-turnaround
summary: "Reconstructed the full path of a mailed-in vital records request from timestamps and found that most of the wait happened in a queue nobody owned."
published: 2025-06-26
sample: true
finding: "Mail-in requests spent 9 of their 14 days in a single hand-off between two systems"
cohort: "2025"
area: "Vital Records"
track: "Civic Analytics"
members:
  - "Vital records supervisor"
  - "Process improvement analyst"
  - "Mailroom operations lead"
coach_name: "Analytics manager (program coach)"
coach_email: "coach.civic@example.org"
methods:
  - "Process mining"
  - "SQL"
  - "R"
  - "ggplot2"
data_sources:
  - "Request tracking system status history"
  - "Mailroom intake scan log"
  - "Fulfilment and dispatch records, counts only"
skills:
  - "Data cleaning"
  - "Automation"
  - "Visualization"
  - "Stakeholder interviews"
tags:
  - "process improvement"
  - "service delivery"
  - "records"
dashboard_url: "https://example.org/dashboards/records-turnaround"
screenshots:
  - src: /catalog/records-request-turnaround/screenshots/01.png
    alt: "Horizontal stage chart of median days per step, with the awaiting-verification stage at nine days dwarfing five other stages."
resources:
  - label: "Stage definitions and how each timestamp is derived"
    url: "https://example.org/cohorts/2025/records-turnaround-stages"
---

## The question

The published service standard for a mailed-in certificate request is ten working days. The team was meeting it about two thirds of the time and could not say which part of the process was responsible, because the only number anyone had was start to finish.

## What we did

Both systems involved keep status history, so the path of a request is recoverable even though no one had ever assembled it: mailroom scan, intake, verification, fulfilment, dispatch. We joined the two logs on the request reference, defined each stage as the interval between two specific status changes, and wrote those definitions down before looking at a single duration — a rule the coach insisted on, and rightly.

Then we plotted the median and the 90th percentile for each stage, because the average hid exactly the tail the service standard is about.

## What we found

Of a median 14 calendar days, nine were spent in one stage: waiting for verification after intake. Requests entered that stage automatically and left it only when someone opened the work queue, which happened when someone remembered. The stage had no owner, no target and no alert. Every other stage was well inside its informal target.

The 90th percentile told a second story. A small group of requests waited over 30 days, almost all of them missing one piece of identity documentation, with no automatic notice to the requester until a human noticed.

## What we learned

Nobody was doing anything wrong. The delay lived in a gap between two teams' definitions of "done", and it was invisible precisely because both teams' own numbers looked fine. Measuring the hand-off rather than the departments was the whole insight.

## What happens next

The verification queue now has a named owner and a daily target, and the missing-documentation case triggers a letter on day three instead of on discovery. Median turnaround for the last quarter was six days.
