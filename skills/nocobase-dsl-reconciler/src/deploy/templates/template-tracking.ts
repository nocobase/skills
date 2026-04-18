/**
 * Per-deploy-run template creation tracking + bulk delete.
 *
 * Every templateUid created during a push gets registered here so:
 *   1. `cli rollback` can undo a bad deploy (reads the list via state.yaml)
 *   2. Orphan detection can distinguish "created this run" from "stale"
 *
 * The underlying Set is module-scoped (one per process), reset by
 * cache-manager.resetAllCaches() at the start of every deployProject
 * invocation. Callers never touch the Set directly — only the exported
 * functions.
 */
import type { NocoBaseClient } from '../../client';

const _createdThisRun = new Set<string>();

export function resetTemplateCreationTracking(): void { _createdThisRun.clear(); }
export function trackCreatedTemplate(uid: string): void { if (uid) _createdThisRun.add(uid); }
export function listCreatedThisRun(): string[] { return Array.from(_createdThisRun); }

/** Delete the given template UIDs from NocoBase. Used by `rollback` CLI. */
export async function deleteTemplatesByUid(
  nb: NocoBaseClient,
  uids: string[],
  log: (msg: string) => void,
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0, failed = 0;
  for (const uid of uids) {
    try {
      await nb.http.post(`${nb.baseUrl}/api/flowModelTemplates:destroy`, {}, { params: { filterByTk: uid } });
      deleted++;
    } catch { failed++; }
  }
  log(`  rollback: deleted ${deleted} templates, ${failed} failed`);
  return { deleted, failed };
}
