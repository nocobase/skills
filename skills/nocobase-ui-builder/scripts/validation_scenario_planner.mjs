#!/usr/bin/env node

import { collectNocobaseSourceInventory } from './source_inventory_catalog.mjs';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function sortUniqueStrings(values) {
  return uniqueStrings(values).sort((left, right) => left.localeCompare(right));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function containsText(target, keyword) {
  const normalizedTarget = normalizeText(target).toLowerCase();
  const normalizedKeyword = normalizeText(keyword).toLowerCase();
  if (!normalizedTarget || !normalizedKeyword) {
    return false;
  }
  if (/^[a-z0-9_.-]+$/i.test(normalizedKeyword)) {
    const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, 'i');
    return pattern.test(normalizedTarget);
  }
  return normalizedTarget.includes(normalizedKeyword);
}

function hasAnyKeyword(text, keywords) {
  return (Array.isArray(keywords) ? keywords : []).some((keyword) => containsText(text, keyword));
}

function makePlanningBlocker(code, message, details = {}) {
  return {
    code,
    message,
    details,
  };
}

function normalizePlanningMode(value, fallbackValue = DEFAULT_PLANNING_MODE) {
  const normalized = normalizeText(value) || fallbackValue;
  return SUPPORTED_PLANNING_MODES.has(normalized) ? normalized : fallbackValue;
}

