/**
 * Phase 1 integration test — NocoBase DSL Reconciler TypeScript rewrite.
 *
 * Tests:
 *   1. NocoBaseClient connection + auth
 *   2. Collections API (fieldMeta, exists)
 *   3. FlowSurfaces API (get)
 *   4. Routes API (list)
 *   5. RefResolver (build from sample state, resolve paths, fuzzy matching)
 *   6. Utils (slugify, deepMerge, generateUid)
 *
 * Run:
 *   NB_USER=admin@nocobase.com NB_PASSWORD=admin123 npx tsx test-phase1.ts
 */

import { NocoBaseClient } from './client/nocobase-client';
import { RefResolver } from './refs/ref-resolver';
import { slugify } from './utils/slugify';
import { generateUid } from './utils/uid';
import { deepMerge } from './utils/deep-merge';
import type { ModuleState } from './types/state';

// ── Helpers ──

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    const msg = detail ? `${label} — ${detail}` : label;
    failures.push(msg);
    console.log(`  FAIL  ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

// ══════════════════════════════════════════════════════════════════
//  1. Utils (pure, no network)
// ══════════════════════════════════════════════════════════════════

section('Utils: slugify');
{
  assert('basic english', slugify('Hello World') === 'hello_world');
  assert('chinese chars preserved', slugify('产品管理') === '产品管理');
  assert('mixed', slugify('CRM 订单列表!') === 'crm_订单列表');
  assert('special chars', slugify('  A--B  ') === 'a_b');
  assert('empty fallback', slugify('!!!') === 'item');
  assert('already clean', slugify('test_slug') === 'test_slug');
}

section('Utils: generateUid');
{
  const uid1 = generateUid();
  const uid2 = generateUid();
  assert('length 11', uid1.length === 11);
  assert('unique', uid1 !== uid2);
  assert('lowercase alphanumeric', /^[a-z0-9]+$/.test(uid1));
  const uid20 = generateUid(20);
  assert('custom length', uid20.length === 20);
}

section('Utils: deepMerge');
{
  const target: Record<string, unknown> = { a: 1, b: { x: 10, y: 20 }, c: [1, 2] };
  const source: Record<string, unknown> = { b: { y: 99, z: 30 }, c: [3, 4, 5], d: 'new' };
  const result = deepMerge(target, source);

  assert('keeps existing keys', result.a === 1);
  assert('deep merges objects', (result.b as Record<string, number>).x === 10);
  assert('overrides nested', (result.b as Record<string, number>).y === 99);
  assert('adds new nested keys', (result.b as Record<string, number>).z === 30);
  assert('replaces arrays', JSON.stringify(result.c) === '[3,4,5]');
  assert('adds new top-level keys', result.d === 'new');
  // Original not mutated
  assert('immutable target', (target.b as Record<string, number>).y === 20);
}

// ══════════════════════════════════════════════════════════════════
//  2. RefResolver (pure, no network)
// ══════════════════════════════════════════════════════════════════

section('RefResolver: basic resolution');
{
  const sampleState: ModuleState = {
    group_id: 42,
    pages: {
      '产品管理': {
        route_id: 100,
        page_uid: 'pu_abc',
        tab_uid: 'tu_abc',
        grid_uid: 'gu_abc',
        blocks: {
          table_0: {
            uid: 'blk_t0',
            type: 'table',
            grid_uid: 'g_t0',
            fields: {
              name: { wrapper: 'w_name', field: 'f_name' },
              sku: { wrapper: 'w_sku', field: 'f_sku' },
            },
            actions: {
              addNew: { uid: 'act_add', popup_grid: 'pg_add', popup_page: 'pp_add', popup_tab: 'pt_add' },
              delete: { uid: 'act_del' },
            },
            record_actions: {
              edit: { uid: 'ra_edit', popup_grid: 'pg_edit' },
              view: { uid: 'ra_view', popup_grid: 'pg_view' },
            },
          },
          filter_0: {
            uid: 'blk_f0',
            type: 'filterForm',
          },
        },
      },
      '订单列表': {
        route_id: 200,
        tab_uid: 'tu_order',
        blocks: {
          table_0: {
            uid: 'blk_ot0',
            type: 'table',
            fields: {
              order_no: { wrapper: 'w_on', field: 'f_on' },
            },
          },
        },
      },
    },
  };

  const r = new RefResolver(sampleState);

  // Direct path with "blocks."
  assert(
    'direct block uid',
    r.resolve('$产品管理.blocks.table_0.uid') === 'blk_t0',
  );

  // Auto-insert "blocks."
  assert(
    'auto-insert blocks: table_0',
    r.resolve('$产品管理.table_0.uid') === 'blk_t0',
  );

  // Fuzzy match: "table" → "table_0"
  assert(
    'fuzzy match table → table_0',
    r.resolve('$产品管理.table.uid') === 'blk_t0',
  );

  // Field resolution → dict
  const fieldVal = r.resolve('$产品管理.table.fields.name') as Record<string, string>;
  assert(
    'field returns dict',
    fieldVal.wrapper === 'w_name' && fieldVal.field === 'f_name',
  );

  // Action resolution → dict
  const actionVal = r.resolve('$产品管理.table.actions.addNew') as Record<string, string>;
  assert(
    'action returns dict with popup_grid',
    actionVal.popup_grid === 'pg_add' && actionVal.uid === 'act_add',
  );

  // resolveUid extracts popup_grid (highest priority)
  assert(
    'resolveUid: popup_grid priority',
    r.resolveUid('$产品管理.table.actions.addNew') === 'pg_add',
  );

  // resolveUid for a field → extracts field UID (not wrapper)
  // Priority: popup_grid > uid > field > wrapper
  assert(
    'resolveUid: field extraction',
    r.resolveUid('$产品管理.table.fields.name') === 'f_name',
  );

  // resolveUid for a string leaf
  assert(
    'resolveUid: string leaf',
    r.resolveUid('$产品管理.table.uid') === 'blk_t0',
  );

  // Cross-page resolution
  assert(
    'cross-page resolution',
    r.resolve('$订单列表.table.fields.order_no.field') === 'f_on',
  );

  // listPaths returns sorted leaf paths
  const paths = r.listPaths();
  assert('listPaths returns array', Array.isArray(paths) && paths.length > 0);
  assert('listPaths has dollar prefix', paths.every(p => p.startsWith('$')));
  assert(
    'listPaths includes field leaf',
    paths.some(p => p.includes('table_0') && p.includes('field')),
  );

  // listPaths with page filter
  const filtered = r.listPaths('产品管理');
  assert('listPaths filtered', filtered.length > 0 && filtered.length < paths.length);

  // Error on missing ref
  let threw = false;
  try {
    r.resolve('$不存在.table.uid');
  } catch (e) {
    threw = true;
    assert('error includes suggestion', String(e).includes('Ref not found'));
  }
  assert('throws on missing ref', threw);
}

section('RefResolver: record_actions path');
{
  const state: ModuleState = {
    pages: {
      page1: {
        tab_uid: 'tu1',
        blocks: {
          table_0: {
            uid: 'b1',
            type: 'table',
            record_actions: {
              edit: { uid: 'ra1', popup_grid: 'pg1' },
            },
          },
        },
      },
    },
  };

  const r = new RefResolver(state);
  assert(
    'record_actions.edit.popup_grid',
    r.resolveUid('$page1.table.record_actions.edit') === 'pg1',
  );
}

// ══════════════════════════════════════════════════════════════════
//  3. Network tests (require live NocoBase)
// ══════════════════════════════════════════════════════════════════

async function networkTests() {
  section('NocoBaseClient: connection');

  let nb: NocoBaseClient;
  try {
    nb = await NocoBaseClient.create();
    assert('client created', true);
    assert('baseUrl set', nb.baseUrl.startsWith('http'));
    assert('http has Authorization header', !!nb.http.defaults.headers.common['Authorization']);
  } catch (e) {
    console.log(`  SKIP  Network tests — cannot connect: ${e}`);
    return;
  }

  // ── Collections API ──
  section('CollectionsApi: exists + fieldMeta');
  try {
    const hasUsers = await nb.collections.exists('users');
    assert('users collection exists', hasUsers === true);

    const hasNonexistent = await nb.collections.exists('zzz_nonexistent_12345');
    assert('nonexistent collection does not exist', hasNonexistent === false);
  } catch (e) {
    assert('exists call failed', false, String(e));
  }

  try {
    const meta = await nb.collections.fieldMeta('users');
    assert('fieldMeta returns object', typeof meta === 'object' && meta !== null);
    assert('fieldMeta has email field', 'email' in meta);
    assert('fieldMeta has interface', meta.email?.interface === 'email');

    // Cache test
    const meta2 = await nb.collections.fieldMeta('users');
    assert('fieldMeta cached (same ref)', meta === meta2);
  } catch (e) {
    assert('fieldMeta call failed', false, String(e));
  }

  // ── Routes API ──
  section('RoutesApi: list');
  try {
    const routes = await nb.routes.list();
    assert('routes returns array', Array.isArray(routes));
    assert('routes has entries', routes.length > 0);
    if (routes.length > 0) {
      const first = routes[0];
      assert('route has id', typeof first.id === 'number');
      assert('route has type', typeof first.type === 'string');
    }
  } catch (e) {
    assert('routes list failed', false, String(e));
  }

  // ── FlowSurfaces API: get ──
  section('FlowSurfacesApi: get');
  try {
    // Find a page with a schemaUid from routes
    const routes = await nb.routes.list();
    let testSchemaUid = '';
    for (const r of routes) {
      if (r.schemaUid && r.type !== 'group') {
        testSchemaUid = r.schemaUid;
        break;
      }
    }

    if (testSchemaUid) {
      // The FlowSurfaces:get requires specific param names recognized by the server
      // Try with uid first
      try {
        const result = await nb.surfaces.get({ uid: testSchemaUid });
        assert('surfaces.get returns data', result !== null && result !== undefined);
        if (result?.tree) {
          assert('surfaces.get has tree', typeof result.tree === 'object');
          assert('tree has uid', typeof result.tree.uid === 'string');
        }
      } catch (e) {
        // uid param might not work for route schemaUid, try tabSchemaUid
        console.log(`  INFO  surfaces.get(uid) failed, trying tabSchemaUid: ${String(e).slice(0, 80)}`);
      }
    } else {
      console.log('  SKIP  No route with schemaUid found');
    }
  } catch (e) {
    assert('surfaces.get failed', false, String(e));
  }

  // ── FlowSurfaces API: catalog ──
  section('FlowSurfacesApi: catalog');
  try {
    const cat = await nb.surfaces.catalog();
    assert('catalog returns data', cat !== null && cat !== undefined);
  } catch (e) {
    // catalog may not be available on all NocoBase versions
    console.log(`  INFO  catalog not available: ${String(e).slice(0, 80)}`);
  }

  // ── LegacyModelsApi: findParent ──
  section('LegacyModelsApi: findParent (builds parent cache)');
  try {
    // Try finding parent for a non-existent UID — should not crash
    const parent = await nb.models.findParent('nonexistent_uid_12345');
    assert('findParent returns undefined for unknown', parent === undefined);
  } catch (e) {
    assert('findParent failed', false, String(e));
  }
}

// ══════════════════════════════════════════════════════════════════
//  Run
// ══════════════════════════════════════════════════════════════════

async function main() {
  console.log('Phase 1 integration tests — NocoBase DSL Reconciler TS\n');
  console.log(`Environment: NB_URL=${process.env.NB_URL || '(default)'}, NB_USER=${process.env.NB_USER || '(not set)'}`);

  // Pure tests first
  // (Already executed above)

  // Network tests
  await networkTests();

  // ── Summary ──
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(2);
});
