/**
 * Step 4 — the entry model.
 *
 * The field list is the tallest thing in the wizard, so every row is collapsed
 * to a one-line summary (label, key, type, and a badge per presentation flag)
 * behind a real `<button aria-expanded>`; only the rows the admin opens render
 * their controls. Expansion is remembered per field key, so a re-render — a
 * field added, removed, or toggled off — leaves the open rows open.
 *
 * The step's actions (Add a field, plus the shell's Back/Continue) ride in a
 * bar stuck to the bottom of the viewport, so the admin never has to scroll a
 * few thousand pixels to move on.
 */

import { CARD_SLOT_TYPES } from '../core.js';
import { el } from '../dom.js';
import { inlineCheckbox, textField } from '../wizard/controls.js';
import { availableGroups, save, state } from '../wizard/state.js';
import { renderAddField } from './add-field.js';
import { fieldToggleId, isExpanded, rowIdFor, setExpanded } from './field-rows.js';

const OPTION_TYPES = new Set(['select', 'multiselect']);

/** The read-only flags shown on a collapsed row. */
function summaryBadges(field) {
  const badges = [];
  if (field.required) badges.push('Required');
  if (field.facet) badges.push('Filter');
  if (field.card) badges.push(typeof field.card === 'string' ? `Card: ${field.card}` : 'On card');
  if (field.search) badges.push('Searchable');
  if (field.group) badges.push(`Group: ${field.group}`);
  return badges;
}

/**
 * "Show on card" is a checkbox plus, when on, a slot picker: `card: true` lets
 * the renderer choose the slot from the type; a named slot pins it. The picker
 * only offers slots that fit the field's type (CARD_SLOT_TYPES) and the
 * checkbox never flattens an explicit slot to `true` when toggled off and on.
 */
function cardControl(field, rowId, onChange) {
  const id = `${rowId}-card`;
  const fits = Object.entries(CARD_SLOT_TYPES)
    .filter(([, types]) => types.includes(field.type))
    .map(([slot]) => slot);
  let remembered = typeof field.card === 'string' ? field.card : null;
  const input = el('input', {
    id,
    type: 'checkbox',
    class: 'h-4 w-4 rounded border-brand-line text-brand-primary focus:ring-brand-primary',
  });
  input.checked = Boolean(field.card);
  const select = el(
    'select',
    {
      id: `${id}-slot`,
      class: 'field-input !mt-0 !h-8 !w-auto !py-0 !text-xs',
      'aria-label': `Card slot for ${field.key}`,
    },
    [
      el('option', { value: '', text: 'Automatic' }),
      ...fits.map((slot) => el('option', { value: slot, text: slot })),
    ]
  );
  select.value = typeof field.card === 'string' && fits.includes(field.card) ? field.card : '';
  // `.field-input` sets display, so the `hidden` attribute alone would lose; toggle the utility class.
  const showSelect = () => select.classList.toggle('hidden', !input.checked || fits.length === 0);
  showSelect();
  input.addEventListener('change', () => {
    if (input.checked) field.card = remembered && fits.includes(remembered) ? remembered : true;
    else {
      if (typeof field.card === 'string') remembered = field.card;
      field.card = false;
    }
    showSelect();
    save();
    onChange();
  });
  select.addEventListener('change', () => {
    field.card = select.value || true;
    remembered = select.value || remembered;
    save();
    onChange();
  });
  return el('span', { class: 'inline-flex items-center gap-1.5' }, [
    el(
      'label',
      { class: 'inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-brand-muted', for: id },
      [input, el('span', { text: 'Show on card' })]
    ),
    select,
  ]);
}

/** The group `<select>`, offering the schema's groups plus whatever the field already uses. */
function groupControl(field, rowId, onChange) {
  const id = `${rowId}-group`;
  const groups = availableGroups();
  if (field.group && !groups.some((group) => group.key === field.group)) {
    groups.push({ key: field.group, title: `${field.group} (not declared)` });
  }
  const select = el('select', { id, class: 'field-input' }, [
    el('option', { value: '', text: 'No group' }),
    ...groups.map((group) => el('option', { value: group.key, text: group.title })),
  ]);
  select.value = field.group ?? '';
  select.addEventListener('change', () => {
    if (select.value) field.group = select.value;
    else delete field.group;
    save();
    onChange();
  });
  return el('div', {}, [
    el('label', { class: 'field-label', for: id, text: 'Group' }),
    el('p', { class: 'field-help', text: 'Which section of the entry page this field appears in.' }),
    select,
  ]);
}

