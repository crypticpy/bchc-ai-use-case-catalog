/**
 * Step 3 — the palette, the type and the corner rounding.
 *
 * The swatches, the WCAG contrast checks and the live theme preview all
 * repaint from one `renderPalette()`, wired into every control on the step as
 * its `onChange`. Both preview nodes are recreated on each render, so the
 * module-level handles below never outlive the step body they belong to; the
 * step is the only place they exist, so a render of any other step leaves them
 * pointing at detached nodes — `renderLook()` replaces them before use.
 *
 * The preview also echoes answers given on the Basics and Words steps (the
 * site name, the hero copy). Those steps do not repaint it: it is not on
 * screen there, and it reads the current answers every time this step renders.
 */

import { COLOR_QUESTIONS, contrastRatio, isHexColor, matchMotionPreset, MOTION_PRESETS } from '../core.js';
import { el } from '../dom.js';
import { renderThemePreview } from '../theme-preview.js';
import { answerFieldId, colorField, selectField, textField } from '../wizard/controls.js';
import { baseConfigFor, save, state } from '../wizard/state.js';

let paletteNode = null;
let previewNode = null;

/**
 * Repaint the live preview, the colour swatches and the WCAG contrast checks.
 * No-ops before the step body exists.
 */
function renderPalette() {
  if (previewNode) {
    renderThemePreview(previewNode, state.answers, {
      singular: (state.answers.entrySingular || 'entry').toLowerCase(),
      plural: (state.answers.entryPlural || 'entries').toLowerCase(),
    });
  }
  if (!paletteNode) return;
  const { primaryDark } = state.answers;
  const base = baseConfigFor(state.startId).theme.colors;
  const swatches = [
    ...COLOR_QUESTIONS.map((q) => [q.label, state.answers[q.key]]),
    ['Card', base.card],
    ['Surface', base.surface],
  ];
  const inkOnCard = contrastRatio(base.ink, base.card);
  const onDarkOnPrimaryDark = contrastRatio(base.on_dark, primaryDark);
  const checks = [
    ['Body text on cards', inkOnCard],
    ['Text on the dark hero/footer', onDarkOnPrimaryDark],
  ];

  paletteNode.replaceChildren(
    el(
      'div',
      { class: 'flex flex-wrap gap-3' },
      swatches.map(([name, value]) =>
        el('div', { class: 'flex items-center gap-2' }, [
          el('span', {
            class: 'inline-block h-8 w-8 rounded-lg border border-brand-line',
            style: `background:${isHexColor(value) ? value : 'transparent'}`,
            'aria-hidden': 'true',
          }),
          el('span', { class: 'text-xs text-brand-muted' }, [
            el('span', { class: 'block font-semibold text-brand-ink', text: name }),
            el('span', { class: 'font-mono', text: value || '—' }),
          ]),
        ])
      )
    ),
    el(
      'ul',
      { class: 'mt-4 space-y-1 text-sm' },
      checks.map(([name, ratio]) => {
        if (ratio === null)
          return el('li', {
            class: 'text-brand-muted',
            text: `${name}: enter a valid hex color to check contrast.`,
          });
        const ok = ratio >= 4.5;
        return el('li', { class: ok ? 'text-brand-ink' : 'font-semibold text-brand-accent' }, [
          el('span', { text: `${name}: ${ratio.toFixed(1)}:1 — ` }),
          el('span', {
            text: ok
              ? 'passes WCAG AA.'
              : 'below the 4.5:1 minimum. Darken the background or lighten the text.',
          }),
        ]);
      })
    )
  );
}

/**
 * How the current `motion:` answer reads above the control.
 *
 * The values, not just the name: a `<select>` this narrow truncates anything
 * longer than its option labels, so what a named speed actually means lives
 * here rather than in the option text.
 */
function motionSummary(motion) {
  if (!motion) return 'Not set — the theme defaults apply (120ms / 180ms / 240ms).';
  const { fast, base, slow, ease } = motion;
  const preset = MOTION_PRESETS.find((item) => item.id === matchMotionPreset(motion));
  const values = `Now ${[fast, base, slow].filter(Boolean).join(' / ')}, easing ${ease || 'default'}.`;
  return preset ? `${preset.blurb} ${values}` : values;
}

