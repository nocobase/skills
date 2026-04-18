/**
 * Workspace root detection + path resolution for CLI commands.
 *
 * Every project the CLI touches must live under WORKSPACE_ROOT. Relative
 * dir args (e.g. `cli push crm`) are resolved against it; absolute args
 * are verified to be inside. Paths that escape the root are rejected so
 * the CLI can't accidentally touch the tool source or unrelated trees.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKSPACE_ROOT = path.resolve(
  process.env.NB_WORKSPACE_ROOT || path.join(__dirname, '..', '..', 'workspaces'),
);

/**
 * Resolve a project-dir argument. Relative paths attach to WORKSPACE_ROOT.
 * Absolute paths must already be inside WORKSPACE_ROOT.
 * Throws if the resolved path escapes the root.
 */
export function resolveWorkspacePath(arg: string): string {
  const abs = path.isAbsolute(arg) ? path.resolve(arg) : path.resolve(WORKSPACE_ROOT, arg);
  const rel = path.relative(WORKSPACE_ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Path "${arg}" is outside workspace root.\n`
      + `  Workspace: ${WORKSPACE_ROOT}\n`
      + `  Resolved:  ${abs}\n`
      + `Set NB_WORKSPACE_ROOT to override, or pass a path inside the workspace.`,
    );
  }
  return abs;
}
