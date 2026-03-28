function createUidGenerator(seed = '') {
  let counter = 0;
  const normalizedSeed = String(seed || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 4) || 'node';

  return () => {
    counter += 1;
    const randomPart = Math.random().toString(36).slice(2, 10);
    const counterPart = counter.toString(36).padStart(2, '0');
    return `${normalizedSeed}${randomPart}${counterPart}`.slice(0, 12);
  };
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeFlowSubType(value) {
  return value === 'array' || value === 'object' ? value : '';
}

function walkModel(node, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }
  visit(node);
  const subModels = node.subModels && typeof node.subModels === 'object' ? node.subModels : {};
  for (const value of Object.values(subModels)) {
    if (Array.isArray(value)) {
      value.forEach((child) => walkModel(child, visit));
      continue;
    }
    walkModel(value, visit);
  }
}

function walkPlainObjects(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkPlainObjects(item, visit));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  visit(value);
  Object.values(value).forEach((item) => walkPlainObjects(item, visit));
}

function replaceMappedStrings(value, uidMap) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceMappedStrings(item, uidMap));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && uidMap.has(value)) {
      return uidMap.get(value);
    }
    return value;
  }
  const output = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = replaceMappedStrings(nestedValue, uidMap);
  }
  return output;
}

function resolveLiveTopologyByUid(liveTopology) {
  if (liveTopology instanceof Map) {
    return liveTopology;
  }
  const rawByUid = isPlainObject(liveTopology?.byUid)
    ? liveTopology.byUid
    : (isPlainObject(liveTopology) ? liveTopology : null);
  const byUid = new Map();
  if (!rawByUid) {
    return byUid;
  }
  Object.entries(rawByUid).forEach(([uid, entry]) => {
    if (!isPlainObject(entry)) {
      return;
    }
    const normalizedUid = normalizeOptionalText(uid || entry.uid);
    if (!normalizedUid) {
      return;
    }
    byUid.set(normalizedUid, {
      uid: normalizedUid,
      parentId: normalizeOptionalText(entry.parentId),
      subKey: normalizeOptionalText(entry.subKey),
      subType: normalizeFlowSubType(entry.subType),
      path: normalizeOptionalText(entry.path),
      use: normalizeOptionalText(entry.use),
    });
  });
  return byUid;
}

function walkModelWithParentLink(node, visit, parentLink = null, pathValue = '$') {
  if (!node || typeof node !== 'object') {
    return;
  }
  visit(node, pathValue, parentLink);
  const subModels = node.subModels && typeof node.subModels === 'object' ? node.subModels : {};
  const currentUid = normalizeOptionalText(node.uid);
  const currentUse = normalizeOptionalText(node.use);
  for (const [subKey, value] of Object.entries(subModels)) {
    if (Array.isArray(value)) {
      value.forEach((child, index) => walkModelWithParentLink(child, visit, {
        parentUid: currentUid,
        parentUse: currentUse,
        subKey,
        subType: 'array',
      }, `${pathValue}.subModels.${subKey}[${index}]`));
      continue;
    }
    walkModelWithParentLink(value, visit, {
      parentUid: currentUid,
      parentUse: currentUse,
      subKey,
      subType: 'object',
    }, `${pathValue}.subModels.${subKey}`);
  }
}

function scoreModelRichness(node) {
  if (Array.isArray(node)) {
    return node.reduce((sum, item) => sum + scoreModelRichness(item), 0);
  }
  if (!isPlainObject(node)) {
    if (typeof node === 'string') {
      return node.trim() ? 2 : 0;
    }
    if (typeof node === 'number' || typeof node === 'boolean') {
      return 1;
    }
    return 0;
  }
  let score = 0;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'uid' || key === 'parentId' || key === 'subKey' || key === 'subType') {
      continue;
    }
    score += 1 + scoreModelRichness(value);
  }
  return score;
}

function isPlaceholderSubmitAction(node) {
  if (!isPlainObject(node) || (node.use !== 'FormSubmitActionModel' && node.use !== 'JSFormActionModel')) {
    return false;
  }
  const meaningfulEntries = Object.entries(node).filter(([key]) => (
    key !== 'uid'
    && key !== 'parentId'
    && key !== 'subKey'
    && key !== 'subType'
    && key !== 'use'
    && key !== 'sortIndex'
    && key !== 'flowRegistry'
  ));
  if (meaningfulEntries.length === 0) {
    return true;
  }
  return meaningfulEntries.every(([, value]) => {
    if (value == null) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (isPlainObject(value)) {
      return Object.keys(value).length === 0;
    }
    return false;
  });
}

