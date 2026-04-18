/**
 * Pre-deploy state ↔ NocoBase reconciliation.
 *
 * Problem: state.yaml records UIDs (blocks, fields, JS items, template IDs)
 * from the last successful push. If NocoBase is reset / rolled back / the
 * target workspace's objects get wiped via API, those UIDs now point at
 * nothing. The deployer then calls `nb.updateModel(zombieUid, ...)` and
 * (before the client-level null-return fix) crashed the whole push with an
 * unhandled rejection.
 *
 * Solution: at the start of every push, batch-verify every UID in state.yaml
 * against live NB. Drop entries whose UIDs are missing so the deployer
 * treats them as "needs create" rather than "needs update of a ghost".
 *
 * Best-effort: failures in the check simply leave state unchanged (the
 * updateModel null-return serves as safety net).
 */
import type { NocoBaseClient } from '../client';
import type { ModuleState, PageState, BlockState } from '../types/state';

type LogFn = (msg: string) => void;

/**
 * Walk state.yaml and collect every referenced flowModel UID. Keys are
 * path tags so we can remove them later (e.g. `page:leads/block:filterForm/field:name`).
 */
function collectStateUids(state: ModuleState): Map<string, string> {
  const out = new Map<string, string>();
  const pages = (state.pages || {}) as Record<string, PageState>;
  for (const [pageKey, pageState] of Object.entries(pages)) {
    if (pageState.tab_uid) out.set(`page:${pageKey}:tab_uid`, pageState.tab_uid);
    const blocks = (pageState.blocks || {}) as Record<string, BlockState>;
    for (const [blockKey, bs] of Object.entries(blocks)) {
      if (bs.uid) out.set(`page:${pageKey}/block:${blockKey}:uid`, bs.uid);
      if (bs.grid_uid) out.set(`page:${pageKey}/block:${blockKey}:grid_uid`, bs.grid_uid);
      const fields = (bs.fields || {}) as Record<string, { wrapper?: string; field?: string }>;
      for (const [fp, fs] of Object.entries(fields)) {
        if (fs.wrapper) out.set(`page:${pageKey}/block:${blockKey}/field:${fp}:wrapper`, fs.wrapper);
        if (fs.field) out.set(`page:${pageKey}/block:${blockKey}/field:${fp}:field`, fs.field);
      }
      const jsItems = (bs.js_items || {}) as Record<string, { uid: string }>;
      for (const [jsKey, jsInfo] of Object.entries(jsItems)) {
        if (jsInfo.uid) out.set(`page:${pageKey}/block:${blockKey}/js_item:${jsKey}`, jsInfo.uid);
      }
    }
  }
  return out;
}

/** Remove a tagged UID reference from state. No-op when path doesn't resolve. */
function dropStateRef(state: ModuleState, tag: string): void {
  const parts = tag.split('/');
  // Parse: page:<pageKey>[/block:<blockKey>[/field:<fp>:<wrapper|field>|/js_item:<jsKey>]]
  // or: page:<pageKey>:tab_uid / block:<blockKey>:<uid|grid_uid>
  const pageMatch = parts[0].match(/^page:(.+?)(?::(.+))?$/);
  if (!pageMatch) return;
  const pageKey = pageMatch[1];
  const pageField = pageMatch[2];
  const pages = state.pages as Record<string, PageState> | undefined;
  const page = pages?.[pageKey];
  if (!page) return;

  if (parts.length === 1 && pageField) {
    delete (page as unknown as Record<string, unknown>)[pageField];
    return;
  }

  const blockMatch = parts[1]?.match(/^block:(.+?)(?::(.+))?$/);
  if (!blockMatch) return;
  const blockKey = blockMatch[1];
  const blockField = blockMatch[2];
  const blocks = page.blocks as Record<string, BlockState> | undefined;
  const block = blocks?.[blockKey];
  if (!block) return;

  if (parts.length === 2 && blockField) {
    delete (block as unknown as Record<string, unknown>)[blockField];
    return;
  }

  if (parts[2]?.startsWith('field:')) {
    const fieldMatch = parts[2].match(/^field:(.+?):(wrapper|field)$/);
    if (!fieldMatch) return;
    const [, fp, which] = fieldMatch;
    const fields = block.fields as Record<string, { wrapper?: string; field?: string }> | undefined;
    if (fields?.[fp]) {
      delete fields[fp][which as 'wrapper' | 'field'];
      // Drop empty field entry
      if (!Object.values(fields[fp]).some(Boolean)) delete fields[fp];
    }
    return;
  }

  if (parts[2]?.startsWith('js_item:')) {
    const jsMatch = parts[2].match(/^js_item:(.+)$/);
    if (!jsMatch) return;
    const [, jsKey] = jsMatch;
    const jsItems = block.js_items as Record<string, unknown> | undefined;
    if (jsItems?.[jsKey]) delete jsItems[jsKey];
    return;
  }
}

