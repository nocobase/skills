import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalizeRunJSCode, inspectRunJSStaticCode } from '../../scripts/runjs_guard.mjs';
import { DEFAULT_TIMEOUT_MS, VALIDATOR_TYPE } from './constants.js';
import { runTask } from './runner.js';
import { getRunJSFallbackRuntimeModel, RUNJS_MODEL_USES } from './surface-policy.js';
import { sortIssues } from './utils.js';
export { renderPageBlueprintAsciiPreview } from './page-blueprint-preview.js';
export { prepareApplyBlueprintRequest } from './page-blueprint-preview.js';
export { summarizeTemplateDecision } from './template-decision-summary.js';
export { planTemplateQuery, selectTemplateDecision } from './template-selection.js';

const KNOWN_RUNJS_MODEL_USES = new Set(RUNJS_MODEL_USES);

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
  return getRunJSFallbackRuntimeModel(surface);
}

function shouldRunRunJSPreflight({ model, surface }) {
  return Boolean(normalizeText(surface) || KNOWN_RUNJS_MODEL_USES.has(normalizeText(model)));
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

function mapCanonicalizeUnresolvedToPolicyIssue(issue) {
  return {
    type: 'policy',
    severity: 'error',
    ruleId: issue.code,
    message: issue.message,
    ...(issue.line || issue.column
      ? {
          location: {
            ...(issue.line ? { line: issue.line } : {}),
            ...(issue.column ? { column: issue.column } : {}),
          },
        }
      : {}),
    ...(issue.details ? { details: issue.details } : {}),
  };
}

function dedupeIssues(issues) {
  const seen = new Set();
  const output = [];
  for (const issue of issues) {
    const key = [
      issue.type || '',
      issue.severity || '',
      issue.ruleId || '',
      issue.message || '',
      issue.location?.line || '',
      issue.location?.column || '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(issue);
  }
  return output;
}

function mergePolicyIssues(...groups) {
  return sortIssues(dedupeIssues(groups.flat().filter(Boolean)));
}

function createRunJSInspectionSummary({ inspection, canonicalization }) {
  const blockerCount = inspection?.blockers?.length || 0;
  const warningCount = inspection?.warnings?.length || 0;
  const semanticBlockerCount = canonicalization?.semantic?.blockerCount ?? inspection?.execution?.semanticBlockerCount ?? 0;
  const semanticWarningCount = canonicalization?.semantic?.warningCount ?? inspection?.execution?.semanticWarningCount ?? warningCount;
  const autoRewriteCount = canonicalization?.semantic?.autoRewriteCount ?? inspection?.execution?.autoRewriteCount ?? 0;
  return {
    ok: Boolean(inspection?.ok) && (canonicalization ? Boolean(canonicalization.ok) : true),
    blockerCount,
    warningCount,
    semanticBlockerCount,
    semanticWarningCount,
    autoRewriteCount,
    hasAutoRewrite: autoRewriteCount > 0,
    contractSource: inspection?.contractSource,
    inspectedSurface: inspection?.inspectedNode?.surface || null,
    inspectedModelUse: inspection?.inspectedNode?.modelUse || null,
  };
}

function withRunJSInspection(result, runjsInspection, extraPolicyIssues = []) {
  return {
    ...result,
    policyIssues: mergePolicyIssues(result.policyIssues || [], extraPolicyIssues),
    execution: {
      ...(result.execution || {}),
      runjsInspection,
    },
  };
}

function createRunJSGuardFailureResult({ task, runtimeModel, inspection, canonicalization = null }) {
  const runjsInspection = createRunJSInspectionSummary({
    inspection,
    canonicalization,
  });
  return {
    validatorType: VALIDATOR_TYPE,
    model: runtimeModel || String(task.model || ''),
    ...(task.surface ? { surface: task.surface } : {}),
    version: task.version || 'compat',
    ok: false,
    syntaxIssues: [],
    contextIssues: [],
    policyIssues: mergePolicyIssues(
      (inspection.blockers || []).map(mapRunJSFindingToPolicyIssue),
      (inspection.warnings || []).map(mapRunJSFindingToPolicyIssue),
      canonicalization?.ok === false
        ? (canonicalization.unresolved || []).map(mapCanonicalizeUnresolvedToPolicyIssue)
        : [],
    ),
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
      runjsInspection,
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
  const normalizedModel = normalizeText(model);
  const normalizedSurface = normalizeText(surface);
  const runtimeModel = resolveRuntimeModel({ model: normalizedModel, surface: normalizedSurface });
  if (!shouldRunRunJSPreflight({ model: normalizedModel, surface: normalizedSurface })) {
    return runTask({
      model: runtimeModel || normalizedModel,
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

  const inspection = inspectRunJSStaticCode({
    code,
    modelUse: normalizedModel || null,
    surface: normalizedSurface || null,
    version,
    snapshotPath,
    path: filename || '$',
  });
  if (!inspection.ok) {
    return createRunJSGuardFailureResult({
      task: { model: normalizedModel, surface: normalizedSurface, version, skillMode, timeoutMs },
      runtimeModel,
      inspection,
    });
  }

  const canonicalized = canonicalizeRunJSCode({
    code,
    modelUse: inspection.policy?.modelUse || runtimeModel || normalizedModel || 'JSBlockModel',
    findingModelUse: inspection.policy?.findingModelUse || normalizedModel || normalizedSurface || runtimeModel,
    version,
    path: filename || '$',
  });
  if (!canonicalized.ok) {
    return createRunJSGuardFailureResult({
      task: { model: normalizedModel, surface: normalizedSurface, version, skillMode, timeoutMs },
      runtimeModel,
      inspection,
      canonicalization: canonicalized,
    });
  }

  const runjsInspection = createRunJSInspectionSummary({
    inspection,
    canonicalization: canonicalized,
  });
  const runtimeResult = await runTask({
    model: runtimeModel || normalizedModel,
    surface: normalizedSurface || undefined,
    code: canonicalized.code,
    context,
    network,
    skillMode,
    version,
    timeoutMs,
    filename,
  });
  return withRunJSInspection(
    runtimeResult,
    runjsInspection,
    (inspection.warnings || []).map(mapRunJSFindingToPolicyIssue),
  );
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
