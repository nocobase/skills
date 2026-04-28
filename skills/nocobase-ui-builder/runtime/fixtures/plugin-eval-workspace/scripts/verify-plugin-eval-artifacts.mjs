#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const baseDir = path.join(root, '.artifacts', 'nocobase-ui-builder');
const scenarioNames = [
  'whole-page-blueprint',
  'localized-reaction-edit',
  'boundary-handoff',
  'filter-search-action-default',
  'route-locator-boundaries',
  'artifact-preview-without-prepare-write',
  'template-reference-scope-routing',
  'whole-page-presuccess-retry',
];

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function listFiles(directoryPath) {
  const names = await fs.readdir(directoryPath);
  return names.sort();
}

async function expectExactFiles(directoryPath, expected, label) {
  const fileNames = await listFiles(directoryPath);
  if (JSON.stringify(fileNames) !== JSON.stringify(expected)) {
    fail(`${label} scenario must leave exactly ${expected.join(', ')}`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function walkJson(value, visitor) {
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      walkJson(item, visitor);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      walkJson(item, visitor);
    }
  }
}

function containsType(value, typeName) {
  let found = false;
  walkJson(value, (node) => {
    if (node && typeof node === 'object' && node.type === typeName) {
      found = true;
    }
  });
  return found;
}

function containsFilterAction(value) {
  let found = false;
  walkJson(value, (node) => {
    if (node === 'filter') {
      found = true;
      return;
    }

    if (!node || typeof node !== 'object') {
      return;
    }

    if (
      node.type === 'filter'
      || node.name === 'filter'
      || node.action === 'filter'
      || node.kind === 'filter'
    ) {
      found = true;
    }
  });
  return found;
}

function textIncludesAll(text, requiredWords, label) {
  for (const requiredWord of requiredWords) {
    if (!new RegExp(requiredWord, 'i').test(text)) {
      fail(`${label} must mention ${requiredWord}`);
    }
  }
}

async function verifyWholePage(directoryPath) {
  const expected = ['blueprint.json', 'prewrite-preview.txt', 'readback-checklist.md'];
  await expectExactFiles(directoryPath, expected, 'whole-page');

  const blueprint = await readJson(path.join(directoryPath, 'blueprint.json'));
  if (!Array.isArray(blueprint.tabs) || blueprint.tabs.length === 0) {
    fail('whole-page blueprint must contain a non-empty tabs array');
  }

  const ascii = await fs.readFile(path.join(directoryPath, 'prewrite-preview.txt'), 'utf8');
  if (!ascii.trim()) {
    fail('whole-page ascii preview must be non-empty');
  }

  const checklist = await fs.readFile(path.join(directoryPath, 'readback-checklist.md'), 'utf8');
  if (!checklist.trim()) {
    fail('whole-page readback checklist must be non-empty');
  }
}

async function verifyReaction(directoryPath) {
  const expected = ['reaction-plan.json', 'readback-checklist.md'];
  await expectExactFiles(directoryPath, expected, 'reaction');

  const jsonText = await fs.readFile(path.join(directoryPath, 'reaction-plan.json'), 'utf8');
  JSON.parse(jsonText);
  if (!/get[- ]?reaction[- ]?meta/i.test(jsonText)) {
    fail('reaction plan must mention get-reaction-meta');
  }
  if (!/(setFieldValueRules|set-field-value-rules)/i.test(jsonText)) {
    fail('reaction plan must mention set-field-value-rules');
  }
  if (!/(setFieldLinkageRules|set-field-linkage-rules)/i.test(jsonText)) {
    fail('reaction plan must mention set-field-linkage-rules');
  }

  const checklist = await fs.readFile(path.join(directoryPath, 'readback-checklist.md'), 'utf8');
  if (!checklist.trim()) {
    fail('reaction checklist must be non-empty');
  }
}

async function verifyBoundary(directoryPath) {
  await expectExactFiles(directoryPath, ['boundary-report.md'], 'boundary');
  const reportPath = path.join(directoryPath, 'boundary-report.md');
  const report = await fs.readFile(reportPath, 'utf8');
  if (!report.trim()) {
    fail('boundary report must be non-empty');
  }

  textIncludesAll(report, ['ACL', 'data-model', 'workflow', 'browser'], 'boundary report');
}

async function verifyFilterSearchActionDefault(directoryPath) {
  await expectExactFiles(directoryPath, ['blueprint.json', 'decision-notes.md'], 'filter/search action default');

  const blueprint = await readJson(path.join(directoryPath, 'blueprint.json'));
  if (containsType(blueprint, 'filterForm')) {
    fail('filter/search action default blueprint must not contain filterForm');
  }

  if (!containsFilterAction(blueprint)) {
    fail('filter/search action default blueprint must contain a host-level filter action');
  }

  const notes = await fs.readFile(path.join(directoryPath, 'decision-notes.md'), 'utf8');
  textIncludesAll(notes, ['filterForm', 'host', 'action'], 'filter/search decision notes');
}

async function verifyRouteLocatorBoundaries(directoryPath) {
  await expectExactFiles(directoryPath, ['locator-map.json', 'readback-checklist.md'], 'route locator boundary');

  const locatorMap = await readJson(path.join(directoryPath, 'locator-map.json'));
  if (!locatorMap.navigation?.routeId) {
    fail('locator map must include navigation.routeId');
  }
  if (!locatorMap.page?.pageSchemaUid) {
    fail('locator map must include page.pageSchemaUid');
  }
  if (!Array.isArray(locatorMap.liveTargets) || locatorMap.liveTargets.length === 0) {
    fail('locator map must include liveTargets with uid entries');
  }
  if (!locatorMap.liveTargets.every((target) => target && typeof target.uid === 'string' && target.uid)) {
    fail('locator map liveTargets entries must include non-empty uid values');
  }

  const checklist = await fs.readFile(path.join(directoryPath, 'readback-checklist.md'), 'utf8');
  textIncludesAll(checklist, ['routeId', 'pageSchemaUid', 'uid'], 'route locator checklist');
}

async function verifyArtifactPreviewWithoutPrepareWrite(directoryPath) {
  await expectExactFiles(
    directoryPath,
    ['blueprint.json', 'preview-policy.json', 'prewrite-preview.txt'],
    'artifact-only preview',
  );

  const blueprint = await readJson(path.join(directoryPath, 'blueprint.json'));
  if (!Array.isArray(blueprint.tabs) || blueprint.tabs.length === 0) {
    fail('artifact-only preview blueprint must contain a non-empty tabs array');
  }

  const preview = await fs.readFile(path.join(directoryPath, 'prewrite-preview.txt'), 'utf8');
  if (!preview.trim()) {
    fail('artifact-only preview text must be non-empty');
  }

  const policy = await readJson(path.join(directoryPath, 'preview-policy.json'));
  if (policy.prepareWriteRequired !== false) {
    fail('artifact-only preview policy must set prepareWriteRequired to false');
  }
  if (policy.previewSource !== 'draft-blueprint') {
    fail('artifact-only preview policy must set previewSource to draft-blueprint');
  }
}

async function verifyTemplateReferenceScopeRouting(directoryPath) {
  await expectExactFiles(
    directoryPath,
    ['readback-checklist.md', 'template-decision.json'],
    'template reference routing',
  );

  const decision = await readJson(path.join(directoryPath, 'template-decision.json'));
  if (decision.autoDetachToCopy !== false) {
    fail('template decision must set autoDetachToCopy to false');
  }
  if (decision.needsClarification !== true) {
    fail('template decision must set needsClarification to true');
  }

  const decisionText = JSON.stringify(decision);
  textIncludesAll(decisionText, ['template', 'host', 'openView'], 'template decision');

  const checklist = await fs.readFile(path.join(directoryPath, 'readback-checklist.md'), 'utf8');
  textIncludesAll(checklist, ['template', 'copy'], 'template readback checklist');
}

async function verifyWholePagePresuccessRetry(directoryPath) {
  await expectExactFiles(
    directoryPath,
    ['prewrite-preview.txt', 'readback-checklist.md', 'retry-plan.json'],
    'whole-page pre-success retry',
  );

  const retryPlan = await readJson(path.join(directoryPath, 'retry-plan.json'));
  if (retryPlan.lowLevelFallbackBeforeSuccess !== false) {
    fail('retry plan must set lowLevelFallbackBeforeSuccess to false');
  }
  if (retryPlan.retryLimit !== 5) {
    fail('retry plan must set retryLimit to 5');
  }
  if (
    !Array.isArray(retryPlan.allowedMutatingWritesBeforeSuccess)
    || retryPlan.allowedMutatingWritesBeforeSuccess.length !== 1
    || retryPlan.allowedMutatingWritesBeforeSuccess[0] !== 'applyBlueprint'
  ) {
    fail('retry plan allowedMutatingWritesBeforeSuccess must contain only applyBlueprint');
  }

  const preview = await fs.readFile(path.join(directoryPath, 'prewrite-preview.txt'), 'utf8');
  if (!preview.trim()) {
    fail('whole-page pre-success retry preview must be non-empty');
  }
}

async function main() {
  const matched = [];

  for (const scenarioName of scenarioNames) {
    const scenarioPath = path.join(baseDir, scenarioName);
    if (await pathExists(scenarioPath)) {
      matched.push({ name: scenarioName, path: scenarioPath });
    }
  }

  if (matched.length !== 1) {
    fail('benchmark verifier expects exactly one scenario artifact directory in .artifacts/nocobase-ui-builder');
  }

  const [{ name, path: scenarioPath }] = matched;
  if (name === 'whole-page-blueprint') {
    await verifyWholePage(scenarioPath);
  } else if (name === 'localized-reaction-edit') {
    await verifyReaction(scenarioPath);
  } else if (name === 'boundary-handoff') {
    await verifyBoundary(scenarioPath);
  } else if (name === 'filter-search-action-default') {
    await verifyFilterSearchActionDefault(scenarioPath);
  } else if (name === 'route-locator-boundaries') {
    await verifyRouteLocatorBoundaries(scenarioPath);
  } else if (name === 'artifact-preview-without-prepare-write') {
    await verifyArtifactPreviewWithoutPrepareWrite(scenarioPath);
  } else if (name === 'template-reference-scope-routing') {
    await verifyTemplateReferenceScopeRouting(scenarioPath);
  } else if (name === 'whole-page-presuccess-retry') {
    await verifyWholePagePresuccessRetry(scenarioPath);
  }

  process.stdout.write(`verified ${name}\n`);
}

await main();
