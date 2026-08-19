# When something has to come down

Three situations, in order of urgency. Start with the table, then do the section it points at.

| What happened | Take it off the site | Rewrite history | Tell someone |
|---|---|---|---|
| Wrong facts, dead link, stale entry | Yes | No | The submitter |
| Submitter withdraws consent | Yes | Only if they ask | The submitter |
| Personal, protected or credential data published | Yes, now | **Yes** | Your privacy or security officer, today |

## 1. Take it off the site

Five minutes, and it is the same step in all three cases.

Delete `catalog/<slug>/` — the whole folder, screenshots included — in a pull request, and merge
it. `Build & Deploy` republishes in a couple of minutes and the page, its images and its entry in
`/search.json` are gone.

There is no soft delete and no archive. Removing the folder is the only way to unpublish.

For everything except the third row, you are done. Tell the submitter what you removed and why.

## 2. If it was protected data, purge the history

Deleting the folder does not delete the file. The blob stays in git history and anyone with the
commit SHA can still fetch it — from `github.com/<owner>/<repo>/blob/<sha>/catalog/<slug>/…`, from
the API, from every fork and every clone. Someone who stops after step 1 will believe they have
remediated and will not have.

1. **Rotate first if a credential was exposed.** Assume it is compromised. Nothing below is faster
   than an attacker who already has the token.
2. **Purge the blob from history** with [git-filter-repo](https://github.com/newren/git-filter-repo)
   (a fresh clone, not your working checkout):

   ```sh
   git clone --mirror https://github.com/<owner>/<repo>.git
   cd <repo>.git
   git filter-repo --invert-paths --path catalog/<slug>/screenshots/01.png
   ```

   Name every affected path. `--path` takes a file or a directory prefix; `--invert-paths` means
   "everything except these".
3. **Force-push the rewritten history.** You will have to lift branch protection on `main` for the
   push and put it straight back. Every rewritten SHA is a new SHA, so open pull requests, forks
   and anyone's local clone are now built on commits that no longer exist — tell your collaborators
   to re-clone rather than pull.
4. **Ask GitHub Support to garbage-collect the unreachable objects.** Until they do, the *old*
   commit SHA still resolves on github.com even though nothing points at it. This is the step
   people skip, and it is the one that decides whether the file is actually gone.
5. **Deal with the forks.** Deleting your copy does not delete theirs. Find them under Insights →
   Forks, ask each owner to delete or re-clone, and note that you cannot force this.
6. **Check the caches.** Google's index (Search Console → Removals), the Internet Archive, and —
   the one that is easy to forget — **the GitHub issue the entry came from**. The submitter's
   original upload is still attached to that issue on GitHub's CDN, so the issue has to be deleted,
   not just closed. Deleting an issue is Settings on the issue → *Delete issue*, and needs admin
   rights.

## 3. Write it down

Add a line to whatever incident log your organization keeps — what was published, when, when it
came down, who was told.

Then change one thing so the same route closes. Usually that is a sentence in `submit.review_note`
in `_data/site.yml` (it is shown to every submitter before they submit), or a line on the review
checklist in [admin-guide.md](admin-guide.md).

## Preventing the common case

Screenshots are how protected data reaches a public catalog. Almost never the prose — the prose
gets read. The picture gets glanced at.

The single highest-value habit: **open every screenshot at full size before merging.** A 400px
thumbnail in a pull request hides exactly the small text that carries names, addresses, record
numbers and email addresses. Full size, or you did not check it.