export function summarizeModelTree(model) {
  const uses = new Set();
  let nodes = 0;
  walkModel(model, (node) => {
    nodes += 1;
    if (typeof node.use === 'string' && node.use) {
      uses.add(node.use);
    }
  });
  return {
    nodes,
    uses: [...uses].sort(),
    topLevelItems: Array.isArray(model?.subModels?.items) ? model.subModels.items.length : 0,
    topLevelTabs: Array.isArray(model?.subModels?.tabs) ? model.subModels.tabs.length : 0,
  };
}

export function canonicalizeLegacyFilterItems(model) {
  if (!model || typeof model !== 'object') {
    return 0;
  }
  let changed = 0;
  walkPlainObjects(model, (node) => {
    if (
      typeof node.field === 'string'
      && typeof node.operator === 'string'
      && !Object.hasOwn(node, 'path')
    ) {
      node.path = node.field;
      delete node.field;
      changed += 1;
    }
  });
  return changed;
}

export function stripUnsupportedFieldPopupPages(model) {
  if (!isPlainObject(model)) {
    return 0;
  }

  let removed = 0;
  walkModel(model, (node) => {
    if (!isPlainObject(node) || typeof node.use !== 'string' || !node.use.endsWith('FieldModel')) {
      return;
    }
    if (!isPlainObject(node.subModels) || !Object.hasOwn(node.subModels, 'page')) {
      return;
    }
    delete node.subModels.page;
    if (Object.keys(node.subModels).length === 0) {
      delete node.subModels;
    }
    removed += 1;
  });
  return removed;
}

export function dedupeFormSubmitActions(model) {
  if (!isPlainObject(model)) {
    return 0;
  }

  let removed = 0;
  walkModel(model, (node) => {
    if (!isPlainObject(node) || (node.use !== 'CreateFormModel' && node.use !== 'EditFormModel')) {
      return;
    }
    const actions = Array.isArray(node.subModels?.actions) ? node.subModels.actions : null;
    if (!actions || actions.length < 2) {
      return;
    }

    const submitIndexes = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => isPlainObject(action) && (action.use === 'FormSubmitActionModel' || action.use === 'JSFormActionModel'));

    if (submitIndexes.length < 2) {
      return;
    }

    const richest = submitIndexes.reduce((best, current) => {
      const currentScore = scoreModelRichness(current.action);
      const bestScore = scoreModelRichness(best.action);
      return currentScore > bestScore ? current : best;
    });

    node.subModels.actions = actions.filter((action, index) => {
      const isSubmitLike = isPlainObject(action) && (action.use === 'FormSubmitActionModel' || action.use === 'JSFormActionModel');
      if (!isSubmitLike) {
        return true;
      }
      if (index === richest.index) {
        return true;
      }
      if (!isPlaceholderSubmitAction(action)) {
        return true;
      }
      removed += 1;
      return false;
    });
  });

  return removed;
}

export function remapTemplateTreeToTarget({
  sourceModel,
  targetRootModel,
  uidSeed,
}) {
  if (!sourceModel || typeof sourceModel !== 'object') {
    throw new Error('sourceModel is required');
  }
  if (!targetRootModel || typeof targetRootModel !== 'object') {
    throw new Error('targetRootModel is required');
  }
  if (typeof sourceModel.uid !== 'string' || !sourceModel.uid) {
    throw new Error('sourceModel.uid is required');
  }
  if (typeof targetRootModel.uid !== 'string' || !targetRootModel.uid) {
    throw new Error('targetRootModel.uid is required');
  }

  const uidMap = new Map([[sourceModel.uid, targetRootModel.uid]]);
  const makeUid = createUidGenerator(uidSeed || targetRootModel.uid);

  walkModel(sourceModel, (node) => {
    if (!node || typeof node !== 'object' || typeof node.uid !== 'string' || !node.uid) {
      return;
    }
    if (uidMap.has(node.uid)) {
      return;
    }
    uidMap.set(node.uid, makeUid());
  });

  const transformNode = (node) => {
    const output = replaceMappedStrings(cloneValue(node), uidMap);
    if (typeof node.uid === 'string' && uidMap.has(node.uid)) {
      output.uid = uidMap.get(node.uid);
    }
    const subModels = node.subModels && typeof node.subModels === 'object' ? node.subModels : {};
    if (Object.keys(subModels).length === 0) {
      delete output.subModels;
      return output;
    }

    output.subModels = {};
    for (const [subKey, value] of Object.entries(subModels)) {
      if (Array.isArray(value)) {
        output.subModels[subKey] = value.map((child) => transformNode(child));
        continue;
      }
      output.subModels[subKey] = transformNode(value);
    }
    return output;
  };

  const remapped = transformNode(sourceModel);
  const canonicalizedFilterItems = canonicalizeLegacyFilterItems(remapped);
  const strippedUnsupportedFieldPopupPages = stripUnsupportedFieldPopupPages(remapped);
  const dedupedFormSubmitActions = dedupeFormSubmitActions(remapped);
  remapped.uid = targetRootModel.uid;
  remapped.parentId = targetRootModel.parentId;
  remapped.subKey = targetRootModel.subKey;
  remapped.subType = targetRootModel.subType;
  remapped.use = targetRootModel.use || sourceModel.use;
  const summary = summarizeModelTree(remapped);
  const issues = [];
  if (summary.nodes === 1 && summary.topLevelItems === 0 && summary.topLevelTabs === 0) {
    issues.push({
      code: 'EMPTY_TEMPLATE_TREE',
      message: '模板 clone 后只剩 root 壳，没有任何顶层 items 或 tabs。',
    });
  }

  return {
    payload: remapped,
    uidMap: Object.fromEntries(uidMap),
    summary,
    canonicalizedFilterItems,
    strippedUnsupportedFieldPopupPages,
    dedupedFormSubmitActions,
    issues,
  };
}

