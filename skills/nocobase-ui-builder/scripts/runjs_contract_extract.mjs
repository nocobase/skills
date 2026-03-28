#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_NOCOBASE_ROOT = path.join(os.homedir(), 'auto_works', 'nocobase');
export const DEFAULT_SNAPSHOT_PATH = path.join(__dirname, 'runjs_contract_snapshot.json');
export const RUNJS_CONTRACT_VERSION = 1;

const FLOW_CONTEXT_FILE = 'packages/core/flow-engine/src/flowContext.ts';
const SAFE_GLOBALS_FILE = 'packages/core/flow-engine/src/utils/safeGlobals.ts';
const RUNJS_SETUP_FILE = 'packages/core/flow-engine/src/runjs-context/setup.ts';
const RUNJS_BASE_CONTEXT_FILE = 'packages/core/flow-engine/src/runjs-context/contexts/base.ts';

const MODEL_CONTEXT_FILES = {
  JSBlockModel: 'packages/core/flow-engine/src/runjs-context/contexts/JSBlockRunJSContext.ts',
  JSFieldModel: 'packages/core/flow-engine/src/runjs-context/contexts/JSFieldRunJSContext.ts',
  JSEditableFieldModel: 'packages/core/flow-engine/src/runjs-context/contexts/JSEditableFieldRunJSContext.ts',
  JSItemModel: 'packages/core/flow-engine/src/runjs-context/contexts/JSItemRunJSContext.ts',
  JSColumnModel: 'packages/core/flow-engine/src/runjs-context/contexts/JSColumnRunJSContext.ts',
  JSActionModel: 'packages/core/flow-engine/src/runjs-context/contexts/base.ts',
  JSRecordActionModel: 'packages/core/flow-engine/src/runjs-context/contexts/JSRecordActionRunJSContext.ts',
  JSCollectionActionModel: 'packages/core/flow-engine/src/runjs-context/contexts/JSCollectionActionRunJSContext.ts',
  JSFormActionModel: 'packages/core/flow-engine/src/runjs-context/contexts/base.ts',
  FilterFormJSActionModel: 'packages/core/flow-engine/src/runjs-context/contexts/base.ts',
};

const MODEL_FLOW_PATHS = {
  JSBlockModel: { flowKey: 'jsSettings', flowPath: 'stepParams.jsSettings.runJs', scene: 'block' },
  JSFieldModel: { flowKey: 'jsSettings', flowPath: 'stepParams.jsSettings.runJs', scene: 'detail' },
  JSEditableFieldModel: { flowKey: 'jsSettings', flowPath: 'stepParams.jsSettings.runJs', scene: 'form' },
  JSItemModel: { flowKey: 'jsSettings', flowPath: 'stepParams.jsSettings.runJs', scene: 'form' },
  JSColumnModel: { flowKey: 'jsSettings', flowPath: 'stepParams.jsSettings.runJs', scene: 'table' },
  JSActionModel: { flowKey: 'clickSettings', flowPath: 'clickSettings.runJs', scene: 'table' },
  JSRecordActionModel: { flowKey: 'clickSettings', flowPath: 'clickSettings.runJs', scene: 'table' },
  JSCollectionActionModel: { flowKey: 'clickSettings', flowPath: 'clickSettings.runJs', scene: 'table' },
  JSFormActionModel: { flowKey: 'clickSettings', flowPath: 'clickSettings.runJs', scene: 'form' },
  FilterFormJSActionModel: { flowKey: 'clickSettings', flowPath: 'clickSettings.runJs', scene: 'form' },
};

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function resolveNocobaseRoot(input) {
  const candidate = normalizeOptionalText(input) || normalizeOptionalText(process.env.NOCOBASE_ROOT) || DEFAULT_NOCOBASE_ROOT;
  return path.resolve(candidate);
}

