---
layout: entry
render_with_liquid: false
title: "Booking lead time and missed appointments"
slug: appointment-lead-time
summary: "Tested whether how far ahead an appointment is booked predicts whether it is kept, using two years of de-identified scheduling counts from three community clinics."
published: 2026-06-24
sample: true
finding: "Appointments booked more than three weeks out were missed almost twice as often as those booked within a week"
cohort: "2026"
area: "Community Programs"
track: "Data Science Essentials"
members:
  - "Program analyst, community clinics"
  - "Scheduling supervisor"
  - "Quality improvement specialist"
coach_name: "Senior data scientist (program coach)"
coach_email: "coach.essentials@example.org"
methods:
  - "Logistic regression"
  - "R"
  - "tidymodels"
  - "Quarto"
data_sources:
  - "Appointment scheduling extract, de-identified and aggregated to daily counts"
  - "Clinic operating-hours calendar"
  - "Published transit route and headway data"
skills:
  - "Data cleaning"
  - "Statistics"
  - "Visualization"
tags:
  - "access"
  - "scheduling"
  - "clinic operations"
dashboard_url: "https://example.org/dashboards/appointment-lead-time"
repo_url: "https://github.com/example-org/appointment-lead-time"
screenshots:
  - src: /catalog/appointment-lead-time/screenshots/01.png
    alt: "Bar chart of missed-appointment rate by booking lead time, rising from 9 percent within a week to 24 percent beyond four weeks."
resources:
  - label: "Final presentation (slides)"
    url: "https://example.org/cohorts/2026/appointment-lead-time-slides"
  - label: "Analysis write-up rendered from Quarto"
    url: "https://example-org.github.io/appointment-lead-time/report.html"
---

## The question

Our three community clinics carry a missed-appointment rate somewhere between 15% and 20%, depending on who you ask and which month they looked at. Scheduling staff had a strong hunch that appointments booked far in advance were the ones that fell through, but nobody had checked, and the reminder budget was about to be renewed on the strength of the hunch.

## What we did

We pulled 24 months of scheduling records, de-identified at source and aggregated so that no row described a person — each row is one appointment slot with its booking date, its appointment date, the clinic, the visit type, and whether it was kept. That gave us roughly 96,000 slots and one clean predictor to test: the number of days between booking and appointment.

We fit a logistic regression with lead time in four bands, controlling for clinic, visit type, day of week and month. The whole analysis is a single Quarto document, so the numbers in the write-up are the numbers the code produced.

## What we found

The gap is real and it is large. Appointments booked within seven days were missed 9% of the time; beyond four weeks the rate was 24%. Clinic and visit type mattered less than we expected, and day of week barely at all. The one surprise: same-week bookings made by phone and same-week bookings made online had almost identical kept rates, which quietly settled a separate argument about the online booking tool.

We were careful about what this does not say. Lead time is not a reason; it is a marker for whatever else is going on in someone's life over four weeks. Nothing here supports refusing a distant booking.

## What we would do next

Scheduling is testing a two-touch reminder on bookings over 21 days out, with the same measurement code re-run monthly from the repository. The next cohort could extend this by joining transit headway data properly — we only got as far as showing that the pattern is not explained by distance to the clinic.
