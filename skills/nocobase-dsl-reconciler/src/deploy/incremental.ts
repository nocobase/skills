/**
 * Incremental push — skip work for unchanged DSL units.
 *
 * Granularity: page-level. Detects changes via git diff between
 * state.last_deployed_sha and HEAD (plus uncommitted edits).
 *
 * Falls back to full deploy when:
 *   - Not a git repo
 *   - No last_deployed_sha in state
 *   - last sha unreachable (rebase/force push)
 *   - routes.yaml or unknown files changed
 *   - --full flag passed
 */
import { execSync } from 'node:child_process';
import * as path from 'node:path';

export interface IncrementalScope {
  /** Page keys that need re-deploy (matches PageInfo.key). null = deploy all. */
  pages: Set<string> | null;
  /** Collection names that changed. null = all (full deploy). empty = none. */
  collections: Set<string> | null;
  /** Template names (basename without .yaml) that changed. null = all. */
  templates: Set<string> | null;
  /** Workflow dir names (slug) that changed. null = all. */
  workflows: Set<string> | null;
  /** True when full deploy is required (routes.yaml changed, sha missing, etc). */
  full: boolean;
  /** Reason for current decision, for logging. */
  reason: string;
}

const FULL: Omit<IncrementalScope, 'reason'> = {
  pages: null,
  collections: null,
  templates: null,
  workflows: null,
  full: true,
};

export function computeIncrementalScope(
  projectDir: string,
  lastSha: string | undefined,
): IncrementalScope {
  if (!lastSha) return { ...FULL, reason: 'no last_deployed_sha — full push' };

  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: projectDir, stdio: 'pipe' });
  } catch {
    return { ...FULL, reason: 'not a git repo — full push' };
  }

  try {
    execSync(`git cat-file -e ${lastSha}`, { cwd: projectDir, stdio: 'pipe' });
  } catch {
    return { ...FULL, reason: `last sha ${lastSha.slice(0, 7)} unreachable — full push` };
  }

  let changed: string[];
  try {
    const committed = execSync(`git diff --name-only ${lastSha} HEAD`, {
      cwd: projectDir, encoding: 'utf-8',
    }).trim().split('\n').filter(Boolean);
    const uncommitted = execSync('git status --porcelain', {
      cwd: projectDir, encoding: 'utf-8',
    }).trim().split('\n').filter(Boolean).map(l => l.slice(3));
    changed = [...new Set([...committed, ...uncommitted])];
  } catch {
    return { ...FULL, reason: 'git diff failed — full push' };
  }

  // changed paths are relative to git root, project may live deeper inside
  const gitRoot = execSync('git rev-parse --show-toplevel', {
    cwd: projectDir, encoding: 'utf-8',
  }).trim();
  const projectRel = path.relative(gitRoot, projectDir);

  const ours = changed
    .filter(f => f === projectRel || f.startsWith(projectRel + '/'))
    .map(f => (f === projectRel ? '' : f.slice(projectRel.length + 1)))
    .filter(Boolean);

  if (!ours.length) {
    return {
      pages: new Set(),
      collections: new Set(),
      templates: new Set(),
      workflows: new Set(),
      full: false,
      reason: `no changes since ${lastSha.slice(0, 7)}`,
    };
  }

  const pages = new Set<string>();
  const collections = new Set<string>();
  const templates = new Set<string>();
  const workflows = new Set<string>();
  const path_ = path; // alias to avoid shadowing

  for (const f of ours) {
    if (f === 'routes.yaml') return { ...FULL, reason: 'routes.yaml changed — full push' };
    if (f === 'state.yaml' || f === 'workflow-state.yaml' || f === 'workflows/workflow-state.yaml' || f === '_graph.yaml') continue;
    if (f.startsWith('pages/')) {
      const parts = f.split('/');
      const SPECIAL = new Set(['popups', 'js', 'ai', 'events', 'charts']);
      let pageKey = '';
      for (let i = parts.length - 2; i >= 1; i--) {
        if (!SPECIAL.has(parts[i])) { pageKey = parts[i]; break; }
      }
      if (pageKey) pages.add(pageKey);
      continue;
    }
    if (f.startsWith('collections/')) {
      // collections/<name>.yaml → name
      const name = path_.basename(f, '.yaml');
      if (name) collections.add(name);
      continue;
    }
    if (f.startsWith('templates/')) {
      // templates/<kind>/<name>.yaml → name (without ext)
      const name = path_.basename(f, '.yaml');
      if (name) templates.add(name);
      continue;
    }
    if (f.startsWith('workflows/')) {
      // workflows/<slug>/... → slug
      const parts = f.split('/');
      if (parts[1]) workflows.add(parts[1]);
      continue;
    }
    return { ...FULL, reason: `unknown change: ${f} — full push` };
  }

  const summary: string[] = [];
  if (pages.size) summary.push(`${pages.size} page(s)`);
  if (collections.size) summary.push(`${collections.size} collection(s)`);
  if (templates.size) summary.push(`${templates.size} template(s)`);
  if (workflows.size) summary.push(`${workflows.size} workflow(s)`);

  return {
    pages,
    collections,
    templates,
    workflows,
    full: false,
    reason: `incremental: ${summary.join(' + ') || 'nothing'} changed since ${lastSha.slice(0, 7)}`,
  };
}

export function getCurrentSha(projectDir: string): string | undefined {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: projectDir, encoding: 'utf-8',
    }).trim();
  } catch {
    return undefined;
  }
}
