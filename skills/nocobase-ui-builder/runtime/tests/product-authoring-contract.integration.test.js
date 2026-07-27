import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));
const requireProductContract =
  process.env.REQUIRE_PRODUCT_CONTRACT === '1' || process.env.npm_lifecycle_event === 'test:product-contract';
const configuredProductRoot = String(process.env.NOCOBASE_REPO || '').trim();

if (requireProductContract && !configuredProductRoot) {
  throw new Error('NOCOBASE_REPO is required for the product contract gate');
}

const productRoot = configuredProductRoot ? path.resolve(configuredProductRoot) : null;
const productTestOptions = productRoot ? {} : { skip: 'Set NOCOBASE_REPO to run the cross-repository contract gate' };

function readSkill(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

function readProduct(relativePath) {
  assert.ok(productRoot, 'product checkout should be configured');
  const absolutePath = path.join(productRoot, relativePath);
  assert.equal(existsSync(absolutePath), true, `missing NocoBase contract file: ${absolutePath}`);
  return readFileSync(absolutePath, 'utf8');
}

function readProductJson(relativePath) {
  return JSON.parse(readProduct(relativePath));
}

function parseBacktickValuesAfterPrefix(text, prefix) {
  const line = text.split('\n').find((candidate) => candidate.startsWith(prefix));
  assert.ok(line, `missing documented list: ${prefix}`);
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function extractObjectSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker} after ${startMarker}`);
  return text.slice(start, end);
}

function extractJsonAfterHeading(markdown, heading) {
  const sectionStart = markdown.indexOf(`## ${heading}\n`);
  assert.notEqual(sectionStart, -1, `missing heading: ${heading}`);
  const fenceStart = markdown.indexOf('```json\n', sectionStart);
  assert.notEqual(fenceStart, -1, `missing JSON request after ${heading}`);
  const jsonStart = fenceStart + '```json\n'.length;
  const fenceEnd = markdown.indexOf('\n```', jsonStart);
  assert.notEqual(fenceEnd, -1, `unterminated JSON request after ${heading}`);
  return JSON.parse(markdown.slice(jsonStart, fenceEnd));
}

function sortedUnique(values, label) {
  assert.ok(Array.isArray(values) && values.length > 0, `${label} should be a non-empty array`);
  assert.ok(
    values.every((value) => typeof value === 'string' && value.length > 0),
    `${label} should contain strings`,
  );
  assert.equal(new Set(values).size, values.length, `${label} should not contain duplicates`);
  return [...values].sort();
}