export function resolveSnapshotPath(input) {
  return path.resolve(normalizeOptionalText(input) || process.env.NOCOBASE_UI_BUILDER_RUNJS_CONTRACT_SNAPSHOT || DEFAULT_SNAPSHOT_PATH);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function relativeToRoot(rootDir, filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function isIdentifierStart(char) {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
}

function isIdentifierPart(char) {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return isIdentifierStart(char) || (code >= 48 && code <= 57);
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let state = 'code';
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] || '';

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
      continue;
    }
    if (state === 'single') {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === '\'') state = 'code';
      continue;
    }
    if (state === 'double') {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === '"') state = 'code';
      continue;
    }
    if (state === 'template') {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === '`') {
        state = 'code';
        continue;
      }
    }

    if (char === '/' && next === '/') {
      state = 'line-comment';
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
      continue;
    }
    if (char === '\'') {
      state = 'single';
      continue;
    }
    if (char === '"') {
      state = 'double';
      continue;
    }
    if (char === '`') {
      state = 'template';
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function extractObjectSourceByAnchor(source, anchor, occurrence = 1) {
  let searchIndex = 0;
  let hit = -1;
  for (let index = 0; index < occurrence; index += 1) {
    hit = source.indexOf(anchor, searchIndex);
    if (hit < 0) return null;
    searchIndex = hit + anchor.length;
  }
  const openIndex = source.indexOf('{', hit + anchor.length);
  if (openIndex < 0) return null;
  const closeIndex = findMatchingBrace(source, openIndex);
  if (closeIndex < 0) return null;
  return source.slice(openIndex, closeIndex + 1);
}

function extractTopLevelObjectKeys(objectSource) {
  if (!objectSource || objectSource[0] !== '{') return [];
  const keys = [];
  const pushKey = (value) => {
    const normalized = normalizeOptionalText(value);
    if (!normalized || normalized === '...') return;
    if (!keys.includes(normalized)) keys.push(normalized);
  };

  let index = 1;
  let expectKey = true;
  let state = 'code';
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  while (index < objectSource.length - 1) {
    const char = objectSource[index];
    const next = objectSource[index + 1] || '';

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      index += 1;
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (state === 'single') {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '\'') state = 'code';
      index += 1;
      continue;
    }
    if (state === 'double') {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '"') state = 'code';
      index += 1;
      continue;
    }
    if (state === 'template') {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '`') {
        state = 'code';
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'line-comment';
      index += 2;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      index += 2;
      continue;
    }
    if (char === '\'') {
      state = 'single';
      index += 1;
      continue;
    }
    if (char === '"') {
      state = 'double';
      index += 1;
      continue;
    }
    if (char === '`') {
      state = 'template';
      index += 1;
      continue;
    }

    if (char === '{') {
      braceDepth += 1;
      expectKey = false;
      index += 1;
      continue;
    }
    if (char === '}') {
      if (braceDepth > 0) braceDepth -= 1;
      index += 1;
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      expectKey = false;
      index += 1;
      continue;
    }
    if (char === ']') {
      if (bracketDepth > 0) bracketDepth -= 1;
      index += 1;
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
      expectKey = false;
      index += 1;
      continue;
    }
    if (char === ')') {
      if (parenDepth > 0) parenDepth -= 1;
      index += 1;
      continue;
    }

    if (braceDepth > 0 || bracketDepth > 0 || parenDepth > 0) {
      index += 1;
      continue;
    }

    if (char === ',') {
      expectKey = true;
      index += 1;
      continue;
    }

    if (!expectKey) {
      index += 1;
      continue;
    }

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '.' && next === '.' && objectSource[index + 2] === '.') {
      expectKey = false;
      index += 3;
      continue;
    }

    if (char === '\'' || char === '"') {
      const quote = char;
      let end = index + 1;
      while (end < objectSource.length) {
        if (objectSource[end] === '\\') {
          end += 2;
          continue;
        }
        if (objectSource[end] === quote) break;
        end += 1;
      }
      pushKey(objectSource.slice(index + 1, end));
      index = end + 1;
      while (/\s/.test(objectSource[index] || '')) index += 1;
      expectKey = objectSource[index] === ',';
      continue;
    }

    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (isIdentifierPart(objectSource[end] || '')) end += 1;
      pushKey(objectSource.slice(index, end));
      index = end;
      while (/\s/.test(objectSource[index] || '')) index += 1;
      expectKey = objectSource[index] === ',';
      continue;
    }

    index += 1;
  }

  return keys;
}

