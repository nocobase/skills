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
 *             final referenced set. Also drop defaults.yaml popups/forms
 *             map entries keyed on pruned collections — otherwise the
 *             spec-validator reports them as "never inlined" false
 *             positives on push.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadYaml, dumpYaml } from '../utils/yaml';
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

  // Phase 4: drop defaults.yaml popups/forms entries keyed on pruned
  // collections. Without this pass, defaults.yaml still declares
  // e.g. `popups: { nb_pm_members: ... }` after we removed nb_pm_members.yaml
  // and all its pages — validator then errors "never inlined" because no
  // field can be displaying the collection's records anymore.
  const defaultsPath = path.join(dst, 'defaults.yaml');
  if (fs.existsSync(defaultsPath)) {
    try {
      const defaults = (loadYaml<Record<string, unknown>>(defaultsPath) || {}) as Record<string, unknown>;
      let changed = false;
      for (const section of ['popups', 'forms'] as const) {
        const m = defaults[section] as Record<string, unknown> | undefined;
        if (!m || typeof m !== 'object') continue;
        for (const coll of Object.keys(m)) {
          if (!referenced.has(coll)) {
            delete m[coll];
            changed = true;
          }
        }
      }
      if (changed) {
        fs.writeFileSync(defaultsPath, dumpYaml(defaults));
        log(`  - pruned defaults.yaml popup/form entries for dropped collections`);
      }
    } catch (e) { catchSwallow(e, 'orphan-prune defaults: bad YAML — skip'); }
  }
}
