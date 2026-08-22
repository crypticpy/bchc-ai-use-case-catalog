import fs from 'node:fs';
import path from 'node:path';

export function expectedToolchain(root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const packageManager = String(packageJson.packageManager ?? '').match(/^npm@(.+)$/)?.[1] ?? '';
  const lockText = fs.readFileSync(path.join(root, 'Gemfile.lock'), 'utf8');
  const bundler = lockText.match(/BUNDLED WITH\s+([\d.]+)\s*$/)?.[1] ?? '';
  return {
    node: fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim(),
    npm: packageManager,
    ruby: fs.readFileSync(path.join(root, '.ruby-version'), 'utf8').trim(),
    bundler,
  };
}

export function parseToolVersions({ node, npm, ruby, bundler }) {
  return {
    node: String(node).match(/v?(\d+\.\d+\.\d+)/)?.[1] ?? '',
    npm: String(npm).match(/(\d+\.\d+\.\d+)/)?.[1] ?? '',
    ruby: String(ruby).match(/ruby\s+(\d+\.\d+\.\d+)/)?.[1] ?? '',
    // Bundler 4 prints only the version number; Bundler 2/3 prefix it with
    // "Bundler version". Accept both while still requiring an exact triplet.
    bundler: String(bundler).match(/(?:Bundler version\s+)?(\d+\.\d+\.\d+)/i)?.[1] ?? '',
  };
}
