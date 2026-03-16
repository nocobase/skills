import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  DEFAULT_REGISTRY_PATH,
  createEmptyRegistry,
  loadRegistry,
  nodeUid,
  renamePage,
  reservePage,
  resolvePage,
} from './opaque_uid.mjs';

function makeRegistryPath(testName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `opaque-uid-${testName}-`));
  return path.join(dir, 'pages.v1.json');
}

test('default registry path points to codex state directory', () => {
  assert.match(DEFAULT_REGISTRY_PATH, /\.codex\/state\/nocobase-ui-builder\/pages\.v1\.json$/);
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
  const scriptPath = path.join(
    process.cwd(),
    'skills',
    'nocobase-ui-builder',
    'scripts',
    'opaque_uid.mjs',
  );

  const reserveOutput = execFileSync(
    process.execPath,
    [scriptPath, 'reserve-page', '--title', 'Customers', '--registry-path', registryPath],
    { cwd: path.join(process.cwd(), 'skills', 'nocobase-ui-builder'), encoding: 'utf8' },
  );
  const reserveResult = JSON.parse(reserveOutput);

  const resolveOutput = execFileSync(
    process.execPath,
    [
      scriptPath,
      'node-uid',
      '--page-schema-uid',
      reserveResult.page.schemaUid,
      '--use',
      'CreateFormModel',
      '--path',
      'block:create-form:customers:main',
    ],
    { cwd: path.join(process.cwd(), 'skills', 'nocobase-ui-builder'), encoding: 'utf8' },
  );
  const nodeResult = JSON.parse(resolveOutput);

  assert.equal(reserveResult.page.defaultTabSchemaUid, `tabs-${reserveResult.page.schemaUid}`);
  assert.match(reserveResult.page.schemaUid, /^[a-z][a-z0-9]{11}$/);
  assert.match(nodeResult.uid, /^[a-z][a-z0-9]{11}$/);
});
