/**
 * The optional `motion:` block in `_data/theme.yml`.
 *
 * `_includes/theme.html` emits `--motion-fast/base/slow` and `--ease-brand`
 * with a Liquid `default:` on every value, so the block may be absent and the
 * site still builds. This module is what lets the configurator carry it:
 * three named speeds an administrator can choose between, a matcher that
 * recognises a block a fork wrote by hand, and the validation both wizards run
 * before writing the file back.
 *
 * Durations are CSS `<time>` strings because that is what lands in the
 * stylesheet — no unit conversion on the way in or out, so a hand-written
 * `0.2s` survives a round trip as `0.2s`.
 */

/** Easing keywords CSS defines; anything else must be a `cubic-bezier()`. */
const EASE_KEYWORDS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];

/** `cubic-bezier(0.2, 0, 0, 1)` — four numbers, any spacing, optional signs. */
const CUBIC_BEZIER = /^cubic-bezier\(\s*-?\d*\.?\d+\s*(?:,\s*-?\d*\.?\d+\s*){3}\)$/;

/** A CSS `<time>`: `120ms`, `0.2s`. Seconds and milliseconds only, as CSS allows. */
const TIME = /^(\d*\.?\d+)(ms|s)$/;

/** The three duration keys, in the order they must not decrease. */
export const MOTION_DURATIONS = ['fast', 'base', 'slow'];

/** The longest duration the wizard will write. Past a second, motion reads as a hang. */
export const MOTION_MAX_MS = 1000;

/**
 * The speeds the Look step offers. `motion` is written verbatim into
 * `_data/theme.yml`, so these values are the contract, not a starting point.
 * @type {{id: string, label: string, blurb: string, motion: {fast: string, base: string, slow: string, ease: string}}[]}
 */
export const MOTION_PRESETS = [
  {
    id: 'snappy',
    label: 'Snappy',
    blurb: 'Transitions barely register.',
    motion: { fast: '90ms', base: '140ms', slow: '180ms', ease: 'cubic-bezier(0.2, 0, 0, 1)' },
  },
  {
    id: 'default',
    label: 'Default',
    blurb: 'What the template ships with.',
    motion: { fast: '120ms', base: '180ms', slow: '240ms', ease: 'cubic-bezier(0.2, 0, 0, 1)' },
  },
  {
    id: 'calm',
    label: 'Calm',
    blurb: 'Slower, symmetrical easing.',
    motion: { fast: '180ms', base: '280ms', slow: '380ms', ease: 'ease-in-out' },
  },
];

/** The block a fresh template carries — the same values `_includes/theme.html` defaults to. */
export const DEFAULT_MOTION = MOTION_PRESETS.find((preset) => preset.id === 'default').motion;

/**
 * A CSS `<time>` in milliseconds.
 * @param {unknown} value e.g. `"120ms"`, `"0.2s"`.
 * @returns {number|null} null when it is not a time at all.
 */
export function motionMs(value) {
  const match = TIME.exec(String(value ?? '').trim());
  if (!match) return null;
  return match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]);
}

/**
 * The block as the wizard holds it: the four known keys, trimmed, nothing else.
 * @param {unknown} motion a `theme.motion` value from a data file or an answer.
 * @returns {{fast: string, base: string, slow: string, ease: string}|null} null when there is no block.
 */
export function normalizeMotion(motion) {
  if (!motion || typeof motion !== 'object' || Array.isArray(motion)) return null;
  const out = {};
  for (const key of [...MOTION_DURATIONS, 'ease']) {
    const value = motion[key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    out[key] = String(value).trim();
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The preset a block *is*, so an existing file can be shown as a choice rather
 * than as "custom".
 * @param {unknown} motion
 * @returns {string|null} preset id, or null for a hand-written block (or none).
 */
export function matchMotionPreset(motion) {
  const block = normalizeMotion(motion);
  if (!block) return null;
  const found = MOTION_PRESETS.find((preset) =>
    [...MOTION_DURATIONS, 'ease'].every((key) => preset.motion[key] === block[key])
  );
  return found ? found.id : null;
}

/**
 * What is wrong with a `motion:` block. An absent block is legal — the Liquid
 * defaults cover it — so `null` reports nothing.
 *
 * @param {unknown} motion
 * @returns {string[]} plain-language messages, empty when the block is usable.
 */
export function motionProblems(motion) {
  const block = normalizeMotion(motion);
  if (!block) return [];
  const problems = [];
  const ms = {};

  for (const key of MOTION_DURATIONS) {
    if (block[key] === undefined) {
      problems.push(`Motion is missing "${key}" — all three of fast, base and slow are needed.`);
      continue;
    }
    const value = motionMs(block[key]);
    if (value === null) {
      problems.push(`Motion "${key}" must be a CSS time such as 120ms or 0.2s.`);
      continue;
    }
    if (value < 0 || value > MOTION_MAX_MS) {
      problems.push(`Motion "${key}" must be between 0 and ${MOTION_MAX_MS}ms.`);
      continue;
    }
    ms[key] = value;
  }

  if (ms.fast !== undefined && ms.base !== undefined && ms.fast > ms.base)
    problems.push('Motion "fast" must not be slower than "base".');
  if (ms.base !== undefined && ms.slow !== undefined && ms.base > ms.slow)
    problems.push('Motion "base" must not be slower than "slow".');

  if (block.ease !== undefined && !EASE_KEYWORDS.includes(block.ease) && !CUBIC_BEZIER.test(block.ease)) {
    problems.push(`Motion easing must be one of ${EASE_KEYWORDS.join(', ')} or a cubic-bezier(n, n, n, n).`);
  }

  return problems;
}
