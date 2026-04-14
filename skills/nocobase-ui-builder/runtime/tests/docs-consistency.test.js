import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function readRelativeMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\]\(((?:\.\/|\.\.\/)[^)]+)\)/g)].map((match) => match[1]);
}

function assertRelativeMarkdownLinksExist(relativePath) {
  const markdown = read(relativePath);
  const fileDir = path.dirname(path.join(skillRoot, relativePath));
  for (const linkPath of new Set(readRelativeMarkdownLinks(markdown))) {
    assert.equal(existsSync(path.resolve(fileDir, linkPath)), true, `${relativePath} -> ${linkPath} should exist`);
  }
}

function readYamlDoubleQuotedScalar(yamlText, key) {
  const match = yamlText.match(new RegExp(`${key}: "((?:[^"\\\\]|\\\\.)*)"`, 'm'));
  assert.ok(match, `${key} should be present`);
  return JSON.parse(`"${match[1]}"`);
}

function assertInOrder(text, fragments, message) {
  let cursor = 0;
  for (const fragment of fragments) {
    const index = text.indexOf(fragment, cursor);
    assert.ok(index >= 0, message ?? `expected fragment in order: ${fragment}`);
    cursor = index + fragment.length;
  }
}

function assertPointsToTemplates(text, sourceLabel) {
  assert.match(text, /\[templates\.md\]/i, `${sourceLabel} should point to templates.md`);
}

function assertDiscoveryOnlyBoundary(text, sourceLabel) {
  assert.match(
    text,
    /(?:planned opener|planned .*resource context|strongest planned .*context)/i,
    `${sourceLabel} should mention planned-context template probing`,
  );
  assert.match(
    text,
    /(?:loose discovery|loose search) results?/i,
    `${sourceLabel} should keep the no-loose-discovery binding boundary`,
  );
}

function assertNoAutoInjectBoundary(text, sourceLabel) {
  assert.match(
    text,
    /(?:loose discovery|loose search)/i,
    `${sourceLabel} should keep the no-loose-discovery binding boundary`,
  );
}

function assertDiscoveryOnlyIncludesExplicitTemplateUnavailable(text, sourceLabel) {
  assert.match(
    text,
    /discovery-only[\s\S]{0,240}explicit template(?: is| being) unavailable in the current context/i,
    `${sourceLabel} should keep explicit-template-unavailable as a discovery-only reason`,
  );
}

