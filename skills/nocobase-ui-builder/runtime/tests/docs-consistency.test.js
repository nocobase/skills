import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));
const backendWritePattern = /nb api flow-surfaces/i;
const forbiddenWriteGatePattern =
  /mandatory local prepare-write|prepare-write is mandatory|result\.cliBody|cliBody only|local preflight|nb-flow-surfaces\.mjs apply-blueprint|flow-surfaces behind the wrapper|wrapper is the public entry|wrapper raw body|must run the local validator|local validator gate|validator failure is failure|write cannot continue|RunJS validator gate before/i;

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function assertFileDoesNotContain(relativePath, pattern, message) {
  assert.doesNotMatch(read(relativePath), pattern, message || `${relativePath} should not contain ${pattern}`);
}

function assertBackendFirstWriteContract(relativePath) {
  const text = read(relativePath);
  assert.match(text, backendWritePattern, `${relativePath} should document direct nb api flow-surfaces writes`);
  assert.doesNotMatch(
    text,
    forbiddenWriteGatePattern,
    `${relativePath} should not require wrapper/preflight/cliBody write gates`,
  );
}

function assertNavigationGroupDocsDoNotKeepOldMetadataRules(relativePath) {
  const text = read(relativePath);
  assert.doesNotMatch(
    text,
    /title-only (?:unique )?same-title reuse|same-title reuse is title-only|one-match title-only reuse/i,
    `${relativePath} should not describe existing navigation group reuse as title-only`,
  );
  assert.doesNotMatch(
    text,
    /navigation\.group\.routeId[\s\S]{0,120}(?:exact targeting only|do not mix|must not be mixed)[\s\S]{0,120}(?:icon|tooltip|hideInMenu)/i,
    `${relativePath} should not forbid ignored navigation.group metadata when routeId is present`,
  );
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

function extractH2Section(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingMatch = markdown.match(new RegExp(`^##\\s+${escaped}\\s*$`, 'm'));
  assert.ok(headingMatch, `should find h2 section "${heading}"`);
  const bodyStart = headingMatch.index + headingMatch[0].length;
  const remaining = markdown.slice(bodyStart);
  const nextHeading = remaining.match(/^##\s+/m);
  return nextHeading ? remaining.slice(0, nextHeading.index) : remaining;
}

function extractFences(markdown, language) {
  return [...markdown.matchAll(new RegExp(`^\\\`\\\`\\\`${language}\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, 'gm'))].map((match) => match[1]);
}

function extractCodeFences(markdown) {
  return [...markdown.matchAll(/^```(?:js|javascript|jsx|json)\n([\s\S]*?)\n```/gm)].map((match) => match[1]);
}

function maskJavaScriptSource(source) {
  return String(source ?? '').replace(
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|(["'`])(?:\\[\s\S]|(?!\1)[\s\S])*?\1/g,
    (match) => match.replace(/[^\n]/g, ' '),
  );
}

function assertRunjsSnippetShape(model, code, label) {
  assert.equal(typeof code, 'string', `${label} should have a code fence`);
  assert.match(code, /\S/, `${label} should not be empty`);
  assert.doesNotMatch(code, /\bctx\.openView\s*\(/, `${label} should not route popup/openView through RunJS`);
  assert.doesNotMatch(code, /\b(?:fetch|localStorage|sessionStorage)\b/, `${label} should avoid browser globals`);
  if (model !== 'JSActionModel' && model !== 'ChartEventsModel') {
    assert.match(code, /\bctx\.render\s*\(/, `${label} should render explicitly`);
  }
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

function assertFormBehaviorDescriptionReviewGuidance(text, relativePath) {
  assert.match(
    text,
    /description[\s\S]{0,320}defaults\.collections\.<collection>\.formBehavior|defaults\.collections\.<collection>\.formBehavior[\s\S]{0,320}description/i,
    `${relativePath} should connect field descriptions to collection formBehavior`,
  );
  assert.match(
    text,
    /formBehaviorDescriptionReview\.fields(?:\.<field>)?[\s\S]{0,360}decision|decision[\s\S]{0,360}formBehaviorDescriptionReview\.fields(?:\.<field>)?/i,
    `${relativePath} should document per-field formBehaviorDescriptionReview decisions`,
  );
  assert.match(
    text,
    /reasonCode[\s\S]{0,360}(?:noUiBehavior|unsupported)|(?:noUiBehavior|unsupported)[\s\S]{0,360}reasonCode/i,
    `${relativePath} should require reasonCode for non-implemented review decisions`,
  );
  assert.match(
    text,
    /implemented[\s\S]{0,360}(?:coverage|structured formBehavior)|(?:coverage|structured formBehavior)[\s\S]{0,360}implemented/i,
    `${relativePath} should explain implemented review entries require structured coverage`,
  );
  assert.match(
    text,
    /(?:old `?fields\[\]`?|old .*fields\[\]|hasTried)[\s\S]{0,220}(?:reject|rejected|do not|no)|(?:reject|rejected|do not|no)[\s\S]{0,220}(?:old `?fields\[\]`?|old .*fields\[\]|hasTried)/i,
    `${relativePath} should reject old array/hasTried review shapes`,
  );
  const strippedNegativeWarnings = text
    .split('\n')
    .filter((line) => {
      const mentionsNoopMarker = /formBehavior\s*:\s*\{\}|`?null`?/i.test(line);
      const isNegativeWarning =
        /do not use|instead of using|do not send|never use|rejects?|rejected|no-op|escape hatch|confirmation marker/i.test(
          line,
        );
      return !(mentionsNoopMarker && isNegativeWarning);
    })
    .join('\n');
  assert.doesNotMatch(
    strippedNegativeWarnings,
    /formBehavior\s*:\s*\{\}[\s\S]{0,120}(?:no-op|confirmation|confirm|escape hatch)|null[\s\S]{0,120}(?:no-op|confirmation|confirm|escape hatch)|formBehavior[\s\S]{0,360}(?:\{\}\s*(?:or|\/)|(?:or|\/)\s*`?null`?)/i,
    `${relativePath} should not recommend formBehavior: {} or null as a no-op`,
  );
}

function assertWholePageChartAssetGuidance(text, sourceLabel) {
  assert.match(
    text,
    /assets\.charts[\s\S]{0,160}block\.chart|block\.chart[\s\S]{0,160}assets\.charts/i,
    `${sourceLabel} should document the canonical assets.charts + block.chart shape`,
  );
  assert.match(
    text,
    /(?:does not auto-lift|does not provide inline chart automatic|不提供 inline chart 自动提升|不自动提升)[\s\S]{0,220}(?:settings\.query|settings\.visual)|(?:settings\.query|settings\.visual)[\s\S]{0,220}(?:manually move|manual(?:ly)? migrate|手动迁移|move .*assets\.charts)/i,
    `${sourceLabel} should say whole-page inline chart settings are not auto-lifted and must be migrated manually`,
  );
  assert.match(
    text,
    /chart-block-asset-reference-required/i,
    `${sourceLabel} should document backend chart-block-asset-reference-required errors`,
  );
  assert.match(
    text,
    /chart-block-asset-reference-missing/i,
    `${sourceLabel} should document backend chart-block-asset-reference-missing errors`,
  );
  assert.match(
    text,
    /(?:do not mix|不要混写|do not put|don't put)[\s\S]{0,160}block\.chart[\s\S]{0,160}settings\.query[\s\S]{0,160}settings\.visual/i,
    `${sourceLabel} should discourage mixed block.chart and inline chart settings`,
  );
  assert.match(
    text,
    /stepParams[\s\S]{0,140}(?:do not|must not|not accept|unsupported|不要|不接受)|(?:do not|must not|not accept|unsupported|不要|不接受)[\s\S]{0,140}stepParams/i,
    `${sourceLabel} should keep whole-page chart stepParams as an explicit rejection boundary`,
  );
  assert.doesNotMatch(
    text,
    /repairable-shape-error|expectedAssetPath/i,
    `${sourceLabel} should not document removed local inline-chart repair details`,
  );
  assert.doesNotMatch(
    text,
    /applyBlueprint[\s\S]{0,220}(?:inline|settings\.query)[\s\S]{0,260}(?:normalized by backend authoring|normalizes? it into `?assets\.charts|提升到 `?assets\.charts)/i,
    `${sourceLabel} should not claim backend auto-lifts whole-page inline chart settings`,
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
    /localized existing-surface edits[\s\S]{0,160}(?:`compose`|`configure`|`add-\*|backend actions|nb api flow-surfaces)[\s\S]{0,160}\[local-edit-quick\.md\]/i,
    'SKILL.md should route localized edits through backend actions and local-edit-quick.md',
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
    /Do not open \[tool-shapes\.md\][\s\S]{0,120}preparing a real nb body/i,
    'SKILL.md should keep tool-shapes behind the real-write stage',
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

function assertSharedMenuGroupMultiPageRunsAreSerialized(text, sourceLabel) {
  assert.match(
    text,
    /(?:multiple|several|multi-page|多个|多页面)[\s\S]{0,220}(?:same|shared|同一|共享)[\s\S]{0,160}(?:navigation\.group\.title|menu group|菜单组|group title)/i,
    `${sourceLabel} should identify multi-page requests that share one menu group title`,
  );
  assert.match(
    text,
    /(?:serial|sequential|ordered|串行|顺序)[\s\S]{0,200}(?:applyBlueprint|single-page runs|page runs|页面)/i,
    `${sourceLabel} should require serialized page creation for shared menu-group multi-page runs`,
  );
  assert.match(
    text,
    /(?:first|first page|第一页|首个页面)[\s\S]{0,220}(?:title|navigation\.group\.title)[\s\S]{0,260}(?:routeId|response|desktopRoutes|响应)/i,
    `${sourceLabel} should allow the first shared-group page to create or resolve the group and capture routeId`,
  );
  assert.match(
    text,
    /(?:subsequent|later|remaining|后续|其余)[\s\S]{0,220}(?:navigation\.group[\s\S]{0,80}\{\s*["']?routeId|routeId)[\s\S]{0,220}(?:not|never|不要|不得|禁止)[\s\S]{0,120}(?:title-only|title only|只用 title|navigation\.group\.title)/i,
    `${sourceLabel} should require later shared-group pages to use the captured routeId instead of title-only creation`,
  );
  assert.match(
    text,
    /(?:parallel|concurrent|并发|同时)[\s\S]{0,180}(?:title-only|navigation\.group\.title|same-title|同名|共享 group|共享菜单组)[\s\S]{0,180}(?:forbid|forbidden|prohibit|禁止|不得|do not|never)/i,
    `${sourceLabel} should explicitly forbid concurrent title-only shared-group creates`,
  );
}

function assertMenuDiscoveryUsesCanonicalNbResourceRead(text, sourceLabel) {
  assert.match(
    text,
    /nb api resource list --resource ['"]desktopRoutes:listAccessible['"] --no-paginate -j/i,
    `${sourceLabel} should document the canonical visible desktop menu discovery command`,
  );
  assert.doesNotMatch(
    text,
    /nb api desktop-routes list-accessible/i,
    `${sourceLabel} should not recommend the unavailable desktop-routes CLI family`,
  );
}

function assertSameGroupSameTitlePageIdentityRule(text, sourceLabel) {
  assert.match(
    text,
    /(?:page identity|same page|duplicate page|same-title page|页面身份|同一个页面|重复页面)[\s\S]{0,220}(?:navigation\.group\.routeId|menu group routeId|group routeId|菜单组[\s\S]{0,40}routeId)[\s\S]{0,220}(?:page\.title|page title|页面标题)/i,
    `${sourceLabel} should define page identity as menu group routeId plus page title`,
  );
  assert.match(
    text,
    /(?:same group|same menu group|同一菜单组|同组)[\s\S]{0,160}(?:same title|same page title|同名|相同标题)[\s\S]{0,220}(?:replace|`replace`|mode[\s\S]{0,40}replace|自动替换)/i,
    `${sourceLabel} should say same-group same-title create upgrades to replace`,
  );
  assert.match(
    text,
    /(?:different group|different menu group|跨菜单组|不同菜单组|不同组)[\s\S]{0,180}(?:same title|same page title|同名|相同标题)[\s\S]{0,220}(?:not|do not|does not|不要|不应|不能)[\s\S]{0,100}(?:replace|merge|合并|替换|reuse|复用)/i,
    `${sourceLabel} should say different-group same-title pages do not auto-replace or merge`,
  );
}

function assertTitleOmissionRule(text, sourceLabel) {
  assert.match(
    text,
    /multiple non-filter blocks[\s\S]{0,260}(?:non-template-backed|template-backed[\s\S]{0,80}exempt|each data block needs|each data block has|each data block should have)[\s\S]{0,160}`?title`?/i,
    `${sourceLabel} should say multi-block scopes need non-template-backed data-block titles`,
  );
  assert.match(
    text,
    /template-backed blocks?[\s\S]{0,120}(?:exempt|exception|may omit|do not need|不需要|豁免)/i,
    `${sourceLabel} should preserve the template-backed multi-block title exception`,
  );
  assert.match(
    text,
    /(?:single non-filter block|scope with only one non-filter block)[\s\S]{0,180}(?:may|can) omit[\s\S]{0,120}(?:its )?(?:block )?`?title`?[\s\S]{0,120}(?:unless|except when)[\s\S]{0,80}(?:user|explicitly)[\s\S]{0,80}(?:asks|asked|requests|requested)/i,
    `${sourceLabel} should allow single-block scopes to omit the title while preserving the explicit user-request override`,
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
    /(?:pre-write reads|reads)[\s\S]{0,80}metadata fetch[\s\S]{0,80}(?:allowed|ok)/i,
    `${sourceLabel} should allow read-only prep work before the first mutating write`,
  );
  assert.match(
    text,
    /before[\s\S]{0,80}(?:applyBlueprint`? succeeds|success)[\s\S]{0,220}(?:createMenu|createPage|compose|configure|update-settings|updateSettings|add\*|move\*|remove\*|set\*Rules)/i,
    `${sourceLabel} should forbid low-level mutating writes before applyBlueprint succeeds`,
  );
  assert.match(
    text,
    /`?applyBlueprint`?[\s\S]{0,120}fail(?:s|ure)?[\s\S]{0,220}repair[\s\S]{0,160}(?:aggregate `?errors\[\]`?|backend aggregate errors|errors\[\])[\s\S]{0,160}retry[\s\S]{0,80}(?:5|five)|repair[\s\S]{0,160}(?:aggregate `?errors\[\]`?|backend aggregate errors|errors\[\])[\s\S]{0,160}retry[\s\S]{0,120}`?applyBlueprint`?[\s\S]{0,80}(?:5|five)/i,
    `${sourceLabel} should repair the blueprint from backend aggregate errors and retry up to 5 rounds on pre-success applyBlueprint failure`,
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
    /localized edits[\s\S]{0,80}(?:direct backend actions|nb api flow-surfaces|backend actions)/i,
    'openai prompt should keep direct backend routing visible for localized edits',
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
    /same-group[\s\S]{0,80}same-title[\s\S]{0,80}replace|page identity[\s\S]{0,80}routeId[\s\S]{0,80}page title/i,
    'openai prompt should keep same-group same-title page replacement guidance visible',
  );
  assert.match(
    text,
    /different-group[\s\S]{0,80}same-title[\s\S]{0,80}(?:not|no)[\s\S]{0,80}(?:replace|merge|reuse)/i,
    'openai prompt should keep different-group same-title non-merge guidance visible',
  );
  assert.match(
    text,
    /associatedRecords(?:\+| \+ )associationField/i,
    'openai prompt should keep associatedRecords+associationField guidance',
  );
  assert.match(text, /(?:exactly )?one `?editForm`?|1 `?editForm`?/i, 'openai prompt should keep one-editForm guidance');
  assert.match(
    text,
    /repeat-eligible[\s\S]{0,80}(?:(?:must|mandatory)[\s\S]{0,80})?contextual `?list-templates`?/i,
    'openai prompt should require contextual template probing for repeat-eligible scenes',
  );
  assert.match(text, /keyword-only search[\s\S]{0,40}discovery-only/i, 'openai prompt should keep keyword-only guardrail');
  assert.match(
    text,
    /backend order|first compatible row|first result|first returned row/i,
    'openai prompt should keep backend-order tie-break guidance',
  );
  assert.match(text, /popup\.tryTemplate|tryTemplate/i, 'openai prompt should mention popup.tryTemplate fallback');
  assert.match(text, /popup\.saveAsTemplate|saveAsTemplate/i, 'openai prompt should mention popup.saveAsTemplate');
  assert.match(text, /openView\.tryTemplate|apply .*popup|tryTemplate/i, 'openai prompt should mention existing-opener tryTemplate guidance');
  assert.match(
    text,
    /navigation\.group[\s\S]{0,80}navigation\.item[\s\S]{0,80}(?:semantic )?Ant ?Design `?icon`?|semantic Ant ?Design `?icon`?/i,
    'openai prompt should require semantic icons for newly created menu groups and items',
  );
  assert.match(
    text,
    /multi[- ]non[- ]filter[\s\S]{0,120}(?:explicit )?keyed `?layout`?|(?:explicit )?keyed `?layout`?[\s\S]{0,120}multi[- ]non[- ]filter/i,
    'openai prompt should require explicit keyed layout for multi-block tab or popup scopes',
  );
  assert.match(
    text,
    /filter[\s\S]{0,80}row ?1|filter alone in row 1|filter blocks? should sit alone/i,
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
    /reads\/metadata ok|reads[\s\S]{0,32}metadata[\s\S]{0,32}ok/i,
    'openai prompt should allow read-only prep before the first mutating write',
  );
  assert.match(
    text,
    /createMenu\/createPage\/compose\/configure\/updateSettings\/add\*\/move\*\/remove\*\/set\*Rules/i,
    'openai prompt should forbid pre-success low-level writes',
  );
  assert.match(
    text,
    /fail->repair aggregate errors\+retry<=5/i,
    'openai prompt should repair aggregate errors and retry up to 5 rounds on applyBlueprint failure',
  );
  assert.match(
    text,
    /no createMenu\/createPage\/compose\/configure\/updateSettings\/add\*\/move\*\/remove\*\/set\*Rules/i,
    'openai prompt should forbid low-level fallback before the first successful applyBlueprint',
  );
  assert.match(text, /report/i, 'openai prompt should report after exhausting retries');
  assert.match(
    text,
    /after success (?:localized repair only for explicit local\/live gap|only explicit local\/live gap repair)|success only explicit local\/live gap/i,
    'openai prompt should allow only narrow post-success repair',
  );
}

test('required docs and relative links stay valid', () => {
  const docs = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/ai-employee-actions.md',
    'references/aliases.md',
    'references/boundary-quick.md',
    'references/blocks/chart.md',
    'references/blocks/comments.md',
    'references/blocks/index.md',
    'references/blocks/kanban.md',
    'references/blocks/record-history.md',
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

test('upstream js snapshot relative links stay valid', () => {
  for (const relativePath of walkMarkdownFiles('runtime/reference-assets/upstream-js')) {
    assertRelativeMarkdownLinksExist(relativePath);
    assertNoRootRelativeMarkdownLinks(relativePath);
  }
});

test('docs keep canonical nb boundaries', () => {
  const skill = read('SKILL.md');
  assertBackendFirstWriteContract('SKILL.md');
  assert.match(skill, /Agent-facing write path is `nb api flow-surfaces <action>`/);
  assert.match(skill, /backend `flow-surfaces` is the authoring compiler/i);
  assert.match(skill, /aggregate `?errors\[\]`?/i);
  assert.doesNotMatch(skill, /nocobase-ctl|MCP fallback|flow_surfaces_|requestBody|collections:get/i);

  assertBackendFirstWriteContract('references/page-blueprint.md');
  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(pageBlueprint, /Agent-facing write path is `nb api flow-surfaces apply-blueprint`/);
  assert.match(pageBlueprint, /Do not wrap that object/i);

  assertBackendFirstWriteContract('references/normative-contract.md');
  const normativeContract = read('references/normative-contract.md');
  assert.match(normativeContract, /Agent-facing write path: `nb api flow-surfaces <action>`/);
  assert.match(normativeContract, /flow-surfaces is the authoring compiler/i);

  const templates = read('references/templates.md');
  assert.match(templates, /raw business object/i);

  const reaction = read('references/reaction.md');
  assert.match(reaction, /raw business object|backend/i);
  assert.match(reaction, /apply-blueprint/i);
  assert.match(reaction, /get-reaction-meta/i);

  const settings = read('references/settings.md');
  assert.match(settings, /set-layout/);
  assert.match(settings, /set-event-flows/);

  assertBackendFirstWriteContract('references/tool-shapes.md');
  const toolShapes = read('references/tool-shapes.md');
  assert.match(toolShapes, /do not wrap that object again/i);
  assert.match(toolShapes, /read commands such as `?get`? may use top-level locator flags and no JSON body/i);
  assert.doesNotMatch(toolShapes, /MCP fallback|requestBody|flow_surfaces_|collections:get/i);
  assert.doesNotMatch(
    toolShapes,
    /nb request body:\s*\n\s*\n```json\s*\{\s*"blueprint"\s*:/i,
    'tool-shapes should not present wrapped { blueprint: ... } bodies as canonical nb request bodies',
  );

  const helperContracts = read('references/helper-contracts.md');
  assert.doesNotMatch(helperContracts, /requestBody|tool-call envelope/i);
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
  assert.match(index, /\[js\.md\]/i, 'js-reference-index should route model work back to js.md');
  assert.doesNotMatch(index, /runjs-runtime\.md/i, 'js-reference-index should not route to the removed local runtime helper');
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
  assert.match(
    surfaceIndex,
    /\| Event Flow `?Execute JavaScript`? \|[^\n]*flowRegistry\.\*\.steps\.\*\.defaultParams\.code/i,
    'js-surfaces/index should expose the frontend event-flow defaultParams code path',
  );
  assert.match(surfaceIndex, /Linkage `?Execute JavaScript`?/i, 'js-surfaces/index should route linkage RunJS');
  assert.match(surfaceIndex, /value-return/i, 'js-surfaces/index should route value-return RunJS');
  assert.match(surfaceIndex, /js-model-render\.md/i, 'js-surfaces/index should route render JS models');
  assert.match(surfaceIndex, /js-model-action\.md/i, 'js-surfaces/index should route action JS models');
  assert.match(surfaceIndex, /\[..\/*js-models\/index\.md\]/i, 'js-surfaces/index should keep js-models as a later hop');

  const eventFlow = read('references/js-surfaces/event-flow.md');
  assert.match(eventFlow, /flowRegistry\.\*\.steps\.\*\.defaultParams\.code/i, 'event-flow surface doc should expose the writeback path');
  assert.match(eventFlow, /use = "runjs"/i, 'event-flow surface doc should expose the frontend step action shape');
  assert.match(eventFlow, /action-style/i, 'event-flow surface doc should describe action-style validation');

  const linkage = read('references/js-surfaces/linkage.md');
  assert.match(linkage, /linkageRunjs/i, 'linkage surface doc should name the linkage action');
  assert.match(linkage, /params\.value\.script/i, 'linkage surface doc should expose the writeback path');

  const valueReturn = read('references/js-surfaces/value-return.md');
  assert.match(valueReturn, /top-level `?return`? is required|top-level return is required/i, 'value-return doc should require return');
  assert.match(valueReturn, /ctx\.render/i, 'value-return doc should explicitly forbid ctx.render');

  const jsModelRender = read('references/js-surfaces/js-model-render.md');
  assert.match(jsModelRender, /ctx\.render\(\.\.\.\).*required|required.*ctx\.render/i, 'js-model-render doc should require ctx.render');
  assert.match(jsModelRender, /JSItemActionModel/i, 'js-model-render doc should include JS item action rendering');
  assert.match(jsModelRender, /popup-opener-record[\s\S]{0,160}ctx\.popup\.record/i, 'js-model-render doc should route popup opener records to ctx.popup.record');

  const jsModelAction = read('references/js-surfaces/js-model-action.md');
  assert.match(jsModelAction, /clickSettings\.runJs/i, 'js-model-action doc should expose action write path');
  assert.match(jsModelAction, /JSItemActionModel[\s\S]{0,120}render contract/i, 'js-model-action doc should route JS item action to render validation');
  assert.match(jsModelAction, /inner-row-record[\s\S]{0,180}ctx\.getVar\('ctx\.record/i, 'js-model-action doc should distinguish popup inner row record from popup opener record');

  const legacyIndex = read('references/js-models/index.md');
  assert.match(legacyIndex, /legacy/i, 'js-models/index should mark itself as a legacy entrypoint');
  assert.match(legacyIndex, /\[..\/js-surfaces\/index\.md\]/i, 'js-models/index should route back to js-surfaces/index.md');

  const jsAction = read('references/js-models/js-action.md');
  const jsActionFenceBodies = [...jsAction.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/gi)].map((match) => match[1]);
  assert.equal(jsActionFenceBodies.some((body) => /ctx\.openView\s*\(/i.test(body)), false, 'JSActionModel leaf doc should not provide ctx.openView final-code examples');
  assert.match(jsAction, /popup action|field popup|configuration|配置层/i, 'JSActionModel leaf doc should reroute popup/openView work to configuration');

  const catalog = JSON.parse(read('references/js-snippets/catalog.json'));
  assert.equal(
    catalog.snippets.some((entry) => entry.modelUses?.['js-model.action']?.includes('JSItemActionModel')),
    false,
    'JS item action should not be listed under action-style snippets',
  );
  assert.equal(
    catalog.snippets.some((entry) => entry.modelUses?.['js-model.render']?.includes('JSItemActionModel')),
    true,
    'JS item action should have render-style snippet coverage',
  );
  const safeIds = new Set(catalog.snippets.filter((entry) => entry.tier === 'safe').map((entry) => entry.id));
  const manifest = JSON.parse(read('references/js-surfaces/snippet-manifest.json'));
  const eventFlowSurface = manifest.surfaces.find((surface) => surface.id === 'event-flow.execute-javascript');
  assert.deepEqual(
    eventFlowSurface?.writePathHints,
    ['flowRegistry.*.steps.*.defaultParams.code'],
    'event-flow manifest should expose the frontend defaultParams code path',
  );
  const renderSurface = manifest.surfaces.find((surface) => surface.id === 'js-model.render');
  assert.deepEqual(
    renderSurface?.recommendedBySceneHint?.popup,
    ['render/open-popup-flow-model-button'],
    'js-model.render should recommend the persisted FlowModel opener snippet for popup opener scenes',
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

test('legacy js-model render docs keep Ant Design-first defaults', () => {
  const renderLeafDefaults = [
    ['references/js-models/js-block.md', '默认写法'],
    ['references/js-models/js-column.md', '默认写法'],
    ['references/js-models/js-field.md', '只读默认写法'],
    ['references/js-models/js-editable-field.md', '默认写法'],
    ['references/js-models/js-item.md', '默认写法'],
    ['references/js-models/rendering-contract.md', '默认模板'],
  ];

  for (const [relativePath, heading] of renderLeafDefaults) {
    const defaultSection = extractH2Section(read(relativePath), heading);
    const defaultExamples = extractCodeFences(defaultSection);
    assert.ok(defaultExamples.length > 0, `${relativePath} default render section should include code examples`);
    assert.equal(
      defaultExamples.some((example) => /ctx\.libs\.antd|ctx\.libs\.antdIcons/.test(example)),
      true,
      `${relativePath} default render section should use Ant Design libraries`,
    );
    for (const defaultExample of defaultExamples) {
      assert.doesNotMatch(defaultExample, /ctx\.render\s*\(\s*(?:'|"|`)\s*</, `${relativePath} default render example should not render an HTML string`);
      assert.doesNotMatch(defaultExample, /\b(?:document\.createElement|ctx\.element\.innerHTML)\b/, `${relativePath} default render example should not default to DOM construction`);
    }
  }

  const runjsOverview = read('references/js-models/runjs-overview.md');
  assert.match(
    runjsOverview,
    /渲染型 JS model 默认优先使用 `ctx\.libs\.antd` \/ `ctx\.libs\.antdIcons`/,
    'runjs overview should state the Ant Design-first render policy',
  );
  assert.doesNotMatch(
    runjsOverview,
    /页面内渲染\s*\|\s*`ctx\.render\(<div \/>`\s*或/i,
    'runjs overview should not keep bare div rendering as a default table entry',
  );

  for (const relativePath of walkMarkdownFiles('references/js-models')) {
    for (const jsonFence of extractFences(read(relativePath), 'json')) {
      assert.doesNotThrow(
        () => JSON.parse(jsonFence),
        `${relativePath} should keep json fences parseable`,
      );
    }
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
  assert.match(eventFlow, /get-event-flow-meta/i, 'event-flow snapshot should mention event-flow meta discovery');
  assert.match(eventFlow, /add-event-flow|set-event-flow|remove-event-flow/i, 'event-flow snapshot should mention fine-grained event-flow writes');
  assert.match(eventFlow, /set-event-flows/i, 'event-flow snapshot should mention set-event-flows');
  assert.match(eventFlow, /js\.md/i, 'event-flow snapshot should keep JS authoring boundary visible');

  for (const relativePath of [
    'runtime/reference-assets/upstream-js/interface-builder/linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/blocks/block-settings/field-linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/blocks/block-settings/block-linkage-rule.md',
    'runtime/reference-assets/upstream-js/interface-builder/actions/action-settings/linkage-rule.md',
  ]) {
    const text = read(relativePath);
    assert.match(text, /reaction\.md/i, `${relativePath} should route writes back to reaction.md`);
    assert.match(text, /js\.md/i, `${relativePath} should keep JS authoring boundary visible`);
  }

  const openView = read('runtime/reference-assets/upstream-js/runjs/context/open-view.md');
  assert.doesNotMatch(openView, /skill-mode validator/i, 'open-view snapshot should not mention the removed local validator');
  assert.match(openView, /do not|不要|不接受/i, 'open-view snapshot should explicitly warn against direct final output');
  assert.match(openView, /ctx\.openView\(\.\.\.\)|ctx\.openView/i, 'open-view snapshot should keep the warned API explicit');
  assert.match(openView, /js-reference-index\.md/i, 'open-view snapshot should route back to js-reference-index.md');
  assert.match(openView, /js\.md/i, 'open-view snapshot should route back to js.md');

  const requestDoc = read('runtime/reference-assets/upstream-js/runjs/context/request.md');
  assert.match(requestDoc, /http\/https/i, 'request snapshot should mention http/https guardrail for skill-mode');
  assert.match(requestDoc, /ctx\.initResource|ctx\.makeResource/i, 'request snapshot should redirect NocoBase resource access to resource APIs');
});

test('canonical patched JS examples satisfy backend-owned minimum contracts', () => {
  const jsBlock = read('runtime/reference-assets/upstream-js/interface-builder/blocks/other-blocks/js-block.md');
  assertRunjsSnippetShape(
    'JSBlockModel',
    extractFirstJsFenceAfterHeading(jsBlock, '2) API Request Template'),
    'JSBlock API Request Template',
  );
  assertRunjsSnippetShape(
    'JSBlockModel',
    extractFirstJsFenceAfterHeading(jsBlock, '4) Skill-mode Feedback'),
    'JSBlock Skill-mode Feedback',
  );

  const jsField = read('runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-field.md');
  assertRunjsSnippetShape(
    'JSFieldModel',
    extractFirstJsFenceAfterHeading(jsField, '1) Basic Rendering (Reading Field Value)'),
    'JSField Basic Rendering',
  );

  const jsAction = read('runtime/reference-assets/upstream-js/interface-builder/actions/types/js-action.md');
  assertRunjsSnippetShape(
    'JSActionModel',
    extractFirstJsFenceAfterHeading(jsAction, '1) API Request and Feedback'),
    'JSAction API Request and Feedback',
  );
});

test('event-flow JS write contract stays discoverable across routing docs', () => {
  const cli = read('references/cli-command-surface.md');
  assert.match(cli, /get-event-flow-meta/i, 'cli-command-surface should route event-flow discovery to get-event-flow-meta');
  assert.match(cli, /add-event-flow/i, 'cli-command-surface should expose add-event-flow');
  assert.match(cli, /set-event-flow/i, 'cli-command-surface should expose set-event-flow');
  assert.match(cli, /remove-event-flow/i, 'cli-command-surface should expose remove-event-flow');
  assert.match(cli, /set-event-flows/i, 'cli-command-surface should route event-flow replacement to set-event-flows');

  const runtime = read('references/runtime-playbook.md');
  assert.match(runtime, /get-event-flow-meta/i, 'runtime-playbook should start localized event-flow work from get-event-flow-meta');
  assert.match(runtime, /add-event-flow/i, 'runtime-playbook should expose add-event-flow');
  assert.match(runtime, /set-event-flow/i, 'runtime-playbook should expose set-event-flow');
  assert.match(runtime, /remove-event-flow/i, 'runtime-playbook should expose remove-event-flow');
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
  assert.match(crosswalk, /get-event-flow-meta/i, 'transport-crosswalk should expose get-event-flow-meta');
  assert.match(crosswalk, /add-event-flow/i, 'transport-crosswalk should expose add-event-flow');
  assert.match(crosswalk, /set-event-flow/i, 'transport-crosswalk should expose set-event-flow');
  assert.match(crosswalk, /remove-event-flow/i, 'transport-crosswalk should expose remove-event-flow');
  assert.match(crosswalk, /set-event-flows/i, 'transport-crosswalk should expose the backend action for set-event-flows');

  const settings = read('references/settings.md');
  assert.match(settings, /Event-flow Discovery And Writes/i, 'settings.md should document event-flow discovery and fine-grained writes');
  assert.match(settings, /Event-flow Replacement/i, 'settings.md should document event-flow replacement explicitly');
  assert.match(settings, /get-event-flow-meta/i, 'settings.md should document event-flow meta discovery');
  assert.match(settings, /add-event-flow/i, 'settings.md should document add-event-flow');
  assert.match(settings, /set-event-flow/i, 'settings.md should document set-event-flow');
  assert.match(settings, /remove-event-flow/i, 'settings.md should document remove-event-flow');
  assert.match(settings, /flowRegistry/i, 'settings.md should describe flowRegistry shape');
  assert.match(settings, /\bdefaultParams\.code\b/i, 'settings.md should explain how Execute JavaScript code is written back');
  assert.match(settings, /use[`"'\s:]*runjs/i, 'settings.md should document the frontend runjs step action shape');
  assert.match(settings, /\bon\.defaultParams\.condition\b/i, 'settings.md should document event trigger condition placement');
  assert.match(settings, /\[js\.md\]/i, 'settings.md should route JS validation back to js.md');

  const shapes = read('references/tool-shapes.md');
  assert.match(shapes, /### `get-event-flow-meta`/i, 'tool-shapes should contain a get-event-flow-meta section');
  assert.match(shapes, /### `add-event-flow`/i, 'tool-shapes should contain an add-event-flow section');
  assert.match(shapes, /### `set-event-flow`/i, 'tool-shapes should contain a set-event-flow section');
  assert.match(shapes, /### `remove-event-flow`/i, 'tool-shapes should contain a remove-event-flow section');
  assert.match(shapes, /### `set-event-flows`/i, 'tool-shapes should contain a set-event-flows section');
  assert.match(shapes, /flowRegistry/i, 'tool-shapes should show flowRegistry body shape');
  assert.match(shapes, /\bdefaultParams\.code\b/i, 'tool-shapes should mention Execute JavaScript step code location');
  assert.match(shapes, /use: "runjs"|\"use\": \"runjs\"/i, 'tool-shapes should document the frontend runjs step action shape');
  assert.match(shapes, /\bon\.defaultParams\.condition\b/i, 'tool-shapes should document event trigger condition placement');
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
  assert.match(defaultPrompt, /Front door: `nb api flow-surfaces`/);
  assert.match(defaultPrompt, /Intent-first/i);
  assert.match(defaultPrompt, /Repeat-eligible(?: scenes)?/i);
  assert.match(defaultPrompt, /local customization/i);
  assert.match(defaultPrompt, /apply-blueprint/);
  assert.match(defaultPrompt, /get-reaction-meta/);
  assertOpenAIGuardrails(defaultPrompt);
  assert.ok(defaultPrompt.length <= 1500, 'openai default_prompt should stay at or below 1500 chars');
});

test('data-surface docs allow backend defaultFilter materialization while keeping filter action routing visible', () => {
  const dataSurfacesPattern =
    /table[\s\S]{0,100}list[\s\S]{0,100}gridCard[\s\S]{0,100}calendar[\s\S]{0,100}kanban|table[\s\S]{0,100}gridCard[\s\S]{0,100}list[\s\S]{0,100}calendar[\s\S]{0,100}kanban/i;
  const omittedDefaultFilterMaterializationPattern =
    /(?:omit|omitted|may omit|may be omitted|省略)[\s\S]{0,160}defaultFilter[\s\S]{0,260}(?:backend authoring|backend|后端)[\s\S]{0,220}(?:materialize|materializes|materialized|生成|自动生成)|(?:backend authoring|backend|后端)[\s\S]{0,220}(?:materialize|materializes|materialized|生成|自动生成)[\s\S]{0,220}(?:omit|omitted|may omit|may be omitted|省略)[\s\S]{0,160}defaultFilter|omitted `?defaultFilter`?[\s\S]{0,160}(?:materialized|materialize)/i;
  const generatedFieldCapPattern =
    /(?:up to 4 scalar\/filterable fields|up to 4 generated filter fields|最多 4 个标量\/可筛选字段|自动生成最多 4 个|backend4)/i;
  const explicitDefaultFilterTooNarrowRejectedPattern =
    /(?:fewer fields than the smaller of 3|smaller of 3|eligible direct interface-field count|collection eligible-field count)[\s\S]{0,220}(?:defaultFilter|filter)|(?:defaultFilter|filter)[\s\S]{0,220}(?:fewer fields than the smaller of 3|smaller of 3|eligible direct interface-field count|collection eligible-field count)/i;
  const forbiddenRequiredDefaultFilterPattern =
    /(?:must provide|must include|required to provide|requires an explicit|explicit effective|必须提供|必须显式|不会替 UI Builder 选择字段|does not choose fields|instead of choosing fields)[\s\S]{0,180}defaultFilter|defaultFilter[\s\S]{0,180}(?:must provide|must include|required to provide|requires an explicit|explicit effective|必须提供|必须显式|不会替 UI Builder 选择字段|does not choose fields|instead of choosing fields)/i;
  const explicitDefaultFilterRejectedPattern =
    /defaultFilter[\s\S]{0,160}(?:explicit|supplied|provide)[\s\S]{0,220}(?:empty|invalid|unknown)[\s\S]{0,180}(?:aggregate `?errors\[\]`?|rejected)|(?:empty|invalid|unknown)[\s\S]{0,180}defaultFilter[\s\S]{0,180}(?:aggregate `?errors\[\]`?|rejected)/i;
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
      dataSurfacesPattern,
      `${relativePath} should name table/list/gridCard/calendar/kanban data surfaces`,
    );
    assert.match(
      text,
      /filter action|filter` action|filterAction|block-level `filter`|block-level filter/i,
      `${relativePath} should keep host-level filter action routing visible`,
    );
    assert.match(
      text,
      omittedDefaultFilterMaterializationPattern,
      `${relativePath} should document backend defaultFilter materialization when omitted`,
    );
    assert.match(
      text,
      generatedFieldCapPattern,
      `${relativePath} should document generated defaultFilter field cap`,
    );
    assert.match(
      text,
      explicitDefaultFilterRejectedPattern,
      `${relativePath} should document aggregate rejection for explicit invalid defaultFilter`,
    );
    assert.match(
      text,
      explicitDefaultFilterTooNarrowRejectedPattern,
      `${relativePath} should document aggregate rejection for explicit defaultFilter below the collection-aware minimum`,
    );
    assert.match(
      text,
      /(?:every direct public data surface|direct public data-surface)[\s\S]{0,180}(?:partial `?actions`?|`?actions`? partials?)[\s\S]{0,180}filter[\s\S]{0,80}refresh[\s\S]{0,80}addNew[\s\S]{0,120}(?:table[\s\S]{0,80}bulkDelete|bulkDelete[\s\S]{0,80}table)/i,
      `${relativePath} should document partial default action merge for all direct public data surfaces`,
    );
    assert.match(
      text,
      /table[\s\S]{0,120}(?:partial `?recordActions`?|`?recordActions`? partials?|recordActions)[\s\S]{0,160}view[\s\S]{0,80}edit[\s\S]{0,80}delete/i,
      `${relativePath} should document table recordActions partial merge`,
    );
    assert.doesNotMatch(
      text,
      /skipDefaultActions|skipDefaultRecordActions/i,
      `${relativePath} should not document removed default-action opt-out keys`,
    );
    assert.doesNotMatch(
      text,
      forbiddenRequiredDefaultFilterPattern,
      `${relativePath} should not require UI Builder supplied defaultFilter`,
    );
  }

  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(
    pageBlueprint,
    omittedDefaultFilterMaterializationPattern,
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
    'page-blueprint explicit table example should keep a valid non-empty block-level defaultFilter',
  );
  assert.match(
    pageBlueprint,
    /"type":\s*"table"[\s\S]{0,160}"defaultFilter"[\s\S]{0,260}"actions"[\s\S]{0,120}"type":\s*"filter"/,
    'page-blueprint filter-action example should show defaultFilter on the host table block',
  );
  assert.match(
    pageBlueprint,
    /direct,?\s+non-template[\s\S]{0,140}table[\s\S]{0,80}list[\s\S]{0,80}gridCard[\s\S]{0,80}calendar[\s\S]{0,80}kanban[\s\S]{0,160}(?:omit|omitted|may omit|may be omitted)[\s\S]{0,120}defaultFilter/i,
    'page-blueprint should scope block-level defaultFilter to direct non-template table/list/gridCard/calendar/kanban data surfaces',
  );
  assert.match(
    pageBlueprint,
    /\{\}[\s\S]{0,120}`?null`?[\s\S]{0,120}\{\s*"logic":\s*"\$and",\s*"items":\s*\[\]\s*\}[\s\S]{0,160}(?:aggregate|rejected)/i,
    'page-blueprint should document rejected empty defaultFilter groups',
  );
  assert.match(
    pageBlueprint,
    /filterableFieldNames[\s\S]{0,180}settings\.defaultFilter[\s\S]{0,160}defaultActionSettings\.filter\.defaultFilter[\s\S]{0,160}block-level `?defaultFilter`?[\s\S]{0,160}backend-generated default filter/i,
    'page-blueprint should document effective defaultFilter coverage precedence',
  );

  const wholePageQuick = read('references/whole-page-quick.md');
  assert.match(
    wholePageQuick,
    /"type":\s*"table"[\s\S]{0,120}"collection":\s*"support_tickets"[\s\S]{0,160}"defaultFilter"[\s\S]{0,120}"items":\s*\[[\s\S]{0,120}"path":\s*"subject"/,
    'whole-page quick explicit table example should include a valid non-empty block-level defaultFilter',
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
    'tool-shapes applyBlueprint table example should keep a valid explicit block-level defaultFilter',
  );
  assert.match(
    toolShapes,
    /"key":\s*"employeesTable"[\s\S]{0,300}"defaultFilter"[\s\S]{0,120}"items":\s*\[[\s\S]{0,120}"path":\s*"nickname"/,
    'tool-shapes compose table example should keep a valid explicit block-level defaultFilter',
  );

  const helperContracts = read('references/helper-contracts.md');
  assert.match(helperContracts, /\{\}[\s\S]{0,80}`?null`?[\s\S]{0,80}logic:\s*"\$and"[\s\S]{0,80}items:\s*\[\][\s\S]{0,80}rejected/i);
  assert.match(helperContracts, /filterableFieldNames[\s\S]{0,180}settings\.defaultFilter[\s\S]{0,160}defaultActionSettings\.filter\.defaultFilter[\s\S]{0,160}block-level `?defaultFilter`?[\s\S]{0,160}backend-generated default filter/i);
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
    /relation field popup[\s\S]{0,180}details[\s\S]{0,80}editForm[\s\S]{0,120}currentRecord/i,
    'helper-contracts should document relation popup resource bindings',
  );
  assert.match(
    helperContracts,
    /relation (?:tables\/lists\/cards|`table` \/ `list` \/ `gridCard` blocks)[\s\S]{0,120}associatedRecords[\s\S]{0,120}associationField/i,
    'helper-contracts should document associatedRecords relation popup bindings',
  );

  const normativeContract = read('references/normative-contract.md');
  assert.match(normativeContract, /direct\s+non-template[\s\S]{0,140}table[\s\S]{0,80}list[\s\S]{0,80}gridCard[\s\S]{0,80}calendar[\s\S]{0,80}kanban[\s\S]{0,160}(?:omit|omitted|may omit|may be omitted)[\s\S]{0,120}defaultFilter/i);
  assert.match(normativeContract, /filterableFieldNames[\s\S]{0,180}action-level\/defaultActionSettings `?defaultFilter`?[\s\S]{0,160}block-level `?defaultFilter`?[\s\S]{0,160}backend-generated default filter/i);

  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.match(defaultPrompt, /hostBound搜索\/filter[\s\S]{0,30}sameHost[\s\S]{0,30}filterAction/i);
  assert.match(defaultPrompt, /defaultFilter[\s\S]{0,60}omit[\s\S]{0,60}backend4|backend4[\s\S]{0,60}defaultFilter/i);
  assert.match(defaultPrompt, /explicit[\s\S]{0,36}empty[\s\S]{0,36}invalid[\s\S]{0,36}<4[\s\S]{0,36}errors/i);
  assert.match(defaultPrompt, /filterAction[\s\S]{0,24}optional|optional[\s\S]{0,24}filterAction/i);
  assert.match(
    defaultPrompt,
    /treeTable[\s\S]{0,60}omit[\s\S]{0,40}recordActions[\s\S]{0,60}default[\s\S]{0,40}addChild/i,
    'compressed prompt should keep tree-table default row-action guidance',
  );
  assert.match(
    defaultPrompt,
    /treeTable[\s\S]{0,80}first[\s\S]{0,80}live[\s\S]{0,80}direct[\s\S]{0,80}non-assoc[\s\S]{0,80}titleField>name>code>title/i,
    'compressed prompt should keep tree-table first-field priority from live direct metadata',
  );
  assert.match(
    defaultPrompt,
    /treeTable[\s\S]{0,100}EFmoveNoInject/i,
    'compressed prompt should keep tree-table explicit fields move-only/no-inject guidance',
  );
});

test('gridCard reference documents public settings.columns without removed column count alias', () => {
  const gridCardReference = read('references/blocks/grid-card.md');
  const removedGridCardSetting = ['column', 'Count'].join('');
  assert.doesNotMatch(gridCardReference, new RegExp(removedGridCardSetting, 'i'));
  assert.match(gridCardReference, /settings[\s\S]{0,120}"columns"|"columns"[\s\S]{0,120}settings/i);
});

test('numeric KPI routing defaults to JSBlock instead of GridCard', () => {
  const pageFirst = read('references/page-first-planning.md');
  const gridCard = read('references/blocks/grid-card.md');
  const chart = read('references/blocks/chart.md');
  const aliases = read('references/aliases.md');
  const dashboardRouting = read('references/dashboard-routing.md');
  const blocksIndex = read('references/blocks/index.md');
  const jsBlock = read('references/js-models/js-block.md');
  const skill = read('SKILL.md');
  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');

  for (const [label, text] of [
    ['SKILL', skill],
    ['page-first-planning', pageFirst],
    ['grid-card', gridCard],
    ['chart', chart],
    ['aliases', aliases],
    ['dashboard-routing', dashboardRouting],
    ['blocks-index', blocksIndex],
    ['js-block', jsBlock],
    ['openai-default-prompt', defaultPrompt],
  ]) {
    assert.match(
      text,
      /(?:KPI|指标卡|数字统计|统计卡)[\s\S]{0,160}JSBlock|JSBlock[\s\S]{0,160}(?:KPI|指标卡|数字统计|统计卡)/i,
      `${label} should route numeric metrics to JSBlock`,
    );
    assert.doesNotMatch(
      text,
      /(?:数字摘要|KPI|指标卡)[\s\S]{0,80}优先\s*`?GridCardBlockModel`?|优先\s*grid card/i,
      `${label} should not route numeric summaries to GridCard first`,
    );
  }

  assert.match(
    gridCard,
    /record cards|卡片列表|多条业务记录|记录展示/i,
    'grid-card docs should describe record-card usage',
  );
  assert.doesNotMatch(
    skill,
    /KPI[\s\S]{0,80}chart\/grid-card|chart\/grid-card[\s\S]{0,80}KPI/i,
    'top-level SKILL router should not send KPI to chart/grid-card',
  );
  assert.match(
    dashboardRouting,
    /Do not implement[\s\S]{0,120}actionPanel[\s\S]{0,120}js/i,
    'dashboard routing should forbid actionPanel + js actions for KPI cards',
  );
  assert.match(
    aliases,
    /actionPanel[\s\S]{0,120}not a valid fallback|ActionPanelBlockModel[\s\S]{0,120}pure numeric metrics/i,
    'aliases should reject actionPanel fallback for dashboard summary numbers',
  );
  assert.match(
    skill,
    /dashboard-routing\.md/i,
    'SKILL should link dashboard-routing.md so the new reference is discoverable',
  );
  assert.doesNotMatch(
    defaultPrompt,
    /KPI[\s\S]{0,80}chart\/grid-card|chart\/grid-card[\s\S]{0,80}KPI|分析看板=chart\/grid-card/i,
    'compressed prompt should not preserve old KPI chart/grid-card routing',
  );
});

test('dashboard chart requests require chart blocks and cannot downgrade to JSBlock or tables', () => {
  const skill = read('SKILL.md');
  const dashboardRouting = read('references/dashboard-routing.md');
  const wholePageQuick = read('references/whole-page-quick.md');
  const chart = read('references/blocks/chart.md');
  const chartCore = read('references/chart-core.md');
  const pageBlueprint = read('references/page-blueprint.md');
  const executionChecklist = read('references/execution-checklist.md');
  const verification = read('references/verification.md');
  const defaultPrompt = readYamlDoubleQuotedScalar(read('agents/openai.yaml'), 'default_prompt');

  for (const [label, text] of [
    ['SKILL', skill],
    ['dashboard-routing', dashboardRouting],
    ['whole-page-quick', wholePageQuick],
    ['chart', chart],
    ['chart-core', chartCore],
    ['page-blueprint', pageBlueprint],
    ['execution-checklist', executionChecklist],
    ['verification', verification],
    ['openai-default-prompt', defaultPrompt],
  ]) {
    assert.match(
      text,
      /chart[\s\S]{0,120}(?:required|require|must|必须)|(?:required|require|must|必须)[\s\S]{0,120}chart/i,
      `${label} should make requested dashboard charts mandatory`,
    );
    assert.match(
      text,
      /JSBlock[\s\S]{0,140}(?:not|never|cannot|do not|不能|不|!=|≠)[\s\S]{0,140}chart|chart[\s\S]{0,140}(?:not|never|cannot|do not|不能|不|!=|≠)[\s\S]{0,140}JSBlock/i,
      `${label} should forbid JSBlock as chart coverage`,
    );
    assert.match(
      text,
      /table[\s\S]{0,120}(?:not|never|cannot|do not|不能|不|!=|≠)[\s\S]{0,120}chart|chart[\s\S]{0,120}(?:not|never|cannot|do not|不能|不|!=|≠)[\s\S]{0,120}table/i,
      `${label} should forbid table/list as chart coverage`,
    );
    assert.match(
      text,
      /list[\s\S]{0,120}(?:not|never|cannot|do not|不能|不|!=|≠)[\s\S]{0,120}chart|chart[\s\S]{0,120}(?:not|never|cannot|do not|不能|不|!=|≠)[\s\S]{0,120}list/i,
      `${label} should forbid list as chart coverage`,
    );
  }

  for (const [label, text] of [
    ['SKILL', skill],
    ['dashboard-routing', dashboardRouting],
    ['whole-page-quick', wholePageQuick],
    ['chart', chart],
    ['page-blueprint', pageBlueprint],
    ['execution-checklist', executionChecklist],
    ['verification', verification],
    ['openai-default-prompt', defaultPrompt],
  ]) {
    assert.match(
      text,
      /percentage[\s\S]{0,80}占比|占比[\s\S]{0,80}percentage/i,
      `${label} should keep percentage / 占比 aligned as chart-required cues`,
    );
  }

  assert.match(
    dashboardRouting,
    /chart blocks:[\s\S]{0,80}title[\s\S]{0,80}asset[\s\S]{0,20}key/i,
    'dashboard-routing should require chart title-to-asset evidence in final summaries',
  );
  assert.match(
    verification,
    /charts\[\][\s\S]{0,120}title[\s\S]{0,120}(?:asset key|assetKey|uid)/i,
    'verification should require structured chart evidence',
  );
  for (const [label, text] of [
    ['SKILL', skill],
    ['whole-page-quick', wholePageQuick],
    ['chart-core', chartCore],
    ['execution-checklist', executionChecklist],
    ['verification', verification],
  ]) {
    assert.match(
      text,
      /apply(?:-)?Blueprint/i,
      `${label} should require pageSchemaUid readback and chart evidence for chart-required dashboards`,
    );
    assert.match(
      text,
      /pageSchemaUid[\s\S]{0,260}(?:chart block evidence|chart evidence|charts\[\])|(?:chart block evidence|chart evidence|charts\[\])[\s\S]{0,260}pageSchemaUid/i,
      `${label} should require pageSchemaUid readback and chart evidence for chart-required dashboards`,
    );
    assert.match(
      text,
      /(?:read back|readback|flow-surfaces get)[\s\S]{0,260}pageSchemaUid[\s\S]{0,260}(?:chart block evidence|chart evidence|charts\[\])|(?:chart block evidence|chart evidence|charts\[\])[\s\S]{0,260}(?:read back|readback|flow-surfaces get)[\s\S]{0,260}pageSchemaUid/i,
      `${label} should keep the explicit readback step for chart-required dashboards`,
    );
    assert.match(
      text,
      /(?:jsBlock|JSBlock)[\s\S]{0,160}(?:table|list)[\s\S]{0,260}(?:unfinished|not chart evidence|never count|do not report|do not summarize|do not satisfy|cannot satisfy)|(?:unfinished|not chart evidence|never count|do not report|do not summarize|do not satisfy|cannot satisfy)[\s\S]{0,260}(?:jsBlock|JSBlock)[\s\S]{0,160}(?:table|list)/i,
      `${label} should treat JSBlock/table/list-only chart readback as unfinished`,
    );
  }
});

test('JSBlock docs and prompt expose only canonical public authoring shapes', () => {
  const jsBlock = read('references/js-models/js-block.md');
  const pageBlueprint = read('references/page-blueprint.md');
  const settings = read('references/settings.md');
  const skill = read('SKILL.md');
  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');

  for (const [label, text] of [
    ['js-block', jsBlock],
    ['page-blueprint', pageBlueprint],
    ['settings', settings],
    ['SKILL', skill],
    ['openai-default-prompt', defaultPrompt],
  ]) {
    assert.match(
      text,
      /settings\.code|settings"\s*:\s*\{[\s\S]{0,160}"code"/,
      `${label} should document settings.code for inline jsBlock authoring`,
    );
    assert.match(
      text,
      /top-level `?code`?|top-level code/i,
      `${label} should explicitly forbid top-level jsBlock code`,
    );
    assert.match(
      text,
      /top-level[\s\S]{0,40}`?version`?/i,
      `${label} should explicitly forbid top-level jsBlock version`,
    );
    assert.match(
      text,
      /stepParams[\s\S]{0,160}(?:do not|don't|Never|禁|internal|readback)/i,
      `${label} should forbid handwritten internal jsBlock stepParams`,
    );
  }

  for (const [label, text] of [
    ['js-block', jsBlock],
    ['page-blueprint', pageBlueprint],
    ['SKILL', skill],
  ]) {
    assert.match(
      text,
      /assets\.scripts[\s\S]{0,160}script|script[\s\S]{0,160}assets\.scripts/i,
      `${label} should document assets.scripts + script for asset-backed jsBlock authoring`,
    );
  }

  assert.match(
    defaultPrompt,
    /configure[\s\S]{0,80}changes\.code\/version|changes\.code\/version[\s\S]{0,80}configure/i,
    'compressed prompt should document changes.code/version for JSBlock configure',
  );
  assert.match(
    defaultPrompt,
    /changes\.settings/i,
    'compressed prompt should forbid changes.settings for JSBlock configure',
  );
  assert.match(
    defaultPrompt,
    /ban\([^)]*top-level code\/version[^)]*changes\.settings[^)]*stepParams[^)]*props[^)]*decoratorProps[^)]*flowRegistry[^)]*\)/i,
    'compressed prompt should keep JSBlock forbidden public shapes under an explicit ban marker',
  );
  assert.match(
    defaultPrompt,
    /props[\s\S]{0,80}decoratorProps[\s\S]{0,80}flowRegistry/i,
    'compressed prompt should forbid internal JSBlock persisted fields',
  );
  assert.match(
    defaultPrompt,
    /type[\s\S]{0,30}jsBlock[\s\S]{0,30}only/i,
    'compressed prompt should require type jsBlock instead of the js alias for blocks',
  );

  assert.doesNotMatch(
    jsBlock,
    /code`?\s*(?:写在|under|at)\s*`?stepParams\.jsSettings\.runJs\.code/i,
    'js-block reference should not present stepParams as the public write path',
  );
});

test('metric cards JSBlock safe snippet stays cataloged as guidance', () => {
  const catalog = JSON.parse(read('references/js-snippets/catalog.json'));
  const entry = catalog.snippets.find((item) => item.id === 'scene/block/metric-cards');
  assert.ok(entry, 'metric cards snippet should be listed in catalog');
  assert.equal(entry.tier, 'safe');
  assert.equal(entry.doc, 'js-snippets/safe/scene/block/metric-cards.md');
  assert.deepEqual(entry.modelUses['js-model.render'], ['JSBlockModel']);

  const markdown = read(`references/${entry.doc}`);
  const code = extractJsFenceAfterH2(markdown, 'Normalized snippet');
  assert.match(code, /ctx\.makeResource/, 'metric snippet should create independent resources');
  assert.match(code, /getCount/, 'metric snippet should read server-side meta count');
  assert.match(code, /ctx\.render/, 'metric snippet should render explicitly');
  assertRunjsSnippetShape('JSBlockModel', code, 'metric cards snippet');
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
    /defaultFilter[\s\S]{0,180}(?:省略|omit|omitted)[\s\S]{0,220}filter`? action|filter`? action[\s\S]{0,220}defaultFilter/i,
    'kanban block doc should keep omitted defaultFilter and host-level filter action guidance together',
  );

  const defaultPrompt = readYamlDoubleQuotedScalar(read('agents/openai.yaml'), 'default_prompt');
  assert.match(defaultPrompt, /分析看板[\s\S]{0,80}trend[\s\S]{0,40}chart/i);
  assert.match(defaultPrompt, /distribution[\s\S]{0,40}ranking[\s\S]{0,40}占比[\s\S]{0,40}chart/i);
  assert.match(defaultPrompt, /chart[\s\S]{0,40}required/i);
  assert.match(defaultPrompt, /table\/list!=chart/i);
  assert.match(defaultPrompt, /assets\.charts[\s\S]{0,30}block\.chart/i);
  assert.match(defaultPrompt, /KPI[\s\S]{0,24}JSBlock/i);
  assert.match(defaultPrompt, /card[\s\S]{0,24}Grid/i);
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
    /(?:first|首次|single-shot)?[\s\S]{0,120}`?applyBlueprint`?[\s\S]{0,180}(?:fail|失败)[\s\S]{0,180}(?:(?:repair|修正|修复)[\s\S]{0,160}(?:aggregate|errors\[\]|错误列表|聚合)|(?:aggregate|errors\[\]|错误列表|聚合)[\s\S]{0,160}(?:repair|修正|修复))[\s\S]{0,160}(?:retry|重试)[\s\S]{0,80}(?:5|五)|(?:(?:repair|修正|修复)[\s\S]{0,160}(?:aggregate|errors\[\]|错误列表|聚合)|(?:aggregate|errors\[\]|错误列表|聚合)[\s\S]{0,160}(?:repair|修正|修复))[\s\S]{0,160}(?:retry|重试)[\s\S]{0,120}`?applyBlueprint`?[\s\S]{0,80}(?:5|五)/i,
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
    'references/page-blueprint.md',
    'references/page-intent.md',
    'references/normative-contract.md',
    'references/verification.md',
    'references/tool-shapes.md',
  ]) {
    assertDuplicateMenuGroupNeedsRouteId(read(relativePath), relativePath);
    assertNavigationGroupDocsDoNotKeepOldMetadataRules(relativePath);
  }
});

