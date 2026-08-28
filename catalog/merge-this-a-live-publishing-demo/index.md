---
layout: entry
render_with_liquid: false
title: "Merge this — a live publishing demo"
slug: merge-this-a-live-publishing-demo
published: "2026-08-27"
featured: false
thumbnail: ""
organization: Big Cities Health Coalition (prototype demo)
solution_type: Source code
use_case_category: Administrative & task automation
area:
  - Data & informatics
  - Staff & partner coordination
stage: Pilot
summary: "This entry was submitted through the catalog's own public web form and merged live during the August 27 work-group walkthrough. It documents the catalog itself: a GitHub-hosted, open-source template where use cases arrive as web-form submissions, get reviewed as pull requests, and publish as pages — no server, no database, no hosting cost."
impact: "Filed as a web form, reviewed as a pull request, published with one click — during the meeting"
review_status: Reviewed & approved
ai_role: AI was used to build it
ai_types:
  - Generative text (LLM)
  - Agents & automation
ai_tools:
  - Claude Code
  - Codex
  - GitHub Actions
platform:
  - Vendor / SaaS hosted
vendor: "GitHub (Pages + Actions)"
expertise: Power user
readiness:
  - Ready to deploy
  - Guided setup
  - Human review built in
repo_url: "https://github.com/crypticpy/phct"
demo_url: "https://crypticpy.github.io/bchc-ai-use-case-catalog/"
docs_url: "https://github.com/crypticpy/phct/blob/main/docs/admin-guide.md"
resources: []
screenshots: []
deck_pdf: "/catalog/merge-this-a-live-publishing-demo/deck.pdf"
license: MIT
access_terms: ""
portability: "Partially — with rework"
portability_notes: The site itself is plain Jekyll and builds anywhere. The submission and review automation is written for GitHub Actions, so moving to another platform would mean rebuilding that layer.
reused_from: []
cost_band: No new spend
run_cost: No ongoing cost
procurement:
  - No procurement needed
approvals:
  - Not yet reviewed
equity_note: The catalog publishes only what contributors submit about their own projects. Every submission is reviewed by a person before it appears, and nothing on the site identifies anyone beyond the contact a submitter chooses to list.
no_pii_attestation: true
data_sensitivity:
  - Public data only
data_sources:
  - Use case submissions filed through the public web form
  - The repository's own issues and pull requests
audience: Public-facing
data_governance_notes: "Everything in this repository is public the moment it is merged. The review step exists to catch anything that should not be published — reviewer guidance lives in the admin guide."
contact_name: Catalog Maintainer
contact_title: Prototype demo
contact_email: "catalog-demo@example.org"
---

If you are reading this on the live site, the merge button worked.

This submission was filed through the same web form any contributor would use, at the catalog's Submit page. A GitHub workflow read the form, checked it against the content model, and opened a pull request nobody had to write by hand. The pull request sat in the queue with the automated checks green, waiting for a person to look it over. During the demo, a maintainer clicked Approve, then Merge — and a few minutes later this page existed.

That is the whole publishing path. No code was written, no server was configured, and nothing appeared on the site before a person reviewed it. The entry stays in the catalog as a worked example of the workflow it describes; if the work group would rather not keep it, deleting it is a pull request too.
