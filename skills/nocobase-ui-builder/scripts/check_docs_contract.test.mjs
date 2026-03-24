import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collectDocsContractFailures } from './check_docs_contract.mjs';

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createSkillFixture({
  rootJsLeafDocs = ['js-models/js-block.md'],
  jsSubindexLeafDocs = ['js-block.md', 'js-editable-field.md'],
  topLevelReferenceDocs = [],
  topLevelReferenceLinks = [],
  recipeDocs = [],
  recipeLinks = [],
  includeAgentConfig = true,
} = {}) {
  const skillRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-docs-contract-'));
  const referencesRoot = path.join(skillRoot, 'references');

  writeFile(path.join(skillRoot, 'SKILL.md'), [
    '---',
    'name: test-skill',
    'allowed-tools: All MCP tools',
    '---',
    '',
    '- [references/index.md](references/index.md)',
    '',
  ].join('\n'));

  if (includeAgentConfig) {
    writeFile(path.join(skillRoot, 'agents', 'openai.yaml'), [
      'interface:',
      '  display_name: "Test Skill"',
      '  short_description: "Fixture agent config"',
      '  default_prompt: "Use $test-skill to do the thing."',
      '',
    ].join('\n'));
  }

  writeFile(path.join(referencesRoot, 'index.md'), [
    '# Root Index',
    '',
    ...topLevelReferenceLinks.map((docPath) => `- [${path.basename(docPath, '.md')}](${docPath})`),
    '- [js-models/index.md](js-models/index.md)',
    ...rootJsLeafDocs.map((docPath) => `- [${path.basename(docPath, '.md')}](${docPath})`),
    ...recipeLinks.map((docPath) => `- [${path.basename(docPath, '.md')}](${docPath})`),
    '',
  ].join('\n'));

  writeFile(path.join(referencesRoot, 'js-models', 'index.md'), [
    '# JS Models',
    '',
    ...jsSubindexLeafDocs.map((docPath) => `- [${path.basename(docPath, '.md')}](${docPath})`),
    '',
  ].join('\n'));

  for (const docPath of jsSubindexLeafDocs) {
    writeFile(path.join(referencesRoot, 'js-models', docPath), `# ${docPath}\n`);
  }

  for (const docPath of topLevelReferenceDocs) {
    writeFile(path.join(referencesRoot, docPath), `# ${docPath}\n`);
  }

  for (const docPath of recipeDocs) {
    writeFile(path.join(referencesRoot, docPath), `# ${docPath}\n`);
  }

  return skillRoot;
}

test('collectDocsContractFailures reports root index entries missing from a mirrored subindex', () => {
  const skillRoot = createSkillFixture({
    rootJsLeafDocs: ['js-models/js-block.md'],
    jsSubindexLeafDocs: ['js-block.md', 'js-editable-field.md'],
  });

  const failures = collectDocsContractFailures({ skillRoot });

  assert.deepEqual(failures, [
    'references/index.md is missing leaf doc listed by references/js-models/index.md: references/js-models/js-editable-field.md',
  ]);
});

test('collectDocsContractFailures passes when root index mirrors the leaf docs listed by subindex', () => {
  const skillRoot = createSkillFixture({
    rootJsLeafDocs: ['js-models/js-block.md', 'js-models/js-editable-field.md'],
    jsSubindexLeafDocs: ['js-block.md', 'js-editable-field.md'],
  });

  const failures = collectDocsContractFailures({ skillRoot });

  assert.deepEqual(failures, []);
});

test('collectDocsContractFailures still requires top-level reference docs to be directly linked from root docs', () => {
  const skillRoot = createSkillFixture({
    rootJsLeafDocs: ['js-models/js-block.md', 'js-models/js-editable-field.md'],
    jsSubindexLeafDocs: ['js-block.md', 'js-editable-field.md'],
    topLevelReferenceDocs: ['validation.md'],
    topLevelReferenceLinks: [],
  });

  const failures = collectDocsContractFailures({ skillRoot });

  assert.deepEqual(failures, [
    'Top-level reference doc is not directly linked from SKILL.md or references/index.md: references/validation.md',
  ]);
});

test('collectDocsContractFailures requires recipe docs to be directly linked from root docs', () => {
  const skillRoot = createSkillFixture({
    rootJsLeafDocs: ['js-models/js-block.md', 'js-models/js-editable-field.md'],
    jsSubindexLeafDocs: ['js-block.md', 'js-editable-field.md'],
    recipeDocs: ['recipes/page-lifecycle.md'],
    recipeLinks: [],
  });

  const failures = collectDocsContractFailures({ skillRoot });

  assert.deepEqual(failures, [
    'Reference doc is not directly linked from SKILL.md or references/index.md: references/recipes/page-lifecycle.md',
  ]);
});

test('collectDocsContractFailures requires agents/openai.yaml to exist', () => {
  const skillRoot = createSkillFixture({
    rootJsLeafDocs: ['js-models/js-block.md', 'js-models/js-editable-field.md'],
    jsSubindexLeafDocs: ['js-block.md', 'js-editable-field.md'],
    includeAgentConfig: false,
  });

  const failures = collectDocsContractFailures({ skillRoot });

  assert.deepEqual(failures, [
    'Missing agent config: agents/openai.yaml',
  ]);
});
