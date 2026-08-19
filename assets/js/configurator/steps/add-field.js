/**
 * The "Add a field" card on step 4, split out of entry-model.js so neither file
 * carries both the row renderer and the new-field form.
 */

import { scrollBehavior } from '../../lib/motion.js';
import { snakeKey, FIELD_TYPES, RESERVED_KEYS } from '../core.js';
import { el } from '../dom.js';
import { announce } from '../wizard/errors.js';
import { availableGroups, save, state } from '../wizard/state.js';
import { expandField } from './field-rows.js';

const OPTION_TYPES = new Set(['select', 'multiselect']);

/**
 * What the admin has typed into the form so far. Kept outside the render so a
 * wizard repaint (a blocked Continue re-rendering step 4, a row toggling) does
 * not throw away a half-filled field; cleared once the field is added.
 */
const draft = { label: '', key: '', type: '', group: '', weight: '', keyEdited: false };

function resetDraft() {
  Object.assign(draft, { label: '', key: '', type: '', group: '', weight: '', keyEdited: false });
}

/**
 * The "Add a field" card: label/key/type/group/weight inputs plus validation
 * (blank label/key, reserved key, duplicate key, out-of-range weight) before
 * appending to `state.fields`. The key auto-derives from the label via
 * `snakeKey` until the submitter edits the key field directly. New fields are
 * inserted before the schema's `markdown` field, if any, so the write-up stays
 * last, and the new row opens straight away.
 *
 * @param {() => void} rerender repaint the whole wizard.
 * @returns {{card: HTMLElement, focus: () => void}}
 */
export function renderAddField(rerender) {
  const labelInput = el('input', {
    id: 'new-field-label',
    class: 'field-input',
    type: 'text',
    placeholder: 'e.g. Budget range',
    value: draft.label,
  });
  const keyInput = el('input', {
    id: 'new-field-key',
    class: 'field-input font-mono',
    type: 'text',
    placeholder: 'budget_range',
    value: draft.key,
  });
  const typeSelect = el(
    'select',
    { id: 'new-field-type', class: 'field-input' },
    FIELD_TYPES.filter((type) => type !== 'markdown').map((type) => el('option', { value: type, text: type }))
  );
  const groupSelect = el('select', { id: 'new-field-group', class: 'field-input' }, [
    el('option', { value: '', text: 'No group' }),
    ...availableGroups().map((group) => el('option', { value: group.key, text: group.title })),
  ]);
  const weightInput = el('input', {
    id: 'new-field-weight',
    class: 'field-input',
    type: 'number',
    min: 1,
    max: 9,
    step: 1,
    placeholder: '5',
    value: draft.weight,
  });
  if (draft.type) typeSelect.value = draft.type;
  if (draft.group) groupSelect.value = draft.group;
  keyInput.addEventListener('input', () => {
    draft.keyEdited = keyInput.value.trim() !== '';
    draft.key = keyInput.value;
  });
  labelInput.addEventListener('input', () => {
    draft.label = labelInput.value;
    if (!draft.keyEdited) {
      keyInput.value = snakeKey(labelInput.value);
      draft.key = keyInput.value;
    }
  });
  typeSelect.addEventListener('change', () => (draft.type = typeSelect.value));
  groupSelect.addEventListener('change', () => (draft.group = groupSelect.value));
  weightInput.addEventListener('input', () => (draft.weight = weightInput.value));

  const card = el('div', { id: 'add-field', class: 'card p-5' }, [
    el('p', { class: 'card-title', text: 'Add a field' }),
    el('div', { class: 'mt-3 grid gap-4 sm:grid-cols-3' }, [
      el('div', {}, [
        el('label', { class: 'field-label', for: 'new-field-label', text: 'Label' }),
        labelInput,
      ]),
      el('div', {}, [
        el('label', { class: 'field-label', for: 'new-field-key', text: 'Key' }),
        el('p', { class: 'field-help', text: 'snake_case, derived from the label.' }),
        keyInput,
      ]),
      el('div', {}, [el('label', { class: 'field-label', for: 'new-field-type', text: 'Type' }), typeSelect]),
      el('div', {}, [
        el('label', { class: 'field-label', for: 'new-field-group', text: 'Group' }),
        el('p', { class: 'field-help', text: 'Which section of the entry page it lands in.' }),
        groupSelect,
      ]),
      el('div', {}, [
        el('label', { class: 'field-label', for: 'new-field-weight', text: 'Weight' }),
        el('p', { class: 'field-help', text: '1–9, lowest first. Blank means 5.' }),
        weightInput,
      ]),
    ]),
    el('div', { class: 'mt-4' }, [
      el('button', {
        type: 'button',
        class: 'btn-secondary',
        text: 'Add field',
        onclick: () => {
          const label = labelInput.value.trim();
          const key = snakeKey(keyInput.value || label);
          const type = typeSelect.value;
          const rawWeight = weightInput.value.trim();
          const weight = rawWeight === '' ? null : Number.parseInt(rawWeight, 10);
          const problems = [];
          if (!label) problems.push({ message: 'Give the new field a label.', target: 'new-field-label' });
          if (!key) problems.push({ message: 'Give the new field a key.', target: 'new-field-key' });
          if (RESERVED_KEYS.includes(key))
            problems.push({ message: `"${key}" is reserved and always present.`, target: 'new-field-key' });
          if (state.fields.some((f) => f.key === key))
            problems.push({ message: `"${key}" is already used by another field.`, target: 'new-field-key' });
          if (weight !== null && (!Number.isInteger(weight) || weight < 1 || weight > 9)) {
            problems.push({
              message: 'Weight must be a whole number between 1 and 9.',
              target: 'new-field-weight',
            });
          }
          if (problems.length) {
            announce(problems);
            return;
          }
          const field = { key, label, type, enabled: true };
          if (groupSelect.value) field.group = groupSelect.value;
          if (weight !== null) field.weight = weight;
          if (OPTION_TYPES.has(type)) field.options = ['Option one', 'Option two'];
          if (type === 'file') field.filename = `${key.replace(/_/g, '-')}.pdf`;
          // keep the markdown body last so the write-up stays at the bottom
          const bodyIndex = state.fields.findIndex((f) => f.type === 'markdown');
          if (bodyIndex === -1) state.fields.push(field);
          else state.fields.splice(bodyIndex, 0, field);
          expandField(key);
          resetDraft();
          announce([]);
          save();
          rerender();
        },
      }),
    ]),
  ]);

  return {
    card,
    focus: () => {
      card.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      labelInput.focus({ preventScroll: true });
    },
  };
}
