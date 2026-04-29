import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { maskJavaScriptSource } from '../src/source-mask.js';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = path.resolve(skillRoot, '..', '..');

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function assertFileDoesNotContain(relativePath, pattern, message) {
  assert.doesNotMatch(read(relativePath), pattern, message || `${relativePath} should not contain ${pattern}`);
}

function readRelativeMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\]\(((?:\.\/|\.\.\/)[^)]+)\)/g)].map((match) => match[1]);
}

function readRootRelativeMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\]\((\/[^)]+)\)/g)].map((match) => match[1]);
}

function extractFirstHopSnippetIds(markdown) {
  const match = markdown.match(/First-hop safe snippets:\s*\n\s*\n((?:- \[[^\]]+\]\([^)]+\)\s*\n?)+)/i);
  assert.ok(match, 'surface doc should include a First-hop safe snippets list');
  return [...match[1].matchAll(/- \[([^\]]+)\]\([^)]+\)/g)].map((item) => item[1]);
}

function assertRelativeMarkdownLinksExist(relativePath) {
  const markdown = read(relativePath);
  const fileDir = path.dirname(path.join(skillRoot, relativePath));
  for (const linkPath of new Set(readRelativeMarkdownLinks(markdown))) {
    assert.equal(existsSync(path.resolve(fileDir, linkPath)), true, `${relativePath} -> ${linkPath} should exist`);
  }
}

function assertNoRootRelativeMarkdownLinks(relativePath) {
  const markdown = read(relativePath);
  assert.deepEqual(
    [...new Set(readRootRelativeMarkdownLinks(markdown))],
    [],
    `${relativePath} should not keep root-relative markdown links inside the local snapshot`,
  );
}

function walkMarkdownFiles(relativeDir) {
  const rootDir = path.join(skillRoot, relativeDir);
  const results = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.relative(skillRoot, fullPath));
      }
    }
  }
  return results.sort();
}

function extractFirstJsFenceAfterHeading(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^###\\s+${escaped}\\s*$([\\s\\S]*?)^\\\`\\\`\\\`js\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, 'm'));
  assert.ok(match, `should find js fence after heading "${heading}"`);
  return match[2];
}

function extractJsFenceAfterH2(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)^\\\`\\\`\\\`(?:js|javascript)\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, 'm'));
  assert.ok(match, `should find js fence after h2 "${heading}"`);
  return match[2];
}

function validateRunjsSnippet(model, code) {
  const cliPath = path.join(skillRoot, 'runtime/bin/nb-runjs.mjs');
  const result = spawnSync(process.execPath, [cliPath, 'validate', '--stdin-json', '--skill-mode'], {
    cwd: repoRoot,
    input: JSON.stringify({ model, code }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `runjs validator should exit 0 for ${model}: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, `runjs validator should accept ${model}: ${result.stdout}`);
  return parsed;
}

function assertNoDirectCtxRecordValueReads(code, label) {
  assert.doesNotMatch(
    maskJavaScriptSource(code),
    /\bctx\.record(?:\?\.|\.)/,
    `${label} should read record values with await ctx.getVar('ctx.record...')`,
  );
}

function readYamlDoubleQuotedScalar(yamlText, key) {
  const match = yamlText.match(new RegExp(`${key}: "((?:[^"\\\\]|\\\\.)*)"`, 'm'));
  assert.ok(match, `${key} should be present`);
  return JSON.parse(`"${match[1]}"`);
}

function assertPointsToTemplates(text, sourceLabel) {
  assert.match(text, /\[templates\.md\]/i, `${sourceLabel} should point to templates.md`);
}

