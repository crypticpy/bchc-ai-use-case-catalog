---
layout: entry
render_with_liquid: false
title: "Which languages our front counters actually need"
slug: language-access-front-counter
summary: "Turned two years of interpreter request logs into a dashboard that shows which languages are asked for, at which counters, and at which hours."
published: 2026-07-21
featured: true
sample: true
finding: "Requests named 14 languages; the four we staffed for covered 62% of them"
cohort: "2026"
area: "Communications"
track: "Data Storytelling"
members:
  - "Language access coordinator"
  - "Front counter supervisor"
  - "Communications analyst"
  - "Web content editor"
coach_name: "Storytelling track coach"
coach_email: "coach.storytelling@example.org"
methods:
  - "Tableau"
  - "SQL"
  - "Survey coding"
  - "Stakeholder workshops"
data_sources:
  - "Interpreter request log, counts by language, site and hour"
  - "Front counter staffing schedule"
  - "American Community Survey language-spoken-at-home table"
skills:
  - "Visualization"
  - "Stakeholder interviews"
  - "Data cleaning"
tags:
  - "language access"
  - "equity"
  - "front-line services"
dashboard_url: "https://example.org/dashboards/language-access"
screenshots:
  - src: /catalog/language-access-front-counter/screenshots/01.png
    alt: "Dashboard mock with a ranked bar chart of interpreter requests by language and a small grid of requests by hour of day."
resources:
  - label: "One-page summary for the leadership briefing"
    url: "https://example.org/cohorts/2026/language-access-summary"
  - label: "Interpreter request log data dictionary"
    url: "https://example.org/cohorts/2026/language-access-dictionary"
---

## The question

Every counter keeps an interpreter request log because a policy says to. Nobody had ever read them together. The staffing plan for on-site interpreters had been set years earlier from census figures for the service area as a whole, and the coordinator suspected that what people ask for at a counter and what people speak at home are two different distributions.

## What we did

We combined 24 months of logs from six sites. The logs were paper at two of them, so the first month of the project was transcription and a shared vocabulary — three sites had been recording the same language under three different names.

Then we did the thing the track is for: we sat with the counter supervisors and asked what decision they would make differently if they had this. The answer was scheduling, not policy, which changed the whole design. The dashboard leads with requests by hour of day and by site, and the ranked language list is second, because the ranking was already roughly known and the timing was not.

## What we found

Fourteen languages appeared across the two years. The four we staff for accounted for 62% of requests — meaning nearly four in ten requests went to a phone line, at an average wait we can now quantify. Requests cluster hard between 9 and 11 in the morning at four of the six sites; one site, open late, has a second peak after five that no on-site interpreter has ever covered.

The census comparison was the useful negative result: two of the largest home-language groups in the service area barely appear in the request logs at all. That is not evidence they need less help. It is a question we handed to the community engagement team.

## What we learned

The chart nobody asked for is the chart nobody uses. Two of our first five views were dropped after the workshop because supervisors could not name a decision that would follow from them. Building for one decision made the dashboard smaller and, for the first time, actually used.

## What happens next

Interpreter scheduling for the coming year was set from this dashboard rather than from the census baseline, and the log is now a shared form at all six sites, so the transcription month does not have to happen again.
