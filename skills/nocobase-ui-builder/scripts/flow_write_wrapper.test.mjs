import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { WRITE_FAILURE_EXIT_CODE } from './flow_write_wrapper.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./flow_write_wrapper.mjs', import.meta.url));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function startServer(handler) {
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  server.keepAliveTimeout = 1;
  server.headersTimeout = 1000;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.closeAllConnections?.();
      server.closeIdleConnections?.();
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

function buildArgs({
  tempDir,
  payloadFile,
  operation = 'save',
  urlBase,
  extra = [],
}) {
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
    '--url-base',
    urlBase,
    ...extra,
  ];
  if (operation !== 'create-v2') {
    args.splice(8, 0,
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

test('flow_write_wrapper blocks write before network when guard fails', () => {
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

  const result = spawnSync(process.execPath, buildArgs({
    tempDir,
    payloadFile,
    urlBase: 'http://127.0.0.1:1',
  }), {
    encoding: 'utf8',
    env: {
      ...process.env,
      NOCOBASE_API_TOKEN: 'test-token',
    },
  });

  assert.equal(result.status, 2);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.guardBlocked, true);
  assert.equal(parsed.notes.includes('guard 命中 blocker，wrapper 已阻止写入。'), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'audit.initial.json')), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'out', 'save-result.json')), false);
});

test('flow_write_wrapper completes save + readback through the wrapper', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-save-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const payload = {
    uid: 'grid_demo',
    use: 'BlockGridModel',
    subModels: {
      items: [],
    },
  };
  writeJson(payloadFile, payload);

  const serverState = {
    saveCalls: 0,
    readbackCalls: 0,
  };
  let savedPayload = null;
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/api/flowModels:save') {
      serverState.saveCalls += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: payload }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/flowModels:findOne') {
      serverState.readbackCalls += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: payload }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  try {
    const result = await execFileAsync(process.execPath, buildArgs({
      tempDir,
      payloadFile,
      urlBase: server.baseUrl,
    }), {
      encoding: 'utf8',
      env: {
        ...process.env,
        NOCOBASE_API_TOKEN: 'test-token',
      },
    });

    assert.equal(result.status, 0);
    assert.equal(serverState.saveCalls, 1);
    assert.equal(serverState.readbackCalls, 2);

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.readback.ok, true);
    assert.equal(fs.existsSync(path.join(tempDir, 'out', 'readback.json')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'out', 'summary.json')), true);
  } finally {
    await server.close();
  }
});

test('flow_write_wrapper enforces readback validation for mutate with separate verify payload', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-mutate-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const verifyPayloadFile = path.join(tempDir, 'verify-payload.json');
  const readbackContractFile = path.join(tempDir, 'readback-contract.json');

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

  const serverState = {
    mutateCalls: 0,
    readbackCalls: 0,
  };
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/api/flowModels:mutate') {
      serverState.mutateCalls += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: { ok: true } }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/flowModels:findOne') {
      serverState.readbackCalls += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        data: {
          uid: 'grid_demo',
          use: 'BlockGridModel',
          subModels: {
            items: [],
          },
        },
      }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  try {
    const result = await execFileAsync(process.execPath, buildArgs({
      tempDir,
      payloadFile,
      operation: 'mutate',
      urlBase: server.baseUrl,
      extra: [
        '--verify-payload-file',
        verifyPayloadFile,
        '--readback-contract-file',
        readbackContractFile,
      ],
    }), {
      encoding: 'utf8',
      env: {
        ...process.env,
        NOCOBASE_API_TOKEN: 'test-token',
      },
    });

    assert.equal(result.status, WRITE_FAILURE_EXIT_CODE);
    assert.equal(serverState.mutateCalls, 1);
    assert.equal(serverState.readbackCalls, 2);

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'failed');
    assert.equal(parsed.verifyPayloadSeparate, true);
    assert.equal(parsed.readback.contract.ok, false);
    assert.equal(fs.existsSync(path.join(tempDir, 'out', 'verify-payload.canonical.json')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'out', 'readback-contract.json')), true);
  } finally {
    await server.close();
  }
});

