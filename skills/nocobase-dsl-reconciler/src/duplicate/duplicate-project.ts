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

/** Field names whose values are flowModel UIDs that must be remapped. */
const UID_KEYS = new Set([
  'uid', 'targetUid', 'popupTemplateUid', 'templateUid',
  'route_id', 'page_uid', 'tab_uid', 'grid_uid', 'schema_uid',
  'popup_grid', 'popup_page', 'popup_tab', 'parent_uid',
  'wrapper', 'field', 'modelUid', 'group_id', 'block_uid',
  'host_uid',
]);

/** UID-shaped value detector.
 *
 * NocoBase generateUid produces 11-char base36 strings with at least one digit
 * (`Math.random().toString(36)` always seeds with a `0.` digit prefix). Field
 * names like `currency` or `priority` are 8 lowercase letters with NO digits —
 * we MUST exclude those, otherwise rewriteString would mangle field names
 * across the project. Require at least one digit to avoid that false positive.
 */
function looksLikeUid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Numeric route_id (Postgres bigserial)
  if (/^\d{10,}$/.test(value)) return true;
  // 8-12 char base36, must contain at least one digit (rules out plain words)
  if (/^[a-z0-9]{8,12}$/.test(value) && /\d/.test(value)) return true;
  return false;
}

/** Collect all UIDs that appear as values of UID_KEYS, mint new UIDs. */
function collectUids(obj: unknown, map: Map<string, string>): void {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    for (const x of obj) collectUids(x, map);
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (UID_KEYS.has(k) && looksLikeUid(v)) {
        const oldUid = String(v);
        if (!map.has(oldUid)) map.set(oldUid, mintUid(oldUid));
      }
      collectUids(v, map);
    }
  }
}

/** Mint a new UID that matches the shape of the old one. */
function mintUid(oldUid: string): string {
  if (/^\d+$/.test(oldUid)) {
    // Numeric route_id — generate a numeric pseudo-id with similar length.
    // Real route IDs come from NB's auto-increment; here we use timestamp + random
    // and let deploy overwrite via the create-route path.
    return String(Date.now()) + Math.floor(Math.random() * 1000);
  }
  return generateUid();
}

/** Rewrite the tree, replacing UIDs in known keys via the map. Strings inside
 *  string values (e.g. JS UID placeholders, /admin/<uid> URLs) are also
 *  rewritten — they often embed UIDs as plain substrings. */
function rewriteUids(obj: unknown, map: Map<string, string>): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return rewriteString(obj, map);
  if (Array.isArray(obj)) return obj.map(x => rewriteUids(x, map));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (UID_KEYS.has(k) && typeof v === 'string' && map.has(v)) {
        out[k] = map.get(v);
      } else if (UID_KEYS.has(k) && typeof v === 'number' && map.has(String(v))) {
        // Numeric route_id stored as number
        out[k] = Number(map.get(String(v)));
      } else {
        out[k] = rewriteUids(v, map);
      }
    }
    return out;
  }
  return obj;
}

/** When --collection-suffix is set, rewrite every reference to an old
 *  collection name → new name. Touches:
 *    - top-level `name` (collection file rename)
 *    - field.target / field.through (relation refs)
 *    - workflow trigger.collection
 *    - workflow nodes.config.sql (string substitution — quoted/unquoted)
 *    - collection.triggers[].sql (same), and rename trigger names too
 *    - page block.coll
 *  Also auto-renames trigger names by appending the same suffix to keep them
 *  uniquely named at the DB level. */
/** defaults.yaml structure:
 *    popups: { <collectionName>: <template-file> }
 *    forms:  { <collectionName>: <template-file> }
 *  rewriteCollectionRefs only touches VALUES keyed on name/target/through/…
 *  so the map KEYS (collection names) survive unchanged. This remaps them. */
function rewriteDefaultsKeys(
  obj: unknown,
  collMap: Map<string, string>,
): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const o = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [section, inner] of Object.entries(o)) {
    if ((section === 'popups' || section === 'forms') && inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const remapped: Record<string, unknown> = {};
      for (const [collName, tplFile] of Object.entries(inner as Record<string, unknown>)) {
        const newKey = collMap.get(collName) || collName;
        remapped[newKey] = tplFile;
      }
      out[section] = remapped;
    } else {
      out[section] = inner;
    }
  }
  return out;
}

