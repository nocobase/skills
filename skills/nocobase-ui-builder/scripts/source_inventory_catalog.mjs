#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

// Do not assume nocobase source code exists on the machine running the skill.
// Source scanning is only enabled when repoRoot / NOCOBASE_SOURCE_ROOT is provided.
export const DEFAULT_NOCOBASE_SOURCE_ROOT = '';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function walkFiles(rootDir, visit) {
  if (!fileExists(rootDir)) {
    return;
  }
  const queue = [rootDir];
  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(nextPath);
        continue;
      }
      visit(nextPath);
    }
  }
}

function extractQuotedStrings(snippet) {
  const matches = [];
  const regex = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(snippet)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function collectArrayLiterals(content, pattern) {
  const values = [];
  let match;
  while ((match = pattern.exec(content)) !== null) {
    values.push(...extractQuotedStrings(match[1]));
  }
  return values;
}

function extractBalancedSegment(content, startIndex, openChar, closeChar) {
  if (typeof content !== 'string' || content[startIndex] !== openChar) {
    return '';
  }
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    const previous = content[index - 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      if (previous === '*' && char === '/') {
        inBlockComment = false;
      }
      continue;
    }
    if (inString) {
      if (char === stringChar && previous !== '\\') {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }
  return '';
}

function extractAssignedObjectSnippets(content) {
  const snippets = [];
  const assignmentPattern = /(const|export const)\s+[\w$]+(?:\s*:\s*[^=]+)?\s*=\s*\{/g;
  let match;
  while ((match = assignmentPattern.exec(content)) !== null) {
    const braceIndex = content.indexOf('{', match.index);
    if (braceIndex < 0) {
      continue;
    }
    const snippet = extractBalancedSegment(content, braceIndex, '{', '}');
    if (snippet) {
      snippets.push(snippet);
    }
  }
  return snippets;
}

function extractStringProperty(snippet, key) {
  const pattern = new RegExp(`(?:^|\\n)\\s*${key}\\s*:\\s*['"]([^'"]+)['"]`, 'm');
  const match = pattern.exec(snippet);
  return match ? match[1].trim() : '';
}

function extractArrayPropertySnippet(snippet, key) {
  const pattern = new RegExp(`${key}\\s*:\\s*\\[`, 'g');
  const match = pattern.exec(snippet);
  if (!match) {
    return '';
  }
  const bracketIndex = snippet.indexOf('[', match.index);
  if (bracketIndex < 0) {
    return '';
  }
  return extractBalancedSegment(snippet, bracketIndex, '[', ']');
}

function extractHintObjects(snippet) {
  const hintsSnippet = extractArrayPropertySnippet(snippet, 'dynamicHints');
  if (!hintsSnippet) {
    return [];
  }
  const objects = [];
  for (let index = 0; index < hintsSnippet.length; index += 1) {
    if (hintsSnippet[index] !== '{') {
      continue;
    }
    const objectSnippet = extractBalancedSegment(hintsSnippet, index, '{', '}');
    if (objectSnippet) {
      objects.push(objectSnippet);
      index += objectSnippet.length - 1;
    }
  }
  return objects;
}

function inferSemanticTags({ use, title, hintMessages, contextRequirements, unresolvedReasons }) {
  const text = [
    use,
    title,
    ...(Array.isArray(hintMessages) ? hintMessages : []),
    ...(Array.isArray(contextRequirements) ? contextRequirements : []),
    ...(Array.isArray(unresolvedReasons) ? unresolvedReasons : []),
  ].join(' ').toLowerCase();

  const tags = new Set();
  const maybeAdd = (tag, patterns) => {
    if (patterns.some((pattern) => text.includes(pattern))) {
      tags.add(tag);
    }
  };

  maybeAdd('analytics', ['chart', 'dashboard', 'sql', 'query', 'builder', 'trend', 'analytics']);
  maybeAdd('metrics', ['grid card', 'card', 'metric', 'kpi', 'overview']);
  maybeAdd('actions', ['action panel', 'action registry', 'actions depend', 'shortcut', 'todo', 'scan']);
  maybeAdd('docs', ['markdown', 'renderer', 'liquid variables', 'guide', 'help', 'instruction']);
  maybeAdd('collaboration', ['comment', 'discussion', 'collaboration']);
  maybeAdd('geo', ['map', 'marker', 'geolocation', 'location', 'association traversal']);
  maybeAdd('template', ['template', 'reference', 'targetuid', 'existing block uid']);
  maybeAdd('embed', ['iframe', 'html mode', 'external', 'url']);
  maybeAdd('feed', ['list block', 'list', 'sorting', 'filter condition', 'feed']);

  return [...tags].sort((left, right) => left.localeCompare(right));
}

function buildCatalogEntry({ use, title, filePath, hintObjects }) {
  const hintKinds = uniqueStrings(hintObjects.map((snippet) => extractStringProperty(snippet, 'kind')));
  const hintPaths = uniqueStrings(hintObjects.map((snippet) => extractStringProperty(snippet, 'path')));
  const hintMessages = uniqueStrings(hintObjects.map((snippet) => extractStringProperty(snippet, 'message')));
  const contextRequirements = uniqueStrings(
    hintObjects.flatMap((snippet) => collectArrayLiterals(snippet, /contextRequirements\s*:\s*\[([\s\S]*?)\]/g)),
  );
  const unresolvedReasons = uniqueStrings(
    hintObjects
      .map((snippet) => extractStringProperty(snippet, 'unresolvedReason'))
      .filter(Boolean),
  );
  const semanticTags = inferSemanticTags({
    use,
    title,
    hintMessages,
    contextRequirements,
    unresolvedReasons,
  });

  return {
    use,
    title,
    filePath,
    hintKinds,
    hintPaths,
    hintMessages,
    contextRequirements,
    unresolvedReasons,
    semanticTags,
  };
}

function mergeCatalogEntries(entries) {
  const merged = new Map();
  for (const entry of entries) {
    if (!entry?.use) {
      continue;
    }
    const existing = merged.get(entry.use);
    if (!existing) {
      merged.set(entry.use, cloneJson(entry));
      continue;
    }
    merged.set(entry.use, {
      use: entry.use,
      title: existing.title || entry.title,
      filePath: existing.filePath || entry.filePath,
      hintKinds: uniqueStrings([...existing.hintKinds, ...entry.hintKinds]),
      hintPaths: uniqueStrings([...existing.hintPaths, ...entry.hintPaths]),
      hintMessages: uniqueStrings([...existing.hintMessages, ...entry.hintMessages]),
      contextRequirements: uniqueStrings([...existing.contextRequirements, ...entry.contextRequirements]),
      unresolvedReasons: uniqueStrings([...existing.unresolvedReasons, ...entry.unresolvedReasons]),
      semanticTags: uniqueStrings([...existing.semanticTags, ...entry.semanticTags]),
    });
  }
  return [...merged.values()].sort((left, right) => left.use.localeCompare(right.use));
}

function extractManifestCatalogEntries(filePath, content, rootUsesSet) {
  const entries = [];
  for (const snippet of extractAssignedObjectSnippets(content)) {
    const use = extractStringProperty(snippet, 'use');
    if (!use || !rootUsesSet.has(use)) {
      continue;
    }
    entries.push(buildCatalogEntry({
      use,
      title: extractStringProperty(snippet, 'title'),
      filePath,
      hintObjects: extractHintObjects(snippet),
    }));
  }
  return entries;
}

const cache = new Map();

export function collectNocobaseSourceInventory({
  repoRoot = process.env.NOCOBASE_SOURCE_ROOT || DEFAULT_NOCOBASE_SOURCE_ROOT,
} = {}) {
  const normalizedRoot = normalizeText(repoRoot);
  if (!normalizedRoot) {
    return {
      repoRoot: '',
      detected: false,
      publicModels: [],
      publicTreeRoots: [],
      expectedDescendantModels: [],
      evidenceFiles: [],
      publicUseCatalog: [],
    };
  }

  const resolvedRoot = path.resolve(normalizedRoot);
  if (cache.has(resolvedRoot)) {
    return cache.get(resolvedRoot);
  }

  const pluginRoot = path.join(resolvedRoot, 'packages', 'plugins');
  const coreInventoryPath = path.join(
    resolvedRoot,
    'packages',
    'plugins',
    '@nocobase',
    'plugin-flow-engine',
    'src',
    'server',
    'flow-schema-manifests',
    'index.ts',
  );
  const coreSharedPath = path.join(
    resolvedRoot,
    'packages',
    'plugins',
    '@nocobase',
    'plugin-flow-engine',
    'src',
    'server',
    'flow-schema-manifests',
    'shared.ts',
  );

  const publicModels = [];
  const publicTreeRoots = [];
  const expectedDescendantModels = [];
  const evidenceFiles = [];

  if (fileExists(coreInventoryPath)) {
    const content = fs.readFileSync(coreInventoryPath, 'utf8');
    publicModels.push(...collectArrayLiterals(content, /const\s+publicFlowModelUses\s*=\s*\[([\s\S]*?)\];/g));
    expectedDescendantModels.push(...collectArrayLiterals(content, /const\s+coreDescendantModelUses\s*=\s*Array\.from\([\s\S]*?\[\s*([\s\S]*?)\s*\]\s*\)/g));
    evidenceFiles.push(coreInventoryPath);
  }
  if (fileExists(coreSharedPath)) {
    const content = fs.readFileSync(coreSharedPath, 'utf8');
    publicTreeRoots.push(...collectArrayLiterals(content, /export\s+const\s+publicBlockRootUses\s*=\s*\[([\s\S]*?)\];/g));
    evidenceFiles.push(coreSharedPath);
  }

  walkFiles(pluginRoot, (filePath) => {
    if (!filePath.includes(`${path.sep}flow-schema-manifests${path.sep}`) || !filePath.endsWith('.ts')) {
      return;
    }
    if (filePath.includes(`${path.sep}__tests__${path.sep}`)) {
      return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const filePublicModels = collectArrayLiterals(content, /publicModels\s*:\s*\[([\s\S]*?)\]/g);
    const filePublicTreeRoots = collectArrayLiterals(content, /publicTreeRoots\s*:\s*\[([\s\S]*?)\]/g);
    const fileExpectedDescendants = collectArrayLiterals(content, /expectedDescendantModels\s*:\s*\[([\s\S]*?)\]/g);
    if (filePublicModels.length > 0 || filePublicTreeRoots.length > 0 || fileExpectedDescendants.length > 0) {
      publicModels.push(...filePublicModels);
      publicTreeRoots.push(...filePublicTreeRoots);
      expectedDescendantModels.push(...fileExpectedDescendants);
      evidenceFiles.push(filePath);
    }
  });

  const rootUses = uniqueStrings(publicTreeRoots);
  const rootUsesSet = new Set(rootUses);
  const publicUseCatalog = [];

  walkFiles(pluginRoot, (filePath) => {
    if (!filePath.includes(`${path.sep}flow-schema-manifests${path.sep}`) || !filePath.endsWith('.ts')) {
      return;
    }
    if (filePath.includes(`${path.sep}__tests__${path.sep}`)) {
      return;
    }
    if (rootUsesSet.size === 0) {
      return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    publicUseCatalog.push(...extractManifestCatalogEntries(filePath, content, rootUsesSet));
  });

  const result = {
    repoRoot: resolvedRoot,
    detected: evidenceFiles.length > 0,
    publicModels: uniqueStrings(publicModels),
    publicTreeRoots: rootUses,
    expectedDescendantModels: uniqueStrings(expectedDescendantModels),
    evidenceFiles: uniqueStrings(evidenceFiles),
    publicUseCatalog: mergeCatalogEntries(publicUseCatalog),
  };
  cache.set(resolvedRoot, result);
  return result;
}
