import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { materializeInstanceInventory, probeInstanceInventory } from './instance_inventory_probe.mjs';

function makeTempDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nb-instance-inv-${testName}-`));
}

function makeJsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('instance inventory probe derives root public uses from flowModels:schemaBundle and builds publicUseCatalog from schemas', async () => {
  const stateDir = makeTempDir('probe');
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (String(url).endsWith('/api/app:getInfo')) {
      return makeJsonResponse({ data: { version: '2.0.0' } });
    }
    if (String(url).endsWith('/api/pm:listEnabled')) {
      return makeJsonResponse({
        data: [
          { packageName: '@nocobase/plugin-block-markdown' },
          { packageName: '@nocobase/plugin-block-comments' },
        ],
      });
    }
    if (String(url).endsWith('/api/flowModels:schemaBundle')) {
      const parsedBody = options.body ? JSON.parse(options.body) : {};
      assert.deepEqual(parsedBody.uses, ['BlockGridModel']);
      return makeJsonResponse({
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
      });
    }
    if (String(url).endsWith('/api/flowModels:schemas')) {
      const parsedBody = options.body ? JSON.parse(options.body) : {};
      assert.equal(Array.isArray(parsedBody.uses), true);
      return makeJsonResponse({
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
      });
    }
    if (String(url).includes('/api/collections:listMeta')) {
      return makeJsonResponse({
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
      });
    }
    return makeJsonResponse({ errors: [{ message: 'not found' }] }, { status: 404 });
  };

  try {
    const result = await probeInstanceInventory({
      candidatePageUrl: 'http://localhost:23000/admin/demo',
      token: 'demo-token',
      stateDir,
      allowCache: false,
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
    assert.equal(calls.some((call) => String(call.url).includes('flowModels:schemaBundle')), true);
    assert.equal(calls.some((call) => String(call.url).includes('collections:listMeta')), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
