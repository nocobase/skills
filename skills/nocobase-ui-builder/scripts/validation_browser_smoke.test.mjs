import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadChromium,
  resolvePlaywrightLoader,
  runCase,
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

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `validation-browser-smoke-${label}-`));
}

function createStubPage() {
  const handlers = new Map();
  return {
    gotoCalls: [],
    screenshotPaths: [],
    on(event, handler) {
      handlers.set(event, handler);
    },
    off(event, handler) {
      if (handlers.get(event) === handler) {
        handlers.delete(event);
      }
    },
    async goto(url) {
      this.gotoCalls.push(url);
    },
    async waitForLoadState() {},
    async screenshot({ path: screenshotPath }) {
      this.screenshotPaths.push(screenshotPath);
    },
  };
}

function makeCaseEntry(overrides = {}) {
  return {
    caseId: 'case-1',
    title: 'Case 1',
    expectedOutcome: 'pass',
    buildStatus: 'success',
    guardBlocked: false,
    pageUrl: 'http://example.test/admin/page',
    browseUrl: 'http://example.test/admin/page',
    verifySpecPath: '/tmp/verify-spec.json',
    ...overrides,
  };
}

function createAssertionEvaluator(sequence) {
  let index = 0;
  return async (_page, assertion) => {
    const next = sequence[index] || {};
    index += 1;
    return {
      passed: next.passed !== false,
      kind: assertion?.kind || next.kind || 'stub',
      label: assertion?.label || next.label || 'stub',
      severity: next.severity || assertion?.severity || 'blocking',
    };
  };
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

test('runCase short-circuits guardBlocked cases before browser navigation', async () => {
  const outDir = makeTempDir('blocked');
  const page = createStubPage();

  const result = await runCase(page, makeCaseEntry({ guardBlocked: true }), outDir, {
    readJsonImpl: () => ({
      gatePolicy: {
        stopOnPreOpenBlocker: true,
        stopOnStageFailure: true,
      },
      preOpen: {
        assertions: [{ kind: 'page-reachable' }],
      },
      stages: [
        { id: 'stage-1', assertions: [{ kind: 'bodyTextIncludesAll', values: ['Orders'] }] },
      ],
    }),
  });

  assert.equal(page.gotoCalls.length, 0);
  assert.equal(result.browserStatus, 'blocked');
  assert.equal(result.preOpenPassed, null);
  assert.deepEqual(result.preOpenAssertions, []);
  assert.deepEqual(result.stages, []);
  assert.equal(result.landingPng, '');
});

test('runCase continues after pre-open blocker when gate policy allows it and reports partial', async () => {
  const outDir = makeTempDir('pre-open-continue');
  const page = createStubPage();

  const result = await runCase(page, makeCaseEntry(), outDir, {
    readJsonImpl: () => ({
      gatePolicy: {
        stopOnPreOpenBlocker: false,
        stopOnStageFailure: true,
      },
      preOpen: {
        assertions: [{ kind: 'page-reachable', severity: 'warning' }],
      },
      stages: [
        { id: 'stage-1', assertions: [{ kind: 'bodyTextIncludesAll', values: ['Orders'] }] },
      ],
    }),
    delayImpl: async () => {},
    dismissNoiseImpl: async () => {},
    evaluateAssertionImpl: createAssertionEvaluator([
      { passed: false, severity: 'warning' },
      { passed: true },
    ]),
    runTriggerImpl: async () => ({ ok: true }),
    runWaitForImpl: async () => ({ ok: true }),
  });

  assert.equal(result.preOpenPassed, false);
  assert.equal(result.stages.length, 1);
  assert.equal(result.stages[0].passed, true);
  assert.equal(result.browserStatus, 'partial');
});

test('runCase stops after pre-open blocker when gate policy requires it', async () => {
  const outDir = makeTempDir('pre-open-stop');
  const page = createStubPage();

  const result = await runCase(page, makeCaseEntry(), outDir, {
    readJsonImpl: () => ({
      gatePolicy: {
        stopOnPreOpenBlocker: true,
        stopOnStageFailure: true,
      },
      preOpen: {
        assertions: [{ kind: 'page-reachable', severity: 'warning' }],
      },
      stages: [
        { id: 'stage-1', assertions: [{ kind: 'bodyTextIncludesAll', values: ['Orders'] }] },
      ],
    }),
    delayImpl: async () => {},
    dismissNoiseImpl: async () => {},
    evaluateAssertionImpl: createAssertionEvaluator([
      { passed: false, severity: 'warning' },
    ]),
    runTriggerImpl: async () => ({ ok: true }),
    runWaitForImpl: async () => ({ ok: true }),
  });

  assert.equal(result.preOpenPassed, false);
  assert.equal(result.stages.length, 0);
  assert.equal(result.browserStatus, 'failed');
});

test('runCase continues after mandatory stage failure when gate policy allows it', async () => {
  const outDir = makeTempDir('stage-continue');
  const page = createStubPage();

  const result = await runCase(page, makeCaseEntry(), outDir, {
    readJsonImpl: () => ({
      gatePolicy: {
        stopOnPreOpenBlocker: true,
        stopOnStageFailure: false,
      },
      preOpen: {
        assertions: [{ kind: 'page-reachable' }],
      },
      stages: [
        { id: 'stage-1', mandatory: true, assertions: [{ kind: 'bodyTextIncludesAll', values: ['Orders'] }] },
        { id: 'stage-2', mandatory: true, assertions: [{ kind: 'bodyTextIncludesAll', values: ['Done'] }] },
      ],
    }),
    delayImpl: async () => {},
    dismissNoiseImpl: async () => {},
    evaluateAssertionImpl: createAssertionEvaluator([
      { passed: true },
      { passed: false, severity: 'blocking' },
      { passed: true },
    ]),
    runTriggerImpl: async () => ({ ok: true }),
    runWaitForImpl: async () => ({ ok: true }),
  });

  assert.equal(result.stages.length, 2);
  assert.equal(result.stages[0].passed, false);
  assert.equal(result.stages[1].passed, true);
  assert.equal(result.browserStatus, 'partial');
});

test('runCase stops after mandatory stage failure when gate policy requires it', async () => {
  const outDir = makeTempDir('stage-stop');
  const page = createStubPage();

  const result = await runCase(page, makeCaseEntry(), outDir, {
    readJsonImpl: () => ({
      gatePolicy: {
        stopOnPreOpenBlocker: true,
        stopOnStageFailure: true,
      },
      preOpen: {
        assertions: [{ kind: 'page-reachable' }],
      },
      stages: [
        { id: 'stage-1', mandatory: true, assertions: [{ kind: 'bodyTextIncludesAll', values: ['Orders'] }] },
        { id: 'stage-2', mandatory: true, assertions: [{ kind: 'bodyTextIncludesAll', values: ['Done'] }] },
      ],
    }),
    delayImpl: async () => {},
    dismissNoiseImpl: async () => {},
    evaluateAssertionImpl: createAssertionEvaluator([
      { passed: true },
      { passed: false, severity: 'blocking' },
    ]),
    runTriggerImpl: async () => ({ ok: true }),
    runWaitForImpl: async () => ({ ok: true }),
  });

  assert.equal(result.stages.length, 1);
  assert.equal(result.stages[0].passed, false);
  assert.equal(result.browserStatus, 'partial');
});
