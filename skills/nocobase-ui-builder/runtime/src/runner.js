import { Worker } from 'node:worker_threads';
import { DEFAULT_TIMEOUT_MS, VALIDATOR_TYPE } from './constants.js';

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

export function createWorkerFailureResult(task, ruleId, message, execution = {}) {
  return {
    validatorType: VALIDATOR_TYPE,
    ok: false,
    model: String(task.model || ''),
    version: task.version || 'compat',
    syntaxIssues: [],
    contextIssues: [],
    policyIssues: [],
    runtimeIssues: [
      {
        type: 'runtime',
        severity: 'error',
        ruleId,
        message,
      },
    ],
    logs: [],
    sideEffectAttempts: [],
    execution: {
      mode: task.mode || 'validate',
      model: String(task.model || ''),
      executed: false,
      timeoutMs: task.timeoutMs || DEFAULT_TIMEOUT_MS,
      ...execution,
    },
    availableContextKeys: [],
    topLevelAliases: [],
    usedContextPaths: [],
    preview: createPreviewState(task.mode),
  };
}

export function runTask(task) {
  return new Promise((resolve) => {
    const timeoutMs = task.timeoutMs || DEFAULT_TIMEOUT_MS;
    const worker = new Worker(new URL('./sandbox-worker.js', import.meta.url), {
      type: 'module',
      workerData: task,
    });
    let settled = false;

    const settle = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(async () => {
      await worker.terminate();
      settle(() =>
        resolve(createWorkerFailureResult(task, 'timeout', `Task timed out after ${timeoutMs}ms.`, { executed: true, terminated: true })),
      );
    }, timeoutMs + 100);

    worker.on('message', (message) => {
      if (message?.type !== 'result') return;
      settle(() => resolve(message.result));
    });

    worker.on('error', (error) => {
      settle(() => resolve(createWorkerFailureResult(task, 'worker-failed', error?.message || String(error))));
    });

    worker.on('exit', (code) => {
      if (settled) return;
      settle(() =>
        resolve(
          createWorkerFailureResult(
            task,
            'worker-exit',
            code === 0 ? 'Worker exited before returning a result.' : `Worker exited with code ${code}.`,
            { exitCode: code },
          ),
        ),
      );
    });
  });
}
