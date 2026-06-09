import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

test('runtime public surface only exposes template decision helper', async () => {
  const runtimePackage = JSON.parse(readFileSync(path.join(skillRoot, 'runtime/package.json'), 'utf8'));

  assert.deepEqual(Object.keys(runtimePackage.bin || {}), ['nb-template-decision']);
  assert.equal(
    existsSync(path.join(skillRoot, 'runtime', runtimePackage.bin['nb-template-decision'])),
    true,
    'nb-template-decision bin target should exist',
  );
  assert.equal(
    existsSync(path.join(skillRoot, 'runtime/bin/nb-runjs.mjs')),
    false,
    'nb-runjs should not be exposed as a local helper CLI',
  );

  const runtimeExports = await import('../src/index.js');
  assert.deepEqual(Object.keys(runtimeExports).sort(), [
    'planTemplateQuery',
    'selectTemplateDecision',
    'summarizeTemplateDecision',
  ]);
});
