import assert from 'node:assert/strict';
import test from 'node:test';

import * as core from '../../assets/js/configurator/core.js';
import { defaultConfig } from '../../assets/js/configurator/default-config.js';
import { askAnswers, BODY_FONT_CHOICES, HEADING_FONT_CHOICES } from '../../scripts/lib/setup-prompts.mjs';

test('terminal setup offers every bundled family in the role where it is valid', () => {
  assert.deepEqual(
    HEADING_FONT_CHOICES.map((choice) => choice.id),
    ['PHCT Serif', 'Inter', 'PHCT Sans', 'other']
  );
  assert.deepEqual(
    BODY_FONT_CHOICES.map((choice) => choice.id),
    ['Inter', 'PHCT Sans', 'other']
  );
});

test('accepting terminal defaults preserves the serif heading and normalizes legacy names', async () => {
  const base = defaultConfig();
  base.theme.fonts.heading = 'Source Serif 4';
  base.theme.fonts.body = 'Source Sans 3';

  const chosen = [];
  const asker = {
    async text(_label, fallback) {
      return fallback;
    },
    async choose(label, choices, fallbackIndex = 0) {
      chosen.push({ label, id: choices[fallbackIndex].id });
      return choices[fallbackIndex];
    },
    async confirm(_label, fallback) {
      return fallback;
    },
  };

  const answers = await askAnswers(asker, base, { core, gitRepository: null });
  assert.equal(answers.headingFont, 'PHCT Serif');
  assert.equal(answers.bodyFont, 'PHCT Sans');
  assert.deepEqual(
    chosen.filter(({ label }) => /font/iu.test(label)),
    [
      { label: 'Heading font:', id: 'PHCT Serif' },
      { label: 'Body font:', id: 'PHCT Sans' },
    ]
  );
});
