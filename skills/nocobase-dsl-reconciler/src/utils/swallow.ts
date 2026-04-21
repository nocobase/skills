/**
 * Explicit best-effort error swallowing with a debug hook.
 *
 * Replaces 100+ ad-hoc `catch { /* skip *​/ }` scattered across the codebase.
 * Every swallowed error MUST declare a reason — the string doubles as:
 *   1. Documentation for the next reader ("why is this OK to ignore?")
 *   2. Debug-mode visibility: when NB_DEBUG=1, the reason + error is
 *      logged so a failed push is traceable
 *
 * Before: `} catch { /* skip *​/ }` — silent, reason unknown, bugs hidden.
 * After:  `catchSwallow(e, 'routes.yaml may not exist on first push')`
 *
 * Use sparingly; most catches should do something with the error (log +
 * continue, rollback, retry, rethrow). Reserve this helper for genuinely
 * optional operations where a failure is known-safe.
 */

/**
 * Log the swallowed error when NB_DEBUG is set; otherwise silent.
 * Pass the caught error and a short reason.
 */
export function catchSwallow(err: unknown, reason: string): void {
  if (!process.env.NB_DEBUG) return;
  const msg = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.debug(`[swallow] ${reason}: ${msg.slice(0, 120)}`);
}

/**
 * Wrap a sync or async function; swallow its error with a reason.
 * Returns undefined on failure, the result on success.
 */
export async function trySwallow<T>(
  fn: () => T | Promise<T>,
  reason: string,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    catchSwallow(e, reason);
    return undefined;
  }
}
