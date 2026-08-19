/**
 * Flags for `npm run setup`, described as data.
 *
 * The table below is the only place a flag is defined: the parser, the
 * `--help` output and the tests all read it, so a new flag cannot be
 * recognised without being documented.
 */

/**
 * @typedef {object} FlagSpec
 * @property {string} name the long form, e.g. `--preset`.
 * @property {string[]} [aliases] other accepted spellings.
 * @property {string} key the key it sets on the parsed args object.
 * @property {boolean} [takesValue] true when the flag needs a value.
 * @property {string} [placeholder] shown in `--help` after the name.
 * @property {string} help one-line description.
 */

/** @type {FlagSpec[]} */
export const FLAGS = [
  {
    name: '--preset',
    key: 'preset',
    takesValue: true,
    placeholder: '<id>',
    help: 'start from a preset instead of asking',
  },
  { name: '--yes', aliases: ['-y'], key: 'yes', help: 'accept every default without prompting' },
  { name: '--dry-run', aliases: ['--dry'], key: 'dryRun', help: 'show what would be written, write nothing' },
  {
    name: '--out',
    key: 'out',
    takesValue: true,
    placeholder: '<dir>',
    help: 'write into <dir> instead of the repository (implies --yes)',
  },
  { name: '--help', aliases: ['-h'], key: 'help', help: 'print this list' },
];

/** Every accepted spelling -> its spec. */
const BY_NAME = new Map();
for (const flag of FLAGS) {
  for (const name of [flag.name, ...(flag.aliases ?? [])]) BY_NAME.set(name, flag);
}

/** The shape `parseArgs` always returns, before any flag is applied. */
const DEFAULTS = { preset: null, yes: false, dryRun: false, out: null, help: false };

/**
 * Parse `process.argv.slice(2)` into the wizard's flags. Both `--out dir` and
 * `--out=dir` work; anything unrecognised is reported and skipped rather than
 * guessed at.
 *
 * @param {string[]} argv
 * @param {{warn?: (message: string) => void}} [options]
 * @returns {{preset: string|null, yes: boolean, dryRun: boolean, out: string|null, help: boolean}}
 */
export function parseArgs(argv, { warn = console.warn } = {}) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i]);
    const separator = token.indexOf('=');
    const name = separator === -1 ? token : token.slice(0, separator);
    const inline = separator === -1 ? null : token.slice(separator + 1);
    const flag = BY_NAME.get(name);

    if (!flag) {
      warn(`Ignoring unknown argument ${JSON.stringify(token)}.`);
      continue;
    }
    if (!flag.takesValue) {
      if (inline !== null) warn(`${name} takes no value; ignoring ${JSON.stringify(inline)}.`);
      args[flag.key] = true;
      continue;
    }
    const value = inline === null ? argv[i + 1] : inline;
    if (value === undefined || value === '') {
      warn(`${name} needs a value; ignoring it.`);
      continue;
    }
    if (inline === null) i += 1;
    args[flag.key] = value;
  }
  // Writing somewhere else is a scripted use: never stop for a prompt.
  if (args.out) args.yes = true;
  return args;
}

/**
 * The `--help` body, built from `FLAGS` so it cannot fall out of date.
 * @param {string[]} presetIds ids accepted by `--preset`.
 * @param {(text: string) => string} [bold] colouriser for the title line.
 * @returns {string}
 */
export function helpText(presetIds, bold = (text) => text) {
  const names = FLAGS.map((flag) => `${flag.name} ${flag.placeholder ?? ''}`.trim());
  const width = Math.max(...names.map((name) => name.length));
  return [
    '',
    `${bold('npm run setup')} — configure this site`,
    '',
    ...FLAGS.map((flag, index) => {
      const help = flag.key === 'preset' ? presetIds.join(' | ') : flag.help;
      return `  ${names[index].padEnd(width)}   ${help}`;
    }),
    '',
  ].join('\n');
}
