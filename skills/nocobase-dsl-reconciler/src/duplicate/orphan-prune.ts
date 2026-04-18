/**
 * Transitive-closure prune of orphan collection YAML files.
 *
 * When duplicate-project scopes the copy (--include-group / --skip-group),
 * some collections in the source are only referenced by pages that got
 * dropped. Those unused `collections/X.yaml` files would otherwise ship
 * to the Copy and push would create empty tables.
 *
 * Algorithm:
 *   Phase 1 — seed: walk every YAML under pages/ + workflows/ and
 *             collect every value of `coll:` / `target:` / `collection:`,
 *             plus the prefix of `associationName: <coll>.<field>`.
 *   Phase 2 — transitive closure: collections can refer to each other
 *             via m2o/o2m `target`. Visit each kept collection's YAML and
 *             grow the referenced set until stable. Without this pass,
 *             deleting B (referenced only via A's m2o) leaves A's push
 *             failing with "collection B not found".
 *   Phase 3 — delete every collection YAML whose name didn't land in the
 *             final referenced set.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadYaml } from '../utils/yaml';
import { catchSwallow } from '../utils/swallow';

type WalkFn = (dir: string, fn: (file: string) => void) => void;

export function pruneOrphanCollections(
  dst: string,
  walkDir: WalkFn,
  log: (msg: string) => void,
): void {
  const collDir = path.join(dst, 'collections');
  if (!fs.existsSync(collDir)) return;

  // Phase 1: seed referenced from kept pages + workflows
  const referenced = new Set<string>();
  function visit(node: unknown): void {
    if (Array.isArray(node)) { for (const n of node) visit(n); return; }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === 'string' && (k === 'coll' || k === 'target' || k === 'collection')) {
        referenced.add(v);
      } else if (typeof v === 'string' && k === 'associationName' && v.includes('.')) {
        referenced.add(v.split('.')[0]);
      } else {
        visit(v);
      }
    }
  }
  for (const dir of ['pages', 'workflows']) {
    const root = path.join(dst, dir);
    if (!fs.existsSync(root)) continue;
    walkDir(root, (f) => {
      if (!(f.endsWith('.yaml') || f.endsWith('.yml'))) return;
      try { visit(loadYaml<unknown>(f)); } catch (e) { catchSwallow(e, 'orphan-prune: bad YAML in pages/workflows — skip, others still scanned'); }
    });
  }

  // Phase 2: transitive closure — collection A may reference collection B via
  // m2o/o2m target. Without this, pruning A's target B would break A on push
  // (e.g. customers.contacts o2m → contacts; contacts pruned → 500 on
  // customers field create). Iterate until the set stabilises.
  const collFiles = fs.readdirSync(collDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.yaml'))
    .map(e => ({ name: e.name.replace(/\.yaml$/, ''), path: path.join(collDir, e.name) }));
  let grew = true;
  while (grew) {
    grew = false;
    for (const cf of collFiles) {
      if (!referenced.has(cf.name)) continue;
      try {
        const before = referenced.size;
        visit(loadYaml<unknown>(cf.path));
        if (referenced.size > before) grew = true;
      } catch (e) { catchSwallow(e, 'orphan-prune transitive: bad collection YAML — skip, loop continues'); }
    }
  }

  let dropped = 0;
  for (const cf of collFiles) {
    if (!referenced.has(cf.name)) {
      fs.unlinkSync(cf.path);
      dropped++;
    }
  }
  if (dropped) log(`  - pruned ${dropped} orphan collection file(s) (no kept page references)`);
}
