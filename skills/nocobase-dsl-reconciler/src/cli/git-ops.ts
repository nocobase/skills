/**
 * Git operations for CLI commands: per-project repo init, pre-deploy
 * snapshots, pre/post-deploy sync worktrees, and ad-hoc helpers.
 *
 * Every project workspace is its OWN git repo (`git init` in the dir),
 * decoupled from the tool source repo. This means:
 *   - `git rev-parse` stays inside the project history
 *   - Pre-deploy snapshots are rollback points that don't pollute the
 *     tool repo's log
 *   - `--incremental` push has a stable base SHA to diff against
 *   - The tool repo can `.gitignore workspaces/*` without losing the
 *     per-project git timeline
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NocoBaseClient } from '../client';
import { exportProject } from '../export';
import { catchSwallow } from '../utils/swallow';

type LogFn = (msg: string) => void;

/**
 * Ensure absDir is its own git repo with at least one commit.
 * No-op when `.git/` already exists. First-run cost: an `init` + bootstrap
 * commit so future snapshots have a parent.
 */
export async function ensureProjectGit(absDir: string, log: LogFn = () => {}): Promise<void> {
  const gitDir = path.join(absDir, '.git');
  if (fs.existsSync(gitDir)) return;
  if (!fs.existsSync(absDir)) return;  // dir doesn't exist yet (e.g. fresh pull about to write)
  const { execSync } = await import('node:child_process');
  try {
    execSync('git init -b main', { cwd: absDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: absDir, stdio: 'pipe' });
    const status = execSync('git status --porcelain', { cwd: absDir, stdio: 'pipe' }).toString().trim();
    if (status) {
      execSync('git commit -m "initial: project bootstrap" --allow-empty-message', { cwd: absDir, stdio: 'pipe' });
    } else {
      execSync('git commit --allow-empty -m "initial: project bootstrap"', { cwd: absDir, stdio: 'pipe' });
    }
    log(`  git: initialised local repo at ${path.basename(absDir)}/`);
  } catch (e) {
    log(`  ⚠ failed to git-init ${absDir}: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
  }
}

/** Commit current state as a rollback point before an action mutates it. */
export async function gitSnapshot(absDir: string, branch: string): Promise<void> {
  const { execSync } = await import('node:child_process');
  try {
    execSync('git add -A', { cwd: absDir, stdio: 'pipe' });
    const status = execSync('git status --porcelain', { cwd: absDir, stdio: 'pipe' }).toString().trim();
    if (status) {
      execSync(`git commit -m "pre-deploy snapshot (${branch})"`, { cwd: absDir, stdio: 'pipe' });
      console.log('  git: pre-deploy snapshot saved');
    }
  } catch (e) {
    console.log('  git: snapshot skipped — ' + (e instanceof Error ? e.message.slice(0, 60) : e));
  }
}

/** Auto-detect group title from routes.yaml (first group entry). */
export function autoDetectGroup(projectDir: string): string {
  try {
    // Defer utils/yaml import — keeps git-ops importable without pulling yaml in
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadYaml } = require('../utils/yaml');
    const routes = loadYaml(path.join(projectDir, 'routes.yaml'));
    if (Array.isArray(routes)) {
      const g = routes.find((r: Record<string, unknown>) => r.type === 'group' || r.children);
      return (g?.title as string) || '';
    }
  } catch (e) { catchSwallow(e, 'routes.yaml missing — fresh project, auto-detect skipped'); }
  return '';
}

/**
 * Pre-deploy: snapshot local YAML + export live NB state to a worktree.
 *
 * If user modified pages in the NocoBase UI since last deploy, those changes
 * are captured in the pre-deploy-live branch. The deploy still runs from the
 * main branch YAML, but the user can compare/merge the live state afterwards.
 */
export async function preDeployExport(absDir: string, group: string, mainBranch: string): Promise<void> {
  const { execSync } = await import('node:child_process');

  // Skip for first deploy (no state.yaml = nothing deployed yet)
  if (!fs.existsSync(path.join(absDir, 'state.yaml'))) return;

  try {
    // Snapshot the project subtree only — never the whole git repo. Without
    // the path scope, `git add -A` would also commit unrelated edits in
    // src/ (the tool source) under "pre-deploy snapshot", coupling tool
    // development to deployment side-effects.
    const projectName = path.basename(absDir);
    execSync(`git add -A -- "${absDir}"`, { cwd: absDir, stdio: 'pipe' });
    const localStatus = execSync(`git status --porcelain -- "${absDir}"`, { cwd: absDir, stdio: 'pipe' }).toString().trim();
    if (localStatus) {
      execSync(`git commit -m "pre-deploy snapshot: ${projectName}" -- "${absDir}"`, { cwd: absDir, stdio: 'pipe' });
      console.log(`  git: pre-deploy snapshot saved (${projectName})`);
    }

    // Export live state to worktree
    const liveBranch = 'pre-deploy-live';
    const wtDir = absDir + '-live';
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'worktree remove — may not exist yet'); }
    try { execSync(`git branch -D ${liveBranch}`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'branch delete — may not exist yet'); }
    execSync(`git worktree add "${wtDir}" -b ${liveBranch}`, { cwd: absDir, stdio: 'pipe' });

    // Copy state.yaml so export can match UIDs
    const stateFile = path.join(absDir, 'state.yaml');
    if (fs.existsSync(stateFile)) fs.copyFileSync(stateFile, path.join(wtDir, 'state.yaml'));

    const nb = await NocoBaseClient.create();
    await exportProject(nb, { outDir: wtDir, group });

    execSync('git add -A', { cwd: wtDir, stdio: 'pipe' });
    const liveStatus = execSync('git status --porcelain', { cwd: wtDir, stdio: 'pipe' }).toString().trim();
    if (liveStatus) {
      execSync('git commit -m "pre-deploy: live state"', { cwd: wtDir, stdio: 'pipe' });
    }

    // Show diff: local YAML vs live NocoBase
    const diff = execSync(
      `git diff --stat ${mainBranch}..${liveBranch} -- pages/ ":(exclude)**/page.yaml" ":(exclude)**/_refs.yaml"`,
      { cwd: absDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    ).trim();

    if (diff) {
      const lines = diff.split('\n');
      console.log(`\n  ⚠ Live state differs from local DSL (${lines.length - 1} files):`);
      console.log(lines.slice(0, 10).map(l => '    ' + l).join('\n'));
      if (lines.length > 11) console.log(`    ... and ${lines.length - 11} more`);
      console.log(`  To review:  git diff ${mainBranch}..${liveBranch}`);
      console.log(`  To adopt:   git merge ${liveBranch}`);
      console.log('  Proceeding with deploy from local DSL...\n');
    }

    // Cleanup worktree (branch preserved)
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'worktree remove after diff — best effort'); }
    if (!diff) {
      try { execSync(`git branch -D ${liveBranch}`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'branch cleanup — no diff means branch is empty'); }
    }
  } catch (e) {
    console.log('  ! pre-deploy sync: ' + (e instanceof Error ? e.message.slice(0, 60) : e));
  }
}

/**
 * Post-deploy: export live state → worktree → diff vs local DSL.
 *
 * Flow:
 *   1. git worktree add <dir>-worktree -b deploy-sync
 *   2. Clear worktree (keep state.yaml for UID matching)
 *   3. export-project into worktree
 *   4. git add + commit in worktree
 *   5. git diff main..deploy-sync --stat
 *   6. Normalized structural diff via diff/compare
 *   7. Remove worktree (branch preserved for review/merge if diff exists)
 */
export async function deploySyncWorktree(absDir: string, group: string, mainBranch: string): Promise<void> {
  const { execSync } = await import('node:child_process');
  const branch = 'deploy-sync';
  const wtDir = absDir + '-worktree';

  try {
    console.log('\n  ── Deploy sync ──');

    // Clean previous worktree/branch
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'worktree remove — may not exist yet'); }
    try { execSync(`git branch -D ${branch}`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'branch delete — may not exist yet'); }

    // Create worktree on new branch from current HEAD
    execSync(`git worktree add "${wtDir}" -b ${branch}`, { cwd: absDir, stdio: 'pipe' });

    // Clear all worktree files before export. Without this the worktree
    // inherits the source DSL (from HEAD) and the export only ADDS
    // group-prefixed copy paths — the leftover source files then masquerade
    // as "live" entries during compare, hiding cases where the deploy didn't
    // recreate a popup/template at all. Keep state.yaml as input for the
    // exporter (UID matching).
    const stateFile = path.join(absDir, 'state.yaml');
    let savedState: Buffer | null = null;
    if (fs.existsSync(stateFile)) savedState = fs.readFileSync(stateFile);
    for (const entry of fs.readdirSync(wtDir)) {
      if (entry === '.git') continue;
      fs.rmSync(path.join(wtDir, entry), { recursive: true, force: true });
    }
    if (savedState) fs.writeFileSync(path.join(wtDir, 'state.yaml'), savedState);

    // Export live NocoBase state into worktree
    const nb = await NocoBaseClient.create();
    await exportProject(nb, { outDir: wtDir, group });

    // Commit export result in worktree
    execSync('git add -A', { cwd: wtDir, stdio: 'pipe' });
    const status = execSync('git status --porcelain', { cwd: wtDir, stdio: 'pipe' }).toString().trim();
    if (status) {
      execSync('git commit -m "post-deploy export"', { cwd: wtDir, stdio: 'pipe' });
    }

    // Show diff: main..deploy-sync (content files only, exclude metadata)
    const diff = execSync(
      `git diff --stat ${mainBranch}..${branch} -- . ":(exclude)**/page.yaml" ":(exclude)**/_refs.yaml" ":(exclude)_graph.yaml"`,
      { cwd: absDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    ).trim();

    if (diff) {
      const lines = diff.split('\n');
      console.log(`\n  Diff (${mainBranch} → ${branch}):`);
      console.log(lines.map(l => '    ' + l).join('\n'));
      console.log(`\n  To review:  git diff ${mainBranch}..${branch}`);
      console.log(`  To merge:   git merge ${branch}`);
      console.log(`  To discard: git branch -D ${branch}`);
    } else {
      console.log('  ✓ No diff — DSL matches live state');
      // No changes → clean up branch too
      try { execSync(`git branch -D ${branch}`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'branch cleanup — no diff means branch is empty'); }
    }

    // Normalized structural diff (UID-aware) — surfaces real content drift
    // even when raw text diff is huge from deep-copy UID/path noise.
    try {
      const { compareProjects, printCompareResult } = await import('../diff/compare');
      const copyGroupSlug = group.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const result = compareProjects(absDir, wtDir, copyGroupSlug);
      printCompareResult(result);
    } catch (e) { console.log('  ! normalized-diff: ' + (e instanceof Error ? e.message.slice(0, 80) : e)); }

    // Always remove worktree (branch stays if there are changes)
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'worktree remove — branch stays'); }
  } catch (e) {
    console.log('  ! deploy-sync failed: ' + (e instanceof Error ? e.message.slice(0, 80) : e));
    // Best-effort cleanup
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch (e) { catchSwallow(e, 'worktree remove — error path'); }
  }
}
