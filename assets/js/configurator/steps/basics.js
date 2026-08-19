/**
 * Step 2 — what the site is called, who runs it, and where its code lives.
 *
 * The first third of what used to be one Branding step (see ./look.js and
 * ./words.js for the other two). Nothing here paints a preview, so every
 * control is a plain `textField`.
 */

import { el } from '../dom.js';
import { textField } from '../wizard/controls.js';

/** @returns {{body: HTMLElement}} step 2 body — site/organization identity and the repository. */
export function renderBasics() {
  const body = el('div', { class: 'space-y-6' }, [
    el('fieldset', { class: 'space-y-4' }, [
      el('legend', { class: 'section-title', text: 'Site & organization' }),
      el('div', { class: 'grid gap-4 sm:grid-cols-2' }, [
        textField('siteName', 'Site name', { help: 'Shown in the header and browser tab.' }),
        textField('tagline', 'Tagline', { help: 'One short line under the site name.' }),
      ]),
      textField('description', 'Description', {
        textarea: true,
        help: 'Used for search engines and the RSS feed.',
      }),
      el('div', { class: 'grid gap-4 sm:grid-cols-2' }, [
        textField('orgName', 'Organization name'),
        textField('orgShort', 'Short name / initials', { help: 'Used in tight spaces.' }),
        textField('logoText', 'Logo text mark', { help: 'Shown when no logo image is set.' }),
        textField('logoImage', 'Logo image path', { help: 'Optional, e.g. /assets/images/logo.svg' }),
        textField('orgUrl', 'Organization website', { type: 'url' }),
        textField('contactEmail', 'Contact email', { type: 'email' }),
      ]),
    ]),
    el('fieldset', { class: 'space-y-4' }, [
      el('legend', { class: 'section-title', text: 'GitHub' }),
      el('div', { class: 'grid gap-4 sm:grid-cols-2' }, [
        textField('repository', 'Repository', {
          help: 'owner/repo — used for submission links and edit links.',
          placeholder: 'owner/repo',
        }),
        textField('branch', 'Branch', { help: 'The branch GitHub Pages builds from.' }),
      ]),
    ]),
  ]);
  return { body };
}
