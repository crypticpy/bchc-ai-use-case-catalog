/**
 * Step 1 — starting point.
 *
 * Picking a card discards the answers so far (after a confirm), because every
 * later step is pre-filled from the chosen configuration.
 */

import { el } from '../dom.js';
import { loadStartingPoint, save, startingPoints, state } from '../wizard/state.js';

/**
 * @param {() => void} rerender repaint the whole wizard.
 * @returns {{body: HTMLElement}}
 */
export function renderStart(rerender) {
  const body = el('div', { class: 'space-y-4' }, [
    el('p', {
      class: 'section-lead',
      text: 'Pick a starting point. You can change everything afterwards — nothing is written until you copy the files to GitHub yourself.',
    }),
    el(
      'div',
      { class: 'grid gap-4 sm:grid-cols-2' },
      startingPoints.map((option) => {
        const selected = option.id === state.startId;
        return el(
          'button',
          {
            type: 'button',
            class: `card p-0 text-left transition hover:-translate-y-0.5 ${selected ? 'ring-4 ring-brand-primary/30 border-brand-primary' : ''}`,
            'aria-pressed': selected ? 'true' : 'false',
            onclick: () => {
              if (
                option.id !== state.startId &&
                !window.confirm(
                  `Start over from "${option.name}"? Any edits you have made in this wizard will be replaced.`
                )
              ) {
                return;
              }
              loadStartingPoint(option.id);
              save();
              rerender();
            },
          },
          [
            el('div', { class: 'card-header' }, [
              el('span', { class: 'eyebrow', text: selected ? 'Selected' : 'Starting point' }),
              el('p', { class: 'card-title', text: option.name }),
            ]),
            el('div', { class: 'px-6 py-4' }, [
              el('p', { class: 'text-sm text-brand-muted', text: option.description }),
            ]),
          ]
        );
      })
    ),
  ]);
  return { body };
}
