import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { readYamlScalar } from './helpers/yaml-scalar.js';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

test('keeps routing deterministic and narrows DSL handoff', () => {
  const skill = read('SKILL.md');
  const source = read('references/js-template-source.md');

  const routeContracts = [
    skill.split('\n').find((line) => line.startsWith('- Apply one ordered four-way solution gate')),
    source.match(/Apply this ordered gate[\s\S]*?(?=\n\nUI Template)/)?.[0],
  ];
  for (const text of routeContracts) {
    assert.ok(text, 'should expose an ordered route contract');
    const orderedMarkers = ['backend API', 'explicitly asks', 'UI Template', 'one Host exclusively'];
    const normalized = text.toLowerCase();
    const positions = orderedMarkers.map((marker) => normalized.indexOf(marker.toLowerCase()));
    assert.ok(positions.every((position) => position >= 0), `missing route marker in ${orderedMarkers.join(', ')}`);
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  }
  for (const text of [skill, source]) {
    for (const nonTrigger of ['Multiple files', 'Git storage', 'vague future distribution']) {
      assert.match(text, new RegExp(nonTrigger, 'i'));
    }
  }

  assert.match(skill, /explicitly asks to author or reconcile[\s\S]{0,80}DSL or YAML/i);
});

test('defines route-specific completion metadata', () => {
  const metadata = read('agents/openai.yaml');
  const prompt = readYamlScalar(metadata, 'default_prompt');

  for (const route of ['Inline:', 'Save as:', 'Shared edit:', 'Detach:']) {
    assert.match(prompt, new RegExp(route, 'i'));
  }
  for (const evidence of [
    'new commit and owner fingerprint',
    'runtimeVersion',
    'exact four-field binding',
    'accepted check snapshot',
    'Usage impact',
    'exact five-field request',
    'cleared selected binding/Usage',
    'unchanged other Host bindings',
  ]) {
    assert.match(prompt, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }

  assert.match(readYamlScalar(metadata, 'short_description'), /flow-surfaces/i);
  assert.match(readYamlScalar(metadata, 'short_description'), /Inline Workspaces/i);
  assert.match(readYamlScalar(metadata, 'short_description'), /JS Template/i);
  assert.match(metadata, /flow-surfaces Host\/UI[\s\S]{0,100}run-js-sources Inline Workspace[\s\S]{0,100}JS Template authoring/i);
});

test('keeps a manual corpus with eight normal and two failure prompts', () => {
  const corpus = read('references/evals/js-template-routing.md');
  const normalSection = corpus.match(/^## Normal cases\n([\s\S]*?)^## Failure cases$/m)?.[1];
  const failureSection = corpus.match(/^## Failure cases\n([\s\S]*)$/m)?.[1];
  assert.ok(normalSection, 'manual corpus should contain Normal cases');
  assert.ok(failureSection, 'manual corpus should contain Failure cases');
  assert.equal((normalSection.match(/^### Case /gm) || []).length, 8);
  assert.equal((failureSection.match(/^### Case /gm) || []).length, 2);

  const cases = corpus.split(/^### Case [^\n]+\n/gm).slice(1);
  assert.equal(cases.length, 10);
  for (const body of cases) {
    for (const field of ['Prompt', 'Expected route', 'Key reason', 'Completion evidence', 'Forbidden behavior']) {
      assert.match(body, new RegExp(`^- ${field}:`, 'm'));
    }
  }

  for (const route of [
    'inline-runjs',
    'js-template-save-as',
    'js-template-shared',
    'ui-template',
    'nocobase-plugin',
    'js-template-detach',
    'stop-capability-missing',
    'stop-unsaved-shared-edits',
  ]) {
    assert.ok(corpus.includes('Expected route: `' + route + '`'));
  }
});

test('removes live evaluator artifacts and distinguishes UI Template filenames', () => {
  const removedPaths = [
    ['runtime/bin/evaluate-', 'prompt-routing.mjs'].join(''),
    ['runtime/evals/', 'prompt-routing-cases.json'].join(''),
    ['runtime/evals/', 'prompt-routing-output.schema.json'].join(''),
    ['runtime/src/', 'prompt-routing-', 'eval.js'].join(''),
    ['runtime/tests/', 'prompt-routing-', 'eval.test.js'].join(''),
    ['references/', 'template', '-quick.md'].join(''),
    ['references/', 'templates', '.md'].join(''),
  ];
  for (const relativePath of removedPaths) {
    assert.equal(existsSync(path.join(skillRoot, relativePath)), false, `${relativePath} should be removed`);
  }
  for (const relativePath of ['references/ui-template-quick.md', 'references/ui-templates.md']) {
    assert.equal(existsSync(path.join(skillRoot, relativePath)), true, `${relativePath} should exist`);
  }
  const scripts = JSON.parse(read('runtime/package.json')).scripts;
  assert.equal(Object.keys(scripts).includes(['test', 'prompt-routing'].join(':')), false);
});
