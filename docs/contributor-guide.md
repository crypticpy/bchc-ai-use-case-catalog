# Contributor guide

For someone at a member organization who has something worth sharing — a tool, a script, a
prompt set, a dashboard, a policy, a playbook — and wants to know what submitting it
involves, what the review will ask, and what happens after. It is written for a
submitter; the maintainer's side is [admin-guide.md](admin-guide.md), and the rules
themselves are on the site's **Governance** page.

Ten minutes to read, about twenty to submit.

## Before you build: search first

The whole point of the catalog is that another organization may already have solved
your problem. Before you build, and certainly before you submit, spend five minutes
here:

1. **Search** from the home page or the catalog page. Search reads titles, summaries,
   tools, areas and the write-up itself, and knows a few synonyms — "chatbot" finds
   "assistant" — but not every phrasing. Try two or three.
2. **Filter** by the things that matter to you: what is being shared, use case
   category, the area of work, the tools it is built on, and how ready it is to reuse.
3. **Compare** up to three entries side by side (the *Compare* control on each card)
   when you have a shortlist; the differences fold out, the agreements fold away.
4. **Ask** the contact on any entry that is close. Every entry has a person's name and
   a mail link with the subject already written, and an *Ask in the open* link that
   starts a public discussion so the answer helps the next person too.

If you find something you can reuse, reuse it — and when you publish your own entry,
say so in the write-up. Credit is how the catalog knows what it is worth.

## What you will be asked

The submission form asks the same questions whether you use the site's **Submit** page
or open a GitHub issue directly; the web form is friendlier and remembers your draft in
your browser. In outline (the exact fields are in the form and in
[content-model.md](content-model.md)):

| Step | You will need |
|---|---|
| **About** | A title, a one-sentence summary, the result in one line, your organization, what is being shared, the use case category, the area of work and the stage it is at. |
| **How it's built** | How AI is involved, the types of AI, the tools and models, where it runs, and any vendor. |
| **Reuse** | The skills needed to set it up, how ready it is, and links: source code, a demo, documentation, other resources, screenshots, a slide deck. |
| **Sharing & licensing** | The license, the access terms if it is not open, whether it is portable outside your stack, the caveats — and, if you started from another entry in this catalog, its slug under *Adapted from*, so that entry can say it was adopted by yours. |
| **What it took** | Cost band, running cost, procurement route, approvals, and any equity note. None of these is required. |
| **Data & access** | Your attestation that no personal or protected health information is in anything you share, what data it touches, where the data comes from, who sees the output, and any governance notes. |
| **Contact** | The name, title and email of the person peers should write to. |
| **The story** | The write-up: what problem, what you did, what happened, what you would do differently. |

Three things reviewers will look at hardest, so worth getting right the first time:

- **The links.** A resource with no working link and no reachable contact is not
  published, because nobody could evaluate or adopt it. Test every link before you
  submit; internal SharePoint links that only your organization can open count as
  "access on request", not as documentation.
- **The attestation.** Ticking *No PII/PHI in the shared material* is a statement in
  your name that nothing in the write-up, links, example data or screenshots is
  personal or protected. Reviewers spot-check. If you are not sure, redact first —
  screenshots are the usual culprit.
- **The claims.** *Open source*, *portable*, *in production* — say what is true, and
  put the caveats in the notes fields. A reviewer who finds a claim does not hold up
  will ask for revisions, which is slower for everyone than an honest "partially".

**You keep ownership.** Submitting an entry does not transfer anything. The catalog
points at your work and describes it; your organization keeps authorship and credit,
and chooses the license.

## What review looks like

Nothing is published automatically. Once you press *Submit new issue* on GitHub:

1. **Automation** turns your answers into a draft page and opens a pull request within
   a couple of minutes. You will see a comment on your issue linking to it. If
   something was missing or malformed, the comment says exactly what and how to fix
   it — usually by editing the issue.
2. **Intake** (a small rotating group) checks that the entry is complete, the contact
   is reachable, and there is nothing that looks like personal or protected data —
   within about five business days. They may ask a question on the pull request; you
   will be @-mentioned.
3. **The Governance Committee** reviews it substantively — does it work as described,
   are the technology, licensing and portability claims accurate, is it in the right
   category, does it meet the data-governance baseline — within about ten more business
   days. Entries that touch identifiable data, clinical decision support or the public
   may go to a partner reviewer as well.
4. **Decision.** *Approved* — the entry is merged and live within minutes, marked
   *Reviewed & approved*. *Revisions requested* — you get specific feedback on the pull
   request; edit the issue or reply, and it comes back round. *Declined* — rare, always
   with a rationale, and you can appeal to the full committee.

You can watch all of it: the issue and the pull request are public, and every comment
is on the record. If two weeks pass with no movement, reply on the issue — a nudge is
welcome, not rude.

## After it is live

- **Your entry has a page** with its own URL, a place in the catalog and the search
  index, and a *Suggest an edit* link at the bottom for anyone who spots an error.
- **Keep it true.** When the tool changes, the contact moves on, or the stage changes,
  use *Suggest an edit* or reply on the original issue. Small edits are merged
  quickly.
- **Expect an annual check.** Once a year (or sooner if a reader flags it) someone will
  confirm with your contact that the entry is still current. An entry that has gone a
  year without confirmation is marked on the site; nothing is hidden.
- **Deprecation, not deletion.** If the resource is retired, the entry is marked
  *Deprecated* and kept for the record — what was tried, by whom, and what it cost is
  worth keeping. Only duplicates, withdrawn consent and things that should never have
  been merged are removed.
- **Answer the mail.** Peers will write to the contact. That is the whole idea.

## If something goes wrong

- A screenshot with a real person's details, a credential in a link, anything that
  should not be public: email the maintainers (address in the site footer) and it is
  taken down first and discussed second.
- Disagree with a review decision: reply on the pull request, or email the maintainers
  and ask for the appeal to go to the full Governance Committee.
- Something on the site does not work for you — keyboard, screen reader, zoom, colour:
  tell the maintainers; it is treated as a defect.

The [code of conduct](../CODE_OF_CONDUCT.md) is short and applies throughout.
