import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadRegistry } from './opaque_uid.mjs';
import {
  normalizeDesktopRouteWriteResult,
  normalizeMenuPlacementCliOverride,
  resolveEffectiveMenuPlacement,
  resolveExplicitGroupRoute,
  resolveMenuParentRoute,
} from './menu_placement_runtime.mjs';

function makeRegistryPath(testName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `menu-placement-${testName}-`));
  return path.join(dir, 'pages.v1.json');
}

test('menu placement CLI override infers grouped mode from group flags', () => {
  assert.deepEqual(
    normalizeMenuPlacementCliOverride({
      'menu-group-title': '审批系统',
    }),
    {
      mode: 'group',
      groupTitle: '审批系统',
      existingGroupRouteId: '',
      existingGroupTitle: '',
    },
  );
});

test('effective menu placement derives reservation key for grouped specs and lets explicit root win', () => {
  const grouped = resolveEffectiveMenuPlacement({
    buildMenuPlacement: {
      strategy: 'group',
      source: 'auto',
      groupTitle: '审批系统',
    },
    fallbackGroupTitle: '审批系统',
    sessionId: 'session-approval',
  });
  assert.equal(grouped.strategy, 'group');
  assert.equal(grouped.source, 'auto');
  assert.equal(grouped.groupTitle, '审批系统');
  assert.match(grouped.groupReservationKey, /^[a-z][a-z0-9]{11}$/);

  const forcedRoot = resolveEffectiveMenuPlacement({
    buildMenuPlacement: grouped,
    menuPlacementOverride: { 'menu-mode': 'root' },
    fallbackGroupTitle: '审批系统',
    sessionId: 'session-approval',
  });
  assert.equal(forcedRoot.strategy, 'root');
  assert.equal(forcedRoot.source, 'explicit');
});

test('desktop route write result normalization handles object and array envelopes', () => {
  assert.deepEqual(
    normalizeDesktopRouteWriteResult({
      data: [
        {
          id: 88,
          type: 'group',
          schemaUid: 'group-1',
        },
      ],
    }),
    {
      id: 88,
      type: 'group',
      schemaUid: 'group-1',
    },
  );

  assert.deepEqual(
    normalizeDesktopRouteWriteResult({
      id: 99,
      type: 'group',
      schemaUid: 'group-2',
    }),
    {
      id: 99,
      type: 'group',
      schemaUid: 'group-2',
    },
  );
});

test('explicit group route resolution prefers route id and rejects ambiguous title matches', () => {
  const routeTree = [
    { id: 11, type: 'group', title: '审批系统', schemaUid: 'group-1', children: [] },
    { id: 22, type: 'group', title: '审批系统', schemaUid: 'group-2', children: [] },
    { id: 33, type: 'flowPage', title: '审批列表', schemaUid: 'page-1', children: [] },
  ];

  const byId = resolveExplicitGroupRoute({
    routeTree,
    existingGroupRouteId: '11',
  });
  assert.equal(byId.schemaUid, 'group-1');

  assert.throws(
    () => resolveExplicitGroupRoute({
      routeTree,
      existingGroupTitle: '审批系统',
    }),
    /ambiguous/,
  );
});

test('menu parent route resolution creates and records grouped menu route', async () => {
  const registryPath = makeRegistryPath('create-group');
  const result = await resolveMenuParentRoute({
    menuPlacement: {
      strategy: 'group',
      source: 'auto',
      groupTitle: '审批系统',
      groupReservationKey: 'session-approval:group',
      existingGroupRouteId: '',
      existingGroupTitle: '',
    },
    requestedParentId: '',
    registryPath,
    sessionId: 'session-approval',
    upsertGroupRoute: async ({ schemaUid, title, parentId }) => ({
      data: [
        {
          id: 108,
          type: 'group',
          schemaUid,
          title,
          parentId,
        },
      ],
    }),
    fetchAccessibleTree: async () => {
      throw new Error('fetchAccessibleTree should not be called when upsert already returns route id');
    },
  });

  assert.equal(result.pageParentId, '108');
  assert.equal(result.groupRoute.routeId, '108');
  assert.equal(loadRegistry(registryPath).groups[0].routeId, '108');
});

test('menu parent route resolution reuses explicit existing group without local registry writes', async () => {
  const result = await resolveMenuParentRoute({
    menuPlacement: {
      strategy: 'group',
      source: 'explicit-reuse',
      groupTitle: '',
      groupReservationKey: '',
      existingGroupRouteId: '',
      existingGroupTitle: '审批系统',
    },
    requestedParentId: '999',
    sessionId: 'session-approval',
    upsertGroupRoute: async () => {
      throw new Error('upsertGroupRoute should not be called in explicit-reuse mode');
    },
    fetchAccessibleTree: async () => ({
      data: [
        { id: 42, type: 'group', title: '审批系统', schemaUid: 'group-approval', children: [] },
      ],
    }),
  });

  assert.equal(result.pageParentId, '42');
  assert.equal(result.groupRoute.schemaUid, 'group-approval');
});
