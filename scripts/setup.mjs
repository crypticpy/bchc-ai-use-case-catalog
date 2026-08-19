#!/usr/bin/env node
/**
 * Interactive setup wizard.
 *
 *   npm run setup
 *   npm run setup -- --preset resource-library --yes
 *   npm run setup -- --dry-run
 *
 * Asks a handful of questions, then writes _data/site.yml, _data/theme.yml,
 * _data/schema.yml, _data/navigation.yml, _config.yml and the GitHub issue form.
 * The same answers -> files logic runs in the browser at /setup/; everything
 * lives in assets/js/configurator/core.js.
 *
 * This file is only the flow. The pieces live beside it:
 *   scripts/lib/setup-args.mjs     the flag table, its parser and --help
 *   scripts/lib/setup-prompts.mjs  the asker, the validators and the interview
 *   scripts/lib/setup-io.mjs       terminal colours, git, YAML reads, writes
 *
 * Flags:
 *   --preset <id>   start from a preset instead of asking
 *   --yes           accept every default, ask nothing (CI / smoke tests)
 *   --dry-run       print the file list and a diff summary, write nothing
 *   --out <dir>     write into <dir> instead of the repository (implies --yes);
 *                   nothing in the working tree is touched
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { ejectSamples, ejectSummary } from './eject_samples.mjs';
import { helpText, parseArgs } from './lib/setup-args.mjs';
import {
  bold,
  cyan,
  diffSummary,
  dim,
  entryPathFrom,
  green,
  listSampleEntries,
  readSchema,
  red,
  repositoryFromGit,
  schemaFieldKeys,
  writeFiles,
} from './lib/setup-io.mjs';
import { Asker, askAnswers } from './lib/setup-prompts.mjs';

const ROOT = process.cwd();
const core = await import(pathToFileURL(path.join(ROOT, 'assets/js/configurator/core.js')).href);
const { presets } = await import(pathToFileURL(path.join(ROOT, 'assets/js/configurator/presets.js')).href);

/**
 * Run the wizard end to end: parse flags, ask questions (or accept defaults),
 * render the files via `core.renderFiles`, show a summary, and write them
 * after confirmation. See the file header for the flag reference.
 * @returns {Promise<number>} process exit code.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      helpText(
        presets.map((preset) => preset.id),
        bold
      )
    );
    return 0;
  }

  console.log('');
  console.log(bold(cyan('  Catalog template setup')));
  console.log(dim('  Answers become _data/*.yml and _config.yml. Nothing is written until you confirm.'));
  console.log(dim('  Non-technical admins can do the same thing at /setup/ on the deployed site.'));
  console.log('');

  const asker = new Asker({ auto: args.yes });
  try {
    // --- 1. starting point --------------------------------------------------
    let preset;
    if (args.preset) {
      preset = presets.find((item) => item.id === args.preset);
      if (!preset) {
        console.error(
          red(
            `Unknown preset ${JSON.stringify(args.preset)}. Available: ${presets.map((item) => item.id).join(', ')}`
          )
        );
        return 1;
      }
      console.log(`Starting from ${bold(preset.name)}.\n`);
    } else {
      preset = await asker.choose('Choose a starting point:', presets, 0);
    }

    // --- 2. the interview ---------------------------------------------------
    const base = JSON.parse(JSON.stringify(preset.config));
    const answers = await askAnswers(asker, base, { core, gitRepository: repositoryFromGit(ROOT) });

    // --- 3. build -----------------------------------------------------------
    const config = core.applyAnswers(base, answers);

    const schemaErrors = core.validateSchema(config.schema);
    if (schemaErrors.length > 0) {
      console.error(red('\nThe content model is not valid:'));
      for (const error of schemaErrors) console.error(`  • ${error}`);
      return 1;
    }

    const files = core.renderFiles(config, { url: '', baseurl: '' });
    const target = args.out ? path.resolve(ROOT, args.out) : ROOT;

    // _config.yml holds build mechanics the wizard does not manage (excludes,
    // plugins, defaults). When it already exists, patch the two lines we own
    // instead of overwriting whatever the maintainers have added to it.
    const configFile = path.join(target, '_config.yml');
    if (fs.existsSync(configFile)) {
      files['_config.yml'] = core.patchJekyllConfig(fs.readFileSync(configFile, 'utf8'), config.site).text;
    }

    // --- 4. summary ---------------------------------------------------------
    console.log(bold('\nFiles to write:\n'));
    for (const [relative, content] of Object.entries(files)) {
      console.log(
        `  ${relative.padEnd(42)} ${args.out ? green('new file') : diffSummary(ROOT, relative, content)}`
      );
    }
    console.log('');
    console.log(`  Site        ${bold(config.site.name)}`);
    console.log(
      `  Entries     ${config.schema.entry.singular} / ${config.schema.entry.plural} (${config.schema.fields.length} fields)`
    );
    console.log(
      `  Modules on  ${
        Object.entries(config.site.modules)
          .filter(([, on]) => on)
          .map(([key]) => key)
          .join(', ') || 'none'
      }`
    );
    console.log(`  Repository  ${config.site.github.repository} (${config.site.github.branch})`);
    console.log('');

    if (args.dryRun) {
      console.log(dim('Dry run — nothing was written.\n'));
      return 0;
    }

    if (!args.out) {
      const proceed = await asker.confirm('Write these files?', true);
      if (!proceed) {
        console.log(dim('\nNothing was written.\n'));
        return 0;
      }
    }

    // --- 5. write -----------------------------------------------------------
    const previousSchema = readSchema(ROOT);
    writeFiles(target, files);

    // Writing elsewhere never touches the working tree, so stop here.
    if (args.out) {
      console.log(green(bold('\nDone.')) + ` Wrote ${Object.keys(files).length} files to ${target}\n`);
      return 0;
    }

    // --- 6. demo content ----------------------------------------------------
    // The shipped sample entries were written for the previous entry model. If
    // the schema changed, they will fail validation, so offer to remove them —
    // along with the rest of the demo content and the banner that announces it.
    const schemaChanged =
      JSON.stringify(schemaFieldKeys(previousSchema)) !==
      JSON.stringify(config.schema.fields.map((field) => field.key));
    const sampleEntries = listSampleEntries(ROOT, entryPathFrom(previousSchema));
    if (sampleEntries.length && (schemaChanged || preset.id !== 'current')) {
      const count = `${sampleEntries.length} sample ${sampleEntries.length === 1 ? 'entry' : 'entries'}`;
      const remove = await asker.confirm(
        `Remove the demo content — ${count} under ${entryPathFrom(previousSchema)}/, the sample events, cohort and resources — and switch the governance page off until you have rewritten it?`,
        schemaChanged
      );
      if (remove) {
        for (const line of ejectSummary(ejectSamples(ROOT))) console.log(dim(`  ${line}`));
      } else {
        console.log(dim('  Kept. Run `npm run eject:samples` when you are ready to clear it.'));
      }
    }

    // --- 7. next steps ------------------------------------------------------
    console.log(green(bold('\nDone.')) + ' Next steps:\n');
    console.log(`  1. Review the changes:      ${cyan('git diff')}`);
    console.log(
      `  2. Commit and push:         ${cyan('git add -A && git commit -m "chore: configure site" && git push')}`
    );
    console.log(
      `  3. Enable GitHub Pages:     ${cyan(`https://github.com/${config.site.github.repository}/settings/pages`)}`
    );
    console.log(
      dim(`     Source: "GitHub Actions". The site builds from the ${config.site.github.branch} branch.`)
    );
    console.log('');
    console.log(dim('  To change the entry fields, edit _data/schema.yml and run `npm run generate`'));
    console.log(dim('  (that rebuilds .github/ISSUE_TEMPLATE/new-entry.yml), or use the field editor'));
    console.log(dim('  at /setup/ on the deployed site — no terminal required.'));
    console.log('');
    return 0;
  } finally {
    asker.close();
  }
}

process.exit(await main());
