import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runUiWriteWrapper } from './ui_write_wrapper.mjs';

const SNAPSHOT_PATH = fileURLToPath(new URL('./runjs_contract_snapshot.json', import.meta.url));

function makeTempDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nb-ui-write-wrapper-${testName}-`));
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

test('ui_write_wrapper blocks save before network when guard finds blocker', async () => {
  const sessionRoot = makeTempDir('guard-block');
  const outDir = path.join(sessionRoot, 'out');
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error('fetch should not be called when guard blocks');
  };

  try {
    const result = await runUiWriteWrapper({
      action: 'save',
      task: 'guard block test',
      token: 'demo-token',
      sessionRoot,
      outDir,
      payload: {
        use: 'JSBlockModel',
        stepParams: {
          jsSettings: {
            runJs: {
              version: 'v2',
              code: "await fetch('/api/auth:check')",
            },
          },
        },
      },
      metadata: {},
      snapshotFile: SNAPSHOT_PATH,
      readbackParentId: 'tabs-demo',
      readbackSubKey: 'grid',
    });

    assert.equal(result.guardBlocked, true);
    assert.equal(result.status, 'failed');
    assert.equal(calls.length, 0);
    assert.equal(fs.existsSync(result.artifactPaths.auditInitial), true);
    assert.match(result.notes.join('\n'), /guard 命中 blocker/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ui_write_wrapper save canonicalizes payload and performs readback', async () => {
  const sessionRoot = makeTempDir('save-success');
  const outDir = path.join(sessionRoot, 'out');
  const calls = [];
  let savedPayload = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('/api/flowModels:save')) {
      savedPayload = JSON.parse(options.body);
      return makeJsonResponse({ data: savedPayload });
    }
    if (String(url).includes('/api/flowModels:findOne')) {
      return makeJsonResponse({ data: savedPayload });
    }
    return makeJsonResponse({ errors: [{ message: 'not found' }] }, { status: 404 });
  };

  try {
    const result = await runUiWriteWrapper({
      action: 'save',
      task: 'save success test',
      token: 'demo-token',
      sessionRoot,
      outDir,
      payload: {
        use: 'JSBlockModel',
        stepParams: {
          jsSettings: {
            runJs: {
              version: 'v2',
              code: "const rows = await ctx.request({ url: 'users:list' }); ctx.render(String(rows?.data?.length ?? 0));",
            },
          },
        },
      },
      metadata: {},
      snapshotFile: SNAPSHOT_PATH,
      readbackParentId: 'tabs-demo',
      readbackSubKey: 'grid',
      targetSignature: 'grid:tabs-demo',
    });

    assert.equal(result.status, 'success');
    assert.equal(result.guardBlocked, undefined);
    assert.equal(calls.some((call) => call.url.includes('/api/flowModels:save')), true);
    assert.equal(calls.some((call) => call.url.includes('/api/flowModels:findOne')), true);
    assert.equal(fs.existsSync(result.artifactPaths.payloadCanonical), true);
    assert.equal(fs.existsSync(result.artifactPaths.readbackDiff), true);

    const canonicalizedPayload = JSON.parse(fs.readFileSync(result.artifactPaths.payloadCanonical, 'utf8'));
    assert.equal(
      canonicalizedPayload.stepParams.jsSettings.runJs.code.includes("ctx.makeResource('MultiRecordResource')"),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ui_write_wrapper save remaps conflicting descendant uid before write when live topology disagrees', async () => {
  const sessionRoot = makeTempDir('save-live-remap');
  const outDir = path.join(sessionRoot, 'out');
  const calls = [];
  let savedPayload = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('/api/flowModels:save')) {
      savedPayload = JSON.parse(options.body);
      return makeJsonResponse({ data: savedPayload });
    }
    if (String(url).includes('/api/flowModels:findOne')) {
      if (!savedPayload) {
        return makeJsonResponse({
          data: {
            uid: 'grid-root',
            use: 'BlockGridModel',
            subModels: {
              items: [
                {
                  uid: 'existing-table',
                  parentId: 'other-grid',
                  subKey: 'items',
                  subType: 'array',
                  use: 'TableBlockModel',
                  stepParams: {
                    resourceSettings: {
                      init: {
                        dataSourceKey: 'main',
                        collectionName: 'orders',
                      },
                    },
                  },
                },
              ],
            },
          },
        });
      }
      return makeJsonResponse({ data: savedPayload });
    }
    return makeJsonResponse({ errors: [{ message: 'not found' }] }, { status: 404 });
  };

  try {
    const result = await runUiWriteWrapper({
      action: 'save',
      task: 'save live remap test',
      token: 'demo-token',
      sessionRoot,
      outDir,
      payload: {
        uid: 'grid-root',
        use: 'BlockGridModel',
        stepParams: {
          gridSettings: {
            grid: {
              rows: {
                row1: [
                  ['existing-table'],
                ],
              },
              sizes: {
                row1: [24],
              },
              rowOrder: ['row1'],
            },
          },
        },
        subModels: {
          items: [
            {
              uid: 'existing-table',
              use: 'TableBlockModel',
              stepParams: {
                resourceSettings: {
                  init: {
                    dataSourceKey: 'main',
                    collectionName: 'orders',
                  },
                },
              },
            },
          ],
        },
      },
      metadata: {
        collections: {
          orders: {
            titleField: 'id',
            filterTargetKey: 'id',
            fields: [
              { name: 'id', type: 'integer', interface: 'number' },
            ],
          },
        },
      },
      snapshotFile: SNAPSHOT_PATH,
      readbackParentId: 'tabs-demo',
      readbackSubKey: 'grid',
      targetSignature: 'grid:tabs-demo',
    });

    assert.equal(result.status, 'success');
    assert.equal(result.liveTopologyRemap.changed, true);
    assert.notEqual(savedPayload.subModels.items[0].uid, 'existing-table');
    assert.equal(fs.existsSync(result.artifactPaths.liveTopologyRemap), true);
    assert.equal(fs.existsSync(result.artifactPaths.payloadRemapped), true);
    assert.equal(calls.filter((call) => call.url.includes('/api/flowModels:findOne')).length >= 2, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ui_write_wrapper save records chart data readiness after readback', async () => {
  const sessionRoot = makeTempDir('save-chart-probe');
  const outDir = path.join(sessionRoot, 'out');
  const calls = [];
  let savedPayload = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('/api/flowModels:save')) {
      savedPayload = JSON.parse(options.body);
      return makeJsonResponse({ data: savedPayload });
    }
    if (String(url).includes('/api/flowModels:findOne')) {
      return makeJsonResponse({ data: savedPayload });
    }
    if (String(url).includes('/api/charts:query')) {
      return makeJsonResponse({
        data: [
          {
            customer_name: 'Alice',
            count_order_no: 2,
          },
        ],
      });
    }
    return makeJsonResponse({ errors: [{ message: 'not found' }] }, { status: 404 });
  };

  try {
    const result = await runUiWriteWrapper({
      action: 'save',
      task: 'save chart data probe test',
      token: 'demo-token',
      sessionRoot,
      outDir,
      payload: {
        uid: 'chart-1',
        use: 'ChartBlockModel',
        title: 'Orders by customer',
        stepParams: {
          chartSettings: {
            configure: {
              query: {
                mode: 'builder',
                collectionPath: ['main', 'orders'],
                measures: [
                  {
                    field: 'order_no',
                    aggregation: 'count',
                    alias: 'count_order_no',
                  },
                ],
                dimensions: [
                  {
                    field: ['customer', 'name'],
                    alias: 'customer_name',
                  },
                ],
              },
              chart: {
                option: {
                  mode: 'basic',
                  builder: {
                    type: 'pie',
                    pieCategory: 'customer_name',
                    pieValue: 'count_order_no',
                  },
                },
              },
            },
          },
        },
      },
      metadata: {
        collections: {
          orders: {
            titleField: 'order_no',
            filterTargetKey: 'id',
            fields: [
              { name: 'order_no', type: 'string', interface: 'input' },
              { name: 'customer', type: 'belongsTo', interface: 'm2o', target: 'customers', foreignKey: 'customer_id', targetKey: 'id' },
            ],
          },
          customers: {
            titleField: 'name',
            filterTargetKey: 'id',
            fields: [
              { name: 'name', type: 'string', interface: 'input' },
            ],
          },
        },
      },
      readbackParentId: 'tabs-demo',
      readbackSubKey: 'grid',
      targetSignature: 'grid:tabs-demo',
    });

    assert.equal(result.status, 'success');
    assert.equal(result.statusAxes.dataReady.status, 'ready');
    assert.equal(result.chartDataProbes[0].rowCount, 1);
    assert.equal(calls.some((call) => call.url.includes('/api/charts:query')), true);
    assert.equal(fs.existsSync(result.artifactPaths.chartDataProbes), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ui_write_wrapper create-v2 verifies route-ready and anchors', async () => {
  const sessionRoot = makeTempDir('create-v2');
  const outDir = path.join(sessionRoot, 'out');
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('/api/desktopRoutes:createV2')) {
      return makeJsonResponse({ data: { id: 'route-1', schemaUid: 'demo-page' } });
    }
    if (String(url).includes('/api/desktopRoutes:listAccessible')) {
      return makeJsonResponse({
        data: [
          {
            schemaUid: 'demo-page',
            type: 'page',
            children: [
              {
                schemaUid: 'tabs-demo-page',
                type: 'tab',
                hidden: true,
              },
            ],
          },
        ],
      });
    }
    if (String(url).includes('parentId=demo-page') && String(url).includes('subKey=page')) {
      return makeJsonResponse({
        data: {
          uid: 'page-uid',
          use: 'RootPageModel',
        },
      });
    }
    if (String(url).includes('parentId=tabs-demo-page') && String(url).includes('subKey=grid')) {
      return makeJsonResponse({
        data: {
          uid: 'grid-uid',
          use: 'BlockGridModel',
        },
      });
    }
    return makeJsonResponse({ errors: [{ message: 'not found' }] }, { status: 404 });
  };

  try {
    const result = await runUiWriteWrapper({
      action: 'create-v2',
      task: 'create page shell test',
      token: 'demo-token',
      sessionRoot,
      outDir,
      requestBody: {
        schemaUid: 'demo-page',
        title: 'Demo Page',
      },
    });

    assert.equal(result.status, 'success');
    assert.equal(result.routeReady.ok, true);
    assert.equal(result.pageAnchor.present, true);
    assert.equal(result.gridAnchor.present, true);
    assert.equal(result.pageUrl, 'http://127.0.0.1:23000/admin/demo-page');
    assert.equal(calls.some((call) => call.url.includes('/api/desktopRoutes:createV2')), true);
    assert.equal(calls.some((call) => call.url.includes('/api/desktopRoutes:listAccessible')), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