/** The weight `<input type=number>`; blank removes `weight` and falls back to 5. */
function weightControl(field, rowId) {
  const id = `${rowId}-weight`;
  const input = el('input', {
    id,
    class: 'field-input',
    type: 'number',
    min: 1,
    max: 9,
    step: 1,
    placeholder: '5',
  });
  input.value = Number.isInteger(field.weight) ? String(field.weight) : '';
  input.addEventListener('input', () => {
    const weight = Number.parseInt(input.value, 10);
    if (Number.isInteger(weight)) field.weight = weight;
    else delete field.weight;
    save();
  });
  return el('div', {}, [
    el('label', { class: 'field-label', for: id, text: 'Weight' }),
    el('p', {
      class: 'field-help',
      text: '1–9, lowest first. Orders cards, filters and forms. Blank means 5.',
    }),
    input,
  ]);
}

/**
 * One field's row: a collapsed summary line plus, behind the expand toggle,
 * its editable controls. `title`/`summary` are core fields — always enabled,
 * and their `required` toggle is locked on — since every entry needs them.
 *
 * @param {object} field mutated in place; entry from `state.fields`.
 * @param {number} index the field's position in `state.fields` (used for removal).
 * @param {() => void} rerender repaint the whole wizard.
 * @returns {HTMLLIElement}
 */
