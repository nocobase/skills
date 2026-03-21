import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCollectionPlans,
  extractReplayPlanFromLogs,
  guessTitleField,
  inferFilterTargetKey,
  resolveDesiredCollectionOptions,
} from './validation_dataset_provisioner.mjs';

function makeTempDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `validation-provisioner-${testName}-`));
}

function writeJsonl(filePath, events) {
  fs.writeFileSync(filePath, `${events.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');
}

test('extractReplayPlanFromLogs collects collection, field and record create ops', () => {
  const rootDir = makeTempDir('extract');
  const logPath = path.join(rootDir, 'case8.jsonl');
  writeJsonl(logPath, [
    {
      type: 'tool_call',
      status: 'ok',
      tool: 'crud(create collections)',
      args: {
        action: 'create',
        resource: 'collections',
        values: {
          name: 'val03217_c8_projects',
          title: 'VAL03217 C8 Projects',
          fields: [
            { name: 'name', type: 'string', interface: 'input' },
          ],
        },
      },
    },
    {
      type: 'tool_call',
      status: 'ok',
      tool: 'crud(create collections.fields)',
      args: {
        action: 'create',
        resource: 'collections.fields',
        sourceId: 'val03217_c8_projects',
        values: {
          name: 'members',
          type: 'belongsToMany',
          target: 'val03217_c8_users',
          through: 'val03217_c8_project_members',
          foreignKey: 'project_id',
          otherKey: 'user_id',
          interface: 'm2m',
        },
      },
    },
    {
      type: 'tool_call',
      status: 'ok',
      tool: 'crud(create val03217_c8_projects)',
      args: {
        action: 'create',
        resource: 'val03217_c8_projects',
        values: {
          name: 'Apollo ERP Revamp',
          project_code: 'C8-PJ-001',
        },
      },
    },
  ]);

  const replayPlan = extractReplayPlanFromLogs([logPath]);
  assert.equal(replayPlan.collectionCreates.size, 1);
  assert.equal(replayPlan.fieldCreates.get('val03217_c8_projects').length, 1);
  assert.equal(replayPlan.recordCreates.get('val03217_c8_projects').length, 1);
});

test('resolveDesiredCollectionOptions defaults filterTargetKey=id and guesses titleField', () => {
  const options = resolveDesiredCollectionOptions({
    fields: [
      { name: 'project_code', type: 'string', interface: 'input' },
      { name: 'name', type: 'string', interface: 'input' },
    ],
    metadataCollection: {
      filterTargetKey: '',
      titleField: '',
    },
  });

  assert.equal(options.filterTargetKey, 'id');
  assert.equal(options.titleField, 'name');
  assert.equal(guessTitleField([
    { name: 'opp_no', type: 'string', interface: 'input' },
    { name: 'amount', type: 'decimal', interface: 'number' },
  ]), 'opp_no');
});

test('inferFilterTargetKey uses composite belongsTo foreign keys for through collections without auto id', () => {
  const filterTargetKey = inferFilterTargetKey({
    fields: [
      { name: 'project_id', type: 'bigInt', interface: 'integer' },
      { name: 'user_id', type: 'bigInt', interface: 'integer' },
      {
        name: 'project',
        type: 'belongsTo',
        interface: 'm2o',
        target: 'projects',
        foreignKey: 'project_id',
      },
      {
        name: 'user',
        type: 'belongsTo',
        interface: 'm2o',
        target: 'users',
        foreignKey: 'user_id',
      },
    ],
    metadataCollection: {
      filterTargetKey: '',
      isThrough: true,
    },
    collectionCreateRequest: {
      autoGenId: false,
      isThrough: true,
    },
  });

  assert.deepEqual(filterTargetKey, ['project_id', 'user_id']);
});

test('inferFilterTargetKey overrides stale id target key for through-like collections without id field', () => {
  const filterTargetKey = inferFilterTargetKey({
    fields: [
      { name: 'project_id', type: 'bigInt', interface: 'integer' },
      { name: 'user_id', type: 'bigInt', interface: 'integer' },
      {
        name: 'project',
        type: 'belongsTo',
        interface: 'm2o',
        target: 'projects',
        foreignKey: 'project_id',
      },
      {
        name: 'user',
        type: 'belongsTo',
        interface: 'm2o',
        target: 'users',
        foreignKey: 'user_id',
      },
    ],
    metadataCollection: {
      filterTargetKey: 'id',
    },
    collectionCreateRequest: {},
  });

  assert.deepEqual(filterTargetKey, ['project_id', 'user_id']);
});

test('buildCollectionPlans suppresses duplicate foreign key scalar fields when relation field already defines the foreignKey', () => {
  const rootDir = makeTempDir('plan');
  const logPath = path.join(rootDir, 'case2.jsonl');
  writeJsonl(logPath, [
    {
      type: 'tool_call',
      status: 'ok',
      tool: 'PostCollections_create',
      args: {
        requestBody: {
          name: 'val03217_c2_contacts',
          title: 'VAL03217 C2 Contacts',
          fields: [
            { name: 'name', type: 'string', interface: 'input' },
            {
              name: 'customer',
              type: 'belongsTo',
              target: 'val03217_c2_customers',
              foreignKey: 'customer_id',
              interface: 'm2o',
            },
          ],
        },
      },
    },
  ]);

  const plan = buildCollectionPlans({
    caseEntry: {
      caseId: 'case2',
      evidence: [
        {
          kind: 'tool-log',
          path: logPath,
        },
      ],
      evidencedCollections: [
        {
          logicalName: 'customers',
          evidencedName: 'val03217_c2_customers',
          fields: [
            { name: 'name', type: 'string', interface: 'input' },
          ],
        },
        {
          logicalName: 'contacts',
          evidencedName: 'val03217_c2_contacts',
          fields: [
            { name: 'name', type: 'string', interface: 'input' },
            { name: 'customer_id', type: 'bigInt', interface: 'integer' },
            {
              name: 'customer',
              type: 'belongsTo',
              target: 'val03217_c2_customers',
              foreignKey: 'customer_id',
              interface: 'm2o',
            },
          ],
        },
      ],
      sampleRequirements: {
        evidencedCounts: {
          contacts: 3,
        },
      },
    },
    templateMetadata: {
      collections: {
        val03217_c2_contacts: {
          titleField: 'name',
          filterTargetKey: 'id',
        },
      },
    },
  });

  const contactsPlan = plan.collectionPlans.find((item) => item.collectionName === 'val03217_c2_contacts');
  assert.ok(contactsPlan);
  assert.equal(contactsPlan.requiredCount, 3);
  assert.deepEqual(contactsPlan.fields.map((item) => item.name), ['name', 'customer']);
  assert.deepEqual(contactsPlan.options, {
    titleField: 'name',
    filterTargetKey: 'id',
  });
});
