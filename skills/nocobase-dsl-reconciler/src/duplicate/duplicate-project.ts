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
  /** Wipe the target dir if it exists. Without this, fail on conflict. */
  force?: boolean;
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

/** Replace UID substrings inside arbitrary string values. Skips template
 *  expressions ({{...}}) and well-known semantic prefixes. */
function rewriteString(s: string, map: Map<string, string>): string {
  if (!s) return s;
  // Don't touch i18n / template-var strings — they don't carry UIDs.
  if (s.includes('{{')) return s;
  let out = s;
  for (const [oldUid, newUid] of map) {
    if (out.includes(oldUid)) out = out.split(oldUid).join(newUid);
  }
  return out;
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

  // 1. Copy the whole tree.
  copyDirectory(src, dst);

  // 2. Collect every UID across all YAML files (skipping state.yaml — it's
  //    regenerated per deploy and would add stale entries to the map).
  const yamlFiles: string[] = [];
  walkDir(dst, (f) => { if (f.endsWith('.yaml') || f.endsWith('.yml')) yamlFiles.push(f); });

  const uidMap = new Map<string, string>();
  for (const file of yamlFiles) {
    if (path.basename(file) === 'state.yaml') continue;
    try { collectUids(loadYaml<unknown>(file), uidMap); } catch { /* skip bad yaml */ }
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

  // 4. Rewrite each YAML file with the new UIDs (skip routes.yaml if we just
  //    rewrote it — UIDs inside routes are still safe to remap, but reassign
  //    has already saved the file). state.yaml is wiped (deploy will repopulate).
  for (const file of yamlFiles) {
    if (path.basename(file) === 'state.yaml') {
      fs.unlinkSync(file);
      continue;
    }
    try {
      const obj = loadYaml<unknown>(file);
      const next = rewriteUids(obj, uidMap);
      saveYaml(file, next);
    } catch { /* skip */ }
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