function rewriteCollectionRefs(
  obj: unknown,
  collMap: Map<string, string>,
  filePath: string,
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // String-level rewrites only happen for SQL bodies (handled inline below).
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(x => rewriteCollectionRefs(x, collMap, filePath));
  if (typeof obj !== 'object') return obj;
  const o = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    // Direct name fields
    if ((k === 'name' || k === 'target' || k === 'through' || k === 'collection' || k === 'collectionName') && typeof v === 'string' && collMap.has(v)) {
      out[k] = collMap.get(v);
      continue;
    }
    // Block.coll on page YAML
    if (k === 'coll' && typeof v === 'string' && collMap.has(v)) {
      out[k] = collMap.get(v);
      continue;
    }
    // Association references like `nb_crm_leads.comments` — the value is
    // `<collectionName>.<fieldName>`. Rewrite the prefix when collMap has the
    // collection. Without this comments / mailMessages / o2m blocks in a
    // duplicate still point at the source's collection (e.g. the duplicate
    // CommentsBlock for nb_crm_leads_copy ends up bound to nb_crm_leads).
    if ((k === 'associationName' || k === 'associationField') && typeof v === 'string' && v.includes('.')) {
      const [head, ...rest] = v.split('.');
      if (collMap.has(head)) {
        out[k] = `${collMap.get(head)}.${rest.join('.')}`;
        continue;
      }
    }
    // SQL bodies — substitute table names (word-boundary match) AND auto-suffix trigger names
    if (k === 'sql' && typeof v === 'string') {
      let sql = v;
      for (const [oldName, newName] of collMap) {
        sql = sql.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
      }
      out[k] = sql;
      continue;
    }
    // Trigger object: rename its `name` (so v1/v2 triggers coexist on
    // different tables — but PG also requires unique trigger names per
    // table, which is fine since they're on different tables now), and
    // rewrite collection names + function names inside the SQL body so
    // v2's CREATE OR REPLACE doesn't clobber v1's function.
    if (k === 'triggers' && Array.isArray(v)) {
      // We need a suffix. Derive it from the first collMap entry
      // (e.g. 'bookings' → 'bookings_v2' → suffix '_v2').
      const firstEntry = collMap.entries().next().value;
      const suffix = firstEntry ? firstEntry[1].slice(firstEntry[0].length) : '';
      out[k] = v.map((t: any) => {
        if (!t || typeof t !== 'object') return t;
        const newT = { ...t };
        if (typeof newT.name === 'string' && suffix) {
          newT.name = `${newT.name}${suffix}`;
        }
        for (const field of ['sql', 'drop'] as const) {
          if (typeof newT[field] !== 'string') continue;
          let s = newT[field] as string;
          // 1. Rename table refs.
          for (const [oldName, newName] of collMap) {
            s = s.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
          }
          // 2. Rename function names declared/referenced in this DDL.
          //    Match `CREATE [OR REPLACE] FUNCTION [schema.]<name>(`
          //    and `EXECUTE FUNCTION [schema.]<name>` and `EXECUTE PROCEDURE …`.
          if (suffix) {
            s = s.replace(
              /\b(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:[a-zA-Z0-9_]+\.)?)([a-zA-Z0-9_]+)\s*\(/gi,
              (_m, p1, fn) => `${p1}${fn}${suffix}(`,
            );
            s = s.replace(
              /\b(EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:[a-zA-Z0-9_]+\.)?)([a-zA-Z0-9_]+)/gi,
              (_m, p1, fn) => `${p1}${fn}${suffix}`,
            );
            // Also rename CREATE TRIGGER <name> so the trigger name itself gets the suffix.
            s = s.replace(
              /\b(CREATE\s+TRIGGER\s+)([a-zA-Z0-9_]+)/gi,
              (_m, p1, tn) => `${p1}${tn}${suffix}`,
            );
          }
          newT[field] = s;
        }
        return newT;
      });
      continue;
    }
    out[k] = rewriteCollectionRefs(v, collMap, filePath);
  }
  return out;
}

/** Replace UID substrings inside arbitrary string values. Strings with
 *  template expressions (`{{...}}`) ARE processed — only the literal
 *  expression body is preserved verbatim while UIDs in the surrounding
 *  text get rewritten. Without this, action URLs like
 *    admin/<page-uid>/view/<block-uid>/filterbytk/{{ctx.record.id}}
 *  would skip rewriting (the early `if (s.includes('{{'))` bail-out), and
 *  a duplicated project's "Detail" buttons would jump back to the
 *  source's pages. */
function rewriteString(s: string, map: Map<string, string>): string {
  if (!s) return s;
  // Pure template expression with no surrounding text → no UIDs to remap.
  if (/^\s*\{\{[\s\S]*\}\}\s*$/.test(s)) return s;
  // Split into [text, expr, text, expr, ...] segments so we only rewrite
  // outside `{{...}}` blocks. Keeps things like {{ ctx.record.id }} intact
  // even when ctx happens to contain an alphanumeric run that collides
  // with a UID in the map.
  const parts = s.split(/(\{\{[\s\S]*?\}\})/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue;  // odd indices are expression bodies
    let segment = parts[i];
    for (const [oldUid, newUid] of map) {
      if (segment.includes(oldUid)) segment = segment.split(oldUid).join(newUid);
    }
    parts[i] = segment;
  }
  return parts.join('');
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

/** Walk every YAML in pages/ + workflows/ and gather every collection name
 *  that's still referenced (coll, target, associationName head, trigger.collection).
 *  Any collections/*.yaml whose basename isn't reached gets deleted —
 *  reduces push-time noise when the duplicate scope was narrowed by
 *  --include-group. Best-effort: malformed YAML / unexpected shapes are
 *  silently skipped (we'd rather under-prune than crash). Run BEFORE
 *  --collection-suffix renames anything, since refs use original names. */
function pruneOrphanCollections(dst: string, log: (msg: string) => void): void {
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
      try { visit(loadYaml<unknown>(f)); } catch (e) { catchSwallow(e, 'skip'); }
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
      } catch (e) { catchSwallow(e, 'skip'); }
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

        // When narrowing via --include-group, also prune orphan collections.
        // Walk every kept page YAML and gather every `coll:` reference; any
        // collection file whose name isn't reached gets deleted so push
        // doesn't create empty unused tables.
        if (includeSet) pruneOrphanCollections(dst, console.log);
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
