#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_SPEC_VERSION = '1.0';
export const VERIFY_SPEC_VERSION = '1.0';
export const DEFAULT_BUILD_COMPILE_MODE = 'primitive-tree';

const BLOCK_USE_BY_KIND = {
  Page: 'RootPageModel',
  Tabs: 'RootPageTabModel',
  Grid: 'BlockGridModel',
  Table: 'TableBlockModel',
  Details: 'DetailsBlockModel',
  Form: 'CreateFormModel',
};

const PAGE_MODEL_USES = new Set(['RootPageModel', 'PageModel', 'ChildPageModel']);

const ACTION_USE_BY_KIND = {
  'edit-record-popup': 'EditActionModel',
};

function resolveActionUse(kind) {
  const resolvedUse = ACTION_USE_BY_KIND[kind];
  if (!resolvedUse) {
    throw new Error(`Unsupported action kind "${kind}"`);
  }
  return resolvedUse;
}

function normalizePageUse(pageUse, label, fallbackValue = 'RootPageModel') {
  const normalized = typeof pageUse === 'string' && pageUse.trim() ? pageUse.trim() : fallbackValue;
  if (!PAGE_MODEL_USES.has(normalized)) {
    throw new Error(`${label} must be one of ${[...PAGE_MODEL_USES].join(', ')}`);
  }
  return normalized;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/spec_contracts.mjs normalize-build-spec (--input-json <json> | --input-file <path>)',
    '  node scripts/spec_contracts.mjs normalize-verify-spec (--input-json <json> | --input-file <path>)',
    '  node scripts/spec_contracts.mjs compile-build-spec (--input-json <json> | --input-file <path>)',
    '  node scripts/spec_contracts.mjs build-validation-specs --case-request <text> --session-id <id> --candidate-page-url <url> [--base-slug <slug>] [--session-dir <path>]',
  ].join('\n');
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === 'help') {
    return { command: 'help', flags: {} };
  }
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { command, flags };
}

