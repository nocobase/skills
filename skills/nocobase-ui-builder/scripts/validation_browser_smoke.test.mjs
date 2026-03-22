import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadChromium,
  resolvePlaywrightLoader,
} from './validation_browser_smoke.mjs';

function createStubRequire({ resolvedValue = '', exportsValue = undefined, throwsResolve = false } = {}) {
  const requireFn = (request) => {
    if (exportsValue === undefined) {
      throw new Error(`Unexpected require: ${request}`);
    }
    return exportsValue;
  };
  requireFn.resolve = (request) => {
    if (throwsResolve) {
      throw new Error(`Cannot resolve ${request}`);
    }
    return resolvedValue || request;
  };
  return requireFn;
}

test('resolvePlaywrightLoader prefers PLAYWRIGHT_PACKAGE_PATH when provided', () => {
  const baseRequire = createStubRequire({ exportsValue: { chromium: {} } });
  const loader = resolvePlaywrightLoader({
    env: { PLAYWRIGHT_PACKAGE_PATH: './vendor/playwright' },
    cwd: '/tmp/project',
    baseRequire,
    cwdRequire: createStubRequire({ throwsResolve: true }),
  });

  assert.equal(loader.source, 'env');
  assert.equal(loader.request, path.resolve('/tmp/project', 'vendor/playwright'));
});

test('resolvePlaywrightLoader falls back to cwd resolution before script resolution', () => {
  const cwdRequire = createStubRequire({ resolvedValue: '/tmp/project/node_modules/playwright/index.js', exportsValue: { chromium: {} } });
  const baseRequire = createStubRequire({ resolvedValue: '/tmp/script/node_modules/playwright/index.js', exportsValue: { chromium: {} } });

  const loader = resolvePlaywrightLoader({
    env: {},
    cwd: '/tmp/project',
    cwdRequire,
    baseRequire,
  });

  assert.equal(loader.source, 'cwd');
  assert.equal(loader.request, 'playwright');
  assert.equal(loader.requireFn, cwdRequire);
});

test('resolvePlaywrightLoader falls back to script resolution when cwd resolution is unavailable', () => {
  const loader = resolvePlaywrightLoader({
    env: {},
    cwd: '/tmp/project',
    cwdRequire: createStubRequire({ throwsResolve: true }),
    baseRequire: createStubRequire({ resolvedValue: '/tmp/script/node_modules/playwright/index.js', exportsValue: { chromium: {} } }),
  });

  assert.equal(loader.source, 'script');
  assert.equal(loader.request, 'playwright');
});

test('resolvePlaywrightLoader throws a clear error when playwright cannot be resolved', () => {
  assert.throws(
    () => resolvePlaywrightLoader({
      env: {},
      cwd: '/tmp/project',
      cwdRequire: createStubRequire({ throwsResolve: true }),
      baseRequire: createStubRequire({ throwsResolve: true }),
    }),
    /Unable to resolve "playwright"/,
  );
});

test('loadChromium loads chromium export from PLAYWRIGHT_PACKAGE_PATH', () => {
  const moduleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-stub-'));
  fs.writeFileSync(path.join(moduleDir, 'package.json'), `${JSON.stringify({ name: 'playwright-stub', main: 'index.cjs' })}\n`, 'utf8');
  fs.writeFileSync(path.join(moduleDir, 'index.cjs'), 'module.exports = { chromium: { name: "stub-chromium" } };\n', 'utf8');

  const chromium = loadChromium({
    env: { PLAYWRIGHT_PACKAGE_PATH: moduleDir },
  });

  assert.deepEqual(chromium, { name: 'stub-chromium' });
});
