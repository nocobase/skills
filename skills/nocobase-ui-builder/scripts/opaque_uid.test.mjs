import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_REGISTRY_PATH,
  createEmptyRegistry,
  loadRegistry,
  nodeUid,
  nodeUids,
  recordGroupRoute,
  renamePage,
  reserveGroup,
  reservePage,
  resolveGroup,
  resolvePage,
} from './opaque_uid.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./opaque_uid.mjs', import.meta.url));
const SKILL_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

function makeRegistryPath(testName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `opaque-uid-${testName}-`));
  return path.join(dir, 'pages.v1.json');
}

test('default registry constant points to agent-neutral state directory', () => {
  assert.match(DEFAULT_REGISTRY_PATH, /\.nocobase\/state\/nocobase-ui-builder\/pages\.v1\.json$/);
});

test('default registry path is isolated by session root', () => {
  const firstSessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opaque-uid-session-a-'));
  const secondSessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opaque-uid-session-b-'));

  const first = reservePage({ title: 'Users', sessionRoot: firstSessionRoot });
  const second = reservePage({ title: 'Users', sessionRoot: secondSessionRoot });
  const firstRegistry = loadRegistry(undefined, { sessionRoot: firstSessionRoot });
  const secondRegistry = loadRegistry(undefined, { sessionRoot: secondSessionRoot });

  assert.equal(first.created, true);
  assert.equal(second.created, true);
  assert.notEqual(first.registryPath, second.registryPath);
  assert.notEqual(first.page.schemaUid, second.page.schemaUid);
  assert.equal(firstRegistry.pages.length, 1);
  assert.equal(secondRegistry.pages.length, 1);
});

test('reserve-page is idempotent for the same current title', () => {
  const registryPath = makeRegistryPath('reserve');

  const first = reservePage({ title: 'Users', registryPath });
  const second = reservePage({ title: 'Users', registryPath });
  const registry = loadRegistry(registryPath);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.page.schemaUid, second.page.schemaUid);
  assert.equal(first.page.defaultTabSchemaUid, `tabs-${first.page.schemaUid}`);
  assert.equal(registry.pages.length, 1);
});

test('reserve-group is idempotent for the same reservation key and stores route id', () => {
  const registryPath = makeRegistryPath('group');

  const first = reserveGroup({ title: '审批系统', reservationKey: 'session-1:approval', registryPath });
  const second = reserveGroup({ title: '审批系统', reservationKey: 'session-1:approval', registryPath });
  const recorded = recordGroupRoute({
    reservationKey: 'session-1:approval',
    routeId: 88,
    registryPath,
  });
  const resolved = resolveGroup({ reservationKey: 'session-1:approval', registryPath });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.group.schemaUid, second.group.schemaUid);
  assert.equal(recorded.group.routeId, '88');
  assert.equal(resolved.group.routeId, '88');
  assert.equal(loadRegistry(registryPath).groups.length, 1);
});

test('resolve-group by title fails when local registry contains duplicate titles', () => {
  const registryPath = makeRegistryPath('group-ambiguous');

  reserveGroup({ title: '系统页面', reservationKey: 'session-1:a', registryPath });
  reserveGroup({ title: '系统页面', reservationKey: 'session-1:b', registryPath });

  assert.throws(
    () => resolveGroup({ title: '系统页面', registryPath }),
    /ambiguous/,
  );
});

test('rename-page preserves the original title as an alias', () => {
  const registryPath = makeRegistryPath('rename');
  const created = reservePage({ title: 'Users', registryPath });

  const renamed = renamePage({
    schemaUid: created.page.schemaUid,
    title: 'Users Admin',
    registryPath,
  });
  const resolvedByNewTitle = resolvePage({ title: 'Users Admin', registryPath });
  const resolvedByOldAlias = resolvePage({ title: 'Users', registryPath });

  assert.equal(renamed.updated, true);
  assert.deepEqual(renamed.page.aliases, ['Users']);
  assert.equal(resolvedByNewTitle.page.schemaUid, created.page.schemaUid);
  assert.equal(resolvedByOldAlias.page.schemaUid, created.page.schemaUid);
});

