import {
  PAGE_MODEL_USES_SET,
} from './model_contracts.mjs';

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sortUniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function joinPath(basePath, segment) {
  if (typeof segment === 'number') {
    return `${basePath}[${segment}]`;
  }
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
    return `${basePath}.${segment}`;
  }
  return `${basePath}[${JSON.stringify(segment)}]`;
}

function getTabTitle(tabNode) {
  if (!isPlainObject(tabNode)) {
    return '';
  }
  return normalizeString(tabNode.stepParams?.pageTabSettings?.tab?.title);
}

function buildPageGroup(node, pageSignature) {
  const tabs = Array.isArray(node.subModels?.tabs) ? node.subModels.tabs : [];
  const normalizedTabs = tabs.map((tabNode) => {
    const gridNode = isPlainObject(tabNode) ? tabNode.subModels?.grid : null;
    return {
      title: getTabTitle(tabNode),
      hasBlockGrid: isPlainObject(gridNode) && gridNode.use === 'BlockGridModel',
    };
  });

  return {
    pageSignature,
    pageUse: normalizeString(node.use) || null,
    tabCount: normalizedTabs.length,
    tabTitles: normalizedTabs.map((item) => item.title).filter(Boolean),
    tabs: normalizedTabs,
  };
}

function walk(value, visitor, pathValue = '$') {
  visitor(value, pathValue);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, joinPath(pathValue, index)));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walk(child, visitor, joinPath(pathValue, key));
  }
}

function summarizeTree(root, targetSignature) {
  const pageGroups = [];

  walk(root, (node, pathValue) => {
    if (!isPlainObject(node) || !PAGE_MODEL_USES_SET.has(node.use) || !Array.isArray(node.subModels?.tabs)) {
      return;
    }
    pageGroups.push(buildPageGroup(node, pathValue));
  });

  const rootPageGroup = pageGroups.find((item) => item.pageSignature === '$') ?? null;
  const topLevelUses = rootPageGroup
    ? sortUniqueStrings(
      (Array.isArray(root?.subModels?.tabs) ? root.subModels.tabs : [])
        .map((tabNode) => (isPlainObject(tabNode) && typeof tabNode.use === 'string' ? tabNode.use : '')),
    )
    : [];

  return {
    targetSignature: normalizeString(targetSignature) || null,
    pageGroups,
    tabCount: rootPageGroup?.tabCount ?? 0,
    tabTitles: rootPageGroup?.tabTitles ?? [],
    topLevelUses,
  };
}

export function summarizePayloadTree({ payload, targetSignature }) {
  return summarizeTree(payload, targetSignature);
}

export function summarizeFindoneTree({ tree, targetSignature }) {
  return summarizeTree(tree, targetSignature);
}
