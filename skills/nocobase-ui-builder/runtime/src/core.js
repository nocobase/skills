import vm from 'node:vm';
import { analyzeContextUsage, compileUserCode, createBareCompatAccessIssue } from './analysis.js';
import { DEFAULT_TIMEOUT_MS, VALIDATOR_TYPE } from './constants.js';
import { createPreviewEnvironment, normalizeRuntimeError } from './context.js';
import { describeProfile, findProfile } from './profiles.js';
import { sortIssues, toSerializable } from './utils.js';

function buildWrappedCode(code) {
  return `(async () => {\n${code}\n})()`;
}

function createPreviewState(mode) {
  if (mode !== 'preview') return undefined;
  return {
    rendered: false,
    html: '',
    text: '',
    renderCount: 0,
    degraded: false,
    fidelity: 'unsupported',
  };
}

function normalizeExecutionIssue(error, described) {
  if (described?.enforceCtxQualifiedAccess && error?.name === 'ReferenceError') {
    const match = /^([A-Za-z_$][\w$]*) is not defined$/.exec(String(error.message || '').trim());
    if (match) {
      const missingName = match[1];
      if (described.availableContextKeys.includes(missingName) && !described.topLevelAliases.includes(missingName)) {
        return createBareCompatAccessIssue(described, missingName);
      }
    }
  }
  return normalizeRuntimeError(error);
}

function hasError(issues) {
  return (issues || []).some((issue) => issue.severity === 'error');
}

function createBaseResult({
  task,
  described,
  syntaxIssues = [],
  contextIssues = [],
  policyIssues = [],
  runtimeIssues = [],
  logs = [],
  sideEffectAttempts = [],
  execution = {},
  usedContextPaths = [],
  preview,
}) {
  return {
    validatorType: VALIDATOR_TYPE,
    compatProfileVersion: described?.compatProfileVersion,
    model: described?.model || String(task.model || ''),
    version: task.version || 'compat',
    ok: !hasError(syntaxIssues) && !hasError(contextIssues) && !hasError(policyIssues) && !hasError(runtimeIssues),
    syntaxIssues,
    contextIssues,
    policyIssues,
    runtimeIssues,
    logs,
    sideEffectAttempts,
    execution: {
      mode: task.mode || 'validate',
      model: described?.model || String(task.model || ''),
      executed: false,
      ...execution,
    },
    availableContextKeys: described?.availableContextKeys || [],
    topLevelAliases: described?.topLevelAliases || [],
    usedContextPaths,
    preview,
  };
}

export async function executeTaskLocal(task) {
  const profile = findProfile(task.model);
  if (!profile) {
    return createBaseResult({
      task,
      described: null,
      runtimeIssues: [
        {
          type: 'runtime',
          severity: 'error',
          ruleId: 'unknown-model',
          message: `Unknown model "${task.model}".`,
        },
      ],
      preview: createPreviewState(task.mode),
    });
  }

  const described = describeProfile(profile);
  const usage = analyzeContextUsage(task.code, profile);
  const compiled = compileUserCode(task.code);
  const syntaxIssues = sortIssues([...usage.syntaxIssues, ...compiled.compileIssues]);
  const contextIssues = sortIssues(usage.contextIssues);
  const policyIssues = sortIssues(usage.policyIssues || []);
  if (hasError(syntaxIssues) || hasError(contextIssues) || hasError(policyIssues)) {
    return createBaseResult({
      task,
      described,
      syntaxIssues,
      contextIssues,
      policyIssues,
      execution: {
        executed: false,
      },
      usedContextPaths: usage.usedContextPaths,
      preview: createPreviewState(task.mode),
    });
  }

  const environment = createPreviewEnvironment(profile, task.mode || 'validate', task.context || {}, task.network);
  const executionContextIssues = [];
  const sandboxBase = {
    ctx: environment.ctx,
    ...environment.sandboxGlobals,
  };

  for (const alias of described.topLevelAliases) {
    if (alias === 'ctx') continue;
    Object.defineProperty(sandboxBase, alias, {
      enumerable: true,
      configurable: true,
      get() {
        const source = Object.prototype.hasOwnProperty.call(environment.ctx, alias)
          ? environment.ctx[alias]
          : environment.sandboxGlobals[alias];
        return typeof source === 'function' ? source.bind(environment.ctx) : source;
      },
      set(nextValue) {
        if (Object.prototype.hasOwnProperty.call(environment.ctx, alias)) {
          environment.ctx[alias] = nextValue;
        }
      },
    });
  }

  const sandbox = vm.createContext(sandboxBase);

  let finalized = null;
  try {
    const script = new vm.Script(buildWrappedCode(compiled.code), {
      filename: task.filename || `${described.model}.runjs.js`,
    });
    environment.state.execution.timeoutMs = task.timeoutMs || DEFAULT_TIMEOUT_MS;
    environment.state.execution.executed = true;
    const result = await script.runInContext(sandbox, {
      timeout: task.timeoutMs || DEFAULT_TIMEOUT_MS,
    });
    environment.state.execution.returnValue = toSerializable(result);

    if (
      task.mode === 'preview' &&
      !described.requireExplicitCtxRender &&
      !environment.state.preview.rendered &&
      typeof result !== 'undefined'
    ) {
      try {
        await environment.ctx.render(result);
      } catch (error) {
        const issue = normalizeExecutionIssue(error, described);
        if (issue.type === 'context') executionContextIssues.push(issue);
        else environment.state.runtimeIssues.push(issue);
      }
    }
  } catch (error) {
    const issue = normalizeExecutionIssue(error, described);
    if (issue.type === 'context') executionContextIssues.push(issue);
    else environment.state.runtimeIssues.push(issue);
  }

  try {
    finalized = await environment.finalize();
  } catch (error) {
    environment.state.runtimeIssues.push(normalizeRuntimeError(error));
    finalized = environment.state;
  }
  const runtimeIssues = sortIssues(finalized.runtimeIssues);
  return createBaseResult({
    task,
    described,
    syntaxIssues,
    contextIssues: sortIssues([...contextIssues, ...executionContextIssues]),
    policyIssues,
    runtimeIssues,
    logs: finalized.logs,
    sideEffectAttempts: finalized.sideEffectAttempts,
    execution: finalized.execution,
    usedContextPaths: usage.usedContextPaths,
    preview: task.mode === 'preview' ? finalized.preview : undefined,
  });
}
