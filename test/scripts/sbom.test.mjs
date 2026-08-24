import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSbom, gemComponents, npmComponents } from '../../scripts/sbom.mjs';

test('npm and gem lock entries become stable package URLs', () => {
  assert.equal(
    npmComponents({ packages: { 'node_modules/example': { version: '1.2.3', license: 'MIT' } } })[0].purl,
    'pkg:npm/example@1.2.3'
  );
  assert.equal(
    gemComponents('GEM\n  specs:\n    jekyll (4.4.1)\n      dependency\n\nPLATFORMS\n')[0].purl,
    'pkg:gem/jekyll@4.4.1'
  );
});

test('duplicate npm package versions collapse while retaining every lockfile path', () => {
  const components = npmComponents({
    packages: {
      'node_modules/example': { version: '1.2.3', license: 'MIT' },
      'node_modules/tool/node_modules/example': { version: '1.2.3', license: 'MIT' },
    },
  });
  assert.equal(components.length, 1);
  assert.deepEqual(
    components[0].properties.map(({ value }) => value),
    ['node_modules/example', 'node_modules/tool/node_modules/example']
  );
});

test('Ruby platform variants receive distinct qualified package URLs', () => {
  const components = gemComponents(
    'GEM\n  specs:\n    ffi (1.17.4)\n    ffi (1.17.4-arm64-darwin)\n    ffi (1.17.4-x86_64-linux-gnu)\n\nPLATFORMS\n'
  );
  assert.deepEqual(
    components.map(({ purl }) => purl),
    [
      'pkg:gem/ffi@1.17.4',
      'pkg:gem/ffi@1.17.4?platform=arm64-darwin',
      'pkg:gem/ffi@1.17.4?platform=x86_64-linux-gnu',
    ]
  );
});

test('CycloneDX root depends on every locked component', () => {
  const sbom = buildSbom(
    { name: 'phct', version: '1.0.0' },
    { packages: { 'node_modules/example': { version: '1.2.3', license: 'MIT' } } },
    'GEM\n  specs:\n    jekyll (4.4.1)\n\nPLATFORMS\n'
  );
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.equal(sbom.dependencies[0].dependsOn.length, 2);
  const references = [
    sbom.metadata.component['bom-ref'],
    ...sbom.components.map((component) => component['bom-ref']),
  ];
  assert.equal(new Set(references).size, references.length);
});

test('CycloneDX generation fails closed when the application reference collides', () => {
  assert.throws(
    () =>
      buildSbom(
        { name: 'example', version: '1.2.3' },
        { packages: { 'node_modules/example': { version: '1.2.3' } } },
        'GEM\n  specs:\n\nPLATFORMS\n'
      ),
    /bom-ref values must be unique/
  );
});