test('flow_write_wrapper remaps conflicting descendant uid before write when live topology disagrees', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-live-topology-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  const metadataFile = path.join(tempDir, 'metadata.json');
  writeJson(payloadFile, {
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
  });
  writeJson(metadataFile, {
    collections: {
      orders: {
        titleField: 'id',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', type: 'integer', interface: 'number' },
        ],
      },
    },
  });

  const serverState = {
    saveCalls: 0,
    readbackCalls: 0,
  };
  let savedPayload = null;
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/flowModels:findOne') {
      serverState.readbackCalls += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      const liveTree = {
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
      };
      if (serverState.readbackCalls === 1) {
        res.end(JSON.stringify(liveTree));
        return;
      }
      res.end(JSON.stringify({ data: savedPayload || liveTree.data }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/flowModels:save') {
      serverState.saveCalls += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      const body = JSON.parse(req.headers['content-length'] ? await new Promise((resolve, reject) => {
        let raw = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
          raw += chunk;
        });
        req.on('end', () => resolve(raw));
        req.on('error', reject);
      }) : '{}');
      savedPayload = body;
      res.end(JSON.stringify({ data: body }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  try {
    const result = await execFileAsync(process.execPath, buildArgs({
      tempDir,
      payloadFile,
      urlBase: server.baseUrl,
      extra: [
        '--metadata-file',
        metadataFile,
      ],
    }), {
      encoding: 'utf8',
      env: {
        ...process.env,
        NOCOBASE_API_TOKEN: 'test-token',
      },
    });

    assert.equal(result.status, 0);
    assert.equal(serverState.readbackCalls, 2);
    assert.equal(serverState.saveCalls, 1);

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.liveTopologyRemap.changed, true);
    const remappedPayload = JSON.parse(fs.readFileSync(path.join(tempDir, 'out', 'verify-payload.remapped.json'), 'utf8'));
    assert.notEqual(remappedPayload.subModels.items[0].uid, 'existing-table');
    const audit = JSON.parse(fs.readFileSync(path.join(tempDir, 'out', 'audit.json'), 'utf8'));
    assert.equal(audit.blockers.some((item) => item.code === 'EXISTING_UID_REPARENT_BLOCKED'), false);
  } finally {
    await server.close();
  }
});

test('flow_write_wrapper completes create-v2 with route-ready and anchor checks', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-write-wrapper-createv2-'));
  const payloadFile = path.join(tempDir, 'payload.json');
  writeJson(payloadFile, {
    schemaUid: 'demo-page',
    title: 'Demo Page',
  });

  const serverState = {
    createCalls: 0,
    routeTreeCalls: 0,
    anchorCalls: 0,
  };
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/api/desktopRoutes:createV2') {
      serverState.createCalls += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: { schemaUid: 'demo-page' } }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/desktopRoutes:listAccessible') {
      serverState.routeTreeCalls += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
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
      }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/flowModels:findOne') {
      serverState.anchorCalls += 1;
      const parentId = url.searchParams.get('parentId');
      if (parentId === 'demo-page') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { uid: 'page-uid', use: 'RootPageModel' } }));
        return;
      }
      if (parentId === 'tabs-demo-page') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { uid: 'grid-uid', use: 'BlockGridModel' } }));
        return;
      }
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  try {
    const result = await execFileAsync(process.execPath, buildArgs({
      tempDir,
      payloadFile,
      operation: 'create-v2',
      urlBase: server.baseUrl,
    }), {
      encoding: 'utf8',
      env: {
        ...process.env,
        NOCOBASE_API_TOKEN: 'test-token',
      },
    });

    assert.equal(result.status, 0);
    assert.equal(serverState.createCalls, 1);
    assert.equal(serverState.routeTreeCalls, 1);
    assert.equal(serverState.anchorCalls, 2);

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'success');
    assert.equal(parsed.routeReady.ok, true);
    assert.equal(parsed.pageAnchor.present, true);
    assert.equal(parsed.gridAnchor.present, true);
    assert.equal(parsed.pageUrl, `${server.baseUrl}/admin/demo-page`);
    assert.equal(fs.existsSync(path.join(tempDir, 'out', 'route-tree.json')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'out', 'anchor-page.json')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'out', 'anchor-grid.json')), true);
  } finally {
    await server.close();
  }
});
