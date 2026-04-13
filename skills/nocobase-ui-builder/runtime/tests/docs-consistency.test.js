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
  assert.doesNotMatch(executionChecklist, /Confirm MCP is reachable and authenticated/i);
  assert.doesNotMatch(executionChecklist, /copy the \*\*Tool-call envelope\*\* shape first/i);

  const normative = read('references/normative-contract.md');
  assert.match(normative, /Canonical front door:\s+`nocobase-ctl flow-surfaces`/);
  assert.match(normative, /live `nocobase-ctl flow-surfaces --help`/);
  assert.match(normative, /CLI request-body rule and MCP fallback map/i);
  assert.match(normative, /Correct CLI body/i);
  assert.match(normative, /Correct MCP fallback envelope/i);
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
  assert.match(templates, /## CLI-first Request Shapes/);
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

  const verification = read('references/verification.md');
  assert.match(verification, /Canonical front door is `nocobase-ctl flow-surfaces`/);
  assert.match(verification, /default to `nocobase-ctl flow-surfaces get` first/i);
  assert.match(verification, /nocobase-ctl flow-surfaces describe-surface/);
  assert.match(verification, /nocobase-ctl flow-surfaces get --page-schema-uid/);
  assert.match(verification, /update-settings/);
  assert.doesNotMatch(verification, /describeSurface/);
  assert.doesNotMatch(verification, /get\(\{ pageSchemaUid \}\)/);
  assert.doesNotMatch(verification, /updateSettings/);

  const chartCore = read('references/chart-core.md');
  assert.match(chartCore, /Canonical front door is `nocobase-ctl flow-surfaces`/);
  assert.match(chartCore, /When this file mentions `add-block`, `configure`, `context`, or `get`/);
  assert.match(chartCore, /nocobase-ctl flow-surfaces context --body/);
  assert.match(chartCore, /nocobase-ctl flow-surfaces get --uid/);
  assert.match(chartCore, /## How to use `context`/);
  assert.doesNotMatch(chartCore, /flowSurfaces:context/);

  const openaiYaml = read('agents/openai.yaml');
  assert.match(openaiYaml, /Canonical front door: `nocobase-ctl flow-surfaces`/);
  assert.match(openaiYaml, /Local prerequisite: `nocobase-ctl` on PATH/i);
  assert.match(openaiYaml, /`nocobase-ctl --help` and `nocobase-ctl env --help`/i);
  assert.match(openaiYaml, /repair the CLI path instead of switching to MCP/i);
  assert.match(openaiYaml, /apply-blueprint/);
  assert.match(openaiYaml, /get-reaction-meta/);
  assert.match(openaiYaml, /API\/MCP docs remain payload mapping and fallback only/i);
  const defaultPrompt = readYamlDoubleQuotedScalar(openaiYaml, 'default_prompt');
  assert.ok(defaultPrompt.length < 950, 'openai default_prompt should stay below 950 chars to leave loader headroom');
});