function extractSafeGlobals(source) {
  const safeWindowSource = extractObjectSourceByAnchor(source, 'const allowedGlobals: Record<string, any> =');
  const safeDocumentSource = extractObjectSourceByAnchor(source, 'const allowed: Record<string, any> =', 1);
  const safeNavigatorSource = extractObjectSourceByAnchor(source, 'const allowed: Record<string, any> =', 2);

  const locationAllow = [...source.matchAll(/case '([^']+)'/g)]
    .map((match) => normalizeOptionalText(match[1]))
    .filter(Boolean);

  const navigatorDefined = [...source.matchAll(/Object\.defineProperty\(allowed, '([^']+)'/g)]
    .map((match) => normalizeOptionalText(match[1]))
    .filter(Boolean);

  return {
    window: extractTopLevelObjectKeys(safeWindowSource),
    document: extractTopLevelObjectKeys(safeDocumentSource),
    navigator: [...new Set([...extractTopLevelObjectKeys(safeNavigatorSource), ...navigatorDefined])],
    location: [...new Set(locationAllow)],
  };
}

function extractContextKeysFromSource(source, anchor) {
  const defineSource = extractObjectSourceByAnchor(source, anchor);
  if (!defineSource) {
    return { properties: [], methods: [] };
  }
  const propertiesSource = extractObjectSourceByAnchor(defineSource, 'properties:');
  const methodsSource = extractObjectSourceByAnchor(defineSource, 'methods:');
  return {
    properties: extractTopLevelObjectKeys(propertiesSource),
    methods: extractTopLevelObjectKeys(methodsSource),
  };
}

function extractFlowContextRoots(source) {
  const propertyRoots = [...source.matchAll(/defineProperty\('([^']+)'/g)]
    .map((match) => normalizeOptionalText(match[1]))
    .filter(Boolean);
  const methodRoots = [...source.matchAll(/defineMethod\('([^']+)'/g)]
    .map((match) => normalizeOptionalText(match[1]))
    .filter(Boolean);
  return {
    properties: [...new Set(propertyRoots)].sort((left, right) => left.localeCompare(right)),
    methods: [...new Set(methodRoots)].sort((left, right) => left.localeCompare(right)),
  };
}

function buildSourceFingerprint(rootDir, relativePaths) {
  const files = {};
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(rootDir, relativePath);
    const text = readText(absolutePath);
    files[relativePath] = sha256(text);
  }
  return files;
}

export function buildRunJSContract({ nocobaseRoot = DEFAULT_NOCOBASE_ROOT } = {}) {
  const rootDir = resolveNocobaseRoot(nocobaseRoot);
  const safeGlobalsSource = readText(path.join(rootDir, SAFE_GLOBALS_FILE));
  const flowContextSource = readText(path.join(rootDir, FLOW_CONTEXT_FILE));
  const baseContextSource = readText(path.join(rootDir, RUNJS_BASE_CONTEXT_FILE));
  const setupSource = readText(path.join(rootDir, RUNJS_SETUP_FILE));

  const safeGlobals = extractSafeGlobals(safeGlobalsSource);
  const flowContextRoots = extractFlowContextRoots(flowContextSource);
  const baseContextRoots = extractContextKeysFromSource(baseContextSource, 'FlowRunJSContext.define(');
  const models = {};

  for (const [modelUse, relativePath] of Object.entries(MODEL_CONTEXT_FILES)) {
    const source = readText(path.join(rootDir, relativePath));
    const className = path.basename(relativePath, '.ts');
    const contextRoots = extractContextKeysFromSource(source, `${className}.define(`);
    models[modelUse] = {
      ...MODEL_FLOW_PATHS[modelUse],
      properties: [...new Set(contextRoots.properties)].sort((left, right) => left.localeCompare(right)),
      methods: [...new Set(contextRoots.methods)].sort((left, right) => left.localeCompare(right)),
      sourceFile: relativePath,
    };
  }

  const sourceFiles = [
    FLOW_CONTEXT_FILE,
    SAFE_GLOBALS_FILE,
    RUNJS_SETUP_FILE,
    RUNJS_BASE_CONTEXT_FILE,
    ...Object.values(MODEL_CONTEXT_FILES),
  ];

  const setupRegistrations = [...setupSource.matchAll(/RunJSContextRegistry\.register\(version, '([^']+)'/g)]
    .map((match) => normalizeOptionalText(match[1]))
    .filter(Boolean);

  return {
    contractVersion: RUNJS_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    nocobaseRoot: rootDir,
    sourceHashes: buildSourceFingerprint(rootDir, [...new Set(sourceFiles)]),
    runtime: {
      timeoutMs: 5000,
      jsxCompiler: 'sucrase',
      sandbox: 'vm',
      templatePreprocessDefault: {
        v1: true,
        v2: false,
      },
      registeredModelContexts: [...new Set(setupRegistrations)].sort((left, right) => left.localeCompare(right)),
    },
    safeGlobals: {
      topLevel: [
        'ctx',
        'window',
        'document',
        'navigator',
        'console',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Blob',
        'URL',
      ],
      ...safeGlobals,
    },
    ctx: {
      baseProperties: [...new Set([...flowContextRoots.properties, ...baseContextRoots.properties])].sort((left, right) =>
        left.localeCompare(right),
      ),
      baseMethods: [...new Set([...flowContextRoots.methods, ...baseContextRoots.methods])].sort((left, right) =>
        left.localeCompare(right),
      ),
    },
    models,
  };
}

export function saveRunJSContractSnapshot(contract, snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  const targetPath = resolveSnapshotPath(snapshotPath);
  fs.writeFileSync(targetPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  return targetPath;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/runjs_contract_extract.mjs refresh-contract [--nocobase-root <path>] [--snapshot-file <path>] [--print]',
  ].join('\n');
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    return { command: 'help', flags: {} };
  }
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
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

function main(argv) {
  try {
    const { command, flags } = parseArgs(argv);
    if (command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    if (command !== 'refresh-contract') {
      throw new Error(`Unknown command "${command}"`);
    }

    const contract = buildRunJSContract({ nocobaseRoot: flags['nocobase-root'] });
    if (flags.print) {
      process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
      return;
    }
    const snapshotPath = saveRunJSContractSnapshot(contract, flags['snapshot-file']);
    process.stdout.write(`${JSON.stringify({ ok: true, snapshotPath: relativeToRoot(process.cwd(), snapshotPath) || snapshotPath }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (executedPath === path.resolve(__filename)) {
  main(process.argv.slice(2));
}
