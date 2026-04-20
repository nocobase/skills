import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { planTemplateQuery, selectTemplateDecision } from '../src/template-selection.js';
import { runTemplateSelectionCli } from '../src/template-selection-cli.js';

function createMemoryStream() {
  const stream = new PassThrough();
  let output = '';
  stream.on('data', (chunk) => {
    output += chunk.toString('utf8');
  });
  return {
    stream,
    read() {
      return output;
    },
  };
}

function createInputStream(text) {
  const stream = new PassThrough();
  stream.end(text);
  return stream;
}

function buildRolePopupScene(overrides = {}) {
  return {
    templateType: 'popup',
    repeatEligible: true,
    context: {
      sourceCollectionName: 'users',
      collectionName: 'roles',
      associationName: 'users.roles',
      fieldPath: 'roles',
      openerUse: 'DisplayTextFieldModel',
    },
    searchTerms: ['角色详情', 'role details'],
    ...overrides,
  };
}

function buildProbe(scene) {
  return planTemplateQuery(scene).probe;
}

test('planTemplateQuery builds contextual popup query for clickable relation details', () => {
  const result = planTemplateQuery(
    buildRolePopupScene({
      pageSize: 10,
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.requiresContextualProbe, true);
  assert.equal(result.requestBody.type, 'popup');
  assert.equal(result.requestBody.page, 1);
  assert.equal(result.requestBody.pageSize, 10);
  assert.match(result.requestBody.search, /\busers\b/i);
  assert.match(result.requestBody.search, /\broles\b/i);
  assert.match(result.requestBody.search, /\brole\b/i);
  assert.match(result.requestBody.search, /角色详情/);
  assert.equal(result.querySummary.contextStrength, 'strong');
  assert.equal(result.requiresContextualProbe, true);
  assert.equal(result.probe.source, 'nb-template-decision.plan-query');
  assert.equal(result.probe.isContextualProbe, true);
});

test('selectTemplateDecision picks the clear contextual winner and returns reference decision', () => {
  const scene = buildRolePopupScene();
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    candidates: [
      {
        uid: 'generic-role-popup',
        name: 'role-popup',
        description: 'Generic role details popup for any role table.',
        type: 'popup',
        available: true,
        collectionName: 'roles',
        usageCount: 20,
      },
      {
        uid: 'etvze5dfw78',
        name: 'role-details-popup',
        description: 'Popup for users.roles display field detail scenes.',
        type: 'popup',
        available: true,
        collectionName: 'roles',
        sourceCollectionName: 'users',
        associationName: 'users.roles',
        useModel: 'DisplayTextFieldModel',
        usageCount: 12,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'selected');
  assert.equal(result.mode, 'reference');
  assert.equal(result.selectedTemplate.uid, 'etvze5dfw78');
  assert.deepEqual(result.templateDecision, {
    kind: 'selected-reference',
    mode: 'reference',
    template: {
      uid: 'etvze5dfw78',
      name: 'role-details-popup',
      description: 'Popup for users.roles display field detail scenes.',
    },
    reasonCode: 'standard-reuse',
    reason: 'standard reuse',
    summary: 'Template role-details-popup via reference: standard reuse.',
  });
});

test('selectTemplateDecision keeps weak keyword-only probing as discovery-only', () => {
  const scene = {
    templateType: 'popup',
    repeatEligible: true,
    searchTerms: ['role details'],
  };
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    candidates: [
      {
        uid: 'etvze5dfw78',
        name: 'role-details-popup',
        type: 'popup',
        available: true,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'discovery-only');
  assert.equal(result.templateDecision.kind, 'discovery-only');
  assert.equal(result.templateDecision.reasonCode, 'missing-live-context');
});

test('selectTemplateDecision surfaces explicit template unavailable in current context', () => {
  const scene = buildRolePopupScene();
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    explicitTemplate: { uid: 'etvze5dfw78' },
    candidates: [
      {
        uid: 'etvze5dfw78',
        name: 'role-details-popup',
        type: 'popup',
        available: false,
        disabledReason: 'target opener is not compatible with this popup template',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'discovery-only');
  assert.equal(result.templateDecision.reasonCode, 'explicit-template-unavailable');
  assert.equal(result.disabledReason, 'target opener is not compatible with this popup template');
});

test('selectTemplateDecision keeps repeat-eligible scenes discovery-only when no usable template exists yet', () => {
  const scene = buildRolePopupScene();
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    candidates: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'discovery-only');
  assert.equal(result.templateDecision.reasonCode, 'bootstrap-after-first-write');
});

test('selectTemplateDecision keeps non-repeat-eligible scenes inline', () => {
  const scene = {
    templateType: 'popup',
    repeatEligible: false,
    singleOccurrence: true,
    context: {
      associationName: 'users.roles',
    },
  };
  const result = selectTemplateDecision({
    scene,
    candidates: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'inline-non-template');
  assert.equal(result.templateDecision.reasonCode, 'single-occurrence');
});

test('planTemplateQuery marks contextual probing optional for non-repeat-eligible scenes', () => {
  const result = planTemplateQuery({
    templateType: 'popup',
    repeatEligible: false,
    context: {
      associationName: 'users.roles',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.requiresContextualProbe, false);
  assert.equal(result.probe.isContextualProbe, true);
});

test('selectTemplateDecision keeps repeat-eligible single occurrences inline when no usable template exists', () => {
  const scene = {
    templateType: 'popup',
    repeatEligible: true,
    singleOccurrence: true,
    context: {
      associationName: 'users.roles',
      collectionName: 'roles',
    },
  };
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    candidates: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'inline-non-template');
  assert.equal(result.templateDecision.reasonCode, 'single-occurrence');
});

test('planTemplateQuery requires contextual probing for single standard reusable scenes that prefer templates', () => {
  const result = planTemplateQuery({
    templateType: 'popup',
    preferTemplate: true,
    singleOccurrence: true,
    context: {
      sourceCollectionName: 'users',
      collectionName: 'roles',
      associationName: 'users.roles',
      fieldPath: 'roles',
      openerUse: 'DisplayTextFieldModel',
    },
    searchTerms: ['角色详情', 'role details'],
  });

  assert.equal(result.ok, true);
  assert.equal(result.requiresContextualProbe, true);
  assert.equal(result.probe.querySummary.preferTemplate, true);
});

test('selectTemplateDecision bootstraps single standard reusable scenes when no usable template exists yet', () => {
  const scene = {
    templateType: 'popup',
    preferTemplate: true,
    singleOccurrence: true,
    context: {
      sourceCollectionName: 'users',
      collectionName: 'roles',
      associationName: 'users.roles',
      fieldPath: 'roles',
      openerUse: 'DisplayTextFieldModel',
    },
    searchTerms: ['角色详情', 'role details'],
  };
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    candidates: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'discovery-only');
  assert.equal(result.templateDecision.reasonCode, 'bootstrap-after-first-write');
});

test('selectTemplateDecision selects templates for single standard reusable scenes when a usable template exists', () => {
  const scene = {
    templateType: 'popup',
    preferTemplate: true,
    singleOccurrence: true,
    context: {
      sourceCollectionName: 'users',
      collectionName: 'roles',
      associationName: 'users.roles',
      fieldPath: 'roles',
      openerUse: 'DisplayTextFieldModel',
    },
    searchTerms: ['角色详情', 'role details'],
  };
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    candidates: [
      {
        uid: 'etvze5dfw78',
        name: 'role-details-popup',
        description: 'Popup for users.roles display field detail scenes.',
        type: 'popup',
        available: true,
        collectionName: 'roles',
        sourceCollectionName: 'users',
        associationName: 'users.roles',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'selected');
  assert.equal(result.selectedTemplate.uid, 'etvze5dfw78');
});

test('selectTemplateDecision resolves bare explicit template string by exact name after uid miss', () => {
  const scene = buildRolePopupScene();
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    explicitTemplate: 'role-details-popup',
    candidates: [
      {
        uid: 'etvze5dfw78',
        name: 'role-details-popup',
        description: 'Popup for users.roles display field detail scenes.',
        type: 'popup',
        available: true,
        collectionName: 'roles',
        sourceCollectionName: 'users',
        associationName: 'users.roles',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'selected');
  assert.equal(result.selectedTemplate.uid, 'etvze5dfw78');
});

test('selectTemplateDecision returns needs-user-choice for ambiguous explicit template name', () => {
  const result = selectTemplateDecision({
    scene: buildRolePopupScene(),
    explicitTemplate: 'role-details-popup',
    candidates: [
      {
        uid: 'template-a',
        name: 'role-details-popup',
        type: 'popup',
        available: true,
      },
      {
        uid: 'template-b',
        name: 'role-details-popup',
        type: 'popup',
        available: true,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'needs-user-choice');
  assert.equal(result.reason, 'ambiguous-explicit-name');
});

test('selectTemplateDecision requires one probe for repeat-eligible selection paths', () => {
  const result = selectTemplateDecision({
    scene: buildRolePopupScene(),
    candidates: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors[0], /requires one probe/i);
});

test('selectTemplateDecision keeps non-contextual probes discovery-only even with usable templates', () => {
  const scene = {
    templateType: 'popup',
    repeatEligible: true,
    searchTerms: ['role popup'],
  };
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    candidates: [
      {
        uid: 'etvze5dfw78',
        name: 'role-details-popup',
        type: 'popup',
        available: true,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'discovery-only');
  assert.equal(result.templateDecision.reasonCode, 'missing-live-context');
});

test('selectTemplateDecision preserves backend order when top candidates remain tied', () => {
  const scene = {
    templateType: 'popup',
    repeatEligible: true,
    context: {
      associationName: 'users.roles',
    },
    searchTerms: ['role popup'],
  };
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    candidates: [
      {
        uid: 'bbb-role-popup',
        name: 'Role popup B',
        description: 'Role popup users.roles',
        type: 'popup',
        available: true,
        associationName: 'users.roles',
        usageCount: 5,
      },
      {
        uid: 'aaa-role-popup',
        name: 'Role popup A',
        description: 'Role popup users.roles',
        type: 'popup',
        available: true,
        associationName: 'users.roles',
        usageCount: 5,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'selected');
  assert.equal(result.selectedTemplate.uid, 'bbb-role-popup');
});

test('selectTemplateDecision supports block fields templates and copy mode', () => {
  const scene = {
    templateType: 'block',
    usage: 'fields',
    repeatEligible: true,
    context: {
      collectionName: 'users',
      openerUse: 'FormBlockModel',
    },
    searchTerms: ['user edit form'],
  };
  const result = selectTemplateDecision({
    scene,
    probe: buildProbe(scene),
    modePreference: 'copy',
    candidates: [
      {
        uid: 'user-form-fields-template',
        name: 'user-edit-form-fields',
        description: 'Reusable user edit form fields.',
        type: 'block',
        usage: 'fields',
        available: true,
        collectionName: 'users',
        openerUse: 'FormBlockModel',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'selected');
  assert.equal(result.mode, 'copy');
  assert.equal(result.templateDecision.kind, 'selected-copy');
});

test('template decision cli plan-query reads stdin json', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(JSON.stringify(buildRolePopupScene()));

  const exitCode = await runTemplateSelectionCli(['plan-query', '--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.requestBody.type, 'popup');
});

test('template decision cli select reads stdin json', async () => {
  const scene = buildRolePopupScene();
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const stdin = createInputStream(
    JSON.stringify({
      scene,
      probe: buildProbe(scene),
      candidates: [
        {
          uid: 'etvze5dfw78',
          name: 'role-details-popup',
          description: 'Popup for users.roles display field detail scenes.',
          type: 'popup',
          available: true,
          collectionName: 'roles',
          sourceCollectionName: 'users',
          associationName: 'users.roles',
          useModel: 'DisplayTextFieldModel',
          usageCount: 12,
        },
      ],
    }),
  );

  const exitCode = await runTemplateSelectionCli(['select', '--stdin-json'], {
    cwd: process.cwd(),
    stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  const payload = JSON.parse(stdout.read());
  assert.equal(payload.ok, true);
  assert.equal(payload.outcome, 'selected');
  assert.equal(payload.selectedTemplate.uid, 'etvze5dfw78');
});

test('template decision cli select reads --input json file', async () => {
  const scene = buildRolePopupScene();
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nb-template-selection-'));
  const inputPath = path.join(tempDir, 'select.json');
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      scene,
      probe: buildProbe(scene),
      candidates: [
        {
          uid: 'etvze5dfw78',
          name: 'role-details-popup',
          type: 'popup',
          available: true,
          collectionName: 'roles',
          sourceCollectionName: 'users',
          associationName: 'users.roles',
        },
      ],
    }),
  );

  try {
    const exitCode = await runTemplateSelectionCli(['select', '--input', inputPath], {
      cwd: process.cwd(),
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    assert.equal(exitCode, 0);
    assert.equal(stderr.read(), '');
    const payload = JSON.parse(stdout.read());
    assert.equal(payload.ok, true);
    assert.equal(payload.outcome, 'selected');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
