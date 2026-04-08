import { Worker } from 'node:worker_threads';
import { DEFAULT_TIMEOUT_MS, VALIDATOR_TYPE } from './constants.js';

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
      mode: 'validate',
      model: String(task.model || ''),
      executed: false,
      timeoutMs: task.timeoutMs || DEFAULT_TIMEOUT_MS,
      ...execution,
    },
    availableContextKeys: [],
    topLevelAliases: [],
    usedContextPaths: [],
  };
}

export function runTask(task) {
  return new Promise((resolve) => {
    const timeoutMs = task.timeoutMs || DEFAULT_TIMEOUT_MS;
    const worker = new Worker(new URL('./sandbox-worker.js', import.meta.url), {
      type: 'module',
      execArgv: [],
      workerData: task,
    });

    let settled = false;
    let timedOut = false;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(async () => {
      timedOut = true;
      try {
        await worker.terminate();
      } catch {
        // best-effort termination
      }
      settle(createWorkerFailureResult(task, 'timeout', `Task timed out after ${timeoutMs}ms.`, { executed: true, terminated: true }));
    }, timeoutMs);

    worker.on('message', async (message) => {
      if (message?.type !== 'result') return;
      settle(message.result);
      try {
        await worker.terminate();
      } catch {
        // worker may have exited already
      }
    });

    worker.on('error', (error) => {
      settle(createWorkerFailureResult(task, 'worker-failed', error?.message || String(error)));
    });

    worker.on('exit', (code) => {
      if (settled || timedOut) return;
      settle(
        createWorkerFailureResult(
          task,
          'worker-exit',
          code === 0 ? 'Worker exited before returning a result.' : `Worker exited with code ${code}.`,
          { exitCode: code },
        ),
      );
    });
  });
}
