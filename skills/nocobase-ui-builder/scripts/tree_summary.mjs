import {
  PAGE_MODEL_USES_SET,
} from './model_contracts.mjs';

const FILTER_CONTAINER_MODEL_USES = new Set([
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
]);

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

function normalizeFilterManagerConfigs(filterManager) {
  if (!Array.isArray(filterManager)) {
    return [];
  }

  return filterManager
    .filter((item) => isPlainObject(item))
    .map((item) => ({
      filterId: normalizeString(item.filterId),
      targetId: normalizeString(item.targetId),
      filterPaths: sortUniqueStrings(item.filterPaths),
    }))
    .filter((item) => item.filterId && item.targetId && item.filterPaths.length > 0)
    .sort((left, right) => (
      left.filterId.localeCompare(right.filterId)
      || left.targetId.localeCompare(right.targetId)
      || JSON.stringify(left.filterPaths).localeCompare(JSON.stringify(right.filterPaths))
    ));
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

function buildBlockSignature(node, pathValue) {
  const uid = normalizeString(node?.uid);
  if (uid) {
    return `uid:${uid}`;
  }
  const use = normalizeString(node?.use) || 'unknown';
  const collectionName = normalizeString(node?.stepParams?.resourceSettings?.init?.collectionName) || 'unknown';
  return `${pathValue}|${use}|${collectionName}`;
}

function normalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce((result, key) => {
      result[key] = normalizeJsonValue(value[key]);
      return result;
    }, {});
}

function normalizeFilterNode(filter) {
  if (!isPlainObject(filter)) {
    return null;
  }

  const items = Array.isArray(filter.items)
    ? filter.items
      .map((item) => {
        if (!isPlainObject(item)) {
          return null;
        }
        if (typeof item.logic === 'string' && Array.isArray(item.items)) {
          return normalizeFilterNode(item);
        }
        if (typeof item.path === 'string' && typeof item.operator === 'string') {
          return {
            path: item.path.trim(),
            operator: item.operator.trim(),
            value: normalizeJsonValue(item.value),
          };
        }
        return normalizeJsonValue(item);
      })
      .filter(Boolean)
    : [];

  return {
    logic: normalizeString(filter.logic) || null,
    items,
  };
}

function getDataScopeFilter(node) {
  return node?.stepParams?.tableSettings?.dataScope?.filter
    || node?.stepParams?.detailsSettings?.dataScope?.filter
    || node?.stepParams?.formSettings?.dataScope?.filter
    || null;
}

function buildFilterContainerSummary(node, pathValue) {
  const resourceInit = isPlainObject(node?.stepParams?.resourceSettings?.init)
    ? node.stepParams.resourceSettings.init
    : {};
  const normalizedFilter = normalizeFilterNode(getDataScopeFilter(node));
  const dataScopeNonEmpty = Array.isArray(normalizedFilter?.items) && normalizedFilter.items.length > 0;

  return {
    blockSignature: buildBlockSignature(node, pathValue),
    uid: normalizeString(node?.uid) || null,
    path: pathValue,
    use: normalizeString(node?.use) || null,
    collectionName: normalizeString(resourceInit.collectionName) || null,
    hasFilterByTk: resourceInit.filterByTk !== undefined && resourceInit.filterByTk !== null && String(resourceInit.filterByTk).trim() !== '',
    dataScopePresent: Boolean(normalizedFilter),
    dataScopeNonEmpty,
    dataScopeHash: dataScopeNonEmpty ? JSON.stringify(normalizedFilter) : null,
  };
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
  const tabTitleCounts = normalizedTabs.reduce((result, tab) => {
    if (!tab.title) {
      return result;
    }
    result[tab.title] = (result[tab.title] || 0) + 1;
    return result;
  }, {});
  const duplicateTabTitles = Object.entries(tabTitleCounts)
    .filter(([, count]) => count > 1)
    .map(([title]) => title)
    .sort((left, right) => left.localeCompare(right));

  return {
    pageSignature,
    pageUse: normalizeString(node.use) || null,
    tabCount: normalizedTabs.length,
    tabTitles: normalizedTabs.map((item) => item.title).filter(Boolean),
    tabs: normalizedTabs,
    duplicateTabTitles,
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
  const filterContainers = [];

  walk(root, (node, pathValue) => {
    if (!isPlainObject(node)) {
      return;
    }
    if (PAGE_MODEL_USES_SET.has(node.use) && Array.isArray(node.subModels?.tabs)) {
      pageGroups.push(buildPageGroup(node, pathValue));
    }
    if (FILTER_CONTAINER_MODEL_USES.has(node.use)) {
      filterContainers.push(buildFilterContainerSummary(node, pathValue));
    }
  });

  const rootPageGroup = pageGroups.find((item) => item.pageSignature === '$') ?? null;
  const topLevelUses = rootPageGroup
    ? sortUniqueStrings(
      (Array.isArray(root?.subModels?.tabs) ? root.subModels.tabs : [])
        .map((tabNode) => (isPlainObject(tabNode) && typeof tabNode.use === 'string' ? tabNode.use : '')),
    )
    : (isPlainObject(root) && root.use === 'BlockGridModel'
      ? sortUniqueStrings(
        (Array.isArray(root?.subModels?.items) ? root.subModels.items : [])
          .map((itemNode) => (isPlainObject(itemNode) && typeof itemNode.use === 'string' ? itemNode.use : '')),
      )
      : []);
  const filterManagerConfigs = normalizeFilterManagerConfigs(root?.filterManager);
  const filterManagerBindings = filterManagerConfigs.map(
    (item) => `${item.filterId}->${item.targetId}:${item.filterPaths.join('|')}`,
  );

  return {
    targetSignature: normalizeString(targetSignature) || null,
    pageGroups,
    tabCount: rootPageGroup?.tabCount ?? 0,
    tabTitles: rootPageGroup?.tabTitles ?? [],
    topLevelUses,
    filterManagerEntryCount: filterManagerConfigs.length,
    filterManagerBindings,
    filterContainers,
  };
}

export function summarizePayloadTree({ payload, targetSignature }) {
  return summarizeTree(payload, targetSignature);
}

export function summarizeFindoneTree({ tree, targetSignature }) {
  return summarizeTree(tree, targetSignature);
}
