/**
 * Form controls bound to `state.answers`.
 *
 * Every control writes its answer and persists on each keystroke, so the
 * wizard can be closed at any point. `onChange` is for steps that also paint
 * something live (the Branding step's preview); the answer is already saved by
 * the time it runs.
 */

import { isHexColor } from '../core.js';
import { el } from '../dom.js';
import { save, state } from './state.js';

/** The element id a control gets, and the id error links point at. */
export const answerFieldId = (key) => `field-${key}`;

/**
 * A labeled text/textarea input bound to `state.answers[key]`, saving on every input.
 * @param {string} key key into `state.answers`.
 * @param {string} label field label text.
 * @param {{help?: string, type?: string, textarea?: boolean, placeholder?: string, onChange?: () => void}} [options]
 * @returns {HTMLElement}
 */
export function textField(
  key,
  label,
  { help, type = 'text', textarea = false, placeholder = '', onChange } = {}
) {
  const id = answerFieldId(key);
  const control = textarea
    ? el('textarea', { id, class: 'field-input', rows: 3, placeholder })
    : el('input', { id, class: 'field-input', type, placeholder });
  control.value = state.answers[key] ?? '';
  control.addEventListener('input', () => {
    state.answers[key] = control.value;
    save();
    if (onChange) onChange();
  });
  return el('div', {}, [
    el('label', { class: 'field-label', for: id, text: label }),
    help ? el('p', { class: 'field-help', text: help }) : null,
    control,
  ]);
}

/**
 * A hex-text input paired with a native `<input type=color>` swatch, kept in
 * sync in both directions and bound to `state.answers[key]`.
 * @param {string} key key into `state.answers`.
 * @param {string} label field label text.
 * @param {string} help help text shown under the label.
 * @param {() => void} [onChange] run after every change (repaints the preview).
 * @returns {HTMLElement}
 */
export function colorField(key, label, help, onChange) {
  const id = answerFieldId(key);
  const text = el('input', {
    id,
    class: 'field-input !mt-0 font-mono',
    type: 'text',
    maxlength: 7,
    spellcheck: 'false',
  });
  const swatch = el('input', {
    class: 'h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-brand-line',
    type: 'color',
    'aria-label': `${label} color picker`,
  });
  text.value = state.answers[key] ?? '';
  swatch.value = isHexColor(state.answers[key]) ? state.answers[key] : '#000000';
  const sync = (value) => {
    state.answers[key] = value;
    if (isHexColor(value)) swatch.value = value;
    save();
    if (onChange) onChange();
  };
  text.addEventListener('input', () => sync(text.value.trim()));
  swatch.addEventListener('input', () => {
    text.value = swatch.value;
    sync(swatch.value);
  });
  return el('div', {}, [
    el('label', { class: 'field-label', for: id, text: label }),
    help ? el('p', { class: 'field-help', text: help }) : null,
    el('div', { class: 'mt-2 flex items-center gap-3' }, [swatch, text]),
  ]);
}

/**
 * A labeled `<select>` bound to `state.answers[key]`.
 * @param {string} key key into `state.answers`.
 * @param {string} label field label text.
 * @param {Array<{value: string, label: string}>} options
 * @param {string} [help] help text shown under the label.
 * @param {() => void} [onChange] run after every change.
 * @returns {HTMLElement}
 */
export function selectField(key, label, options, help, onChange) {
  const id = answerFieldId(key);
  const current = state.answers[key];
  // A starting point may hold a value the list does not offer (a custom font
  // family, say). Offer it as the first option so the control never shows
  // blank while the answer behind it is set.
  const offered =
    current !== undefined && current !== null && current !== '' && !options.some((o) => o.value === current)
      ? [{ value: String(current), label: `${current} (current)` }, ...options]
      : options;
  const select = el(
    'select',
    { id, class: 'field-input' },
    offered.map((option) => el('option', { value: option.value, text: option.label }))
  );
  select.value = current ?? offered[0].value;
  select.addEventListener('change', () => {
    state.answers[key] = select.value;
    save();
    if (onChange) onChange();
  });
  return el('div', {}, [
    el('label', { class: 'field-label', for: id, text: label }),
    help ? el('p', { class: 'field-help', text: help }) : null,
    select,
  ]);
}

/**
 * A small checkbox with an inline label, for the compact toggle rows on the
 * Entry model step.
 * @param {{id: string, label: string, checked: boolean, disabled?: boolean, onChange: (checked: boolean) => void}} options
 * @returns {HTMLLabelElement}
 */
export function inlineCheckbox({ id, label, checked, disabled = false, onChange }) {
  const input = el('input', {
    id,
    type: 'checkbox',
    class: 'h-4 w-4 rounded border-brand-line text-brand-primary focus:ring-brand-primary',
  });
  input.checked = Boolean(checked);
  input.disabled = disabled;
  input.addEventListener('change', () => onChange(input.checked));
  return el(
    'label',
    { class: 'inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-brand-muted', for: id },
    [input, el('span', { text: label })]
  );
}
