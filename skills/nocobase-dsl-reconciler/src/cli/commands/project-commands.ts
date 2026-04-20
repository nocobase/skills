/**
 * Project-level CLI commands that operate on whole workspace trees:
 * sync, compare (diff), duplicate-project.
 *
 * Extracted from cli.ts — behaviour unchanged, only relocation.
 */
import * as path from 'node:path';
import { NocoBaseClient } from '../../client';
import { sync } from '../../sync';
import { resolveWorkspacePath, WORKSPACE_ROOT } from '../workspace-paths';
import { ensureProjectGit } from '../git-ops';

export async function cmdSync(args: string[]) {
  const modDirArg = args[0];
  if (!modDirArg) { console.error('Usage: cli.ts sync <dir> [--page <name>]'); process.exit(1); }
  const modDir = resolveWorkspacePath(modDirArg);
  const pageIdx = args.indexOf('--page');
  const pageFilter = pageIdx >= 0 ? args[pageIdx + 1] : undefined;
  const nb = await NocoBaseClient.create();
  await sync(modDir, nb, pageFilter);
}

export async function cmdCompare(args: string[]) {
  const leftArg = args[0];
  const rightArg = args[1];
  if (!leftArg || !rightArg) { console.error('Usage: cli.ts compare <source-dir> <live-dir> [--copy-group <slug>]'); process.exit(1); }
  const left = resolveWorkspacePath(leftArg);
  const right = resolveWorkspacePath(rightArg);
  const slugIdx = args.indexOf('--copy-group');
  const copyGroupSlug = slugIdx >= 0 ? args[slugIdx + 1] : undefined;
  const { compareProjects, printCompareResult } = await import('../../diff/compare');
  const result = compareProjects(left, right, copyGroupSlug);
  printCompareResult(result);
  if (result.differing.length || result.onlyInLeft.length || result.onlyInRight.length) {
    process.exit(2);
  }
}

export async function cmdDuplicateProject(args: string[]) {
  const srcArg = args[0];
  const dstArg = args[1];
  if (!srcArg || !dstArg) {
    console.error('Usage: cli.ts duplicate-project <source-dir> <target-dir> [--key-suffix _ccd] [--title-prefix "CCD - "] [--collection-suffix _v2] [--include-group <key|title>] [--skip-group <key|title>] [--force]\n\n  --key-suffix         Append to every route key so the duplicate is a separate identity.\n  --title-prefix       Prepend to every top-level title so push won\'t adopt a same-titled live group.\n  --collection-suffix  Rename every collection (and trigger SQL refs) — produces TRULY independent\n                       data. Without it, v2 shares the source\'s tables.\n  --include-group      KEEP only these top-level menu groups (repeatable). White-list mode.\n                       Also prunes collections that no kept page references.\n  --skip-group         DROP these top-level menu groups (repeatable). Black-list mode.\n                       Match by route key first, then title.\n\n  Recommended for isolated duplicate: --key-suffix + --title-prefix + --collection-suffix.');
    process.exit(1);
  }
  const src = resolveWorkspacePath(srcArg);
  const dst = resolveWorkspacePath(dstArg);
  const sufIdx = args.indexOf('--key-suffix');
  const keySuffix = sufIdx >= 0 ? args[sufIdx + 1] : undefined;
  const tpIdx = args.indexOf('--title-prefix');
  const titlePrefix = tpIdx >= 0 ? args[tpIdx + 1] : undefined;
  const csIdx = args.indexOf('--collection-suffix');
  const collectionSuffix = csIdx >= 0 ? args[csIdx + 1] : undefined;
  // --include-group / --skip-group are repeatable: collect every occurrence
  const includeGroups: string[] = [];
  const skipGroups: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--include-group' && args[i + 1]) includeGroups.push(args[++i]);
    else if (args[i] === '--skip-group' && args[i + 1]) skipGroups.push(args[++i]);
  }
  const force = args.includes('--force');
  const { duplicateProject } = await import('../../duplicate/duplicate-project');
  const tags = [
    keySuffix && `key: ${keySuffix}`,
    titlePrefix && `title: ${titlePrefix}`,
    collectionSuffix && `coll: ${collectionSuffix}`,
    includeGroups.length && `include: ${includeGroups.join('|')}`,
    skipGroups.length && `skip: ${skipGroups.join('|')}`,
  ].filter(Boolean).join(', ');
  console.log(`\n  Duplicating ${src} → ${dst}${tags ? ` (${tags})` : ''}`);
  const r = await duplicateProject({
    source: src, target: dst, keySuffix, titlePrefix, collectionSuffix,
    includeGroups: includeGroups.length ? includeGroups : undefined,
    skipGroups: skipGroups.length ? skipGroups : undefined,
    force,
  });
  console.log(`  ✓ ${r.yamlFiles} YAML files rewritten, ${r.jsFiles} JS files patched, ${r.uidsRemapped} UIDs remapped`);
  if (r.keysReassigned) console.log(`  ✓ ${r.keysReassigned} route keys reassigned, ${r.dirsRenamed} dirs renamed`);
  await ensureProjectGit(dst, console.log);
  console.log(`\n  Next: cli push ${path.relative(WORKSPACE_ROOT, dst) || dst} --copy --force`);
  console.log(`        --copy bypasses spec validation (gated on .duplicate-source marker, written above).`);
}
