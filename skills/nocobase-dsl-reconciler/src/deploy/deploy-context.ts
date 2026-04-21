/**
 * Per-run deployment context — created once, threaded through all deploy functions.
 *
 * Add new modes/flags here instead of changing function signatures.
 */
import type { NocoBaseClient } from '../client';

export type LogFn = (msg: string) => void;

export interface DeployContext {
  nb: NocoBaseClient;
  log: LogFn;
  force: boolean;
}

/** Create context from CLI opts. */
export function createDeployContext(
  nb: NocoBaseClient,
  opts: { force?: boolean } = {},
  log: LogFn = console.log,
): DeployContext {
  return { nb, log, force: opts.force ?? false };
}
