/**
 * Route-level lifecycle operations: duplicate cleanup, menu reordering,
 * routes.yaml sync, tab enablement.
 *
 * Extracted from project-deployer as pure helpers — each runs against
 * live NB state + DSL spec to bring them into agreement. None of them
 * touch block-level flowModels (that's block-filler territory).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { ModuleState } from '../types/state';
import { loadYaml, dumpYaml } from '../utils/yaml';
import { catchSwallow } from '../utils/swallow';
import { routeKey, type RouteEntry } from './page-discovery';

/**
 * Remove duplicate pages (same title) within a group — keep the latest (highest id).
 */
export async function cleanupDuplicatePages(
  nb: NocoBaseClient,
  groupId: number,
  groupTitle: string,
  pageTitle: string,
  log: (msg: string) => void,
): Promise<void> {
  try {
    const liveRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
    const allGroups = (liveRoutes.data.data || []) as Record<string, unknown>[];
    const liveGroup = allGroups.find(r => r.id === groupId || (r.type === 'group' && r.title === groupTitle));
    if (!liveGroup?.children) return;
    const duplicates = (liveGroup.children as Record<string, unknown>[]).filter(
      c => c.title === pageTitle && c.type !== 'tabs' && c.type !== 'group',
    );
    if (duplicates.length <= 1) return;
    duplicates.sort((a, b) => ((b.id as number) || 0) - ((a.id as number) || 0));
    for (let i = 1; i < duplicates.length; i++) {
      const dup = duplicates[i];
      try {
        await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:destroy`, null, {
          params: { 'filter[id]': dup.id },
        });
        log(`  - removed duplicate page: ${pageTitle} (id=${dup.id})`);
      } catch (e) {
        log(`  ! cleanup duplicate ${pageTitle}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }
  } catch (e) {
    log(`  ! duplicate cleanup: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

/**
 * Set sort on deployed routes to match routes.yaml declaration order.
 */
export async function syncMenuOrder(
  nb: NocoBaseClient,
  state: ModuleState,
  routes: RouteEntry[],
  log: (msg: string) => void,
): Promise<void> {
  try {
    const groupEntries = routes.filter(r => r.type === 'group');
    if (!groupEntries.length) return;

    const allRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
    const liveGroups = ((allRoutes.data.data || []) as Record<string, unknown>[]).filter(r => r.type === 'group');
    let changed = 0;

    const syncRoute = async (spec: RouteEntry, live: Record<string, unknown>, sortIdx: number) => {
      const patch: Record<string, unknown> = {};
      if (live.sort !== sortIdx) patch.sort = sortIdx;
      if (spec.icon && live.icon !== spec.icon) patch.icon = spec.icon;
      if (spec.hidden !== undefined && live.hidden !== spec.hidden) patch.hidden = spec.hidden;
      if (Object.keys(patch).length) {
        await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, patch, { params: { 'filter[id]': live.id } });
        changed++;
      }
    };

    for (const groupEntry of groupEntries) {
      if (!groupEntry.children?.length) continue;

      // Prefer matching by state.group_ids[key] (stable across title changes), fall back to title.
      const gKey = routeKey(groupEntry);
      const stateGroupId = state.group_ids?.[gKey];
      let liveGroup = stateGroupId ? liveGroups.find(g => g.id === stateGroupId) : undefined;
      if (!liveGroup) liveGroup = liveGroups.find(g => g.title === groupEntry.title);
      const liveChildrenMaybe = liveGroup?.children as Record<string, unknown>[] | undefined;
      if (!liveChildrenMaybe?.length) continue;

      const liveChildren = liveChildrenMaybe;
      for (let i = 0; i < groupEntry.children.length; i++) {
        const specChild = groupEntry.children[i];
        const liveChild = liveChildren.find(c => c.title === specChild.title);
        if (!liveChild) continue;
        await syncRoute(specChild, liveChild, i + 1);
        // Sub-group children
        const liveChildChildren = liveChild.children as Record<string, unknown>[] | undefined;
        if (specChild.type === 'group' && specChild.children?.length && liveChildChildren?.length) {
          for (let j = 0; j < specChild.children.length; j++) {
            const specSub = specChild.children[j];
            const liveSub = liveChildChildren.find(c => c.title === specSub.title);
            if (liveSub) await syncRoute(specSub, liveSub, j + 1);
          }
        }
      }
    }
    if (changed) log(`  menu: ${changed} routes reordered`);
  } catch (e) {
    log(`  ! menu order: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

/**
 * Re-sync the deployed group's children/icons back into routes.yaml so the
 * file stays in step with what's actually live. Identity is matched by `key`
 * (= route.key || slugify(title)), so titles can change freely without
 * losing the entry.
 */
export async function syncRoutesYaml(
  nb: NocoBaseClient,
  root: string,
  routeEntry: RouteEntry,
  log: (msg: string) => void,
): Promise<void> {
  try {
    nb.routes.clearCache();
    const liveRoutes = await nb.routes.list();

    // Match live group by stored title (DSL is source of truth for naming).
    const liveGroup = liveRoutes.find(r => r.type === 'group' && r.title === routeEntry.title);
    if (!liveGroup) { log(`\n  routes.yaml sync: group "${routeEntry.title}" not found in live`); return; }

    // Build updated entry from live state. Preserve declared key so identity
    // is stable regardless of how the title changes later.
    const buildEntry = (r: Record<string, unknown>, declaredKey: string | undefined, declaredTitle?: string): Record<string, unknown> => {
      const entry: Record<string, unknown> = {};
      if (declaredKey) entry.key = declaredKey;
      entry.title = declaredTitle ?? r.title;
      if (r.type === 'group') entry.type = 'group';
      if (r.icon) entry.icon = r.icon;
      const seenChildren = new Set<string>();
      const children = ((r.children || []) as Record<string, unknown>[])
        .filter(c => c.type !== 'tabs')
        .filter(c => {
          const t = (c.title as string) || '';
          if (seenChildren.has(t)) return false;
          seenChildren.add(t);
          return true;
        })
        .map(c => {
          const ce: Record<string, unknown> = { title: c.title };
          if (c.type === 'group') ce.type = 'group';
          if (c.icon) ce.icon = c.icon;
          const seenSub = new Set<string>();
          const sub = ((c.children || []) as Record<string, unknown>[])
            .filter(s => s.type !== 'tabs')
            .filter(s => {
              const t = (s.title as string) || '';
              if (seenSub.has(t)) return false;
              seenSub.add(t);
              return true;
            })
            .map(s => {
              const se: Record<string, unknown> = { title: s.title };
              if (s.type === 'group') se.type = 'group';
              if (s.icon) se.icon = s.icon;
              return se;
            });
          if (sub.length) ce.children = sub;
          return ce;
        });
      if (children.length) entry.children = children;
      return entry;
    };

    // Read existing routes.yaml, update only the matching group entry by key.
    const routesFile = path.join(root, 'routes.yaml');
    let existing: Record<string, unknown>[] = [];
    try { existing = loadYaml<Record<string, unknown>[]>(routesFile) || []; } catch (e) { catchSwallow(e, 'routes.yaml missing on first push — start with empty list'); }

    const ourKey = routeKey(routeEntry);
    const updatedEntry = buildEntry(liveGroup as unknown as Record<string, unknown>, routeEntry.key, routeEntry.title);
    const idx = existing.findIndex(e => {
      const er = e as { key?: string; title?: string; type?: string };
      return routeKey({ key: er.key, title: er.title || '' }) === ourKey && er.type === 'group';
    });
    if (idx >= 0) {
      existing[idx] = updatedEntry;
    } else {
      existing.push(updatedEntry);
    }

    fs.writeFileSync(routesFile, dumpYaml(existing));
    log('\n  routes.yaml synced');
  } catch (e) {
    log(`\n  ! routes sync: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

/**
 * Enable multi-tab mode on a page: update both the route and the RootPageModel.
 */
export async function enablePageTabs(
  nb: NocoBaseClient,
  routeId: number,
  pageUid: string,
  log: (msg: string) => void,
): Promise<void> {
  try {
    // 1. Route
    await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`,
      { enableTabs: true },
      { params: { 'filter[id]': routeId } },
    );
    // 2. RootPageModel — both props AND stepParams.pageSettings.general
    if (pageUid) {
      const fmResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, {
        params: { filterByTk: pageUid },
      });
      const fm = fmResp.data?.data || {};
      // props.enableTabs
      await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
        uid: pageUid,
        props: { ...(fm.props || {}), enableTabs: true },
      });
      // stepParams.pageSettings.general.enableTabs
      const ps = fm.stepParams?.pageSettings?.general || {};
      if (!ps.enableTabs) {
        await nb.updateModel(pageUid, {
          pageSettings: { general: { ...ps, enableTabs: true } },
        });
      }
    }
  } catch (e) {
    log(`    ! enableTabs: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}
