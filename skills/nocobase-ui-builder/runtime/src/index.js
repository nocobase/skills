import fs from 'node:fs/promises';
import path from 'node:path';
import { executeTaskLocal } from './core.js';
import { describeProfile, findProfile, listProfiles } from './profiles.js';
import { runTask } from './runner.js';

async function loadMaybeFile(cwd, filePath, reader) {
  if (!filePath) return undefined;
  const resolved = path.resolve(cwd, filePath);
  return reader(resolved);
}

export { listProfiles, findProfile, describeProfile };

export async function inspectRunJSContext({ model }) {
  const profile = describeProfile(model);
  if (!profile) {
    throw new Error(`Unknown model "${model}".`);
  }
  return profile;
}

export async function validateRunJSSnippet({ model, code, context, network, version, timeoutMs, filename, isolate = true }) {
  const task = {
    model,
    code,
    context,
    network,
    version,
    timeoutMs,
    filename,
    mode: 'validate',
  };
  return isolate ? runTask(task) : executeTaskLocal(task);
}

export async function previewRunJSSnippet({ model, code, context, network, version, timeoutMs, filename, isolate = true }) {
  const task = {
    model,
    code,
    context,
    network,
    version,
    timeoutMs,
    filename,
    mode: 'preview',
  };
  return isolate ? runTask(task) : executeTaskLocal(task);
}

export async function runBatch({ tasks, cwd = process.cwd(), isolate = true }) {
  const results = [];
  for (const item of tasks || []) {
    const code =
      typeof item.code === 'string'
        ? item.code
        : await loadMaybeFile(cwd, item.codeFile, async (resolved) => fs.readFile(resolved, 'utf8'));
    const context =
      typeof item.context !== 'undefined'
        ? item.context
        : await loadMaybeFile(cwd, item.contextFile, async (resolved) => JSON.parse(await fs.readFile(resolved, 'utf8')));
    const network =
      typeof item.network !== 'undefined'
        ? item.network
        : await loadMaybeFile(cwd, item.networkFile, async (resolved) => JSON.parse(await fs.readFile(resolved, 'utf8')));

    if (item.mode === 'preview') {
      results.push(
        await previewRunJSSnippet({
          model: item.model,
          code,
          context,
          network,
          version: item.version,
          timeoutMs: item.timeoutMs,
          filename: item.codeFile,
          isolate,
        }),
      );
      continue;
    }

    results.push(
      await validateRunJSSnippet({
        model: item.model,
        code,
        context,
        network,
        version: item.version,
        timeoutMs: item.timeoutMs,
        filename: item.codeFile,
        isolate,
      }),
    );
  }

  return {
    ok: results.every((item) => item.ok),
    summary: {
      total: results.length,
      passed: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      degraded: results.filter((item) => item.preview?.fidelity === 'degraded').length,
      unsupported: results.filter((item) => item.preview?.fidelity === 'unsupported').length,
      blocked: results.filter((item) =>
        [...item.policyIssues, ...item.runtimeIssues].some((issue) =>
          ['blocked-side-effect', 'blocked-static-side-effect', 'blocked-network-host', 'unmocked-network-request'].includes(
            issue.ruleId,
          ),
        ),
      ).length,
    },
    results,
  };
}
