<!--
Entry submissions get their own generated checklist — this template is for
pull requests a person opens by hand (template changes, docs, fixes).
-->

## What this changes

<!-- One or two sentences. Link the issue with "Closes #123" if there is one. -->

## Checklist

- [ ] `npm run validate` passes locally (data files, front matter, file sizes)
- [ ] `npm test` and `npm run test:ruby` pass
- [ ] Schema changes were followed by `npm run generate`, and the regenerated
      `.github/ISSUE_TEMPLATE/new-entry.yml` is committed here
- [ ] No field key is hardcoded outside `_data/schema.yml`
- [ ] New or changed UI keeps a visible focus ring, a programmatic label on
      every input, and text alternatives for icons
- [ ] Screenshots below for anything that changes what a page looks like
