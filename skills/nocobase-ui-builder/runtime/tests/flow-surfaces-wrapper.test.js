import test from 'node:test';
import assert from 'node:assert/strict';
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

function makeUsersCollectionMetadata() {
  return {
    collections: {
      users: {
        titleField: 'nickname',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', interface: 'integer', type: 'bigInt' },
          { name: 'nickname', interface: 'input', type: 'string' },
          { name: 'email', interface: 'email', type: 'string' },
          { name: 'status', interface: 'select', type: 'string' },
        ],
      },
    },
  };
}

function extractBodyArg(args) {
  const index = args.indexOf('--body');
  assert.notEqual(index, -1, 'expected wrapped nb args to include --body');
  return JSON.parse(args[index + 1]);
}

test('apply-blueprint wrapper prepares cliBody before calling nb', async () => {
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
    JSON.stringify({
      blueprint,
      collectionMetadata: makeUsersCollectionMetadata(),
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
  assert.equal(execCalls[0].command, 'nb');
  assert.deepEqual(execCalls[0].args.slice(0, 3), ['api', 'flow-surfaces', 'apply-blueprint']);
  const body = extractBodyArg(execCalls[0].args);
  assert.equal(Object.hasOwn(body.tabs[0].blocks[0], 'title'), false);
  assert.equal(stdout.read().trim(), JSON.stringify({ ok: true }));
});

test('apply-blueprint wrapper accepts inline equals flags and strips prepare-only flags before calling nb', async () => {
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
    `--body=${JSON.stringify({
      blueprint,
      collectionMetadata: makeUsersCollectionMetadata(),
    })}`,
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

  assert.equal(exitCode, 0);
  assert.equal(stderr.read(), '');
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].command, 'nb');
  assert.deepEqual(execCalls[0].args.slice(0, 3), ['api', 'flow-surfaces', 'apply-blueprint']);
  assert.equal(execCalls[0].args.some((arg) => String(arg).startsWith('--expected-outer-tabs')), false);
  assert.equal(execCalls[0].args.some((arg) => String(arg).startsWith('--max-popup-depth')), false);
  assert.equal(execCalls[0].args.some((arg) => String(arg).startsWith('--no-auto-collection-metadata')), false);
  const body = extractBodyArg(execCalls[0].args);
  assert.equal(Object.hasOwn(body.tabs[0].blocks[0], 'title'), false);
  assert.equal(stdout.read().trim(), JSON.stringify({ ok: true }));
});

test('localized wrapper runs preflight before calling nb', async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const execCalls = [];

  const exitCode = await runFlowSurfacesWrapperCli([
    'add-block',
    '--body',
    JSON.stringify({
      body: {
        target: { uid: 'grid-uid' },
        type: 'table',
        resourceInit: {
          dataSourceKey: 'main',
          collectionName: 'users',
        },
        defaultFilter: {
          logic: '$and',
          items: [
            { path: 'nickname', operator: '$includes', value: '' },
            { path: 'email', operator: '$includes', value: '' },
            { path: 'status', operator: '$eq', value: '' },
          ],
        },
        settings: {
          height: 480,
        },
      },
      collectionMetadata: makeUsersCollectionMetadata(),
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
  assert.equal(body.settings.heightMode, 'specifyValue');
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
