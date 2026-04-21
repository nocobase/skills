/**
 * Compare two project directories after normalizing UIDs + path prefixes.
 *
 * Use case: deploy --copy creates CCD with new UIDs and group-prefixed file
 * paths. A naive `git diff` between source and re-exported live state shows
 * thousands of lines of UID/path noise. This comparator normalizes both
 * sides and reports only actual structural/content differences.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadYaml } from '../utils/yaml';
import { normalize, unprefixCopyPath } from './normalize';

// Skip files that are inherently different in live re-export and not worth
// surfacing as drift:
//   - state.yaml: pure UID map, regenerated each deploy
//   - _index.yaml / _usages.yaml: derived from flowModelTemplates table
//   - routes.yaml: live includes BOTH source and copy routes (additive)
//   - defaults.yaml: derived from template usageCount, varies per deploy
const SKIP_FILES = new Set([
  'state.yaml', '_index.yaml', '_usages.yaml', '_graph.yaml', '_refs.yaml',
  'routes.yaml', 'defaults.yaml',
]);
const SKIP_DIRS = new Set(['.git', 'node_modules']);

interface FileEntry { logicalPath: string; absPath: string; }

function listYamlFiles(root: string, copyGroupSlug?: string): Map<string, FileEntry> {
  const out = new Map<string, FileEntry>();
  function walk(dir: string, rel: string) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const abs = path.join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        walk(abs, relPath);
      } else if (name.endsWith('.yaml') && !SKIP_FILES.has(name)) {
        const logical = unprefixCopyPath(relPath, copyGroupSlug);
        out.set(logical, { logicalPath: logical, absPath: abs });
      }
    }
  }
  walk(root, '');
  return out;
}

function loadAndNormalize(absPath: string): unknown {
  try {
    const obj = loadYaml<unknown>(absPath);
    return normalize(obj);
  } catch (e) {
    return { _parseError: String(e) };
  }
}

function stableStringify(obj: unknown, depth = 0): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(x => stableStringify(x, depth + 1)).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k], depth + 1)).join(',') + '}';
}

export interface CompareResult {
  total: number;
  matched: number;
  differing: { logicalPath: string; leftPath: string; rightPath: string }[];
  onlyInLeft: string[];
  onlyInRight: string[];
}

export function compareProjects(
  leftDir: string,
  rightDir: string,
  copyGroupSlug?: string,
): CompareResult {
  const left = listYamlFiles(leftDir);  // source: no prefix to strip
  const right = listYamlFiles(rightDir, copyGroupSlug);  // deploy-sync: strip copy prefix

  const allKeys = new Set([...left.keys(), ...right.keys()]);
  const result: CompareResult = {
    total: allKeys.size,
    matched: 0,
    differing: [],
    onlyInLeft: [],
    onlyInRight: [],
  };

  for (const key of allKeys) {
    const l = left.get(key);
    const r = right.get(key);
    if (!l) { result.onlyInRight.push(key); continue; }
    if (!r) { result.onlyInLeft.push(key); continue; }
    const lh = stableStringify(loadAndNormalize(l.absPath));
    const rh = stableStringify(loadAndNormalize(r.absPath));
    if (lh === rh) result.matched++;
    else result.differing.push({ logicalPath: key, leftPath: l.absPath, rightPath: r.absPath });
  }

  return result;
}

export function printCompareResult(r: CompareResult, log: (s: string) => void = console.log): void {
  log(`\n  ── Normalized diff ──`);
  log(`  Total files: ${r.total} (${r.matched} matched, ${r.differing.length} differ, ${r.onlyInLeft.length} only-in-source, ${r.onlyInRight.length} only-in-live)`);

  if (r.differing.length) {
    log(`\n  Differing content (${r.differing.length}):`);
    for (const d of r.differing.slice(0, 30)) log(`    ~ ${d.logicalPath}`);
    if (r.differing.length > 30) log(`    ... and ${r.differing.length - 30} more`);
  }
  if (r.onlyInLeft.length) {
    log(`\n  Only in source (${r.onlyInLeft.length}):`);
    for (const p of r.onlyInLeft.slice(0, 20)) log(`    - ${p}`);
    if (r.onlyInLeft.length > 20) log(`    ... and ${r.onlyInLeft.length - 20} more`);
  }
  if (r.onlyInRight.length) {
    log(`\n  Only in live (${r.onlyInRight.length}):`);
    for (const p of r.onlyInRight.slice(0, 20)) log(`    + ${p}`);
    if (r.onlyInRight.length > 20) log(`    ... and ${r.onlyInRight.length - 20} more`);
  }
  if (r.differing.length === 0 && r.onlyInLeft.length === 0 && r.onlyInRight.length === 0) {
    log(`  ✓ Source and live are structurally identical`);
  }
}