/**
 * Speed of transitions, as three named choices that write the whole
 * `theme.motion` block.
 *
 * A file may carry timings nobody picked here — the block is documented and
 * hand-editable — so a fourth option appears in that case only, naming what
 * leaving the control alone will keep. Picking a named speed then overwrites
 * those timings, which is why the summary line above the control always shows
 * the values that will be written.
 *
 * @returns {HTMLElement}
 */
function motionField() {
  const id = answerFieldId('motion');
  const matched = matchMotionPreset(state.answers.motion);
  const options = MOTION_PRESETS.map((preset) => el('option', { value: preset.id, text: preset.label }));
  if (!matched) {
    options.push(
      el('option', {
        value: 'custom',
        text: state.answers.motion ? 'Keep current timings' : 'Theme default',
      })
    );
  }
  const select = el('select', { id, class: 'field-input' }, options);
  select.value = matched || 'custom';
  const summary = el('p', { class: 'field-help', text: motionSummary(state.answers.motion) });
  select.addEventListener('change', () => {
    const preset = MOTION_PRESETS.find((item) => item.id === select.value);
    if (preset) state.answers.motion = { ...preset.motion };
    save();
    summary.textContent = motionSummary(state.answers.motion);
  });
  // Two columns wide: the summary is a sentence of timings, and a third of
  // the row wraps it to three lines.
  return el('div', { class: 'sm:col-span-2' }, [
    el('label', { class: 'field-label', for: id, text: 'Motion' }),
    summary,
    select,
  ]);
}

/** @returns {{body: HTMLElement}} step 3 body — palette with a live preview, then type and rounding. */
export function renderLook() {
  paletteNode = el('div', { class: 'px-6 py-5' });
  previewNode = el('div', { class: 'p-4 sm:p-6' });
  const body = el('div', { class: 'space-y-6' }, [
    el('fieldset', { class: 'space-y-4' }, [
      el('legend', { class: 'section-title', text: 'Palette' }),
      el(
        'div',
        { class: 'grid gap-4 sm:grid-cols-2' },
        COLOR_QUESTIONS.map((q) => colorField(q.key, q.label, q.help, renderPalette))
      ),
      el('div', { class: 'card' }, [
        el('div', { class: 'card-header' }, [
          el('p', { class: 'card-title', text: 'Live preview' }),
          el('p', {
            class: 'section-lead mt-1',
            text: 'The real components under your palette, type and rounding — header, hero, an entry card and controls. Updates as you type.',
          }),
        ]),
        previewNode,
        el('div', { class: 'card-header border-t' }, [
          el('p', { class: 'card-title', text: 'Palette & contrast' }),
        ]),
        paletteNode,
      ]),
    ]),
    el('fieldset', { class: 'space-y-4' }, [
      el('legend', { class: 'section-title', text: 'Type, shape & motion' }),
      el('div', { class: 'grid gap-4 sm:grid-cols-3' }, [
        selectField(
          'headingFont',
          'Heading font',
          [
            { value: 'Source Serif 4', label: 'Source Serif 4 (bundled)' },
            { value: 'Source Sans 3', label: 'Source Sans 3 (bundled)' },
            { value: 'Inter', label: 'Inter (bundled)' },
          ],
          undefined,
          renderPalette
        ),
        selectField(
          'bodyFont',
          'Body font',
          [
            { value: 'Inter', label: 'Inter (bundled)' },
            { value: 'Source Sans 3', label: 'Source Sans 3 (bundled)' },
          ],
          undefined,
          renderPalette
        ),
        selectField(
          'radius',
          'Corner rounding',
          [
            { value: 'sharp', label: 'Sharp' },
            { value: 'soft', label: 'Soft' },
            { value: 'round', label: 'Round' },
          ],
          undefined,
          renderPalette
        ),
        motionField(),
      ]),
      textField('googleFontsUrl', 'Google Fonts URL', {
        type: 'url',
        help: 'Only needed if you replace a bundled font with another family. Paste the href from fonts.google.com.',
      }),
    ]),
  ]);
  renderPalette();
  return { body };
}