test('multi-page shared menu-group docs require serialized routeId handoff', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/execution-checklist.md',
  ]) {
    assertSharedMenuGroupMultiPageRunsAreSerialized(read(relativePath), relativePath);
  }
});

test('menu discovery docs use current nb resource read path and locator mapping', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/runtime-playbook.md',
    'references/verification.md',
    'references/normative-contract.md',
  ]) {
    assertMenuDiscoveryUsesCanonicalNbResourceRead(read(relativePath), relativePath);
  }

  const runtime = read('references/runtime-playbook.md');
  assert.match(
    runtime,
    /group\.id[\s\S]{0,80}navigation\.group\.routeId|navigation\.group\.routeId[\s\S]{0,80}group\.id/i,
    'runtime-playbook should map menu group id to navigation.group.routeId',
  );
  assert.match(
    runtime,
    /flowPage\.schemaUid[\s\S]{0,80}pageSchemaUid|pageSchemaUid[\s\S]{0,80}flowPage\.schemaUid/i,
    'runtime-playbook should map flowPage.schemaUid to pageSchemaUid',
  );
  assert.match(
    runtime,
    /tabs[\s\S]{0,80}(?:not|not a|is not|are not)[\s\S]{0,80}menu item/i,
    'runtime-playbook should clarify that tabs are not menu items',
  );
});

