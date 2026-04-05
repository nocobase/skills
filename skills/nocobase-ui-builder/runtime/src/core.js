import vm from 'node:vm';
import { analyzeContextUsage, compileUserCode, createBareCompatAccessIssue } from './analysis.js';
import { DEFAULT_TIMEOUT_MS, VALIDATOR_TYPE } from './constants.js';
import { createRuntimeEnvironment, normalizeRuntimeError } from './context.js';
import { describeProfile, findProfile } from './profiles.js';
import { sortIssues, toSerializable } from './utils.js';

function buildWrappedCode(code) {
  return `(async () => {\n${code}\n})()`;
}

function normalizeJsxChildren(children) {
  const output = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      output.push(...normalizeJsxChildren(child));
      continue;
    }
    if (child == null || child === false || child === true) continue;
    output.push(child);
  }
  return output;
}

function createJsxElement(type, props, ...children) {
  const normalizedChildren = normalizeJsxChildren(children);
  const nextProps = props && typeof props === 'object' ? { ...props } : {};
  if (normalizedChildren.length === 1) {
    nextProps.children = normalizedChildren[0];
  } else if (normalizedChildren.length > 1) {
    nextProps.children = normalizedChildren;
  }
  return {
    $$typeof: Symbol.for('react.element'),
    type,
    props: nextProps,
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
      mode: 'validate',
      model: described?.model || String(task.model || ''),
      executed: false,
      ...execution,
    },
    availableContextKeys: described?.availableContextKeys || [],
    topLevelAliases: described?.topLevelAliases || [],
    usedContextPaths,
  };
}

export async function executeTaskLocal(task) {
  const profile = findProfile(task.model);
  const executionMetadata = {
    skillMode: Boolean(task.skillMode),
    networkMode: task?.network?.mode === 'live' ? 'live' : 'mock',
  };

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
      execution: executionMetadata,
    });
  }

  const described = describeProfile(profile);
  const usage = analyzeContextUsage(task.code, profile);
  const compiled = compileUserCode(task.code);
  const syntaxIssues = sortIssues([...usage.syntaxIssues, ...compiled.compileIssues]);
  const contextIssues = sortIssues(usage.contextIssues);
  const policyIssues = sortIssues([
    ...(usage.policyIssues || []),
    ...(task.skillMode && task?.network?.mode === 'live'
      ? [
          {
            type: 'policy',
            severity: 'error',
            ruleId: 'blocked-skill-live-network',
            message: 'Skill mode blocks live network configuration. Use mock responses instead.',
          },
        ]
      : []),
  ]);

  if (hasError(syntaxIssues) || hasError(contextIssues) || hasError(policyIssues)) {
    return createBaseResult({
      task,
      described,
      syntaxIssues,
      contextIssues,
      policyIssues,
      execution: {
        executed: false,
        ...executionMetadata,
      },
      usedContextPaths: usage.usedContextPaths,
    });
  }

  const environment = createRuntimeEnvironment(profile, 'validate', task.context || {}, task.network, {
    skillMode: task.skillMode,
  });
  const executionContextIssues = [];
  const sandboxBase = {
    ctx: environment.ctx,
    __nbJsx: createJsxElement,
    __nbJsxFragment: 'Fragment',
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

  const sandbox = vm.createContext(sandboxBase, {
    codeGeneration: {
      strings: false,
      wasm: false,
    },
  });

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

  return createBaseResult({
    task,
    described,
    syntaxIssues,
    contextIssues: sortIssues([...contextIssues, ...executionContextIssues]),
    policyIssues,
    runtimeIssues: sortIssues(finalized.runtimeIssues),
    logs: finalized.logs,
    sideEffectAttempts: finalized.sideEffectAttempts,
    execution: finalized.execution,
    usedContextPaths: usage.usedContextPaths,
  });
}
