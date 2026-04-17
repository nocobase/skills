#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DEFAULT_ADMIN_BASE = 'http://127.0.0.1:23000';
const DEFAULT_TIMEOUT_MS = 15000;
const BROWSER_EXECUTABLE_CANDIDATES = [
  process.env.CHROME_EXECUTABLE_PATH || '',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const NON_BLOCKING_RUNTIME_PATTERNS = [
  /^Warning: \[antd:/,
  /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/,
  /^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/,
  /^AxiosError$/,
  /^Critical dependency:/,
  /^Should not import the named export/,
  /^quill Overwriting/,
  /^\[NocoBase\] @nocobase\/plugin-mobile is deprecated/,
  /^FlowEngine: Model class with name '.+' is already registered and will be overwritten\.$/,
  /^FlowEngine: resolveUse circular reference detected on '.+'\.$/,
  /^Action 'openView' is already registered\. It will be overwritten\.$/,
  /^Error calling global variable function for key: \$env /,
];
const BLOCKING_RUNTIME_PATTERNS = [
  /ReferenceError:/,
  /TypeError:/,
  /Unhandled Rejection/i,
  /Cannot read properties of undefined/,
];

const scriptRequire = createRequire(import.meta.url);

function usage() {
  return [
    'Usage:',
    '  node scripts/validation_browser_smoke.mjs run-suite --suite-summary-file <path> [--out-dir <dir>] [--admin-base <url>]',
  ].join('\n');
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    return { command: 'help', flags: {} };
  }
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { command, flags };
}

function normalizeRequiredText(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function buildCwdRequire(cwd) {
  const resolvedCwd = path.resolve(normalizeOptionalText(cwd) || process.cwd());
  return createRequire(path.join(resolvedCwd, '__validation_browser_smoke__.cjs'));
}

export function resolvePlaywrightLoader({
  env = process.env,
  cwd = process.cwd(),
  cwdRequire,
  baseRequire = scriptRequire,
} = {}) {
  const explicitPath = normalizeOptionalText(env?.PLAYWRIGHT_PACKAGE_PATH);
  if (explicitPath) {
    const resolvedExplicitPath = path.isAbsolute(explicitPath)
      ? explicitPath
      : path.resolve(normalizeOptionalText(cwd) || process.cwd(), explicitPath);
    return {
      source: 'env',
      request: resolvedExplicitPath,
      requireFn: baseRequire,
    };
  }

  const effectiveCwdRequire = cwdRequire || buildCwdRequire(cwd);
  try {
    effectiveCwdRequire.resolve('playwright');
    return {
      source: 'cwd',
      request: 'playwright',
      requireFn: effectiveCwdRequire,
    };
  } catch {
    // Fall through to script-level resolution.
  }

  try {
    baseRequire.resolve('playwright');
    return {
      source: 'script',
      request: 'playwright',
      requireFn: baseRequire,
    };
  } catch {
    throw new Error('Unable to resolve "playwright". Install it in the current environment or set PLAYWRIGHT_PACKAGE_PATH.');
  }
}

export function loadChromium(options = {}) {
  const loader = resolvePlaywrightLoader(options);
  const moduleExports = loader.requireFn(loader.request);
  if (!moduleExports?.chromium) {
    throw new Error(`Resolved Playwright from ${loader.source}, but "chromium" export is missing.`);
  }
  return moduleExports.chromium;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveBrowserExecutablePath() {
  return BROWSER_EXECUTABLE_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function isNonBlockingRuntimeMessage(message) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) {
    return true;
  }
  return NON_BLOCKING_RUNTIME_PATTERNS.some((pattern) => pattern.test(text));
}

function isBlockingRuntimeMessage(message) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || isNonBlockingRuntimeMessage(text)) {
    return false;
  }
  return BLOCKING_RUNTIME_PATTERNS.some((pattern) => pattern.test(text));
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function bodyText(page) {
  try {
    return await page.locator('body').innerText();
  } catch {
    return '';
  }
}

async function dismissNoise(page) {
  await page.keyboard.press('Escape').catch(() => {});
  const closePatterns = [/close/i, /关闭/, /ok/i, /确定/, /知道了/, /got it/i];
  for (const pattern of closePatterns) {
    const locator = page.getByRole('button', { name: pattern }).first();
    try {
      if (await locator.isVisible({ timeout: 300 })) {
        await locator.click({ timeout: 1000 });
        await delay(300);
      }
    } catch {
      // Ignore modal noise cleanup failures.
    }
  }
}

async function waitForBodyIncludesAll(page, values, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const expected = (Array.isArray(values) ? values : []).filter(Boolean);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const text = await bodyText(page);
    if (expected.every((item) => text.includes(item))) {
      return {
        ok: true,
        bodyText: text,
      };
    }
    await delay(400);
  }
  return {
    ok: false,
    bodyText: await bodyText(page),
  };
}

