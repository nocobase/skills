import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { readYamlScalar } from './helpers/yaml-scalar.js';
import {
  JS_TEMPLATE_OPERATION_OUTCOMES,
  parseMarkedJson,
  parseRoutingCorpus,
  productRouteFor,
} from './helpers/js-template-contract.js';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function listFilesRecursively(relativeDirectory) {
  const absoluteDirectory = path.join(skillRoot, relativeDirectory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    return entry.isDirectory() ? listFilesRecursively(relativePath) : [relativePath];
  });
}

test('keeps the four product routes and first-match priority machine-readable', () => {
  const metadata = read('agents/openai.yaml');
  const prompt = readYamlScalar(metadata, 'default_prompt');
  const contract = parseMarkedJson(prompt);
  const corpusRoutes = new Set(
    parseRoutingCorpus(read('references/evals/js-template-routing.md'))
      .map(({ route }) => productRouteFor(route))
      .filter(Boolean),
  );

  assert.deepEqual([...corpusRoutes].sort(), ['inline-runjs', 'js-template', 'nocobase-plugin', 'ui-template']);
  assert.deepEqual(contract.routes, ['nocobase-plugin', 'js-template', 'ui-template', 'inline-runjs']);
  assert.equal(contract.match, 'first');

  assert.match(readYamlScalar(metadata, 'short_description'), /flow-surfaces/i);
  assert.match(readYamlScalar(metadata, 'short_description'), /Inline Workspaces/i);
  assert.match(readYamlScalar(metadata, 'short_description'), /JS Template/i);
});

test('keeps route-specific operation outcomes as small semantic markers', () => {
  const prompt = readYamlScalar(read('agents/openai.yaml'), 'default_prompt');
  const { outcomes } = parseMarkedJson(prompt);

  assert.deepEqual(outcomes, JS_TEMPLATE_OPERATION_OUTCOMES);
});

test('keeps an extensible manual corpus with normal and failure coverage', () => {
  const corpus = read('references/evals/js-template-routing.md');
  const cases = parseRoutingCorpus(corpus);
  const normalCases = cases.filter(({ kind }) => kind === 'normal');
  const failureCases = cases.filter(({ kind }) => kind === 'failure');

  assert.ok(normalCases.length >= 8, 'manual corpus should contain at least eight normal cases');
  assert.ok(failureCases.length >= 2, 'manual corpus should contain at least two failure cases');
  assert.equal(cases.length, (corpus.match(/^###\s+Case\b[^\n]*$/gm) || []).length);

  const expandedCorpus = [
    corpus.trimEnd(),
    '',
    '### Case additional: equivalent Inline wording',
    '',
    '- Prompt: Extra manual prompt.',
    '- Expected route: `inline-runjs`',
    '- Key reason: Single Host.',
    '- Completion evidence: Machine readback.',
    '- Forbidden behavior: No route downgrade.',
    '',
  ].join('\n');
  assert.equal(parseRoutingCorpus(expandedCorpus).length, cases.length + 1);

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
    assert.ok(cases.some((entry) => entry.route === route), `manual corpus should cover ${route}`);
  }
});

test('keeps canonical JS Template documents free of legacy product contracts and live evaluator entrypoints', () => {
  const controlledDocuments = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/js-template-source.md',
    'references/js-template-transport.md',
    'references/js-template-roundtrip.md',
    'references/evals/js-template-routing.md',
  ];
  const controlledText = controlledDocuments.map((relativePath) => read(relativePath)).join('\n');
  assert.doesNotMatch(controlledText, /\bnb\s+light\b/i);
  assert.doesNotMatch(controlledText, /\blight-extension-entry\b/i);
  assert.doesNotMatch(controlledText, /^#{1,6}\s+.*\b(?:draft|publish)\b/gim);
  assert.doesNotMatch(controlledText, /\bjsTemplates:[^\s`]*(?:draft|publish)[^\s`]*/i);
  assert.doesNotMatch(controlledText, /\bnb api js-templates\s+[^\n`]*(?:draft|publish)[^\n`]*/i);
  assert.doesNotMatch(controlledText, /`(?:draftId|draftStatus|publishStatus|publishedVersion)`/i);

  for (const relativeDirectory of ['references', 'runtime/tests']) {
    const legacyFiles = listFilesRecursively(relativeDirectory).filter((relativePath) =>
      /^light-extension-/i.test(path.basename(relativePath)),
    );
    assert.deepEqual(legacyFiles, [], `${relativeDirectory} should not restore light-extension-* files`);
  }

  const evaluatorEntries = ['runtime/bin', 'runtime/evals', 'runtime/src', 'runtime/tests'].flatMap((relativeDirectory) =>
    listFilesRecursively(relativeDirectory),
  );
  assert.deepEqual(
    evaluatorEntries.filter((relativePath) => /prompt-routing|evaluate-prompt/i.test(relativePath)),
    [],
    'runtime directories should not restore prompt-routing evaluator entries',
  );

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
  assert.doesNotMatch(JSON.stringify(scripts), /evaluate[-_:]?prompt[-_:]?routing|prompt[-_:]?routing[-_:]?eval/i);
});
