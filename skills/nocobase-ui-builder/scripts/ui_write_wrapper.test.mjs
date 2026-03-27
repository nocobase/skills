import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalizePayload } from './flow_payload_guard.mjs';
import { remapConflictingDescendantUids } from './template_clone_helpers.mjs';
import { runUiWriteWrapper } from './ui_write_wrapper.mjs';

const SNAPSHOT_PATH = fileURLToPath(new URL('./runjs_contract_snapshot.json', import.meta.url));

function makeTempDir(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nb-ui-write-wrapper-${testName}-`));
}

function canonicalizeForTest(payload, metadata = {}) {
  return canonicalizePayload({
    payload,
    metadata,
    snapshotPath: SNAPSHOT_PATH,
  }).payload;
}

test('ui_write_wrapper blocks save before consuming artifacts when guard finds blocker', async () => {
  const sessionRoot = makeTempDir('guard-block');
  const outDir = path.join(sessionRoot, 'out');

  const result = await runUiWriteWrapper({
    action: 'save',
    task: 'guard block test',
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
  assert.equal(fs.existsSync(result.artifactPaths.auditInitial), true);
  assert.match(result.notes.join('\n'), /A guard blocker was hit/);
  assert.equal(result.artifactPaths.writeResult, undefined);
});

test('ui_write_wrapper injects page anchor context and blocks RootPageModel direct route uid writes', async () => {
  const sessionRoot = makeTempDir('guard-root-page-anchor');
  const outDir = path.join(sessionRoot, 'out');

  const result = await runUiWriteWrapper({
    action: 'save',
    task: 'root page anchor guard test',
    sessionRoot,
    outDir,
    payload: {
      uid: 'ir-dashboard',
      use: 'RootPageModel',
      stepParams: {
        pageSettings: {
          general: {
            title: 'Investment Overview',
          },
        },
      },
    },
    metadata: {},
    snapshotFile: SNAPSHOT_PATH,
    readbackParentId: 'ir-dashboard',
    readbackSubKey: 'page',
  });

  assert.equal(result.guardBlocked, true);
  const auditInitial = JSON.parse(fs.readFileSync(result.artifactPaths.auditInitial, 'utf8'));
  assert.equal(auditInitial.blockers.some((item) => item.code === 'ROOT_PAGE_DIRECT_ROUTE_UID_WRITE_BLOCKED'), true);
  assert.equal(result.artifactPaths.writeResult, undefined);
});

test('ui_write_wrapper save canonicalizes payload and validates readback from artifacts', async () => {
  const sessionRoot = makeTempDir('save-success');
  const outDir = path.join(sessionRoot, 'out');
  const payload = {
    use: 'JSBlockModel',
    stepParams: {
      jsSettings: {
        runJs: {
          version: 'v2',
          code: "const rows = await ctx.request({ url: 'users:list' }); ctx.render(String(rows?.data?.length ?? 0));",
        },
      },
    },
  };
  const canonicalizedPayload = canonicalizeForTest(payload);

  const result = await runUiWriteWrapper({
    action: 'save',
    task: 'save success test',
    sessionRoot,
    outDir,
    payload,
    metadata: {},
    snapshotFile: SNAPSHOT_PATH,
    readbackParentId: 'tabs-demo',
    readbackSubKey: 'grid',
    targetSignature: 'grid:tabs-demo',
    writeResult: { data: canonicalizedPayload },
    readback: { data: canonicalizedPayload },
  });

  assert.equal(result.status, 'success');
  assert.equal(result.guardBlocked, undefined);
  assert.equal(fs.existsSync(result.artifactPaths.payloadCanonical), true);
  assert.equal(fs.existsSync(result.artifactPaths.readbackDiff), true);

  const persistedPayload = JSON.parse(fs.readFileSync(result.artifactPaths.payloadCanonical, 'utf8'));
  assert.equal(
    persistedPayload.stepParams.jsSettings.runJs.code.includes("ctx.makeResource('MultiRecordResource')"),
    true,
  );
});

test('ui_write_wrapper save remaps conflicting descendant uid from live topology artifact', async () => {
  const sessionRoot = makeTempDir('save-live-remap');
  const outDir = path.join(sessionRoot, 'out');
  const payload = {
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
  };
  const metadata = {
    collections: {
      orders: {
        titleField: 'id',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', type: 'integer', interface: 'number' },
        ],
      },
    },
  };
  const canonicalizedPayload = canonicalizeForTest(payload, metadata);
  const liveTopologyTree = {
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
  };
  const originalRandom = Math.random;
  Math.random = () => 0.123456789;

  const remapped = remapConflictingDescendantUids({
    model: canonicalizedPayload,
    liveTopology: {
      source: 'findOne',
      nodeCount: 2,
      byUid: {
        'grid-root': {
          uid: 'grid-root',
          parentId: '',
          subKey: '',
          subType: '',
          path: '$',
          use: 'BlockGridModel',
        },
        'existing-table': {
          uid: 'existing-table',
          parentId: 'other-grid',
          subKey: 'items',
          subType: 'array',
          path: '$.subModels.items[0]',
          use: 'TableBlockModel',
        },
      },
    },
    uidSeed: 'grid:tabs-demo',
  });

  let result;
  try {
    result = await runUiWriteWrapper({
      action: 'save',
      task: 'save live remap test',
      sessionRoot,
      outDir,
      payload,
      metadata,
      snapshotFile: SNAPSHOT_PATH,
      readbackParentId: 'tabs-demo',
      readbackSubKey: 'grid',
      targetSignature: 'grid:tabs-demo',
      liveTopology: { data: liveTopologyTree },
      writeResult: { data: remapped.payload },
      readback: { data: remapped.payload },
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(result.status, 'success');
  assert.equal(result.liveTopologyRemap.changed, true);
  assert.equal(fs.existsSync(result.artifactPaths.liveTopologyRemap), true);
  assert.equal(fs.existsSync(result.artifactPaths.payloadRemapped), true);

  const remappedPayload = JSON.parse(fs.readFileSync(result.artifactPaths.payloadRemapped, 'utf8'));
  assert.notEqual(remappedPayload.subModels.items[0].uid, 'existing-table');
});

test('ui_write_wrapper save records chart data readiness from provided artifact', async () => {
  const sessionRoot = makeTempDir('save-chart-probe');
  const outDir = path.join(sessionRoot, 'out');
  const payload = {
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
  };
  const metadata = {
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
  };
  const canonicalizedPayload = canonicalizeForTest(payload, metadata);

  const result = await runUiWriteWrapper({
    action: 'save',
    task: 'save chart data probe test',
    sessionRoot,
    outDir,
    payload,
    metadata,
    readbackParentId: 'tabs-demo',
    readbackSubKey: 'grid',
    targetSignature: 'grid:tabs-demo',
    writeResult: { data: canonicalizedPayload },
    readback: { data: canonicalizedPayload },
    chartDataProbes: {
      probes: [
        {
          uid: 'chart-1',
          title: 'Orders by customer',
          path: '$',
          ok: true,
          rowCount: 1,
        },
      ],
      statusAxis: {
        status: 'ready',
        detail: 'Loaded 1 chart probe artifact with 1 total row.',
      },
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(result.statusAxes.dataReady.status, 'ready');
  assert.equal(result.chartDataProbes[0].rowCount, 1);
  assert.equal(fs.existsSync(result.artifactPaths.chartDataProbes), true);
});

test('ui_write_wrapper marks chart data as not-run when chart exists but probe artifact is missing', async () => {
  const sessionRoot = makeTempDir('save-chart-not-run');
  const outDir = path.join(sessionRoot, 'out');
  const payload = {
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
          },
          chart: {
            option: {
              mode: 'basic',
              builder: {
                type: 'bar',
                xField: 'count_order_no',
                yField: 'count_order_no',
              },
            },
          },
        },
      },
    },
  };
  const metadata = {
    collections: {
      orders: {
        titleField: 'order_no',
        filterTargetKey: 'id',
        fields: [
          { name: 'order_no', type: 'string', interface: 'input' },
        ],
      },
    },
  };
  const canonicalizedPayload = canonicalizeForTest(payload, metadata);

  const result = await runUiWriteWrapper({
    action: 'save',
    task: 'save chart no probe test',
    sessionRoot,
    outDir,
    payload,
    metadata,
    readbackParentId: 'tabs-demo',
    readbackSubKey: 'grid',
    targetSignature: 'grid:tabs-demo',
    writeResult: { data: canonicalizedPayload },
    readback: { data: canonicalizedPayload },
  });

  assert.equal(result.statusAxes.dataReady.status, 'not-run');
});

test('ui_write_wrapper create-v2 verifies route-ready and anchors from artifacts', async () => {
  const sessionRoot = makeTempDir('create-v2');
  const outDir = path.join(sessionRoot, 'out');

  const result = await runUiWriteWrapper({
    action: 'create-v2',
    task: 'create page shell test',
    sessionRoot,
    outDir,
    requestBody: {
      schemaUid: 'demo-page',
      title: 'Demo Page',
    },
    candidatePageUrl: 'http://127.0.0.1:23000/admin/existing-page',
    writeResult: { data: { id: 'route-1', schemaUid: 'demo-page' } },
    routeTree: {
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
    },
    pageAnchor: {
      data: {
        uid: 'page-uid',
        use: 'RootPageModel',
      },
    },
    gridAnchor: {
      data: {
        uid: 'grid-uid',
        use: 'BlockGridModel',
      },
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(result.routeReady.ok, true);
  assert.equal(result.pageAnchor.present, true);
  assert.equal(result.gridAnchor.present, true);
  assert.equal(result.pageUrl, 'http://127.0.0.1:23000/admin/demo-page');
});
