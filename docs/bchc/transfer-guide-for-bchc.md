# Taking ownership of the AI Use Case Catalog: a step-by-step guide for BCHC

This guide is for the Big Cities Health Coalition staff taking ownership of the AI Use Case
Catalog. It assumes you have never used GitHub. You will not write code, install anything, or use
a command line. Everything here happens in a web browser, and all of it takes about 30 minutes.

Your technical maintainer (GitHub username **`crypticpy`**) does the technical work and stays on to
look after the catalog. Your part is to create BCHC's home on GitHub, let the maintainer in, and
answer a few questions.

(The maintainer's own technical checklist for the same move is
[`transfer-runbook.md`](transfer-runbook.md). You do not need to read it.)

## What is happening, in plain English

- **GitHub** is the website where the catalog's files live. Every time those files change, GitHub
  rebuilds the public catalog site automatically.
- A **repository** (or "repo") is one project's folder on GitHub. The catalog is one repository.
- An **organization** is a shared GitHub account that belongs to BCHC rather than to one person.
  People join it with their own personal accounts.
- Today the catalog lives under the maintainer's personal account. We are **moving** it into a
  BCHC organization, so BCHC owns it outright. Nothing is lost in the move: every file, every past
  submission, and the full history come along.

**What changes for you:** the catalog's web address. It goes from
`crypticpy.github.io/bchc-ai-use-case-catalog` to an address with BCHC's organization name in it
(or to your own address, such as `catalog.bigcitieshealth.org`, if you choose one; see question 5
below). The old address will not forward, so any links you have already shared will need
updating.

**What does not change:** how the site looks, how people submit use cases, and who keeps it
running day to day.

## Part 1: Set up BCHC on GitHub (about 20 minutes)

One person at BCHC does steps 1 to 5. If a second BCHC person will also be an owner (recommended),
they do steps 1 and 2 on their own computer too.

### Step 1: Create your personal GitHub account

Skip this if you already have one.

1. Go to **github.com** and click **Sign up**.
2. Use your **BCHC work email**.
3. Pick a **username**. It is public and appears next to everything you do, so choose something
   professional, such as `jsmith-bchc`.
4. Follow the prompts to verify your email. If asked about a paid plan, choose **Free**.

### Step 2: Turn on two-step sign-in

GitHub requires this for anyone who manages a repository, and it protects BCHC's account.

1. Click your **profile picture** (top right) → **Settings**.
2. In the left menu, click **Password and authentication**.
3. Click **Enable two-factor authentication**.
4. Choose **Authenticator app** and scan the code with an app on your phone (Microsoft
   Authenticator, Google Authenticator, 1Password, or similar).
5. GitHub shows you **recovery codes**. Download them and keep them somewhere safe that is not
   your email, such as your organization's password manager. If you lose your phone, these codes
   are the only way back in.

### Step 3: Create the BCHC organization

**If BCHC already has a GitHub organization, skip this step** and go to question 1 in Part 2.

1. Click the **+** (top right, next to your picture) → **New organization**.
2. Choose the **Free** plan.
3. **Organization name:** this becomes part of the web address, so keep it short and clear, such
   as `bigcitieshealth`. Lowercase letters and hyphens work best.
4. **Contact email:** a BCHC address that will outlast any one person, if you have one.
5. **This organization belongs to:** choose **A business or institution** and enter
   **Big Cities Health Coalition**.
6. Accept the terms and click **Next**. If it offers to add members, click **Skip this step**. You
   will do that next.

### Step 4: Add a second BCHC owner (recommended)

If only one person can get into the organization and that person leaves or loses their phone,
BCHC could be locked out of its own account. A second owner prevents that.

1. On the organization's page, click the **People** tab.
2. Click **Invite member**, type the second person's GitHub username, and choose the role
   **Owner**.
3. Click **Send invitation**. They accept it from the email GitHub sends them.

### Step 5: Invite the technical maintainer

1. Still on the **People** tab, click **Invite member**.
2. Type **`crypticpy`** and choose the role **Owner**.
3. Click **Send invitation**.

**Why Owner?** Owner lets the maintainer adjust the organization's settings and move the catalog
in without walking you through a long list of technical screens. It is temporary: when the move is
finished, the maintainer will tell you, and you lower the role to Member (Part 4, step 4). The
maintainer keeps full control of the catalog itself, but not of the rest of your organization.

## Part 2: Send these answers to your maintainer

Copy this list into an email, fill it in, and send it. Anything you don't know yet can say
"not sure"; only questions 1 and 2 are needed on the day.

