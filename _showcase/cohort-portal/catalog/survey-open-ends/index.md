---
layout: entry
render_with_liquid: false
title: "Reading 1,800 survey comments without reading 1,800 comments"
slug: survey-open-ends
summary: "Coded two years of open-ended community survey answers into a small set of themes, and published the codebook so the next survey can be compared with this one."
published: 2025-09-30
sample: true
finding: "Three themes covered 71% of comments; cost was named twice as often as opening hours"
cohort: "2025"
area: "Community Programs"
track: "Data Storytelling"
members:
  - "Community engagement specialist"
  - "Evaluation analyst"
  - "Program coordinator, family services"
coach_name: "Evaluation lead (program coach)"
coach_email: "coach.storytelling@example.org"
methods:
  - "Qualitative coding"
  - "Python"
  - "scikit-learn"
  - "Inter-rater reliability"
data_sources:
  - "Community needs survey, open-ended responses only"
  - "Previous year's qualitative codebook"
  - "Program service categories reference list"
skills:
  - "Data cleaning"
  - "Stakeholder interviews"
  - "Visualization"
tags:
  - "survey"
  - "community engagement"
  - "qualitative"
repo_url: "https://github.com/example-org/survey-open-ends"
resources:
  - label: "Published codebook, version 2"
    url: "https://example.org/cohorts/2025/survey-codebook-v2"
  - label: "Reporting template for programme teams"
    url: "https://example.org/cohorts/2025/survey-reporting-template"
---

## The question

The annual community needs survey ends with one open box, and roughly 1,800 people write something in it. Every year the comments were skimmed by whoever had time, three quotes were pulled for the report, and the rest were archived. Nobody could say whether this year's concerns differed from last year's, because nothing had ever been counted.

## What we did

We coded by hand first, deliberately. Two of us independently coded a random 300 comments against a draft scheme, compared, argued, and revised — three rounds until agreement was acceptable. Only then did we train a classifier on the coded set to label the remaining comments, and we hand-checked a further sample of its output.

The classifier is ordinary and unglamorous: TF-IDF features and a linear model. It exists to save reading time, not to have an opinion. Anything it labelled with low confidence went back into the manual pile, which was about one comment in six.

## What we found

Three themes — cost, getting there, and knowing the service exists — covered 71% of comments. Cost was named roughly twice as often as opening hours, which had been the assumed top concern and had shaped the previous year's action plan.

Comparing against the prior year's codebook was possible for the first time and showed one clear movement: "knowing the service exists" grew by about a third, concentrated in comments from people who said they were new to the area.

## What we learned

The classifier was the easy half. The hard, valuable half was the codebook: writing down what each theme includes and, more usefully, what it excludes, with two example comments for each. That document is what makes next year comparable, and it would have been worth producing even if we had never automated anything.

We also learned to keep the quotes. A count tells a manager how many; a sentence in someone's own words is what moves them.

## What happens next

The codebook and the coding script are used for the current survey round, and the reporting template asks each programme team to respond to their own top theme rather than to the organisation-wide ranking.