export function remapConflictingDescendantUids({
  model,
  liveTopology,
  uidSeed,
}) {
  if (!isPlainObject(model)) {
    return {
      payload: model,
      uidMap: {},
      remappedNodes: [],
      changed: false,
    };
  }

  const liveTopologyByUid = resolveLiveTopologyByUid(liveTopology);
  if (liveTopologyByUid.size === 0) {
    return {
      payload: cloneValue(model),
      uidMap: {},
      remappedNodes: [],
      changed: false,
    };
  }

  const rootUid = normalizeOptionalText(model.uid);
  const uidMap = new Map();
  const remappedNodes = [];
  const makeUid = createUidGenerator(uidSeed || rootUid || 'node');

  walkModelWithParentLink(model, (node, pathValue, parentLink) => {
    const uid = normalizeOptionalText(node.uid);
    if (!uid || uid === rootUid || uidMap.has(uid)) {
      return;
    }
    const liveNode = liveTopologyByUid.get(uid);
    if (!liveNode) {
      return;
    }

    const payloadLocator = {
      parentId: normalizeOptionalText(node.parentId) || normalizeOptionalText(parentLink?.parentUid),
      subKey: normalizeOptionalText(node.subKey) || normalizeOptionalText(parentLink?.subKey),
      subType: normalizeFlowSubType(node.subType) || normalizeFlowSubType(parentLink?.subType),
    };
    if (
      payloadLocator.parentId === liveNode.parentId
      && payloadLocator.subKey === liveNode.subKey
      && payloadLocator.subType === liveNode.subType
    ) {
      return;
    }

    const nextUid = makeUid();
    uidMap.set(uid, nextUid);
    remappedNodes.push({
      path: pathValue,
      use: normalizeOptionalText(node.use) || liveNode.use || '',
      oldUid: uid,
      newUid: nextUid,
      payloadLocator,
      liveLocator: {
        parentId: liveNode.parentId,
        subKey: liveNode.subKey,
        subType: liveNode.subType,
      },
      livePath: liveNode.path || null,
    });
  });

  if (uidMap.size === 0) {
    return {
      payload: cloneValue(model),
      uidMap: {},
      remappedNodes,
      changed: false,
    };
  }

  return {
    payload: replaceMappedStrings(cloneValue(model), uidMap),
    uidMap: Object.fromEntries(uidMap),
    remappedNodes,
    changed: true,
  };
}

export function replaceFieldBinding({
  model,
  collectionName,
  fromFieldPath,
  toFieldPath,
  fromFieldUse,
  toFieldUse,
}) {
  if (!model || typeof model !== 'object') {
    return 0;
  }
  let changed = 0;
  walkModel(model, (node) => {
    const init = node?.stepParams?.fieldSettings?.init;
    if (!init || init.collectionName !== collectionName || init.fieldPath !== fromFieldPath) {
      return;
    }
    node.stepParams.fieldSettings.init.fieldPath = toFieldPath;
    if (fromFieldUse && node.use !== fromFieldUse) {
      return;
    }
    if (toFieldUse) {
      node.use = toFieldUse;
    }
    changed += 1;
  });
  return changed;
}
