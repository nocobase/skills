import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { canonicalizePayload } from './flow_payload_guard.mjs';
import { WRITE_FAILURE_EXIT_CODE, runFlowWrite } from './flow_write_wrapper.mjs';
import { remapConflictingDescendantUids } from './template_clone_helpers.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./flow_write_wrapper.mjs', import.meta.url));
const SNAPSHOT_PATH = fileURLToPath(new URL('./runjs_contract_snapshot.json', import.meta.url));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      resolve({
        error,
        stdout,
        stderr,
        status: error && typeof error.code === 'number' ? error.code : 0,
      });
    });
  });
}

function canonicalizeForTest(payload, metadata = {}) {
  return canonicalizePayload({
    payload,
    metadata,
    snapshotPath: SNAPSHOT_PATH,
  }).payload;
}

function buildBaseArgs({ tempDir, payloadFile, operation = 'save', extra = [] }) {
  const outDir = path.join(tempDir, 'out');
  const args = [
    SCRIPT_PATH,
    'run',
    '--operation',
    operation,
    '--task',
    'flow wrapper test',
    '--payload-file',
    payloadFile,
    '--out-dir',
    outDir,
    '--snapshot-file',
    SNAPSHOT_PATH,
    ...extra,
  ];
  if (operation !== 'create-v2') {
    args.push(
      '--readback-parent-id',
      'tabs-demo',
      '--readback-sub-key',
      'grid',
      '--target-signature',
      'page.root',
    );
  }
  return args;
}

test('flow_write_wrapper blocks write before consuming artifacts when guard fails', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-block-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  writeJson(payloadFile, {
    use: 'JSBlockModel',
    stepParams: {
      jsSettings: {
        runJs: {
          version: 'v2',
          code: "await fetch('/api/auth:check')",
        },
      },
    },
  });

  const result = spawnSync(process.execPath, buildBaseArgs({
    tempDir,
    payloadFile,
  }), {
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.guardBlocked, true);
  assert.equal(parsed.notes.includes('guard 命中 blocker，wrapper 已阻断实际写入。'), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'audit.initial.json')), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'save-result.json')), false);
});

test('flow_write_wrapper completes save + readback through artifact wrapper', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-save-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const writeResultFile = path.join(tempDir, 'write-result.json');
  const readbackFile = path.join(tempDir, 'readback.json');
  const payload = {
    uid: 'grid_demo',
    use: 'BlockGridModel',
    subModels: {
      items: [],
    },
  };
  writeJson(payloadFile, payload);
  writeJson(writeResultFile, { data: payload });
  writeJson(readbackFile, { data: payload });

  const result = await execFileAsync(process.execPath, buildBaseArgs({
    tempDir,
    payloadFile,
    extra: [
      '--write-result-file',
      writeResultFile,
      '--readback-file',
      readbackFile,
    ],
  }), {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'success');
  assert.equal(parsed.readback.ok, true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'readback.json')), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'summary.json')), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'save-result.json')), true);
});

test('flow_write_wrapper enforces readback validation for mutate with separate verify payload', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-mutate-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const verifyPayloadFile = path.join(tempDir, 'verify-payload.json');
  const readbackContractFile = path.join(tempDir, 'readback-contract.json');
  const writeResultFile = path.join(tempDir, 'write-result.json');
  const readbackFile = path.join(tempDir, 'readback.json');

  writeJson(payloadFile, {
    atomic: true,
    ops: [{
      opId: 'noop',
      type: 'save',
      params: {
        uid: 'grid_demo',
      },
    }],
  });
  writeJson(verifyPayloadFile, {
    uid: 'grid_demo',
    use: 'BlockGridModel',
    subModels: {
      items: [],
    },
  });
  writeJson(readbackContractFile, {
    requiredTopLevelUses: ['JSBlockModel'],
  });
  writeJson(writeResultFile, { data: { ok: true } });
  writeJson(readbackFile, {
    data: {
      uid: 'grid_demo',
      use: 'BlockGridModel',
      subModels: {
        items: [],
      },
    },
  });

  const result = await execFileAsync(process.execPath, buildBaseArgs({
    tempDir,
    payloadFile,
    operation: 'mutate',
    extra: [
      '--verify-payload-file',
      verifyPayloadFile,
      '--readback-contract-file',
      readbackContractFile,
      '--write-result-file',
      writeResultFile,
      '--readback-file',
      readbackFile,
    ],
  }), {
    encoding: 'utf8',
  });

  assert.equal(result.status, WRITE_FAILURE_EXIT_CODE);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'partial');
  assert.equal(parsed.verifyPayloadSeparate, true);
  assert.equal(parsed.readback.contract.ok, false);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'verify-payload.canonical.json')), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'readback-contract.json')), true);
});

