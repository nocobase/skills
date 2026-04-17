/**
 * Error handling utilities.
 *
 * bestEffort() wraps operations that are allowed to fail silently.
 * Set NB_DEBUG=1 to surface all suppressed errors during development.
 */

type LogFn = (msg: string) => void;

/**
 * Run an async operation that is allowed to fail.
 * In NB_DEBUG mode, failures are logged for debugging.
 */
export async function bestEffort(
  label: string,
  fn: () => Promise<void>,
  log?: LogFn,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (process.env.NB_DEBUG) {
      const msg = e instanceof Error ? e.message : String(e);
      (log ?? console.debug)(`  [debug] ${label}: ${msg}`);
    }
  }
}

/**
 * Synchronous version of bestEffort.
 */
export function bestEffortSync(
  label: string,
  fn: () => void,
  log?: LogFn,
): void {
  try {
    fn();
  } catch (e) {
    if (process.env.NB_DEBUG) {
      const msg = e instanceof Error ? e.message : String(e);
      (log ?? console.debug)(`  [debug] ${label}: ${msg}`);
    }
  }
}
