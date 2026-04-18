/**
 * Duplicate a DSL project: clone the entire directory tree, regenerate every
 * UID, and (optionally) rename groups/pages. The output is a fresh, isolated
 * module — `deploy-project --force` deploys it without any runtime conversion
 * magic.
 *
 * Replaces the brittle `--copy` mode pattern (deploy-time
 * convertPopupToTemplate). DSL is the source of truth; if you want isolated
 * templates, your DSL files must have unique UIDs. This tool generates them.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadYaml, saveYaml, dumpYaml } from '../utils/yaml';
import { generateUid } from '../utils/uid';
import { slugify } from '../utils/slugify';
import { catchSwallow } from '../utils/swallow';
import { collectUids, rewriteUids } from './uid-rewriter';
import { rewriteCollectionRefs, rewriteDefaultsKeys } from './collection-rewriter';
import { pruneOrphanCollections } from './orphan-prune';

export interface DuplicateOptions {
  source: string;
  target: string;
  /** Suffix appended to every route key (and matching page dir name) to keep
   *  the duplicate isolated from the source in NocoBase. */
  keySuffix?: string;
  /** Prefix prepended to every route title. Use this to avoid the "邻居寄生"
   *  problem: when state.yaml is empty (fresh duplicate) and a live group
   *  shares the same title as a source route, push will adopt that live
   *  group instead of creating a new one. A unique title prefix forces
   *  creation of a separate group tree. */
  titlePrefix?: string;
  /** Suffix appended to every collection name. Triggers / SQL inside
   *  collection.triggers also get table-name rewrite so a v2 trigger
   *  references the v2 table instead of the source. Page coll: refs are
   *  also rewritten. Use this when you want truly independent data, not
   *  just a parallel UI on the same tables. */
  collectionSuffix?: string;
  /** Wipe the target dir if it exists. Without this, fail on conflict. */
  force?: boolean;
  /** Top-level route keys/titles to drop from the duplicate. Matches `key`
   *  first, then `title`. Used when the source has menu groups that aren't
   *  wanted in the copy (e.g. duplicating crm without the 项目管理 group).
   *  Prunes routes.yaml + deletes the corresponding `pages/<dir>/`. Does NOT
   *  prune collections — orphan _copy collections are harmless and can be
   *  cleaned with a fresh pull later if desired. */
  skipGroups?: string[];
  /** Top-level route keys/titles to KEEP — everything else is dropped.
   *  White-list counterpart to skipGroups. Use this when the source has many
   *  groups and you only want one or two in the copy (e.g. only "Main" and
   *  "Other" without "Lookup" or "项目管理"). When both skipGroups and
   *  includeGroups are set, includeGroups runs first then skipGroups
   *  prunes from the surviving subset.
   *  Also prunes orphan collections: any collections/*.yaml whose name is
   *  no longer referenced by any kept page is deleted (since you've narrowed
   *  to a smaller surface and the unused tables would otherwise be created
   *  empty in NB on push). */
  includeGroups?: string[];
}

/** Walk routes.yaml and rewrite every route's identity. Returns the
 *  old→new key mapping so directory renames can use it. Title prefix is
 *  applied per-route (not nested) so "Main" → "CCD - Main" but a child
 *  "Overview" stays "Overview" — title hierarchy mirrors menu hierarchy
 *  rather than getting "CCD - CCD - " stacked. */
function reassignIdentity(
  routesObj: unknown,
  keySuffix?: string,
  titlePrefix?: string,
): Map<string, string> {
  const keyMap = new Map<string, string>();
  if (!Array.isArray(routesObj)) return keyMap;
  const walk = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) walk(x, depth); return; }
    const o = node as Record<string, unknown>;
    if (typeof o.title === 'string') {
      if (keySuffix) {
        const oldKey = (typeof o.key === 'string' && o.key) || slugify(o.title);
        const newKey = `${oldKey}${keySuffix}`;
        keyMap.set(oldKey, newKey);
        o.key = newKey;
      }
      // Only prefix top-level titles. Children inherit uniqueness from being
      // nested under the prefixed parent group.
      if (titlePrefix && depth === 0) o.title = `${titlePrefix}${o.title}`;
    }
    if (Array.isArray(o.children)) for (const c of o.children) walk(c, depth + 1);
  };
  for (const r of routesObj) walk(r, 0);
  return keyMap;
}

