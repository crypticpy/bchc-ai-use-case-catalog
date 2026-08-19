/**
 * Step 4 — the copy on the home page, the submission page and the footer.
 *
 * The last third of what used to be one Branding step. The live preview on the
 * Look step echoes the hero copy written here; it reads the answers when that
 * step renders, so nothing on this step has to repaint it.
 */

import { el } from '../dom.js';
import { textField } from '../wizard/controls.js';

/** @returns {{body: HTMLElement}} step 4 body — home page, submission page and footer copy. */
export function renderWords() {
  const body = el('div', { class: 'space-y-6' }, [
    el('fieldset', { class: 'space-y-4' }, [
      el('legend', { class: 'section-title', text: 'Home page' }),
      textField('heroEyebrow', 'Eyebrow', { help: 'Small line above the headline.' }),
      textField('heroTitle', 'Headline'),
      textField('heroLead', 'Lead paragraph', { textarea: true }),
    ]),
    el('fieldset', { class: 'space-y-4' }, [
      el('legend', { class: 'section-title', text: 'Submission page' }),
      textField('submitIntro', 'Submission page intro', { textarea: true }),
      textField('submitTurnaround', 'What happens after someone submits', {
        help: 'The last step of "what happens next" on the submission page. Promise a turnaround you can keep.',
        placeholder: 'A maintainer reviews it, usually within two weeks.',
      }),
      textField('submitReviewNote', 'Submission safety note', {
        textarea: true,
        help: 'The warning beside the submission form and at the top of the GitHub issue form — say what your organization must not receive.',
      }),
    ]),
    el('fieldset', { class: 'space-y-4' }, [
      el('legend', { class: 'section-title', text: 'Footer' }),
      textField('footerAbout', 'Footer about', { textarea: true }),
      textField('copyright', 'Copyright holder'),
    ]),
  ]);
  return { body };
}
