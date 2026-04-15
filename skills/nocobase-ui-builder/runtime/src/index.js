import fs from 'node:fs/promises';
import path from 'node:path';
import { runTask } from './runner.js';
export { renderPageBlueprintAsciiPreview } from './page-blueprint-preview.js';
export { prepareApplyBlueprintRequest } from './page-blueprint-preview.js';
export { summarizeTemplateDecision } from './template-decision-summary.js';
export { planTemplateQuery, selectTemplateDecision } from './template-selection.js';

async function loadMaybeFile(cwd, filePath, reader) {
  if (!filePath) return undefined;
  const resolved = path.resolve(cwd, filePath);
  return reader(resolved);
}

function assertCode(taskLike, code) {
  if (typeof code !== 'string') {
    const filename = taskLike?.filename || taskLike?.codeFile;
    throw new Error(filename ? `Missing required code for "${filename}".` : 'Missing required code string.');
  }
}

function isBlocked(issue) {
  return [
    'blocked-side-effect',
    'blocked-static-side-effect',
    'blocked-dynamic-code-generation',
    'blocked-network-host',
    'blocked-skill-live-network',
  ].includes(issue.ruleId);
}

async function resolveBatchTask(item, cwd, defaultSkillMode) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Each batch task must be one object.');
  }
  if (!item.model) {
    throw new Error('Each batch task requires one model.');
  }
  if (typeof item.code !== 'string' && !item.codeFile) {
    throw new Error(`Batch task "${item.id || item.model}" requires either code or codeFile.`);
  }

  const code =
    typeof item.code === 'string'
      ? item.code
      : await loadMaybeFile(cwd, item.codeFile, async (resolved) => fs.readFile(resolved, 'utf8'));
  assertCode(item, code);

  const context =
    typeof item.context !== 'undefined'
      ? item.context
      : await loadMaybeFile(cwd, item.contextFile, async (resolved) => JSON.parse(await fs.readFile(resolved, 'utf8')));
  const network =
    typeof item.network !== 'undefined'
      ? item.network
      : await loadMaybeFile(cwd, item.networkFile, async (resolved) => JSON.parse(await fs.readFile(resolved, 'utf8')));

  return {
    id: item.id,
    model: item.model,
    code,
    context,
    network,
    skillMode: typeof item.skillMode === 'boolean' ? item.skillMode : defaultSkillMode,
    version: item.version,
    timeoutMs: item.timeoutMs,
    filename: item.codeFile || item.filename,
  };
}

export async function validateRunJSSnippet({ model, code, context, network, skillMode = false, version, timeoutMs, filename }) {
  assertCode({ filename }, code);
  return runTask({
    model,
    code,
    context,
    network,
    skillMode,
    version,
    timeoutMs,
    filename,
  });
}

export async function runBatch({ tasks, cwd = process.cwd(), defaultSkillMode = false }) {
  if (!Array.isArray(tasks)) {
    throw new Error('Batch input must include one tasks array.');
  }
  if (tasks.length === 0) {
    throw new Error('Batch tasks must be one non-empty array.');
  }

  const results = [];
  for (const item of tasks) {
    const task = await resolveBatchTask(item, cwd, defaultSkillMode);
    const result = await validateRunJSSnippet(task);
    results.push(typeof task.id === 'undefined' ? result : { id: task.id, ...result });
  }

  return {
    ok: results.every((item) => item.ok),
    summary: {
      total: results.length,
      passed: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      blocked: results.filter((item) => [...item.policyIssues, ...item.runtimeIssues].some(isBlocked)).length,
    },
    results,
  };
}