function normalizeNonEmpty(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function parseJson(rawValue, label) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function readJsonInput(jsonValue, filePath, label) {
  if (jsonValue) {
    return parseJson(jsonValue, label);
  }
  if (filePath) {
    return parseJson(fs.readFileSync(path.resolve(filePath), 'utf8'), `${label} file`);
  }
  throw new Error(`${label} input is required`);
}

function sortUniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function normalizeSource(rawSource, fallbackText) {
  if (typeof rawSource === 'string') {
    return {
      kind: 'request',
      text: rawSource.trim(),
    };
  }
  if (rawSource && typeof rawSource === 'object') {
    return {
      kind: typeof rawSource.kind === 'string' && rawSource.kind.trim() ? rawSource.kind.trim() : 'request',
      text: typeof rawSource.text === 'string' && rawSource.text.trim()
        ? rawSource.text.trim()
        : fallbackText,
      sessionId: typeof rawSource.sessionId === 'string' && rawSource.sessionId.trim()
        ? rawSource.sessionId.trim()
        : undefined,
    };
  }
  return {
    kind: 'request',
    text: fallbackText,
  };
}

function normalizeAction(action, index) {
  if (!action || typeof action !== 'object') {
    throw new Error(`actions[${index}] must be an object`);
  }
  const kind = normalizeNonEmpty(action.kind, `actions[${index}].kind`);
  return {
    kind,
    label: typeof action.label === 'string' && action.label.trim() ? action.label.trim() : kind,
    use: resolveActionUse(kind),
    popup: action.popup && typeof action.popup === 'object'
      ? normalizePopup(action.popup, `actions[${index}].popup`)
      : null,
  };
}

function normalizePopup(popup, label) {
  if (!popup || typeof popup !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return {
    title: typeof popup.title === 'string' && popup.title.trim() ? popup.title.trim() : '',
    pageUse: normalizePageUse(popup.pageUse, `${label}.pageUse`, 'ChildPageModel'),
    blocks: normalizeBlocks(popup.blocks, `${label}.blocks`),
  };
}

function normalizeBlock(block, index, label = 'blocks') {
  if (!block || typeof block !== 'object') {
    throw new Error(`${label}[${index}] must be an object`);
  }
  const kind = normalizeNonEmpty(block.kind, `${label}[${index}].kind`);
  const normalized = {
    kind,
    title: typeof block.title === 'string' && block.title.trim() ? block.title.trim() : '',
    collectionName: typeof block.collectionName === 'string' && block.collectionName.trim()
      ? block.collectionName.trim()
      : '',
    fields: sortUniqueStrings(block.fields),
    actions: Array.isArray(block.actions)
      ? block.actions.map((item, actionIndex) => normalizeAction(item, actionIndex))
      : [],
    relationScope: block.relationScope && typeof block.relationScope === 'object'
      ? {
        sourceCollection: typeof block.relationScope.sourceCollection === 'string' ? block.relationScope.sourceCollection.trim() : '',
        targetCollection: typeof block.relationScope.targetCollection === 'string' ? block.relationScope.targetCollection.trim() : '',
        associationName: typeof block.relationScope.associationName === 'string' ? block.relationScope.associationName.trim() : '',
      }
      : null,
    popup: block.popup && typeof block.popup === 'object'
      ? normalizePopup(block.popup, `${label}[${index}].popup`)
      : null,
    mode: typeof block.mode === 'string' && block.mode.trim() ? block.mode.trim() : '',
  };

  if (normalized.kind === 'Form') {
    normalized.mode = normalized.mode || 'create';
  }

  return normalized;
}

function normalizeBlocks(blocks, label = 'blocks') {
  if (blocks == null) {
    return [];
  }
  if (!Array.isArray(blocks)) {
    throw new Error(`${label} must be an array`);
  }
  return blocks.map((item, index) => normalizeBlock(item, index, label));
}

function normalizeTabs(tabs) {
  if (tabs == null) {
    return [];
  }
  if (!Array.isArray(tabs)) {
    throw new Error('layout.tabs must be an array');
  }
  return tabs.map((tab, index) => {
    if (!tab || typeof tab !== 'object') {
      throw new Error(`layout.tabs[${index}] must be an object`);
    }
    return {
      title: normalizeNonEmpty(tab.title, `layout.tabs[${index}].title`),
      blocks: normalizeBlocks(tab.blocks, `layout.tabs[${index}].blocks`),
    };
  });
}

function deriveRequiredActions(layout) {
  const actions = [];
  for (const block of [...layout.blocks, ...layout.tabs.flatMap((tab) => tab.blocks)]) {
    for (const action of block.actions) {
      if (action.kind === 'edit-record-popup' && block.collectionName) {
        actions.push({
          kind: 'edit-record-popup',
          collectionName: block.collectionName,
        });
      }
    }
  }
  return actions;
}

function deriveRequiredTabs(layout, explicit) {
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`requirements.requiredTabs[${index}] must be an object`);
      }
      return {
        titles: sortUniqueStrings(entry.titles),
        pageUse: normalizePageUse(entry.pageUse, `requirements.requiredTabs[${index}].pageUse`, 'RootPageModel'),
      };
    });
  }
  if (layout.tabs.length === 0) {
    return [];
  }
  return [
    {
      titles: layout.tabs.map((tab) => tab.title),
      pageUse: layout.pageUse,
    },
  ];
}