test('uses the product manifest as the sole enum authority for Skills routing', productTestOptions, () => {
  const manifest = readProductJson('packages/core/runjs-workspace/src/shared/runjs-authoring-contract.v1.json');
  const workspace = readSkill('references/runjs-workspace-source.md');
  const transport = readSkill('references/light-extension-transport.md');
  const productConstants = readProduct('packages/plugins/@nocobase/plugin-light-extension/src/constants.ts');

  const documentedVersion = workspace.match(/Contract version `([^`]+)` publishes/i)?.[1];
  assert.equal(documentedVersion, manifest.authoringContractVersion);
  assert.equal(manifest.inlineWorkspace.available, true);
  assert.equal(manifest.inlineWorkspace.supportsMaterialize, true);
  assert.match(workspace, new RegExp(`saveMode:\\s*"${manifest.inlineWorkspace.saveMode}"`, 'i'));
  assert.deepEqual(parseBacktickValuesAfterPrefix(workspace, '- owner kinds:'), manifest.inlineWorkspace.ownerKinds);
  assert.deepEqual(parseBacktickValuesAfterPrefix(workspace, '- model uses:'), manifest.inlineWorkspace.modelUses);
  sortedUnique(manifest.inlineWorkspace.ownerKinds, 'inlineWorkspace.ownerKinds');
  sortedUnique(manifest.inlineWorkspace.modelUses, 'inlineWorkspace.modelUses');

  const supportedKindsDeclaration = productConstants.match(
    /LIGHT_EXTENSION_SUPPORTED_KINDS\s*=\s*\[([^\]]+)\]\s*as const/,
  );
  assert.ok(supportedKindsDeclaration, 'product should publish LIGHT_EXTENSION_SUPPORTED_KINDS');
  const productEntryKinds = [...supportedKindsDeclaration[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.deepEqual(productEntryKinds, manifest.externalization.entryKinds);
  sortedUnique(manifest.externalization.entryKinds, 'externalization.entryKinds');

  const documentedDestinations = [
    extractJsonAfterHeading(transport, 'Default Repository request').destination.type,
    extractJsonAfterHeading(transport, 'Existing Repository request').destination.type,
    extractJsonAfterHeading(transport, 'New Repository request').destination.type,
  ];
  assert.deepEqual(
    sortedUnique(documentedDestinations, 'documented destinations'),
    sortedUnique(manifest.externalization.destinationTypes, 'externalization.destinationTypes'),
  );
});

test('keeps Core, Flow Surfaces, and Light Extension Swagger aligned with the manifest', productTestOptions, () => {
  const manifest = readProductJson('packages/core/runjs-workspace/src/shared/runjs-authoring-contract.v1.json');
  const coreSwagger = readProduct('packages/core/runjs-workspace/src/swagger/index.ts');
  const flowSwaggerIndex = readProduct('packages/plugins/@nocobase/plugin-flow-engine/src/swagger/index.ts');
  const flowSwagger = readProduct('packages/plugins/@nocobase/plugin-flow-engine/src/swagger/flow-surfaces.ts');
  const lightPaths = readProduct('packages/plugins/@nocobase/plugin-light-extension/src/swagger/paths.ts');
  const lightSchemas = readProduct('packages/plugins/@nocobase/plugin-light-extension/src/swagger/schemas.ts');

  assert.match(coreSwagger, /runJSAuthoringContractV1/);
  for (const property of [
    'authoringContractVersion',
    'saveMode',
    'ownerKinds',
    'modelUses',
    'entryKinds',
    'destinationTypes',
    'supportsIdempotency',
    'supportsMoveToInline',
  ]) {
    assert.match(coreSwagger, new RegExp(`\\b${property}\\b`), `Core Swagger should expose ${property}`);
  }
  assert.match(coreSwagger, /['"]\/runJSSources:capabilities['"]/);
  assert.match(flowSwaggerIndex, /\.\.\.runJSWorkspaceSwagger\.paths/);
  assert.match(flowSwaggerIndex, /\.\.\.runJSWorkspaceSwagger\.components\.schemas/);

  for (const schema of [
    'FlowSurfaceJsBlockSourceBinding',
    'FlowSurfaceJsFieldSourceBinding',
    'FlowSurfaceJsActionSourceBinding',
    'FlowSurfaceJsItemSourceBinding',
    'FlowSurfaceJsConfigureChanges',
  ]) {
    assert.match(flowSwagger, new RegExp(`\\b${schema}\\b`));
  }
  assert.match(flowSwagger, /sourceMode[\s\S]{0,160}sourceBinding[\s\S]{0,160}settings/);

  for (const actionPath of [
    '/lightExtensionEntries:listSelectable',
    '/lightExtensions:moveSource',
    '/lightExtensions:moveToInline',
  ]) {
    assert.match(lightPaths, new RegExp(actionPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const destinationSchema = extractObjectSection(
    lightSchemas,
    'LightExtensionMoveSourceDestination:',
    'LightExtensionMoveSourceRequest:',
  );
  const swaggerDestinations = [...destinationSchema.matchAll(/enum:\s*\[['"]([^'"]+)['"]\]/g)].map((match) => match[1]);
  assert.deepEqual(
    sortedUnique(swaggerDestinations, 'Swagger destinations'),
    sortedUnique(manifest.externalization.destinationTypes, 'manifest destinations'),
  );

  const moveSourceSchema = extractObjectSection(
    lightSchemas,
    'LightExtensionMoveSourceRequest:',
    'LightExtensionMoveSourceResult:',
  );
  assert.match(moveSourceSchema, /idempotencyKey/);
  assert.match(moveSourceSchema, /destination/);
  assert.match(moveSourceSchema, /Complete RunJS source workspace/i);

  const moveToInlineSchema = extractObjectSection(
    lightSchemas,
    'LightExtensionMoveToInlineRequest:',
    'LightExtensionMoveToInlineResult:',
  );
  assert.doesNotMatch(moveToInlineSchema, /idempotencyKey/);
  assert.match(moveToInlineSchema, /Complete source files reachable from the Entry/i);
});

test('keeps documented public commands backed by Swagger and CLI command paths', productTestOptions, () => {
  const transport = readSkill('references/light-extension-transport.md');
  const coreSwagger = readProduct('packages/core/runjs-workspace/src/swagger/index.ts');
  const lightPaths = readProduct('packages/plugins/@nocobase/plugin-light-extension/src/swagger/paths.ts');
  const runtimeCommandTests = readProduct('packages/core/cli/src/__tests__/light-extension-runtime-commands.test.ts');
  const commandRows = [...transport.matchAll(/^\| `([^`]+:[^`]+)` \| `([^`]+)` \|/gm)];
  assert.ok(commandRows.length >= 8, 'transport should publish the complete backend/CLI crosswalk');

  for (const [, backendAction, publicCommand] of commandRows) {
    const swaggerSource = backendAction === 'runJSSources:capabilities' ? coreSwagger : lightPaths;
    assert.match(swaggerSource, new RegExp(`/${backendAction}`));

    if (publicCommand.startsWith('nb api ')) {
      const commandId = publicCommand.slice('nb api '.length).split(/\s+/).slice(0, 2).join(' ');
      assert.match(runtimeCommandTests, new RegExp(commandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }

  for (const [commandName, relativePath] of [
    ['nb light pull', 'packages/core/cli/src/commands/light/pull.ts'],
    ['nb light check', 'packages/core/cli/src/commands/light/check.ts'],
    ['nb light save', 'packages/core/cli/src/commands/light/save.ts'],
  ]) {
    assert.match(transport, new RegExp(commandName.replaceAll(' ', '\\s+')));
    assert.match(readProduct(relativePath), /export default class Light(?:Pull|Check|Save)/);
  }
});

test('locks delta, externalization, reuse, and move-back semantics across repositories', productTestOptions, () => {
  const manifest = readProductJson('packages/core/runjs-workspace/src/shared/runjs-authoring-contract.v1.json');
  const workspace = readSkill('references/runjs-workspace-source.md');
  const transport = readSkill('references/light-extension-transport.md');
  const roundtrip = readSkill('references/light-extension-roundtrip.md');

  assert.equal(manifest.inlineWorkspace.saveMode, 'delta');
  assert.match(workspace, /baseCommitId[\s\S]{0,160}baseOwnerFingerprint/);
  assert.match(workspace, /expectedBlobHash/);
  assert.equal(manifest.externalization.available, true);
  assert.equal(manifest.externalization.supportsIdempotency, true);
  assert.equal(manifest.externalization.supportsMoveToInline, true);
  assert.match(transport, /equivalent semantic request/i);
  assert.match(transport, /`moveToInline` does not accept or promise an `idempotencyKey`/i);
  assert.match(roundtrip, /one Repository, one Entry, and two Host bindings/i);
  assert.match(roundtrip, /latest reachable dependency closure/i);
  assert.match(roundtrip, /Host A and Entry E have separate histories/i);
});