function clampScore(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function useToReadableLabel(use) {
  const normalized = normalizeText(use);
  if (!normalized) {
    return '区块';
  }
  return normalized
    .replace(/Model$/, '')
    .replace(/Block$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

function buildPopup(blocks, title = '') {
  return {
    title,
    pageUse: 'ChildPageModel',
    blocks,
  };
}

function buildFormBlock({ mode, collectionName, fields, title = '', actions = [] }) {
  return {
    kind: 'Form',
    mode,
    title,
    collectionName,
    fields,
    actions,
    rowActions: [],
    blocks: [],
  };
}

function buildDetailsBlock({ title, collectionName, fields, actions = [], rowActions = [], blocks = [] }) {
  return {
    kind: 'Details',
    title,
    collectionName,
    fields,
    actions,
    rowActions,
    blocks,
  };
}

function buildTableBlock({ title, collectionName, fields, actions = [], rowActions = [] }) {
  return {
    kind: 'Table',
    title,
    collectionName,
    fields,
    actions,
    rowActions,
    blocks: [],
  };
}

function buildFilterBlock({ title, collectionName, fields }) {
  return {
    kind: 'Filter',
    title,
    collectionName,
    fields,
    actions: [],
    rowActions: [],
    blocks: [],
  };
}

function buildPublicUseBlock({ use, title = '', collectionName = '' }) {
  return {
    kind: 'PublicUse',
    use,
    title: title || use,
    collectionName,
    fields: [],
    actions: [],
    rowActions: [],
    blocks: [],
  };
}

function buildPopupAction(kind, label, blocks = [], title = label) {
  return {
    kind,
    label,
    popup: buildPopup(blocks, title || label),
  };
}

function buildCreateAction(label, collectionName, fields, title = '') {
  return buildPopupAction(
    'create-popup',
    label,
    [
      buildFormBlock({
        mode: 'create',
        title: title || label,
        collectionName,
        fields,
      }),
    ],
    title || label,
  );
}

function buildEditAction(label, collectionName, fields, title = '') {
  return buildPopupAction(
    'edit-record-popup',
    label,
    [
      buildFormBlock({
        mode: 'edit',
        title: title || label,
        collectionName,
        fields,
      }),
    ],
    title || label,
  );
}

function buildViewAction(label, blocks, title = '') {
  return buildPopupAction('view-record-popup', label, blocks, title || label);
}

function buildDeleteAction(label) {
  return {
    kind: 'delete-record',
    label,
    popup: null,
  };
}

const BASE_AVAILABLE_USES = [
  'RootPageModel',
  'ChildPageModel',
  'RootPageTabModel',
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
  'BlockGridModel',
  'ActionModel',
  'JSBlockModel',
];

const DEFAULT_PLANNING_MODE = 'creative-first';
const SUPPORTED_PLANNING_MODES = new Set([
  'creative-first',
  'stable-first',
]);

const STABLE_BUSINESS_BLOCK_USES = [
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
  'JSBlockModel',
];

const STRUCTURAL_OR_META_USES = new Set([
  'RootPageModel',
  'ChildPageModel',
  'RootPageTabModel',
  'BlockGridModel',
  'ActionModel',
]);

const COLLECTION_BOUND_PUBLIC_USES = new Set([
  'GridCardBlockModel',
  'ListBlockModel',
  'MapBlockModel',
  'CommentsBlockModel',
]);

const ALWAYS_RUNTIME_SENSITIVE_PUBLIC_USES = {
  CommentsBlockModel: {
    contextRequirements: ['comment collection template'],
    unresolvedReasons: ['comment-template-required'],
  },
  ReferenceBlockModel: {
    contextRequirements: ['target block uid'],
    unresolvedReasons: ['reference-target-required'],
  },
};

const CREATIVE_PRIORITY_USES = [
  'GridCardBlockModel',
  'ChartBlockModel',
  'ListBlockModel',
  'JSBlockModel',
  'MarkdownBlockModel',
  'MapBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
  'TableBlockModel',
];

const PRIMARY_BLOCK_DEFINITIONS = [
  {
    use: 'JSBlockModel',
    archetypeId: 'js-main',
    archetypeLabel: 'JS 主块页',
    keywords: ['jsblock', 'js block', 'custom js', '自定义 js', '脚本区块', 'js 区块'],
    collectionRequired: false,
    titleSuffix: '自定义面板',
    kind: 'public-use',
  },
  {
    use: 'ChartBlockModel',
    archetypeId: 'chart-main',
    archetypeLabel: '图表主块页',
    keywords: ['图表', 'chart', 'dashboard', '看板', '分析', '报表'],
    collectionRequired: false,
    titleSuffix: '分析看板',
    kind: 'public-use',
  },
  {
    use: 'GridCardBlockModel',
    archetypeId: 'gridcard-main',
    archetypeLabel: '卡片主块页',
    keywords: ['指标卡', 'grid card', '卡片', 'kpi', '指标'],
    collectionRequired: true,
    titleSuffix: '指标概览',
    kind: 'public-use',
  },
  {
    use: 'ListBlockModel',
    archetypeId: 'list-main',
    archetypeLabel: '列表主块页',
    keywords: ['list', '列表', 'feed', '动态'],
    collectionRequired: true,
    titleSuffix: '动态列表',
    kind: 'public-use',
  },
  {
    use: 'MapBlockModel',
    archetypeId: 'map-main',
    archetypeLabel: '地图主块页',
    keywords: ['地图', 'map', '位置', 'geo'],
    collectionRequired: true,
    titleSuffix: '地图视图',
    kind: 'public-use',
  },
  {
    use: 'MarkdownBlockModel',
    archetypeId: 'markdown-main',
    archetypeLabel: '说明主块页',
    keywords: ['markdown', '说明', '文档', '帮助', 'guide'],
    collectionRequired: false,
    titleSuffix: '说明面板',
    kind: 'public-use',
  },
  {
    use: 'ReferenceBlockModel',
    archetypeId: 'reference-main',
    archetypeLabel: '引用主块页',
    keywords: ['reference', '引用', '模板', 'reference block'],
    collectionRequired: false,
    titleSuffix: '模板引用',
    kind: 'public-use',
  },
  {
    use: 'EditFormModel',
    archetypeId: 'edit-form-main',
    archetypeLabel: '编辑表单页',
    keywords: ['编辑表单', 'edit form', '编辑页', '修改表单'],
    collectionRequired: true,
    titleSuffix: '编辑表单',
    kind: 'form',
    mode: 'edit',
  },
  {
    use: 'CreateFormModel',
    archetypeId: 'create-form-main',
    archetypeLabel: '创建表单页',
    keywords: ['创建表单', '新建表单', 'create form', '录入表单'],
    collectionRequired: true,
    titleSuffix: '创建表单',
    kind: 'form',
    mode: 'create',
  },
  {
    use: 'DetailsBlockModel',
    archetypeId: 'details-main',
    archetypeLabel: '详情主块页',
    keywords: ['详情', 'details', '详情页', '明细'],
    collectionRequired: true,
    titleSuffix: '详情视图',
    kind: 'details',
  },
  {
    use: 'TableBlockModel',
    archetypeId: 'single-table',
    archetypeLabel: '单表页面',
    keywords: ['table', 'grid', '表格', '列表页', '数据表'],
    collectionRequired: true,
    titleSuffix: '数据表',
    kind: 'table',
  },
];

const COLLECTION_ALIASES = {
  users: ['users', 'user', '系统 users', 'system users', '用户', '系统用户'],
  departments: ['departments', 'department', '组织', '部门', 'org'],
};

const REQUEST_FIELD_STOP_WORDS = new Set(['title', 'page', 'grid', 'table', 'list']);

function normalizeCollectionsInventory(value) {
  if (!value || typeof value !== 'object') {
    return {
      detected: false,
      names: [],
      byName: {},
      discoveryNotes: [],
    };
  }
  const names = sortUniqueStrings(value.names);
  const byName = {};
  for (const name of names) {
    const raw = value.byName && typeof value.byName === 'object' ? value.byName[name] : null;
    const record = raw && typeof raw === 'object' ? raw : {};
    byName[name] = {
      name,
      title: normalizeText(record.title),
      titleField: normalizeText(record.titleField),
      origin: normalizeText(record.origin),
      template: normalizeText(record.template),
      tree: normalizeText(record.tree),
      fieldNames: sortUniqueStrings(record.fieldNames),
      scalarFieldNames: sortUniqueStrings(record.scalarFieldNames),
      relationFields: sortUniqueStrings(record.relationFields),
    };
  }
  return {
    detected: Boolean(value.detected && names.length > 0),
    names,
    byName,
    discoveryNotes: sortUniqueStrings(value.discoveryNotes),
  };
}

function normalizeInstanceInventory(value) {
  if (!value || typeof value !== 'object') {
    return {
      detected: false,
      apiBase: '',
      adminBase: '',
      appVersion: '',
      enabledPlugins: [],
      enabledPluginsDetected: false,
      instanceFingerprint: '',
      flowSchema: {
        detected: false,
        rootPublicUses: [],
        publicUseCatalog: [],
        missingUses: [],
        discoveryNotes: [],
      },
      collections: {
        detected: false,
        names: [],
        byName: {},
        discoveryNotes: [],
      },
      notes: [],
      errors: [],
      cache: {},
    };
  }

  const flowSchema = value.flowSchema && typeof value.flowSchema === 'object' ? value.flowSchema : {};
  const rootPublicUses = uniqueStrings(flowSchema.rootPublicUses);
  const publicUseCatalog = Array.isArray(flowSchema.publicUseCatalog) ? flowSchema.publicUseCatalog : [];

  return {
    detected: Boolean(value.detected),
    apiBase: normalizeText(value.apiBase),
    adminBase: normalizeText(value.adminBase),
    appVersion: normalizeText(value.appVersion),
    enabledPlugins: uniqueStrings(value.enabledPlugins),
    enabledPluginsDetected: Boolean(value.enabledPluginsDetected),
    instanceFingerprint: normalizeText(value.instanceFingerprint),
    flowSchema: {
      detected: Boolean(flowSchema.detected && rootPublicUses.length > 0),
      rootPublicUses,
      publicUseCatalog,
      missingUses: uniqueStrings(flowSchema.missingUses),
      discoveryNotes: uniqueStrings(flowSchema.discoveryNotes),
    },
    collections: normalizeCollectionsInventory(value.collections),
    notes: uniqueStrings(value.notes),
    errors: uniqueStrings(value.errors),
    cache: value.cache && typeof value.cache === 'object' ? value.cache : {},
  };
}

function normalizeSourceInventory(value) {
  const inventory = value && typeof value === 'object' ? value : {};
  return {
    detected: Boolean(inventory.detected),
    repoRoot: normalizeText(inventory.repoRoot),
    publicModels: uniqueStrings(inventory.publicModels),
    publicTreeRoots: uniqueStrings(inventory.publicTreeRoots),
    expectedDescendantModels: uniqueStrings(inventory.expectedDescendantModels),
    evidenceFiles: uniqueStrings(inventory.evidenceFiles),
    publicUseCatalog: Array.isArray(inventory.publicUseCatalog) ? inventory.publicUseCatalog : [],
  };
}

function mergePublicUseCatalog(catalogs) {
  const merged = new Map();
  for (const catalog of Array.isArray(catalogs) ? catalogs : []) {
    for (const entry of Array.isArray(catalog) ? catalog : []) {
      const use = normalizeText(entry?.use);
      if (!use) {
        continue;
      }
      const existing = merged.get(use) || {
        use,
        title: '',
        hintKinds: [],
        hintPaths: [],
        hintMessages: [],
        contextRequirements: [],
        unresolvedReasons: [],
        semanticTags: [],
      };
      existing.title = existing.title || normalizeText(entry.title);
      existing.hintKinds = sortUniqueStrings([...existing.hintKinds, ...(Array.isArray(entry.hintKinds) ? entry.hintKinds : [])]);
      existing.hintPaths = sortUniqueStrings([...existing.hintPaths, ...(Array.isArray(entry.hintPaths) ? entry.hintPaths : [])]);
      existing.hintMessages = sortUniqueStrings([...existing.hintMessages, ...(Array.isArray(entry.hintMessages) ? entry.hintMessages : [])]);
      existing.contextRequirements = sortUniqueStrings([
        ...existing.contextRequirements,
        ...(Array.isArray(entry.contextRequirements) ? entry.contextRequirements : []),
      ]);
      existing.unresolvedReasons = sortUniqueStrings([
        ...existing.unresolvedReasons,
        ...(Array.isArray(entry.unresolvedReasons) ? entry.unresolvedReasons : []),
      ]);
      existing.semanticTags = sortUniqueStrings([
        ...existing.semanticTags,
        ...(Array.isArray(entry.semanticTags) ? entry.semanticTags : []),
      ]);
      merged.set(use, existing);
    }
  }
  return [...merged.values()].sort((left, right) => left.use.localeCompare(right.use));
}

function mergeAvailableUsesWithInventories({ baseUses, instanceInventory }) {
  const normalizedInstance = normalizeInstanceInventory(instanceInventory);

  const sourceRoot = normalizeText(process.env.NOCOBASE_SOURCE_ROOT || '');
  const sourceInventoryRaw = sourceRoot
    ? collectNocobaseSourceInventory({ repoRoot: sourceRoot })
    : {
      detected: false,
      repoRoot: sourceRoot,
      publicModels: [],
      publicTreeRoots: [],
      expectedDescendantModels: [],
      evidenceFiles: [],
      publicUseCatalog: [],
    };
  const normalizedSourceInventory = normalizeSourceInventory(sourceInventoryRaw);
  return {
    availableUses: sortUniqueStrings([
      ...baseUses,
      ...normalizedInstance.flowSchema.rootPublicUses,
      ...normalizedSourceInventory.publicModels,
      ...normalizedSourceInventory.publicTreeRoots,
    ]),
    rootPublicUses: sortUniqueStrings([
      ...normalizedInstance.flowSchema.rootPublicUses,
      ...normalizedSourceInventory.publicTreeRoots,
    ]),
    publicUseCatalog: mergePublicUseCatalog([
      normalizedInstance.flowSchema.publicUseCatalog,
      normalizedSourceInventory.publicUseCatalog,
    ]),
    instanceInventory: normalizedInstance,
    sourceInventory: normalizedSourceInventory,
  };
}

function humanizeCollectionTitle(collectionMeta) {
  const rawTitle = normalizeText(collectionMeta?.title);
  if (!rawTitle) {
    return normalizeText(collectionMeta?.name);
  }
  const translated = rawTitle.match(/\{\{t\("([^"]+)"\)\}\}/);
  if (translated?.[1]) {
    return translated[1];
  }
  return rawTitle.replace(/[{}]/g, '') || normalizeText(collectionMeta?.name);
}

function collectionKeywords(collectionMeta) {
  const keywords = new Set([
    normalizeText(collectionMeta?.name).toLowerCase(),
    humanizeCollectionTitle(collectionMeta).toLowerCase(),
  ]);
  const aliases = COLLECTION_ALIASES[normalizeText(collectionMeta?.name)] || [];
  for (const alias of aliases) {
    keywords.add(normalizeText(alias).toLowerCase());
  }
  return [...keywords].filter(Boolean);
}

function explicitCollectionSignals(requestText, collectionMeta) {
  return collectionKeywords(collectionMeta).filter((keyword) => containsText(requestText, keyword));
}

export function collectExplicitCollectionMatches(requestText, collectionsInventory) {
  const normalizedRequest = normalizeText(requestText);
  const normalizedCollections = normalizeCollectionsInventory(collectionsInventory);
  return normalizedCollections.names
    .map((name) => {
      const collectionMeta = normalizedCollections.byName[name];
      const signals = explicitCollectionSignals(normalizedRequest, collectionMeta);
      if (signals.length === 0) {
        return null;
      }
      return {
        name: collectionMeta.name,
        title: humanizeCollectionTitle(collectionMeta),
        signals: sortUniqueStrings(signals),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.signals.length !== left.signals.length) {
        return right.signals.length - left.signals.length;
      }
      return left.name.localeCompare(right.name);
    });
}

function extractQuotedTitle(requestText) {
  const patterns = [
    /标题为\s*['"]([^'"]+)['"]/i,
    /title\s*(?:is|=|为)?\s*['"]([^'"]+)['"]/i,
  ];
  for (const pattern of patterns) {
    const matched = pattern.exec(requestText);
    if (matched?.[1]) {
      return matched[1].trim();
    }
  }
  return '';
}

function parseCountToken(token) {
  const normalized = normalizeText(token).replace(/\s+/g, '');
  if (!normalized) {
    return null;
  }
  if (/^\d+$/.test(normalized)) {
    const value = Number.parseInt(normalized, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const singleDigitMap = new Map([
    ['零', 0],
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5],
    ['六', 6],
    ['七', 7],
    ['八', 8],
    ['九', 9],
  ]);
  if (singleDigitMap.has(normalized)) {
    return singleDigitMap.get(normalized);
  }
  if (normalized === '十') {
    return 10;
  }
  const tensMatch = /^(?:(?<tens>[一二两三四五六七八九])?十(?<ones>[一二三四五六七八九])?)$/.exec(normalized);
  if (!tensMatch?.groups) {
    return null;
  }
  const tens = tensMatch.groups.tens ? (singleDigitMap.get(tensMatch.groups.tens) || 0) : 1;
  const ones = tensMatch.groups.ones ? (singleDigitMap.get(tensMatch.groups.ones) || 0) : 0;
  const value = (tens * 10) + ones;
  return value > 0 ? value : null;
}

function detectRequestedPageCount(requestText) {
  const patterns = [
    /(?<count>\d+|[一二两三四五六七八九十]+)\s*(?:个|张)?\s*(?:复杂一点的|复杂的|不同的|独立的)?\s*(?:页面|page|pages|screen|screens)/i,
    /(?:创建|生成|搭建|做|build)\s*(?<count>\d+|[一二两三四五六七八九十]+)\s*(?:个|张)?\s*(?:页面|page|pages|screen|screens)/i,
  ];
  for (const pattern of patterns) {
    const matched = pattern.exec(requestText);
    if (!matched?.groups?.count) {
      continue;
    }
    const parsed = parseCountToken(matched.groups.count);
    if (parsed && parsed > 1) {
      return parsed;
    }
  }
  return null;
}

function sanitizeMultiPagePrefix(text) {
  return normalizeText(text)
    .replace(
      /(?:请|帮我|需要|想要|使用|用)?\s*(?:创建|生成|搭建|做|build)?\s*(?:\d+|[一二两三四五六七八九十]+)\s*(?:个|张)?\s*(?:复杂一点的|复杂的|不同的|独立的)?\s*(?:页面|page|pages|screen|screens)\s*/ig,
      '',
    )
    .replace(/^[：:，,；;\-\s]+|[：:，,；;\-\s]+$/g, '')
    .trim();
}

function normalizePageSplitText(requestText) {
  return normalizeText(requestText)
    .replace(/\r\n?/g, '\n')
    .replace(/([：:])\s*(第[一二两三四五六七八九十\d]+\s*页)/g, '$1\n$2')
    .replace(/([：:])\s*((?:page|screen)\s*\d+)/ig, '$1\n$2')
    .replace(/([：:])\s*([0-9]+[.)、．])/g, '$1\n$2')
    .replace(/([：:])\s*([一二三四五六七八九十]+[、.．])/g, '$1\n$2')
    .replace(/([。；;])\s*(第[一二两三四五六七八九十\d]+\s*页)/g, '$1\n$2')
    .replace(/([。；;])\s*((?:page|screen)\s*\d+)/ig, '$1\n$2')
    .replace(/([。；;])\s*([0-9]+[.)、．])/g, '$1\n$2')
    .replace(/([。；;])\s*([一二三四五六七八九十]+[、.．])/g, '$1\n$2');
}

function extractPageSections(requestText) {
  const normalized = normalizePageSplitText(requestText);
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const sectionStartPattern = /^(?:[-*]\s*)?(?<marker>第[一二两三四五六七八九十\d]+\s*页|(?:page|screen)\s*\d+|[0-9]+[.)、．]|[一二三四五六七八九十]+[、.．])\s*(?<body>.*)$/i;
  const inlinePageLabelPattern = /^(?<marker>页面\s*[A-Za-z0-9一二三四五六七八九十]+)\s*[:：]\s*(?<body>.*)$/i;
  const preface = [];
  const sections = [];
  let currentSection = null;

  const pushCurrent = () => {
    if (!currentSection) {
      return;
    }
    const body = normalizeText(currentSection.bodyLines.join(' '));
    if (body) {
      sections.push({
        marker: currentSection.marker,
        body,
      });
    }
    currentSection = null;
  };

  for (const line of lines) {
    const markerMatch = sectionStartPattern.exec(line) || inlinePageLabelPattern.exec(line);
    if (markerMatch?.groups) {
      pushCurrent();
      currentSection = {
        marker: normalizeText(markerMatch.groups.marker),
        bodyLines: markerMatch.groups.body ? [markerMatch.groups.body] : [],
      };
      continue;
    }
    if (currentSection) {
      currentSection.bodyLines.push(line);
      continue;
    }
    preface.push(line);
  }
  pushCurrent();

  return {
    preface: normalizeText(preface.join(' ')),
    sections,
  };
}

export function splitValidationRequestIntoPageSpecs({ caseRequest, collectionsInventory } = {}) {
  const requestText = normalizeText(caseRequest);
  const requestedPageCount = detectRequestedPageCount(requestText);
  const { preface, sections } = extractPageSections(requestText);

  if (sections.length <= 1 && !(requestedPageCount && requestedPageCount > 1)) {
    return {
      requestedPageCount: 1,
      decompositionMode: 'single-page',
      pageRequests: [{
        pageId: 'page-1',
        pageIndex: 1,
        titleHint: extractQuotedTitle(requestText),
        requestText,
        explicitCollections: collectExplicitCollectionMatches(requestText, collectionsInventory).map((item) => item.name),
      }],
      blockers: [],
    };
  }

  const sharedPrefix = sanitizeMultiPagePrefix(preface);
  const pageRequests = sections.map((section, index) => {
    const scopedRequestText = normalizeText([sharedPrefix, section.body].filter(Boolean).join('； ')) || section.body;
    return {
      pageId: `page-${index + 1}`,
      pageIndex: index + 1,
      titleHint: extractQuotedTitle(scopedRequestText),
      requestText: scopedRequestText,
      explicitCollections: collectExplicitCollectionMatches(scopedRequestText, collectionsInventory).map((item) => item.name),
      marker: section.marker,
    };
  });

  const blockers = [];
  if ((requestedPageCount && pageRequests.length < requestedPageCount) || pageRequests.length === 0) {
    blockers.push(makePlanningBlocker(
      'MULTI_PAGE_REQUEST_PAGE_SPECS_UNRESOLVED',
      `请求显式要求 ${requestedPageCount || '多'} 张页面，但当前只能拆出 ${pageRequests.length} 份 page-level spec，不能继续走单页 planner。`,
      {
        requestedPageCount: requestedPageCount || null,
        resolvedPageCount: pageRequests.length,
      },
    ));
  }

  return {
    requestedPageCount: requestedPageCount || pageRequests.length,
    decompositionMode: pageRequests.length > 0 ? 'numbered-page-sections' : 'unresolved-multi-page',
    pageRequests,
    blockers,
  };
}

function pickPrimaryBlockDefinition(requestText, availableUses) {
  const normalizedAvailable = new Set(uniqueStrings(availableUses));
  const matched = PRIMARY_BLOCK_DEFINITIONS.find((entry) => hasAnyKeyword(requestText, entry.keywords));
  if (matched && (matched.use === 'TableBlockModel' || matched.use === 'DetailsBlockModel' || matched.use === 'CreateFormModel' || matched.use === 'EditFormModel' || normalizedAvailable.has(matched.use))) {
    return matched;
  }
  return null;
}

function scoreCatalogEntry(requestText, entry) {
  const searchable = [
    normalizeText(entry?.title),
    ...(Array.isArray(entry?.hintMessages) ? entry.hintMessages : []),
    ...(Array.isArray(entry?.contextRequirements) ? entry.contextRequirements : []),
    ...(Array.isArray(entry?.semanticTags) ? entry.semanticTags : []),
    ...(Array.isArray(entry?.unresolvedReasons) ? entry.unresolvedReasons : []),
  ];
  return searchable.reduce((score, item) => {
    const normalizedItem = normalizeText(item);
    if (!normalizedItem) {
      return score;
    }
    if (containsText(requestText, normalizedItem)) {
      return score + 2;
    }
    const tokens = normalizedItem
      .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
    return score + tokens.reduce((matched, token) => (containsText(requestText, token) ? matched + 1 : matched), 0);
  }, 0);
}

function rankExplorationDefinitions(requestText, definitions, publicUseCatalog) {
  const catalogByUse = new Map(
    (Array.isArray(publicUseCatalog) ? publicUseCatalog : [])
      .map((entry) => [normalizeText(entry?.use), entry]),
  );
  return [...definitions].sort((left, right) => {
    const leftScore = scoreCatalogEntry(requestText, catalogByUse.get(left.use));
    const rightScore = scoreCatalogEntry(requestText, catalogByUse.get(right.use));
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return PRIMARY_BLOCK_DEFINITIONS.findIndex((entry) => entry.use === left.use)
      - PRIMARY_BLOCK_DEFINITIONS.findIndex((entry) => entry.use === right.use);
  });
}

function collectCatalogPlanningBlockers(requestText, publicUseCatalog, options = {}) {
  const limitedUses = options?.limitedUses instanceof Set
    ? options.limitedUses
    : new Set(uniqueStrings(options?.limitedUses));
  if (limitedUses.size === 0) {
    return [];
  }
  const blockers = [];
  for (const entry of Array.isArray(publicUseCatalog) ? publicUseCatalog : []) {
    const entryUse = normalizeText(entry?.use);
    if (!entryUse || !limitedUses.has(entryUse)) {
      continue;
    }
    const matchScore = scoreCatalogEntry(requestText, entry);
    if (matchScore <= 0) {
      continue;
    }
    const unresolvedReasons = Array.isArray(entry.unresolvedReasons) ? entry.unresolvedReasons : [];
    const contextRequirements = Array.isArray(entry.contextRequirements) ? entry.contextRequirements : [];
    if (unresolvedReasons.length === 0 && contextRequirements.length === 0) {
      continue;
    }
    blockers.push(makePlanningBlocker(
      'DYNAMIC_HINTS_REQUIRE_RUNTIME_CONTEXT',
      `${normalizeText(entry.use) || 'public use'} 命中了请求语义，但它依赖运行时上下文：${uniqueStrings([...contextRequirements, ...unresolvedReasons]).join(', ')}`,
      {
        use: normalizeText(entry.use),
        contextRequirements,
        unresolvedReasons,
      },
    ));
  }
  return blockers;
}

function extractFieldCandidatesFromRequest(requestText, collectionMeta) {
  const request = normalizeText(requestText).toLowerCase();
  const fields = Array.isArray(collectionMeta?.fieldNames) ? collectionMeta.fieldNames : [];
  return fields
    .filter((field) => !REQUEST_FIELD_STOP_WORDS.has(field.toLowerCase()))
    .filter((field) => containsText(request, field))
    .sort((left, right) => request.indexOf(left.toLowerCase()) - request.indexOf(right.toLowerCase()));
}

function defaultCollectionFields(collectionMeta, limit = 4) {
  const preferred = [];
  const titleField = normalizeText(collectionMeta?.titleField);
  if (titleField) {
    preferred.push(titleField);
  }
  [
    'name',
    'title',
    'username',
    'nickname',
    'email',
    'status',
    'phone',
    'createdAt',
    'updatedAt',
    'created_at',
    'updated_at',
    'id',
  ].forEach((field) => preferred.push(field));
  const scalarFields = Array.isArray(collectionMeta?.scalarFieldNames) && collectionMeta.scalarFieldNames.length > 0
    ? collectionMeta.scalarFieldNames
    : collectionMeta?.fieldNames || [];
  const ordered = [];
  for (const field of preferred) {
    if (scalarFields.includes(field)) {
      ordered.push(field);
    }
  }
  for (const field of scalarFields) {
    if (!ordered.includes(field)) {
      ordered.push(field);
    }
  }
  return ordered.slice(0, limit);
}

function resolveFieldsForCollection(requestText, collectionMeta) {
  const requestedFields = extractFieldCandidatesFromRequest(requestText, collectionMeta);
  const resolvedFields = requestedFields.length > 0
    ? requestedFields
    : defaultCollectionFields(collectionMeta);
  return {
    requestedFields,
    resolvedFields,
  };
}

function scoreCollectionCandidate({ requestText, baseSlug, collectionMeta }) {
  const explicitSignals = explicitCollectionSignals(requestText, collectionMeta);
  const fieldMatches = extractFieldCandidatesFromRequest(requestText, collectionMeta);
  let score = explicitSignals.length * 40;
  score += fieldMatches.length * 8;
  if (containsText(baseSlug, collectionMeta.name)) {
    score += 16;
  }
  return {
    collectionMeta,
    score,
    explicitSignals,
    fieldMatches,
  };
}

function resolvePrimaryCollection({ requestText, baseSlug, collectionsInventory, primaryBlockDefinition }) {
  const names = Array.isArray(collectionsInventory?.names) ? collectionsInventory.names : [];
  const candidates = names
    .map((name) => scoreCollectionCandidate({
      requestText,
      baseSlug,
      collectionMeta: collectionsInventory.byName[name],
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.collectionMeta.name.localeCompare(right.collectionMeta.name);
    });

  if (candidates[0]?.score > 0) {
    return {
      selectionMode: candidates[0].explicitSignals.length > 0 ? 'collection-first' : 'intent-first',
      collectionMeta: candidates[0].collectionMeta,
      scoreSummary: candidates[0],
    };
  }

  if (primaryBlockDefinition.collectionRequired) {
    return {
      selectionMode: 'intent-first',
      collectionMeta: null,
      scoreSummary: null,
    };
  }

  return {
    selectionMode: 'intent-first',
    collectionMeta: null,
    scoreSummary: null,
  };
}

function resolveOperationIntent(requestText, primaryBlockUse) {
  const minimal = hasAnyKeyword(requestText, [
    '无需复杂动作',
    '不要复杂动作',
    '只要页面可正常打开',
    '只要页面可打开',
    '只要渲染',
    '只看效果',
  ]);
  const explicitCreate = hasAnyKeyword(requestText, ['新增', '新建', '创建', 'create', 'add']);
  const explicitEdit = hasAnyKeyword(requestText, ['编辑', '修改', 'edit', 'update']);
  const explicitDelete = hasAnyKeyword(requestText, ['删除', 'delete', 'remove', 'destroy']);
  const explicitView = hasAnyKeyword(requestText, ['查看', '详情', 'view', 'open', 'popup', 'drawer', 'dialog']);

  const supportsCollectionActions = primaryBlockUse !== 'MarkdownBlockModel' && primaryBlockUse !== 'ReferenceBlockModel';
  const defaultCrud = supportsCollectionActions && !minimal;

  return {
    create: explicitCreate || defaultCrud,
    edit: explicitEdit || defaultCrud,
    delete: explicitDelete || defaultCrud,
    view: explicitView || defaultCrud,
    requestedTabs: hasAnyKeyword(requestText, ['tab', 'tabs', '页签', '标签']),
    requestedFilter: hasAnyKeyword(requestText, ['筛选', 'filter']),
    minimal,
  };
}

function findPrimaryBlockDefinitionByUse(use) {
  return PRIMARY_BLOCK_DEFINITIONS.find((entry) => entry.use === use) || null;
}

function buildPrimaryBlockDefinition(use, publicUseCatalog = []) {
  const normalizedUse = normalizeText(use);
  if (!normalizedUse) {
    return null;
  }
  const existing = findPrimaryBlockDefinitionByUse(normalizedUse);
  if (existing) {
    return existing;
  }
  const catalogByUse = new Map(
    (Array.isArray(publicUseCatalog) ? publicUseCatalog : [])
      .map((entry) => [normalizeText(entry?.use), entry]),
  );
  const catalogEntry = catalogByUse.get(normalizedUse);
  const readableLabel = normalizeText(catalogEntry?.title) || useToReadableLabel(normalizedUse);
  const slug = readableLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || normalizedUse.toLowerCase();
  return {
    use: normalizedUse,
    archetypeId: slug,
    archetypeLabel: `${readableLabel} 主块页`,
    keywords: [],
    collectionRequired: COLLECTION_BOUND_PUBLIC_USES.has(normalizedUse),
    titleSuffix: readableLabel,
    kind: 'public-use',
  };
}

function collectUseFamilies(use, catalogEntry = null) {
  const normalizedUse = normalizeText(use);
  const base = [];
  if (normalizedUse === 'TableBlockModel') {
    base.push('collection', 'table');
  } else if (normalizedUse === 'DetailsBlockModel') {
    base.push('collection', 'details');
  } else if (normalizedUse === 'CreateFormModel' || normalizedUse === 'EditFormModel') {
    base.push('collection', 'form');
  } else if (normalizedUse === 'FilterFormBlockModel') {
    base.push('collection', 'filter');
  } else if (normalizedUse === 'GridCardBlockModel') {
    base.push('collection', 'metrics');
  } else if (normalizedUse === 'ListBlockModel') {
    base.push('collection', 'feed');
  } else if (normalizedUse === 'MapBlockModel') {
    base.push('collection', 'geo');
  } else if (normalizedUse === 'ChartBlockModel') {
    base.push('analytics');
  } else if (normalizedUse === 'MarkdownBlockModel') {
    base.push('content', 'docs');
  } else if (normalizedUse === 'JSBlockModel') {
    base.push('content', 'custom');
  } else if (normalizedUse === 'CommentsBlockModel') {
    base.push('collection', 'collaboration');
  }
  return uniqueStrings([
    ...base,
    ...(Array.isArray(catalogEntry?.semanticTags) ? catalogEntry.semanticTags : []),
    normalizedUse ? 'business-block' : '',
  ]);
}

function buildUseDescriptor(use, publicUseCatalog = []) {
  const normalizedUse = normalizeText(use);
  if (!normalizedUse) {
    return null;
  }
  const definition = buildPrimaryBlockDefinition(normalizedUse, publicUseCatalog);
  const catalogByUse = new Map(
    (Array.isArray(publicUseCatalog) ? publicUseCatalog : [])
      .map((entry) => [normalizeText(entry?.use), entry]),
  );
  const catalogEntry = catalogByUse.get(normalizedUse) || null;
  return {
    ...definition,
    catalogEntry,
    families: collectUseFamilies(normalizedUse, catalogEntry),
    label: normalizeText(catalogEntry?.title) || definition.titleSuffix || useToReadableLabel(normalizedUse),
  };
}

function isBusinessUse(use) {
  const normalizedUse = normalizeText(use);
  return Boolean(normalizedUse) && !STRUCTURAL_OR_META_USES.has(normalizedUse);
}

function isCollectionBoundBusinessBlock(block) {
  if (!block || typeof block !== 'object') {
    return false;
  }
  if (block.kind === 'Filter') {
    return false;
  }
  if (block.kind === 'Table' || block.kind === 'Details') {
    return Boolean(normalizeText(block.collectionName));
  }
  if (block.kind === 'Form') {
    return Boolean(normalizeText(block.collectionName));
  }
  if (block.kind === 'PublicUse') {
    return Boolean(normalizeText(block.collectionName)) || COLLECTION_BOUND_PUBLIC_USES.has(normalizeText(block.use));
  }
  return false;
}

function layoutHasCollectionBoundBusinessBlock(layout) {
  const visitBlocks = (items) => (Array.isArray(items) ? items : []).some((block) => {
    if (isCollectionBoundBusinessBlock(block)) {
      return true;
    }
    const popupBlocks = Array.isArray(block?.popup?.blocks) ? block.popup.blocks : [];
    return visitBlocks(block?.blocks) || visitBlocks(popupBlocks);
  });
  return visitBlocks(layout?.blocks)
    || (Array.isArray(layout?.tabs) ? layout.tabs.some((tab) => visitBlocks(tab.blocks)) : false);
}

function collectLayoutUses(layout) {
  const uses = [];
  const visitBlocks = (items) => {
    for (const block of Array.isArray(items) ? items : []) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      if (block.kind === 'Filter') {
        uses.push('FilterFormBlockModel');
      } else if (block.kind === 'Table') {
        uses.push('TableBlockModel');
      } else if (block.kind === 'Details') {
        uses.push('DetailsBlockModel');
      } else if (block.kind === 'Form') {
        uses.push(block.mode === 'edit' ? 'EditFormModel' : 'CreateFormModel');
      } else if (block.kind === 'PublicUse' && block.use) {
        uses.push(block.use);
      }
      visitBlocks(block.blocks);
      if (Array.isArray(block?.popup?.blocks)) {
        visitBlocks(block.popup.blocks);
      }
    }
  };
  visitBlocks(layout?.blocks);
  if (Array.isArray(layout?.tabs) && layout.tabs.length > 0) {
    uses.push('RootPageTabModel');
    for (const tab of layout.tabs) {
      visitBlocks(tab.blocks);
    }
  }
  return uniqueStrings(uses);
}

function collectCandidateFamiliesFromLayout(layout, publicUseCatalog = []) {
  const families = new Set();
  for (const use of collectLayoutUses(layout)) {
    if (use === 'RootPageTabModel') {
      families.add('workspace');
      continue;
    }
    for (const family of collectUseFamilies(use, null)) {
      families.add(family);
    }
    const descriptor = buildUseDescriptor(use, publicUseCatalog);
    for (const family of Array.isArray(descriptor?.families) ? descriptor.families : []) {
      families.add(family);
    }
  }
  return [...families].sort((left, right) => left.localeCompare(right));
}

function buildCreativeUseInventory({
  inventoryMerge,
  collectionMeta,
}) {
  const catalogByUse = new Map(
    (Array.isArray(inventoryMerge?.publicUseCatalog) ? inventoryMerge.publicUseCatalog : [])
      .map((entry) => [normalizeText(entry?.use), entry]),
  );
  const candidateUses = uniqueStrings([
    ...STABLE_BUSINESS_BLOCK_USES,
    ...(Array.isArray(inventoryMerge?.instanceInventory?.flowSchema?.rootPublicUses)
      ? inventoryMerge.instanceInventory.flowSchema.rootPublicUses
      : []),
  ]).filter(isBusinessUse);

  const eligibleDescriptors = [];
  const discardedUses = [];
  for (const use of candidateUses) {
    const descriptor = buildUseDescriptor(use, inventoryMerge.publicUseCatalog);
    if (!descriptor) {
      continue;
    }
    const catalogEntry = catalogByUse.get(use) || descriptor.catalogEntry || {};
    const forcedHints = ALWAYS_RUNTIME_SENSITIVE_PUBLIC_USES[use] || {};
    const contextRequirements = uniqueStrings([
      ...(Array.isArray(catalogEntry?.contextRequirements) ? catalogEntry.contextRequirements : []),
      ...(Array.isArray(forcedHints.contextRequirements) ? forcedHints.contextRequirements : []),
    ]);
    const unresolvedReasons = uniqueStrings([
      ...(Array.isArray(catalogEntry?.unresolvedReasons) ? catalogEntry.unresolvedReasons : []),
      ...(Array.isArray(forcedHints.unresolvedReasons) ? forcedHints.unresolvedReasons : []),
    ]);
    if (descriptor.collectionRequired && !collectionMeta) {
      discardedUses.push({
        use,
        title: descriptor.label,
        contextRequirements,
        unresolvedReasons: uniqueStrings([...unresolvedReasons, 'collection-required']),
        families: descriptor.families,
      });
      continue;
    }
    if (contextRequirements.length > 0 || unresolvedReasons.length > 0) {
      discardedUses.push({
        use,
        title: descriptor.label,
        contextRequirements,
        unresolvedReasons,
        families: descriptor.families,
      });
      continue;
    }
    eligibleDescriptors.push(descriptor);
  }

  eligibleDescriptors.sort((left, right) => {
    const leftIndex = CREATIVE_PRIORITY_USES.indexOf(left.use);
    const rightIndex = CREATIVE_PRIORITY_USES.indexOf(right.use);
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }
    return left.use.localeCompare(right.use);
  });

  return {
    eligibleDescriptors,
    eligibleUses: eligibleDescriptors.map((item) => item.use),
    discardedUses,
  };
}

function pickDescriptorByPredicate(descriptors, predicate, excludeUses = []) {
  const excluded = new Set(uniqueStrings(excludeUses));
  return (Array.isArray(descriptors) ? descriptors : [])
    .find((descriptor) => !excluded.has(descriptor.use) && predicate(descriptor)) || null;
}

function resolveFilterFields(collectionMeta, fieldResolution) {
  const scalarFieldNames = Array.isArray(collectionMeta?.scalarFieldNames) && collectionMeta.scalarFieldNames.length > 0
    ? collectionMeta.scalarFieldNames
    : Array.isArray(collectionMeta?.fieldNames)
      ? collectionMeta.fieldNames
      : [];
  const requestedOrResolved = [
    ...(Array.isArray(fieldResolution?.requestedFields) ? fieldResolution.requestedFields : []),
    ...(Array.isArray(fieldResolution?.resolvedFields) ? fieldResolution.resolvedFields : []),
  ];
  const ordered = [];
  for (const field of requestedOrResolved) {
    if (scalarFieldNames.includes(field) && !ordered.includes(field)) {
      ordered.push(field);
    }
  }
  for (const field of scalarFieldNames) {
    if (!ordered.includes(field)) {
      ordered.push(field);
    }
  }
  return ordered.slice(0, 3);
}

function attachFilterBlockToLayout(layout, filterBlock) {
  if (!filterBlock) {
    return layout;
  }
  return {
    pageUse: layout.pageUse,
    blocks: [filterBlock, ...(Array.isArray(layout.blocks) ? layout.blocks : [])],
    tabs: Array.isArray(layout.tabs) ? layout.tabs : [],
  };
}

function createCreativeProgram({
  planningMode = DEFAULT_PLANNING_MODE,
  selectionMode,
  operationIntent,
  inventoryMerge,
  collectionMeta,
}) {
  if (planningMode === 'creative-first') {
    return {
      id: 'creative-first-v1',
      strategy: 'creative-first',
      prompt: '在全部可稳定落库的业务区块里生成 5 个固定 recipe 候选，并按创意与语义平衡选中主方案。',
      selectionPolicy: 'creative-and-semantic-balance',
      constraints: uniqueStrings([
        'fixed-five-candidates',
        'all-eligible-business-blocks',
        'runtime-sensitive-discarded',
        operationIntent.requestedFilter ? 'filter-request-must-be-materialized' : '',
        collectionMeta ? `collection:${collectionMeta.name}` : '',
      ]),
      heuristics: uniqueStrings([
        'prefer-explicit-block-keyword-anchor',
        'prefer-mixed-single-and-composite-recipes',
        collectionMeta ? 'require-collection-bound-business-block' : '',
        operationIntent.requestedTabs ? 'prefer-tabbed-multi-surface' : '',
      ]),
      requiredPatterns: uniqueStrings([
        'keyword-anchor',
        'collection-workbench',
        'analytics-mix',
        'content-control',
        'tabbed-multi-surface',
      ]),
      optionalPatterns: uniqueStrings([
        operationIntent.requestedFilter ? 'filter-form' : '',
        operationIntent.view || operationIntent.edit ? 'record-actions' : '',
        operationIntent.delete ? 'delete-confirm' : '',
      ]),
      notes: uniqueStrings([
        inventoryMerge.instanceInventory.flowSchema.detected
          ? `instance-root-uses:${inventoryMerge.instanceInventory.flowSchema.rootPublicUses.join(',')}`
          : '',
        inventoryMerge.sourceInventory.detected
          ? `source-root:${inventoryMerge.sourceInventory.repoRoot}`
          : '',
      ]),
    };
  }
  return {
    id: selectionMode === 'dynamic-exploration' ? 'dynamic-exploration-v1' : 'collection-first-v1',
    strategy: selectionMode,
    prompt: selectionMode === 'dynamic-exploration'
      ? '在当前实例公开区块内做 2-3 个确定性候选布局，再选择最稳的一种。'
      : '先锁定 collection 与字段，再生成 2-3 个可验证布局候选。',
    selectionPolicy: 'deterministic-rank',
    constraints: uniqueStrings([
      'deterministic-only',
      'primitive-first',
      operationIntent.requestedFilter ? 'filter-request-must-be-materialized' : '',
      collectionMeta ? `collection:${collectionMeta.name}` : '',
    ]),
    heuristics: uniqueStrings([
      selectionMode === 'dynamic-exploration'
        ? 'prefer-public-root-blocks-without-collection-binding'
        : 'prefer-explicit-collection-and-fields',
      operationIntent.requestedTabs ? 'prefer-tabbed-workbench' : 'prefer-single-focus-layout',
      operationIntent.requestedFilter ? 'place-filter-before-business-blocks' : '',
    ]),
    requiredPatterns: uniqueStrings([
      operationIntent.requestedTabs ? 'workspace-tabs' : '',
      operationIntent.requestedFilter ? 'filter-form' : '',
    ]),
    optionalPatterns: uniqueStrings([
      'popup-openview',
      operationIntent.delete ? 'delete-confirm' : '',
      operationIntent.view || operationIntent.edit ? 'record-actions' : '',
    ]),
    notes: uniqueStrings([
      inventoryMerge.instanceInventory.flowSchema.detected
        ? `instance-root-uses:${inventoryMerge.instanceInventory.flowSchema.rootPublicUses.join(',')}`
        : '',
      inventoryMerge.sourceInventory.detected
        ? `source-root:${inventoryMerge.sourceInventory.repoRoot}`
        : '',
    ]),
  };
}

function buildLayoutCandidate({
  candidateId,
  score,
  semanticScore,
  creativeScore,
  stabilityScore,
  title,
  summary,
  layout,
  selectionMode,
  primaryBlockDefinition,
  collectionMeta,
  requestedFields,
  resolvedFields,
  selectionRationale,
  planningStatus,
  planningBlockers,
  shape = '',
  families = [],
  selected = false,
}) {
  const clonedLayout = cloneJson(layout);
  return {
    candidateId,
    title,
    summary,
    score,
    semanticScore: Number.isFinite(semanticScore) ? semanticScore : null,
    creativeScore: Number.isFinite(creativeScore) ? creativeScore : null,
    stabilityScore: Number.isFinite(stabilityScore) ? stabilityScore : null,
    selected,
    selectionMode,
    primaryBlockType: primaryBlockDefinition.use,
    targetCollections: collectionMeta ? [collectionMeta.name] : [],
    requestedFields,
    resolvedFields,
    selectionRationale: uniqueStrings(selectionRationale),
    planningStatus,
    planningBlockers,
    shape,
    families: uniqueStrings(families),
    actionPlan: collectActionPlan(clonedLayout),
    plannedCoverage: buildCoverageFromLayout(clonedLayout),
    layout: clonedLayout,
  };
}

function findExplicitPublicUses(requestText, availableUses, primaryBlockUse) {
  const availableSet = new Set(uniqueStrings(availableUses));
  return PRIMARY_BLOCK_DEFINITIONS
    .filter((entry) => entry.kind === 'public-use' && entry.use !== primaryBlockUse)
    .filter((entry) => hasAnyKeyword(requestText, entry.keywords))
    .filter((entry) => availableSet.has(entry.use))
    .map((entry) => entry.use);
}

function resolveCreativeAnchorDescriptor({
  requestText,
  eligibleDescriptors,
  publicUseCatalog,
}) {
  const eligibleUses = uniqueStrings((Array.isArray(eligibleDescriptors) ? eligibleDescriptors : []).map((item) => item.use));
  const explicitPrimary = pickPrimaryBlockDefinition(requestText, eligibleUses);
  if (explicitPrimary) {
    return {
      descriptor: buildUseDescriptor(explicitPrimary.use, publicUseCatalog),
      explicit: true,
      source: 'explicit-keyword',
    };
  }

  const scoredDescriptors = (Array.isArray(eligibleDescriptors) ? eligibleDescriptors : [])
    .map((descriptor) => ({
      descriptor,
      score: scoreCatalogEntry(requestText, descriptor.catalogEntry),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const leftIndex = CREATIVE_PRIORITY_USES.indexOf(left.descriptor.use);
      const rightIndex = CREATIVE_PRIORITY_USES.indexOf(right.descriptor.use);
      return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
        - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
    });
  const selected = scoredDescriptors[0]?.descriptor || eligibleDescriptors[0] || null;
  return {
    descriptor: selected,
    explicit: false,
    source: scoredDescriptors[0]?.score > 0 ? 'semantic-rank' : 'creative-priority',
  };
}

function buildDetailsActions({
  collectionLabel,
  collectionName,
  fields,
  operationIntent,
  depth,
  maxDepth,
}) {
  const actions = [];
  if (depth >= maxDepth - 1) {
    return actions;
  }
  if (operationIntent.edit) {
    actions.push(buildEditAction(`编辑${collectionLabel}`, collectionName, fields, `编辑${collectionLabel}`));
  }
  if (operationIntent.delete) {
    actions.push(buildDeleteAction(`删除${collectionLabel}`));
  }
  return actions;
}

function buildViewPopupBlocks({
  collectionLabel,
  collectionName,
  fields,
  operationIntent,
  depth,
  maxDepth,
}) {
  return [
    buildDetailsBlock({
      title: `${collectionLabel}详情`,
      collectionName,
      fields,
      actions: buildDetailsActions({
        collectionLabel,
        collectionName,
        fields,
        operationIntent,
        depth,
        maxDepth,
      }),
    }),
  ];
}

function buildTableActions({
  collectionLabel,
  collectionName,
  fields,
  operationIntent,
  depth,
  maxDepth,
}) {
  const actions = [];
  const rowActions = [];
  if (operationIntent.create) {
    actions.push(buildCreateAction(`新建${collectionLabel}`, collectionName, fields, `新建${collectionLabel}`));
  }
  if (operationIntent.view) {
    rowActions.push(buildViewAction(
      `查看${collectionLabel}`,
      buildViewPopupBlocks({
        collectionLabel,
        collectionName,
        fields,
        operationIntent,
        depth,
        maxDepth,
      }),
      `${collectionLabel}详情`,
    ));
  }
  if (operationIntent.edit) {
    rowActions.push(buildEditAction(`编辑${collectionLabel}`, collectionName, fields, `编辑${collectionLabel}`));
  }
  if (operationIntent.delete) {
    rowActions.push(buildDeleteAction(`删除${collectionLabel}`));
  }
  return {
    actions,
    rowActions,
  };
}

function buildCompanionTable({
  collectionMeta,
  fields,
  operationIntent,
  depth,
  maxDepth,
}) {
  const collectionLabel = humanizeCollectionTitle(collectionMeta);
  const collectionName = collectionMeta.name;
  const { actions, rowActions } = buildTableActions({
    collectionLabel,
    collectionName,
    fields,
    operationIntent,
    depth,
    maxDepth,
  });
  return buildTableBlock({
    title: `${collectionLabel}操作台`,
    collectionName,
    fields,
    actions,
    rowActions,
  });
}

function buildPrimaryBlock({
  primaryBlockDefinition,
  collectionMeta,
  fields,
  operationIntent,
  availableUses,
  depth,
  maxDepth,
}) {
  const collectionName = collectionMeta?.name || '';
  const collectionLabel = collectionMeta ? humanizeCollectionTitle(collectionMeta) : primaryBlockDefinition.titleSuffix;
  if (primaryBlockDefinition.use === 'TableBlockModel') {
    const { actions, rowActions } = buildTableActions({
      collectionLabel,
      collectionName,
      fields,
      operationIntent,
      depth,
      maxDepth,
    });
    return buildTableBlock({
      title: `${collectionLabel}列表`,
      collectionName,
      fields,
      actions,
      rowActions,
    });
  }
  if (primaryBlockDefinition.use === 'DetailsBlockModel') {
    return buildDetailsBlock({
      title: `${collectionLabel}详情`,
      collectionName,
      fields,
      actions: buildDetailsActions({
        collectionLabel,
        collectionName,
        fields,
        operationIntent,
        depth,
        maxDepth,
      }),
    });
  }
  if (primaryBlockDefinition.use === 'CreateFormModel' || primaryBlockDefinition.use === 'EditFormModel') {
    return buildFormBlock({
      mode: primaryBlockDefinition.mode || 'create',
      title: `${collectionLabel}${primaryBlockDefinition.use === 'EditFormModel' ? '编辑表单' : '创建表单'}`,
      collectionName,
      fields,
    });
  }
  if (primaryBlockDefinition.kind === 'public-use') {
    const availableSet = new Set(uniqueStrings(availableUses));
    if (!availableSet.has(primaryBlockDefinition.use)) {
      return null;
    }
    return buildPublicUseBlock({
      use: primaryBlockDefinition.use,
      title: `${collectionLabel}${primaryBlockDefinition.titleSuffix}`,
      collectionName: COLLECTION_BOUND_PUBLIC_USES.has(primaryBlockDefinition.use) ? collectionName : '',
    });
  }
  return null;
}

function finalizeLayout({ primaryBlock, companionBlocks, explicitPublicUses, collectionMeta, requestedTabs, availableUses }) {
  const blocks = [];
  if (primaryBlock) {
    blocks.push(primaryBlock);
  }

  const availableSet = new Set(uniqueStrings(availableUses));
  const collectionName = collectionMeta?.name || '';
  const collectionLabel = collectionMeta ? humanizeCollectionTitle(collectionMeta) : '';
  for (const use of explicitPublicUses) {
    if (!availableSet.has(use)) {
      continue;
    }
    blocks.push(buildPublicUseBlock({
      use,
      title: collectionLabel ? `${collectionLabel}${PRIMARY_BLOCK_DEFINITIONS.find((entry) => entry.use === use)?.titleSuffix || use}` : use,
      collectionName: COLLECTION_BOUND_PUBLIC_USES.has(use) ? collectionName : '',
    }));
  }
  blocks.push(...companionBlocks);

  if (requestedTabs && blocks.length > 1) {
    const [first, ...rest] = blocks;
    return {
      pageUse: 'RootPageModel',
      blocks: [],
      tabs: [
        {
          title: '主视图',
          blocks: [first],
        },
        {
          title: '操作面',
          blocks: rest,
        },
      ],
    };
  }

  return {
    pageUse: 'RootPageModel',
    blocks,
    tabs: [],
  };
}

function createLayoutFromPrimary({
  primaryBlockDefinition,
  collectionMeta,
  fields,
  operationIntent,
  availableUses,
  explicitPublicUses,
  maxNestingDepth,
  requestedTabs,
  forceCompanionTable,
  filterBlock,
}) {
  const primaryBlock = buildPrimaryBlock({
    primaryBlockDefinition,
    collectionMeta,
    fields,
    operationIntent,
    availableUses,
    depth: 0,
    maxDepth: maxNestingDepth,
  });
  if (!primaryBlock) {
    return null;
  }
  const companionBlocks = [];
  if (
    collectionMeta
    && !operationIntent.minimal
    && (forceCompanionTable || primaryBlockDefinition.use !== 'TableBlockModel')
  ) {
    companionBlocks.push(buildCompanionTable({
      collectionMeta,
      fields,
      operationIntent,
      depth: 0,
      maxDepth: maxNestingDepth,
    }));
  }
  const baseLayout = finalizeLayout({
    primaryBlock,
    companionBlocks,
    explicitPublicUses,
    collectionMeta,
    requestedTabs,
    availableUses,
  });
  return attachFilterBlockToLayout(baseLayout, filterBlock);
}

function buildLayoutCandidates({
  title,
  selectionMode,
  collectionMeta,
  requestedFields,
  resolvedFields,
  primaryBlockDefinition,
  alternatePrimaryDefinitions,
  operationIntent,
  availableUses,
  explicitPublicUses,
  maxNestingDepth,
  filterBlock,
  planningStatus,
  planningBlockers,
}) {
  const candidates = [];
  const addCandidate = ({
    candidateId,
    score,
    label,
    summary,
    layout,
    primaryDefinition,
    rationale,
    selected = false,
  }) => {
    if (!layout) {
      return;
    }
    const serializedLayout = JSON.stringify(layout);
    if (candidates.some((item) => JSON.stringify(item.layout) === serializedLayout)) {
      return;
    }
    candidates.push(buildLayoutCandidate({
      candidateId,
      score,
      title: label,
      summary,
      layout,
      selectionMode,
      primaryBlockDefinition: primaryDefinition,
      collectionMeta,
      requestedFields,
      resolvedFields,
      selectionRationale: rationale,
      planningStatus,
      planningBlockers,
      selected,
    }));
  };

  const selectedLayout = createLayoutFromPrimary({
    primaryBlockDefinition,
    collectionMeta,
    fields: resolvedFields,
    operationIntent,
    availableUses,
    explicitPublicUses,
    maxNestingDepth,
    requestedTabs: operationIntent.requestedTabs,
    forceCompanionTable: false,
    filterBlock,
  });
  addCandidate({
    candidateId: 'selected-primary',
    score: 100,
    label: title,
    summary: `${normalizeText(title)} / 主方案`,
    layout: selectedLayout,
    primaryDefinition: primaryBlockDefinition,
    rationale: [
      selectionMode === 'dynamic-exploration' ? '按公开 root block 候选稳定排序，选中第一名。' : '按显式 collection / intent 生成主方案。',
      operationIntent.requestedFilter ? '显式筛选请求已物化为 FilterFormBlockModel。' : '',
    ],
    selected: true,
  });

  if (collectionMeta && !operationIntent.requestedTabs) {
    addCandidate({
      candidateId: 'tabbed-workbench',
      score: 88,
      label: `${title} 多标签`,
      summary: `${humanizeCollectionTitle(collectionMeta)} / 多标签工作台`,
      layout: createLayoutFromPrimary({
        primaryBlockDefinition,
        collectionMeta,
        fields: resolvedFields,
        operationIntent,
        availableUses,
        explicitPublicUses,
        maxNestingDepth,
        requestedTabs: true,
        forceCompanionTable: true,
        filterBlock,
      }),
      primaryDefinition: primaryBlockDefinition,
      rationale: [
        '保留主块语义，但拆成 workspace tabs，便于把操作台与主视图分离。',
      ],
    });
  }

  for (const alternate of Array.isArray(alternatePrimaryDefinitions) ? alternatePrimaryDefinitions : []) {
    addCandidate({
      candidateId: `alternate-${alternate.use}`,
      score: 72 - candidates.length,
      label: collectionMeta
        ? `${humanizeCollectionTitle(collectionMeta)} ${alternate.titleSuffix}`
        : `${title} ${alternate.titleSuffix}`,
      summary: `${alternate.archetypeLabel} / 备选方案`,
      layout: createLayoutFromPrimary({
        primaryBlockDefinition: alternate,
        collectionMeta,
        fields: resolvedFields,
        operationIntent,
        availableUses,
        explicitPublicUses,
        maxNestingDepth,
        requestedTabs: false,
        forceCompanionTable: collectionMeta && alternate.use !== 'TableBlockModel',
        filterBlock,
      }),
      primaryDefinition: alternate,
      rationale: [
        `切换主块到 ${alternate.use}，用于验证另一种布局重心。`,
      ],
    });
    if (candidates.length >= 3) {
      break;
    }
  }

  return candidates.slice(0, 3);
}

function collectActionPlan(layout) {
  const plans = [];
  const visitBlocks = (blocks, hostPath, depth) => {
    (Array.isArray(blocks) ? blocks : []).forEach((block, blockIndex) => {
      const path = `${hostPath}.blocks[${blockIndex}]`;
      const blockUse = block.kind === 'PublicUse'
        ? block.use
        : (block.kind === 'Form'
          ? (block.mode === 'edit' ? 'EditFormModel' : 'CreateFormModel')
          : `${block.kind}BlockModel`);
      for (const scopeKey of ['actions', 'rowActions']) {
        const scope = scopeKey === 'actions'
          ? (block.kind === 'Details' ? 'details-actions' : 'block-actions')
          : 'row-actions';
        (Array.isArray(block[scopeKey]) ? block[scopeKey] : []).forEach((action, actionIndex) => {
          const popupBlocks = Array.isArray(action?.popup?.blocks) ? action.popup.blocks : [];
          plans.push({
            hostPath: path,
            hostUse: blockUse,
            scope,
            kind: action.kind,
            label: normalizeText(action.label),
            popupDepth: depth + (popupBlocks.length > 0 ? 1 : 0),
            popupBlockKinds: popupBlocks.map((item) => item.kind === 'Form'
              ? (item.mode === 'edit' ? 'EditFormModel' : 'CreateFormModel')
              : (item.kind === 'PublicUse' ? item.use : `${item.kind}BlockModel`)),
          });
          if (popupBlocks.length > 0) {
            visitBlocks(popupBlocks, `${path}.${scope}[${actionIndex}].popup`, depth + 1);
          }
        });
      }
    });
  };
  visitBlocks(layout.blocks, '$.page', 0);
  (Array.isArray(layout.tabs) ? layout.tabs : []).forEach((tab, tabIndex) => {
    visitBlocks(tab.blocks, `$.page.tabs[${tabIndex}]`, 0);
  });
  return plans;
}

function buildCoverageFromLayout(layout) {
  const blocks = [];
  const patterns = [];
  const visitBlocks = (items, depth = 0) => {
    for (const block of Array.isArray(items) ? items : []) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      if (block.kind === 'Filter') {
        blocks.push('FilterFormBlockModel');
      } else if (block.kind === 'Table') {
        blocks.push('TableBlockModel');
      } else if (block.kind === 'Details') {
        blocks.push('DetailsBlockModel');
      } else if (block.kind === 'Form') {
        blocks.push(block.mode === 'edit' ? 'EditFormModel' : 'CreateFormModel');
      } else if (block.kind === 'PublicUse' && block.use) {
        blocks.push(block.use);
        if (block.use === 'JSBlockModel') {
          patterns.push('js-primary');
        }
      }
      if (depth > 0) {
        patterns.push('nested-popup');
      }
      const allActions = [
        ...(Array.isArray(block.actions) ? block.actions : []),
        ...(Array.isArray(block.rowActions) ? block.rowActions : []),
      ];
      if (allActions.some((action) => action?.popup)) {
        patterns.push('popup-openview');
      }
      if (allActions.some((action) => action?.kind === 'delete-record')) {
        patterns.push('delete-confirm');
      }
      if (Array.isArray(block.rowActions) && block.rowActions.length > 0) {
        patterns.push('record-actions');
      }
      for (const action of allActions) {
        if (Array.isArray(action?.popup?.blocks)) {
          visitBlocks(action.popup.blocks, depth + 1);
        }
      }
    }
  };
  visitBlocks(layout.blocks, 0);
  if (Array.isArray(layout.tabs) && layout.tabs.length > 0) {
    blocks.push('RootPageTabModel');
    patterns.push('workspace-tabs');
    for (const tab of layout.tabs) {
      visitBlocks(tab.blocks, 0);
    }
  }
  return {
    blocks: uniqueStrings(blocks),
    patterns: uniqueStrings(patterns),
  };
}

function cloneBlockOrNull(block) {
  return block && typeof block === 'object' ? cloneJson(block) : null;
}

function createCreativeRootLayout({
  filterBlock,
  blocks = [],
  tabs = [],
}) {
  const normalizedBlocks = [
    ...(filterBlock ? [cloneJson(filterBlock)] : []),
    ...blocks.filter(Boolean).map((block) => cloneJson(block)),
  ];
  return {
    pageUse: 'RootPageModel',
    blocks: normalizedBlocks,
    tabs: cloneJson(tabs),
  };
}

function finalizeCreativeLayout({
  filterBlock,
  blocks = [],
  tabs = [],
  collectionMeta,
  collectionFallbackBlock,
}) {
  const normalizedBlocks = blocks.filter(Boolean).map((block) => cloneJson(block));
  if (collectionMeta && !layoutHasCollectionBoundBusinessBlock({ blocks: normalizedBlocks, tabs })) {
    const fallbackBlock = cloneBlockOrNull(collectionFallbackBlock);
    if (fallbackBlock) {
      normalizedBlocks.push(fallbackBlock);
    }
  }
  return createCreativeRootLayout({
    filterBlock,
    blocks: normalizedBlocks,
    tabs,
  });
}

function buildCandidateScoreSummary({
  layout,
  families,
  collectionMeta,
  operationIntent,
  explicitAnchorUse,
}) {
  const uses = collectLayoutUses(layout);
  const publicUseCount = uses.filter((use) => ![
    'FilterFormBlockModel',
    'TableBlockModel',
    'DetailsBlockModel',
    'CreateFormModel',
    'EditFormModel',
    'RootPageTabModel',
  ].includes(use)).length;
  const tabCount = Array.isArray(layout?.tabs) ? layout.tabs.length : 0;
  const actionPlan = collectActionPlan(layout);
  const hasFilter = uses.includes('FilterFormBlockModel');
  const hasCollectionBinding = collectionMeta ? layoutHasCollectionBoundBusinessBlock(layout) : true;
  const hasExplicitAnchor = explicitAnchorUse ? uses.includes(explicitAnchorUse) : false;

  const semanticScore = clampScore(
    42
    + (hasExplicitAnchor ? 24 : 0)
    + (collectionMeta ? (hasCollectionBinding ? 18 : -20) : 0)
    + (operationIntent?.requestedFilter && hasFilter ? 10 : 0)
    + (actionPlan.length > 0 ? 6 : 0)
    + (tabCount > 0 ? 4 : 0),
  );
  const creativeScore = clampScore(
    28
    + (publicUseCount * 16)
    + (families.length * 6)
    + (tabCount > 0 ? 14 : 0)
    + (uses.length >= 3 ? 8 : 0),
  );
  const stabilityScore = clampScore(
    92
    - (publicUseCount * 9)
    - (tabCount > 0 ? 10 : 0)
    - Math.max(0, actionPlan.length - 2) * 4
    + (hasCollectionBinding ? 4 : -12),
  );
  const score = clampScore(
    (semanticScore * 0.45)
    + (creativeScore * 0.35)
    + (stabilityScore * 0.2)
    + (hasExplicitAnchor ? 6 : 0),
  );
  return {
    semanticScore,
    creativeScore,
    stabilityScore,
    score,
  };
}

function buildCreativeLayoutCandidate({
  candidateId,
  title,
  summary,
  layout,
  selectionMode,
  primaryBlockDefinition,
  collectionMeta,
  requestedFields,
  resolvedFields,
  selectionRationale,
  planningStatus,
  planningBlockers,
  shape,
  publicUseCatalog,
  operationIntent,
  explicitAnchorUse,
  selected = false,
}) {
  const families = collectCandidateFamiliesFromLayout(layout, publicUseCatalog);
  const scoreSummary = buildCandidateScoreSummary({
    layout,
    families,
    collectionMeta,
    operationIntent,
    explicitAnchorUse,
  });
  return buildLayoutCandidate({
    candidateId,
    score: scoreSummary.score,
    semanticScore: scoreSummary.semanticScore,
    creativeScore: scoreSummary.creativeScore,
    stabilityScore: scoreSummary.stabilityScore,
    title,
    summary,
    layout,
    selectionMode,
    primaryBlockDefinition,
    collectionMeta,
    requestedFields,
    resolvedFields,
    selectionRationale,
    planningStatus,
    planningBlockers,
    shape,
    families,
    selected,
  });
}

function humanizeFieldLabel(fieldName) {
  const normalized = normalizeText(fieldName);
  if (!normalized) {
    return '';
  }
  return normalized
    .replaceAll('.', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function findPrimaryPopupActionConfig(layout, popupAction) {
  if (!popupAction?.label) {
    return null;
  }
  const visitBlocks = (blocks, scope = 'block-actions') => {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      const scopedActions = [
        ...((Array.isArray(block.actions) ? block.actions : []).map((action) => ({ action, scope: block.kind === 'Details' ? 'details-actions' : 'block-actions' }))),
        ...((Array.isArray(block.rowActions) ? block.rowActions : []).map((action) => ({ action, scope: 'row-actions' }))),
      ];
      for (const { action, scope: actionScope } of scopedActions) {
        if (!action || typeof action !== 'object') {
          continue;
        }
        if (normalizeText(action.label) === popupAction.label && normalizeText(action.kind) === popupAction.kind && actionScope === popupAction.scope) {
          return action;
        }
      }
      const nested = visitBlocks(block.blocks, scope);
      if (nested) {
        return nested;
      }
      for (const action of [...(Array.isArray(block.actions) ? block.actions : []), ...(Array.isArray(block.rowActions) ? block.rowActions : [])]) {
        const nestedPopup = visitBlocks(action?.popup?.blocks || [], 'block-actions');
        if (nestedPopup) {
          return nestedPopup;
        }
      }
    }
    return null;
  };

  const direct = visitBlocks(layout.blocks);
  if (direct) {
    return direct;
  }
  for (const tab of Array.isArray(layout.tabs) ? layout.tabs : []) {
    const nested = visitBlocks(tab.blocks);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function collectPopupAssertionValues(actionConfig) {
  const popupBlocks = Array.isArray(actionConfig?.popup?.blocks) ? actionConfig.popup.blocks : [];
  const primaryBlock = popupBlocks.find((block) => (
    block
    && typeof block === 'object'
    && Array.isArray(block.fields)
    && block.fields.length > 0
    && (block.kind === 'Details' || block.kind === 'Form' || block.kind === 'Table')
  )) || null;
  if (!primaryBlock) {
    return [];
  }
  return uniqueStrings(
    primaryBlock.fields
      .slice(0, 2)
      .flatMap((fieldName) => [normalizeText(fieldName), humanizeFieldLabel(fieldName)]),
  );
}

function buildVerifySpecInput({ title, layout, actionPlan, planningStatus }) {
  const primaryTexts = [title];
  const firstVisibleBlock = Array.isArray(layout.blocks) && layout.blocks.length > 0
    ? layout.blocks[0]
    : (Array.isArray(layout.tabs) && layout.tabs[0]?.blocks?.[0] ? layout.tabs[0].blocks[0] : null);
  if (firstVisibleBlock?.title) {
    primaryTexts.push(firstVisibleBlock.title);
  }

  const preOpen = {
    assertions: [
      {
        kind: 'bodyTextIncludesAll',
        values: uniqueStrings(primaryTexts),
        severity: planningStatus === 'blocked' ? 'warning' : 'blocking',
      },
    ],
  };

  const stages = [];
  (Array.isArray(layout.tabs) ? layout.tabs : []).forEach((tab, index) => {
    stages.push({
      id: `tab-${index + 1}`,
      title: `${tab.title} 标签`,
      trigger: { kind: 'click-tab', text: tab.title },
      waitFor: { kind: 'bodyTextIncludesAll', values: [tab.title] },
    });
  });

  const popupAction = actionPlan.find((item) => item.kind !== 'delete-record' && item.popupBlockKinds.length > 0);
  if (popupAction?.label) {
    const waitText = popupAction.popupBlockKinds[0].replace(/Model$/, '');
    const popupActionConfig = findPrimaryPopupActionConfig(layout, popupAction);
    const popupAssertionValues = collectPopupAssertionValues(popupActionConfig);
    stages.push({
      id: 'primary-action',
      title: popupAction.label,
      trigger: {
        kind: popupAction.scope === 'row-actions' ? 'click-row-action' : 'click-action',
        text: popupAction.label,
      },
      waitFor: { kind: 'bodyTextIncludesAll', values: [waitText] },
      assertions: popupAssertionValues.length > 0
        ? [
          {
            kind: 'bodyTextIncludesAny',
            label: 'popup content should render at least one field label',
            severity: 'blocking',
            values: popupAssertionValues,
          },
        ]
        : [],
    });
  }

  return {
    preOpen,
    stages,
  };
}

function buildScenarioSummary({
  title,
  planningMode,
  selectionMode,
  collectionMeta,
  explicitCollections,
  primaryCollectionExplicit,
  primaryBlockDefinition,
  layout,
  inventoryMerge,
  requestedFields,
  resolvedFields,
  actionPlan,
  planningStatus,
  planningBlockers,
  maxNestingDepth,
  creativeProgram,
  layoutCandidates,
  selectedCandidateId,
  eligibleUses = [],
  discardedUses = [],
}) {
  const effectivePrimaryBlock = primaryBlockDefinition || {
    use: '',
    archetypeId: 'unresolved-primary',
    archetypeLabel: '未解析主块',
  };
  const collectionLabel = collectionMeta ? humanizeCollectionTitle(collectionMeta) : '无集合';
  const coverage = buildCoverageFromLayout(layout);
  const candidateScores = Object.fromEntries(
    (Array.isArray(layoutCandidates) ? layoutCandidates : []).map((candidate) => [
      candidate.candidateId,
      {
        score: Number.isFinite(candidate.score) ? candidate.score : null,
        semanticScore: Number.isFinite(candidate.semanticScore) ? candidate.semanticScore : null,
        creativeScore: Number.isFinite(candidate.creativeScore) ? candidate.creativeScore : null,
        stabilityScore: Number.isFinite(candidate.stabilityScore) ? candidate.stabilityScore : null,
      },
    ]),
  );
  const candidateFamilies = Object.fromEntries(
    (Array.isArray(layoutCandidates) ? layoutCandidates : []).map((candidate) => [
      candidate.candidateId,
      uniqueStrings(candidate.families),
    ]),
  );
  const candidateShape = Object.fromEntries(
    (Array.isArray(layoutCandidates) ? layoutCandidates : []).map((candidate) => [
      candidate.candidateId,
      normalizeText(candidate.shape),
    ]),
  );
  const scenarioId = [
    planningMode || selectionMode,
    collectionMeta?.name || 'no-collection',
    selectedCandidateId || effectivePrimaryBlock.archetypeId,
  ].join(':');
  const selectionRationale = [
    planningMode === 'creative-first'
      ? '创意优先：先在全部可稳定落库的区块里生成候选，再按语义与创意平衡选主方案。'
      : `${selectionMode === 'collection-first' ? '显式集合优先' : '意图优先'}：优先锁定 collection 与字段，再规划区块和操作。`,
    collectionMeta
      ? `主集合锁定为 ${collectionMeta.name}，展示名 ${collectionLabel}。`
      : '当前页面不依赖显式 collection，可直接使用公开 root block。',
    requestedFields.length > 0
      ? `请求显式提到字段：${requestedFields.join(', ')}。`
      : '请求没有显式字段，已按 live metadata 选择默认字段。',
    resolvedFields.length > 0
      ? `最终字段：${resolvedFields.join(', ')}。`
      : '当前布局不需要字段绑定。',
    actionPlan.length > 0
      ? `已规划 ${actionPlan.length} 个操作节点，默认允许最多 ${maxNestingDepth} 层 popup/page 递归。`
      : '当前布局未规划额外操作节点。',
    eligibleUses.length > 0
      ? `可进入候选池的业务区块：${eligibleUses.join(', ')}。`
      : '当前没有可进入候选池的业务区块。',
    discardedUses.length > 0
      ? `已丢弃 ${discardedUses.length} 个 runtime-sensitive 区块：${discardedUses.map((item) => item.use).join(', ')}。`
      : '没有命中 runtime-sensitive discarded uses。',
    ...(inventoryMerge.instanceInventory.flowSchema.detected
      ? [`实例公开 root blocks: ${inventoryMerge.instanceInventory.flowSchema.rootPublicUses.join(', ')}`]
      : []),
    ...(inventoryMerge.sourceInventory.detected
      ? [`源码 inventory: ${inventoryMerge.sourceInventory.repoRoot}`]
      : []),
    ...(planningBlockers.length > 0
      ? planningBlockers.map((item) => `${item.code}: ${item.message}`)
      : []),
  ];

  return {
    id: scenarioId,
    title,
    summary: `${collectionLabel} / ${effectivePrimaryBlock.archetypeLabel}`,
    domainId: '',
    domainLabel: '',
    archetypeId: effectivePrimaryBlock.archetypeId,
    archetypeLabel: effectivePrimaryBlock.archetypeLabel,
    tier: planningMode === 'creative-first'
      ? 'creative-first'
      : (selectionMode === 'dynamic-exploration' ? 'dynamic-exploration' : 'deterministic-intent'),
    expectedOutcome: planningStatus === 'blocked' ? 'blocker-expected' : 'pass',
    requestedSignals: uniqueStrings([title, collectionMeta?.name || '', ...requestedFields]).slice(0, 8),
    selectionRationale: uniqueStrings(selectionRationale),
    availableUses: inventoryMerge.availableUses,
    eligibleUses: uniqueStrings(eligibleUses),
    discardedUses: Array.isArray(discardedUses) ? discardedUses.map((item) => ({
      use: normalizeText(item.use),
      title: normalizeText(item.title),
      contextRequirements: uniqueStrings(item.contextRequirements),
      unresolvedReasons: uniqueStrings(item.unresolvedReasons),
      families: uniqueStrings(item.families),
    })) : [],
    plannedCoverage: coverage,
    creativeProgram,
    layoutCandidates,
    selectedCandidateId,
    candidateScores,
    candidateFamilies,
    candidateShape,
    sourceInventory: inventoryMerge.sourceInventory,
    instanceInventory: inventoryMerge.instanceInventory,
    randomPolicy: {
      mode: 'deterministic',
      seed: '',
      seedSource: 'none',
      sessionId: '',
      candidatePageUrl: '',
    },
    planningMode: planningMode || DEFAULT_PLANNING_MODE,
    selectionMode,
    plannerVersion: 'primitive-first-v3',
    targetCollections: collectionMeta ? [collectionMeta.name] : [],
    explicitCollections: sortUniqueStrings(explicitCollections),
    primaryCollectionExplicit: primaryCollectionExplicit === true,
    requestedFields,
    resolvedFields,
    primaryBlockType: effectivePrimaryBlock.use,
    actionPlan,
    planningStatus,
    planningBlockers,
    maxNestingDepth,
  };
}

function buildStableFirstValidationScenario({
  caseRequest,
  sessionId,
  baseSlug,
  candidatePageUrl,
  instanceInventory,
} = {}) {
  const requestText = normalizeText(caseRequest);
  const baseSlugText = normalizeText(baseSlug);
  const explicitTitle = extractQuotedTitle(requestText);
  const inventoryMerge = mergeAvailableUsesWithInventories({
    baseUses: BASE_AVAILABLE_USES,
    instanceInventory,
  });
  const matchedPrimaryBlockDefinition = pickPrimaryBlockDefinition(requestText, inventoryMerge.availableUses);
  const collectionResolution = resolvePrimaryCollection({
    requestText,
    baseSlug: baseSlugText,
    collectionsInventory: inventoryMerge.instanceInventory.collections,
    primaryBlockDefinition: matchedPrimaryBlockDefinition || findPrimaryBlockDefinitionByUse('TableBlockModel'),
  });
  const explicitCollectionMatches = collectExplicitCollectionMatches(requestText, inventoryMerge.instanceInventory.collections);
  const explicitCollectionNames = explicitCollectionMatches.map((item) => item.name);
  const explicitCollectionRequested = explicitCollectionMatches.length > 0;
  let selectionMode = explicitCollectionRequested ? 'collection-first' : collectionResolution.selectionMode;
  let primaryBlockDefinition = matchedPrimaryBlockDefinition;
  const collectionMeta = collectionResolution.collectionMeta;
  const explorationDefinitions = rankExplorationDefinitions(requestText, PRIMARY_BLOCK_DEFINITIONS
    .filter((entry) => !entry.collectionRequired)
    .filter((entry) => entry.use === 'TableBlockModel'
      || entry.use === 'DetailsBlockModel'
      || entry.use === 'CreateFormModel'
      || entry.use === 'EditFormModel'
      || inventoryMerge.availableUses.includes(entry.use)), inventoryMerge.publicUseCatalog);

  if (!primaryBlockDefinition && collectionMeta) {
    primaryBlockDefinition = findPrimaryBlockDefinitionByUse('TableBlockModel');
    selectionMode = 'collection-first';
  } else if (!primaryBlockDefinition && explorationDefinitions.length >= 2) {
    primaryBlockDefinition = explorationDefinitions[0];
    selectionMode = 'dynamic-exploration';
  } else if (!primaryBlockDefinition) {
    selectionMode = 'dynamic-exploration';
  }

  const planningBlockers = [];
  const catalogBlockerUses = selectionMode === 'dynamic-exploration'
    ? new Set(uniqueStrings([
      primaryBlockDefinition?.kind === 'public-use' ? primaryBlockDefinition.use : '',
      ...findExplicitPublicUses(requestText, inventoryMerge.availableUses, primaryBlockDefinition?.use || ''),
    ]))
    : new Set();
  planningBlockers.push(...collectCatalogPlanningBlockers(requestText, inventoryMerge.publicUseCatalog, {
    limitedUses: catalogBlockerUses,
  }));
  if (!primaryBlockDefinition) {
    planningBlockers.push(makePlanningBlocker(
      'PRIMARY_BLOCK_UNRESOLVED',
      '当前请求既没有解析出稳定的 collection-first 主块，也没有足够的公开 root block 候选进入 dynamic-exploration。',
      {
        requestedText: requestText,
        availableUses: inventoryMerge.availableUses,
      },
    ));
  }
  if (primaryBlockDefinition?.collectionRequired && !collectionResolution.collectionMeta) {
    planningBlockers.push(makePlanningBlocker(
      'PRIMARY_COLLECTION_UNRESOLVED',
      `当前请求需要为主块 ${primaryBlockDefinition.use} 解析 collection，但 live inventory 未找到可用集合。`,
      {
        primaryBlockType: primaryBlockDefinition.use,
        requestedText: requestText,
      },
    ));
  }

  if (
    primaryBlockDefinition?.kind === 'public-use'
    && !inventoryMerge.availableUses.includes(primaryBlockDefinition.use)
  ) {
    planningBlockers.push(makePlanningBlocker(
      'PRIMARY_PUBLIC_USE_UNAVAILABLE',
      `实例当前未公开 ${primaryBlockDefinition.use}，不能把它作为主块。`,
      {
        primaryBlockType: primaryBlockDefinition.use,
      },
    ));
  }

  const fieldResolution = collectionMeta
    ? resolveFieldsForCollection(requestText, collectionMeta)
    : { requestedFields: [], resolvedFields: [] };

  if (collectionMeta && fieldResolution.requestedFields.length > 0 && fieldResolution.resolvedFields.length === 0) {
    planningBlockers.push(makePlanningBlocker(
      'REQUESTED_FIELDS_UNRESOLVED',
      `请求中显式提到了字段，但 ${collectionMeta.name} 的 live metadata 未解析到对应字段。`,
      {
        collectionName: collectionMeta.name,
      },
    ));
  }

  const operationIntent = resolveOperationIntent(requestText, primaryBlockDefinition?.use || '');
  if (operationIntent.requestedFilter && !collectionMeta) {
    planningBlockers.push(makePlanningBlocker(
      'FILTER_COLLECTION_UNRESOLVED',
      '请求显式要求筛选区块，但当前没有可绑定的 collection，无法稳定规划 FilterFormBlockModel。',
      {
        requestedText: requestText,
      },
    ));
  }
  const filterFields = collectionMeta ? resolveFilterFields(collectionMeta, fieldResolution) : [];
  if (operationIntent.requestedFilter && collectionMeta && filterFields.length === 0) {
    planningBlockers.push(makePlanningBlocker(
      'FILTER_FIELDS_UNRESOLVED',
      `请求显式要求筛选区块，但 ${collectionMeta.name} 没有可用的标量字段可做筛选项。`,
      {
        collectionName: collectionMeta.name,
      },
    ));
  }
  const explicitPublicUses = findExplicitPublicUses(
    requestText,
    inventoryMerge.availableUses,
    primaryBlockDefinition?.use || '',
  );
  const maxNestingDepth = 3;
  const title = explicitTitle || (
    collectionMeta
      ? `${humanizeCollectionTitle(collectionMeta)} ${primaryBlockDefinition?.titleSuffix || '工作台'}`
      : `Validation ${primaryBlockDefinition?.titleSuffix || 'workspace'}`
  );
  const filterBlock = planningBlockers.length === 0 && operationIntent.requestedFilter && collectionMeta
    ? buildFilterBlock({
      title: `${humanizeCollectionTitle(collectionMeta)}筛选`,
      collectionName: collectionMeta.name,
      fields: filterFields,
    })
    : null;
  const alternatePrimaryDefinitions = selectionMode === 'dynamic-exploration'
    ? explorationDefinitions.filter((entry) => entry.use !== primaryBlockDefinition?.use)
    : [
      findPrimaryBlockDefinitionByUse('TableBlockModel'),
      findPrimaryBlockDefinitionByUse('DetailsBlockModel'),
      findPrimaryBlockDefinitionByUse('CreateFormModel'),
    ]
      .filter(Boolean)
      .filter((entry, index, items) => items.findIndex((candidate) => candidate.use === entry.use) === index)
      .filter((entry) => entry.use !== primaryBlockDefinition?.use)
      .filter((entry) => !entry.collectionRequired || Boolean(collectionMeta));
  const planningStatus = planningBlockers.length > 0 ? 'blocked' : 'ready';
  const layoutCandidates = planningStatus === 'ready'
    ? buildLayoutCandidates({
      title,
      selectionMode,
      collectionMeta,
      requestedFields: fieldResolution.requestedFields,
      resolvedFields: fieldResolution.resolvedFields,
      primaryBlockDefinition,
      alternatePrimaryDefinitions,
      operationIntent,
      availableUses: inventoryMerge.availableUses,
      explicitPublicUses,
      maxNestingDepth,
      filterBlock,
      planningStatus,
      planningBlockers,
    })
    : [];
  const selectedCandidate = layoutCandidates.find((item) => item.selected) || layoutCandidates[0] || null;
  if (!selectedCandidate && planningStatus === 'ready') {
    planningBlockers.push(makePlanningBlocker(
      'PRIMARY_LAYOUT_CANDIDATE_MISSING',
      `当前请求解析出了主块 ${primaryBlockDefinition.use}，但没有生成可落库的 layout candidate。`,
      {
        primaryBlockType: primaryBlockDefinition.use,
      },
    ));
  }
  const finalPlanningStatus = planningBlockers.length > 0 ? 'blocked' : 'ready';
  const layout = selectedCandidate?.layout || {
    pageUse: 'RootPageModel',
    blocks: [],
    tabs: [],
  };
  const actionPlan = selectedCandidate?.actionPlan || collectActionPlan(layout);
  const creativeProgram = createCreativeProgram({
    planningMode: 'stable-first',
    selectionMode,
    operationIntent,
    inventoryMerge,
    collectionMeta,
  });
  const scenario = buildScenarioSummary({
    title,
    planningMode: 'stable-first',
    selectionMode,
    collectionMeta,
    explicitCollections: explicitCollectionNames,
    primaryCollectionExplicit: explicitCollectionRequested,
    primaryBlockDefinition,
    layout,
    inventoryMerge,
    requestedFields: fieldResolution.requestedFields,
    resolvedFields: fieldResolution.resolvedFields,
    actionPlan,
    planningStatus: finalPlanningStatus,
    planningBlockers,
    maxNestingDepth,
    creativeProgram,
    layoutCandidates,
    selectedCandidateId: selectedCandidate?.candidateId || '',
    eligibleUses: uniqueStrings([
      ...inventoryMerge.availableUses.filter(isBusinessUse),
      ...STABLE_BUSINESS_BLOCK_USES,
    ]),
    discardedUses: [],
  });
  scenario.randomPolicy.sessionId = normalizeText(sessionId);
  scenario.randomPolicy.candidatePageUrl = normalizeText(candidatePageUrl);

  return {
    scenario,
    buildSpecInput: {
      target: {
        title,
      },
      layout,
      dataBindings: {
        collections: collectionMeta ? [collectionMeta.name] : [],
        relations: [],
      },
      requirements: {
        metadataTrust: 'unknown',
      },
      options: {
        compileMode: 'primitive-tree',
        allowLegacyFallback: false,
      },
    },
    verifySpecInput: buildVerifySpecInput({
      title,
      layout,
      actionPlan,
      planningStatus: finalPlanningStatus,
    }),
  };
}

function buildCreativeRecipeCandidates({
  title,
  collectionMeta,
  requestedFields,
  resolvedFields,
  operationIntent,
  filterBlock,
  planningStatus,
  planningBlockers,
  inventoryMerge,
  eligibleDescriptors,
  anchorDescriptor,
  explicitAnchorUse,
}) {
  const publicUseCatalog = inventoryMerge.publicUseCatalog;
  const availableUses = inventoryMerge.availableUses;
  const collectionDefinition = pickDescriptorByPredicate(
    eligibleDescriptors,
    (descriptor) => descriptor.collectionRequired && descriptor.use !== 'FilterFormBlockModel',
  ) || buildUseDescriptor('TableBlockModel', publicUseCatalog);
  const detailsDefinition = buildUseDescriptor('DetailsBlockModel', publicUseCatalog);
  const formDefinition = buildUseDescriptor('CreateFormModel', publicUseCatalog);
  const contentDefinition = pickDescriptorByPredicate(
    eligibleDescriptors,
    (descriptor) => descriptor.use !== anchorDescriptor?.use && descriptor.families.some((family) => ['content', 'docs', 'custom', 'template'].includes(family)),
    [collectionDefinition?.use],
  ) || pickDescriptorByPredicate(
    eligibleDescriptors,
    (descriptor) => descriptor.use !== anchorDescriptor?.use && descriptor.use !== collectionDefinition?.use,
  ) || anchorDescriptor || collectionDefinition;
  const visualDefinition = pickDescriptorByPredicate(
    eligibleDescriptors,
    (descriptor) => descriptor.use !== anchorDescriptor?.use && descriptor.families.some((family) => ['analytics', 'metrics', 'geo', 'feed'].includes(family)),
    [collectionDefinition?.use, contentDefinition?.use],
  ) || pickDescriptorByPredicate(
    eligibleDescriptors,
    (descriptor) => descriptor.use !== anchorDescriptor?.use,
    [collectionDefinition?.use, contentDefinition?.use],
  ) || anchorDescriptor || collectionDefinition;
  const supportPublicDefinition = pickDescriptorByPredicate(
    eligibleDescriptors,
    (descriptor) => !descriptor.collectionRequired && ![
      anchorDescriptor?.use,
      contentDefinition?.use,
      visualDefinition?.use,
    ].includes(descriptor.use),
  );

  const buildBlock = (descriptor, fields = resolvedFields) => {
    if (!descriptor) {
      return null;
    }
    return buildPrimaryBlock({
      primaryBlockDefinition: descriptor,
      collectionMeta,
      fields,
      operationIntent,
      availableUses,
      depth: 0,
      maxDepth: 3,
    });
  };

  const collectionFallbackBlock = buildBlock(collectionDefinition, resolvedFields);
  const anchorBlock = buildBlock(anchorDescriptor, resolvedFields);
  const contentBlock = buildBlock(contentDefinition, resolvedFields);
  const visualBlock = buildBlock(visualDefinition, resolvedFields);
  const supportPublicBlock = buildBlock(supportPublicDefinition, resolvedFields);
  const detailsBlock = buildBlock(detailsDefinition, resolvedFields);
  const formBlock = buildBlock(formDefinition, resolvedFields);
  const supportTableBlock = collectionMeta
    ? buildCompanionTable({
      collectionMeta,
      fields: resolvedFields,
      operationIntent,
      depth: 0,
      maxDepth: 3,
    })
    : null;

  const candidates = [
    {
      candidateId: 'keyword-anchor',
      shape: 'single-main',
      primaryDefinition: anchorDescriptor || collectionDefinition,
      selectionRationale: uniqueStrings([
        explicitAnchorUse
          ? `请求显式命中了 ${explicitAnchorUse}，先把它作为 anchor 主块。`
          : '未命中显式 block 关键词时，按语义与创意优先级选择 anchor 主块。',
        collectionMeta && anchorDescriptor && !anchorDescriptor.collectionRequired
          ? '主块不是 collection block，已自动补一个 collection-bound 业务块保证可落库。'
          : '',
      ]),
      layout: finalizeCreativeLayout({
        filterBlock,
        blocks: [anchorBlock],
        collectionMeta,
        collectionFallbackBlock: supportTableBlock || collectionFallbackBlock,
      }),
      title,
      summary: `${normalizeText(title)} / 关键词锚点方案`,
    },
    {
      candidateId: 'content-control',
      shape: 'single-main',
      primaryDefinition: contentDefinition || anchorDescriptor || collectionDefinition,
      selectionRationale: uniqueStrings([
        '内容/控制型单主块候选，优先给页面一个更鲜明的视觉重心。',
        collectionMeta && contentDefinition && !contentDefinition.collectionRequired
          ? '显式 collection 请求下补充 collection-bound 业务块，避免只有内容块。'
          : '',
      ]),
      layout: finalizeCreativeLayout({
        filterBlock,
        blocks: [contentBlock],
        collectionMeta,
        collectionFallbackBlock: detailsBlock || supportTableBlock || collectionFallbackBlock,
      }),
      title: `${title} 内容控制`,
      summary: `${normalizeText(title)} / 单主块内容控制`,
    },
    {
      candidateId: 'collection-workbench',
      shape: 'multi-block',
      primaryDefinition: collectionDefinition,
      selectionRationale: [
        '围绕 collection 组织成工作台，保留业务主块，同时补操作或说明区块。',
      ],
      layout: finalizeCreativeLayout({
        filterBlock,
        blocks: [
          collectionFallbackBlock,
          detailsBlock || formBlock,
          supportPublicBlock,
        ],
        collectionMeta,
        collectionFallbackBlock,
      }),
      title: `${title} 工作台`,
      summary: `${normalizeText(title)} / collection workbench`,
    },
    {
      candidateId: 'analytics-mix',
      shape: 'multi-block',
      primaryDefinition: visualDefinition || anchorDescriptor || collectionDefinition,
      selectionRationale: [
        '用分析/指标/可视化区块拉开页面调性，再用 collection 业务块托底。',
      ],
      layout: finalizeCreativeLayout({
        filterBlock,
        blocks: [
          visualBlock,
          supportTableBlock || collectionFallbackBlock,
          supportPublicBlock,
        ],
        collectionMeta,
        collectionFallbackBlock: supportTableBlock || collectionFallbackBlock,
      }),
      title: `${title} 分析混合`,
      summary: `${normalizeText(title)} / analytics mix`,
    },
    {
      candidateId: 'tabbed-multi-surface',
      shape: 'tabbed-multi-surface',
      primaryDefinition: anchorDescriptor || collectionDefinition,
      selectionRationale: [
        '把主视图、记录面和控制面拆到 tabs，优先追求结构层次与可探索性。',
      ],
      layout: finalizeCreativeLayout({
        filterBlock,
        blocks: [],
        tabs: [
          {
            title: '主视图',
            blocks: [anchorBlock || visualBlock].filter(Boolean).map((block) => cloneJson(block)),
          },
          {
            title: '记录面',
            blocks: [supportTableBlock || collectionFallbackBlock].filter(Boolean).map((block) => cloneJson(block)),
          },
          {
            title: '控制面',
            blocks: [contentBlock || detailsBlock || formBlock].filter(Boolean).map((block) => cloneJson(block)),
          },
        ],
        collectionMeta,
        collectionFallbackBlock: supportTableBlock || collectionFallbackBlock,
      }),
      title: `${title} 多界面`,
      summary: `${normalizeText(title)} / tabbed multi surface`,
    },
  ];

  return candidates.map((candidate) => buildCreativeLayoutCandidate({
    candidateId: candidate.candidateId,
    title: candidate.title,
    summary: candidate.summary,
    layout: candidate.layout,
    selectionMode: 'creative-first',
    primaryBlockDefinition: candidate.primaryDefinition || anchorDescriptor || collectionDefinition,
    collectionMeta,
    requestedFields,
    resolvedFields,
    selectionRationale: candidate.selectionRationale,
    planningStatus,
    planningBlockers,
    shape: candidate.shape,
    publicUseCatalog,
    operationIntent,
    explicitAnchorUse,
    selected: false,
  }));
}

function buildCreativeFirstValidationScenario({
  caseRequest,
  sessionId,
  baseSlug,
  candidatePageUrl,
  instanceInventory,
} = {}) {
  const requestText = normalizeText(caseRequest);
  const baseSlugText = normalizeText(baseSlug);
  const explicitTitle = extractQuotedTitle(requestText);
  const inventoryMerge = mergeAvailableUsesWithInventories({
    baseUses: BASE_AVAILABLE_USES,
    instanceInventory,
  });
  const explicitCollectionMatches = collectExplicitCollectionMatches(requestText, inventoryMerge.instanceInventory.collections);
  const explicitCollectionNames = explicitCollectionMatches.map((item) => item.name);
  const explicitCollectionRequested = explicitCollectionMatches.length > 0;
  const collectionResolution = resolvePrimaryCollection({
    requestText,
    baseSlug: baseSlugText,
    collectionsInventory: inventoryMerge.instanceInventory.collections,
    primaryBlockDefinition: findPrimaryBlockDefinitionByUse('TableBlockModel'),
  });
  const collectionMeta = collectionResolution.collectionMeta;
  const fieldResolution = collectionMeta
    ? resolveFieldsForCollection(requestText, collectionMeta)
    : { requestedFields: [], resolvedFields: [] };
  const operationIntent = resolveOperationIntent(requestText, '');
  const { eligibleDescriptors, eligibleUses, discardedUses } = buildCreativeUseInventory({
    inventoryMerge,
    collectionMeta,
  });
  const anchorResolution = resolveCreativeAnchorDescriptor({
    requestText,
    eligibleDescriptors,
    publicUseCatalog: inventoryMerge.publicUseCatalog,
  });
  const anchorDescriptor = anchorResolution.descriptor;
  const explicitAnchorUse = anchorResolution.explicit ? anchorDescriptor?.use || '' : '';
  const planningBlockers = [];

  if (!anchorDescriptor) {
    planningBlockers.push(makePlanningBlocker(
      'PRIMARY_BLOCK_UNRESOLVED',
      'creative-first 未找到可稳定落库的 anchor 区块，无法生成候选布局。',
      {
        requestedText: requestText,
        eligibleUses,
        discardedUses: discardedUses.map((item) => item.use),
      },
    ));
  }

  if (collectionMeta && fieldResolution.requestedFields.length > 0 && fieldResolution.resolvedFields.length === 0) {
    planningBlockers.push(makePlanningBlocker(
      'REQUESTED_FIELDS_UNRESOLVED',
      `请求中显式提到了字段，但 ${collectionMeta.name} 的 live metadata 未解析到对应字段。`,
      {
        collectionName: collectionMeta.name,
      },
    ));
  }

  if (operationIntent.requestedFilter && !collectionMeta) {
    planningBlockers.push(makePlanningBlocker(
      'FILTER_COLLECTION_UNRESOLVED',
      '请求显式要求筛选区块，但当前没有可绑定的 collection，无法稳定规划 FilterFormBlockModel。',
      {
        requestedText: requestText,
      },
    ));
  }

  const filterFields = collectionMeta ? resolveFilterFields(collectionMeta, fieldResolution) : [];
  if (operationIntent.requestedFilter && collectionMeta && filterFields.length === 0) {
    planningBlockers.push(makePlanningBlocker(
      'FILTER_FIELDS_UNRESOLVED',
      `请求显式要求筛选区块，但 ${collectionMeta.name} 没有可用的标量字段可做筛选项。`,
      {
        collectionName: collectionMeta.name,
      },
    ));
  }

  const title = explicitTitle || (
    collectionMeta
      ? `${humanizeCollectionTitle(collectionMeta)} 创意工作台`
      : `Creative ${anchorDescriptor?.titleSuffix || 'workspace'}`
  );
  const filterBlock = planningBlockers.length === 0 && operationIntent.requestedFilter && collectionMeta
    ? buildFilterBlock({
      title: `${humanizeCollectionTitle(collectionMeta)}筛选`,
      collectionName: collectionMeta.name,
      fields: filterFields,
    })
    : null;
  const planningStatus = planningBlockers.length > 0 ? 'blocked' : 'ready';
  const layoutCandidates = planningStatus === 'ready'
    ? buildCreativeRecipeCandidates({
      title,
      collectionMeta,
      requestedFields: fieldResolution.requestedFields,
      resolvedFields: fieldResolution.resolvedFields,
      operationIntent,
      filterBlock,
      planningStatus,
      planningBlockers,
      inventoryMerge,
      eligibleDescriptors,
      anchorDescriptor,
      explicitAnchorUse,
    }).slice(0, 5)
    : [];

  const selectedCandidatePool = explicitAnchorUse
    ? layoutCandidates.filter((candidate) => collectLayoutUses(candidate.layout).includes(explicitAnchorUse))
    : layoutCandidates;
  const selectedCandidate = [...selectedCandidatePool]
    .sort((left, right) => {
      if ((right.score || 0) !== (left.score || 0)) {
        return (right.score || 0) - (left.score || 0);
      }
      return left.candidateId.localeCompare(right.candidateId);
    })[0] || null;
  const normalizedLayoutCandidates = layoutCandidates.map((candidate) => ({
    ...candidate,
    selected: Boolean(selectedCandidate && candidate.candidateId === selectedCandidate.candidateId),
  }));
  const finalPrimaryDefinition = buildPrimaryBlockDefinition(
    selectedCandidate?.primaryBlockType || anchorDescriptor?.use || '',
    inventoryMerge.publicUseCatalog,
  ) || anchorDescriptor || buildPrimaryBlockDefinition('TableBlockModel', inventoryMerge.publicUseCatalog);
  const layout = selectedCandidate?.layout || {
    pageUse: 'RootPageModel',
    blocks: [],
    tabs: [],
  };
  const actionPlan = selectedCandidate?.actionPlan || collectActionPlan(layout);
  const creativeProgram = createCreativeProgram({
    planningMode: 'creative-first',
    selectionMode: 'creative-first',
    operationIntent,
    inventoryMerge,
    collectionMeta,
  });
  const scenario = buildScenarioSummary({
    title,
    planningMode: 'creative-first',
    selectionMode: 'creative-first',
    collectionMeta,
    explicitCollections: explicitCollectionNames,
    primaryCollectionExplicit: explicitCollectionRequested,
    primaryBlockDefinition: finalPrimaryDefinition,
    layout,
    inventoryMerge,
    requestedFields: fieldResolution.requestedFields,
    resolvedFields: fieldResolution.resolvedFields,
    actionPlan,
    planningStatus,
    planningBlockers,
    maxNestingDepth: 3,
    creativeProgram,
    layoutCandidates: normalizedLayoutCandidates,
    selectedCandidateId: selectedCandidate?.candidateId || '',
    eligibleUses,
    discardedUses,
  });
  scenario.randomPolicy.sessionId = normalizeText(sessionId);
  scenario.randomPolicy.candidatePageUrl = normalizeText(candidatePageUrl);

  return {
    scenario,
    buildSpecInput: {
      target: {
        title,
      },
      layout,
      dataBindings: {
        collections: collectionMeta ? [collectionMeta.name] : [],
        relations: [],
      },
      requirements: {
        metadataTrust: 'unknown',
      },
      options: {
        compileMode: 'primitive-tree',
        allowLegacyFallback: false,
      },
    },
    verifySpecInput: buildVerifySpecInput({
      title,
      layout,
      actionPlan,
      planningStatus,
    }),
  };
}

export function buildDynamicValidationScenario({
  planningMode = DEFAULT_PLANNING_MODE,
  ...input
} = {}) {
  const normalizedPlanningMode = normalizePlanningMode(planningMode, DEFAULT_PLANNING_MODE);
  if (normalizedPlanningMode === 'stable-first') {
    return buildStableFirstValidationScenario(input);
  }
  return buildCreativeFirstValidationScenario(input);
}