/**
 * Check every UID in state.yaml against live NB, remove entries whose UID is
 * gone. Returns the number of entries dropped.
 *
 * Batched via concurrent GETs with a low ceiling (live NB survives ~20 in
 * flight). No error is fatal — a failing check keeps the state entry as-is
 * and the downstream updateModel null-return handles it.
 */
export async function reconcileStateWithLive(
  nb: NocoBaseClient,
  state: ModuleState,
  log: LogFn = console.log,
): Promise<{ checked: number; dropped: number }> {
  const refs = collectStateUids(state);
  if (!refs.size) return { checked: 0, dropped: 0 };

  const entries = [...refs.entries()];
  const dead: string[] = [];
  const BATCH = 20;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    await Promise.all(chunk.map(async ([tag, uid]) => {
      try {
        const resp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: uid } });
        if (!resp.data?.data) dead.push(tag);
      } catch {
        // Non-404 errors (network, auth) — keep the entry and let downstream handle
      }
    }));
  }

  for (const tag of dead) dropStateRef(state, tag);

  if (dead.length) {
    log(`  state reconcile: dropped ${dead.length}/${refs.size} zombie UID(s) (not in live NB)`);
  }

  // Also validate route_ids / group_ids (integer primary keys from
  // desktopRoutes, NOT flowModel UIDs). When my orphan cleaner deletes
  // a route's schema flowModel, NB cascades the route row itself too —
  // so state.yaml's numeric route_id/group_ids go stale the same way
  // UIDs do. The symptom is "flowSurfaces menu parent route 'N' not
  // found" on the next push's createMenu call.
  let routesDropped = 0;
  try {
    const r = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false' } });
    const liveIds = new Set<number>(((r.data?.data || []) as Record<string, unknown>[]).map(x => x.id as number));

    // Top-level group_id
    const topGroupId = (state as Record<string, unknown>).group_id as number | undefined;
    if (topGroupId && !liveIds.has(topGroupId)) {
      delete (state as Record<string, unknown>).group_id;
      routesDropped++;
    }
    // group_ids map
    const groupIds = (state as Record<string, unknown>).group_ids as Record<string, number> | undefined;
    if (groupIds) {
      for (const k of Object.keys(groupIds)) {
        if (groupIds[k] && !liveIds.has(groupIds[k])) {
          delete groupIds[k];
          routesDropped++;
        }
      }
    }
    // _subgroup_* scattered top-level keys
    for (const k of Object.keys(state as Record<string, unknown>)) {
      if (!k.startsWith('_subgroup_')) continue;
      const v = (state as Record<string, unknown>)[k];
      if (typeof v === 'number' && !liveIds.has(v)) {
        delete (state as Record<string, unknown>)[k];
        routesDropped++;
      }
    }
    // Per-page route_id
    const pages = (state.pages || {}) as Record<string, Record<string, unknown>>;
    for (const [, ps] of Object.entries(pages)) {
      const rid = ps.route_id as number | undefined;
      if (rid && !liveIds.has(rid)) {
        delete ps.route_id;
        routesDropped++;
      }
    }
    if (routesDropped) log(`  state reconcile: dropped ${routesDropped} zombie route_id(s) (routes no longer in NB)`);
  } catch (e) {
    // Non-fatal; next push's createMenu will re-error visibly with our new catch
  }

  return { checked: refs.size, dropped: dead.length + routesDropped };
}
