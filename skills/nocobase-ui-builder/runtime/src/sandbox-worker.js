import { parentPort, workerData } from 'node:worker_threads';
import { executeTaskLocal } from './core.js';
import { createWorkerFailureResult } from './runner.js';

const keepAlive = setInterval(() => {}, 1000);

function postResult(result) {
  parentPort?.postMessage({ type: 'result', result });
}

try {
  const result = await executeTaskLocal(workerData);
  postResult(result);
} catch (error) {
  postResult(createWorkerFailureResult(workerData, 'worker-failed', error?.message || String(error)));
} finally {
  clearInterval(keepAlive);
}