test('same-group same-title page docs require replace and cross-group isolation', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/page-intent.md',
    'references/normative-contract.md',
    'references/execution-checklist.md',
    'references/verification.md',
  ]) {
    assertSameGroupSameTitlePageIdentityRule(read(relativePath), relativePath);
  }
});

test('title omission docs keep single-block scopes title-optional and multi-block scopes titled', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/normative-contract.md',
    'references/page-intent.md',
    'references/execution-checklist.md',
    'references/tool-shapes.md',
  ]) {
    assertTitleOmissionRule(read(relativePath), relativePath);
  }

  const openaiPrompt = readYamlDoubleQuotedScalar(read('agents/openai.yaml'), 'default_prompt');
  assert.match(
    openaiPrompt,
    /multi-non-filter(?: explicit)? keyed layout\/titles[\s\S]{0,60}(?:except templates|template-backed exempt|templates exempt)[\s\S]{0,80}single non-filter(?: block)?(?: title)?[\s\S]{0,80}(?:optional|may omit title)[\s\S]{0,80}(?:unless user asks|unless explicitly asked|unless asked)/i,
    'openai prompt should keep the multi-block template exception plus title-optional single-block rule and explicit-request override visible',
  );
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
  assert.match(wholePageQuick, /\[helper-contracts\.md\][\s\S]{0,120}optional helper behavior/i);
  assert.match(wholePageQuick, /\[template-quick\.md\]/i);
  assert.match(wholePageQuick, /\.artifacts\/nocobase-ui-builder/i);
  assert.match(wholePageQuick, /blueprint\.json/i);
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
    /For artifact-only drafts[\s\S]{0,180}do not open \[helper-contracts\.md\]/i,
    'whole-page-quick should keep helper-contracts out of artifact-only drafting',
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
    /first mutating write[\s\S]{0,120}`?applyBlueprint`?|`?applyBlueprint`?[\s\S]{0,160}fail(?:s|ure)?[\s\S]{0,220}repair[\s\S]{0,120}(?:aggregate `?errors\[\]`?|backend aggregate)[\s\S]{0,120}retry[\s\S]{0,80}(?:5|five)|after one successful whole-page `?applyBlueprint`?[\s\S]{0,180}(?:localized|residual local\/live gap)/i,
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
  assert.match(helperContracts, /optional local helpers/i);
  assert.match(helperContracts, /common-case drafting|do not open runtime source files/i);
  assert.doesNotMatch(helperContracts, /nb-runjs/i);
  assert.match(helperContracts, /Write Behavior/i);
  assert.match(helperContracts, /errors\[\][\s\S]{0,120}retry/i);
  assert.match(helperContracts, /node skills\/nocobase-ui-builder\/runtime\/bin\/nb-template-decision\.mjs/i);
  assert.doesNotMatch(helperContracts, /nb-flow-surfaces\.mjs/i);
  assert.doesNotMatch(helperContracts, /node skills\/nocobase-ui-builder\/runtime\/bin\/nb-localized-write-preflight\.mjs/i);
  assert.doesNotMatch(helperContracts, /- CLI:\s*`nb-runjs\b/i);

  assertBackendFirstWriteContract('references/cli-transport.md');
  const cliTransport = read('references/cli-transport.md');
  assert.match(cliTransport, /nb api flow-surfaces <action>|node skills\/nocobase-ui-builder\/runtime\/bin\/<helper>\.mjs/i);
  assert.match(cliTransport, /Check whether `?nb`? is available|do not probe bare PATH commands first/i);
  assert.match(cliTransport, /blocked command state|blocked nb command state/i);
  assert.match(cliTransport, /exact `?nb api flow-surfaces <action>`? command\/output/i);

  assertBackendFirstWriteContract('references/execution-checklist.md');

  assertBackendFirstWriteContract('references/cli-command-surface.md');
  const cliCommandSurface = read('references/cli-command-surface.md');
  assert.match(cliCommandSurface, /unresolved `?nb api flow-surfaces <action>`? command/i);

  assertBackendFirstWriteContract('references/page-intent.md');
  const pageIntent = read('references/page-intent.md');
  assert.match(pageIntent, /nb api flow-surfaces apply-blueprint/i);

  const normativeContract = read('references/normative-contract.md');
  assert.match(normativeContract, /nb-template-decision/i);
  assert.doesNotMatch(normativeContract, /nb-runjs/i);

  for (const relativePath of ['SKILL.md', 'agents/openai.yaml', ...walkMarkdownFiles('references')]) {
    const text = read(relativePath);
    assert.doesNotMatch(text, /nb-page-preview/i, `${relativePath} should not expose nb-page-preview`);
    assert.doesNotMatch(
      text,
      /prepareApplyBlueprintRequest/i,
      `${relativePath} should not direct agents to call prepareApplyBlueprintRequest`,
    );
    assert.doesNotMatch(
      text,
      /localized existing-surface edits[\s\S]{0,160}(?:low-level\s+`?flow-surfaces`?|go through\s+`?flow-surfaces`?)/i,
      `${relativePath} should not route localized edits through old low-level flow-surfaces wording`,
    );
  }

  const runtimePackage = read('runtime/package.json');
  assert.doesNotMatch(runtimePackage, /nb-page-preview/i, 'runtime package should not publish nb-page-preview');
  assert.equal(
    existsSync(path.join(skillRoot, 'runtime/bin/nb-page-preview.mjs')),
    false,
    'runtime bin should not keep nb-page-preview.mjs',
  );

  const localEditQuickHelper = read('references/local-edit-quick.md');
  assert.match(localEditQuickHelper, /nb api flow-surfaces|backend/i);

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

test('chart docs reject builder relation fields and point relation labels to SQL fallback', () => {
  for (const relativePath of ['references/blocks/chart.md', 'references/chart-core.md', 'references/helper-contracts.md']) {
    const text = read(relativePath);
    assert.match(
      text,
      /chart-builder-query-association-field-requires-subfield/i,
      `${relativePath} should name the backend aggregate validation rule`,
    );
    assert.match(
      text,
      /suggestedFieldPath|suggested scalar subfield|建议的 scalar subfield/i,
      `${relativePath} should document backend association subfield repair guidance`,
    );
    assert.match(
      text,
      /relation[\s\S]{0,160}(SQL chart|sql chart|query\.mode = "sql")/i,
      `${relativePath} should route relation-label grouping to SQL chart fallback`,
    );
  }

  const chartBlock = read('references/blocks/chart.md');
  assert.doesNotMatch(
    chartBlock,
    /\{\s*"field"\s*:\s*\[\s*"customer"\s*,\s*"name"\s*\]\s*,\s*"alias"\s*:\s*"customer_name"\s*\}/i,
    'chart block docs must not keep the old builder relation dimension example',
  );
});

test('whole-page chart docs keep canonical assets and inline compatibility boundaries aligned', () => {
  for (const relativePath of [
    'references/blocks/chart.md',
    'references/chart-core.md',
    'references/page-blueprint.md',
  ]) {
    assertWholePageChartAssetGuidance(read(relativePath), relativePath);
  }
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

test('defaults collection fieldGroups docs require fast self-review and one retry', () => {
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
      /fieldGroups[\s\S]{0,260}self-review[\s\S]{0,260}(approve|regenerate)/i,
      `${relativePath} should require a compact fieldGroups self-review verdict`,
    );
    assert.match(
      text,
      /fieldGroups[\s\S]{0,420}(regenerate|retry)[\s\S]{0,180}(once|single retry|at most once)|regenerate[\s\S]{0,180}(once|single retry|at most once)[\s\S]{0,420}fieldGroups/i,
      `${relativePath} should cap defaults fieldGroups regeneration to one retry`,
    );
    assert.match(
      text,
      /fieldGroups[\s\S]{0,420}(lowest practical reasoning|no-think|chain-of-thought)|(?:lowest practical reasoning|no-think|chain-of-thought)[\s\S]{0,420}fieldGroups/i,
      `${relativePath} should keep the low-effort/no-think guidance visible`,
    );
  }

  const defaultPrompt = read('agents/openai.yaml');
  assert.match(
    defaultPrompt,
    /defaults fieldGroups[\s\S]{0,120}self-review[\s\S]{0,120}approve[\/|]regenerate/i,
    'default prompt should require a compact fieldGroups self-review verdict',
  );
  assert.match(
    defaultPrompt,
    /defaults fieldGroups[\s\S]{0,180}(lowest reasoning|no-think)[\s\S]{0,180}(no CoT|chain-of-thought)/i,
    'default prompt should keep low-effort/no-think/no-CoT guidance visible',
  );
  assert.match(
    defaultPrompt,
    /defaults fieldGroups[\s\S]{0,220}regenerate once/i,
    'default prompt should cap fieldGroups regeneration to one retry',
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

test('docs keep backend-first collection metadata and validation boundary', () => {
  for (const relativePath of [
    'SKILL.md',
    'references/normative-contract.md',
    'references/page-intent.md',
    'references/whole-page-quick.md',
  ]) {
    const text = read(relativePath);
    assert.match(text, /live (?:collection )?metadata/i, `${relativePath} should keep live metadata planning visible`);
    assert.match(text, /backend[\s\S]{0,120}(?:aggregate|validation|authoring)/i, `${relativePath} should route final validation to backend authoring`);
    assert.doesNotMatch(text, /--no-auto-collection-metadata|missing-collection-metadata|result\.cliBody/i);
  }
});

test('localized write docs keep backend validation boundary', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /send it directly to `nb api flow-surfaces <action>`/i);
  assert.match(skill, /backend authoring pipeline performs compatibility normalization and hard validation/i);

  const cliCommandSurface = read('references/cli-command-surface.md');
  assert.match(cliCommandSurface, /raw business object/i);
  assert.match(cliCommandSurface, /backend aggregate `?errors\[\]`?/i);

  const localEditQuick = read('references/local-edit-quick.md');
  assert.match(localEditQuick, /backend|nb api flow-surfaces/i);
  assert.doesNotMatch(localEditQuick, /result\.cliBody|nb-localized-write-preflight|local preflight/i);

  const openaiYaml = read('agents/openai.yaml');
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.match(defaultPrompt, /backend aggregate validation|aggregate errors/i);
  assert.match(defaultPrompt, /raw payload only/i);
});

test('JS authoring docs route writes through flow-surfaces errors repair', () => {
  for (const relativePath of [
    'references/js.md',
    'references/runjs-authoring-loop.md',
    'references/helper-contracts.md',
    'references/normative-contract.md',
    'references/chart-core.md',
    'references/js-snippets/index.md',
    'references/js-reference-index.md',
  ]) {
    const text = read(relativePath);
    assert.match(
      text,
      /(?:nb api flow-surfaces|errors\[\])/i,
      `${relativePath} should route JS writes to direct flow-surfaces writes or returned errors`,
    );
    assert.doesNotMatch(
      text,
      /nb-runjs|must run the local validator|local validator gate|validator failure is failure|write cannot continue|do not continue to the nb write|must first pass the validator gate/i,
      `${relativePath} should not mention the removed local RunJS helper or define a local validator write gate`,
    );
  }

  const chartCore = read('references/chart-core.md');
  assert.doesNotMatch(chartCore, /-\s*`ctx\.openView`/i, 'chart events docs should not list ctx.openView as available');
  assert.doesNotMatch(
    chartCore,
    /runtime treats `ctx\.openView\(\.\.\.\)` as a simulated call/i,
    'chart events docs should not encourage backend-rejected ctx.openView code',
  );
  assert.match(
    chartCore,
    /persisted popup-capable FlowModel/i,
    'chart events docs should require a persisted popup-capable FlowModel before events.raw opens a popup',
  );
});

test('JS popup intent defaults to persisted popup-capable FlowModel with template-first routing', () => {
  const skill = read('SKILL.md');
  const js = read('references/js.md');
  const jsAction = read('references/js-surfaces/js-model-action.md');
  const jsIndex = read('references/js-reference-index.md');
  const chartCore = read('references/chart-core.md');
  const popupOpenView = read('references/patterns/popup-openview.md');
  const failureTaxonomy = read('references/runjs-failure-taxonomy.md');
  const guardedWindowOpen = read('references/js-snippets/guarded/global/window-open.md');
  const renderSurfaceDocs = [
    'runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-column.md',
    'runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-field.md',
    'runtime/reference-assets/upstream-js/interface-builder/fields/specific/js-item.md',
    'runtime/reference-assets/upstream-js/interface-builder/actions/types/js-item.md',
  ];
  const catalog = JSON.parse(read('references/js-snippets/catalog.json'));
  const manifest = JSON.parse(read('references/js-surfaces/snippet-manifest.json'));

  for (const [label, text] of [
    ['SKILL.md', skill],
    ['references/js.md', js],
    ['references/js-surfaces/js-model-action.md', jsAction],
    ['references/js-reference-index.md', jsIndex],
    ['references/chart-core.md', chartCore],
    ['references/patterns/popup-openview.md', popupOpenView],
    ['references/runjs-failure-taxonomy.md', failureTaxonomy],
  ]) {
    assert.match(text, /popup-capable FlowModel/i, `${label} should name the stable popup trigger target`);
    assert.match(text, /popupTemplateUid|template-first|模板优先/i, `${label} should keep template-first popup routing visible`);
  }

  assert.match(popupOpenView, /triggerUid/i, 'popup-openview should distinguish the JS trigger uid');
  assert.match(popupOpenView, /targetUid/i, 'popup-openview should distinguish the persisted openView target uid');
  assert.match(
    popupOpenView,
    /ChildPageModel[\s\S]{0,180}(?:不是|not|must not)/i,
    'popup-openview should warn against using ChildPage/page/tab/subtree uid as the default trigger target',
  );

  const popupSnippet = catalog.snippets.find((entry) => entry.id === 'global/open-popup-flow-model');
  assert.ok(popupSnippet, 'catalog should include the popup FlowModel opener snippet');
  assert.equal(popupSnippet?.tier, 'safe');
  assert.equal(popupSnippet?.doc, 'js-snippets/safe/global/open-popup-flow-model.md');
  assert.deepEqual(
    popupSnippet?.preferredForIntents,
    ['open-popup', 'open-view', 'drawer', 'dialog', 'drilldown'],
    'popup snippet should be the preferred popup/openView intent entry',
  );

  assert.equal(
    popupSnippet?.intentTags?.includes('drilldown'),
    true,
    'popup snippet should cover drilldown intent tags',
  );
  const renderPopupSnippet = catalog.snippets.find((entry) => entry.id === 'render/open-popup-flow-model-button');
  assert.ok(renderPopupSnippet, 'catalog should include the rendered popup FlowModel opener snippet');
  assert.equal(renderPopupSnippet?.tier, 'safe');
  assert.equal(renderPopupSnippet?.doc, 'js-snippets/safe/render/open-popup-flow-model-button.md');
  assert.equal(renderPopupSnippet?.surfaces?.includes('js-model.render'), true);
  assert.equal(renderPopupSnippet?.preferredForIntents?.includes('drilldown'), true);

  const actionSurface = manifest.surfaces.find((surface) => surface.id === 'js-model.action');
  assert.deepEqual(
    actionSurface?.recommendedBySceneHint?.popup,
    ['global/open-popup-flow-model'],
    'js-model.action popup scene hint should point to the popup FlowModel snippet',
  );
  const renderSurface = manifest.surfaces.find((surface) => surface.id === 'js-model.render');
  assert.deepEqual(
    renderSurface?.recommendedBySceneHint?.popup,
    ['render/open-popup-flow-model-button'],
    'js-model.render popup scene hint should point to the rendered popup FlowModel opener',
  );
  const eventFlowSurface = manifest.surfaces.find((surface) => surface.id === 'event-flow.execute-javascript');
  assert.deepEqual(
    eventFlowSurface?.recommendedBySceneHint?.popup,
    ['global/open-popup-flow-model'],
    'event-flow popup scene hint should point to the popup FlowModel snippet',
  );

  const openViewReference = read('runtime/reference-assets/upstream-js/runjs/context/open-view.md');
  assert.match(
    openViewReference,
    /missing `uid` as invalid/i,
    'openView reference should quarantine missing uid behavior in skill mode',
  );
  assert.doesNotMatch(
    openViewReference,
    /\$\{ctx\.model\.uid\}/,
    'openView reference should not teach constructing popup uids from ctx.model.uid',
  );
  assert.doesNotMatch(
    failureTaxonomy,
    /ctx\.openView\(\.\.\.\)[^\n]*(?:intentionally disallowed|final skill output)/i,
    'failure taxonomy should not keep the old blanket ctx.openView final-output ban',
  );
  assert.match(
    guardedWindowOpen,
    /popup, drawer, dialog, or drilldown[\s\S]{0,180}global\/open-popup-flow-model/i,
    'guarded window.open snippet should reroute NocoBase popup intent to the template-first FlowModel opener',
  );
  for (const relativePath of renderSurfaceDocs) {
    const text = read(relativePath);
    assert.match(
      text,
      /Popup Opener Requires a Persisted FlowModel[\s\S]{0,900}replace-with-persisted-popup-flowmodel-uid[\s\S]{0,900}ctx\.openView\(popupFlowModelUid/i,
      `${relativePath} should show a real persisted-trigger popup opener example`,
    );
    assert.doesNotMatch(
      text,
      /Resolve a template-first popup FlowModel before calling ctx\.openView/i,
      `${relativePath} should not keep the old non-functional message-only popup shell`,
    );
  }
});

test('popup drilldown variables use defineProperties instead of nested inputArgs params', () => {
  const files = [
    'references/js-snippets/safe/global/open-popup-flow-model.md',
    'references/js-snippets/safe/render/open-popup-flow-model-button.md',
  ];

  for (const relativePath of files) {
    const text = read(relativePath);
    assert.doesNotMatch(
      text,
      /params:\s*\{/i,
      `${relativePath} should not use params as the drilldown variable carrier in examples`,
    );
  }

  const popupOpenView = read('references/patterns/popup-openview.md');
  const skillPrompt = read('SKILL.md');
  const openViewReference = read('runtime/reference-assets/upstream-js/runjs/context/open-view.md');
  assert.match(
    popupOpenView,
    /defineProperties[\s\S]{0,240}\{\{ctx\.[^}]+}}/i,
    'popup-openview should teach defineProperties top-level variables for drilldown filters',
  );
  assert.match(
    openViewReference,
    /defineProperties[\s\S]{0,240}drilldownValue/i,
    'openView runtime reference should show defineProperties variables for popup block settings',
  );
  assert.match(
    openViewReference,
    /\{\{\s*ctx\.drilldownValue\s*}}/i,
    'openView runtime reference should show the top-level popup dataScope variable',
  );
  assert.match(
    popupOpenView,
    /禁止使用 `\{\{ctx\.view\.inputArgs\.params\.\*}}`|Do not generate `\{\{ctx\.view\.inputArgs\.params\.\*}}`/i,
    'popup-openview should explicitly forbid nested params variables for popup dataScope',
  );
  assert.match(
    skillPrompt,
    /chart[\s\S]{0,240}actionLinkage[\s\S]{0,240}visible row action/i,
    'main skill prompt should require hiding chart-only popup hosts instead of exposing broken row actions',
  );
  assert.match(
    popupOpenView,
    /图表 `ctx\.openView\(\)`[\s\S]{0,240}actionLinkage[\s\S]{0,240}可见行按钮/i,
    'popup-openview should require actionLinkage for chart-only popup hosts',
  );

  for (const relativePath of [
    'references/js-snippets/safe/global/open-popup-flow-model.md',
    'references/js-snippets/safe/render/open-popup-flow-model-button.md',
  ]) {
    const text = read(relativePath);
    assert.match(text, /defineProperties[\s\S]{0,240}drilldownValue/i, `${relativePath} should use defineProperties`);
    assert.match(text, /\{\{ctx\.drilldownValue}}/i, `${relativePath} should document the popup dataScope variable`);
  }
});

test('RunJS repair playbook covers backend repair classes', () => {
  const playbook = read('references/runjs-repair-playbook.md');
  for (const repairClass of [
    'switch-to-resource-api',
    'missing-top-level-return',
    'value-surface-forbids-render',
    'unknown-surface-stop',
    'unknown-model-stop',
    'replace-innerhtml-with-render',
    'render-top-level-function-wrapper',
    'render-unreachable-render-call',
    'blocked-global-stop',
    'blocked-capability-reroute',
    'ctx-root-mismatch-stop',
  ]) {
    assert.match(playbook, new RegExp('\\| `' + repairClass + '` \\|'), `playbook should cover ${repairClass}`);
  }
  assert.match(playbook, /details\.repairClass/i);
  assert.match(playbook, /nb api flow-surfaces <action>/i);
  assert.doesNotMatch(playbook, /auto-rewrite only|may auto-rewrite/i);
});

test('JS snippets are guidance, not a write gate', () => {
  const snippetIndex = read('references/js-snippets/index.md');
  assert.match(snippetIndex, /Use the snippet as guidance/i);
  assert.match(snippetIndex, /errors\[\][\s\S]{0,80}retry/i);
  assert.doesNotMatch(snippetIndex, /Run the JS validator before writing|code-quality gate/i);
  for (const relativePath of walkMarkdownFiles('references/js-snippets')) {
    assert.doesNotMatch(
      read(relativePath),
      /Run the JS validator before writing|must run the local validator|local validator gate|validator failure is failure|write cannot continue|must first pass the validator gate/i,
      `${relativePath} should not define snippets as a local validator write gate`,
    );
  }
});

test('docs keep migrated write ergonomics backend-owned', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /single-scope[\s\S]{0,80}data-block title[\s\S]{0,120}backend authoring[\s\S]{0,80}strips/i);

  const helperContracts = read('references/helper-contracts.md');
  assert.match(helperContracts, /backend authoring[\s\S]{0,120}strips[\s\S]{0,160}single-scope[\s\S]{0,160}data blocks/i);
  assert.match(helperContracts, /backend authoring[\s\S]{0,160}fieldGroups[\s\S]{0,160}large generated popups/i);
  assert.match(helperContracts, /builder chart direct association fields[\s\S]{0,120}backend aggregate validation/i);

  const wholePageQuick = read('references/whole-page-quick.md');
  assert.match(wholePageQuick, /backend authoring[\s\S]{0,120}strips[\s\S]{0,120}single-scope[\s\S]{0,120}data blocks/i);

  for (const relativePath of ['SKILL.md', ...walkMarkdownFiles('references')]) {
    const text = read(relativePath);
    assert.doesNotMatch(
      text,
      /--collection-metadata|--expected-outer-tabs|--max-popup-depth|--no-auto-collection-metadata/i,
      `${relativePath} should not document legacy helper-only wrapper flags`,
    );
  }
});

test('optional helper docs do not define write gates', () => {
  for (const relativePath of [
    'references/helper-contracts.md',
    'references/template-decision-summary.md',
  ]) {
    const text = read(relativePath);
    assert.doesNotMatch(text, /requestBody/i, `${relativePath} should not keep the old helper payload name`);
    assert.doesNotMatch(text, /mandatory local prepare-write|result\.cliBody|cliBody only/i);
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

  for (const relativePath of [
    'SKILL.md',
    'references/helper-contracts.md',
    'references/whole-page-quick.md',
    'references/page-blueprint.md',
    'references/settings.md',
    'references/normative-contract.md',
    'references/tool-shapes.md',
  ]) {
    const text = read(relativePath);
    assertFormBehaviorDescriptionReviewGuidance(text, relativePath);
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
  assert.match(
    defaultPrompt,
    /formBehaviorDescriptionReview\.fields\.<field>[\s\S]{0,120}\{decision,reasonCode\}|formBehaviorDescriptionReview[\s\S]{0,120}decision[\s\S]{0,120}reasonCode/i,
    'default prompt should mention per-field formBehaviorDescriptionReview decisions for described generated add/edit fields',
  );
  assert.doesNotMatch(
    defaultPrompt,
    /hasTried/i,
    'default prompt should not mention obsolete formBehaviorDescriptionReview.hasTried',
  );
  assert.doesNotMatch(
    defaultPrompt,
    /formBehavior\s*:\s*\{\}|formBehavior[\s\S]{0,120}null/i,
    'default prompt should not suggest formBehavior: {} or null no-op guidance',
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
    'scripts/check_docs_contract.mjs',
    'scripts/check_runjs_snippet_catalog.mjs',
    'scripts/check_runjs_snippet_manifest.mjs',
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