function assertNoTemplateDecisionMatrix(text, sourceLabel) {
  assert.doesNotMatch(text, /## Decision Table/i, `${sourceLabel} should not redefine the template decision table`);
  assert.doesNotMatch(
    text,
    /## Automatic Selection Rule/i,
    `${sourceLabel} should not redefine the automatic template-selection router`,
  );
}

function assertTemplateDocMinimumContract(text, sourceLabel) {
  assert.match(text, /entire page/i, `${sourceLabel} should keep page-vs-scene boundary guidance`);
  assert.match(text, /template type/i, `${sourceLabel} should keep page-vs-scene boundary guidance`);
  assert.match(text, /`reference`/i, `${sourceLabel} should mention reference mode`);
  assert.match(text, /`copy`/i, `${sourceLabel} should mention copy mode`);
  assert.match(text, /saveMode=.*convert|save-template\(saveMode/i, `${sourceLabel} should mention convert-capable save flow`);
  assert.match(text, /conversation language/i, `${sourceLabel} should keep language-aware naming guidance`);
  assert.match(text, /description/i, `${sourceLabel} should keep description guidance`);
  assert.match(text, /name/i, `${sourceLabel} should keep name guidance`);
}

function assertContextualTemplateProbeGuardrails(text, sourceLabel) {
  assert.match(
    text,
    /repeat-eligible[\s\S]{0,260}contextual `?list-templates`?/i,
    `${sourceLabel} should require contextual list-templates for repeat-eligible scenes`,
  );
  assert.match(text, /hard gate|mandatory|must/i, `${sourceLabel} should make the contextual probe non-optional`);
  assert.match(
    text,
    /keyword-only search[\s\S]{0,80}discovery-only|loose text search alone/i,
    `${sourceLabel} should keep keyword-only search as discovery-only`,
  );
}

function assertTryTemplateWriteFallback(text, sourceLabel) {
  assert.match(text, /popup\.tryTemplate\s*=\s*true|`popup\.tryTemplate=true`|`popup\.tryTemplate`/i, `${sourceLabel} should mention popup.tryTemplate`);
  assert.match(
    text,
    /no explicit `?popup\.template`?|without `?popup\.template`?|when `?popup\.template`? is absent/i,
    `${sourceLabel} should scope popup.tryTemplate to the no-explicit-template case`,
  );
  assert.match(
    text,
    /no local popup content|no explicit local popup content|without local popup content|without inline popup content|local popup content[\s\S]{0,40}fallback|fallback[\s\S]{0,40}local popup/i,
    `${sourceLabel} should describe either the no-local-popup-content guard or the local-popup fallback`,
  );
}

function assertSaveAsTemplateWritePath(text, sourceLabel) {
  assert.match(
    text,
    /popup\.saveAsTemplate\s*=\s*\{\s*name,\s*description\s*\}|`popup\.saveAsTemplate=\{ name, description \}`|`popup\.saveAsTemplate`/i,
    `${sourceLabel} should mention popup.saveAsTemplate`,
  );
  assert.match(
    text,
    /explicit(?: local)? `?popup\.blocks`?|requires `?popup\.blocks`?|requires explicit local popup\.blocks|miss requires explicit local `?popup\.blocks`?/i,
    `${sourceLabel} should describe the popup.blocks requirement for popup.saveAsTemplate`,
  );
  assert.match(
    text,
    /cannot be combined with `?popup\.template`?/i,
    `${sourceLabel} should forbid combining popup.saveAsTemplate with popup.template`,
  );
  assert.match(
    text,
    /combined with `?popup\.tryTemplate`?|if `?popup\.saveAsTemplate`? is also provided|a hit reuses the matched template directly|hit binds the matched template/i,
    `${sourceLabel} should describe popup.saveAsTemplate coexistence with popup.tryTemplate`,
  );
}

function assertExistingReferenceEditMatrix(text, sourceLabel) {
  assert.match(text, /Existing-reference Edit Routing/i, `${sourceLabel} should define existing-reference edit routing`);
  for (const outcome of ['edit-template-source', 'edit-host-local-config', 'switch-template-reference', 'detach-to-copy']) {
    assert.match(text, new RegExp(outcome, 'i'), `${sourceLabel} should include ${outcome}`);
  }
  assert.match(text, /template-owned content/i, `${sourceLabel} should define template-owned content`);
  assert.match(text, /Host-local defaults/i, `${sourceLabel} should define host-local defaults`);
  assert.match(text, /does \*\*not\*\* decide localized existing-reference edit routing|does not decide localized existing-reference edit routing/i, `${sourceLabel} should keep helper scope explicit`);
  assert.match(
    text,
    /page-scoped wording[\s\S]{0,160}(?:not local-only intent|mean local-only behavior)|this page[\s\S]{0,80}not local-only|direct page URL[\s\S]{0,160}(?:not local-only intent|mean local-only behavior)/i,
    `${sourceLabel} should say page-scoped wording does not imply local-only intent`,
  );
  assert.match(
    text,
    /do not use `?copy` as a safety fallback|stop and clarify instead of auto-detaching|clarify instead of auto-detaching/i,
    `${sourceLabel} should forbid auto-copy fallback for existing references`,
  );
}

function assertExistingReferenceRoutingBridge(text, sourceLabel) {
  assertPointsToTemplates(text, sourceLabel);
  assert.match(text, /template[- ]source/i, `${sourceLabel} should mention template-source edits`);
  assert.match(
    text,
    /page-scoped wording[\s\S]{0,160}(?:not|mean)|page wording[\s\S]{0,120}(?:not|mean)|explicit local-only|do not default to `?copy`?|do not auto-detach|ask, not `?copy`?/i,
    `${sourceLabel} should keep the no-auto-copy bridge visible`,
  );
}

function assertExistingReferenceReadbackBridge(text, sourceLabel) {
  assertPointsToTemplates(text, sourceLabel);
  assert.match(text, /template[- ]source/i, `${sourceLabel} should keep template-source readback visible`);
}

function assertSkillKeepsTemplateRulesMinimal(text) {
  assertPointsToTemplates(text, 'SKILL.md');
  assertNoTemplateDecisionMatrix(text, 'SKILL.md');
  assert.match(text, /existing template reference/i, 'SKILL.md should keep the top-level existing-reference rule');
  assert.match(text, /template source/i, 'SKILL.md should keep template-source editing visible');
  assert.match(text, /host\/openView config edits local|host-local/i, 'SKILL.md should keep host-local boundary visible');
  assert.match(
    text,
    /page-scoped wording[\s\S]{0,160}(?:not local-only intent|mean local-only behavior)/i,
    'SKILL.md should say page-scoped wording is not enough for local-only routing',
  );
  assert.match(
    text,
    /clarify before writing|do not auto-detach/i,
    'SKILL.md should block automatic detach on unresolved existing-reference scope',
  );
  assert.match(
    text,
    /record[\s\S]{0,160}template-owned[\s\S]{0,180}host\/openView[\s\S]{0,120}separately/i,
    'SKILL.md should require separate template-owned and host/openView routing records',
  );
  assert.match(
    text,
    /templateOwnedContentRoute[\s\S]{0,160}hostOpenViewConfigRoute/i,
    'SKILL.md should name the artifact fields for template-owned and host/openView routing',
  );
  assert.doesNotMatch(text, /popup\.tryTemplate/i, 'SKILL.md should not restate popup.tryTemplate details');
  assert.doesNotMatch(text, /popup\.saveAsTemplate/i, 'SKILL.md should not restate popup.saveAsTemplate details');
  assert.doesNotMatch(text, /keyword-only search/i, 'SKILL.md should not restate template search heuristics');
  assert.doesNotMatch(text, /backend returned order|stable best-candidate/i, 'SKILL.md should not restate template ranking heuristics');
}

function assertSkillKeepsIntentFirst(text) {
  assert.match(text, /intent-first/i, 'SKILL.md should keep intent-first routing visible');
  assert.match(
    text,
    /whole-page authoring[\s\S]{0,160}`applyBlueprint`[\s\S]{0,120}\[whole-page-quick\.md\]/i,
    'SKILL.md should route whole-page authoring through applyBlueprint and whole-page-quick.md',
  );
  assert.match(
    text,
    /localized existing-surface edits[\s\S]{0,160}(?:low-level )?`flow-surfaces`[\s\S]{0,120}\[local-edit-quick\.md\]/i,
    'SKILL.md should route localized edits through low-level flow-surfaces commands and local-edit-quick.md',
  );
  assert.match(
    text,
    /localized existing-surface reaction work[\s\S]{0,160}`get-reaction-meta`[\s\S]{0,120}`set\*Rules`[\s\S]{0,120}\[reaction-quick\.md\]/i,
    'SKILL.md should keep localized reaction work routing visible through reaction-quick.md',
  );
  assert.match(
    text,
    /first-pass whole-page[\s\S]{0,160}`?reaction\.items\[\]`?[\s\S]{0,200}(?:no|without)[\s\S]{0,80}`?get-reaction-meta`?/i,
    'SKILL.md should keep first-pass whole-page reactions in reaction.items[] without live meta',
  );
  assert.match(
    text,
    /artifact-only localized reaction[\s\S]{0,180}planned `?get-reaction-meta`? probe/i,
    'SKILL.md should require artifact-only localized reaction drafts to record the planned meta probe',
  );
  assert.match(
    text,
    /artifact-only locator[\s\S]{0,180}navigation\.routeId[\s\S]{0,160}page\.pageSchemaUid[\s\S]{0,160}liveTargets\[\]\.uid[\s\S]{0,160}non-empty placeholder/i,
    'SKILL.md should keep artifact-only locator maps as direct fields with non-empty placeholders',
  );
  assert.match(
    text,
    /partial-match or boundary-only requests[\s\S]{0,120}\[boundary-quick\.md\]/i,
    'SKILL.md should route boundary-only requests through boundary-quick.md',
  );
  assert.match(
    text,
    /After that route is clear[\s\S]{0,140}\[template-quick\.md\][\s\S]{0,120}\[templates\.md\]/i,
    'SKILL.md should route template-specific decisions through template-quick.md before templates.md',
  );
  assert.match(
    text,
    /Do not enumerate the skill directory just to rediscover docs/i,
    'SKILL.md should keep known-route tasks from re-enumerating the skill directory',
  );
  assert.match(
    text,
    /partial-match or handoff-only request[\s\S]{0,160}Do not inspect runtime, scripts, or helper docs/i,
    'SKILL.md should keep boundary-only tasks off runtime/script exploration',
  );
  assert.match(
    text,
    /Do not open \[tool-shapes\.md\][\s\S]{0,40}or \[helper-contracts\.md\][\s\S]{0,220}(real (?:CLI|nb) body|prewrite gate|prepared write body)/i,
    'SKILL.md should keep tool-shapes and helper-contracts behind the real-write stage',
  );
  assert.doesNotMatch(text, /popup\.tryTemplate/i, 'SKILL.md intent-first rule should not absorb popup.tryTemplate details');
  assert.doesNotMatch(text, /popup\.saveAsTemplate/i, 'SKILL.md intent-first rule should not absorb popup.saveAsTemplate details');
}

function assertDuplicateMenuGroupNeedsRouteId(text, sourceLabel) {
  assert.match(
    text,
    /duplicate menu-group titles|duplicate same-title|same-title/i,
    `${sourceLabel} should mention duplicate same-title group handling`,
  );
  assert.match(
    text,
    /require(?:s)? explicit[\s\S]{0,100}routeId|multiple[\s\S]{0,140}routeId|duplicate[\s\S]{0,180}routeId|routeId[\s\S]{0,140}(?:required|required before write|before the write)/i,
    `${sourceLabel} should require explicit routeId when duplicate same-title groups exist`,
  );
  assert.doesNotMatch(
    text,
    /reuse one visible same-title group deterministically|chosen destination routeId|show the chosen routeId|states which routeId was chosen/i,
    `${sourceLabel} should not claim deterministic reuse or a preselected routeId for duplicate same-title groups`,
  );
}

function assertWholePageFirstWriteGuardrails(text, sourceLabel) {
  assert.match(
    text,
    /whole-page[\s\S]{0,180}(?:route-backed tab|complex multi-block|nested-popup|nested popup|multiple reaction families|multi-reaction)/i,
    `${sourceLabel} should define the whole-page scenarios that stay on the blueprint route`,
  );
  assert.match(
    text,
    /first mutating write[\s\S]{0,120}`?applyBlueprint`?|`?applyBlueprint`?[\s\S]{0,120}first mutating write/i,
    `${sourceLabel} should require applyBlueprint as the first mutating write for whole-page work`,
  );
  assert.match(
    text,
    /(?:pre-write reads|reads)[\s\S]{0,80}metadata fetch[\s\S]{0,80}preview[\s\S]{0,80}prepare-write[\s\S]{0,80}(?:allowed|ok)/i,
    `${sourceLabel} should allow read-only prep work before the first mutating write`,
  );
  assert.match(
    text,
    /before[\s\S]{0,80}(?:applyBlueprint`? succeeds|success)[\s\S]{0,220}(?:createMenu|createPage|compose|configure|update-settings|updateSettings|add\*|move\*|remove\*|set\*Rules)/i,
    `${sourceLabel} should forbid low-level mutating writes before applyBlueprint succeeds`,
  );
  assert.match(
    text,
    /`?applyBlueprint`?[\s\S]{0,120}fail(?:s|ure)?[\s\S]{0,220}repair[\s\S]{0,120}prepare-write[\s\S]{0,80}preview[\s\S]{0,120}retry[\s\S]{0,80}(?:5|five)|repair[\s\S]{0,120}prepare-write[\s\S]{0,80}preview[\s\S]{0,120}retry[\s\S]{0,120}`?applyBlueprint`?[\s\S]{0,80}(?:5|five)/i,
    `${sourceLabel} should repair the blueprint, rerun prepare-write/preview, and retry up to 5 rounds on pre-success applyBlueprint failure`,
  );
  assert.match(
    text,
    /same pre-success phase|pre-success retr(?:y|ies)|do not continue with low-level writes|do not fall back to low-level writes|do not switch to low-level writes/i,
    `${sourceLabel} should forbid low-level fallback before the first successful applyBlueprint`,
  );
  assert.match(
    text,
    /(?:after|then|5)[\s\S]{0,120}(?:5|five)[\s\S]{0,80}(?:failed rounds|rounds|retries)[\s\S]{0,160}(?:report|evidence)|(?:report|evidence)[\s\S]{0,160}(?:5|five)[\s\S]{0,80}(?:failed rounds|rounds|retries)/i,
    `${sourceLabel} should report evidence only after 5 failed pre-success rounds`,
  );
  assert.match(
    text,
    /after (?:a |one )?successful[\s\S]{0,80}`?applyBlueprint`?[\s\S]{0,180}(?:localized|narrowly scoped|local\/live gap|explicit local\/live gap)/i,
    `${sourceLabel} should allow only narrow post-success repair for explicit local/live gaps`,
  );
}

function assertOpenAIGuardrails(text) {
  assert.match(
    text,
    /localized edits[\s\S]{0,80}(?:low-level )?`flow-surfaces`/i,
    'openai prompt should keep localized low-level flow-surfaces routing visible',
  );
  assert.match(text, /routeId/i, 'openai prompt should keep routeId guidance for existing groups');
  assert.match(
    text,
    /routeId[\s\S]{0,80}pageSchemaUid|never pass a desktop route id as `?target\.uid`?/i,
    'openai prompt should keep routeId-to-pageSchemaUid normalization visible',
  );
  assert.match(
    text,
    /Duplicate group titles[\s\S]{0,40}routeId|same-title[\s\S]{0,80}routeId/i,
    'openai prompt should require explicit routeId for duplicate same-title groups',
  );
  assert.match(
    text,
    /associatedRecords(?:\+| \+ )associationField/i,
    'openai prompt should keep associatedRecords+associationField guidance',
  );
  assert.match(text, /(?:exactly )?one `?editForm`?|1 `?editForm`?/i, 'openai prompt should keep one-editForm guidance');
  assert.match(
    text,
    /repeat-eligible[\s\S]{0,80}(?:must|mandatory)[\s\S]{0,80}contextual `?list-templates`?/i,
    'openai prompt should require contextual template probing for repeat-eligible scenes',
  );
  assert.match(text, /keyword-only search[\s\S]{0,40}discovery-only/i, 'openai prompt should keep keyword-only guardrail');
  assert.match(
    text,
    /backend order|first compatible row|first result|first returned row/i,
    'openai prompt should keep backend-order tie-break guidance',
  );
  assert.match(text, /popup\.tryTemplate/i, 'openai prompt should mention popup.tryTemplate fallback');
  assert.match(text, /popup\.saveAsTemplate/i, 'openai prompt should mention popup.saveAsTemplate');
  assert.match(text, /openView\.tryTemplate|apply .*popup/i, 'openai prompt should mention existing-opener tryTemplate guidance');
  assert.match(
    text,
    /navigation\.group[\s\S]{0,80}navigation\.item[\s\S]{0,80}(?:semantic )?Ant ?Design `?icon`?|semantic Ant ?Design `?icon`?/i,
    'openai prompt should require semantic icons for newly created menu groups and items',
  );
  assert.match(
    text,
    /multi[- ]non[- ]filter[\s\S]{0,120}explicit keyed `?layout`?|explicit keyed `?layout`?[\s\S]{0,120}multi[- ]non[- ]filter/i,
    'openai prompt should require explicit keyed layout for multi-block tab or popup scopes',
  );
  assert.match(
    text,
    /filter[\s\S]{0,80}row 1|filter alone in row 1|filter blocks? should sit alone/i,
    'openai prompt should keep the filter-first-row guardrail visible',
  );
  assert.match(
    text,
    /filterForm[\s\S]{0,80}4\+ fields[\s\S]{0,80}`?collapse`?|`?collapse`?[\s\S]{0,80}filterForm[\s\S]{0,80}4\+ fields/i,
    'openai prompt should require collapse for larger filter forms',
  );
  assert.match(text, /template source/i, 'openai prompt should mention template-source editing for existing references');
  assert.match(text, /local-only intent|local customization/i, 'openai prompt should mention explicit local-only intent before copy');
  assert.match(
    text,
    /page-scoped wording[\s\S]{0,80}(?:not local-only intent|≠local-only intent)|page wording[\s\S]{0,80}(?:not local-only intent|≠local-only intent)/i,
    'openai prompt should block page-scoped wording from implying local-only edits',
  );
  assert.match(
    text,
    /ask, not `?copy`?|unresolved scope[\s\S]{0,80}ask/i,
    'openai prompt should route unresolved existing-reference scope to clarification instead of copy',
  );
  assert.match(
    text,
    /wholePage[\s\S]{0,80}1 (?:route )?tab/i,
    'openai prompt should keep one-tab whole-page routing visible',
  );
  assert.match(
    text,
    /wholePage[\s\S]{0,120}complex multi-block|complex multi-block[\s\S]{0,120}wholePage/i,
    'openai prompt should keep complex multi-block whole-page routing visible',
  );
  assert.match(
    text,
    /wholePage[\s\S]{0,140}nested popup|nested popup[\s\S]{0,140}wholePage/i,
    'openai prompt should keep nested popup whole-page routing visible',
  );
  assert.match(
    text,
    /wholePage[\s\S]{0,160}multi-reaction|multi-reaction[\s\S]{0,160}wholePage/i,
    'openai prompt should keep multi-reaction whole-page routing visible',
  );
  assert.match(
    text,
    /first (?:mutating )?write[\s\S]{0,40}applyBlueprint|applyBlueprint[\s\S]{0,40}first (?:mutating )?write/i,
    'openai prompt should require applyBlueprint as the first mutating write',
  );
  assert.match(
    text,
    /reads\/metadata\/preview\/prepare-write ok|reads[\s\S]{0,32}metadata[\s\S]{0,32}preview[\s\S]{0,32}prepare-write[\s\S]{0,32}ok/i,
    'openai prompt should allow read-only prep before the first mutating write',
  );
  assert.match(
    text,
    /createMenu\/createPage\/compose\/configure\/updateSettings\/add\*\/move\*\/remove\*\/set\*Rules/i,
    'openai prompt should forbid pre-success low-level writes',
  );
  assert.match(
    text,
    /fail->repair\+prepare\/preview\+retry<=5/i,
    'openai prompt should repair, rerun prepare-write/preview, and retry up to 5 rounds on applyBlueprint failure',
  );
  assert.match(
    text,
    /no createMenu\/createPage\/compose\/configure\/updateSettings\/add\*\/move\*\/remove\*\/set\*Rules/i,
    'openai prompt should forbid low-level fallback before the first successful applyBlueprint',
  );
  assert.match(text, /report/i, 'openai prompt should report after exhausting retries');
  assert.match(
    text,
    /after success (?:localized repair only for explicit local\/live gap|only explicit local\/live gap repair)/i,
    'openai prompt should allow only narrow post-success repair',
  );
}

test('required docs and relative links stay valid', () => {
  const docs = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/aliases.md',
    'references/ascii-preview.md',
    'references/boundary-quick.md',
    'references/blocks/chart.md',
    'references/blocks/index.md',
    'references/blocks/kanban.md',
    'references/capabilities.md',
    'references/chart-core.md',
    'references/cli-command-surface.md',
    'references/cli-transport.md',
    'references/execution-checklist.md',
    'references/helper-contracts.md',
    'references/index.md',
    'references/js.md',
    'references/js-reference-index.md',
    'references/js-snippets/index.md',
    'references/js-snippets/catalog.json',
    'references/js-surfaces/index.md',
    'references/js-surfaces/event-flow.md',
    'references/js-surfaces/js-model-action.md',
    'references/js-surfaces/js-model-render.md',
    'references/js-surfaces/linkage.md',
    'references/js-surfaces/value-return.md',
    'references/js-surfaces/snippet-manifest.json',
    'references/local-edit-quick.md',
    'references/normative-contract.md',
    'references/page-archetypes.md',
    'references/page-blueprint.md',
    'references/page-intent.md',
    'references/page-first-planning.md',
    'references/popup.md',
    'references/reaction.md',
    'references/reaction-quick.md',
    'references/runjs-authoring-loop.md',
    'references/runjs-failure-taxonomy.md',
    'references/runjs-repair-playbook.md',
    'references/runjs-runtime.md',
    'references/runtime-playbook.md',
    'references/settings.md',
    'references/template-decision-summary.md',
    'references/template-quick.md',
    'references/templates.md',
    'references/tool-shapes.md',
    'references/transport-crosswalk.md',
    'references/verification.md',
    'references/whole-page-quick.md',
  ];

  for (const relativePath of docs) {
    assert.equal(existsSync(path.join(skillRoot, relativePath)), true, `${relativePath} should exist`);
    if (relativePath.endsWith('.md')) assertRelativeMarkdownLinksExist(relativePath);
  }
});

test('runjs docs keep the self-contained zero-install runtime contract', () => {
  const runtimeDoc = read('references/runjs-runtime.md');
  assert.match(runtimeDoc, /self-contained inside this skill/i);
  assert.match(runtimeDoc, /no `npm install` step/i);
  assert.match(runtimeDoc, /no `runtime\/node_modules` requirement/i);
  assert.match(runtimeDoc, /must not require installing external npm packages first/i);

  const jsDoc = read('references/js.md');
  assert.match(jsDoc, /skill-local source and vendored assets/i);
  assert.match(jsDoc, /Do not require external npm installs/i);
});

test('upstream js snapshot relative links stay valid', () => {
  for (const relativePath of walkMarkdownFiles('runtime/reference-assets/upstream-js')) {
    assertRelativeMarkdownLinksExist(relativePath);
    assertNoRootRelativeMarkdownLinks(relativePath);
  }
});

test('docs keep canonical nb boundaries', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /Canonical transport is `nb api flow-surfaces`/);
  assert.match(skill, /nb api flow-surfaces apply-blueprint/);
  assert.match(skill, /nb api flow-surfaces get-reaction-meta/);
  assert.match(skill, /prepare-write/i);
  assert.doesNotMatch(skill, /nocobase-ctl|MCP fallback|flow_surfaces_|requestBody|collections:get/i);

  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(pageBlueprint, /Canonical front door is `nb api flow-surfaces apply-blueprint`/);
  assert.match(pageBlueprint, /nb raw body/i);
  assert.match(pageBlueprint, /Do not wrap that object again/i);

  const toolShapes = read('references/tool-shapes.md');
  assert.match(toolShapes, /Do not wrap it again/i);
  assert.match(toolShapes, /`nb api flow-surfaces get` is the common exception: it uses top-level locator flags and no JSON body/i);
  assert.doesNotMatch(toolShapes, /MCP fallback|requestBody|flow_surfaces_|collections:get/i);
  assert.doesNotMatch(
    toolShapes,
    /nb request body:\s*\n\s*\n```json\s*\{\s*"blueprint"\s*:/i,
    'tool-shapes should not present wrapped { blueprint: ... } bodies as canonical nb request bodies',
  );

  const asciiPreview = read('references/ascii-preview.md');
  assert.match(asciiPreview, /\{\s*blueprint,\s*templateDecision\?,\s*collectionMetadata\?\s*\}/i);
  assert.match(asciiPreview, /normalized `templateDecision`/i);
  assert.doesNotMatch(asciiPreview, /requestBody|tool-call envelope/i);
});

test('public ui-builder docs do not expose old ctl or MCP transport contracts', () => {
  for (const relativePath of ['SKILL.md', 'agents/openai.yaml', ...walkMarkdownFiles('references')]) {
    assertFileDoesNotContain(
      relativePath,
      /nocobase-ctl|MCP fallback|flow_surfaces_|requestBody|collections:get/i,
      `${relativePath} should not expose the old ctl/MCP transport contract`,
    );
  }
});

test('public ui-builder docs do not document nb environment management commands', () => {
  for (const relativePath of ['SKILL.md', 'agents/openai.yaml', ...walkMarkdownFiles('references')]) {
    assertFileDoesNotContain(
      relativePath,
      /\bnb env\b|\benv\s+(?:add|update|use|list|--help)\b/i,
      `${relativePath} should not document nb environment-management commands`,
    );
  }
});

test('js reference routing keeps snapshot-vs-skill boundary clear', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /\[js-surfaces\/index\.md\]/i, 'SKILL.md should expose the surface-first JS router');
  assert.match(skill, /\[js-snippets\/index\.md\]|\[js-snippets\/catalog\.json\]/i, 'SKILL.md should expose canonical JS snippets');
  assert.match(skill, /\[js-reference-index\.md\]/i, 'SKILL.md should expose the JS snapshot bridge');

  const js = read('references/js.md');
  assert.match(js, /\[js-surfaces\/index\.md\]/i, 'references/js.md should route surface selection to js-surfaces/index.md');
  assert.match(js, /\[js-snippets\/catalog\.json\]/i, 'references/js.md should route canonical snippets to js-snippets/catalog.json');
  assert.match(js, /\[runjs-authoring-loop\.md\]/i, 'references/js.md should document the authoring loop');
  assert.match(js, /\[runjs-repair-playbook\.md\]/i, 'references/js.md should document the repair playbook');
  assert.match(js, /\[js-reference-index\.md\]/i, 'references/js.md should route capability lookup to js-reference-index.md');
  assert.match(js, /bundled product reference snapshot|bundled reference snapshot/i, 'references/js.md should describe the bundled reference snapshot layer');
  assert.match(js, /\[reaction\.md\]/i, 'references/js.md should point reaction work back to reaction.md');

  const index = read('references/js-reference-index.md');
  assert.match(index, /\[js-surfaces\/index\.md\]/i, 'js-reference-index should keep the surface-first router visible');
  assert.match(index, /bundled product reference snapshot|bundled reference snapshot/i, 'js-reference-index should describe the snapshot layer');
  assert.match(index, /does \*\*not\*\* replace the skill write contract|does not replace the skill write contract/i);
  assert.match(index, /\[js\.md\]/i, 'js-reference-index should route model/validator work back to js.md');
  assert.match(index, /\[runjs-runtime\.md\]/i, 'js-reference-index should route runtime validation back to runjs-runtime.md');
  assert.match(index, /\[reaction\.md\]/i, 'js-reference-index should route linkage writes back to reaction.md');
  assert.match(index, /Execute JavaScript/i, 'js-reference-index should cover event-flow Execute JavaScript');
  assert.match(index, /ctx\.\*/i, 'js-reference-index should expose ctx API routing');
});

test('js surface docs stay discoverable and keep progressive disclosure', () => {
  const rootIndex = read('references/index.md');
  assert.match(rootIndex, /js-surfaces\/index\.md/i, 'references/index.md should link to js-surfaces/index.md');

  const surfaceIndex = read('references/js-surfaces/index.md');
  assert.match(surfaceIndex, /snippet-manifest\.json/i, 'js-surfaces/index should expose the snippet manifest');
  assert.match(surfaceIndex, /js-snippets\/catalog\.json/i, 'js-surfaces/index should expose the snippet catalog');
  assert.match(surfaceIndex, /Event Flow `?Execute JavaScript`?/i, 'js-surfaces/index should route event-flow RunJS');
  assert.match(surfaceIndex, /Linkage `?Execute JavaScript`?/i, 'js-surfaces/index should route linkage RunJS');
  assert.match(surfaceIndex, /value-return/i, 'js-surfaces/index should route value-return RunJS');
  assert.match(surfaceIndex, /js-model-render\.md/i, 'js-surfaces/index should route render JS models');
  assert.match(surfaceIndex, /js-model-action\.md/i, 'js-surfaces/index should route action JS models');
  assert.match(surfaceIndex, /\[..\/*js-models\/index\.md\]/i, 'js-surfaces/index should keep js-models as a later hop');

  const eventFlow = read('references/js-surfaces/event-flow.md');
  assert.match(eventFlow, /flowRegistry\.\*\.steps\.\*\.params\.code/i, 'event-flow surface doc should expose the writeback path');
  assert.match(eventFlow, /action-style/i, 'event-flow surface doc should describe action-style validation');

  const linkage = read('references/js-surfaces/linkage.md');
  assert.match(linkage, /linkageRunjs/i, 'linkage surface doc should name the linkage action');
  assert.match(linkage, /params\.value\.script/i, 'linkage surface doc should expose the writeback path');

  const valueReturn = read('references/js-surfaces/value-return.md');
  assert.match(valueReturn, /top-level `?return`? is required|top-level return is required/i, 'value-return doc should require return');
  assert.match(valueReturn, /ctx\.render/i, 'value-return doc should explicitly forbid ctx.render');

  const jsModelRender = read('references/js-surfaces/js-model-render.md');
  assert.match(jsModelRender, /ctx\.render\(\.\.\.\).*required|required.*ctx\.render/i, 'js-model-render doc should require ctx.render');
  assert.match(jsModelRender, /popup-opener-record[\s\S]{0,160}ctx\.popup\.record/i, 'js-model-render doc should route popup opener records to ctx.popup.record');

  const jsModelAction = read('references/js-surfaces/js-model-action.md');
  assert.match(jsModelAction, /clickSettings\.runJs/i, 'js-model-action doc should expose action write path');
  assert.match(jsModelAction, /inner-row-record[\s\S]{0,180}ctx\.getVar\('ctx\.record/i, 'js-model-action doc should distinguish popup inner row record from popup opener record');

  const legacyIndex = read('references/js-models/index.md');
  assert.match(legacyIndex, /legacy/i, 'js-models/index should mark itself as a legacy entrypoint');
  assert.match(legacyIndex, /\[..\/js-surfaces\/index\.md\]/i, 'js-models/index should route back to js-surfaces/index.md');

  const jsAction = read('references/js-models/js-action.md');
  const jsActionFenceBodies = [...jsAction.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/gi)].map((match) => match[1]);
  assert.equal(jsActionFenceBodies.some((body) => /ctx\.openView\s*\(/i.test(body)), false, 'JSActionModel leaf doc should not provide ctx.openView final-code examples');
  assert.match(jsAction, /popup action|field popup|configuration|配置层/i, 'JSActionModel leaf doc should reroute popup/openView work to configuration');

  const catalog = JSON.parse(read('references/js-snippets/catalog.json'));
  const safeIds = new Set(catalog.snippets.filter((entry) => entry.tier === 'safe').map((entry) => entry.id));
  const manifest = JSON.parse(read('references/js-surfaces/snippet-manifest.json'));
  const renderSurface = manifest.surfaces.find((surface) => surface.id === 'js-model.render');
  assert.deepEqual(
    renderSurface?.recommendedBySceneHint?.popup,
    ['scene/block/popup-record-summary'],
    'js-model.render should recommend the popup record snippet for popup scenes',
  );
  for (const surface of manifest.surfaces) {
    assert.equal(surface.recommendedSnippetIds.length <= 3, true, `${surface.id} should recommend at most 3 snippets`);
    for (const snippetId of surface.recommendedSnippetIds) {
      assert.equal(safeIds.has(snippetId), true, `${surface.id} should only recommend safe snippets`);
    }
    const docSnippetIds = extractFirstHopSnippetIds(read(`references/${surface.entryDoc}`));
    assert.deepEqual(
      docSnippetIds,
      surface.recommendedSnippetIds,
      `${surface.id} surface doc should keep first-hop snippets in exact manifest order`,
    );
  }
});

test('RunJS authoring docs require record semantic selection before code generation', () => {
  const js = read('references/js.md');
  const loop = read('references/runjs-authoring-loop.md');
  const blockTextSummary = read('references/js-snippets/safe/scene/block/text-summary.md');
  const textFromRecord = read('references/js-snippets/safe/render/text-from-record.md');

  assert.match(js, /recordSemantic/i, 'js.md should require recording the selected record semantic');
  assert.match(js, /contextEvidence/i, 'js.md should require evidence for context root choices');
  assert.match(loop, /recordSemantic/i, 'runjs-authoring-loop should include recordSemantic in the scenario card');
  assert.match(loop, /contextEvidence/i, 'runjs-authoring-loop should include contextEvidence in the scenario card');
  assert.match(loop, /popup-opener-record[\s\S]{0,180}ctx\.popup\.record/i, 'runjs authoring loop should map popup opener record to ctx.popup.record');
  assert.match(loop, /inner-row-record[\s\S]{0,200}ctx\.getVar\('ctx\.record/i, 'runjs authoring loop should route inner row records through ctx.getVar');
  assert.match(blockTextSummary, /Do not use[\s\S]{0,220}popup/i, 'block text-summary snippet should not be used for popup opener records');
  assert.match(textFromRecord, /Do not use[\s\S]{0,220}popup/i, 'text-from-record snippet should not be used for popup opener records');
});

test('safe RunJS snippets read record values through ctx.getVar', () => {
  const catalog = JSON.parse(read('references/js-snippets/catalog.json'));
  const safeEntries = catalog.snippets.filter((entry) => entry.tier === 'safe');
  assert.ok(safeEntries.length > 0, 'safe snippet catalog should not be empty');

  for (const entry of safeEntries) {
    const markdown = read(`references/${entry.doc}`);
    const code = extractJsFenceAfterH2(markdown, 'Normalized snippet');
    assertNoDirectCtxRecordValueReads(code, `${entry.id} normalized snippet`);
  }
});

test('key upstream js snapshot pages route back to skill contracts', () => {
  const eventFlow = read('runtime/reference-assets/upstream-js/interface-builder/event-flow.md');
  assert.match(eventFlow, /settings\.md/i, 'event-flow snapshot should route writes back to settings.md');
  assert.match(eventFlow, /set-event-flows/i, 'event-flow snapshot should mention set-event-flows');
  assert.match(eventFlow, /js\.md/i, 'event-flow snapshot should keep JS validator boundary visible');

  for (const relativePath of [
    'runtime/reference-assets/upstream-js/interface-builder/linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/blocks/block-settings/field-linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/blocks/block-settings/block-linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/actions/action-settings/linkage-rule.md',
  ]) {
    const text = read(relativePath);
    assert.match(text, /reaction\.md/i, `${relativePath} should route writes back to reaction.md`);
    assert.match(text, /js\.md/i, `${relativePath} should keep JS validator boundary visible`);
  }

  const openView = read('runtime/reference-assets/upstream-js/runjs/context/open-view.md');
  assert.match(openView, /skill-mode validator/i, 'open-view snapshot should mention skill-mode validator boundary');
  assert.match(openView, /do not|不要|不接受/i, 'open-view snapshot should explicitly warn against direct final output');
  assert.match(openView, /ctx\.openView\(\.\.\.\)|ctx\.openView/i, 'open-view snapshot should keep the warned API explicit');
  assert.match(openView, /js-reference-index\.md/i, 'open-view snapshot should route back to js-reference-index.md');
  assert.match(openView, /js\.md/i, 'open-view snapshot should route back to js.md');

  const requestDoc = read('runtime/reference-assets/upstream-js/runjs/context/request.md');
  assert.match(requestDoc, /http\/https/i, 'request snapshot should mention http/https guardrail for skill-mode');
  assert.match(requestDoc, /ctx\.initResource|ctx\.makeResource/i, 'request snapshot should redirect NocoBase resource access to resource APIs');
});

test('canonical patched JS examples satisfy skill-mode minimum contracts', () => {
  const jsBlock = read('runtime/reference-assets/upstream-js/interface-builder/blocks/other-blocks/js-block.md');
  validateRunjsSnippet('JSBlockModel', extractFirstJsFenceAfterHeading(jsBlock, '2) API Request Template'));
  validateRunjsSnippet('JSBlockModel', extractFirstJsFenceAfterHeading(jsBlock, '4) Skill-mode Feedback'));

  const jsField = read('runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-field.md');
  validateRunjsSnippet('JSFieldModel', extractFirstJsFenceAfterHeading(jsField, '1) Basic Rendering (Reading Field Value)'));

  const jsAction = read('runtime/reference-assets/upstream-js/interface-builder/actions/types/js-action.md');
  validateRunjsSnippet('JSActionModel', extractFirstJsFenceAfterHeading(jsAction, '1) API Request and Feedback'));
});

test('event-flow JS write contract stays discoverable across routing docs', () => {
  const cli = read('references/cli-command-surface.md');
  assert.match(cli, /set-event-flows/i, 'cli-command-surface should route event-flow replacement to set-event-flows');

  const runtime = read('references/runtime-playbook.md');
  assert.match(runtime, /set-event-flows/i, 'runtime-playbook should route event-flow replacement to set-event-flows');
  assert.match(
    runtime,
    /desktop-route `?id`?[\s\S]{0,80}not flow-surface `?uid`?|not flow-surface `?uid`?/i,
    'runtime-playbook should keep route ids separate from flow-surface uids',
  );
  assert.match(
    runtime,
    /pageSchemaUid[\s\S]{0,160}(catalog|context|get-reaction-meta|compose|configure|add\*|remove\*)/i,
    'runtime-playbook should require pageSchemaUid/live uid normalization before localized follow-up reads and writes',
  );
  assert.match(
    runtime,
    /locator-map\.json[\s\S]{0,160}navigation[\s\S]{0,80}routeId[\s\S]{0,160}page[\s\S]{0,80}pageSchemaUid[\s\S]{0,160}liveTargets[\s\S]{0,80}uid/i,
    'runtime-playbook should show the artifact-only locator map shape with direct navigation/page/liveTargets fields',
  );

  const crosswalk = read('references/transport-crosswalk.md');
  assert.match(crosswalk, /nb api flow-surfaces set-event-flows/i, 'transport-crosswalk should expose nb command for set-event-flows');

  const settings = read('references/settings.md');
  assert.match(settings, /Event-flow Replacement/i, 'settings.md should document event-flow replacement explicitly');
  assert.match(settings, /flowRegistry/i, 'settings.md should describe flowRegistry shape');
  assert.match(settings, /params\.code/i, 'settings.md should explain how Execute JavaScript code is written back');
  assert.match(settings, /\[js\.md\]/i, 'settings.md should route JS validation back to js.md');

  const shapes = read('references/tool-shapes.md');
  assert.match(shapes, /### `set-event-flows`/i, 'tool-shapes should contain a set-event-flows section');
  assert.match(shapes, /flowRegistry/i, 'tool-shapes should show flowRegistry body shape');
  assert.match(shapes, /params\.code/i, 'tool-shapes should mention Execute JavaScript step code location');
});

test('low-level set-layout docs keep runtime rows/sizes separate from whole-page layout grammar', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /low-level `?set-layout`?[\s\S]{0,220}string\[\]\[\]/i, 'SKILL.md should mention low-level set-layout row cell shape');
  assert.match(skill, /\[\[uidA\], \[uidB\]\]|\[\[uidA\],\s*\[uidB\]\]/i, 'SKILL.md should distinguish side-by-side two-column set-layout syntax');
  assert.match(skill, /\[\[uidA, uidB\]\]|\[\[uidA,\s*uidB\]\]/i, 'SKILL.md should distinguish stacked-cell set-layout syntax');

  const localEdit = read('references/local-edit-quick.md');
  assert.match(localEdit, /Use `?set-layout`? only for explicit whole-layout replacement/i, 'local-edit-quick should keep set-layout scoped to full replacement');
  assert.match(localEdit, /Record<string,\s*string\[\]\[\]>|string\[\]\[\]/i, 'local-edit-quick should document low-level set-layout rows shape');
  assert.match(localEdit, /Record<string,\s*number\[\]>|number\[\]/i, 'local-edit-quick should document low-level set-layout sizes shape');
  assert.match(localEdit, /uid[\s\S]{0,40}not[\s\S]{0,20}key|block `?key`/i, 'local-edit-quick should keep uid-vs-key separation visible');

  const runtime = read('references/runtime-playbook.md');
  assert.match(runtime, /set-layout/i, 'runtime-playbook should route layout replacement to set-layout');
  assert.match(runtime, /string\[\]\[\]/i, 'runtime-playbook should mention low-level set-layout row cell shape');
  assert.match(runtime, /\[\[uidA\], \[uidB\]\]|\[\[uidA\],\s*\[uidB\]\]/i, 'runtime-playbook should keep the two-column set-layout example');

  const settings = read('references/settings.md');
  assert.match(settings, /## Layout Replacement/i, 'settings.md should contain a dedicated layout replacement section');
  assert.match(settings, /Record<string,\s*string\[\]\[\]>|string\[\]\[\]/i, 'settings.md should document low-level set-layout rows shape');
  assert.match(settings, /Record<string,\s*number\[\]>|number\[\]/i, 'settings.md should document low-level set-layout sizes shape');
  assert.match(settings, /\[\[(?:"details-uid"|details-uid)\],\s*\[(?:"roles-table-uid"|roles-table-uid)\]\]/i, 'settings.md should show the side-by-side two-column set-layout example');
  assert.match(settings, /\[\[(?:"details-uid"|details-uid),\s*(?:"roles-table-uid"|roles-table-uid)\]\]/i, 'settings.md should show the stacked-cell set-layout example');
  assert.match(settings, /\{\s*rows:\s*\[\[\{\s*key,\s*span\s*\}\]\]\s*\}|\{ rows: \[\[\{ key, span \}\]\] \}/i, 'settings.md should contrast low-level set-layout against public key/span layout');

  const shapes = read('references/tool-shapes.md');
  assert.match(shapes, /### `set-layout`/i, 'tool-shapes should contain a set-layout section');
  assert.match(shapes, /Record<string,\s*string\[\]\[\]>|string\[\]\[\]/i, 'tool-shapes should show low-level set-layout rows shape');
  assert.match(shapes, /Record<string,\s*number\[\]>|number\[\]/i, 'tool-shapes should show low-level set-layout sizes shape');
  assert.match(shapes, /\[\[(?:"details-uid"|details-uid),\s*(?:"roles-table-uid"|roles-table-uid)\]\]/i, 'tool-shapes should show the stacked-cell set-layout example');
  assert.match(shapes, /\[\[12,\s*12\]\]/i, 'tool-shapes should forbid nested sizes arrays explicitly');

  const defaultPrompt = readYamlDoubleQuotedScalar(read('agents/openai.yaml'), 'default_prompt');
  assert.match(defaultPrompt, /setLayout[\s\S]{0,40}string\[\]\[\][\s\S]{0,40}number\[\]/i, 'openai prompt should mention low-level set-layout rows/sizes shapes');
  assert.match(defaultPrompt, /\[\[a\],\[b\]\][\s\S]{0,12}2col/i, 'openai prompt should keep the two-column set-layout shorthand');
  assert.match(defaultPrompt, /\[\[a,b\]\][\s\S]{0,12}stack/i, 'openai prompt should keep the stacked-cell shorthand');
  assert.match(defaultPrompt, /uid not key/i, 'openai prompt should keep uid-vs-key separation visible');
});

test('template selection stays centralized and prompt keeps minimum guardrails', () => {
  const skill = read('SKILL.md');
  assertSkillKeepsIntentFirst(skill);
  assert.match(skill, /read \[template-quick\.md\].*\[templates\.md\].*full decision matrix/i);
  assertSkillKeepsTemplateRulesMinimal(skill);

  const templates = read('references/templates.md');
  assertTemplateDocMinimumContract(templates, 'references/templates.md');
  assertContextualTemplateProbeGuardrails(templates, 'references/templates.md');
  assertTryTemplateWriteFallback(templates, 'references/templates.md');
  assertSaveAsTemplateWritePath(templates, 'references/templates.md');
  assertExistingReferenceEditMatrix(templates, 'references/templates.md');
  assert.doesNotMatch(templates, /auto-generated by nocobase-ui-builder/i);

  for (const relativePath of [
    'references/execution-checklist.md',
    'references/page-blueprint.md',
    'references/page-intent.md',
    'references/popup.md',
    'references/tool-shapes.md',
    'references/template-decision-summary.md',
  ]) {
    const text = read(relativePath);
    assertPointsToTemplates(text, relativePath);
    assertNoTemplateDecisionMatrix(text, relativePath);
    if (relativePath !== 'references/template-decision-summary.md') {
      assertContextualTemplateProbeGuardrails(text, relativePath);
    }
    if (relativePath !== 'references/template-decision-summary.md') {
      assertTryTemplateWriteFallback(text, relativePath);
      assertSaveAsTemplateWritePath(text, relativePath);
    }
  }

  const templateDecisionSummary = read('references/template-decision-summary.md');
  assert.match(templateDecisionSummary, /current template decision/i);
  assert.match(templateDecisionSummary, /entire page/i);

  const verification = read('references/verification.md');
  assertNoTemplateDecisionMatrix(verification, 'references/verification.md');
  assert.match(verification, /\[template-decision-summary\.md\]/i);
  assertExistingReferenceReadbackBridge(verification, 'references/verification.md');
  assert.match(
    verification,
    /desktop-route `?id`?[\s\S]{0,120}schemaUid[\s\S]{0,120}pageSchemaUid/i,
    'verification should map menu-tree ids to routeId context and schemaUid/pageSchemaUid for page readback',
  );

  for (const relativePath of [
    'references/execution-checklist.md',
    'references/popup.md',
    'references/runtime-playbook.md',
  ]) {
    assertExistingReferenceRoutingBridge(read(relativePath), relativePath);
  }

  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.match(defaultPrompt, /Canonical front door: `nb api flow-surfaces`/);
  assert.match(defaultPrompt, /Intent-first/i);
  assert.match(defaultPrompt, /Repeat-eligible(?: scenes)?/i);
  assert.match(defaultPrompt, /local customization/i);
  assert.match(defaultPrompt, /apply-blueprint/);
  assert.match(defaultPrompt, /get-reaction-meta/);
  assertOpenAIGuardrails(defaultPrompt);
  assert.ok(defaultPrompt.length <= 1300, 'openai default_prompt should stay at or below 1300 chars');
});

test('data-surface docs require block-level defaultFilter while keeping filter action routing visible', () => {
  const blockDefaultFilterRequiredPattern =
    /(?:table|list|gridCard|calendar|kanban)[\s\S]{0,260}(?:must|required|requires?|always|carry)[\s\S]{0,120}(?:block-?level|top-?level|block)[\s\S]{0,80}defaultFilter|(?:table|list|gridCard|calendar|kanban)[\s\S]{0,260}(?:block-?level|top-?level|block)[\s\S]{0,80}defaultFilter[\s\S]{0,120}(?:must|required|requires?|always|carry)|defaultFilter[\s\S]{0,120}(?:must|required|requires?|always|carry)[\s\S]{0,260}(?:table|list|gridCard|calendar|kanban)/i;
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/tool-shapes.md',
    'references/helper-contracts.md',
    'references/local-edit-quick.md',
    'references/normative-contract.md',
  ]) {
    const text = read(relativePath);
    assert.match(
      text,
      /table[\s\S]{0,100}list[\s\S]{0,100}gridCard[\s\S]{0,100}calendar[\s\S]{0,100}kanban|table[\s\S]{0,100}gridCard[\s\S]{0,100}list[\s\S]{0,100}calendar[\s\S]{0,100}kanban/i,
      `${relativePath} should name table/list/gridCard/calendar/kanban data surfaces`,
    );
    assert.match(
      text,
      /filter action|filter` action|filterAction|block-level `filter`|block-level filter/i,
      `${relativePath} should keep host-level filter action routing visible`,
    );
    assert.match(
      text,
      blockDefaultFilterRequiredPattern,
      `${relativePath} should require block-level defaultFilter for table/list/gridCard/calendar/kanban data surfaces`,
    );
  }

  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(
    pageBlueprint,
    /block-level `?defaultFilter`?[\s\S]{0,80}(?:required|must|carry)|(?:required|must|carry)[\s\S]{0,80}block-level `?defaultFilter`?/i,
  );
  assert.doesNotMatch(pageBlueprint, /actions:\s*\["filter"\][\s\S]{0,80}not valid/i);
  assert.doesNotMatch(
    pageBlueprint,
    /Required block-level `?defaultFilter`?[\s\S]{0,120}```json\s*\{\s*"defaultFilter"/i,
    'page-blueprint should not show block-level defaultFilter as if it lived directly on a filter action object',
  );
  assert.match(
    pageBlueprint,
    /"type":\s*"table"[\s\S]{0,120}"collection":\s*"employees"[\s\S]{0,160}"defaultFilter"[\s\S]{0,120}"items":\s*\[[\s\S]{0,120}"path":\s*"nickname"/,
    'page-blueprint canonical table example should include a non-empty block-level defaultFilter',
  );
  assert.match(
    pageBlueprint,
    /"type":\s*"table"[\s\S]{0,160}"defaultFilter"[\s\S]{0,260}"actions"[\s\S]{0,120}"type":\s*"filter"/,
    'page-blueprint filter-action example should show defaultFilter on the host table block',
  );
  assert.match(
    pageBlueprint,
    /direct,?\s+non-template[\s\S]{0,140}table[\s\S]{0,80}list[\s\S]{0,80}gridCard[\s\S]{0,80}calendar[\s\S]{0,80}kanban[\s\S]{0,120}defaultFilter/i,
    'page-blueprint should scope block-level defaultFilter to direct non-template table/list/gridCard/calendar/kanban data surfaces',
  );
  assert.match(
    pageBlueprint,
    /\{\}[\s\S]{0,120}`?null`?[\s\S]{0,120}\{\s*"logic":\s*"\$and",\s*"items":\s*\[\]\s*\}[\s\S]{0,160}rejected/i,
    'page-blueprint should document rejected empty defaultFilter groups',
  );
  assert.match(
    pageBlueprint,
    /filterableFieldNames[\s\S]{0,160}settings\.defaultFilter[\s\S]{0,120}otherwise[\s\S]{0,80}block-level `?defaultFilter`?/i,
    'page-blueprint should document effective defaultFilter coverage precedence',
  );

  const wholePageQuick = read('references/whole-page-quick.md');
  assert.match(
    wholePageQuick,
    /"type":\s*"table"[\s\S]{0,120}"collection":\s*"support_tickets"[\s\S]{0,160}"defaultFilter"[\s\S]{0,120}"items":\s*\[[\s\S]{0,120}"path":\s*"subject"/,
    'whole-page quick table example should include a non-empty block-level defaultFilter',
  );

  const toolShapes = read('references/tool-shapes.md');
  assert.match(
    toolShapes,
    /direct\s+non-template[\s\S]{0,140}table[\s\S]{0,80}list[\s\S]{0,80}gridCard[\s\S]{0,80}calendar[\s\S]{0,80}kanban[\s\S]{0,120}defaultFilter/i,
    'tool-shapes should scope block-level defaultFilter to direct non-template table/list/gridCard/calendar/kanban data surfaces',
  );
  assert.match(
    toolShapes,
    /"type":\s*"table"[\s\S]{0,120}"collection":\s*"employees"[\s\S]{0,160}"defaultFilter"[\s\S]{0,120}"items":\s*\[[\s\S]{0,120}"path":\s*"nickname"/,
    'tool-shapes applyBlueprint table example should include a non-empty block-level defaultFilter',
  );
  assert.match(
    toolShapes,
    /"key":\s*"employeesTable"[\s\S]{0,300}"defaultFilter"[\s\S]{0,120}"items":\s*\[[\s\S]{0,120}"path":\s*"nickname"/,
    'tool-shapes compose table example should include a non-empty block-level defaultFilter',
  );

  const helperContracts = read('references/helper-contracts.md');
  assert.match(helperContracts, /\{\}[\s\S]{0,80}`?null`?[\s\S]{0,80}logic:\s*"\$and"[\s\S]{0,80}items:\s*\[\][\s\S]{0,80}rejected/i);
  assert.match(helperContracts, /filterableFieldNames[\s\S]{0,160}settings\.defaultFilter[\s\S]{0,120}otherwise[\s\S]{0,80}block-level `?defaultFilter`?/i);
  assert.match(
    helperContracts,
    /sortable public blocks[\s\S]{0,160}table[\s\S]{0,80}details[\s\S]{0,80}list[\s\S]{0,80}tree[\s\S]{0,80}kanban[\s\S]{0,80}gridCard[\s\S]{0,80}map[\s\S]{0,160}settings\.sort[\s\S]{0,80}settings\.sorting/i,
    'helper-contracts should scope sort alias normalization to sortable public blocks',
  );
  assert.match(
    helperContracts,
    /calendar[\s\S]{0,120}(?:not normalized|left unchanged)/i,
    'helper-contracts should state calendar sort aliases are not normalized',
  );
  assert.match(
    helperContracts,
    /relation field popup[\s\S]{0,160}details[\s\S]{0,80}editForm[\s\S]{0,120}currentRecord[\s\S]{0,160}associatedRecords[\s\S]{0,120}associationField/i,
    'helper-contracts should document relation popup resource bindings',
  );

  const normativeContract = read('references/normative-contract.md');
  assert.match(normativeContract, /direct\s+non-template[\s\S]{0,140}table[\s\S]{0,80}list[\s\S]{0,80}gridCard[\s\S]{0,80}calendar[\s\S]{0,80}kanban[\s\S]{0,120}defaultFilter/i);
  assert.match(normativeContract, /filterableFieldNames[\s\S]{0,160}defaultActionSettings[\s\S]{0,160}otherwise[\s\S]{0,80}block-level `?defaultFilter`?/i);

  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.match(defaultPrompt, /hostBound搜索\/filter[\s\S]{0,30}sameHost[\s\S]{0,30}filterAction/i);
  assert.match(defaultPrompt, /defaultFilter[\s\S]{0,24}(?:required|must)|(?:required|must)[\s\S]{0,24}defaultFilter/i);
  assert.match(defaultPrompt, /filterAction[\s\S]{0,24}optional|optional[\s\S]{0,24}filterAction/i);
});

test('kanban routing docs distinguish analytics dashboards from KanbanBlockModel cues', () => {
  for (const relativePath of [
    'references/aliases.md',
    'references/page-first-planning.md',
    'references/blocks/chart.md',
    'references/blocks/index.md',
    'references/blocks/kanban.md',
  ]) {
    const text = read(relativePath);
    assert.match(
      text,
      /分析看板|dashboard|KPI|概览/i,
      `${relativePath} should keep analytics dashboard wording visible`,
    );
    assert.match(
      text,
      /kanban|pipeline|status columns|拖拽|泳道|backlog/i,
      `${relativePath} should keep kanban routing cues visible`,
    );
  }

  const aliases = read('references/aliases.md');
  assert.match(
    aliases,
    /plain `?看板`?[\s\S]{0,120}analytics|do not globally remap/i,
    'aliases should keep plain 看板 on the analytics path unless kanban cues are present',
  );

  const kanbanBlock = read('references/blocks/kanban.md');
  assert.match(
    kanbanBlock,
    /defaultFilter[\s\S]{0,120}filter action|filter action[\s\S]{0,120}defaultFilter/i,
    'kanban block doc should keep defaultFilter and host-level filter action guidance together',
  );

  const defaultPrompt = readYamlDoubleQuotedScalar(read('agents/openai.yaml'), 'default_prompt');
  assert.match(defaultPrompt, /分析看板[\s\S]{0,24}chart\/grid-card/i);
  assert.match(defaultPrompt, /kanban\/pipeline\/status columns[\s\S]{0,24}Kanban/i);
});

test('search-vs-filter intent docs keep host-bound action routing and explicit block-only filterForm rules', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/aliases.md',
    'references/blocks/filter-form.md',
    'references/local-edit-quick.md',
    'references/page-blueprint.md',
    'references/whole-page-quick.md',
  ]) {
    const text = read(relativePath);
    assert.match(
      text,
      /(?:搜索页[\s\S]{0,120}(?:not filter intent|do not treat|not a filter request|不应|不该|不当作|不视为|不走这条路径|should not take this path)|(?:do not treat|not a filter request|不应|不该|不当作|不视为|不走这条路径|should not take this path)[\s\S]{0,120}搜索页|search page[\s\S]{0,120}(?:not filter|not filter intent|should not|do not treat|not a filter request|should not take this path)|(?:do not treat|not a filter request|should not take this path)[\s\S]{0,120}search page)/i,
      `${relativePath} should keep page-noun search wording out of filter intent`,
    );
    assert.match(
      text,
      /搜索区块|search block|filter\/search block|filter\/search block, form, or query area/i,
      `${relativePath} should keep explicit filter/search block wording as the filterForm trigger`,
    );
  }

  const filterForm = read('references/blocks/filter-form.md');
  assert.match(
    filterForm,
    /帮助中心页面[\s\S]{0,80}用列表展示帮助文档入口[\s\S]{0,80}支持搜索/i,
    'filter-form doc should include a non-search-page negative example for page-level search wording',
  );

  const defaultPrompt = readYamlDoubleQuotedScalar(read('agents/openai.yaml'), 'default_prompt');
  assert.match(defaultPrompt, /hostBound搜索[\s\S]{0,20}filter/i);
  assert.match(defaultPrompt, /searchPage≠filter/i);
  assert.match(defaultPrompt, /sameHost[\s\S]{0,20}filterAction/i);
  assert.match(
    defaultPrompt,
    /(?:explicit )?filter\/search block[\s\S]{0,24}filterForm|filterForm[\s\S]{0,36}(?:explicit )?filter\/search block/i,
    'default prompt should keep explicit filter/search block wording as the only filterForm trigger',
  );
});

test('whole-page docs enforce applyBlueprint as the first mutating write', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/execution-checklist.md',
    'references/normative-contract.md',
  ]) {
    assertWholePageFirstWriteGuardrails(read(relativePath), relativePath);
  }
});

test('whole-page satellite docs do not preserve pre-success low-level fallback wording', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/blocks/filter-form.md',
    'references/reaction-quick.md',
    'references/reaction.md',
    'references/whole-page-recipes.md',
  ]) {
    const text = read(relativePath);
    assert.doesNotMatch(
      text,
      /after the failure proves|failure proves the whole-page contract|verified public whole-page contract gap|prove a public contract gap before falling back/i,
      `${relativePath} should not keep old failure-driven low-level fallback wording`,
    );
    assert.doesNotMatch(
      text,
      /只有在已验证的 `?filterForm`? contract gap[\s\S]{0,120}(?:低层|addBlock|addAction|addField)/i,
      `${relativePath} should not keep the old filterForm contract-gap fallback rule`,
    );
    assert.match(
      text,
      /(?:first|首次|single-shot)?[\s\S]{0,120}`?applyBlueprint`?[\s\S]{0,180}(?:fail|失败)[\s\S]{0,180}(?:repair|修正|修复)[\s\S]{0,120}(?:prepare-write|preview)[\s\S]{0,120}(?:retry|重试)[\s\S]{0,80}(?:5|五)|(?:repair|修正|修复)[\s\S]{0,120}(?:prepare-write|preview)[\s\S]{0,120}(?:retry|重试)[\s\S]{0,120}`?applyBlueprint`?[\s\S]{0,80}(?:5|五)/i,
      `${relativePath} should repair and retry up to 5 rounds on pre-success applyBlueprint failure`,
    );
    assert.match(
      text,
      /(?:after|then|5|五)[\s\S]{0,120}(?:5|五)[\s\S]{0,80}(?:failed rounds|rounds|retries|轮)[\s\S]{0,160}(?:report|evidence|报告|证据)|(?:report|evidence|报告|证据)[\s\S]{0,160}(?:5|五)[\s\S]{0,80}(?:failed rounds|rounds|retries|轮)/i,
      `${relativePath} should report evidence only after 5 failed pre-success rounds`,
    );
    assert.match(
      text,
      /(?:successful|已成功)[\s\S]{0,100}`?applyBlueprint`?[\s\S]{0,180}(?:local\/live gap|residual|修补|窄范围)|`?applyBlueprint`?[\s\S]{0,100}(?:successful|已成功)[\s\S]{0,180}(?:local\/live gap|residual|修补|窄范围)/i,
      `${relativePath} should allow low-level repair only after successful applyBlueprint for an explicit local/live gap`,
    );
  }
});

test('duplicate same-title menu-group docs consistently require explicit routeId', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/page-intent.md',
    'references/normative-contract.md',
    'references/ascii-preview.md',
    'references/verification.md',
    'references/tool-shapes.md',
  ]) {
    assertDuplicateMenuGroupNeedsRouteId(read(relativePath), relativePath);
  }
});

test('quick route docs stay discoverable and point to the deeper references', () => {
  const index = read('references/index.md');
  for (const relativePath of [
    'references/whole-page-quick.md',
    'references/local-edit-quick.md',
    'references/reaction-quick.md',
    'references/boundary-quick.md',
    'references/template-quick.md',
    'references/helper-contracts.md',
  ]) {
    assert.match(index, new RegExp(path.basename(relativePath).replace(/\./g, '\\.'), 'i'), `${relativePath} should be listed in references/index.md`);
    assertRelativeMarkdownLinksExist(relativePath);
  }
  assert.doesNotMatch(index, /## Full References/i, 'references/index.md should avoid dumping the whole reference tree up front');
  assert.match(
    index,
    /不会替代 quick route|先命中一个 quick route/i,
    'references/index.md should keep late-stage docs behind quick-route selection',
  );

  const wholePageQuick = read('references/whole-page-quick.md');
  assert.match(wholePageQuick, /\[page-blueprint\.md\]/i);
  assert.match(wholePageQuick, /\[helper-contracts\.md\]/i);
  assert.match(wholePageQuick, /\[template-quick\.md\]/i);
  assert.match(wholePageQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(wholePageQuick, /blueprint\.json/i);
  assert.match(wholePageQuick, /prewrite-preview\.txt/i);
  assert.match(wholePageQuick, /readback-checklist\.md/i);
  assert.match(
    wholePageQuick,
    /artifact-only tasks|normal local drafting|do not enumerate the skill directory/i,
    'whole-page-quick should keep common-case drafting on the quick route',
  );
  assert.match(
    wholePageQuick,
    /blueprint\.json[\s\S]{0,160}(?:must be|is)[\s\S]{0,160}(?:bare|direct|root)[\s\S]{0,160}`?tabs\[\]`?/i,
    'whole-page-quick should require artifact-only blueprint.json to be the direct blueprint root with tabs[]',
  );
  assert.match(
    wholePageQuick,
    /preview-policy\.json[\s\S]{0,160}"prepareWriteRequired"\s*:\s*false[\s\S]{0,160}"previewSource"\s*:\s*"draft-blueprint"/i,
    'whole-page-quick should document the artifact-only preview policy shape',
  );
  assert.match(
    wholePageQuick,
    /locator-map\.json[\s\S]{0,180}"navigation"\s*:\s*\{\s*"routeId"[\s\S]{0,180}"page"\s*:\s*\{\s*"pageSchemaUid"[\s\S]{0,180}"liveTargets"[\s\S]{0,80}"uid"/i,
    'whole-page-quick should show the direct artifact-only locator-map shape',
  );
  assert.match(
    wholePageQuick,
    /liveTargets\[\]\.uid[\s\S]{0,160}non-empty placeholder[\s\S]{0,120}not `?null`?/i,
    'whole-page-quick should require non-empty live target placeholders instead of null',
  );
  assert.match(
    wholePageQuick,
    /helper-contracts[\s\S]{0,120}(real write|prewrite gate)/i,
    'whole-page-quick should keep helper-contracts behind real-write or prewrite-gate needs',
  );
  assert.match(
    wholePageQuick,
    /Complex Whole-page Guardrails|complex whole-page/i,
    'whole-page-quick should describe complex pages as guardrails, not as a separate route',
  );
  assert.match(
    wholePageQuick,
    /one `applyBlueprint`|same blueprint[\s\S]{0,120}reaction\.items\[\]/i,
    'whole-page-quick should prefer one whole-page blueprint that keeps structure and reactions together',
  );
  assert.match(
    wholePageQuick,
    /explicit `key`|same-run public path|string block key/i,
    'whole-page-quick should require stable keys and public paths for complex whole-page requests',
  );
  assert.match(
    wholePageQuick,
    /target[\s\S]{0,160}same-blueprint table key|string block key/i,
    'whole-page-quick should keep filter-form bindings on public same-blueprint target keys',
  );
  assert.match(
    wholePageQuick,
    /first mutating write[\s\S]{0,120}`?applyBlueprint`?|`?applyBlueprint`?[\s\S]{0,160}fail(?:s|ure)?[\s\S]{0,220}repair[\s\S]{0,120}prepare-write[\s\S]{0,80}preview[\s\S]{0,120}retry[\s\S]{0,80}(?:5|five)|after one successful whole-page `?applyBlueprint`?[\s\S]{0,180}(?:localized|residual local\/live gap)/i,
    'whole-page-quick should keep the first-write and post-success repair policy visible',
  );
  assert.match(
    wholePageQuick,
    /routeId[\s\S]{0,120}pageSchemaUid[\s\S]{0,260}never pass a desktop-route `?id`? as `?target\.uid`?/i,
    'whole-page-quick should normalize route ids into pageSchemaUid/live uid before follow-up writes',
  );
  assert.match(
    wholePageQuick,
    /semantic Ant Design icon|navigation\.group[\s\S]{0,80}navigation\.item[\s\S]{0,80}icon/i,
    'whole-page-quick should require semantic icons for new create navigation',
  );
  assert.match(
    wholePageQuick,
    /multiple non-filter blocks[\s\S]{0,120}explicit `?layout`?|explicit `?layout`?[\s\S]{0,120}multiple non-filter blocks/i,
    'whole-page-quick should require explicit layout for multi-block scopes',
  );
  assert.match(
    wholePageQuick,
    /filter blocks? should sit alone in the first row|filter alone in the first row/i,
    'whole-page-quick should keep the filter-first-row layout guidance',
  );
  assertDuplicateMenuGroupNeedsRouteId(wholePageQuick, 'references/whole-page-quick.md');

  const localEditQuick = read('references/local-edit-quick.md');
  assert.match(localEditQuick, /\[runtime-playbook\.md\]/i);
  assert.match(localEditQuick, /\[reaction-quick\.md\]/i);
  assert.match(localEditQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(localEditQuick, /mutation-plan\.json/i);
  assert.match(localEditQuick, /readback-checklist\.md/i);

  const reactionQuick = read('references/reaction-quick.md');
  assert.match(reactionQuick, /get-reaction-meta/i);
  assert.match(reactionQuick, /\[reaction\.md\]/i);
  assert.match(reactionQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(
    reactionQuick,
    /artifact-only localized reaction drafting|do not enumerate the skill directory/i,
    'reaction-quick should keep common artifact-only localized work on the quick route',
  );
  assert.match(
    reactionQuick,
    /reaction-plan\.json/i,
    'reaction-quick should name the JSON artifact directly',
  );
  assert.match(
    reactionQuick,
    /readback-checklist\.md/i,
    'reaction-quick should name the markdown checklist artifact directly',
  );
  assert.match(
    reactionQuick,
    /do not scan the current workspace|do not scan the current workspace or existing `?\.artifacts`?/i,
    'reaction-quick should avoid workspace and artifact scans for common drafting tasks',
  );
  assert.match(
    reactionQuick,
    /do not open \[reaction\.md\][\s\S]{0,140}(payload uncertainty|common `fieldValue` \/ `fieldLinkage` work)/i,
    'reaction-quick should keep reaction.md behind real payload uncertainty',
  );
  assert.match(
    reactionQuick,
    /do not open upstream-js snapshot docs|upstream-js snapshot docs/i,
    'reaction-quick should keep upstream-js snapshots out of ordinary localized reaction drafting',
  );
  assert.match(
    reactionQuick,
    /Whole-page-first rule|for whole-page create \/ replace, prefer top-level `?reaction\.items\[\]`?/i,
    'reaction-quick should treat first-pass whole-page reactions as the default route',
  );
  assert.match(
    reactionQuick,
    /whole-page[\s\S]{0,220}`?reaction\.items\[\]`?[\s\S]{0,200}(?:no|without)[\s\S]{0,80}`?get-reaction-meta`?/i,
    'reaction-quick should keep whole-page first-pass reactions off live meta probes',
  );
  assert.match(
    reactionQuick,
    /"metaProbe"[\s\S]{0,120}"operation"\s*:\s*"get-reaction-meta"[\s\S]{0,220}"requiredKinds"[\s\S]{0,220}"requiredSourcePaths"/i,
    'reaction-quick should show a structured artifact-only metaProbe contract',
  );
  assert.match(
    reactionQuick,
    /artifact-only localized[\s\S]{0,260}(?:no|do not invent)[\s\S]{0,120}(?:live `?uid`?|fingerprint)/i,
    'reaction-quick should forbid invented live uids/fingerprints in artifact-only localized drafts',
  );
  assert.match(
    reactionQuick,
    /value"\s*:\s*\{\s*"source"\s*:\s*"literal"/i,
    'reaction-quick should keep static default-value examples on literal source objects',
  );
  assert.match(
    reactionQuick,
    /existing live page[\s\S]{0,240}get-reaction-meta/i,
    'reaction-quick should require concrete live action targets before action guards',
  );

  const executionChecklist = read('references/execution-checklist.md');
  assert.match(
    executionChecklist,
    /Use this checklist after the matching quick route is already clear/i,
    'execution-checklist should stay behind quick-route selection',
  );
  assert.match(
    executionChecklist,
    /Start with \[whole-page-quick\.md\][\s\S]{0,260}Open \[tool-shapes\.md\][\s\S]{0,120}only/i,
    'execution-checklist whole-page flow should start with whole-page-quick and delay tool-shapes',
  );
  assert.match(
    executionChecklist,
    /Start with \[local-edit-quick\.md\][\s\S]{0,260}Open \[tool-shapes\.md\][\s\S]{0,120}only/i,
    'execution-checklist localized-edit flow should start with local-edit-quick and delay tool-shapes',
  );
  assert.match(
    executionChecklist,
    /Start with \[reaction-quick\.md\]/i,
    'execution-checklist reaction flow should start with reaction-quick',
  );

  const pageArchetypes = read('references/page-archetypes.md');
  assert.match(pageArchetypes, /Multi-Workbench Whole-page/i);
  assert.match(
    pageArchetypes,
    /same whole-page route|pattern, not a separate staged workflow/i,
    'page-archetypes should keep richer multi-workbench pages on the same whole-page route',
  );
  assert.match(
    pageArchetypes,
    /top-level `?reaction\.items\[\]`?/i,
    'page-archetypes should keep reactions in the same whole-page blueprint',
  );

  const filterForm = read('references/blocks/filter-form.md');
  assert.match(filterForm, /whole-page 默认配方/i);
  assert.match(filterForm, /Localized low-level 配方/i);
  assert.match(filterForm, /target: "<table-key>"|`target`/i);
  assert.match(filterForm, /字符串 block key|string block key/i);
  assert.match(filterForm, /defaultTargetUid/i);
  assert.match(filterForm, /same-run key|same-blueprint table/i);
  assert.match(filterForm, /FilterFormSubmitActionModel/i);
  assert.match(filterForm, /FilterFormResetActionModel/i);
  assert.match(filterForm, /filterManager/i);
  assert.match(filterForm, /public whole-page contract|能力不足时如何降级/i);
  assert.match(
    filterForm,
    /少于 4 个[\s\S]{0,80}`submit`[\s\S]{0,40}`reset`|fewer than 4 fields/i,
    'filter-form should document the <4 fields action baseline',
  );
  assert.match(
    filterForm,
    /大于等于 4 个[\s\S]{0,80}`submit`[\s\S]{0,40}`reset`[\s\S]{0,40}`collapse`|4 or more fields/i,
    'filter-form should document the 4+ fields collapse requirement',
  );
  assert.match(
    filterForm,
    /自动补齐|归一化|canonical/i,
    'filter-form should describe canonicalized filterManager wiring for stable same-run targets',
  );

  const tree = read('references/blocks/tree.md');
  assert.match(tree, /connectFields/i);
  assert.match(tree, /settings\.connectFields/i);
  assert.match(tree, /filterPaths/i);
  assert.match(tree, /applyBlueprint[\s\S]{0,220}target|target[\s\S]{0,220}applyBlueprint/i);
  assert.match(tree, /addBlock[\s\S]{0,220}targetId|targetId[\s\S]{0,220}addBlock/i);
  assert.match(tree, /configure[\s\S]{0,220}changes\.connectFields|changes\.connectFields[\s\S]{0,220}configure/i);
  assert.match(tree, /targets:\s*\[\][\s\S]{0,160}清空|clear/i);
  assert.match(tree, /filterManager[\s\S]{0,160}(?:不要|do not|禁止)|(?:不要|do not|禁止)[\s\S]{0,160}filterManager/i);
  assert.match(tree, /titleField[\s\S]{0,120}(?:display-only|只控制|展示)|(?:display-only|只控制|展示)[\s\S]{0,120}titleField/i);
  assert.match(tree, /tree-connect-filter-path-type-mismatch/i);
  assert.match(tree, /intelType[\s\S]{0,160}(?:varchar|bigint|类型错误)|(?:varchar|bigint|类型错误)[\s\S]{0,160}intelType/i);
  assert.match(
    wholePageQuick,
    /tree filter|树筛选/i,
    'whole-page-quick should keep tree filter routing visible',
  );
  assert.match(
    wholePageQuick,
    /settings\.connectFields[\s\S]{0,160}Blueprint|Blueprint[\s\S]{0,160}settings\.connectFields/i,
    'whole-page-quick should prefer blueprint-stage tree connectFields wiring',
  );
  assert.match(
    localEditQuick,
    /addBlock[\s\S]{0,160}settings\.connectFields|settings\.connectFields[\s\S]{0,160}addBlock/i,
    'local-edit-quick should document addBlock tree connectFields wiring',
  );
  assert.match(
    localEditQuick,
    /configure[\s\S]{0,160}changes\.connectFields|changes\.connectFields[\s\S]{0,160}configure/i,
    'local-edit-quick should document configure tree connectFields wiring',
  );

  const boundaryQuick = read('references/boundary-quick.md');
  assert.match(boundaryQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(boundaryQuick, /boundary-report\.md/i);
  assert.match(boundaryQuick, /Do not inspect runtime, scripts, helper docs, or a live workspace/i);
  assert.match(boundaryQuick, /nocobase-acl-manage/i);
  assert.match(boundaryQuick, /nocobase-data-modeling/i);
  assert.match(boundaryQuick, /nocobase-workflow-manage/i);

  const templateQuick = read('references/template-quick.md');
  assert.match(templateQuick, /\[templates\.md\]/i);
  assert.match(templateQuick, /page-scoped wording/i);
  assert.match(templateQuick, /"autoDetachToCopy"\s*:\s*false/i);
  assert.match(templateQuick, /"needsClarification"\s*:\s*true/i);
  assert.match(templateQuick, /"templateOwnedContentRoute"/i);
  assert.match(templateQuick, /"hostOpenViewConfigRoute"/i);

  const helperContracts = read('references/helper-contracts.md');
  assert.match(helperContracts, /real write|prewrite-validation/i);
  assert.match(helperContracts, /common-case drafting|not the default first stop/i);
  assert.match(helperContracts, /prepare-write/i);
  assert.match(helperContracts, /prepareApplyBlueprintRequest/i);
  assert.match(helperContracts, /nb-runjs/i);
  assert.match(helperContracts, /nb-localized-write-preflight/i);
  assert.match(helperContracts, /does not execute `?nb`?|does not wrap the transport|local\/read-only/i);
  assert.match(helperContracts, /node skills\/nocobase-ui-builder\/runtime\/bin\/nb-page-preview\.mjs/i);
  assert.match(helperContracts, /node skills\/nocobase-ui-builder\/runtime\/bin\/nb-runjs\.mjs/i);
  assert.match(helperContracts, /node skills\/nocobase-ui-builder\/runtime\/bin\/nb-localized-write-preflight\.mjs/i);
  assert.doesNotMatch(helperContracts, /- CLI:\s*`nb-page-preview\b/i);
  assert.doesNotMatch(helperContracts, /- CLI:\s*`nb-runjs\b/i);

  const cliTransport = read('references/cli-transport.md');
  assert.match(cliTransport, /node skills\/nocobase-ui-builder\/runtime\/bin\/<helper>\.mjs/i);
  assert.match(cliTransport, /do not probe bare PATH commands first/i);

  const executionChecklistLocalCli = read('references/execution-checklist.md');
  assert.match(executionChecklistLocalCli, /node skills\/nocobase-ui-builder\/runtime\/bin\/nb-page-preview\.mjs/i);

  const cliCommandSurface = read('references/cli-command-surface.md');
  assert.match(cliCommandSurface, /node skills\/nocobase-ui-builder\/runtime\/bin\/nb-page-preview\.mjs --prepare-write/i);

  const pageIntent = read('references/page-intent.md');
  assert.match(pageIntent, /node skills\/nocobase-ui-builder\/runtime\/bin\/nb-page-preview\.mjs/i);

  const normativeContract = read('references/normative-contract.md');
  assert.match(normativeContract, /node skills\/nocobase-ui-builder\/runtime\/bin\/<helper>\.mjs/i);

  const localEditQuickHelper = read('references/local-edit-quick.md');
  assert.match(localEditQuickHelper, /nb-localized-write-preflight/i);
  assert.match(localEditQuickHelper, /runLocalizedWritePreflight/i);
  assert.match(localEditQuickHelper, /does not wrap or execute the nb transport|explicit `?nb api flow-surfaces/i);

});

test('whole-page applyBlueprint docs default to success-only completion while localized and chart readback stays explicit', () => {
  const canonicalStopPoint = /A successful `?apply(?:-)?blueprint`? response is the default stop point\.[\s\S]{0,140}Run follow-up `?get`? only when follow-up localized work or explicit inspection needs live structure\./i;

  const skill = read('SKILL.md');
  assert.match(
    skill,
    canonicalStopPoint,
    'SKILL.md should make successful whole-page applyBlueprint responses the default stop point',
  );
  assert.match(
    skill,
    /request intent rather than as a normalized persisted subtree/i,
    'SKILL.md should keep success-only whole-page reporting distinct from persisted-readback reporting',
  );

  const executionChecklist = read('references/execution-checklist.md');
  assert.match(
    executionChecklist,
    canonicalStopPoint,
    'execution-checklist should stop whole-page apply-blueprint by default after a successful response',
  );
  assert.doesNotMatch(
    executionChecklist,
    /Verify with `get\(\{ pageSchemaUid \}\)`/i,
    'execution-checklist should no longer require a default get({ pageSchemaUid }) verification step for whole-page apply-blueprint',
  );

  const verification = read('references/verification.md');
  assert.doesNotMatch(
    verification,
    /^- A successful write response is not enough; confirm via readback\.$/im,
    'verification should not require universal readback for whole-page applyBlueprint success responses',
  );
  assert.match(
    verification,
    /Whole-page `?applyBlueprint`? create \/ replace[\s\S]{0,120}default to successful-response completion/i,
    'verification should mark whole-page applyBlueprint success responses as the default completion path',
  );
  assert.match(
    verification,
    /`apply-blueprint` create \| default: none after successful response/i,
    'verification should make apply-blueprint create readback optional by default',
  );
  assert.match(
    verification,
    /`apply-blueprint` replace \| default: none after successful response/i,
    'verification should make apply-blueprint replace readback optional by default',
  );
  assert.match(
    verification,
    /`apply-blueprint` with `reaction\.items\[\]` \| default: none after successful response/i,
    'verification should make whole-page reaction.items[] readback optional by default',
  );
  assert.match(
    verification,
    /do not describe popup subtree, template binding, reaction slot placement, or normalized page structure as persisted\/readback-verified facts yet/i,
    'verification should keep success-only whole-page reporting from sounding like persisted readback',
  );

  const pageBlueprint = read('references/page-blueprint.md');
  assert.doesNotMatch(
    pageBlueprint,
    /resolved page target plus final `surface` readback/i,
    'page-blueprint should no longer describe applyBlueprint response as a final surface readback',
  );
  assert.match(
    pageBlueprint,
    canonicalStopPoint,
    'page-blueprint should align its response semantics with the success-only whole-page contract',
  );

  const wholePageQuick = read('references/whole-page-quick.md');
  assert.match(
    wholePageQuick,
    canonicalStopPoint,
    'whole-page-quick should stop after successful applyBlueprint unless follow-up work needs live reads',
  );

  const runtime = read('references/runtime-playbook.md');
  assert.match(
    runtime,
    canonicalStopPoint,
    'runtime-playbook should make successful apply-blueprint responses the default stop point',
  );

  const popup = read('references/popup.md');
  assert.match(
    popup,
    canonicalStopPoint,
    'popup.md should split whole-page popup success from localized popup readback',
  );
  assert.match(
    popup,
    /do not claim the final normalized popup subtree, template binding, or nested popup persistence as a readback-verified fact/i,
    'popup.md should avoid phrasing whole-page popup outcomes as readback-verified facts without a follow-up get',
  );
  assert.match(
    popup,
    /For localized popup writes, or when explicit post-write inspection is requested, confirm:/i,
    'popup.md should keep localized popup readback explicit',
  );

  const localEditQuick = read('references/local-edit-quick.md');
  assert.match(
    localEditQuick,
    /after the write, read back the persisted actions, popup\/template binding, and click\/open behavior/i,
    'local-edit-quick should keep localized popup/action readback requirements',
  );

  const toolShapes = read('references/tool-shapes.md');
  assert.match(
    toolShapes,
    /Use `get` for normal structural inspection and post-write readback\./i,
    'tool-shapes should keep low-level get readback guidance intact',
  );

  const chartCore = read('references/chart-core.md');
  assert.match(
    chartCore,
    /Minimum required post-write readback:/i,
    'chart-core should keep chart post-write readback requirements intact',
  );

  const normative = read('references/normative-contract.md');
  assert.match(
    normative,
    canonicalStopPoint,
    'normative-contract should make follow-up get conditional for whole-page create',
  );
});

test('whole-page authoring docs keep menu, layout, and filter gates aligned with runtime', () => {
  const skill = read('SKILL.md');
  assert.match(
    skill,
    /at most one non-filter block[\s\S]{0,120}explicit layout is required|explicit layout is required[\s\S]{0,120}at most one non-filter block/i,
    'SKILL.md should only allow layout omission for single non-filter-block scopes',
  );
  assert.doesNotMatch(
    skill,
    /If unsure, omit it\./i,
    'SKILL.md should not keep the generic omit-layout fallback',
  );

  const pageIntent = read('references/page-intent.md');
  assert.match(
    pageIntent,
    /navigation\.group[\s\S]{0,80}navigation\.item[\s\S]{0,120}semantic Ant Design icon/i,
    'page-intent should require semantic icons for create navigation',
  );
  assert.match(
    pageIntent,
    /multiple non-filter blocks[\s\S]{0,120}explicit `?layout`?/i,
    'page-intent should require explicit layout for multi-block scopes',
  );
  assert.match(
    pageIntent,
    /layout[\s\S]{0,120}real keyed blocks[\s\S]{0,120}places every keyed block/i,
    'page-intent should require explicit layouts to reference and place keyed blocks correctly',
  );
  assert.match(
    pageIntent,
    /filterForm[\s\S]{0,80}4 or more fields[\s\S]{0,80}`?collapse`?/i,
    'page-intent should require collapse for larger filter forms',
  );
  assert.doesNotMatch(
    pageIntent,
    /Omit `?layout` when it is not essential or not fully decided/i,
    'page-intent should no longer allow generic layout omission for multi-block scopes',
  );

  const asciiPreview = read('references/ascii-preview.md');
  assert.match(
    asciiPreview,
    /at most one non-filter block[\s\S]{0,120}vertical order/i,
    'ascii-preview should limit vertical-order fallback to valid single-block scopes',
  );
  assert.match(
    asciiPreview,
    /prepare-write validation failure|validation failure/i,
    'ascii-preview should treat missing multi-block layout as a gate failure, not a valid default',
  );

  const normative = read('references/normative-contract.md');
  assert.match(
    normative,
    /newly created `?navigation\.group`?[\s\S]{0,80}`?navigation\.item`?[\s\S]{0,80}semantic Ant Design icon/i,
    'normative contract should require semantic icons for new create navigation',
  );
  assert.match(
    normative,
    /multiple non-filter blocks[\s\S]{0,120}explicit `?layout`? is required/i,
    'normative contract should require explicit layout for multi-block scopes',
  );
  assert.match(
    normative,
    /explicit `?layout`? may reference only real block keys[\s\S]{0,120}every keyed block/i,
    'normative contract should require explicit layout to place keyed blocks',
  );
  assert.match(
    normative,
    /filterForm[\s\S]{0,80}4 or more fields[\s\S]{0,80}`?collapse`?/i,
    'normative contract should require collapse for larger filter forms',
  );
  assert.match(
    normative,
    /"item": \{ "title": "Employees", "icon": "TeamOutlined" \}/i,
    'normative contract create examples should show icon on new navigation.item',
  );

  const toolShapes = read('references/tool-shapes.md');
  assert.match(
    toolShapes,
    /at most one non-filter block[\s\S]{0,120}explicit keyed layout is required|explicit keyed layout is required[\s\S]{0,120}at most one non-filter block/i,
    'tool-shapes should only allow layout omission for single non-filter-block scopes',
  );
  assert.doesNotMatch(
    toolShapes,
    /If you are unsure, omit it\./i,
    'tool-shapes should not keep the generic omit-layout fallback',
  );
  assert.match(
    toolShapes,
    /"item": \{ "title": "Employees", "icon": "TeamOutlined" \}/i,
    'tool-shapes create example should show icon on new navigation.item',
  );

  const executionChecklist = read('references/execution-checklist.md');
  assert.match(
    executionChecklist,
    /at most one non-filter block[\s\S]{0,120}explicit layout is required|explicit layout is required[\s\S]{0,120}at most one non-filter block/i,
    'execution-checklist should only allow layout omission for single non-filter-block scopes',
  );
  assert.doesNotMatch(
    executionChecklist,
    /If unsure, omit it\./i,
    'execution-checklist should not keep the generic omit-layout fallback',
  );
});

test('large field-grid docs require fieldGroups on create edit and details blocks', () => {
  const skill = read('SKILL.md');
  assert.match(
    skill,
    /createForm[\s\S]{0,80}editForm[\s\S]{0,80}details[\s\S]{0,160}more than 10[\s\S]{0,120}`?fieldGroups`?/i,
    'SKILL.md should require fieldGroups when createForm/editForm/details exceed 10 fields',
  );

  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(
    pageBlueprint,
    /createForm[\s\S]{0,80}editForm[\s\S]{0,80}details[\s\S]{0,160}more than 10[\s\S]{0,120}`?fieldGroups`?/i,
    'page-blueprint should require fieldGroups for large field-grid blocks',
  );
  assert.match(
    pageBlueprint,
    /fieldGroups[\s\S]{0,120}fieldsLayout[\s\S]{0,120}(cannot|must not|mutually exclusive)/i,
    'page-blueprint should keep fieldGroups and fieldsLayout mutually exclusive',
  );

  const wholePageQuick = read('references/whole-page-quick.md');
  assert.match(
    wholePageQuick,
    /more than 10[\s\S]{0,120}`?fieldGroups`?[\s\S]{0,120}createForm|createForm[\s\S]{0,80}editForm[\s\S]{0,80}details/i,
    'whole-page-quick should require fieldGroups for large form/details authoring',
  );

  const normative = read('references/normative-contract.md');
  assert.match(
    normative,
    /createForm[\s\S]{0,80}editForm[\s\S]{0,80}details[\s\S]{0,160}more than 10[\s\S]{0,120}`?fieldGroups`?/i,
    'normative-contract should treat fieldGroups as mandatory for large field-grid blocks',
  );

  const defaultPrompt = read('agents/openai.yaml');
  assert.match(
    defaultPrompt,
    /more than 10[\s\S]{0,120}fieldGroups|fieldGroups[\s\S]{0,120}(?:more than 10|>10)/i,
    'default prompt should keep the large-field grouping guardrail visible',
  );
});

test('defaults collection fieldGroups docs keep the large-popup threshold visible', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/normative-contract.md',
    'references/tool-shapes.md',
  ]) {
    const text = read(relativePath);
    assert.match(
      text,
      /defaults\.collections[\s\S]{0,240}fieldGroups[\s\S]{0,240}(more than 10|10 or fewer|effective fields)/i,
      `${relativePath} should explain that defaults collection fieldGroups are only for large generated popups`,
    );
  }

  const defaultPrompt = read('agents/openai.yaml');
  assert.match(
    defaultPrompt,
    /defaults\.collections[\s\S]{0,120}fieldGroups[\s\S]{0,160}(more than 10|>10|effective fields)/i,
    'default prompt should keep the defaults collection fieldGroups threshold visible',
  );
});

test('whole-page defaults docs require recomputing involved collections and keep fieldGroups target-scoped', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/tool-shapes.md',
  ]) {
    const text = read(relativePath);
    assert.match(
      text,
      /(recompute|rebuild)[\s\S]{0,160}(involved|defaults\.collections)[\s\S]{0,160}(live metadata|from scratch)/i,
      `${relativePath} should require rebuilding involved collection defaults from live metadata`,
    );
    assert.match(
      text,
      /fieldGroups[\s\S]{0,360}(target collection|collection-only|do not create per-association)[\s\S]{0,360}popups\.associations|popups\.associations[\s\S]{0,360}(target collection|collection-only|do not create per-association)[\s\S]{0,360}fieldGroups|popups\.associations[\s\S]{0,360}fieldGroups[\s\S]{0,360}(target collection|collection-only|do not create per-association)/i,
      `${relativePath} should keep target-collection fieldGroups separate from association popup naming`,
    );
  }

  const defaultPrompt = read('agents/openai.yaml');
  assert.match(
    defaultPrompt,
    /(recompute|rebuild)[\s\S]{0,120}(involved target collections|defaults\.collections)[\s\S]{0,120}(live metadata|from scratch)/i,
    'default prompt should require rebuilding involved collection defaults from live metadata',
  );
});

test('association popup defaults docs keep first-segment keying visible', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/helper-contracts.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/tool-shapes.md',
    'references/normative-contract.md',
  ]) {
    const text = read(relativePath);
    assert.match(
      text,
      /popups\.associations[\s\S]{0,240}(first relation segment|first segment)|(?:first relation segment|first segment)[\s\S]{0,240}popups\.associations/i,
      `${relativePath} should keep association popup defaults keyed by the first relation segment`,
    );
  }

  const defaultPrompt = read('agents/openai.yaml');
  assert.match(
    defaultPrompt,
    /associations[\s\S]{0,40}first-?segment|first-?segment[\s\S]{0,40}associations/i,
    'default prompt should keep first-segment association popup keying visible',
  );
});

test('whole-page defaults docs keep the fixed popup trio and table addNew threshold visible', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/helper-contracts.md',
    'references/execution-checklist.md',
    'references/page-intent.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/tool-shapes.md',
    'references/normative-contract.md',
  ]) {
    const text = read(relativePath);
    assert.doesNotMatch(text, /actions actually used/i, `${relativePath} should not keep the old actions-actually-used wording`);
    assert.match(
      text,
      /view[\s\S]{0,80}addNew[\s\S]{0,80}edit|addNew[\s\S]{0,80}edit[\s\S]{0,80}view/i,
      `${relativePath} should keep the fixed view/addNew/edit defaults trio visible`,
    );
    assert.match(
      text,
      /table[\s\S]{0,220}addNew[\s\S]{0,220}(threshold|effective fields|fieldGroups|check)/i,
      `${relativePath} should say table blocks always participate in addNew threshold evaluation`,
    );
  }

  const defaultPrompt = read('agents/openai.yaml');
  assert.match(
    defaultPrompt,
    /fixed[\s\S]{0,80}view[\s\S]{0,40}addNew[\s\S]{0,40}edit|view[\s\S]{0,40}addNew[\s\S]{0,40}edit[\s\S]{0,80}fixed/i,
    'default prompt should keep the fixed popup trio visible',
  );
  assert.match(
    defaultPrompt,
    /table[\s\S]{0,80}addNew[\s\S]{0,120}(threshold|fieldGroups)/i,
    'default prompt should keep the table addNew threshold rule visible',
  );

  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(
    pageBlueprint,
    /"associations"\s*:\s*\{[\s\S]{0,80}"roles"\s*:\s*\{[\s\S]{0,160}"view"[\s\S]{0,160}"addNew"[\s\S]{0,160}"edit"/i,
    'page-blueprint defaults example should show the fixed association popup trio',
  );

  const wholePageQuick = read('references/whole-page-quick.md');
  assert.match(
    wholePageQuick,
    /"associations"\s*:\s*\{[\s\S]{0,80}"assignee"\s*:\s*\{[\s\S]{0,160}"view"[\s\S]{0,160}"addNew"[\s\S]{0,160}"edit"/i,
    'whole-page-quick defaults example should show the fixed association popup trio',
  );
});

test('helper contracts document prepare-write collectionMetadata auto-resolution', () => {
  const helperContracts = read('references/helper-contracts.md');
  assert.match(helperContracts, /auto-resolves missing `?collectionMetadata`? entries/i);
  assert.match(helperContracts, /data-modeling collections get/i);
  assert.match(helperContracts, /resource list/i);
  assert.match(helperContracts, /--no-auto-collection-metadata/i);
  assert.match(helperContracts, /collectionMetadata/i);
  assert.match(helperContracts, /data-bound block/i);
  assert.match(helperContracts, /missing-collection-metadata/i);
  assert.match(helperContracts, /validate[s]?(?: fixed)? defaults completeness/i);
  assert.match(helperContracts, /caller-supplied[\s\S]{0,80}wins/i);
  assert.match(helperContracts, /does not auto-fetch missing metadata/i);
  assert.doesNotMatch(helperContracts, /defaultsRequirements\.skipped|skip(?:s|ped)? completeness|skip(?:s|ped)? defaults/i);
  assert.match(helperContracts, /do not use it as a schema-aware planner/i);
});

test('localized preflight docs keep explicit helper-vs-transport boundary', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /explicit local validator|not as a transport wrapper/i);
  assert.match(skill, /later explicit `?nb api flow-surfaces/i);
  assert.match(skill, /backend runtime remains compatibility-tolerant|compatibility-tolerant/i);

  const helperContracts = read('references/helper-contracts.md');
  assert.match(helperContracts, /local\/read-only/i);
  assert.match(helperContracts, /does not execute `?nb`?/i);
  assert.match(helperContracts, /does not wrap the transport/i);
  assert.match(helperContracts, /later explicit `?nb api flow-surfaces/i);

  const localEditQuick = read('references/local-edit-quick.md');
  assert.match(localEditQuick, /later explicit `?nb api flow-surfaces/i);
  assert.match(localEditQuick, /does not wrap or execute the nb transport/i);

  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.match(defaultPrompt, /local preflight/i);
  assert.match(defaultPrompt, /explicit nb write remains direct/i);
});

test('prepare-write helper-envelope docs explain collectionMetadata requirements', () => {
  for (const relativePath of [
    'references/ascii-preview.md',
    'references/template-decision-summary.md',
  ]) {
    const text = read(relativePath);
    assert.match(text, /blueprint/i, `${relativePath} should keep the helper envelope blueprint payload`);
    assert.doesNotMatch(text, /requestBody/i, `${relativePath} should not keep the old helper payload name`);
    assert.match(text, /templateDecision/i, `${relativePath} should keep templateDecision in the helper envelope`);
    assert.match(text, /collectionMetadata/i, `${relativePath} should document collectionMetadata in the helper envelope`);
    assert.match(text, /data-bound/i, `${relativePath} should explain when collectionMetadata is required`);
    assert.match(text, /missing-collection-metadata/i, `${relativePath} should name the hard-fail rule`);
  }
});

test('whole-page docs keep applyBlueprint defaults v1 constraints explicit', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/normative-contract.md',
  ]) {
    const text = read(relativePath);
    assert.match(
      text,
      /defaults\.collections/i,
      `${relativePath} should document top-level defaults.collections`,
    );
    assert.match(
      text,
      /popups\.associations/i,
      `${relativePath} should document association popup defaults with associations naming`,
    );
    assert.match(
      text,
      /defaults\.collections[\s\S]{0,240}popups[\s\S]{0,160}(?:\{\s*name,\s*description\s*\}|name[\s\S]{0,40}description|description[\s\S]{0,40}name)/i,
      `${relativePath} should require popup defaults to carry both name and description`,
    );
    assert.match(
      text,
      /defaults\.blocks|do not generate `?defaults\.blocks`?|must not include `?defaults\.blocks`?/i,
      `${relativePath} should prohibit defaults.blocks`,
    );
  }

  const toolShapes = read('references/tool-shapes.md');
  assert.match(
    toolShapes,
    /"addNew": \{ "name": "[^"]+", "description": "[^"]+" \}[\s\S]{0,120}"view": \{ "name": "[^"]+", "description": "[^"]+" \}[\s\S]{0,120}"edit": \{ "name": "[^"]+", "description": "[^"]+" \}/i,
    'tool-shapes should keep popup descriptions in the defaults example',
  );

  const defaultPrompt = read('agents/openai.yaml');
  assert.match(
    defaultPrompt,
    /popups?[\s\S]{0,80}\{\s*name,\s*description\s*\}[\s\S]{0,120}associations|associations[\s\S]{0,120}popups?[\s\S]{0,80}\{\s*name,\s*description\s*\}/i,
    'default prompt should keep popup defaults { name, description } and associations visible together',
  );
});

test('general skill docs stay env-neutral while helper scripts avoid fixed local server defaults', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/boundary-quick.md',
    'references/verification.md',
    'references/whole-page-quick.md',
    'references/reaction-quick.md',
    'references/reaction.md',
    'references/js-models/js-item.md',
  ]) {
    assertFileDoesNotContain(relativePath, /nblocal/i, `${relativePath} should not bind the general skill to nblocal`);
  }

  for (const relativePath of [
    'SKILL.md',
    'references/boundary-quick.md',
    'references/reaction-quick.md',
    'references/verification.md',
    'references/whole-page-quick.md',
  ]) {
    assertFileDoesNotContain(
      relativePath,
      /runtime\/benchmarks\/real-build|\.artifacts\/nocobase-ui-builder-real-build|real-build benchmark/i,
      `${relativePath} should not depend on the private real-build benchmark pack`,
    );
  }

  for (const relativePath of [
    'scripts/rest_template_clone_runner.mjs',
    'scripts/live_template_catalog.mjs',
    'scripts/validation_browser_smoke.mjs',
  ]) {
    assertFileDoesNotContain(
      relativePath,
      /127\.0\.0\.1:23000/,
      `${relativePath} should require explicit runtime URL input instead of using a fixed localhost default`,
    );
  }
});

test('skill docs keep helper command examples portable', () => {
  const markdownFiles = ['SKILL.md', ...walkMarkdownFiles('references')];
  for (const relativePath of markdownFiles) {
    assertFileDoesNotContain(
      relativePath,
      /CODEX_HOME:-\$HOME\/\.codex|\/skills\/nocobase-ui-builder\/runtime\/bin\//,
      `${relativePath} should not hard-code the skill install root in helper command examples`,
    );
  }
});
