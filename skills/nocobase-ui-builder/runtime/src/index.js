import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectRunJSStaticCode } from '../../scripts/runjs_guard.mjs';
import { DEFAULT_TIMEOUT_MS, VALIDATOR_TYPE } from './constants.js';
import { runTask } from './runner.js';
export { renderPageBlueprintAsciiPreview } from './page-blueprint-preview.js';
export { prepareApplyBlueprintRequest } from './page-blueprint-preview.js';
export { summarizeTemplateDecision } from './template-decision-summary.js';
export { planTemplateQuery, selectTemplateDecision } from './template-selection.js';

const SURFACE_DEFAULT_MODELS = {
  'event-flow.execute-javascript': 'JSRecordActionModel',
  'linkage.execute-javascript': 'JSFormActionModel',
  'reaction.value-runjs': 'JSEditableFieldModel',
  'custom-variable.runjs': 'JSEditableFieldModel',
};

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

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

function resolveRuntimeModel({ model, surface }) {
  const explicitModel = normalizeText(model);
  if (explicitModel) return explicitModel;
  return SURFACE_DEFAULT_MODELS[normalizeText(surface)] || '';
}

function mapRunJSFindingToPolicyIssue(finding) {
  return {
    type: 'policy',
    severity: finding.severity === 'warning' ? 'warning' : 'error',
    ruleId: finding.code,
    message: finding.message,
    ...(finding.line || finding.column
      ? {
          location: {
            ...(finding.line ? { line: finding.line } : {}),
            ...(finding.column ? { column: finding.column } : {}),
          },
        }
      : {}),
    ...(finding.details ? { details: finding.details } : {}),
  };
}

function createRunJSGuardFailureResult({ task, runtimeModel, inspection }) {
  return {
    validatorType: VALIDATOR_TYPE,
    model: runtimeModel || String(task.model || ''),
    ...(task.surface ? { surface: task.surface } : {}),
    version: task.version || 'compat',
    ok: false,
    syntaxIssues: [],
    contextIssues: [],
    policyIssues: (inspection.blockers || []).map(mapRunJSFindingToPolicyIssue),
    runtimeIssues: [],
    logs: [],
    sideEffectAttempts: [],
    execution: {
      mode: 'validate',
      model: runtimeModel || String(task.model || ''),
      ...(task.surface ? { surface: task.surface } : {}),
      executed: false,
      skillMode: Boolean(task.skillMode),
      timeoutMs: task.timeoutMs || DEFAULT_TIMEOUT_MS,
      runjsInspection: {
        ok: inspection.ok,
        blockerCount: inspection.blockers?.length || 0,
        warningCount: inspection.warnings?.length || 0,
        contractSource: inspection.contractSource,
      },
    },
    availableContextKeys: [],
    topLevelAliases: [],
    usedContextPaths: [],
  };
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
  if (!item.model && !item.surface) {
    throw new Error('Each batch task requires one model or surface.');
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
    surface: item.surface,
    code,
    context,
    network,
    skillMode: typeof item.skillMode === 'boolean' ? item.skillMode : defaultSkillMode,
    version: item.version,
    timeoutMs: item.timeoutMs,
    filename: item.codeFile || item.filename,
  };
}

export async function validateRunJSSnippet({
  model,
  surface,
  code,
  context,
  network,
  skillMode = false,
  version,
  timeoutMs,
  filename,
  snapshotPath,
}) {
  assertCode({ filename }, code);
  const normalizedSurface = normalizeText(surface);
  const runtimeModel = resolveRuntimeModel({ model, surface: normalizedSurface });
  if (normalizedSurface) {
    const inspection = inspectRunJSStaticCode({
      code,
      modelUse: normalizeText(model) || null,
      surface: normalizedSurface,
      version,
      snapshotPath,
      path: filename || '$',
    });
    if (!inspection.ok) {
      return createRunJSGuardFailureResult({
        task: { model, surface: normalizedSurface, version, skillMode, timeoutMs },
        runtimeModel,
        inspection,
      });
    }
  }
  return runTask({
    model: runtimeModel || model,
    surface: normalizedSurface || undefined,
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
