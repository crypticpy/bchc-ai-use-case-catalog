# Staying up to date with the template

Your catalog is a fork of a template that keeps moving. New releases fix layout bugs, harden the
submission workflows, and add features you did not have when you launched. None of that reaches
you automatically — a fork is a copy, not a subscription.

This is how to pull a release in without losing your own site.

## The split

One repository, two kinds of file:

| | Files | On upgrade |
|---|---|---|
| **Template code** | `_layouts/`, `_includes/`, `_plugins/`, `assets/` (except `assets/images/`), `scripts/`, `test/`, `.github/workflows/`, `quality/`, `docs/`, `package.json`, `Gemfile` | Take the template's version. |
| **Yours** | `_config.yml`, `_data/*.yml`, `_data/metrics.json`, `catalog/`, `cohorts/`, `events/`, `resources/`, `about/`, `assets/images/`, `README.md`, `CNAME` | Keep yours. The template's copies are the demo's. |
| **The template's own** | `_showcase/`, `_data/showcase.yml`, `assets/images/showcase/` | The landing page and example sites the template publishes about itself. Nothing in your build reads them (they are only built while `demo` is `true`), so if `npm run eject:samples` removed them, delete whatever a merge brings back. |
| **Generated** | `.github/ISSUE_TEMPLATE/new-entry.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `assets/js/configurator/defaults.generated.js` | Keep yours, then `npm run generate` — they are built from *your* `_data/`. |

That split lives in [`.gitattributes`](../.gitattributes), which marks every file in the **Yours** and
**Generated** rows `merge=ours`. Git then keeps your version of those files during a merge, without a
conflict, while merging the template's changes into everything else.

## One-time setup

```sh
git remote add template https://github.com/crypticpy/bchc-template.git
git config merge.ours.driver true
```

**Both lines matter.** `merge=ours` in `.gitattributes` does nothing until `merge.ours.driver`
exists in the clone — git refuses to run a merge driver a repository has not opted into. Skip the
second line and the rules are silently inert: you get an ordinary conflict in every file you own,
and if you resolve one the wrong way you have quietly reverted your site to the demo's settings.

The setting is per clone. Anyone else who will run upgrades needs it too.

## Each release

```sh
git fetch template --tags
npm run upgrade:check
```

`upgrade:check` is read-only. It compares the version in your `package.json` against the template's
latest and prints the incoming diff in two lists — what you will take, and what you own and will
keep — plus a reminder if the merge driver is missing. Nothing is fetched, merged or written by it.

To look further ahead, or back:

```sh
npm run upgrade:check -- --from v1.2.0 --to v1.3.0
```

Then:

```sh
git checkout -b upgrade-template
git merge template/main
```

If your repository was created with **Use this template**, it shares no history with the template
and git will refuse the first merge. Say so once:

```sh
git merge template/main --allow-unrelated-histories
```

Expect conflicts in template code you have edited yourself — that is the point of the exercise, and
the resolution is usually "take the template's and re-apply my change on top". You should *not* see
conflicts in `_data/` or `catalog/`; if you do, `merge.ours.driver` is not set.

Finish with the same gates CI runs:

```sh
npm ci
npm run generate      # rebuilds the issue form and wizard defaults from YOUR _data/
npm run validate
npm test
npm run build:css && bundle exec jekyll build
```

Push the branch, let the checks run, and merge. The deploy is the same one your content uses.

## What the merge cannot do for you

`merge=ours` protects your files; it cannot adopt a change the template made *inside* one.

- **New schema field types or options.** `_data/schema.yml` is yours, so a new field type the
  release added is available but unused. Read the release notes, then add it with the field editor
  at `/setup/`, the [Apply setup issue](launch.md#3-configure-the-site), or by hand — followed by
  `npm run generate`.
- **New `_data/site.yml` keys.** Same story: a new copy block is empty and a new module's header
  and footer links stay hidden until you add the key — but the module's *pages* are only removed
  from the build by an explicit `<module>: false`, so add that line for a module you are not ready
  to show. `docs/configuration.md` lists every key with its default.
- **Renamed template files.** If a release moves `_includes/foo.html` to `_includes/bar.html` and
  you referenced the old name in your own content, the merge succeeds and the build fails. That is
  what `bundle exec jekyll build` above is for.

## Deciding whether to upgrade at all

You do not have to. A fork that never merges again keeps working — it is a static site with no
runtime dependencies, and GitHub Pages will keep serving it.

Upgrade when the release notes name something you want, and always read
[`CHANGELOG.md`](../CHANGELOG.md) first:

```sh
git log --oneline v1.2.0..template/main -- CHANGELOG.md
```

## If it goes wrong

Nothing here touches your published site until you merge the upgrade branch into your default
branch, so the whole thing is disposable:

```sh
git merge --abort                 # mid-merge
git checkout main && git branch -D upgrade-template   # after
```

If you already merged and deployed, revert the merge commit — the deploy re-runs from the reverted
state:

```sh
git revert -m 1 <merge commit>
```