function assertNoTemplateDecisionMatrix(text, sourceLabel) {
  assert.doesNotMatch(text, /## Decision Table/i, `${sourceLabel} should not redefine the template decision table`);
  assert.doesNotMatch(
    text,
    /## Automatic Selection Rule/i,
    `${sourceLabel} should not redefine the template automatic-selection router`,
  );
}

function assertOpenAIGuardrails(text) {
  assert.match(text, /routeId/i, 'openai prompt should keep routeId guidance for existing groups');
  assert.match(text, /field popup/i, 'openai prompt should keep field-popup click-open guidance');
  assert.match(
    text,
    /associatedRecords(?:\+| \+ )associationField/i,
    'openai prompt should keep associatedRecords+associationField guidance',
  );
  assert.match(
    text,
    /(?:exactly )?one `?editForm`?/i,
    'openai prompt should keep exactly-one-editForm guidance for custom edit popups',
  );
}

test('skill docs keep a CLI-first contract while preserving payload docs', () => {
  const requiredFiles = [
    'SKILL.md',
    'agents/openai.yaml',
    'references/cli-transport.md',
    'references/cli-command-surface.md',
    'references/transport-crosswalk.md',
    'references/normative-contract.md',
    'references/execution-checklist.md',
    'references/ascii-preview.md',
    'references/page-blueprint.md',
    'references/page-intent.md',
    'references/template-decision-summary.md',
    'references/reaction.md',
  ];

  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(path.join(skillRoot, relativePath)), true, `${relativePath} should exist`);
  }

  const skill = read('SKILL.md');
  assertRelativeMarkdownLinksExist('SKILL.md');
  assert.match(skill, /Canonical transport is `nocobase-ctl flow-surfaces`/);
  assert.match(skill, /If `nocobase-ctl` is available but its env\/runtime\/auth is not ready, stop and guide the user to repair the CLI path/i);
  assert.match(skill, /Only fall back to MCP when the CLI itself is unavailable or when the current environment cannot expose the runtime command surface through the CLI/i);
  assert.match(skill, /Read \[cli-transport\.md\]/);
  assert.match(skill, /Read \[cli-command-surface\.md\]/);
  assert.match(skill, /transport-crosswalk\.md/);
  assert.match(skill, /`nb-page-preview` and `nb-runjs` are local helper CLIs only/i);
  assert.match(skill, /nocobase-ctl flow-surfaces apply-blueprint/);
  assert.match(skill, /nocobase-ctl flow-surfaces get-reaction-meta/);
  assert.match(skill, /tool-shapes\.md.*payload/i);
  assert.match(skill, /Before the first `applyBlueprint`, run the local prepare-write gate/i);
  assert.match(skill, /raw JSON body through `nocobase-ctl flow-surfaces apply-blueprint --body` \/ `--body-file`/i);
  assert.match(skill, /returns the normalized CLI body/i);
  assert.match(skill, /Template selection is intent-first/i);
  assert.match(skill, /whole-page `create` \/ `replace` is not exempt/i);
  assert.match(skill, /stable best available candidate/i);
  assert.match(skill, /if the top candidates still tie, stop and ask/i);
  assert.match(skill, /read \[templates\.md\].*before deciding inline vs template/i);
  assert.match(skill, /users may describe blocks, relations, and operations in business language/i);
  assert.match(skill, /ordered single-page runs/i);
  assert.match(skill, /never author or imply a multi-page `applyBlueprint` payload/i);
  assert.match(skill, /template seed for later pages/i);
  assert.doesNotMatch(skill, /flow_surfaces_apply_blueprint\.requestBody/);
  assert.doesNotMatch(skill, /normalized \{ requestBody: <blueprint> \}/i);

  assertRelativeMarkdownLinksExist('references/cli-transport.md');
  assertRelativeMarkdownLinksExist('references/cli-command-surface.md');
  assertRelativeMarkdownLinksExist('references/transport-crosswalk.md');
  assertRelativeMarkdownLinksExist('references/normative-contract.md');
  assertRelativeMarkdownLinksExist('references/execution-checklist.md');
  assertRelativeMarkdownLinksExist('references/ascii-preview.md');
  assertRelativeMarkdownLinksExist('references/page-blueprint.md');
  assertRelativeMarkdownLinksExist('references/page-intent.md');
  assertRelativeMarkdownLinksExist('references/template-decision-summary.md');
  assertRelativeMarkdownLinksExist('references/reaction.md');
  assertRelativeMarkdownLinksExist('references/popup.md');
  assertRelativeMarkdownLinksExist('references/verification.md');
  assertRelativeMarkdownLinksExist('references/runtime-playbook.md');
  assertRelativeMarkdownLinksExist('references/templates.md');
  assertRelativeMarkdownLinksExist('references/settings.md');
  assertRelativeMarkdownLinksExist('references/chart-core.md');
  assertRelativeMarkdownLinksExist('references/capabilities.md');
  assertRelativeMarkdownLinksExist('references/aliases.md');
  assertRelativeMarkdownLinksExist('references/page-archetypes.md');

  const cliTransport = read('references/cli-transport.md');
  assert.match(cliTransport, /Use `nocobase-ctl flow-surfaces` whenever it is available/);
  assert.match(cliTransport, /Only fall back to MCP when the CLI itself is unavailable, or when the current environment still cannot expose the required runtime command family through the CLI after the repair sequence has completed/i);
  assert.match(cliTransport, /nocobase-ctl --help/);
  assert.match(cliTransport, /nocobase-ctl env --help/);
  assert.match(cliTransport, /nocobase-ctl flow-surfaces --help/);
  assert.match(cliTransport, /env add/);
  assert.match(cliTransport, /env use/);
  assert.match(cliTransport, /env update/);
  assertInOrder(
    cliTransport,
    [
      'nocobase-ctl --help',
      'nocobase-ctl env --help',
      'nocobase-ctl env add',
      'nocobase-ctl env use',
      'nocobase-ctl env update',
      'nocobase-ctl flow-surfaces --help',
    ],
    'cli-transport should require env repair before runtime help',
  );

  const cliSurface = read('references/cli-command-surface.md');
  assert.match(cliSurface, /Help-first Rule/);
  assert.match(cliSurface, /After the env is configured and `env update` has loaded runtime commands/i);
  assert.match(cliSurface, /nocobase-ctl flow-surfaces apply-blueprint/);
  assert.match(cliSurface, /nocobase-ctl flow-surfaces get-reaction-meta/);
  assert.match(cliSurface, /update-settings/);
  assert.match(cliSurface, /prefer `--body-file`/);
  assert.match(cliSurface, /transport-crosswalk\.md/);

  const crosswalk = read('references/transport-crosswalk.md');
  assert.match(crosswalk, /thin naming map between the canonical CLI surface and MCP fallback tools/i);
  assert.match(crosswalk, /flow_surfaces_apply_blueprint/);
  assert.match(crosswalk, /flow_surfaces_get_reaction_meta/);
  assert.match(crosswalk, /flow_surfaces_move_tab/);
  assert.match(crosswalk, /flow_surfaces_remove_node/);
  assert.match(crosswalk, /flow_surfaces_update_settings/);
  assert.match(crosswalk, /\[tool-shapes\.md\]/);
  assert.match(crosswalk, /\[page-blueprint\.md\]/);
  assert.match(crosswalk, /\[reaction\.md\]/);
  assert.match(crosswalk, /do not copy payloads from this file/i);

  const pageIntent = read('references/page-intent.md');
  assert.match(pageIntent, /actual CLI write time/i);
  assert.match(pageIntent, /raw JSON request body/i);
  assert.match(pageIntent, /only in MCP fallback/i);
  assert.match(pageIntent, /default to exactly \*\*one tab\*\*/i);
  assert.match(pageIntent, /Summary.*Later.*备用.*tab/i);
  assert.match(pageIntent, /markdown` \/ note \/ banner block/i);
  assert.match(pageIntent, /every field named in blueprint `fields\[\]` has a non-empty live `interface`/i);
  assert.match(pageIntent, /navigation\.group\.routeId/);
  assert.match(pageIntent, /associatedRecords \+ associationField/i);
  assert.match(pageIntent, /do not stringify the final page blueprint/i);
  assert.match(pageIntent, /CLI `--body` \/ `--body-file`/);
  assert.match(pageIntent, /only in MCP fallback should that same object be wrapped under `requestBody`/i);
  assertPointsToTemplates(pageIntent, 'page-intent.md');
  assertNoTemplateDecisionMatrix(pageIntent, 'page-intent.md');
  assert.match(pageIntent, /whole-page `create` \/ `replace`[\s\S]*probe templates/i);
  assert.match(pageIntent, /stable best candidate/i);
  assert.match(pageIntent, /spans several pages[\s\S]*ordered page plan/i);
  assert.match(pageIntent, /minimal reasonable structure/i);
  assert.match(pageIntent, /template seed for a later page/i);
  assert.match(pageIntent, /整体交互别差太多/i);
  assert.doesNotMatch(pageIntent, /whole-page `create` \/ `replace`[\s\S]*stays discovery-only/i);
  assert.doesNotMatch(pageIntent, /explicit template `uid` \/ `name`[\s\S]*(?:identity|compatibility)/i);

  const pageBlueprint = read('references/page-blueprint.md');
  assert.match(pageBlueprint, /Canonical front door is `nocobase-ctl flow-surfaces apply-blueprint`/);
  assert.match(pageBlueprint, /actual CLI request-body shape/i);
  assert.match(pageBlueprint, /pass this document itself as the raw JSON body/i);
  assert.match(pageBlueprint, /Only in MCP fallback should that same object be wrapped under `requestBody`/i);
  assert.match(pageBlueprint, /default to exactly \*\*one tab\*\*/i);
  assert.match(pageBlueprint, /Summary.*Later.*备用.*tab/i);
  assert.match(pageBlueprint, /Every field placed into any blueprint `fields\[\]` must come from live `collections:get\(appends=\["fields"\]\)` truth/i);
  assert.match(pageBlueprint, /do \*\*not\*\* support generic `form`/i);
  assert.match(pageBlueprint, /`editForm`/);
  assertPointsToTemplates(pageBlueprint, 'page-blueprint.md');
  assertNoTemplateDecisionMatrix(pageBlueprint, 'page-blueprint.md');
  assert.match(pageBlueprint, /stable best candidate/i);
  assertNoAutoInjectBoundary(pageBlueprint, 'page-blueprint.md');

  const executionChecklist = read('references/execution-checklist.md');
  assert.match(executionChecklist, /Use CLI first/i);
  assert.match(executionChecklist, /nocobase-ctl --help/);
  assert.match(executionChecklist, /nocobase-ctl env --help/);
  assert.match(executionChecklist, /nocobase-ctl flow-surfaces --help/);
  assert.match(executionChecklist, /CLI `get` -> top-level locator flags, no JSON body/i);
  assert.match(executionChecklist, /CLI body-based commands -> raw JSON business object through `--body` \/ `--body-file`/i);
  assert.match(executionChecklist, /Only in MCP fallback should that same blueprint be wrapped as `requestBody: \{ \.\.\. \}`/i);
  assert.match(executionChecklist, /collections:get\(appends=\["fields"\]\)/);
  assert.match(executionChecklist, /do \*\*not\*\* create another same-title group/i);
  assert.match(executionChecklist, /exactly one `editForm`/i);
  assertPointsToTemplates(executionChecklist, 'execution-checklist.md');
  assertNoTemplateDecisionMatrix(executionChecklist, 'execution-checklist.md');
  assert.match(executionChecklist, /use the strongest planned opener\/resource scene context/i);
  assert.match(executionChecklist, /whole-page `create` \/ `replace` should not skip this step/i);
  assert.match(executionChecklist, /spans several pages[\s\S]*ordered page runs/i);
  assert.match(executionChecklist, /only then may you `save-template`/i);
  assert.match(executionChecklist, /`get-template` must succeed immediately after `save-template`/i);
  assert.match(executionChecklist, /higher `usageCount`/i);
  assert.match(executionChecklist, /natural-language business request may only describe blocks, relations, and operations/i);
  assert.doesNotMatch(executionChecklist, /explicit `uid` \/ `name`[\s\S]*(?:identity|compatibility)/i);
  assert.doesNotMatch(executionChecklist, /Confirm MCP is reachable and authenticated/i);
  assert.doesNotMatch(executionChecklist, /copy the \*\*Tool-call envelope\*\* shape first/i);

  const normative = read('references/normative-contract.md');
  assert.match(normative, /Canonical front door:\s+`nocobase-ctl flow-surfaces`/);
  assert.match(normative, /live `nocobase-ctl flow-surfaces --help`/);
  assert.match(normative, /CLI request-body rule and MCP fallback map/i);
  assert.match(normative, /Correct CLI body/i);
  assert.match(normative, /Correct MCP fallback envelope/i);
  assert.match(normative, /Template-selection semantics[\s\S]*\[templates\.md\]/i);
  assert.match(normative, /Do not start by changing the inner blueprint shape until the CLI request body, or the fallback envelope/i);
  assert.match(normative, /do \*\*not\*\* create another same-title group/i);
  assert.match(normative, /only default field truth for UI authoring/i);

  const toolShapes = read('references/tool-shapes.md');
  assert.match(toolShapes, /Canonical front door is `nocobase-ctl`/);
  assert.match(toolShapes, /Most other body-based `flow-surfaces` commands take the raw business object through CLI `--body` \/ `--body-file`/i);
  assert.match(toolShapes, /Only in MCP fallback should that same business object be wrapped under `requestBody`/i);
  assert.match(toolShapes, /`nocobase-ctl flow-surfaces get` is the common exception: it uses top-level locator flags and no JSON body/i);
  assert.match(toolShapes, /Wrong CLI body/i);
  assert.match(toolShapes, /Correct CLI body for `configure`/i);
  assert.match(toolShapes, /CLI request body:/i);
  assert.match(toolShapes, /MCP fallback mapping/i);
  assert.match(toolShapes, /transport-crosswalk\.md/);
  assert.match(toolShapes, /Public applyBlueprint blocks do \*\*not\*\* support generic `form`/i);
  assert.match(toolShapes, /For custom `edit` popups with `popup\.blocks`, include exactly one `editForm` block/i);
  assert.match(toolShapes, /keep exactly one real tab/i);
  assert.match(toolShapes, /Summary.*Later.*备用.*tab/i);
  assert.match(toolShapes, /Default blueprint `fields\[\]` entries to simple strings/i);
  assert.match(toolShapes, /### `add-tab`/);
  assert.match(toolShapes, /### `move-tab`/);
  assert.match(toolShapes, /### `remove-node`/);
  assert.match(toolShapes, /### `update-menu`/);
  assert.match(toolShapes, /Common Invalid Public Shapes/i);
  assert.match(toolShapes, /collectionName/);
  assert.match(toolShapes, /fieldPath/);
  assert.match(toolShapes, /resourceBinding/);
  assert.match(toolShapes, /Later notes/);
  assert.match(toolShapes, /layout-cell `uid` \/ `ref` \/ `\$ref`/i);
  assert.match(toolShapes, /object-style `field\.target`/i);
  assert.match(toolShapes, /resource\.associationField/i);
  assert.match(toolShapes, /requestBody\": \"\{\\\"version\\\":\\\"1\\\"/i);

  const reaction = read('references/reaction.md');
  assert.match(reaction, /Canonical front door is `nocobase-ctl flow-surfaces`/);
  assert.match(reaction, /nocobase-ctl flow-surfaces get-reaction-meta/);
  assert.match(reaction, /nocobase-ctl flow-surfaces set-\*/);
  assert.match(reaction, /raw business object through `--body` \/ `--body-file`/i);
  assert.match(reaction, /Only in MCP fallback should that same business object be wrapped under `requestBody`/i);
  assert.match(reaction, /Localized reaction edits should follow this CLI request body/i);
  assert.doesNotMatch(reaction, /Localized reaction edits should follow this shape/i);

  const asciiPreview = read('references/ascii-preview.md');
  assert.match(asciiPreview, /whole-page `applyBlueprint` authoring before the first write/i);
  assert.match(asciiPreview, /return the normalized CLI raw body only when the gate passes/i);
  assert.match(asciiPreview, /If MCP fallback is later required, wrap that same object under `requestBody`/i);
  assert.match(asciiPreview, /\{ requestBody, templateDecision \}/i);
  assert.match(asciiPreview, /normalized `templateDecision`/i);
  assert.match(asciiPreview, /should not emit the legacy outer-wrapper warning/i);
  assert.match(asciiPreview, /inconsistent-template-decision/i);
  assert.match(asciiPreview, /matching one bound uid\/mode for the current decision is sufficient/i);
  assert.doesNotMatch(asciiPreview, /matches only one binding on a mixed-template page/i);
  assert.doesNotMatch(asciiPreview, /return the normalized \{ requestBody: <blueprint> \} tool-call envelope/i);

  const runtimePlaybook = read('references/runtime-playbook.md');
  assert.match(runtimePlaybook, /Canonical front door is `nocobase-ctl`/);
  assert.match(runtimePlaybook, /nocobase-ctl flow-surfaces apply-blueprint/);
  assert.match(runtimePlaybook, /nocobase-ctl flow-surfaces get-reaction-meta/);
  assert.match(runtimePlaybook, /update-settings/);
  assert.doesNotMatch(runtimePlaybook, /describeSurface/);

  const settings = read('references/settings.md');
  assert.match(settings, /Canonical front door is `nocobase-ctl flow-surfaces`/);
  assert.match(settings, /JSON examples below default to the CLI raw body/i);
  assert.match(settings, /update-settings/);
  assert.match(settings, /set-layout/);
  assert.match(settings, /set-event-flows/);
  assert.doesNotMatch(settings, /requestBody\.settings/);
  assert.doesNotMatch(settings, /updateSettings/);
  assert.doesNotMatch(settings, /setLayout/);
  assert.doesNotMatch(settings, /setEventFlows/);

  const templates = read('references/templates.md');
  assert.match(templates, /Canonical front door is `nocobase-ctl flow-surfaces`/);
  assert.match(templates, /JSON examples below default to the CLI raw body/i);
  assert.match(templates, /single normative template-selection source/i);
  assert.match(templates, /defines both template-selection semantics/i);
  assert.match(templates, /## Decision Table/);
  assert.match(templates, /## Identity Resolution/);
  assert.match(templates, /explicit template `uid` resolves one exact candidate identity/i);
  assert.match(templates, /explicit template `name` resolves identity only when it matches exactly one candidate/i);
  assert.match(templates, /non-unique template `name`[\s\S]*ask(?: the user)?(?: to choose| for)? an exact uid/i);
  assert.match(templates, /identity resolution does \*\*not\*\* prove current-context compatibility/i);
  assert.match(templates, /availability is not yet proven/i);
  assert.match(templates, /explicit template row missing or `available = false`[\s\S]*do not bind/i);
  assert.match(templates, /Whole-page `create` \/ `replace` should proactively probe templates/i);
  assert.match(templates, /missing live `target\.uid` does \*\*not\*\* by itself block/i);
  assert.match(templates, /If the user asks for several pages, decompose the task into sequential page runs/i);
  assert.match(templates, /Do \*\*not\*\* treat an entire page as a template type/i);
  assert.match(templates, /earlier page in the same task may become a template seed only after its write and readback succeed/i);
  assert.match(templates, /same-task seed does \*\*not\*\* bypass contextual availability/i);
  assert.match(templates, /### Same-task live reuse loop/i);
  assert.match(templates, /immediately call `get-template` on the returned template uid/i);
  assert.match(templates, /page B, run contextual `list-templates` again/i);
  assert.match(templates, /`usageCount` should usually increase/i);
  assert.match(templates, /沿用前面的思路/i);
  assert.match(templates, /不要每次都从零搭/i);
  assert.match(templates, /stable best-candidate ranking/i);
  assert.match(templates, /no explicit template[\s\S]*`1`[\s\S]*select that template/i);
  assert.match(
    templates,
    /`>1`, stable best candidate exists[\s\S]*auto-select the best candidate/i,
  );
  assert.match(templates, /top candidates still tied after ranking[\s\S]*ask the user to choose/i);
  assert.match(templates, /Without a live `target\.uid`, search results may still drive whole-page binding/i);
  assert.match(templates, /Do not treat `available = true` as a recommendation signal/i);
  assert.match(templates, /must not recreate the frontend compatibility checks locally/i);
  assert.match(templates, /does not bypass contextual availability/i);
  assert.match(templates, /If the user explicitly requires that exact template, stop at the compatibility explanation/i);
  assert.match(templates, /Default selected templates to `reference`/i);
  assert.match(templates, /switch to `copy` only/i);
  assert.match(templates, /Mode selection only happens after template selection/i);
  assert.match(templates, /`copy` is not a fallback when no concrete template was selected/i);
  assert.match(templates, /## CLI-first Request Shapes/);
  assert.match(templates, /when no live `target\.uid` exists yet[\s\S]*omit `target\.uid`/i);
  assert.match(templates, /Do not invent extra planning-only fields/i);
  assert.match(templates, /list-templates/);
  assert.match(templates, /save-template/);
  assert.match(templates, /get-template/);
  assert.match(templates, /convert-template-to-copy/);
  assert.match(templates, /MCP fallback uses the same business object wrapped under `requestBody`/i);
  assert.doesNotMatch(templates, /## Canonical Request Shapes/);
  assert.doesNotMatch(templates, /listTemplates/);
  assert.doesNotMatch(templates, /getTemplate/);
  assert.doesNotMatch(templates, /saveTemplate/);
  assert.doesNotMatch(templates, /convertTemplateToCopy/);
  assert.doesNotMatch(templates, /destroyTemplate/);
  assert.doesNotMatch(templates, /exactly one usable candidate/i);
  assert.doesNotMatch(templates, /multiple available templates when the user did not explicitly ask for reuse\/unification/i);
  assert.doesNotMatch(templates, /do not implicitly select one/i);

  const popup = read('references/popup.md');
  assertPointsToTemplates(popup, 'popup.md');
  assert.match(popup, /\[template-decision-summary\.md\]/i, 'popup.md should point to template-decision-summary.md for final non-binding reasons');
  assertNoTemplateDecisionMatrix(popup, 'popup.md');
  assertDiscoveryOnlyBoundary(popup, 'popup.md');
  assertDiscoveryOnlyIncludesExplicitTemplateUnavailable(popup, 'popup.md');
  assert.doesNotMatch(popup, /Only stay discovery-only when/i);
  assert.doesNotMatch(popup, /explicit template `uid` \/ `name`[\s\S]*(?:identity|compatibility)/i);

  const verification = read('references/verification.md');
  assert.match(verification, /Canonical front door is `nocobase-ctl flow-surfaces`/);
  assert.match(verification, /default to `nocobase-ctl flow-surfaces get` first/i);
  assert.match(verification, /nocobase-ctl flow-surfaces describe-surface/);
  assert.match(verification, /nocobase-ctl flow-surfaces get --page-schema-uid/);
  assert.match(verification, /update-settings/);
  assertNoTemplateDecisionMatrix(verification, 'verification.md');
  assert.match(verification, /\[template-decision-summary\.md\]/i);
  assert.match(verification, /final user-visible preview or summary[\s\S]*discovery-only or non-template explicitly/i);
  assert.match(verification, /default ASCII preview should at least expose template identity \+ `mode`/i);
  assert.match(verification, /Without a live `target\.uid` \/ opener[\s\S]*planned opener\/resource context/i);
  assert.match(verification, /stable best candidate/i);
  assertDiscoveryOnlyIncludesExplicitTemplateUnavailable(verification, 'verification.md');
  assert.match(verification, /For `reference` template writes/i);
  assert.match(verification, /For `copy` or `convert-template-to-copy`/i);
  assert.match(verification, /non-template/i);
  assert.doesNotMatch(verification, /Discovery-only is now the fallback only when/i);
  assert.doesNotMatch(verification, /describeSurface/);
  assert.doesNotMatch(verification, /get\(\{ pageSchemaUid \}\)/);
  assert.doesNotMatch(verification, /updateSettings/);

  const templateDecisionSummary = read('references/template-decision-summary.md');
  assert.match(templateDecisionSummary, /does \*\*not\*\* define template selection/i);
  assertPointsToTemplates(templateDecisionSummary, 'template-decision-summary.md');
  assert.match(templateDecisionSummary, /prepareApplyBlueprintRequest\(\.\.\.\).*nb-page-preview --prepare-write/i);
  assert.match(templateDecisionSummary, /`selected-reference`/);
  assert.match(templateDecisionSummary, /`selected-copy`/);
  assert.match(templateDecisionSummary, /`discovery-only`/);
  assert.match(templateDecisionSummary, /`inline-non-template`/);
  assert.match(templateDecisionSummary, /`standard-reuse`/);
  assert.match(templateDecisionSummary, /`local-customization`/);
  assert.match(templateDecisionSummary, /`missing-live-context`/);
  assert.match(templateDecisionSummary, /`explicit-template-unavailable`/);
  assert.match(templateDecisionSummary, /`multiple-discovered-not-bound`/);
  assert.match(templateDecisionSummary, /\{ requestBody, templateDecision \}/i);
  assert.match(templateDecisionSummary, /other blueprint gates fail/i);
  assert.match(templateDecisionSummary, /blueprint is not recognizable yet/i);
  assert.match(templateDecisionSummary, /inconsistent-template-decision/i);
  assert.match(templateDecisionSummary, /current template decision, not the entire page/i);
  assert.match(templateDecisionSummary, /only verifies that the blueprint contains at least one matching template uid\/mode/i);
  assert.match(templateDecisionSummary, /does not yet prove node-level scope\/path identity on mixed pages/i);
  assert.match(templateDecisionSummary, /mixed pages may still contain other bound templates elsewhere/i);
  assert.match(templateDecisionSummary, /do \*\*not\*\* mean the whole blueprint is unbound/i);
  assert.match(templateDecisionSummary, /ASCII preview does not need to invent a reason/i);
  assert.doesNotMatch(templateDecisionSummary, /## Decision Table/i);

  const chartCore = read('references/chart-core.md');
  assert.match(chartCore, /Canonical front door is `nocobase-ctl flow-surfaces`/);
  assert.match(chartCore, /When this file mentions `add-block`, `configure`, `context`, or `get`/);
  assert.match(chartCore, /nocobase-ctl flow-surfaces context --body/);
  assert.match(chartCore, /nocobase-ctl flow-surfaces get --uid/);
  assert.match(chartCore, /## How to use `context`/);
  assert.doesNotMatch(chartCore, /flowSurfaces:context/);

  const openaiYaml = read('agents/openai.yaml');
  assert.match(openaiYaml, /Canonical front door: `nocobase-ctl flow-surfaces`/);
  assert.match(openaiYaml, /`nocobase-ctl --help`(?: and| \+) `nocobase-ctl env --help`/i);
  assert.match(openaiYaml, /repair (?:the )?CLI(?: [^.;]+)?(?: instead of switching to MCP| before MCP)/i);
  assert.match(openaiYaml, /Intent first/i);
  assert.match(openaiYaml, /Natural-language prompts may only name blocks\/relations\/actions/i);
  assert.match(openaiYaml, /Multi-page asks split into sequential single-page runs/i);
  assert.match(openaiYaml, /identity, not availability/i);
  assert.match(openaiYaml, /never treat a whole page as a template/i);
  assert.match(openaiYaml, /No live target\.uid is not a blocker/i);
  assert.match(openaiYaml, /stable best winner/i);
  assert.match(openaiYaml, /Default selected templates to `reference`/i);
  assert.match(openaiYaml, /apply-blueprint/);
  assert.match(openaiYaml, /localized edit[\s\S]*matching `flow-surfaces` command/i);
  assert.match(openaiYaml, /get-reaction-meta/);
  assertOpenAIGuardrails(openaiYaml);
  assert.match(openaiYaml, /API\/MCP docs (?:remain|=) payload mapping (?:and|\+) fallback(?: only)?/i);
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.ok(defaultPrompt.length <= 890, 'openai default_prompt should stay at or below 890 chars to leave prompt headroom');
});
