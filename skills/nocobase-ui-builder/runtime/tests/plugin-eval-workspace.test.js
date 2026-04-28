import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const verifierPath = fileURLToPath(
  new URL('../fixtures/plugin-eval-workspace/scripts/verify-plugin-eval-artifacts.mjs', import.meta.url),
);
const fixtureWorkspacePath = fileURLToPath(new URL('../fixtures/plugin-eval-workspace', import.meta.url));

async function withTempWorkspace(run) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nb-ui-builder-plugin-eval-'));
  try {
    await run(tempRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function runVerifier(cwd) {
  return spawnSync(process.execPath, [verifierPath], {
    cwd,
    encoding: 'utf8',
  });
}

test('plugin eval verifier accepts whole-page artifacts', async () => {
  await withTempWorkspace(async (tempRoot) => {
    const outputDir = path.join(tempRoot, '.artifacts', 'nocobase-ui-builder', 'whole-page-blueprint');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'blueprint.json'),
      `${JSON.stringify({ tabs: [{ key: 'mainTab', blocks: [{ type: 'table' }] }] }, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(path.join(outputDir, 'prewrite-preview.txt'), 'ASCII PREVIEW', 'utf8');
    await fs.writeFile(path.join(outputDir, 'readback-checklist.md'), '# checklist\n', 'utf8');

    const result = runVerifier(tempRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /verified whole-page-blueprint/i);
  });
});

test('plugin eval verifier accepts reaction artifacts', async () => {
  await withTempWorkspace(async (tempRoot) => {
    const outputDir = path.join(tempRoot, '.artifacts', 'nocobase-ui-builder', 'localized-reaction-edit');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'reaction-plan.json'),
      `${JSON.stringify(
        {
          steps: ['get-reaction-meta', 'set-field-value-rules', 'set-field-linkage-rules'],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await fs.writeFile(path.join(outputDir, 'readback-checklist.md'), '# checklist\n', 'utf8');

    const result = runVerifier(tempRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /verified localized-reaction-edit/i);
  });
});

test('plugin eval verifier accepts boundary artifacts', async () => {
  await withTempWorkspace(async (tempRoot) => {
    const outputDir = path.join(tempRoot, '.artifacts', 'nocobase-ui-builder', 'boundary-handoff');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'boundary-report.md'),
      'Handoff ACL, data-model, workflow, and browser work to the matching skills.\n',
      'utf8',
    );

    const result = runVerifier(tempRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /verified boundary-handoff/i);
  });
});

test('plugin eval verifier rejects mixed scenario outputs', async () => {
  await withTempWorkspace(async (tempRoot) => {
    const wholePageDir = path.join(tempRoot, '.artifacts', 'nocobase-ui-builder', 'whole-page-blueprint');
    const reactionDir = path.join(tempRoot, '.artifacts', 'nocobase-ui-builder', 'localized-reaction-edit');
    await fs.mkdir(wholePageDir, { recursive: true });
    await fs.mkdir(reactionDir, { recursive: true });
    await fs.writeFile(path.join(wholePageDir, 'blueprint.json'), '{"tabs":[{}]}', 'utf8');
    await fs.writeFile(path.join(wholePageDir, 'prewrite-preview.txt'), 'ascii', 'utf8');
    await fs.writeFile(path.join(wholePageDir, 'readback-checklist.md'), '# checklist\n', 'utf8');
    await fs.writeFile(path.join(reactionDir, 'reaction-plan.json'), '{"steps":["get-reaction-meta","set-field-value-rules","set-field-linkage-rules"]}', 'utf8');
    await fs.writeFile(path.join(reactionDir, 'readback-checklist.md'), '# checklist\n', 'utf8');

    const result = runVerifier(tempRoot);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /exactly one scenario artifact directory/i);
  });
});

test('plugin eval fixture remains a local verifier fixture, not a benchmark config owner', async () => {
  const workspaceInstructions = await fs.readFile(path.join(fixtureWorkspacePath, 'AGENTS.md'), 'utf8');
  const workspaceNotes = await fs.readFile(path.join(fixtureWorkspacePath, 'WORKSPACE.txt'), 'utf8');

  assert.match(workspaceInstructions, /Do not enumerate installed skill directories/i);
  assert.match(workspaceInstructions, /named quick-route doc/i);
  assert.match(workspaceNotes, /local verifier fixture/i);
  assert.match(workspaceNotes, /not the benchmark source of truth/i);
  assert.match(workspaceNotes, /Centralized benchmark packs live in .*nb-eval\/packs/i);
});