function fieldRow(field, index, rerender) {
  const key = String(field.key);
  const rowId = rowIdFor(key);
  const detailsId = `${rowId}-details`;
  const isCore = key === 'title' || key === 'summary';
  let isOpen = isExpanded(key);

  const badgeRow = el(
    'span',
    { class: 'flex flex-wrap items-center gap-1.5' },
    summaryBadges(field).map((badge) => el('span', { class: 'chip', text: badge }))
  );
  /** Repaint just the collapsed summary's badges when a control inside the row changes one. */
  const refreshBadges = () => {
    badgeRow.replaceChildren(
      ...summaryBadges(field).map((badge) => el('span', { class: 'chip', text: badge }))
    );
  };

  const nameSpan = el('span', { class: 'schema-field-name', text: field.label || key });

  const caret = el('span', {
    class: `schema-field-caret${isOpen ? ' is-open' : ''}`,
    'aria-hidden': 'true',
    text: '▸',
  });
  const toggleButton = el(
    'button',
    {
      type: 'button',
      id: fieldToggleId(key),
      class: 'schema-field-toggle',
      'aria-expanded': isOpen ? 'true' : 'false',
      'aria-controls': detailsId,
    },
    [
      nameSpan,
      el('span', { class: 'chip-neutral font-mono', text: key }),
      el('span', { class: 'chip', text: field.type }),
      badgeRow,
      caret,
    ]
  );

  const toggles = el('div', { class: 'flex flex-wrap items-center gap-3' }, [
    inlineCheckbox({
      id: `${rowId}-required`,
      label: 'Required',
      checked: field.required,
      disabled: isCore,
      onChange: (checked) => {
        field.required = checked;
        save();
        refreshBadges();
      },
    }),
    inlineCheckbox({
      id: `${rowId}-facet`,
      label: 'Filter',
      checked: field.facet,
      onChange: (checked) => {
        field.facet = checked;
        save();
        refreshBadges();
      },
    }),
    cardControl(field, rowId, refreshBadges),
    inlineCheckbox({
      id: `${rowId}-search`,
      label: 'Searchable',
      checked: field.search,
      onChange: (checked) => {
        field.search = checked;
        save();
        refreshBadges();
      },
    }),
  ]);

  const labelInput = el('input', { id: `${rowId}-label`, class: 'field-input !mt-0', type: 'text' });
  labelInput.value = field.label ?? '';
  labelInput.addEventListener('input', () => {
    field.label = labelInput.value;
    nameSpan.textContent = field.label || key;
    save();
  });

  const detailChildren = [
    toggles,
    el('div', { class: 'mt-4' }, [
      el('label', { class: 'field-label', for: `${rowId}-label`, text: 'Label' }),
      el('p', {
        class: 'field-help',
        text: 'Shown in forms and on the entry page. Must be unique — the issue parser matches on it.',
      }),
      el('div', { class: 'mt-2' }, [labelInput]),
    ]),
    el('div', { class: 'mt-4 grid gap-4 sm:grid-cols-2' }, [
      groupControl(field, rowId, refreshBadges),
      weightControl(field, rowId),
    ]),
  ];

  if (OPTION_TYPES.has(field.type)) {
    const optionsInput = el('textarea', {
      id: `${rowId}-options`,
      class: 'field-input',
      rows: 4,
      'aria-label': `Options for ${key}`,
    });
    optionsInput.value = (field.options || []).join('\n');
    optionsInput.addEventListener('input', () => {
      field.options = optionsInput.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      save();
    });
    detailChildren.push(
      el('div', { class: 'mt-4' }, [
        el('span', { class: 'field-label', text: 'Options' }),
        el('p', {
          class: 'field-help',
          text: 'One per line. These become the dropdown choices and the filter values.',
        }),
        optionsInput,
      ])
    );
  }

  if (!isCore) {
    detailChildren.push(
      el('div', { class: 'mt-4 text-right' }, [
        el('button', {
          type: 'button',
          class: 'text-xs font-semibold text-brand-muted underline hover:text-brand-primary',
          text: 'Remove this field',
          onclick: () => {
            if (!window.confirm(`Remove the "${field.label || key}" field?`)) return;
            state.fields.splice(index, 1);
            setExpanded(key, false);
            save();
            rerender();
          },
        }),
      ])
    );
  }

  const details = el('div', { id: detailsId, class: 'schema-field-details' }, detailChildren);
  details.hidden = !isOpen;

  toggleButton.addEventListener('click', () => {
    isOpen = !isOpen;
    setExpanded(key, isOpen);
    toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    caret.classList.toggle('is-open', isOpen);
    details.hidden = !isOpen;
  });

  return el('li', { class: `card schema-field-row ${field.enabled === false ? 'opacity-60' : ''}` }, [
    el('div', { class: 'schema-field-head' }, [
      inlineCheckbox({
        id: `${rowId}-enabled`,
        label: isCore ? 'Always on' : 'Include',
        checked: field.enabled !== false,
        disabled: isCore,
        onChange: (checked) => {
          field.enabled = checked;
          save();
          rerender();
        },
      }),
      toggleButton,
    ]),
    details,
  ]);
}

/**
 * @param {() => void} rerender repaint the whole wizard.
 * @returns {{body: HTMLElement, actions: HTMLElement[], sticky: boolean}}
 */
export function renderEntryModel(rerender) {
  const addField = renderAddField(rerender);

  const body = el('div', { class: 'space-y-5' }, [
    el('fieldset', { class: 'grid gap-4 sm:grid-cols-2' }, [
      el('legend', { class: 'section-title', text: 'What is an entry called?' }),
      textField('entrySingular', 'Singular', { help: 'e.g. Use case, Resource, Team project.' }),
      textField('entryPlural', 'Plural', { help: 'Used for the catalog navigation label.' }),
    ]),
    el('div', {}, [
      el('h3', { class: 'section-title', text: 'Fields' }),
      el('p', {
        class: 'section-lead',
        text: 'These become the entry front matter, the filter panel, the catalog cards and the submission forms. Title and summary are always present. Open a field to edit it.',
      }),
    ]),
    el(
      'ul',
      { class: 'space-y-2' },
      state.fields.map((field, index) => fieldRow(field, index, rerender))
    ),
    addField.card,
  ]);

  const addButton = el('button', {
    type: 'button',
    class: 'btn-secondary',
    text: 'Add a field',
    onclick: addField.focus,
  });

  return { body, actions: [addButton], sticky: true };
}
