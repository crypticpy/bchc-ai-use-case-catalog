/**
 * A small, dependency-free YAML *emitter* for entry front matter.
 *
 * We only ever write a flat map whose values are scalars, string lists or
 * lists of flat maps ({label, url} / {src, alt}), so a full serializer is not
 * needed — and a hand-rolled one lets us keep multi-line prose readable as a
 * block scalar instead of a wall of `\n` escapes.
 *
 * Everything here is pure: no filesystem, no environment. See
 * test/scripts/yaml.test.mjs.
 */

/**
 * Plain (unquoted) scalars are an allow-list, not a deny-list.
 *
 * The values here come from an issue anyone can open, and the file they land in
 * is read back by Psych (Ruby/Jekyll, YAML 1.1) as well as by the `yaml` npm
 * package (YAML 1.2). The two disagree about a long tail of forms — `0x1F`,
 * `1_000`, `12:30`, `.inf`, `.nan`, `~`, `y`, `on` — so listing the dangerous
 * shapes is a losing game. Instead a value is emitted plain only when it looks
 * like ordinary prose: it starts with a letter and uses nothing but letters,
 * digits and a short set of harmless punctuation. Everything else is quoted,
 * which is always correct and merely a little noisier.
 */
const PLAIN_SAFE = /^[A-Za-z][A-Za-z0-9 _.,()&/'-]*$/;

/**
 * Words a YAML 1.1 loader retypes to a boolean or null even though they match
 * the plain-safe shape above.
 */
const RESERVED_WORDS = /^(y|n|yes|no|true|false|on|off|null)$/i;

/**
 * Escape a string for a double-quoted YAML scalar. Beyond the obvious `\` and
 * `"`, every C0/C1 control character and the three Unicode line breaks YAML
 * treats as line breaks (U+0085, U+2028, U+2029) are escaped: left raw they
 * would either break the document or silently change the value.
 * @param {string} value
 * @returns {string} the quoted scalar, including the surrounding quotes
 */
export function quote(value) {
  const escaped = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    // Every C0 control, DEL, the C1 block (U+0085 included) and the Unicode
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (char) => {
      const code = char.codePointAt(0);
      switch (code) {
        case 0x09:
          return '\\t';
        case 0x0a:
          return '\\n';
        case 0x0d:
          return '\\r';
        case 0x1b:
          return '\\e';
        case 0x85:
          return '\\N';
        case 0x2028:
          return '\\L';
        case 0x2029:
          return '\\P';
        default:
          return code <= 0xff
            ? `\\x${code.toString(16).padStart(2, '0')}`
            : `\\u${code.toString(16).padStart(4, '0')}`;
      }
    });
  return `"${escaped}"`;
}

/**
 * Render one scalar value (string, number, boolean, null) as YAML.
 * Strings are double-quoted unless they are provably plain (see PLAIN_SAFE).
 * @param {unknown} value
 * @returns {string}
 */
export function scalar(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '""';

  const text = String(value);
  if (text === '') return '""';
  if (!PLAIN_SAFE.test(text)) return quote(text);
  if (RESERVED_WORDS.test(text)) return quote(text);
  // PLAIN_SAFE allows interior spaces, so a trailing one still has to be
  // caught: YAML silently eats it and the value changes on the round trip.
  if (/ $/.test(text)) return quote(text);
  return text;
}

/**
 * Characters a literal block scalar cannot carry: the C0 controls other than
 * tab and newline, DEL, the C1 block, and the Unicode line separators (which a
 * YAML 1.1 loader such as Psych treats as line breaks). A multi-line value
 * containing any of them is double-quoted instead of blocked.
 */
const BLOCK_UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Render a multi-line string as a literal block scalar (`|-`), which keeps
 * prose readable in the generated file. Trailing whitespace is stripped per
 * line because YAML preserves it and editors strip it, which causes diff noise.
 * @param {string} key
 * @param {string} value
 * @param {string} indent
 * @returns {string}
 */
function blockScalar(key, value, indent) {
  const lines = String(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const body = lines.map((line) => (line === '' ? '' : `${indent}  ${line}`)).join('\n');
  return `${indent}${key}: |-\n${body}`;
}

/**
 * Render a `key: value` pair, choosing between plain scalar, block scalar,
 * a block list of scalars or a block list of maps.
 * @param {string} key
 * @param {unknown} value
 * @param {string} [indent]
 * @returns {string}
 */
export function pair(key, value, indent = '') {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${indent}${key}: []`;
    const items = value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const keys = Object.keys(item).filter((k) => item[k] !== undefined && item[k] !== '');
        if (keys.length === 0) return `${indent}  - {}`;
        const [first, ...rest] = keys;
        const head = `${indent}  - ${first}: ${scalar(item[first])}`;
        const tail = rest.map((k) => `${indent}    ${k}: ${scalar(item[k])}`);
        return [head, ...tail].join('\n');
      }
      return `${indent}  - ${scalar(item)}`;
    });
    return `${indent}${key}:\n${items.join('\n')}`;
  }

  if (typeof value === 'string' && /\n/.test(value.trim()) && !BLOCK_UNSAFE.test(value)) {
    return blockScalar(key, value, indent);
  }

  return `${indent}${key}: ${scalar(value)}`;
}

/**
 * Serialize an ordered list of `[key, value]` entries as a Jekyll front matter
 * block, fences included, ending with a newline.
 * @param {Array<[string, unknown]>} entries
 * @returns {string}
 */
export function frontMatter(entries) {
  const lines = entries.map(([key, value]) => pair(key, value));
  return `---\n${lines.join('\n')}\n---\n`;
}