async function waitForBodyIncludesAny(page, values, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const expected = (Array.isArray(values) ? values : []).filter(Boolean);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const text = await bodyText(page);
    if (expected.some((item) => text.includes(item))) {
      return {
        ok: true,
        bodyText: text,
      };
    }
    await delay(400);
  }
  return {
    ok: false,
    bodyText: await bodyText(page),
  };
}

async function clickByText(page, text) {
  const candidates = [
    page.getByRole('tab', { name: text, exact: true }).first(),
    page.getByRole('button', { name: text, exact: true }).first(),
    page.getByRole('link', { name: text, exact: true }).first(),
    page.getByText(text, { exact: true }).first(),
    page.getByText(text).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.isVisible({ timeout: 500 })) {
        await locator.click({ timeout: 2000 });
        return true;
      }
    } catch {
      // Try next selector.
    }
  }
  return false;
}

async function ensureSignedIn(page, adminBase) {
  const signinUrl = `${adminBase.replace(/\/+$/, '')}/signin`;
  await page.goto(signinUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  if (!page.url().includes('/signin')) {
    return;
  }
  await page.getByPlaceholder('Username/Email').fill('admin@nocobase.com');
  await page.getByPlaceholder('Password').fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 20000 });
  await delay(1000);
}

function normalizeAssertions(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAssertionSeverity(assertion) {
  const severity = normalizeOptionalText(assertion?.severity);
  return severity || 'blocking';
}

export function normalizeGatePolicy(verifySpec = {}) {
  const gatePolicy = verifySpec?.gatePolicy && typeof verifySpec.gatePolicy === 'object'
    ? verifySpec.gatePolicy
    : {};
  return {
    stopOnBuildGateFailure: gatePolicy.stopOnBuildGateFailure !== false,
    stopOnPreOpenBlocker: gatePolicy.stopOnPreOpenBlocker !== false,
    stopOnStageFailure: gatePolicy.stopOnStageFailure !== false,
  };
}

function isBlockingAssertionFailure(assertionResult) {
  if (!assertionResult || assertionResult.passed !== false) {
    return false;
  }
  const severity = normalizeAssertionSeverity(assertionResult);
  // Browser smoke remains strict: warning findings still block runtime usability.
  return severity === 'warning' || severity === 'blocking' || Boolean(severity);
}

function assertionsPassed(assertionResults) {
  return !assertionResults.some((item) => isBlockingAssertionFailure(item));
}

function buildGuardBlockedCaseResult(caseEntry) {
  return {
    caseId: caseEntry.caseId,
    title: caseEntry.title,
    expectedOutcome: caseEntry.expectedOutcome,
    buildStatus: caseEntry.buildStatus,
    guardBlocked: caseEntry.guardBlocked,
    pageUrl: caseEntry.pageUrl,
    browseUrl: caseEntry.browseUrl,
    browserStatus: 'blocked',
    preOpenPassed: null,
    preOpenAssertions: [],
    stages: [],
    landingPng: '',
    runtimeErrors: [],
  };
}

export function determineBrowserStatus({
  guardBlocked,
  preOpenPassed,
  stages,
  runtimeErrors,
}) {
  if (guardBlocked) {
    return 'blocked';
  }
  if (Array.isArray(runtimeErrors) && runtimeErrors.length > 0) {
    return 'failed';
  }
  const stageItems = Array.isArray(stages) ? stages : [];
  const stagePassCount = stageItems.filter((item) => item?.passed).length;
  const stageFailureCount = stageItems.length - stagePassCount;
  const hasFailure = preOpenPassed === false || stageFailureCount > 0;
  const hasSuccessEvidence = preOpenPassed === true || stagePassCount > 0;
  if (hasFailure && hasSuccessEvidence) {
    return 'partial';
  }
  if (hasFailure) {
    return 'failed';
  }
  return 'success';
}

async function evaluateAssertion(page, assertion) {
  const severity = normalizeAssertionSeverity(assertion);
  if (!assertion || typeof assertion !== 'object') {
    return { passed: true, kind: 'unknown', severity };
  }
  if (assertion.kind === 'page-reachable') {
    return {
      passed: !page.url().includes('/signin'),
      kind: assertion.kind,
      label: assertion.label || assertion.kind,
      severity,
    };
  }
  if (assertion.kind === 'bodyTextIncludesAll') {
    const values = Array.isArray(assertion.values) ? assertion.values : [];
    const result = await waitForBodyIncludesAll(page, values);
    return {
      passed: result.ok,
      kind: assertion.kind,
      label: assertion.label || assertion.kind,
      values,
      severity,
    };
  }
  if (assertion.kind === 'bodyTextIncludesAny') {
    const values = Array.isArray(assertion.values) ? assertion.values : [];
    const result = await waitForBodyIncludesAny(page, values);
    return {
      passed: result.ok,
      kind: assertion.kind,
      label: assertion.label || assertion.kind,
      values,
      severity,
    };
  }
  return {
    passed: true,
    kind: assertion.kind,
    label: assertion.label || assertion.kind,
    severity,
  };
}

async function runTrigger(page, trigger) {
  if (!trigger || typeof trigger !== 'object' || trigger.kind === 'noop') {
    return { ok: true };
  }
  if (['focus-filter', 'click-tab', 'click-action', 'click-row-action'].includes(trigger.kind)) {
    const ok = await clickByText(page, trigger.text);
    if (ok) {
      await delay(600);
      return { ok };
    }
    return { ok, reason: 'action-not-found' };
  }
  return { ok: false, reason: `unsupported-trigger:${trigger.kind}` };
}

async function runWaitFor(page, waitFor) {
  if (!waitFor || typeof waitFor !== 'object') {
    return { ok: true };
  }
  if (waitFor.kind === 'bodyTextIncludesAll') {
    return waitForBodyIncludesAll(page, waitFor.values);
  }
  return { ok: false, reason: `unsupported-wait:${waitFor.kind}` };
}

export async function runCase(page, caseEntry, suiteOutDir, options = {}) {
  const readJsonImpl = typeof options.readJsonImpl === 'function' ? options.readJsonImpl : readJson;
  const writeJsonImpl = typeof options.writeJsonImpl === 'function' ? options.writeJsonImpl : writeJson;
  const delayImpl = typeof options.delayImpl === 'function' ? options.delayImpl : delay;
  const dismissNoiseImpl = typeof options.dismissNoiseImpl === 'function' ? options.dismissNoiseImpl : dismissNoise;
  const evaluateAssertionImpl = typeof options.evaluateAssertionImpl === 'function' ? options.evaluateAssertionImpl : evaluateAssertion;
  const runTriggerImpl = typeof options.runTriggerImpl === 'function' ? options.runTriggerImpl : runTrigger;
  const runWaitForImpl = typeof options.runWaitForImpl === 'function' ? options.runWaitForImpl : runWaitFor;
  const verifySpec = readJsonImpl(caseEntry.verifySpecPath);
  const gatePolicy = normalizeGatePolicy(verifySpec);
  const caseOutDir = path.join(suiteOutDir, caseEntry.caseId);
  ensureDir(caseOutDir);

  if (caseEntry.guardBlocked) {
    const caseResult = buildGuardBlockedCaseResult(caseEntry);
    writeJsonImpl(path.join(caseOutDir, 'result.json'), caseResult);
    return caseResult;
  }

  const runtimeErrors = [];
  const onPageError = (error) => {
    const message = error?.stack || error?.message || String(error);
    if (isBlockingRuntimeMessage(message)) {
      runtimeErrors.push({
        source: 'pageerror',
        message,
      });
    }
  };
  const onConsole = (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') {
      return;
    }
    const message = msg.text();
    if (isBlockingRuntimeMessage(message)) {
      runtimeErrors.push({
        source: `console:${type}`,
        message,
      });
    }
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  try {
    await page.goto(caseEntry.browseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await delayImpl(800);
    await dismissNoiseImpl(page);

    const landingPng = path.join(caseOutDir, 'landing.png');
    await page.screenshot({ path: landingPng, fullPage: true });

    const preOpenAssertions = [];
    for (const assertion of normalizeAssertions(verifySpec.preOpen?.assertions)) {
      preOpenAssertions.push(await evaluateAssertionImpl(page, assertion));
    }
    const preOpenPassed = assertionsPassed(preOpenAssertions);

    const stages = [];
    let stopped = !preOpenPassed && gatePolicy.stopOnPreOpenBlocker;
    if (!stopped) {
      for (const stage of Array.isArray(verifySpec.stages) ? verifySpec.stages : []) {
        const triggerResult = await runTriggerImpl(page, stage.trigger);
        let waitResult = { ok: true };
        if (triggerResult.ok) {
          waitResult = await runWaitForImpl(page, stage.waitFor);
        }
        const stageAssertions = [];
        for (const assertion of normalizeAssertions(stage.assertions)) {
          stageAssertions.push(await evaluateAssertionImpl(page, assertion));
        }
        const passed = triggerResult.ok && waitResult.ok && assertionsPassed(stageAssertions);
        const screenshotPath = path.join(caseOutDir, `${stage.id || 'stage'}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        stages.push({
          id: stage.id || '',
          title: stage.title || '',
          trigger: stage.trigger || null,
          waitFor: stage.waitFor || null,
          triggerOk: triggerResult.ok,
          waitOk: waitResult.ok,
          assertions: stageAssertions,
          passed,
          screenshotPath,
        });
        if (!passed && stage.mandatory !== false && gatePolicy.stopOnStageFailure) {
          stopped = true;
          break;
        }
      }
    }

    const browserStatus = determineBrowserStatus({
      guardBlocked: caseEntry.guardBlocked,
      preOpenPassed,
      stages,
      runtimeErrors,
    });

    const caseResult = {
      caseId: caseEntry.caseId,
      title: caseEntry.title,
      expectedOutcome: caseEntry.expectedOutcome,
      buildStatus: caseEntry.buildStatus,
      guardBlocked: caseEntry.guardBlocked,
      pageUrl: caseEntry.pageUrl,
      browseUrl: caseEntry.browseUrl,
      browserStatus,
      preOpenPassed,
      preOpenAssertions,
      stages,
      landingPng,
      runtimeErrors,
    };
    writeJsonImpl(path.join(caseOutDir, 'result.json'), caseResult);
    return caseResult;
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}

function evaluateExpectation(caseResult) {
  if (caseResult.expectedOutcome === 'pass') {
    return caseResult.buildStatus === 'success' && caseResult.browserStatus === 'success';
  }
  if (caseResult.expectedOutcome === 'partial') {
    return caseResult.browserStatus === 'success' || caseResult.browserStatus === 'partial';
  }
  if (caseResult.expectedOutcome === 'blocker-expected') {
    return caseResult.guardBlocked
      || caseResult.browserStatus === 'blocked'
      || caseResult.browserStatus === 'success';
  }
  return false;
}

async function runSuite(flags) {
  const suiteSummaryFile = path.resolve(normalizeRequiredText(flags['suite-summary-file'], 'suite summary file'));
  const suiteSummary = readJson(suiteSummaryFile);
  const outDir = path.resolve(normalizeOptionalText(flags['out-dir']) || path.join(path.dirname(suiteSummaryFile), 'browser-smoke'));
  const adminBase = normalizeOptionalText(flags['admin-base']) || DEFAULT_ADMIN_BASE;
  ensureDir(outDir);

  const executablePath = resolveBrowserExecutablePath();
  const chromium = loadChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  try {
    await ensureSignedIn(page, adminBase);
    const caseResults = [];
    for (const caseEntry of Array.isArray(suiteSummary.cases) ? suiteSummary.cases : []) {
      caseResults.push(await runCase(page, caseEntry, outDir));
    }

    const normalizedCases = caseResults.map((item) => ({
      ...item,
      passedExpectation: evaluateExpectation(item),
    }));
    const passed = normalizedCases.filter((item) => item.passedExpectation).length;
    const report = {
      generatedAt: new Date().toISOString(),
      suiteSummaryFile,
      outDir,
      adminBase,
      passed,
      total: normalizedCases.length,
      rate: normalizedCases.length === 0 ? 0 : passed / normalizedCases.length,
      cases: normalizedCases,
    };
    const reportPath = path.join(outDir, 'browser-smoke-report.json');
    writeJson(reportPath, report);
    process.stdout.write(`${JSON.stringify({ reportPath, passed, total: report.total, rate: report.rate }, null, 2)}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === 'run-suite') {
    await runSuite(flags);
    return;
  }
  throw new Error(`Unsupported command "${command}"`);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  });
}