export function normalizeBuildSpec(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('build spec input must be an object');
  }

  const source = normalizeSource(input.source, typeof input.request === 'string' ? input.request.trim() : '');
  const targetInput = input.target && typeof input.target === 'object' ? input.target : {};
  const layoutInput = input.layout && typeof input.layout === 'object' ? input.layout : {};
  const requirementsInput = input.requirements && typeof input.requirements === 'object' ? input.requirements : {};
  const optionsInput = input.options && typeof input.options === 'object' ? input.options : {};

  const layout = {
    pageUse: normalizePageUse(layoutInput.pageUse, 'layout.pageUse', 'RootPageModel'),
    blocks: normalizeBlocks(layoutInput.blocks, 'layout.blocks'),
    tabs: normalizeTabs(layoutInput.tabs),
  };

  return {
    version: BUILD_SPEC_VERSION,
    source,
    target: {
      title: typeof targetInput.title === 'string' && targetInput.title.trim() ? targetInput.title.trim() : '',
      buildPolicy: typeof targetInput.buildPolicy === 'string' && targetInput.buildPolicy.trim()
        ? targetInput.buildPolicy.trim()
        : 'fresh',
      schemaUidCandidate: typeof targetInput.schemaUidCandidate === 'string' ? targetInput.schemaUidCandidate.trim() : '',
      routeSegmentCandidate: typeof targetInput.routeSegmentCandidate === 'string' ? targetInput.routeSegmentCandidate.trim() : '',
      candidatePageUrl: typeof targetInput.candidatePageUrl === 'string' ? targetInput.candidatePageUrl.trim() : '',
      pageUse: layout.pageUse,
    },
    layout,
    dataBindings: {
      collections: sortUniqueStrings(input.dataBindings?.collections),
      relations: Array.isArray(input.dataBindings?.relations) ? input.dataBindings.relations : [],
    },
    requirements: {
      requiredTabs: deriveRequiredTabs(layout, requirementsInput.requiredTabs),
      requiredActions: Array.isArray(requirementsInput.requiredActions) && requirementsInput.requiredActions.length > 0
        ? requirementsInput.requiredActions
        : deriveRequiredActions(layout),
    },
    options: {
      compileMode: typeof optionsInput.compileMode === 'string' && optionsInput.compileMode.trim()
        ? optionsInput.compileMode.trim()
        : DEFAULT_BUILD_COMPILE_MODE,
      allowLegacyFallback: Boolean(optionsInput.allowLegacyFallback),
    },
  };
}

function normalizeAssertion(assertion, index, label) {
  if (!assertion || typeof assertion !== 'object') {
    throw new Error(`${label}[${index}] must be an object`);
  }
  return {
    kind: normalizeNonEmpty(assertion.kind, `${label}[${index}].kind`),
    label: typeof assertion.label === 'string' && assertion.label.trim() ? assertion.label.trim() : '',
    severity: typeof assertion.severity === 'string' && assertion.severity.trim() ? assertion.severity.trim() : 'blocking',
    values: Array.isArray(assertion.values) ? assertion.values : [],
    value: typeof assertion.value === 'string' ? assertion.value.trim() : '',
  };
}

export function normalizeVerifySpec(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('verify spec input must be an object');
  }

  const source = normalizeSource(input.source, typeof input.request === 'string' ? input.request.trim() : '');
  const entryInput = input.entry && typeof input.entry === 'object' ? input.entry : {};
  const preOpenInput = input.preOpen && typeof input.preOpen === 'object' ? input.preOpen : {};
  const evidencePolicyInput = input.evidencePolicy && typeof input.evidencePolicy === 'object' ? input.evidencePolicy : {};
  const gatePolicyInput = input.gatePolicy && typeof input.gatePolicy === 'object' ? input.gatePolicy : {};

  return {
    version: VERIFY_SPEC_VERSION,
    source,
    entry: {
      pageUrl: typeof entryInput.pageUrl === 'string' ? entryInput.pageUrl.trim() : '',
      candidatePageUrl: typeof entryInput.candidatePageUrl === 'string' ? entryInput.candidatePageUrl.trim() : '',
      requiresAuth: entryInput.requiresAuth !== false,
    },
    preOpen: {
      assertions: Array.isArray(preOpenInput.assertions)
        ? preOpenInput.assertions.map((item, index) => normalizeAssertion(item, index, 'preOpen.assertions'))
        : [],
    },
    stages: Array.isArray(input.stages)
      ? input.stages.map((stage, index) => {
        if (!stage || typeof stage !== 'object') {
          throw new Error(`stages[${index}] must be an object`);
        }
        return {
          id: typeof stage.id === 'string' && stage.id.trim() ? stage.id.trim() : `stage-${index + 1}`,
          title: typeof stage.title === 'string' && stage.title.trim() ? stage.title.trim() : `Stage ${index + 1}`,
          mandatory: stage.mandatory !== false,
          trigger: stage.trigger && typeof stage.trigger === 'object' ? stage.trigger : null,
          waitFor: stage.waitFor && typeof stage.waitFor === 'object' ? stage.waitFor : null,
          assertions: Array.isArray(stage.assertions)
            ? stage.assertions.map((item, assertionIndex) => normalizeAssertion(item, assertionIndex, `stages[${index}].assertions`))
            : [],
        };
      })
      : [],
    evidencePolicy: {
      requireScreenshot: evidencePolicyInput.requireScreenshot !== false,
      requireSummary: evidencePolicyInput.requireSummary !== false,
      requireTables: evidencePolicyInput.requireTables !== false,
    },
    gatePolicy: {
      stopOnBuildGateFailure: gatePolicyInput.stopOnBuildGateFailure !== false,
      stopOnPreOpenBlocker: gatePolicyInput.stopOnPreOpenBlocker !== false,
      stopOnStageFailure: gatePolicyInput.stopOnStageFailure !== false,
    },
  };
}

