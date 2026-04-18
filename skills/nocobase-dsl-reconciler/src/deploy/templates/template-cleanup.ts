/**
 * Drop flowModelTemplateUsages rows whose modelUid no longer exists.
 *
 * NocoBase bug: when a flowModel is destroyed, its usage records in
 * flowModelTemplateUsages are NOT cascade-deleted. Those rows keep the
 * template's usageCount artificially elevated, blocking later destroy
 * attempts with "Template is in use". This routine walks the usages
 * table and removes records pointing at dead flowModels.
 *
 * Runs on every deploy (cheap — typically <100 stale rows per cycle).
 */
import type { NocoBaseClient } from '../../client';
import { catchSwallow } from '../../utils/swallow';

export async function cleanStaleTemplateUsages(
  nb: NocoBaseClient,
  log: (msg: string) => void,
): Promise<{ cleaned: number; usageRecords: number }> {
  try {
    // Page through all usages
    const usages: Record<string, unknown>[] = [];
    for (let p = 1; p <= 10; p++) {
      const r = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, { params: { pageSize: 1000, page: p } });
      const d = (r.data.data || []) as Record<string, unknown>[];
      usages.push(...d);
      if (d.length < 1000) break;
    }
    if (!usages.length) return { cleaned: 0, usageRecords: 0 };

    // Collect live flowModel UIDs in one pass (only what's referenced)
    const referencedUids = new Set(usages.map(u => u.modelUid as string));
    const liveUids = new Set<string>();
    // Ask NocoBase for each chunk — but since we don't have batch-by-uid,
    // we just fetch all model uids which is manageable (~few thousand after cleanup)
    for (let p = 1; p <= 10; p++) {
      const r = await nb.http.get(`${nb.baseUrl}/api/flowModels:list`, { params: { pageSize: 5000, page: p, fields: 'uid' } });
      const d = (r.data.data || []) as Record<string, unknown>[];
      for (const n of d) if (referencedUids.has(n.uid as string)) liveUids.add(n.uid as string);
      if (d.length < 5000) break;
    }

    const stale = usages.filter(u => !liveUids.has(u.modelUid as string));
    let cleaned = 0;
    for (const u of stale) {
      try {
        await nb.http.post(`${nb.baseUrl}/api/flowModelTemplateUsages:destroy`, {}, { params: { filterByTk: u.uid as string } });
        cleaned++;
      } catch (e) { catchSwallow(e, 'usage row destroy — keep counting'); }
    }
    if (cleaned) log(`  cleanup: removed ${cleaned} stale template usage records (NocoBase cascade bug)`);
    return { cleaned, usageRecords: usages.length };
  } catch (e) {
    log(`  ! cleanup usages: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    return { cleaned: 0, usageRecords: 0 };
  }
}
