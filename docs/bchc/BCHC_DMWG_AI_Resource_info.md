
Big Cities Health Coalition — Data Modernization Work Group
GOVERNANCE FRAMEWORK
AI Resource-Sharing Repository: Submission Template, Review Process, and Platform Model
Companion document to the BCHC/DMWG AI Resource Sharing Proposal — Draft for DMWG and partner review
Purpose
This framework operationalizes the resource-sharing model outlined in the BCHC/DMWG AI Resource Sharing Proposal. It defines (1) the standard template member jurisdictions use to submit a resource, (2) the review process that validates a submission before it is published, (3) a working example of how the repository could look and how it would interact with GitHub, and (4) the additional governance elements — roles, licensing, data handling, accessibility, and maintenance — needed for the repository to function as a trusted, sustainable coalition asset rather than an unmoderated list.

1. Resource Submission Template
   Every resource entering the repository — whether code, an application, a dataset, a prompt library, a governance document, or an implementation guide — is described using the same structured template. A consistent template is what makes the repository searchable and comparable across 35+ jurisdictions with different technical environments.
   Field
   What the Submitter Provides
   Resource name
   Short, descriptive title of the resource.
   Resource type
   Code / script, application or tool, dataset, dashboard, prompt library, governance or policy document, implementation guide / playbook, training material, or other (specify).
   What it does
   Plain-language description of the problem it solves and how it is used (2–4 sentences).
   Use case category
   Administrative & task automation / Communications, media & writing / Coding & brainstorming / Operations & logistics (per the HHS-adapted categories in the DMWG inventory).
   Technology it is built on
   Platform(s), language(s), and vendor stack (e.g., Microsoft Copilot Studio, AWS Bedrock, Google Vertex AI, Python, Power BI, custom LLM prompt set, etc.).
   Open source?
   Yes / No. If yes, license type (e.g., MIT, Apache 2.0, CC-BY) and repository link. If no, terms under which peer jurisdictions may request access.
   Platform-agnostic?
   Yes / No / Partially. Notes on whether the resource can be adapted outside its original vendor ecosystem (e.g., Microsoft-built but portable to AWS).
   Review status
   Not yet reviewed / Under review / Reviewed & approved / Revisions requested / Deprecated — set by the review committee, not the submitter (see Section 2).
   Stage of development
   Concept / Pilot / Deployed in production / Retired.
   Submitting jurisdiction
   Health department and city/county submitting the resource.
   Contact person
   Name, title, and email of the person peer jurisdictions should reach out to with questions.
   Data sensitivity notes
   Confirmation that no PII/PHI is included in the shared resource or documentation, and any data-governance caveats a reusing jurisdiction should know about.
   Link(s)
   Repository URL, documentation, demo, or point of access.
   Date submitted / updated
   Auto-populated on submission and on each subsequent update.