function collectRequiredUsesFromBlock(block, requiredUses) {
  requiredUses.add(BLOCK_USE_BY_KIND[block.kind] || block.kind);
  if (block.kind === 'Table') {
    requiredUses.add('TableColumnModel');
  }
  for (const action of block.actions) {
    requiredUses.add(action.use || 'ActionModel');
    if (action.popup) {
      requiredUses.add(action.popup.pageUse);
      requiredUses.add('BlockGridModel');
    }
  }
  if (block.popup) {
    requiredUses.add(block.popup.pageUse);
    requiredUses.add('BlockGridModel');
  }
}

function compileBlocks(blocks, scope, artifact) {
  return blocks.map((block, index) => {
    collectRequiredUsesFromBlock(block, artifact.requiredUses);
    if (block.collectionName) {
      artifact.requiredMetadataRefs.collections.add(block.collectionName);
    }
    for (const field of block.fields) {
      if (block.collectionName) {
        artifact.requiredMetadataRefs.fields.add(`${block.collectionName}.${field}`);
      }
    }
    if (block.relationScope) {
      artifact.requiredMetadataRefs.relations.push({
        sourceCollection: block.relationScope.sourceCollection,
        targetCollection: block.relationScope.targetCollection,
        associationName: block.relationScope.associationName,
      });
    }
    return {
      path: `${scope}.blocks[${index}]`,
      kind: block.kind,
      use: BLOCK_USE_BY_KIND[block.kind] || block.kind,
      title: block.title,
      collectionName: block.collectionName,
      fields: block.fields,
      actions: block.actions,
      popup: block.popup,
      relationScope: block.relationScope,
      mode: block.mode,
    };
  });
}

export function compileBuildSpec(input) {
  const buildSpec = normalizeBuildSpec(input);
  const artifact = {
    compileMode: buildSpec.options.allowLegacyFallback ? 'primitive-tree' : DEFAULT_BUILD_COMPILE_MODE,
    payloadFragment: null,
    requiredUses: new Set([buildSpec.layout.pageUse]),
    requiredMetadataRefs: {
      collections: new Set(buildSpec.dataBindings.collections),
      fields: new Set(),
      relations: [],
    },
    guardRequirements: buildSpec.requirements,
    readbackContract: {
      requiredVisibleTabs: buildSpec.requirements.requiredTabs.flatMap((item) => item.titles),
      requiredTabCount: buildSpec.requirements.requiredTabs[0]?.titles?.length ?? 0,
      requiredTopLevelUses: [],
    },
    verifyHints: [],
    issues: [],
    primitiveTree: null,
  };

  const tree = {
    path: '$.page',
    kind: 'Page',
    use: buildSpec.layout.pageUse,
    title: buildSpec.target.title,
    blocks: compileBlocks(buildSpec.layout.blocks, '$.page', artifact),
    tabs: buildSpec.layout.tabs.map((tab, index) => {
      artifact.requiredUses.add('RootPageTabModel');
      artifact.requiredUses.add('BlockGridModel');
      artifact.verifyHints.push({
        stageId: `tab-${index + 1}`,
        title: tab.title,
        action: {
          kind: 'click-tab',
          text: tab.title,
        },
      });
      return {
        path: `$.page.tabs[${index}]`,
        kind: 'Tabs',
        use: 'RootPageTabModel',
        title: tab.title,
        blocks: compileBlocks(tab.blocks, `$.page.tabs[${index}]`, artifact),
      };
    }),
  };

  artifact.readbackContract.requiredTopLevelUses = sortUniqueStrings([
    ...tree.blocks.map((item) => item.use),
    ...(tree.tabs.length > 0 ? ['RootPageTabModel'] : []),
  ]);
  artifact.payloadFragment = tree;
  artifact.primitiveTree = tree;

  return {
    buildSpec,
    compileArtifact: {
      compileMode: artifact.compileMode,
      payloadFragment: artifact.payloadFragment,
      primitiveTree: artifact.primitiveTree,
      requiredUses: sortUniqueStrings([...artifact.requiredUses]),
      requiredMetadataRefs: {
        collections: sortUniqueStrings([...artifact.requiredMetadataRefs.collections]),
        fields: sortUniqueStrings([...artifact.requiredMetadataRefs.fields]),
        relations: artifact.requiredMetadataRefs.relations,
      },
      guardRequirements: artifact.guardRequirements,
      readbackContract: artifact.readbackContract,
      verifyHints: artifact.verifyHints,
      issues: artifact.issues,
    },
  };
}

