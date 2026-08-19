/**
 * YAML emitter — pure ESM, zero dependencies.
 *
 * Runs unchanged in Node 20+ and in the browser. Quoting is deliberately more
 * eager than YAML 1.2 strictly requires: over-quoting always round-trips,
 * under-quoting silently changes a value's type ("true", "2024", "1.0").
 */

// Characters that make a plain scalar risky somewhere in YAML.
const YAML_SPECIAL = /[:#{}[\],&*!|>'"%@`]/;
const YAML_RESERVED_WORDS = /^(?:y|n|yes|no|true|false|on|off|null|~)$/i;
const YAML_NUMBERLIKE = /^[-+]?(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const YAML_DATELIKE = /^\d{4}-\d{1,2}-\d{1,2}(?:[T ]|$)/;

/** True for a non-null, non-array object. */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a scalar must be quoted to survive a YAML round trip.
 * Deliberately over-eager (see file header) — every check here is a case where
 * an unquoted value would parse back as something other than a string.
 * @param {string} str
 * @returns {boolean}
 */
function needsQuoting(str) {
  if (str === '') return true;
  if (str !== str.trim()) return true;
  // Reached only when a block scalar would not survive the round trip.
  if (/[\n\r]/.test(str)) return true;
  if (YAML_SPECIAL.test(str)) return true;
  if (YAML_RESERVED_WORDS.test(str)) return true;
  if (YAML_NUMBERLIKE.test(str)) return true;
  if (YAML_DATELIKE.test(str)) return true;
  if (/^0[xXoObB]/.test(str)) return true;
  if (/^[-?]($|\s)/.test(str)) return true;
  if (/^[[\]{}>|%@`&*!]/.test(str)) return true;
  return false;
}

function doubleQuote(str) {
  return `"${String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`;
}

/** A string as an always-double-quoted YAML scalar. Used for `_config.yml`. */
export function quoteYamlString(value) {
  return doubleQuote(String(value ?? ''));
}

/**
 * True when a multi-line string survives a `|` block scalar unchanged.
 * Carriage returns and trailing spaces are stripped or normalised by parsers,
 * so those strings are double-quoted instead.
 */
function blockScalarSafe(str) {
  if (typeof str !== 'string' || !str.includes('\n')) return false;
  if (str.includes('\r')) return false;
  return !str.split('\n').some((line) => /[ \t]$/.test(line));
}

/**
 * Render a single non-container value as a YAML scalar, quoting it when
 * {@link needsQuoting} requires it.
 * @param {*} value
 * @returns {string}
 */
function scalarToYaml(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : doubleQuote(String(value));
  const str = String(value);
  return needsQuoting(str) ? doubleQuote(str) : str;
}

/**
 * `|` block scalar lines for a multi-line string.
 * @param {string} prefix `key:` for a mapping entry, `-` for a sequence item.
 * @param {string} str the string, already known safe via {@link blockScalarSafe}.
 * @param {string} pad indentation of `prefix` itself.
 * @param {number} step indent width in spaces, used for the block's child lines.
 * @returns {string[]} lines to append to the output, including the `prefix |…` header.
 */
function blockScalarLines(prefix, str, pad, step) {
  const childPad = pad + ' '.repeat(step);
  const trailing = /\n*$/.exec(str)[0].length;
  let chomp = '';
  let body = str;
  if (trailing === 0) chomp = '-';
  else if (trailing === 1) body = str.slice(0, -1);
  else {
    chomp = '+';
    body = str.slice(0, -1);
  }
  const lines = body.split('\n');
  const indentIndicator = /^[ \t]/.test(lines[0] ?? '') ? String(step) : '';
  const out = [`${pad}${prefix} |${indentIndicator}${chomp}`];
  for (const line of lines) out.push(line === '' ? '' : childPad + line);
  return out;
}

function emitMapping(obj, pad, out, step) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    emitEntry(key, value, pad, out, step);
  }
}

/**
 * Emit one `key: value` mapping entry, recursing into {@link emitSequence} or
 * {@link emitMapping} when the value is a container.
 * @param {string} key
 * @param {*} value
 * @param {string} pad indentation for this entry's own line.
 * @param {string[]} out lines are pushed here (mutated in place).
 * @param {number} step indent width in spaces.
 */
function emitEntry(key, value, pad, out, step) {
  const renderedKey = scalarToYaml(String(key));
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${pad}${renderedKey}: []`);
      return;
    }
    out.push(`${pad}${renderedKey}:`);
    emitSequence(value, pad + ' '.repeat(step), out, step);
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined);
    if (keys.length === 0) {
      out.push(`${pad}${renderedKey}: {}`);
      return;
    }
    out.push(`${pad}${renderedKey}:`);
    emitMapping(value, pad + ' '.repeat(step), out, step);
    return;
  }
  if (blockScalarSafe(value)) {
    out.push(...blockScalarLines(`${renderedKey}:`, value, pad, step));
    return;
  }
  out.push(`${pad}${renderedKey}: ${scalarToYaml(value)}`);
}

/**
 * Emit a YAML sequence. A nested object/array item is rendered at `pad + step`
 * indentation and then its first line is spliced back onto the `-` marker, so
 * `- key: value` (not `-\n  key: value`).
 * @param {Array<*>} arr
 * @param {string} pad indentation of the `-` markers.
 * @param {string[]} out lines are pushed here (mutated in place).
 * @param {number} step indent width in spaces.
 */
function emitSequence(arr, pad, out, step) {
  const marker = `-${' '.repeat(step - 1)}`;
  for (const item of arr) {
    if (isPlainObject(item) || Array.isArray(item)) {
      const nested = [];
      if (Array.isArray(item)) {
        if (item.length === 0) {
          out.push(`${pad}- []`);
          continue;
        }
        emitSequence(item, pad + ' '.repeat(step), nested, step);
      } else {
        const keys = Object.keys(item).filter((k) => item[k] !== undefined);
        if (keys.length === 0) {
          out.push(`${pad}- {}`);
          continue;
        }
        emitMapping(item, pad + ' '.repeat(step), nested, step);
      }
      nested[0] = pad + marker + nested[0].slice(pad.length + step);
      out.push(...nested);
      continue;
    }
    if (blockScalarSafe(item)) {
      out.push(...blockScalarLines('-', item, pad, step));
      continue;
    }
    out.push(`${pad}${marker}${scalarToYaml(item)}`);
  }
}

/**
 * Serialize a plain JS value to YAML.
 * @param {*} value Any JSON-shaped value.
 * @param {{header?: string, indent?: number}} [options] `header` becomes a
 *   leading `#` comment block; `indent` defaults to 2 spaces.
 * @returns {string} YAML text ending in a newline.
 */
export function toYaml(value, options = {}) {
  const step = options.indent || 2;
  const lines = [];
  if (options.header) {
    for (const line of String(options.header).replace(/\n+$/, '').split('\n')) {
      lines.push(line === '' ? '#' : `# ${line}`);
    }
    lines.push('');
  }
  if (Array.isArray(value)) {
    if (value.length === 0) lines.push('[]');
    else emitSequence(value, '', lines, step);
  } else if (isPlainObject(value)) {
    emitMapping(value, '', lines, step);
  } else if (blockScalarSafe(value)) {
    lines.push(...blockScalarLines('', value, '', step).map((l, i) => (i === 0 ? l.trimStart() : l)));
  } else {
    lines.push(scalarToYaml(value));
  }
  return `${lines.join('\n')}\n`;
}