This template maps directly onto a GitHub Issue Form (a structured, fillable form GitHub renders for new issues), so a jurisdiction fills out the same fields whether they think of it as "submitting a resource" or "opening a GitHub issue." See Section 3 for how this works in practice.
2. Review Process
A submission is not published to the repository automatically. It moves through a lightweight but consistent review so that member jurisdictions can trust that anything listed has been checked for completeness, basic security/privacy hygiene, and accuracy — without creating a bottleneck that discourages sharing.
2.1 Who Reviews
Tier 1 — DMWG Intake Team. A small rotating group of DMWG members (2–3 people) handles first-pass triage: confirming the template is complete, the contact is reachable, and there is no obvious PII/PHI exposure.
Tier 2 — Governance Committee. A standing BCHC AI Resource Governance Committee, made up of DMWG representatives across member jurisdictions, conducts substantive review: does the resource work as described, is the technology/licensing information accurate, does it fit an existing category, and does it meet the coalition's data-governance baseline.
Tier 3 — National Association Partner (optional, recommended). BCHC could route higher-visibility or higher-risk submissions (e.g., anything touching identifiable data, clinical decision support, or public-facing tools) through a neutral third-party reviewer — a national association such as the Public Health Foundation (PHF), NACCHO, ASTHO, or CDC's informatics programs — to add credibility and an outside check, similar to how JPHIT-affiliated efforts already lean on PHF as an implementation partner.
2.2 Review Workflow
Submit. Jurisdiction completes the template (Section 1) via the GitHub Issue Form or an equivalent web form.
Intake triage (Tier 1). DMWG intake team confirms completeness and flags any obvious data-governance concerns within ~5 business days.
Substantive review (Tier 2). Governance Committee evaluates functionality, technology/licensing accuracy, category fit, and reuse readiness within ~10 business days. Committee may request revisions, ask clarifying questions, or escalate to Tier 3.
Decision. Approved → published to the repository with status "Reviewed & approved." Needs revision → returned to submitter with specific feedback. Declined → submitter notified with rationale (rare; reserved for resources that fail data-governance or accuracy checks).
Publish. Approved entries are merged into the repository (a GitHub pull request, in practice) and appear on the public-facing gallery.
Maintain. Each entry is revisited annually (or when flagged by a user) to confirm the contact is still valid, the resource is still active, and the stage of development is current; stale entries are marked "Deprecated" rather than silently removed.
2.3 Review Criteria
Completeness — all required template fields are filled in
Accuracy — technology, licensing, and open-source/agnostic claims are correct
Data governance — no PII/PHI in the resource or its documentation; sensitivity notes are honest and complete
Reuse readiness — enough detail (docs, contact, links) that another jurisdiction could realistically evaluate or adopt it
Category fit — correctly placed in one of the four DMWG use-case categories
3. Example of How the Repository Could Look and Interact with GitHub
A useful working reference is the City of Austin's DIVE Data Learning Cohorts Portal, built as a free GitHub Pages site backed by a GitHub repository:
https://crypticpy.github.io/dive-portal/
The portal demonstrates a pattern the BCHC repository could adopt directly:
Public gallery, no login required. The homepage shows a browsable, filterable gallery of submitted projects (by department, track, and tags) — the BCHC equivalent would filter by jurisdiction, use-case category, technology stack, and review status.
“Submit Project” button opens a GitHub Issue Form. Rather than emailing a spreadsheet around, contributors click a button that opens a pre-built, structured GitHub issue template — this is the direct technical implementation of the submission template in Section 1. Each field in the template (resource type, technology, contact, etc.) becomes a field in the issue form.
Review happens as normal GitHub issue/PR activity. A submitted issue is visible to reviewers, who can comment, request changes, or approve it. Once approved, the entry is converted into a published page (a pull request merge), which is exactly the Tier 1 → Tier 2 → Publish workflow in Section 2.
Individual detail pages per resource. Each submission gets its own page summarizing what it does, the technology used, tags, and links — comparable to the per-team pages in the DIVE portal.
Program policies published on the site itself. The DIVE portal lists its ground rules directly on the page (e.g., no PII, accessibility standards, communications approval) — the BCHC repository could surface its own governance rules (Section 4) the same way, so they're visible to anyone browsing, not buried in a separate PDF.
Low cost, low maintenance. GitHub Pages hosting is free, version-controlled, and does not require a procurement cycle or ongoing hosting budget — relevant given this repository is being scoped as a coalition-wide, member-funded (or vendor-supported) effort rather than a large IT project.
This is offered as a model to react to, not a final technical decision — DMWG and any vendor partner (Microsoft, AWS, or Google) would still need to confirm hosting, authentication for submissions, and long-term maintenance ownership.
4. Additional Governance Elements
Beyond the template, review process, and platform model, a governance document of this kind typically also needs to address the following so the repository remains trustworthy and sustainable over time.
4.1 Roles & Responsibilities
Governance Committee — sets policy, resolves disputes, approves changes to the template or categories
DMWG Intake Team — first-line triage of new submissions
BCHC staff lead — administers the repository, coordinates committee scheduling, maintains vendor/partner relationships
Submitting jurisdiction — keeps its own entries accurate and responds to reuse inquiries
4.2 Licensing & Intellectual Property
Default expectation that shared resources use a permissive open-source license (e.g., MIT, Apache 2.0) where possible
Process for jurisdictions to share non-open-source resources under more limited terms (e.g., available on request, government-to-government only)
Clear statement that submitting a resource does not transfer ownership — the originating jurisdiction retains authorship credit
4.3 Data Governance & Privacy
No PII or PHI may appear in a submitted resource, its documentation, or example data/screenshots
Submitters attest to this at the time of submission; reviewers spot-check during Tier 1/Tier 2 review
A defined process for removing a resource quickly if a privacy or security issue is discovered post-publication
4.4 Accessibility & Quality Standards
Published pages meet WCAG 2.1 AA accessibility standards, consistent with practices already used in comparable municipal portals
Minimum documentation bar (a resource with no working link or contact is not published)
4.5 Maintenance, Versioning & Deprecation
Annual review cycle for every published entry to confirm it is still active and accurate
A "Deprecated" status (rather than deletion) so the repository retains institutional history
Version history retained automatically through GitHub's native change tracking
4.6 Sustainability & Funding
Defines who is responsible for platform hosting, committee coordination, and ongoing maintenance if a vendor partner's initial support (grant, in-kind hosting, technical advisory) is time-limited
Identifies whether a national association (e.g., PHF) should serve as a longer-term institutional home for continuity beyond any single grant cycle
4.7 Onboarding & Communication
A short onboarding guide for jurisdictions new to the repository (how to submit, what review to expect, how to search existing entries before building something new)
Regular promotion of new/updated resources through existing DMWG and BCHC communication channels
4.8 Dispute Resolution & Code of Conduct
Process for handling disagreements about review decisions (e.g., appeal to the full Governance Committee)
A brief code of conduct for how member jurisdictions engage with and provide feedback on one another's shared resources
4.9 Success Metrics
Number of resources submitted and published per quarter
Number of jurisdictions actively contributing vs. only browsing
Documented instances of a jurisdiction reusing another's resource (time/cost saved)
Review turnaround time against the targets in Section 2.2