1. **Organization name**, exactly as it appears in the web address `github.com/________`:
2. **GitHub usernames of every BCHC owner:**
3. **Product owner:** the person who decides what belongs in the catalog and signs off on new
   entries. Their name and GitHub username:
4. **Backup person:** someone who can step in if the product owner is away (or "not yet"):
5. **Your own web address?** Would you like the catalog at an address on your own website, such
   as `catalog.bigcitieshealth.org`? (yes / no / not sure) This is recommended, because the address
   then never has to change again, even if the catalog moves in future.
6. **Who manages BCHC's website domain?** If you answered yes to question 5, the name and email
   of the person or vendor who can add a record to your domain settings (often IT or your web
   hosting company). The maintainer will send them the exact record to add.
7. **Only if BCHC already had an organization before today:** do you sign in to GitHub through a
   BCHC company login (your Microsoft or Google work sign-in) rather than a GitHub password?
   (yes / no) If yes, tell the maintainer before the meeting, as the plan changes.

## Part 3: The move (the maintainer does this; you can watch)

Once the invitation is accepted, the maintainer:

1. Checks the new organization's settings and adjusts the few that the catalog needs.
2. Moves the catalog into the BCHC organization. This takes seconds.
3. Brings the site back up at its new address. **The site is offline for a few minutes** between
   the move and this step.
4. Updates the catalog's own links to point at the new home, and reconnects the automatic
   template updates.

The only thing that might need a BCHC click is a request to approve an **access token** (a kind of
limited key that lets the catalog receive template updates automatically). If GitHub emails you
about a pending token request from `crypticpy` for the catalog, open it and click **Approve**. The
maintainer will tell you if this applies.

## Part 4: Your first look around (about 15 minutes, after the move)

### Step 1: Visit the site and the repository

- The **site** is what the public sees. The maintainer will send you its new address.
- The **repository** is the behind-the-scenes view, at
  `github.com/<your organization name>/bchc-ai-use-case-catalog`. Bookmark it.

### Step 2: Learn the three tabs you will use

Along the top of the repository page:

| Tab | What it is | What you do there |
|---|---|---|
| **Issues** | The inbox. Every new use-case submission arrives here as an "issue". | Read new submissions. |
| **Pull requests** | Proposed changes to the site, waiting for a yes. The automation turns each submission into one of these. | Review and approve entries. The maintainer will show you how the first few times. |
| **Actions** | The robot that builds the site and runs checks. | Nothing, usually. A green check means all is well. A red X means something failed: send the maintainer the link. |

You do not need the **Code** tab. That is where the files live, and the maintainer looks after it.

### Step 3: Get emails when something arrives

1. On the repository page, click **Watch** (top right).
2. Choose **Custom**, tick **Issues** and **Pull requests**, and click **Apply**.

You will now get an email for each new submission and each entry waiting for review.

### Step 4: Lower the maintainer's organization role

**Only when the maintainer tells you the move is finished.** By then the maintainer will have
full access to the catalog itself, so this does not take anything away that is needed.

1. Go to your organization's **People** tab.
2. Find **`crypticpy`**, click the **⋯** menu next to the name, and choose **Change role**.
3. Choose **Member** and confirm.

### Step 5 (optional): Try a practice submission

With the maintainer on the call:

1. On the catalog site, click **Submit** and fill in a made-up entry. Put **TEST** in the title.
2. Watch it appear under **Issues**, and a minute or two later under **Pull requests**.
3. The maintainer shows you what the review looks like, then closes the test without publishing
   it.

This is exactly what happens every time a real health department submits a use case.

## Common questions

**Should we make our own copy of the catalog first, to get to know it?**
No. A copy would be a separate, disconnected catalog, and it would take the name the real one
needs, which blocks the move. The catalog is public today, so you can look around the current site
and repository before the move, and after the move you learn it hands-on with the real thing and
with the maintainer's help.

**Can we break something?**
Very hard to. Nothing reaches the public site until someone approves a change, every change is
recorded and can be undone, and automatic checks stop most mistakes before they get that far. If
something looks wrong, send the maintainer the link and leave it.

**What does this cost?**
Nothing. The catalog runs entirely on GitHub's free plan for public projects.

**Who can see what?**
The catalog and its repository are public, as they are today: anyone can read them and submit a
use case. Only people you give access to can approve changes or change settings.

**What if we change our minds?**
The move can be reversed. The maintainer can move the catalog back.
