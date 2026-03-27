import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { materializeInstanceInventory, probeInstanceInventory } from './instance_inventory_probe.mjs';

function makeTempDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nb-instance-inv-${testName}-`));
}

test('instance inventory probe derives root public uses from provided MCP artifacts', async () => {
  const stateDir = makeTempDir('probe');
  const result = await probeInstanceInventory({
    candidatePageUrl: 'http://localhost:23000/admin/demo',
    stateDir,
    allowCache: false,
    appInfo: { data: { version: '2.0.0' } },
    enabledPlugins: {
      data: [
        { packageName: '@nocobase/plugin-block-markdown' },
        { packageName: '@nocobase/plugin-block-comments' },
      ],
    },
    schemaBundle: {
      data: {
        items: [
          {
            use: 'BlockGridModel',
            subModelCatalog: {
              items: {
                type: 'array',
                candidates: [
                  { use: 'TableBlockModel' },
                  { use: 'MarkdownBlockModel' },
                  { use: 'CommentsBlockModel' },
                ],
              },
            },
          },
        ],
      },
    },
    schemas: {
      data: [
        {
          use: 'MarkdownBlockModel',
          title: 'Markdown block',
          dynamicHints: [
            {
              kind: 'dynamic-ui-schema',
              path: 'MarkdownBlockModel.stepParams.markdownBlockSettings.editMarkdown.content',
              message: 'Markdown content can contain liquid variables.',
              'x-flow': {
                contextRequirements: ['markdown renderer'],
                unresolvedReason: 'runtime-markdown-context',
              },
            },
          ],
        },
        {
          use: 'CommentsBlockModel',
          title: 'Comments block',
          dynamicHints: [],
        },
        {
          use: 'TableBlockModel',
          title: 'Table block',
          dynamicHints: [],
        },
      ],
    },
    collectionsMeta: {
      data: [
        {
          name: 'approvals',
          title: '审批单',
          titleField: 'title',
          fields: [
            { name: 'title', type: 'string', interface: 'input' },
            { name: 'status', type: 'string', interface: 'select' },
            { name: 'owner', type: 'belongsTo', interface: 'm2o', target: 'users' },
          ],
        },
      ],
    },
  });

  assert.equal(result.detected, true);
  assert.equal(result.apiBase, 'http://localhost:23000');
  assert.equal(result.adminBase, 'http://localhost:23000/admin');
  assert.equal(result.appVersion, '2.0.0');
  assert.equal(result.enabledPluginsDetected, true);
  assert.equal(result.enabledPlugins.length, 2);
  assert.deepEqual(result.flowSchema.rootPublicUses, ['CommentsBlockModel', 'MarkdownBlockModel', 'TableBlockModel']);
  assert.equal(result.flowSchema.publicUseCatalog.some((item) => item.use === 'MarkdownBlockModel'), true);
  assert.equal(result.collections.detected, true);
  assert.deepEqual(result.collections.names, ['approvals']);
  assert.deepEqual(result.collections.byName.approvals.scalarFieldNames, ['status', 'title']);
  assert.deepEqual(result.collections.byName.approvals.relationFields, ['owner']);
  const markdownEntry = result.flowSchema.publicUseCatalog.find((item) => item.use === 'MarkdownBlockModel');
  assert.equal(markdownEntry.semanticTags.includes('docs'), true);
  assert.equal(markdownEntry.contextRequirements.includes('markdown renderer'), true);
});

test('materializeInstanceInventory can build flow schema inventory from MCP tool outputs', () => {
  const result = materializeInstanceInventory({
    candidatePageUrl: 'http://localhost:23000/admin/demo',
    schemaBundle: {
      data: {
        items: [
          {
            use: 'BlockGridModel',
            subModelCatalog: {
              items: {
                type: 'array',
                candidates: [
                  { use: 'TableBlockModel' },
                  { use: 'MarkdownBlockModel' },
                ],
              },
            },
          },
        ],
      },
    },
    schemas: {
      data: [
        {
          use: 'MarkdownBlockModel',
          title: 'Markdown block',
          dynamicHints: [
            {
              kind: 'dynamic-ui-schema',
              path: 'MarkdownBlockModel.stepParams.markdownBlockSettings.editMarkdown.content',
              message: 'Markdown content can contain liquid variables.',
              'x-flow': {
                contextRequirements: ['markdown renderer'],
                unresolvedReason: 'runtime-markdown-context',
              },
            },
          ],
        },
        {
          use: 'TableBlockModel',
          title: 'Table block',
          dynamicHints: [],
        },
      ],
    },
    allowCache: false,
  });

  assert.equal(result.detected, true);
  assert.deepEqual(result.flowSchema.rootPublicUses, ['MarkdownBlockModel', 'TableBlockModel']);
  assert.equal(result.flowSchema.publicUseCatalog.length, 2);
  const markdownEntry = result.flowSchema.publicUseCatalog.find((item) => item.use === 'MarkdownBlockModel');
  assert.equal(markdownEntry.semanticTags.includes('docs'), true);
  assert.equal(markdownEntry.contextRequirements.includes('markdown renderer'), true);
});
