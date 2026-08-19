import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MOTION,
  MOTION_MAX_MS,
  MOTION_PRESETS,
  matchMotionPreset,
  motionMs,
  motionProblems,
  normalizeMotion,
} from '../../assets/js/configurator/motion.js';

test('motionMs reads both CSS time units and rejects everything else', () => {
  assert.equal(motionMs('120ms'), 120);
  assert.equal(motionMs('0.2s'), 200);
  assert.equal(motionMs(' 90ms '), 90);
  assert.equal(motionMs('0ms'), 0);
  for (const junk of ['120', '120 ms', 'fast', '', null, undefined, {}, '1e3ms']) {
    assert.equal(motionMs(junk), null, `${JSON.stringify(junk)} is not a time`);
  }
});

test('normalizeMotion keeps the four known keys and nothing else', () => {
  assert.deepEqual(normalizeMotion({ fast: ' 90ms ', base: '140ms', slow: '180ms', ease: 'linear' }), {
    fast: '90ms',
    base: '140ms',
    slow: '180ms',
    ease: 'linear',
  });
  assert.deepEqual(normalizeMotion({ fast: '90ms', nonsense: 'x', ease: '' }), { fast: '90ms' });
  for (const empty of [null, undefined, '', 0, [], {}, { ease: '   ' }]) {
    assert.equal(normalizeMotion(empty), null, `${JSON.stringify(empty)} is not a block`);
  }
});

test('every shipped preset is a valid block, and they get slower in order', () => {
  assert.deepEqual(
    MOTION_PRESETS.map((preset) => preset.id),
    ['snappy', 'default', 'calm']
  );
  let previous = 0;
  for (const preset of MOTION_PRESETS) {
    assert.deepEqual(motionProblems(preset.motion), [], `${preset.id} is valid`);
    assert.ok(preset.label.trim() && preset.blurb.trim(), `${preset.id} is named`);
    const base = motionMs(preset.motion.base);
    assert.ok(base > previous, `${preset.id} is slower than the one before it`);
    previous = base;
  }
  assert.deepEqual(DEFAULT_MOTION, MOTION_PRESETS[1].motion);
});

test('matchMotionPreset names a block the wizard wrote and refuses one it did not', () => {
  for (const preset of MOTION_PRESETS) {
    assert.equal(matchMotionPreset({ ...preset.motion }), preset.id);
  }
  assert.equal(matchMotionPreset({ ...DEFAULT_MOTION, slow: '250ms' }), null);
  // A block missing a key is not the preset it otherwise looks like: writing
  // the preset back would add values the file never had.
  assert.equal(matchMotionPreset({ fast: '120ms', base: '180ms', slow: '240ms' }), null);
  assert.equal(matchMotionPreset(null), null);
});

test('an absent block is legal — the Liquid defaults cover it', () => {
  assert.deepEqual(motionProblems(null), []);
  assert.deepEqual(motionProblems(undefined), []);
  assert.deepEqual(motionProblems({}), []);
});

test('a duration must be a CSS time inside the sane range', () => {
  assert.match(motionProblems({ fast: '120', base: '180ms', slow: '240ms' })[0], /CSS time/);
  assert.match(motionProblems({ fast: '120ms', base: '2s', slow: '240ms' })[0], /between 0 and 1000ms/);
  assert.equal(MOTION_MAX_MS, 1000);
  assert.deepEqual(motionProblems({ fast: '0ms', base: '0.5s', slow: '1000ms' }), []);
  assert.match(motionProblems({ fast: '120ms', slow: '240ms' })[0], /missing "base"/);
});

test('the durations may not decrease', () => {
  assert.match(
    motionProblems({ fast: '200ms', base: '180ms', slow: '240ms' })[0],
    /"fast" must not be slower than "base"/
  );
  assert.match(
    motionProblems({ fast: '120ms', base: '300ms', slow: '240ms' })[0],
    /"base" must not be slower than "slow"/
  );
  // Equal is fine: a theme may collapse two steps onto one duration.
  assert.deepEqual(motionProblems({ fast: '120ms', base: '120ms', slow: '0.12s' }), []);
});

test('easing is a CSS keyword or a cubic-bezier, and nothing else', () => {
  const withEase = (ease) => motionProblems({ ...DEFAULT_MOTION, ease });
  for (const ease of ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']) {
    assert.deepEqual(withEase(ease), [], ease);
  }
  for (const ease of [
    'cubic-bezier(0.2, 0, 0, 1)',
    'cubic-bezier(.4,0,.2,1)',
    'cubic-bezier(0,-0.5,1,1.5)',
  ]) {
    assert.deepEqual(withEase(ease), [], ease);
  }
  for (const ease of [
    'steps(4)',
    'cubic-bezier(0.2, 0, 0)',
    'cubic-bezier(a,b,c,d)',
    'springy',
    'ease-out;',
  ]) {
    assert.match(withEase(ease)[0] ?? '', /easing must be one of/, ease);
  }
});