test('reserve-page rejects titles that collide with another page alias', () => {
  const registryPath = makeRegistryPath('alias');
  const created = reservePage({ title: 'Orders', registryPath });
  renamePage({
    schemaUid: created.page.schemaUid,
    title: 'Orders Admin',
    registryPath,
  });

  assert.throws(
    () => reservePage({ title: 'Orders', registryPath }),
    /already reserved/,
  );
});

test('node-uid is stable and changes when logical path changes', () => {
  const first = nodeUid({
    pageSchemaUid: 'k7n4x9p2q5ra',
    use: 'TableBlockModel',
    logicalPath: 'block:table:users:main',
  });
  const second = nodeUid({
    pageSchemaUid: 'k7n4x9p2q5ra',
    use: 'TableBlockModel',
    logicalPath: 'block:table:users:main',
  });
  const other = nodeUid({
    pageSchemaUid: 'k7n4x9p2q5ra',
    use: 'TableBlockModel',
    logicalPath: 'block:table:users:main:column:email',
  });

  assert.equal(first.uid, second.uid);
  assert.notEqual(first.uid, other.uid);
  assert.equal(first.uid.length, 12);
  assert.match(first.uid, /^[a-z][a-z0-9]{11}$/);
});

test('node-uids returns keyed batch results in order', () => {
  const batch = nodeUids({
    pageSchemaUid: 'k7n4x9p2q5ra',
    specs: [
      {
        key: 'usersTable',
        use: 'TableBlockModel',
        path: 'block:table:users:main',
      },
      {
        key: 'usersForm',
        use: 'CreateFormModel',
        path: 'block:create-form:users:main',
      },
    ],
  });

  assert.equal(batch.pageSchemaUid, 'k7n4x9p2q5ra');
  assert.deepEqual(
    batch.items.map((item) => item.key),
    ['usersTable', 'usersForm'],
  );
  assert.match(batch.items[0].uid, /^[a-z][a-z0-9]{11}$/);
  assert.match(batch.items[1].uid, /^[a-z][a-z0-9]{11}$/);
  assert.notEqual(batch.items[0].uid, batch.items[1].uid);
});

test('resolve-page by title fails cleanly when the registry file is missing', () => {
  const registryPath = makeRegistryPath('missing');

  assert.deepEqual(loadRegistry(registryPath), createEmptyRegistry());
  assert.throws(
    () => resolvePage({ title: 'Missing', registryPath }),
    /provide schemaUid explicitly/,
  );
});

test('cli smoke test writes and resolves opaque values', () => {
  const registryPath = makeRegistryPath('cli');

  const reserveOutput = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'reserve-page', '--title', 'Customers', '--registry-path', registryPath],
    { cwd: SKILL_ROOT, encoding: 'utf8' },
  );
  const reserveResult = JSON.parse(reserveOutput);

  const resolveOutput = execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'node-uids',
      '--page-schema-uid',
      reserveResult.page.schemaUid,
      '--specs-json',
      JSON.stringify([
        {
          key: 'createForm',
          use: 'CreateFormModel',
          path: 'block:create-form:customers:main',
        },
      ]),
    ],
    { cwd: SKILL_ROOT, encoding: 'utf8' },
  );
  const nodeResult = JSON.parse(resolveOutput);

  assert.equal(reserveResult.page.defaultTabSchemaUid, `tabs-${reserveResult.page.schemaUid}`);
  assert.match(reserveResult.page.schemaUid, /^[a-z][a-z0-9]{11}$/);
  assert.equal(nodeResult.items[0].key, 'createForm');
  assert.match(nodeResult.items[0].uid, /^[a-z][a-z0-9]{11}$/);
});

test('cli rejects deprecated node-uid command', () => {
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'node-uid',
      '--page-schema-uid',
      'k7n4x9p2q5ra',
      '--use',
      'CreateFormModel',
      '--path',
      'block:create-form:customers:main',
    ],
    {
      cwd: SKILL_ROOT,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command "node-uid"/);
});
