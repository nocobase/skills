import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  detectCloneTarget,
  discoverTemplatePayloadFile,
  normalizeFilterItemFieldModelUses,
  normalizeUrlBase,
  unwrapResponseEnvelope,
  validateReadbackContract,
} from './rest_template_clone_runner.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rest-template-clone-runner-'));
}

test('discoverTemplatePayloadFile prefers case-specific remap payload over generic template files', () => {
  const tempDir = makeTempDir();
  fs.writeFileSync(path.join(tempDir, 'source-template.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(tempDir, 'payload-canonical.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(tempDir, 'case2-remap-payload.json'), '{}\n', 'utf8');

  const filePath = discoverTemplatePayloadFile({
    templateArtifactsDir: tempDir,
    caseId: 'case2',
  });

  assert.equal(path.basename(filePath), 'case2-remap-payload.json');
});

test('detectCloneTarget distinguishes page root payloads from grid root payloads', () => {
  assert.equal(
    detectCloneTarget({
      sourceModel: { use: 'RootPageModel', subKey: 'page' },
      filePath: '/tmp/source-page.json',
    }),
    'page',
  );
  assert.equal(
    detectCloneTarget({
      sourceModel: { use: 'BlockGridModel', subKey: 'grid' },
      filePath: '/tmp/source-template.json',
    }),
    'grid',
  );
});

test('unwrapResponseEnvelope unwraps nested mcp text payload and data envelope', () => {
  const wrapped = {
    type: 'mcp_tool_call_output',
    output: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            data: {
              uid: 'root-grid',
              use: 'BlockGridModel',
            },
          }),
        },
      ],
    },
  };

  assert.deepEqual(unwrapResponseEnvelope(wrapped), {
    uid: 'root-grid',
    use: 'BlockGridModel',
  });
});

test('normalizeUrlBase accepts both origin and /admin URL forms', () => {
  assert.deepEqual(normalizeUrlBase('http://127.0.0.1:23000'), {
    apiBase: 'http://127.0.0.1:23000',
    adminBase: 'http://127.0.0.1:23000/admin',
  });
  assert.deepEqual(normalizeUrlBase('http://127.0.0.1:23000/admin'), {
    apiBase: 'http://127.0.0.1:23000',
    adminBase: 'http://127.0.0.1:23000/admin',
  });
});

test('validateReadbackContract checks visible tabs and filterManager entry count', () => {
  const model = {
    use: 'RootPageModel',
    subModels: {
      tabs: [
        {
          use: 'RootPageTabModel',
          stepParams: {
            pageTabSettings: {
              tab: {
                title: '客户概览',
              },
            },
          },
        },
        {
          use: 'RootPageTabModel',
          stepParams: {
            pageTabSettings: {
              tab: {
                title: '联系人',
              },
            },
          },
        },
      ],
    },
    filterManager: [
      { filterId: 'a', targetId: 'x', filterPaths: ['name'] },
      { filterId: 'b', targetId: 'x', filterPaths: ['status'] },
    ],
  };

  const result = validateReadbackContract(model, {
    requiredTopLevelUses: ['RootPageTabModel'],
    requiredVisibleTabs: ['客户概览', '联系人'],
    requiredTabCount: 2,
    requireFilterManager: true,
    requiredFilterManagerEntryCount: 2,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test('normalizeFilterItemFieldModelUses rewrites association selector to scalar input when fieldPath resolves to scalar', () => {
  const model = {
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          use: 'FilterFormItemModel',
          stepParams: {
            fieldSettings: {
              init: {
                collectionName: 'projects',
                fieldPath: 'manager.nickname',
              },
            },
          },
          subModels: {
            field: {
              use: 'FilterFormRecordSelectFieldModel',
            },
          },
        },
      ],
    },
  };
  const metadata = {
    collections: {
      projects: {
        name: 'projects',
        fields: [
          {
            name: 'manager',
            interface: 'manyToOne',
            type: 'belongsTo',
            target: 'users',
            foreignKey: 'manager_id',
            targetKey: 'id',
          },
        ],
      },
      users: {
        name: 'users',
        fields: [
          {
            name: 'nickname',
            interface: 'input',
            type: 'string',
          },
        ],
      },
    },
  };

  const changed = normalizeFilterItemFieldModelUses(model, metadata);

  assert.equal(changed, 1);
  assert.equal(model.subModels.items[0].subModels.field.use, 'InputFieldModel');
});