test('flow_write_wrapper remaps conflicting descendant uid before write when live topology artifact disagrees', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-live-topology-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const metadataFile = path.join(tempDir, 'metadata.json');
  const liveTopologyFile = path.join(tempDir, 'live-topology.json');
  const writeResultFile = path.join(tempDir, 'write-result.json');
  const readbackFile = path.join(tempDir, 'readback.json');

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
    uidSeed: 'page.root',
  });

  writeJson(payloadFile, payload);
  writeJson(metadataFile, metadata);
  writeJson(liveTopologyFile, { data: liveTopologyTree });
  writeJson(writeResultFile, { data: remapped.payload });
  writeJson(readbackFile, { data: remapped.payload });

  let result;
  try {
    result = await runFlowWrite({
      operation: 'save',
      task: 'flow wrapper test',
      'payload-file': payloadFile,
      'out-dir': path.join(tempDir, 'out'),
      'snapshot-file': SNAPSHOT_PATH,
      'readback-parent-id': 'tabs-demo',
      'readback-sub-key': 'grid',
      'target-signature': 'page.root',
      'metadata-file': metadataFile,
      'live-topology-file': liveTopologyFile,
      'write-result-file': writeResultFile,
      'readback-file': readbackFile,
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(result.exitCode, 0);

  const parsed = result.summary;
  assert.equal(parsed.status, 'success');
  assert.equal(parsed.liveTopologyRemap.changed, true);
  const remappedPayload = JSON.parse(fs.readFileSync(path.join(tempDir, 'out', 'verify-payload.remapped.json'), 'utf8'));
  assert.notEqual(remappedPayload.subModels.items[0].uid, 'existing-table');
  const audit = JSON.parse(fs.readFileSync(path.join(tempDir, 'out', 'audit.json'), 'utf8'));
  assert.equal(audit.blockers.some((item) => item.code === 'EXISTING_UID_REPARENT_BLOCKED'), false);
});

test('flow_write_wrapper completes create-v2 with route-ready and anchor artifacts', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-createv2-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const writeResultFile = path.join(tempDir, 'write-result.json');
  const routeTreeFile = path.join(tempDir, 'route-tree.json');
  const pageAnchorFile = path.join(tempDir, 'page-anchor.json');
  const gridAnchorFile = path.join(tempDir, 'grid-anchor.json');

  writeJson(payloadFile, {
    schemaUid: 'demo-page',
    title: 'Demo Page',
  });
  writeJson(writeResultFile, { data: { schemaUid: 'demo-page' } });
  writeJson(routeTreeFile, {
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
  writeJson(pageAnchorFile, { data: { uid: 'page-uid', use: 'RootPageModel' } });
  writeJson(gridAnchorFile, { data: { uid: 'grid-uid', use: 'BlockGridModel' } });

  const result = await execFileAsync(process.execPath, buildBaseArgs({
    tempDir,
    payloadFile,
    operation: 'create-v2',
    extra: [
      '--candidate-page-url',
      'http://127.0.0.1:23000/admin/existing-page',
      '--write-result-file',
      writeResultFile,
      '--route-tree-file',
      routeTreeFile,
      '--page-anchor-file',
      pageAnchorFile,
      '--grid-anchor-file',
      gridAnchorFile,
    ],
  }), {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, 'success');
  assert.equal(parsed.routeReady.ok, true);
  assert.equal(parsed.pageAnchor.present, true);
  assert.equal(parsed.gridAnchor.present, true);
  assert.equal(parsed.pageUrl, 'http://127.0.0.1:23000/admin/demo-page');
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'route-tree.json')), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'anchor-page.json')), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'anchor-grid.json')), true);
});