export function buildValidationSpecsForRun({
  caseRequest,
  sessionId,
  baseSlug,
  candidatePageUrl,
  sessionDir,
}) {
  const requestText = normalizeNonEmpty(caseRequest, 'case request');
  const normalizedSessionId = normalizeNonEmpty(sessionId, 'session id');
  const buildSpec = normalizeBuildSpec({
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId: normalizedSessionId,
    },
    target: {
      title: `${baseSlug || 'validation'} fresh build`,
      buildPolicy: 'fresh',
      routeSegmentCandidate: normalizedSessionId,
      candidatePageUrl,
    },
    layout: {
      pageUse: 'RootPageModel',
      blocks: [],
      tabs: [],
    },
    requirements: {},
    options: {
      compileMode: DEFAULT_BUILD_COMPILE_MODE,
      allowLegacyFallback: false,
    },
  });

  const verifySpec = normalizeVerifySpec({
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId: normalizedSessionId,
    },
    entry: {
      candidatePageUrl,
      requiresAuth: true,
    },
    preOpen: {
      assertions: [
        {
          kind: 'page-reachable',
          label: 'fresh page should be reachable',
          severity: 'blocking',
        },
      ],
    },
    stages: [],
    gatePolicy: {
      stopOnBuildGateFailure: true,
      stopOnPreOpenBlocker: true,
      stopOnStageFailure: true,
    },
  });

  const compiled = compileBuildSpec(buildSpec);

  return {
    buildSpec,
    verifySpec,
    compileArtifact: {
      ...compiled.compileArtifact,
      context: {
        sessionDir: sessionDir || '',
      },
    },
  };
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    console.log(usage());
    return;
  }

  if (command === 'normalize-build-spec') {
    console.log(JSON.stringify(normalizeBuildSpec(readJsonInput(flags['input-json'], flags['input-file'], 'input')), null, 2));
    return;
  }

  if (command === 'normalize-verify-spec') {
    console.log(JSON.stringify(normalizeVerifySpec(readJsonInput(flags['input-json'], flags['input-file'], 'input')), null, 2));
    return;
  }

  if (command === 'compile-build-spec') {
    console.log(JSON.stringify(compileBuildSpec(readJsonInput(flags['input-json'], flags['input-file'], 'input')), null, 2));
    return;
  }

  if (command === 'build-validation-specs') {
    if (typeof flags['case-request'] !== 'string' || typeof flags['session-id'] !== 'string' || typeof flags['candidate-page-url'] !== 'string') {
      throw new Error('--case-request, --session-id and --candidate-page-url are required');
    }
    console.log(JSON.stringify(buildValidationSpecsForRun({
      caseRequest: flags['case-request'],
      sessionId: flags['session-id'],
      baseSlug: typeof flags['base-slug'] === 'string' ? flags['base-slug'] : 'validation',
      candidatePageUrl: flags['candidate-page-url'],
      sessionDir: typeof flags['session-dir'] === 'string' ? flags['session-dir'] : '',
    }), null, 2));
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
