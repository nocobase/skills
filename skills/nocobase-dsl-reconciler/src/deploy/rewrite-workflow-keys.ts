/**
 * Recursively rewrite `workflowKey:` string values in a DSL tree using a
 * source-key → live-key map (built by workflow-deployer after workflow deploy).
 *
 * Mutates objects in place to avoid re-cloning the entire page graph. Safe on
 * arrays / nested objects / non-object leaves.
 */

export type WorkflowKeyMap = Map<string, string>;

export function rewriteWorkflowKeys(node: unknown, keyMap: WorkflowKeyMap): number {
  if (!keyMap.size) return 0;
  let count = 0;

  function walk(n: unknown): void {
    if (Array.isArray(n)) {
      for (const item of n) walk(item);
      return;
    }
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'workflowKey' && typeof v === 'string' && keyMap.has(v)) {
        obj[k] = keyMap.get(v)!;
        count++;
        continue;
      }
      walk(v);
    }
  }

  walk(node);
  return count;
}
