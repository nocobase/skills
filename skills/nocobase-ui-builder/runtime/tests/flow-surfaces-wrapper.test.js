import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { runFlowSurfacesWrapperCli } from '../src/flow-surfaces-wrapper-cli.js';

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

function extractBodyArg(args) {
  const index = args.indexOf('--body');
  if (index !== -1) {
    return JSON.parse(args[index + 1]);
  }
  const inline = args.find((arg) => typeof arg === 'string' && arg.startsWith('--body='));
  assert.ok(inline, 'expected wrapped nb args to include --body');
  return JSON.parse(inline.slice('--body='.length));
}

function findFlowSurfacesCall(execCalls, subcommand) {
  return execCalls.find((call) =>
    call.command === 'nb'
    && call.args[0] === 'api'
    && call.args[1] === 'flow-surfaces'
    && call.args[2] === subcommand,
  );
}

function makeSessionRoot(testName) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nb-flow-wrapper-${testName}-`));
}

test('apply-blueprint wrapper passes raw body through to nb', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const execCalls = [];
  const blueprint = {
    version: '1',
    mode: 'create',
    navigation: {
      group: { routeId: 'route-1' },
      item: { title: 'Users', icon: 'TeamOutlined' },
    },
    page: { title: 'Users' },
    defaults: {
      collections: {
        users: {
          popups: {
            addNew: { name: 'Create user', description: 'Create one user record.' },
            view: { name: 'User details', description: 'View one user record.' },
            edit: { name: 'Edit user', description: 'Edit one user record.' },
          },
        },
      },
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            title: 'Users table',
            collection: 'users',
            defaultFilter: {
              logic: '$and',
              items: [
                { path: 'nickname', operator: '$includes', value: '' },
                { path: 'email', operator: '$includes', value: '' },
                { path: 'status', operator: '$eq', value: '' },
              ],
            },
            fields: ['nickname', 'email', 'status'],
          },
        ],
      },
    ],
  };

  const exitCode = await runFlowSurfacesWrapperCli([
    'apply-blueprint',
    '--body',
    JSON.stringify(blueprint),
    '-j',
  ], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      execCalls.push({ command, args });
      return {
        stdout: JSON.stringify({ ok: true }),
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.equal(execCalls.length, 1);
  const applyCall = findFlowSurfacesCall(execCalls, 'apply-blueprint');
  assert.ok(applyCall);
  const body = extractBodyArg(applyCall.args);
  assert.deepEqual(body, blueprint);
  assert.equal(body.tabs[0].blocks[0].title, 'Users table');
  assert.equal(stdout.read().trim(), JSON.stringify({ ok: true }));
});

test('apply-blueprint wrapper rejects legacy helper-only write gate flags', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const execCalls = [];
  const blueprint = {
    version: '1',
    mode: 'create',
    navigation: {
      group: { routeId: 'route-1' },
      item: { title: 'Users', icon: 'TeamOutlined' },
    },
    page: { title: 'Users' },
    defaults: {
      collections: {
        users: {
          popups: {
            addNew: { name: 'Create user', description: 'Create one user record.' },
            view: { name: 'User details', description: 'View one user record.' },
            edit: { name: 'Edit user', description: 'Edit one user record.' },
          },
        },
      },
    },
    tabs: [
      {
        title: 'Overview',
        blocks: [
          {
            key: 'usersTable',
            type: 'table',
            title: 'Users table',
            collection: 'users',
            defaultFilter: {
              logic: '$and',
              items: [
                { path: 'nickname', operator: '$includes', value: '' },
                { path: 'email', operator: '$includes', value: '' },
                { path: 'status', operator: '$eq', value: '' },
              ],
            },
            fields: ['nickname', 'email', 'status'],
          },
        ],
      },
    ],
  };

  const exitCode = await runFlowSurfacesWrapperCli([
    'apply-blueprint',
    `--body=${JSON.stringify(blueprint)}`,
    '--expected-outer-tabs=1',
    '--max-popup-depth=2',
    '--no-auto-collection-metadata=true',
    '-j',
  ], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      execCalls.push({ command, args });
      return {
        stdout: JSON.stringify({ ok: true }),
      };
    },
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout.read(), '');
  assert.deepEqual(execCalls, []);
  const errorBody = JSON.parse(stderr.read());
  assert.equal(errorBody.ok, false);
  assert.match(errorBody.error, /Legacy UI Builder helper flag --expected-outer-tabs is no longer supported/);
  assert.match(errorBody.error, /backend authoring now owns validation\/defaulting/);
});

test('wrapper help does not advertise legacy helper-only write gate flags', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const execCalls = [];

  const exitCode = await runFlowSurfacesWrapperCli(['help'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      execCalls.push({ command, args });
      return {
        stdout: JSON.stringify({ ok: true }),
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.deepEqual(execCalls, []);
  const body = JSON.parse(stdout.read());
  const usageText = JSON.stringify(body.usage);
  assert.doesNotMatch(usageText, /collection-metadata|expected-outer-tabs|max-popup-depth|no-auto-collection-metadata/);
});

test('localized wrapper passes raw body through without preflight', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const execCalls = [];

  const exitCode = await runFlowSurfacesWrapperCli([
    'add-block',
    '--body',
    JSON.stringify({
      target: { uid: 'grid-uid' },
      type: 'table',
      resourceInit: {
        dataSourceKey: 'main',
        collectionName: 'users',
      },
      settings: {
        height: 480,
      },
    }),
    '-j',
  ], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      execCalls.push({ command, args });
      return {
        stdout: JSON.stringify({ ok: true }),
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.equal(execCalls.length, 1);
  assert.deepEqual(execCalls[0].args.slice(0, 3), ['api', 'flow-surfaces', 'add-block']);
  const body = extractBodyArg(execCalls[0].args);
  assert.deepEqual(body, {
    target: { uid: 'grid-uid' },
    type: 'table',
    resourceInit: {
      dataSourceKey: 'main',
      collectionName: 'users',
    },
    settings: {
      height: 480,
    },
  });
  assert.equal(Object.hasOwn(body.settings, 'heightMode'), false);
});

test('read commands passthrough to nb flow-surfaces', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const execCalls = [];

  const exitCode = await runFlowSurfacesWrapperCli(['get', '--page-schema-uid', 'page-1', '-j'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      execCalls.push({ command, args });
      return { stdout: JSON.stringify({ data: { ok: true } }) };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].command, 'nb');
  assert.deepEqual(execCalls[0].args, ['api', 'flow-surfaces', 'get', '--page-schema-uid', 'page-1', '-j']);
});

test('unknown commands also passthrough to nb flow-surfaces', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const execCalls = [];

  const exitCode = await runFlowSurfacesWrapperCli(['future-command', '--flag', 'value'], {
    cwd: process.cwd(),
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      execCalls.push({ command, args });
      return { stdout: 'ok\n' };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.equal(stdout.read(), 'ok\n');
  assert.equal(execCalls.length, 1);
  assert.deepEqual(execCalls[0].args, ['api', 'flow-surfaces', 'future-command', '--flag', 'value']);
});

test('apply-blueprint wrapper records page identity after successful write', async () => {
  const sessionRoot = makeSessionRoot('page-identity');
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const execCalls = [];
  const blueprint = {
    version: '1',
    mode: 'create',
    navigation: {
      group: { title: 'Workspace', icon: 'AppstoreOutlined' },
      item: { title: 'Users', icon: 'TeamOutlined' },
    },
    page: { title: 'Users' },
    tabs: [
      {
        title: 'Overview',
        blocks: [{ key: 'note', type: 'markdown', content: 'Hello' }],
      },
    ],
  };

  const exitCode = await runFlowSurfacesWrapperCli([
    'apply-blueprint',
    '--body',
    JSON.stringify({ blueprint }),
    '-j',
  ], {
    cwd: process.cwd(),
    sessionRoot,
    stdout: stdout.stream,
    stderr: stderr.stream,
    async execFileImpl(command, args) {
      execCalls.push({ command, args });
      if (args[0] === 'api' && args[1] === 'flow-surfaces' && args[2] === 'apply-blueprint') {
        const body = extractBodyArg(args);
        assert.deepEqual(body, { blueprint });
        return {
          stdout: JSON.stringify({
            target: {
              pageSchemaUid: 'page-88',
              pageUid: 'page-live-88',
            },
            page: {
              pageTitle: 'Users',
              menuGroupTitle: 'Workspace',
              menuGroupRouteId: '11',
            },
          }),
        };
      }
      throw new Error(`unexpected command: ${[command, ...args].join(' ')}`);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.equal(execCalls.length, 1);
  const registryPath = path.join(sessionRoot, 'pages.v1.json');
  const saved = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.equal(saved.pageIdentity.pages.length, 1);
  assert.deepEqual(saved.pageIdentity.pages[0], {
    pageSchemaUid: 'page-88',
    pageUid: 'page-live-88',
    title: 'Users',
    menuGroupTitle: 'Workspace',
    groupRouteId: '11',
    groupRouteLabel: '',
    updatedAt: saved.pageIdentity.pages[0].updatedAt,
  });
});
