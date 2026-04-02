import { parentPort, workerData } from 'node:worker_threads';
import { executeTaskLocal } from './core.js';
import { createWorkerFailureResult } from './runner.js';

const postResult = (payload) => {
  parentPort?.postMessage(payload);
};

try {
  const result = await executeTaskLocal(workerData);
  postResult({ type: 'result', result });
} catch (error) {
  postResult({
    type: 'result',
    result: createWorkerFailureResult(workerData, 'worker-failed', error?.message || String(error)),
  });
}
