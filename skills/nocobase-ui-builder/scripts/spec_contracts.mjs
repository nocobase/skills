#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_POPUP_PAGE_USE,
  getDefaultTabUseForPage,
  getFormUseForMode,
  normalizeFormMode,
  normalizePageUse,
} from './model_contracts.mjs';
import {
  resolveValidationCase,
  resolveValidationCaseDocPath,
} from './validation_case_registry.mjs';

export const BUILD_SPEC_VERSION = '1.0';
export const VERIFY_SPEC_VERSION = '1.0';
export const DEFAULT_BUILD_COMPILE_MODE = 'primitive-tree';

const BLOCK_USE_BY_KIND = {
  Page: 'RootPageModel',
  Tabs: 'RootPageTabModel',
  Grid: 'BlockGridModel',
  Filter: 'FilterFormBlockModel',
  Table: 'TableBlockModel',
  Details: 'DetailsBlockModel',
};

const ACTION_USE_BY_KIND = {
  'create-popup': 'AddNewActionModel',
  'view-record-popup': 'ViewActionModel',
  'edit-record-popup': 'EditActionModel',
  'add-child-record-popup': 'AddChildActionModel',
  'record-action': 'JSRecordActionModel',
};

const SUPPORTED_BLOCK_KINDS = new Set(['Filter', 'Table', 'Details', 'Form']);
const SUPPORTED_REQUIRED_ACTION_SCOPES = new Set(['block-actions', 'row-actions', 'details-actions', 'either']);

function resolveActionUse(kind) {
  const resolvedUse = ACTION_USE_BY_KIND[kind];
  if (!resolvedUse) {
    throw new Error(`Unsupported action kind "${kind}"`);
  }
  return resolvedUse;
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

function normalizeAction(action, index, label = 'actions') {
  if (!action || typeof action !== 'object') {
    throw new Error(`${label}[${index}] must be an object`);
  }
  const kind = normalizeNonEmpty(action.kind, `${label}[${index}].kind`);
  return {
    kind,
    label: typeof action.label === 'string' && action.label.trim() ? action.label.trim() : kind,
    use: resolveActionUse(kind),
    popup: action.popup && typeof action.popup === 'object'
      ? normalizePopup(action.popup, `${label}[${index}].popup`)
      : null,
  };
}

function normalizeActions(actions, label) {
  if (actions == null) {
    return [];
  }
  if (!Array.isArray(actions)) {
    throw new Error(`${label} must be an array`);
  }
  return actions.map((item, index) => normalizeAction(item, index, label));
}

function normalizePopup(popup, label) {
  if (!popup || typeof popup !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  if (popup.tabs !== undefined || popup.layout?.tabs !== undefined) {
    throw new Error(`${label}.tabs is not supported yet; popup currently only supports pageUse + blocks`);
  }
  return {
    title: typeof popup.title === 'string' && popup.title.trim() ? popup.title.trim() : '',
    pageUse: normalizePageUse(popup.pageUse, `${label}.pageUse`, {
      fallbackValue: DEFAULT_POPUP_PAGE_USE,
    }),
    blocks: normalizeBlocks(popup.blocks, `${label}.blocks`),
  };
}

function normalizeBlock(block, index, label = 'blocks') {
  if (!block || typeof block !== 'object') {
    throw new Error(`${label}[${index}] must be an object`);
  }
  const kind = normalizeNonEmpty(block.kind, `${label}[${index}].kind`);
  if (!SUPPORTED_BLOCK_KINDS.has(kind)) {
    throw new Error(`${label}[${index}].kind must be one of ${[...SUPPORTED_BLOCK_KINDS].join(', ')}`);
  }
  const normalized = {
    kind,
    title: typeof block.title === 'string' && block.title.trim() ? block.title.trim() : '',
    collectionName: typeof block.collectionName === 'string' && block.collectionName.trim()
      ? block.collectionName.trim()
      : '',
    fields: sortUniqueStrings(block.fields),
    actions: normalizeActions(block.actions, `${label}[${index}].actions`),
    rowActions: normalizeActions(block.rowActions, `${label}[${index}].rowActions`),
    blocks: normalizeBlocks(block.blocks, `${label}[${index}].blocks`),
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
    mode: typeof block.mode === 'string' && block.mode.trim() ? normalizeFormMode(block.mode, `${label}[${index}].mode`) : '',
    targetCollectionName: typeof block.targetCollectionName === 'string' && block.targetCollectionName.trim()
      ? block.targetCollectionName.trim()
      : '',
    targetBlock: typeof block.targetBlock === 'string' && block.targetBlock.trim() ? block.targetBlock.trim() : '',
    treeTable: block.treeTable === true,
  };

  if (normalized.kind === 'Form') {
    normalized.mode = normalizeFormMode(normalized.mode, `${label}[${index}].mode`);
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

function normalizeRequiredActions(explicit) {
  if (!Array.isArray(explicit) || explicit.length === 0) {
    return [];
  }
  return explicit.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`requirements.requiredActions[${index}] must be an object`);
    }
    const kind = normalizeNonEmpty(entry.kind, `requirements.requiredActions[${index}].kind`);
    resolveActionUse(kind);
    const collectionName = normalizeNonEmpty(
      entry.collectionName,
      `requirements.requiredActions[${index}].collectionName`,
    );
    const scope = typeof entry.scope === 'string' && entry.scope.trim() ? entry.scope.trim() : 'either';
    if (!SUPPORTED_REQUIRED_ACTION_SCOPES.has(scope)) {
      throw new Error(`requirements.requiredActions[${index}].scope must be one of ${[...SUPPORTED_REQUIRED_ACTION_SCOPES].join(', ')}`);
    }
    return {
      kind,
      collectionName,
      scope,
    };
  });
}

function dedupeRequiredActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = `${action.kind}:${action.collectionName}:${action.scope}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function collectRequiredActionsFromBlocks(blocks, scope, actions) {
  for (const block of blocks) {
    const collectionName = block.collectionName;
    if (collectionName) {
      for (const action of block.actions) {
        actions.push({
          kind: action.kind,
          collectionName,
          scope,
        });
      }
      if (block.kind === 'Table') {
        for (const action of block.rowActions) {
          actions.push({
            kind: action.kind,
            collectionName,
            scope: 'row-actions',
          });
        }
      }
    }
    if (block.blocks.length > 0) {
      collectRequiredActionsFromBlocks(
        block.blocks,
        block.kind === 'Details' ? 'details-actions' : scope,
        actions,
      );
    }
  }
}

function deriveRequiredActions(layout) {
  const actions = [];
  collectRequiredActionsFromBlocks(layout.blocks, 'block-actions', actions);
  for (const tab of layout.tabs) {
    collectRequiredActionsFromBlocks(tab.blocks, 'block-actions', actions);
  }
  return dedupeRequiredActions(actions);
}

function deriveRequiredTabs(layout, explicit) {
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`requirements.requiredTabs[${index}] must be an object`);
      }
      const titles = sortUniqueStrings(entry.titles);
      if (titles.length === 0) {
        throw new Error(`requirements.requiredTabs[${index}].titles must not be empty`);
      }
      return {
        pageSignature: typeof entry.pageSignature === 'string' && entry.pageSignature.trim() ? entry.pageSignature.trim() : null,
        titles,
        pageUse: normalizePageUse(entry.pageUse, `requirements.requiredTabs[${index}].pageUse`, {
          allowNull: true,
        }),
        requireBlockGrid: entry.requireBlockGrid !== false,
      };
    });
  }
  if (layout.tabs.length === 0) {
    return [];
  }
  return [
    {
      pageSignature: '$',
      titles: layout.tabs.map((tab) => tab.title),
      pageUse: layout.pageUse,
      requireBlockGrid: true,
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
    pageUse: normalizePageUse(layoutInput.pageUse, 'layout.pageUse', {
      fallbackValue: 'RootPageModel',
    }),
    blocks: normalizeBlocks(layoutInput.blocks, 'layout.blocks'),
    tabs: normalizeTabs(layoutInput.tabs),
  };

  const validationCaseInput = input.validationCase && typeof input.validationCase === 'object'
    ? input.validationCase
    : {};

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
        ? normalizeRequiredActions(requirementsInput.requiredActions)
        : deriveRequiredActions(layout),
    },
    options: {
      compileMode: typeof optionsInput.compileMode === 'string' && optionsInput.compileMode.trim()
        ? optionsInput.compileMode.trim()
        : DEFAULT_BUILD_COMPILE_MODE,
      allowLegacyFallback: Boolean(optionsInput.allowLegacyFallback),
    },
    validationCase: {
      caseId: typeof validationCaseInput.caseId === 'string' ? validationCaseInput.caseId.trim() : '',
      title: typeof validationCaseInput.title === 'string' ? validationCaseInput.title.trim() : '',
      docPath: typeof validationCaseInput.docPath === 'string' ? validationCaseInput.docPath.trim() : '',
      tier: typeof validationCaseInput.tier === 'string' ? validationCaseInput.tier.trim() : '',
      expectedOutcome: typeof validationCaseInput.expectedOutcome === 'string'
        ? validationCaseInput.expectedOutcome.trim()
        : '',
      coverage: {
        blocks: sortUniqueStrings(validationCaseInput.coverage?.blocks),
        patterns: sortUniqueStrings(validationCaseInput.coverage?.patterns),
      },
      resolution: validationCaseInput.resolution && typeof validationCaseInput.resolution === 'object'
        ? {
          matched: Boolean(validationCaseInput.resolution.matched),
          matchedBy: typeof validationCaseInput.resolution.matchedBy === 'string'
            ? validationCaseInput.resolution.matchedBy.trim()
            : '',
          matchedValue: typeof validationCaseInput.resolution.matchedValue === 'string'
            ? validationCaseInput.resolution.matchedValue.trim()
            : '',
          fallbackReason: typeof validationCaseInput.resolution.fallbackReason === 'string'
            ? validationCaseInput.resolution.fallbackReason.trim()
            : '',
        }
        : {
          matched: false,
          matchedBy: '',
          matchedValue: '',
          fallbackReason: '',
        },
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

function resolveBlockUse(block) {
  if (block.kind === 'Form') {
    return getFormUseForMode(block.mode);
  }
  return BLOCK_USE_BY_KIND[block.kind] || block.kind;
}

function collectRequiredUsesFromAction(action, requiredUses) {
  requiredUses.add(action.use || 'ActionModel');
  if (action.popup) {
    requiredUses.add(action.popup.pageUse);
    requiredUses.add('BlockGridModel');
  }
}

function collectRequiredUsesFromBlock(block, requiredUses) {
  requiredUses.add(resolveBlockUse(block));
  if (block.kind === 'Filter') {
    requiredUses.add('FilterFormGridModel');
    requiredUses.add('FilterFormItemModel');
    requiredUses.add('FilterFormSubmitActionModel');
    requiredUses.add('FilterFormResetActionModel');
  }
  if (block.kind === 'Table') {
    requiredUses.add('TableColumnModel');
    if (block.rowActions.length > 0) {
      requiredUses.add('TableActionsColumnModel');
    }
  }
  if (block.kind === 'Details') {
    requiredUses.add('DetailsGridModel');
  }
  if (block.kind === 'Form') {
    requiredUses.add('FormGridModel');
    requiredUses.add('FormItemModel');
    requiredUses.add('FormSubmitActionModel');
  }
  for (const action of block.actions) {
    collectRequiredUsesFromAction(action, requiredUses);
  }
  for (const action of block.rowActions) {
    collectRequiredUsesFromAction(action, requiredUses);
  }
  for (const childBlock of block.blocks) {
    collectRequiredUsesFromBlock(childBlock, requiredUses);
  }
  if (block.popup) {
    requiredUses.add(block.popup.pageUse);
    requiredUses.add('BlockGridModel');
  }
}

function maybeAddVerifyHintForAction(action, hintScope, verifyHints, stageIdPrefix) {
  if (!action.label) {
    return;
  }
  const triggerKind = hintScope === 'row-actions'
    ? 'click-row-action'
    : 'click-action';
  verifyHints.push({
    stageId: `${stageIdPrefix}-${hintScope}-${action.kind}-${verifyHints.length + 1}`,
    title: action.label,
    action: {
      kind: triggerKind,
      text: action.label,
    },
  });
}

function compilePopup(popup, scope, artifact) {
  if (!popup) {
    return null;
  }
  return {
    title: popup.title,
    pageUse: popup.pageUse,
    blocks: compileBlocks(popup.blocks, `${scope}.popup`, artifact),
  };
}

function compileActions(actions, scope, artifact, actionScope) {
  return actions.map((action, index) => {
    maybeAddVerifyHintForAction(action, actionScope, artifact.verifyHints, scope.replaceAll('.', '-'));
    return {
      ...action,
      scope: actionScope,
      path: `${scope}.${actionScope}[${index}]`,
      popup: action.popup
        ? compilePopup(action.popup, `${scope}.${actionScope}[${index}]`, artifact)
        : null,
    };
  });
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
      use: resolveBlockUse(block),
      title: block.title,
      collectionName: block.collectionName,
      fields: block.fields,
      actions: compileActions(
        block.actions,
        `${scope}.blocks[${index}]`,
        artifact,
        block.kind === 'Details' ? 'details-actions' : 'block-actions',
      ),
      rowActions: compileActions(
        block.rowActions,
        `${scope}.blocks[${index}]`,
        artifact,
        'row-actions',
      ),
      blocks: compileBlocks(block.blocks, `${scope}.blocks[${index}]`, artifact),
      popup: compilePopup(block.popup, `${scope}.blocks[${index}]`, artifact),
      relationScope: block.relationScope,
      mode: block.mode,
      targetCollectionName: block.targetCollectionName,
      targetBlock: block.targetBlock,
      treeTable: block.treeTable,
    };
  });
}

export function compileBuildSpec(input) {
  const buildSpec = normalizeBuildSpec(input);
  const defaultTabUse = getDefaultTabUseForPage(buildSpec.layout.pageUse);
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
    matchedCaseId: buildSpec.validationCase.caseId,
    matchedCaseTitle: buildSpec.validationCase.title,
    matchedCaseDocPath: buildSpec.validationCase.docPath,
    tier: buildSpec.validationCase.tier,
    expectedOutcome: buildSpec.validationCase.expectedOutcome,
    coverage: buildSpec.validationCase.coverage,
    registryResolution: buildSpec.validationCase.resolution,
    readbackContract: {
      requiredTabs: buildSpec.requirements.requiredTabs.map((item) => ({
        pageSignature: item.pageSignature ?? null,
        pageUse: item.pageUse ?? null,
        titles: [...item.titles],
        requireBlockGrid: item.requireBlockGrid !== false,
      })),
      requiredVisibleTabs: buildSpec.requirements.requiredTabs.flatMap((item) => item.titles),
      requiredTabCount: buildSpec.requirements.requiredTabs[0]?.titles?.length ?? 0,
      requiredTopLevelUses: [],
    },
    verifyHints: [],
    coverageStatus: [
      ...buildSpec.validationCase.coverage.blocks.map((target) => ({
        targetType: 'block',
        target,
        status: 'unverified',
      })),
      ...buildSpec.validationCase.coverage.patterns.map((target) => ({
        targetType: 'pattern',
        target,
        status: 'unverified',
      })),
    ],
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
      artifact.requiredUses.add(defaultTabUse);
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
        use: defaultTabUse,
        title: tab.title,
        blocks: compileBlocks(tab.blocks, `$.page.tabs[${index}]`, artifact),
      };
    }),
  };

  artifact.readbackContract.requiredTopLevelUses = sortUniqueStrings([
    ...tree.blocks.map((item) => item.use),
    ...(tree.tabs.length > 0 ? [defaultTabUse] : []),
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
      matchedCaseId: artifact.matchedCaseId,
      matchedCaseTitle: artifact.matchedCaseTitle,
      matchedCaseDocPath: artifact.matchedCaseDocPath,
      tier: artifact.tier,
      expectedOutcome: artifact.expectedOutcome,
      coverage: artifact.coverage,
      registryResolution: artifact.registryResolution,
      readbackContract: artifact.readbackContract,
      verifyHints: artifact.verifyHints,
      coverageStatus: artifact.coverageStatus,
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
  const resolution = resolveValidationCase({
    caseRequest: requestText,
    baseSlug,
  });
  const resolvedCase = resolution.caseDefinition;
  const validationCase = resolvedCase
    ? {
      caseId: resolvedCase.id,
      title: resolvedCase.title,
      docPath: resolveValidationCaseDocPath(resolvedCase),
      tier: resolvedCase.tier,
      expectedOutcome: resolvedCase.expectedOutcome,
      coverage: resolvedCase.coverage,
      resolution: {
        matched: true,
        matchedBy: resolution.matchedBy,
        matchedValue: resolution.matchedValue,
        fallbackReason: '',
      },
    }
    : {
      caseId: '',
      title: '',
      docPath: '',
      tier: '',
      expectedOutcome: '',
      coverage: {
        blocks: [],
        patterns: [],
      },
      resolution: {
        matched: false,
        matchedBy: '',
        matchedValue: '',
        fallbackReason: resolution.fallbackReason || 'CASE_REGISTRY_UNMATCHED',
      },
    };

  const buildSpec = normalizeBuildSpec({
    ...(resolvedCase?.buildSpecInput || {}),
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId: normalizedSessionId,
    },
    target: {
      ...(resolvedCase?.buildSpecInput?.target || {}),
      title: resolvedCase?.buildSpecInput?.target?.title || resolvedCase?.title || `${baseSlug || 'validation'} fresh build`,
      buildPolicy: 'fresh',
      routeSegmentCandidate: normalizedSessionId,
      candidatePageUrl,
    },
    options: {
      compileMode: DEFAULT_BUILD_COMPILE_MODE,
      allowLegacyFallback: false,
      ...(resolvedCase?.buildSpecInput?.options || {}),
    },
    validationCase,
  });

  const verifySpec = normalizeVerifySpec({
    ...(resolvedCase?.verifySpecInput || {}),
    source: {
      kind: 'validation-request',
      text: requestText,
      sessionId: normalizedSessionId,
    },
    entry: {
      candidatePageUrl,
      requiresAuth: true,
      ...(resolvedCase?.verifySpecInput?.entry || {}),
      candidatePageUrl,
      requiresAuth: resolvedCase?.verifySpecInput?.entry?.requiresAuth !== false,
    },
    preOpen: resolvedCase?.verifySpecInput?.preOpen || {
      assertions: [
        {
          kind: 'page-reachable',
          label: 'fresh page should be reachable',
          severity: 'blocking',
        },
      ],
    },
    gatePolicy: {
      stopOnBuildGateFailure: true,
      stopOnPreOpenBlocker: true,
      stopOnStageFailure: true,
      ...(resolvedCase?.verifySpecInput?.gatePolicy || {}),
    },
  });

  const compiled = compileBuildSpec(buildSpec);
  if (!resolution.matched) {
    compiled.compileArtifact.issues.push({
      code: 'CASE_REGISTRY_UNMATCHED',
      message: `未能根据请求 "${requestText}" 匹配到结构化 validation case，已回退到 generic skeleton。`,
    });
  }

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