/** Rename `pages/<oldKey>/` → `pages/<newKey>/` (recursively for sub-groups). */
function renamePageDirs(pagesDir: string, keyMap: Map<string, string>): void {
  if (!fs.existsSync(pagesDir)) return;
  // Process two-pass: collect renames first (single level), then apply, then
  // recurse into the renamed dirs. We do this top-down so deepest renames
  // don't fight parent renames mid-walk.
  const entries = fs.readdirSync(pagesDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const newName = keyMap.get(e.name);
    if (newName && newName !== e.name) {
      fs.renameSync(path.join(pagesDir, e.name), path.join(pagesDir, newName));
    }
  }
  // Recurse into all (post-rename) subdirs
  for (const e of fs.readdirSync(pagesDir, { withFileTypes: true })) {
    if (e.isDirectory()) renamePageDirs(path.join(pagesDir, e.name), keyMap);
  }
}

/** Recursive directory copy that skips .git and existing target files. */
function copyDirectory(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirectory(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

/** Count templates vs page leaf dirs and warn if grossly imbalanced. */
export function warnIfPolluted(dir: string, log: (msg: string) => void = (m) => console.warn(m)): void {
  const tplDir = path.join(dir, 'templates');
  let tplFiles = 0;
  if (fs.existsSync(tplDir)) {
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml')) && !e.name.startsWith('_')) tplFiles++;
      }
    };
    walk(tplDir);
  }
  const pagesDir = path.join(dir, 'pages');
  let pageDirs = 0;
  if (fs.existsSync(pagesDir)) {
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const p = path.join(d, e.name);
        if (fs.existsSync(path.join(p, 'layout.yaml')) || fs.existsSync(path.join(p, 'page.yaml'))) {
          pageDirs++;
        }
        walk(p);
      }
    };
    walk(pagesDir);
  }
  // Heuristic: > 4 templates per page is suspicious for a hand-built small
  // project. CRM averages ~5 templates per page so this is intentionally
  // generous; we mostly want to flag the "100 templates / 2 pages" case.
  if (pageDirs > 0 && tplFiles > pageDirs * 6 && tplFiles > 20) {
    log(`  ⚠ ${tplFiles} templates vs ${pageDirs} pages — looks polluted.`);
    log(`     Most likely cause: this dir was created by an unscoped 'cli pull <dir>'`);
    log(`     against a multi-project NocoBase. Templates from unrelated systems got dragged in.`);
    log(`     Re-pull with: cli pull <dir> --group <route-key>`);
    log(`     Continuing anyway — but a clean re-pull is recommended.`);
  }
}

/** Walk every file in a directory tree. */
function walkDir(dir: string, fn: (file: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(p, fn);
    else if (entry.isFile()) fn(p);
  }
}

