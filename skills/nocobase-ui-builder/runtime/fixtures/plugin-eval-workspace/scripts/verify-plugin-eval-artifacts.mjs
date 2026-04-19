#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const baseDir = path.join(root, '.artifacts', 'nocobase-ui-builder');
const scenarioNames = ['whole-page-blueprint', 'localized-reaction-edit', 'boundary-handoff'];

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

async function verifyWholePage(directoryPath) {
  const fileNames = await listFiles(directoryPath);
  const expected = ['blueprint.json', 'prewrite-preview.txt', 'readback-checklist.md'];
  if (JSON.stringify(fileNames) !== JSON.stringify(expected)) {
    fail('whole-page scenario must leave exactly blueprint.json, prewrite-preview.txt, and readback-checklist.md');
  }

  const blueprint = JSON.parse(await fs.readFile(path.join(directoryPath, 'blueprint.json'), 'utf8'));
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
  const fileNames = await listFiles(directoryPath);
  const expected = ['reaction-plan.json', 'readback-checklist.md'];
  if (JSON.stringify(fileNames) !== JSON.stringify(expected)) {
    fail('reaction scenario must leave exactly reaction-plan.json and readback-checklist.md');
  }

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
  const reportPath = path.join(directoryPath, 'boundary-report.md');
  if (!(await pathExists(reportPath))) {
    fail('boundary scenario must leave boundary-report.md');
  }

  const report = await fs.readFile(reportPath, 'utf8');
  if (!report.trim()) {
    fail('boundary report must be non-empty');
  }

  for (const requiredWord of ['ACL', 'data-model', 'workflow', 'browser']) {
    if (!new RegExp(requiredWord, 'i').test(report)) {
      fail(`boundary report must mention ${requiredWord}`);
    }
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
  } else {
    await verifyBoundary(scenarioPath);
  }

  process.stdout.write(`verified ${name}\n`);
}

await main();
