import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildPromptRoutingEvaluation,
  loadActiveCodexProviderConfig,
  loadPromptRoutingCases,
  runPromptRoutingEvaluation,
  validatePromptRoutingResult,
} from '../src/prompt-routing-eval.js';

test('live evaluation resolves only the active model provider contract from Codex config', () => {
  const fixtureDirectory = mkdtempSync(path.join(os.tmpdir(), 'prompt-routing-provider-test-'));
  writeFileSync(
    path.join(fixtureDirectory, 'config.toml'),
    [
      'model_provider = "fixture-provider"',
      'model = "unrelated-model"',
      '',
      '[model_providers.fixture-provider]',
      'name = "Fixture Provider"',
      'base_url = "https://provider.invalid/v1"',
      'wire_api = "responses"',
      'requires_openai_auth = false',
      'experimental_bearer_token = "fixture-secret"',
      '',
      '[features]',
      'multi_agent = true',
    ].join('\n')
  );

  try {
    assert.deepEqual(loadActiveCodexProviderConfig({ codexHome: fixtureDirectory }), {
      provider: 'fixture-provider',
      name: 'Fixture Provider',
      baseUrl: 'https://provider.invalid/v1',
      wireApi: 'responses',
      requiresOpenAIAuth: false,
      token: 'fixture-secret',
    });
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('live evaluation prompt loads the actual Skill, default prompt, router, and routing requests', () => {
  const cases = loadPromptRoutingCases();
  const prompt = buildPromptRoutingEvaluation({ cases });

  assert.deepEqual(
    cases.map((entry) => entry.expectedRoute),
    ['js-template', 'inline-runjs', 'nocobase-plugin', 'ui-template', 'nocobase-plugin', 'inline-runjs']
  );
  for (const entry of cases) {
    assert.match(entry.id, /^case-\d+$/);
    assert.doesNotMatch(entry.id, /host|inline|ui|template|shared|server|plugin/i);
  }
  assert.match(prompt, /<SKILL_MD>[\s\S]*# Goal[\s\S]*<\/SKILL_MD>/);
  assert.match(prompt, /<OPENAI_DEFAULT_PROMPT>[\s\S]*Four-way gate:[\s\S]*<\/OPENAI_DEFAULT_PROMPT>/);
  assert.match(prompt, /<JS_TEMPLATE_ROUTER>[\s\S]*# JS Template source[\s\S]*<\/JS_TEMPLATE_ROUTER>/);
  assert.doesNotMatch(prompt, /expectedRoute/);
  for (const entry of cases) {
    assert.match(prompt, new RegExp(entry.id));
    assert.match(prompt, new RegExp(entry.request.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('live evaluation result validation accepts exact routes in any result order', () => {
  const cases = loadPromptRoutingCases();
  const results = cases.map((entry) => ({ caseId: entry.id, route: entry.expectedRoute })).reverse();

  assert.deepEqual(validatePromptRoutingResult({ results }, cases), [
    { caseId: 'case-17', route: 'js-template' },
    { caseId: 'case-42', route: 'inline-runjs' },
    { caseId: 'case-08', route: 'nocobase-plugin' },
    { caseId: 'case-31', route: 'ui-template' },
    { caseId: 'case-64', route: 'nocobase-plugin' },
    { caseId: 'case-05', route: 'inline-runjs' },
  ]);
});

test('live evaluation result validation rejects a wrong route or duplicate case', () => {
  const cases = loadPromptRoutingCases();
  const results = cases.map((entry) => ({
    caseId: entry.id,
    route: entry.expectedRoute,
  }));

  assert.throws(
    () =>
      validatePromptRoutingResult(
        {
          results: results.map((entry, index) => (index === 0 ? { ...entry, route: 'inline-runjs' } : entry)),
        },
        cases
      ),
    /case-17: expected js-template, received inline-runjs/
  );
  assert.throws(
    () =>
      validatePromptRoutingResult(
        {
          results: [results[0], results[0], results[2], results[3], results[4], results[5]],
        },
        cases
      ),
    /duplicate case case-17/
  );
});

test('live evaluation invokes Codex from an isolated directory without exposing expected routes', () => {
  const fixtureDirectory = mkdtempSync(path.join(os.tmpdir(), 'prompt-routing-eval-test-'));
  const fakeCodexPath = path.join(fixtureDirectory, 'fake-codex.mjs');
  const invocationPath = path.join(fixtureDirectory, 'invocation.json');
  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const prompt = readFileSync(0, 'utf8');
const outputPath = args[args.indexOf('--output-last-message') + 1];
writeFileSync(${JSON.stringify(invocationPath)}, JSON.stringify({
  args,
  cwd: process.cwd(),
  leakedParentSentinel: process.env.PROMPT_ROUTING_PARENT_SENTINEL,
  providerTokenPresent: Boolean(process.env.PROMPT_ROUTING_PROVIDER_TOKEN),
  openAiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
  azureOpenAiKeyPresent: Boolean(process.env.AZURE_OPENAI_API_KEY),
  prompt
}));
writeFileSync(outputPath, JSON.stringify({
  results: [
    { caseId: 'case-17', route: 'js-template' },
    { caseId: 'case-42', route: 'inline-runjs' },
    { caseId: 'case-08', route: 'nocobase-plugin' },
    { caseId: 'case-31', route: 'ui-template' },
    { caseId: 'case-64', route: 'nocobase-plugin' },
    { caseId: 'case-05', route: 'inline-runjs' }
  ]
}));
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'fixture-thread' }));
console.log(JSON.stringify({ type: 'turn.started' }));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'fixture' } }));
console.log(JSON.stringify({ type: 'turn.completed', usage: {} }));
`,
    { mode: 0o755 }
  );

  const previousParentSentinel = process.env.PROMPT_ROUTING_PARENT_SENTINEL;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousAzureOpenAiKey = process.env.AZURE_OPENAI_API_KEY;
  process.env.PROMPT_ROUTING_PARENT_SENTINEL = 'must-not-leak';
  process.env.OPENAI_API_KEY = 'unrelated-openai-key';
  process.env.AZURE_OPENAI_API_KEY = 'unrelated-azure-key';
  try {
    const evaluation = runPromptRoutingEvaluation({
      attempts: 1,
      codexBin: fakeCodexPath,
      providerConfig: {
        provider: 'fixture-provider',
        name: 'Fixture Provider',
        baseUrl: 'https://provider.invalid/v1',
        wireApi: 'responses',
        requiresOpenAIAuth: false,
        token: 'fixture-secret',
      },
    });
    assert.equal(evaluation.results.length, 6);
    assert.equal(evaluation.attempts, 1);
    assert.equal(evaluation.model, 'gpt-5.6-sol');
    assert.equal(evaluation.reasoningEffort, 'low');
    const invocation = JSON.parse(readFileSync(invocationPath, 'utf8'));
    const workingDirectory = invocation.args[invocation.args.indexOf('--cd') + 1];
    assert.equal(invocation.args.includes('--ignore-user-config'), true);
    assert.equal(invocation.args.includes('--ignore-rules'), true);
    assert.equal(invocation.args.includes('--skip-git-repo-check'), true);
    assert.equal(invocation.args[invocation.args.indexOf('--model') + 1], 'gpt-5.6-sol');
    assert.equal(invocation.args[invocation.args.indexOf('--config') + 1], 'model_reasoning_effort="low"');
    assert.match(path.basename(workingDirectory), /^nocobase-prompt-routing-/);
    assert.notEqual(workingDirectory, path.resolve('skills/nocobase-ui-builder'));
    assert.equal(invocation.cwd, workingDirectory);
    assert.equal(invocation.leakedParentSentinel, undefined);
    assert.equal(invocation.providerTokenPresent, true);
    assert.equal(invocation.openAiKeyPresent, false);
    assert.equal(invocation.azureOpenAiKeyPresent, false);
    assert.equal(JSON.stringify(invocation.args).includes('fixture-secret'), false);
    assert.equal(invocation.args.includes('model_provider="fixture-provider"'), true);
    assert.equal(
      invocation.args.includes('model_providers.fixture-provider.env_key="PROMPT_ROUTING_PROVIDER_TOKEN"'),
      true
    );
    const schemaPath = invocation.args[invocation.args.indexOf('--output-schema') + 1];
    assert.equal(path.dirname(schemaPath), workingDirectory);
    assert.equal(schemaPath.includes(`${path.sep}runtime${path.sep}evals${path.sep}`), false);
    assert.equal(invocation.args.includes('--json'), true);
    assert.doesNotMatch(invocation.prompt, /expectedRoute/);
  } finally {
    if (previousParentSentinel === undefined) {
      delete process.env.PROMPT_ROUTING_PARENT_SENTINEL;
    } else {
      process.env.PROMPT_ROUTING_PARENT_SENTINEL = previousParentSentinel;
    }
    if (previousOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
    if (previousAzureOpenAiKey === undefined) {
      delete process.env.AZURE_OPENAI_API_KEY;
    } else {
      process.env.AZURE_OPENAI_API_KEY = previousAzureOpenAiKey;
    }
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('live evaluation rejects audited tool activity', () => {
  const fixtureDirectory = mkdtempSync(path.join(os.tmpdir(), 'prompt-routing-tool-audit-test-'));
  const fakeCodexPath = path.join(fixtureDirectory, 'fake-codex.mjs');
  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const outputPath = args[args.indexOf('--output-last-message') + 1];
writeFileSync(outputPath, JSON.stringify({ results: [] }));
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'fixture-thread' }));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'find ..' } }));
console.log(JSON.stringify({ type: 'turn.completed', usage: {} }));
`,
    { mode: 0o755 }
  );

  try {
    assert.throws(
      () =>
        runPromptRoutingEvaluation({
          attempts: 1,
          codexBin: fakeCodexPath,
          providerConfig: {
            provider: 'fixture-provider',
            name: 'Fixture Provider',
            baseUrl: 'https://provider.invalid/v1',
            wireApi: 'responses',
            requiresOpenAIAuth: false,
          },
        }),
      /used prohibited tool activity: command_execution/
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('live evaluation redacts every credential passed to a failing child', () => {
  const fixtureDirectory = mkdtempSync(path.join(os.tmpdir(), 'prompt-routing-redaction-test-'));
  const fakeCodexPath = path.join(fixtureDirectory, 'fake-codex.mjs');
  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env node
console.error('provider=' + process.env.PROMPT_ROUTING_PROVIDER_TOKEN);
process.exitCode = 23;
`,
    { mode: 0o755 }
  );

  try {
    assert.throws(
      () =>
        runPromptRoutingEvaluation({
          attempts: 1,
          codexBin: fakeCodexPath,
          providerConfig: {
            provider: 'fixture-provider',
            name: 'Fixture Provider',
            baseUrl: 'https://provider.invalid/v1',
            wireApi: 'responses',
            requiresOpenAIAuth: false,
            token: 'plain-fixture-credential',
          },
        }),
      (error) => {
        assert.match(error.message, /provider=\[REDACTED\]/);
        assert.doesNotMatch(error.message, /plain-fixture-credential/);
        return true;
      }
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