export async function duplicateProject(opts: DuplicateOptions): Promise<{
  yamlFiles: number;
  jsFiles: number;
  uidsRemapped: number;
  keysReassigned: number;
  dirsRenamed: number;
}> {
  const src = path.resolve(opts.source);
  const dst = path.resolve(opts.target);

  if (!fs.existsSync(src)) throw new Error(`source not found: ${src}`);
  if (fs.existsSync(dst)) {
    if (!opts.force) throw new Error(`target already exists: ${dst} (use --force)`);
    fs.rmSync(dst, { recursive: true, force: true });
  }

  // Pollution heuristic: count templates/* files vs page directories. A
  // small project should have ~1-2 templates per page; if the ratio explodes
  // (typically because the source was pulled from a multi-project NocoBase
  // without `--group`), warn the user before duplicating, since we'd then
  // copy every unrelated template and push would deploy them all.
  warnIfPolluted(src);

  // 1. Copy the whole tree.
  copyDirectory(src, dst);

  // 1b. Filter top-level groups (--include-group / --skip-group) BEFORE we
  //     collect UIDs / rewrite references — otherwise we'd be remapping UIDs
  //     in subtrees we're about to delete, which is wasted work and may
  //     pollute the keyMap.
  if (opts.includeGroups?.length || opts.skipGroups?.length) {
    const includeSet = opts.includeGroups?.length ? new Set(opts.includeGroups) : null;
    const skipSet = new Set(opts.skipGroups ?? []);
    const matchesId = (r: Record<string, unknown>, set: Set<string>) =>
      set.has(String(r.key ?? '')) || set.has(String(r.title ?? ''));

    const routesFile2 = path.join(dst, 'routes.yaml');
    if (fs.existsSync(routesFile2)) {
      const arr = loadYaml<Record<string, unknown>[]>(routesFile2);
      if (Array.isArray(arr)) {
        // include first (white-list), then skip (black-list) prunes further
        let kept = includeSet ? arr.filter(r => matchesId(r, includeSet)) : arr.slice();
        if (skipSet.size) kept = kept.filter(r => !matchesId(r, skipSet));
        const droppedRoutes = arr.filter(r => !kept.includes(r));
        saveYaml(routesFile2, kept);

        // Remove dropped page dirs (slug = key || title — matches the dirname
        // chosen by export-project when keys are present, falling back to title).
        const pagesDir = path.join(dst, 'pages');
        for (const r of droppedRoutes) {
          const slug = String(r.key ?? r.title ?? '');
          const pdir = path.join(pagesDir, slug);
          if (fs.existsSync(pdir)) {
            fs.rmSync(pdir, { recursive: true, force: true });
            console.log(`  - dropped page dir: ${slug}`);
          }
        }
        const filterTags = [
          includeSet ? `--include-group ${[...includeSet].join('|')}` : null,
          skipSet.size ? `--skip-group ${[...skipSet].join('|')}` : null,
        ].filter(Boolean).join(', ');
        console.log(`  ✓ ${droppedRoutes.length} top-level route(s) dropped (${filterTags})`);

        // Prune orphan collections + defaults.yaml entries whenever the
        // duplicate was scoped (either --include-group kept a subset or
        // --skip-group dropped some groups). Walk every kept page/workflow
        // YAML and gather every `coll:` reference; any collection file
        // (or defaults.yaml popups/forms entry) whose name isn't reached
        // gets deleted so push doesn't create empty tables or trigger
        // validator "never inlined" false positives.
        if (includeSet || skipSet.size) pruneOrphanCollections(dst, walkDir, console.log);
      }
    }
  }

  // 2. Collect every UID across all YAML files (skipping state.yaml — it's
  //    regenerated per deploy and would add stale entries to the map).
  const yamlFiles: string[] = [];
  walkDir(dst, (f) => { if (f.endsWith('.yaml') || f.endsWith('.yml')) yamlFiles.push(f); });

  const uidMap = new Map<string, string>();
  for (const file of yamlFiles) {
    const base = path.basename(file);
    if (base === 'state.yaml' || base === 'workflow-state.yaml') continue;
    try { collectUids(loadYaml<unknown>(file), uidMap); } catch (e) { catchSwallow(e, 'skip bad yaml'); }
  }

  // 3. If --key-suffix or --title-prefix, rewrite routes.yaml first so we
  //    know the old→new key mapping before page dirs are renamed.
  let keyMap = new Map<string, string>();
  const routesFile = path.join(dst, 'routes.yaml');
  if ((opts.keySuffix || opts.titlePrefix) && fs.existsSync(routesFile)) {
    const routesObj = loadYaml<unknown>(routesFile);
    keyMap = reassignIdentity(routesObj, opts.keySuffix, opts.titlePrefix);
    saveYaml(routesFile, routesObj);
  }

  // 3a. If --title-prefix, also rewrite workflow titles so the duplicate's
  //     workflows can coexist with the source's (NocoBase doesn't enforce
  //     unique workflow titles, but identical names confuse the UI).
  //     CAUTION: workflows whose trigger.collection is unchanged will fire on
  //     the SAME table as the source — every insert/update fires both
  //     workflows. The duplicate is logically wrong unless either:
  //       (a) you also rename collections in v2 (manual edit), or
  //       (b) you remove/disable one side, or
  //       (c) you add a filter condition that distinguishes records.
  let sharedCollWorkflowCount = 0;
  const wfDir = path.join(dst, 'workflows');
  if (opts.titlePrefix && fs.existsSync(wfDir)) {
    for (const entry of fs.readdirSync(wfDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const wfFile = path.join(wfDir, entry.name, 'workflow.yaml');
      if (!fs.existsSync(wfFile)) continue;
      try {
        const wf = loadYaml<Record<string, unknown>>(wfFile);
        if (typeof wf.title === 'string') wf.title = `${opts.titlePrefix}${wf.title}`;
        const trig = (wf.trigger || {}) as Record<string, unknown>;
        if (trig.collection) sharedCollWorkflowCount++;
        saveYaml(wfFile, wf);
      } catch (e) { catchSwallow(e, 'skip'); }
    }
  }
  if (sharedCollWorkflowCount > 0) {
    console.log(`  ⚠ ${sharedCollWorkflowCount} workflow(s) trigger on collections shared with the source.`);
    console.log(`     After push, every insert/update will fire BOTH workflows (source + v2).`);
    console.log(`     If that's wrong, either disable one side or add a filter condition.`);
  }

  // 3b. If --collection-suffix, build a name-rewrite map covering every
  //     collection in collections/ AND propagate the rename through:
  //       - collection.name field
  //       - field.target / field.through (relation refs)
  //       - field.foreignKey (no rewrite — derived from field name, not table name)
  //       - workflow.trigger.collection
  //       - workflow.nodes.*.config.sql (string substitution)
  //       - collection.triggers[].sql (string substitution + auto-rename trigger names)
  //       - page coll: refs (string substitution in page YAML)
  //     This is the missing piece for fully-isolated duplicates: without it,
  //     v2 shares tables / triggers / workflows with v1.
  // NB system tables that we should NEVER rename — they're shared across all
  // applications. Add to this set if you discover more (auth-related etc).
  const NB_SYSTEM_COLLS = new Set([
    'users', 'roles', 'departments', 'rolesUsers', 'rolesUserschemas',
    'attachments', 'storages', 'verifications',
    'mailMessages', 'mailMessagesUsers', 'notifications',
    'workflows', 'jobs', 'executions', 'flow_nodes',
    'applicationPlugins', 'systemSettings',
  ]);

  const collMap = new Map<string, string>();
  if (opts.collectionSuffix && fs.existsSync(path.join(dst, 'collections'))) {
    for (const f of fs.readdirSync(path.join(dst, 'collections'))) {
      if (!f.endsWith('.yaml')) continue;
      const collFile = path.join(dst, 'collections', f);
      try {
        const c = loadYaml<Record<string, unknown>>(collFile);
        const oldName = (c.name as string) || f.replace('.yaml', '');
        if (!oldName.startsWith('_') && !NB_SYSTEM_COLLS.has(oldName)) {
          collMap.set(oldName, `${oldName}${opts.collectionSuffix}`);
        }
      } catch (e) { catchSwallow(e, 'skip'); }
    }
  }

  // 4. Rewrite each YAML file with the new UIDs (skip routes.yaml if we just
  //    rewrote it — UIDs inside routes are still safe to remap, but reassign
  //    has already saved the file). state.yaml is wiped (deploy will repopulate).
  for (const file of yamlFiles) {
    const base = path.basename(file);
    if (base === 'state.yaml' || base === 'workflow-state.yaml') {
      // Wipe both deploy-state files so the duplicate's first push creates
      // fresh routes/templates AND fresh workflows. Without wiping
      // workflow-state.yaml the deploy treats the duplicated workflow as
      // "already deployed" and never creates the v2 copy.
      fs.unlinkSync(file);
      continue;
    }
    try {
      const obj = loadYaml<unknown>(file);
      let next = rewriteUids(obj, uidMap);
      if (collMap.size) next = rewriteCollectionRefs(next, collMap, file);
      // defaults.yaml keys `popups:` and `forms:` as { <collectionName>: <file> }
      // — the collection name is the KEY, which rewriteCollectionRefs (values-only)
      // doesn't touch. Remap keys here so the duplicate's default-popup lookup
      // (enableM2oClickToOpen etc.) finds the template under the new coll name.
      if (collMap.size && base === 'defaults.yaml') {
        next = rewriteDefaultsKeys(next, collMap);
      }
      saveYaml(file, next);
    } catch (e) { catchSwallow(e, 'skip'); }
  }
  // Also rename the collection files themselves
  if (collMap.size) {
    const collDir = path.join(dst, 'collections');
    for (const [oldName, newName] of collMap) {
      const oldPath = path.join(collDir, `${oldName}.yaml`);
      const newPath = path.join(collDir, `${newName}.yaml`);
      if (fs.existsSync(oldPath) && oldPath !== newPath) {
        fs.renameSync(oldPath, newPath);
      }
    }
    console.log(`  ✓ ${collMap.size} collections renamed (--collection-suffix ${opts.collectionSuffix})`);
  }

  // 5. Rename page directories so they match the new keys.
  let dirsRenamed = 0;
  if (keyMap.size) {
    const pagesDir = path.join(dst, 'pages');
    const before = collectDirs(pagesDir);
    renamePageDirs(pagesDir, keyMap);
    const after = collectDirs(pagesDir);
    dirsRenamed = Math.max(0, before.size - new Set([...before].filter(d => after.has(d))).size);
  }

  // 6. Rewrite JS files — they often inline UID literals (e.g. const TARGET_BLOCK_UID
  //    = 'abc123def456'). Treat as plain text substitution.
  let jsCount = 0;
  walkDir(dst, (f) => {
    if (!f.endsWith('.js')) return;
    let code = fs.readFileSync(f, 'utf8');
    let changed = false;
    for (const [oldUid, newUid] of uidMap) {
      if (code.includes(oldUid)) {
        code = code.split(oldUid).join(newUid);
        changed = true;
      }
    }
    if (changed) { fs.writeFileSync(f, code); jsCount++; }
  });

  // Mark as a duplicate workspace. push --copy will only bypass spec
  // validation when this marker exists, so AI agents can't accidentally
  // bypass the validator on a regular hand-authored project by passing
  // --copy. Contents are informational (source path + duplicate flags).
  fs.writeFileSync(path.join(dst, '.duplicate-source'), [
    `source: ${path.relative(dst, src) || src}`,
    `created_at: ${new Date().toISOString()}`,
    opts.keySuffix ? `key_suffix: ${opts.keySuffix}` : '',
    opts.titlePrefix ? `title_prefix: ${opts.titlePrefix}` : '',
    opts.collectionSuffix ? `collection_suffix: ${opts.collectionSuffix}` : '',
    opts.includeGroups?.length ? `include_groups: [${opts.includeGroups.join(', ')}]` : '',
    opts.skipGroups?.length ? `skip_groups: [${opts.skipGroups.join(', ')}]` : '',
  ].filter(Boolean).join('\n') + '\n');

  return {
    yamlFiles: yamlFiles.length,
    jsFiles: jsCount,
    uidsRemapped: uidMap.size,
    keysReassigned: keyMap.size,
    dirsRenamed,
  };
}

function collectDirs(root: string): Set<string> {
  const out = new Set<string>();
  if (!fs.existsSync(root)) return out;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const full = path.join(d, e.name);
        out.add(full);
        walk(full);
      }
    }
  };
  walk(root);
  return out;
}
