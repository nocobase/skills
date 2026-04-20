/**
 * Find + delete flowModel nodes not reachable from any desktopRoute.
 *
 * Problem: push failures / manual NB cleanup / rolled-back deploys leave
 * subtrees orphaned — the route that pointed at them is gone but the
 * flowModels linger. They don't render anywhere but they:
 *   - confuse `flowModelTemplates:list` usageCount accounting
 *   - bloat `flowModels:list` responses
 *   - can collide on name/uid with new templates deployed later
 *
 * Algorithm:
 *   1. Collect every schemaUid + tabSchemaName from desktopRoutes (roots)
 *   2. BFS over flowModels following parentId → child relationships,
 *      marking everything reachable from a root
 *   3. Anything unmarked is an orphan
 *   4. Also mark all flowModelTemplates' targetUid trees as roots
 *      (templates are legitimately "hanging" until used)
 *
 * Best-effort: failures in one step don't stop the rest. Returns counts.
 */
import type { NocoBaseClient } from '../client';

type LogFn = (msg: string) => void;

export interface OrphanCleanResult {
  totalModels: number;
  rootCount: number;
  reachable: number;
  orphans: number;
  deleted: number;
}

export async function cleanOrphanModels(
  nb: NocoBaseClient,
  opts: { dryRun?: boolean } = {},
  log: LogFn = console.log,
): Promise<OrphanCleanResult> {
  // 1. All roots from routes
  const roots = new Set<string>();
  try {
    const r = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: false } });
    for (const row of (r.data?.data || []) as Record<string, unknown>[]) {
      const schemaUid = row.schemaUid as string | undefined;
      const tabSchemaName = row.tabSchemaName as string | undefined;
      if (schemaUid) roots.add(schemaUid);
      if (tabSchemaName) roots.add(tabSchemaName);
    }
  } catch (e) {
    log(`  ! orphan scan: routes read failed: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
  }

  // 2. All template targets are also roots (templates render when used)
  try {
    const r = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { paginate: false } });
    for (const t of (r.data?.data || []) as Record<string, unknown>[]) {
      const tgt = t.targetUid as string | undefined;
      if (tgt) roots.add(tgt);
    }
  } catch { /* skip */ }

  // 3. All flowModels (all pages)
  const allModels: Record<string, unknown>[] = [];
  for (let p = 1; p <= 20; p++) {
    try {
      const r = await nb.http.get(`${nb.baseUrl}/api/flowModels:list`, { params: { pageSize: 1000, page: p } });
      const chunk = (r.data?.data || []) as Record<string, unknown>[];
      allModels.push(...chunk);
      if (chunk.length < 1000) break;
    } catch (e) {
      log(`  ! orphan scan: flowModels:list page ${p} failed`);
      break;
    }
  }

  // 4. BFS: mark everything reachable from roots via parentId chains
  // Build parent→children index
  const byUid = new Map<string, Record<string, unknown>>();
  const childrenOf = new Map<string, string[]>();
  for (const m of allModels) {
    const uid = m.uid as string;
    const pid = m.parentId as string | undefined;
    byUid.set(uid, m);
    if (pid) {
      const list = childrenOf.get(pid) || [];
      list.push(uid);
      childrenOf.set(pid, list);
    }
  }

  const reachable = new Set<string>();
  const queue = [...roots].filter(r => byUid.has(r));
  while (queue.length) {
    const uid = queue.shift()!;
    if (reachable.has(uid)) continue;
    reachable.add(uid);
    const kids = childrenOf.get(uid) || [];
    for (const k of kids) queue.push(k);
  }

  // 5. Also protect nodes whose ROOT ancestor is a root — traverse parentId
  // up to the top. Covers models where the chain breaks on a root whose
  // desktopRoutes lookup failed.
  for (const m of allModels) {
    const uid = m.uid as string;
    if (reachable.has(uid)) continue;
    let cur: string | undefined = uid;
    const chain: string[] = [];
    while (cur && !reachable.has(cur) && chain.length < 50) {
      chain.push(cur);
      const node = byUid.get(cur);
      cur = node?.parentId as string | undefined;
    }
    if (cur && reachable.has(cur)) {
      for (const c of chain) reachable.add(c);
    }
  }

  const orphans: string[] = [];
  for (const m of allModels) {
    const uid = m.uid as string;
    if (!reachable.has(uid)) orphans.push(uid);
  }

  // Breakdown by `use` — orphans are often all the same model class (e.g.
  // ChildPageModel after repeated failed popup creates)
  const useCounts = new Map<string, number>();
  for (const uid of orphans) {
    const u = (byUid.get(uid)?.use as string) || '?';
    useCounts.set(u, (useCounts.get(u) || 0) + 1);
  }
  const topUses = [...useCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  log(`  orphan types: ${topUses.map(([u, c]) => `${u}:${c}`).join(', ')}`);

  let deleted = 0;
  if (!opts.dryRun && orphans.length) {
    const BATCH = 20;
    for (let i = 0; i < orphans.length; i += BATCH) {
      const chunk = orphans.slice(i, i + BATCH);
      await Promise.all(chunk.map(async uid => {
        try {
          await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: uid } });
          deleted++;
        } catch { /* skip — cascade or already-gone */ }
      }));
      if ((i + BATCH) % 400 === 0) log(`    ... ${deleted}/${orphans.length} deleted`);
    }
  }

  const result: OrphanCleanResult = {
    totalModels: allModels.length,
    rootCount: roots.size,
    reachable: reachable.size,
    orphans: orphans.length,
    deleted,
  };
  const verb = opts.dryRun ? 'would delete' : 'deleted';
  log(`  orphans: ${allModels.length} total, ${roots.size} roots, ${reachable.size} reachable, ${orphans.length} orphan — ${verb} ${deleted}`);
  return result;
}
