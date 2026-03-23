#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  buildRunJSContract,
  DEFAULT_SNAPSHOT_PATH,
  resolveNocobaseRoot,
  resolveSnapshotPath,
} from './runjs_contract_extract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RUNJS_BLOCKER_EXIT_CODE = 2;
export const RUNJS_DEFAULT_TIMEOUT_MS = 1500;

const FORBIDDEN_BARE_GLOBALS = new Set([
  'fetch',
  'localStorage',
  'sessionStorage',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'BroadcastChannel',
  'EventSource',
  'indexedDB',
  'caches',
  'Function',
  'eval',
  'globalThis',
  'process',
  'require',
  'module',
  'exports',
]);

const KNOWN_BARE_GLOBALS = new Set([
  'ctx',
  'window',
  'document',
  'navigator',
  'console',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'Math',
  'Date',
  'Array',
  'Object',
  'Number',
  'String',
  'Boolean',
  'Promise',
  'RegExp',
  'Set',
  'Map',
  'WeakSet',
  'WeakMap',
  'JSON',
  'Intl',
  'URL',
  'Blob',
  'FormData',
  'Error',
  'TypeError',
  'SyntaxError',
  'ReferenceError',
  'encodeURIComponent',
  'decodeURIComponent',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'undefined',
  'NaN',
  'Infinity',
]);

const DEFAULT_RESOURCE_DATA = [{ id: 1, title: 'Sample task', name: 'Sample task' }];
const DEFAULT_SINGLE_RECORD_DATA = { id: 1, title: 'Sample task', name: 'Sample task' };
const SAFE_REQUEST_TOP_LEVEL_KEYS = new Set([
  'url',
  'method',
  'params',
  'headers',
  'skipNotify',
  'skipAuth',
]);
const SAFE_REQUEST_PARAM_KEYS = new Set([
  'page',
  'pageSize',
  'sort',
  'fields',
  'appends',
  'except',
  'filter',
  'filterByTk',
  'paginate',
  'tree',
]);
const IDENTIFIER_KEY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RENDER_MODEL_USES = new Set([
  'JSBlockModel',
  'JSColumnModel',
  'JSFieldModel',
  'JSItemModel',
  'JSEditableFieldModel',
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/runjs_guard.mjs inspect-code --model-use <use> --code-file <path> [--version <v1|v2>] [--nocobase-root <path>] [--snapshot-file <path>]',
    '  node scripts/runjs_guard.mjs inspect-payload --payload-file <path> [--mode <general|validation-case>] [--nocobase-root <path>] [--snapshot-file <path>]',
    '  node scripts/runjs_guard.mjs refresh-contract [--nocobase-root <path>] [--snapshot-file <path>]',
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

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeRequiredText(value, label) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))];
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonInput(jsonValue, filePath, label) {
  if (jsonValue) {
    return JSON.parse(jsonValue);
  }
  if (filePath) {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  }
  throw new Error(`${label} input is required`);
}

function readCodeInput(flags) {
  if (flags['code-file']) {
    return fs.readFileSync(path.resolve(flags['code-file']), 'utf8');
  }
  if (typeof flags.code === 'string') {
    return flags.code;
  }
  throw new Error('code input is required');
}

function safeToString(value) {
  try {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Error) return value.message || String(value);
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function createFinding({ severity = 'blocker', code, message, path: findingPath = '$', modelUse = null, line = null, column = null, evidence = null, details = {} }) {
  return {
    severity,
    code,
    message,
    path: findingPath,
    ...(modelUse ? { modelUse } : {}),
    ...(Number.isFinite(line) ? { line } : {}),
    ...(Number.isFinite(column) ? { column } : {}),
    ...(evidence ? { evidence } : {}),
    ...(isPlainObject(details) && Object.keys(details).length > 0 ? { details } : {}),
  };
}

function addFinding(target, finding) {
  const dedupeKey = [
    finding.code,
    finding.path || '$',
    finding.modelUse || '',
    finding.line || '',
    finding.column || '',
    finding.message || '',
  ].join('|');
  if (!target._seen) target._seen = new Set();
  if (target._seen.has(dedupeKey)) return;
  target._seen.add(dedupeKey);
  target.items.push(finding);
}

function loadSnapshotContract(snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  const resolved = resolveSnapshotPath(snapshotPath);
  if (!fs.existsSync(resolved)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export function loadRunJSContract({ nocobaseRoot, snapshotPath } = {}) {
  const warnings = [];
  const resolvedRoot = resolveNocobaseRoot(nocobaseRoot);
  const snapshot = loadSnapshotContract(snapshotPath);

  try {
    const live = buildRunJSContract({ nocobaseRoot: resolvedRoot });
    if (snapshot && JSON.stringify(snapshot.sourceHashes) !== JSON.stringify(live.sourceHashes)) {
      warnings.push(
        createFinding({
          severity: 'warning',
          code: 'RUNJS_CONTRACT_SNAPSHOT_STALE',
          message: 'RunJS contract snapshot is stale compared with current nocobase source; live contract was used.',
          details: {
            source: 'live',
          },
        }),
      );
    }
    return {
      contract: live,
      source: 'live',
      warnings,
    };
  } catch (error) {
    if (!snapshot) {
      throw error;
    }
    warnings.push(
      createFinding({
        severity: 'warning',
        code: 'RUNJS_CONTRACT_SNAPSHOT_STALE',
        message: `Failed to extract live RunJS contract, falling back to snapshot: ${error.message}`,
        details: {
          source: 'snapshot',
        },
      }),
    );
    return {
      contract: snapshot,
      source: 'snapshot',
      warnings,
    };
  }
}

function loadNodeModules(nocobaseRoot) {
  const requireFromNocobase = createRequire(path.join(resolveNocobaseRoot(nocobaseRoot), 'package.json'));
  const acorn = requireFromNocobase('acorn');
  const jsx = requireFromNocobase('acorn-jsx');
  const walk = requireFromNocobase('acorn-walk');
  let sucrase = null;
  try {
    sucrase = requireFromNocobase('sucrase');
  } catch (_) {
    sucrase = null;
  }
  return { acorn, jsx, walk, sucrase };
}

function createParser(acorn, jsx) {
  const Parser = acorn.Parser || acorn;
  return typeof jsx === 'function' ? Parser.extend(jsx()) : Parser;
}

function parseRunJSAst(code, nocobaseRoot) {
  const { acorn, jsx } = loadNodeModules(nocobaseRoot);
  const Parser = createParser(acorn, jsx);
  return Parser.parse(String(code ?? ''), {
    ecmaVersion: 2022,
    sourceType: 'script',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    locations: true,
  });
}

function compileRunJSWithSucrase(code, sucrase) {
  const src = String(code ?? '');
  if (!/<[A-Za-z]|<\//.test(src)) return src;
  const transform = sucrase?.transform || sucrase?.default?.transform;
  if (typeof transform !== 'function') return src;
  try {
    const result = transform(src, {
      transforms: ['jsx'],
      jsxPragma: 'ctx.React.createElement',
      jsxFragmentPragma: 'ctx.React.Fragment',
      disableESTransforms: true,
      production: true,
    });
    return result?.code || result?.output || src;
  } catch (_) {
    return src;
  }
}

function getLineColumnFromPos(code, pos) {
  const safePos = Math.max(0, Math.min(String(code ?? '').length, Number(pos) || 0));
  const before = String(code ?? '').slice(0, safePos).split('\n');
  return {
    line: before.length,
    column: before[before.length - 1].length + 1,
  };
}

function sourceOf(code, node) {
  if (!node || !Number.isInteger(node.start) || !Number.isInteger(node.end)) {
    return '';
  }
  return String(code ?? '').slice(node.start, node.end);
}

function isAstNode(value) {
  return isPlainObject(value) && typeof value.type === 'string';
}

function traverseAst(node, visitor, ancestors = []) {
  if (!isAstNode(node)) return;
  visitor(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          traverseAst(item, visitor, nextAncestors);
        }
      }
      continue;
    }
    if (isAstNode(value)) {
      traverseAst(value, visitor, nextAncestors);
    }
  }
}

function getPropertyKeyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

function collectVariableInitializers(ast) {
  const env = new Map();
  traverseAst(ast, (node, ancestors) => {
    if (node?.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier' || !node.init) {
      return;
    }
    const declaration = ancestors[ancestors.length - 1];
    env.set(node.id.name, {
      kind: declaration?.type === 'VariableDeclaration' ? declaration.kind : 'var',
      init: node.init,
      start: Number.isInteger(node.start) ? node.start : null,
    });
  });
  return env;
}

function resolveExpressionNode(node, env, seen = new Set()) {
  if (!node) return null;
  if (node.type !== 'Identifier') return node;
  if (!env?.has(node.name) || seen.has(node.name)) return node;
  seen.add(node.name);
  return resolveExpressionNode(env.get(node.name).init, env, seen);
}

function resolveStaticString(node, env) {
  const resolved = resolveExpressionNode(node, env);
  if (!resolved) return null;
  if (resolved.type === 'Literal' && typeof resolved.value === 'string') {
    return resolved.value;
  }
  if (resolved.type === 'TemplateLiteral' && resolved.expressions.length === 0) {
    return resolved.quasis.map((item) => item.value.cooked || '').join('');
  }
  return null;
}

function inspectObjectExpression(node, env) {
  const resolved = resolveExpressionNode(node, env);
  if (!resolved) {
    return {
      ok: false,
      reason: '对象参数为空。',
      object: null,
      properties: new Map(),
    };
  }
  if (resolved.type !== 'ObjectExpression') {
    return {
      ok: false,
      reason: '参数不是静态对象字面量。',
      object: resolved,
      properties: new Map(),
    };
  }

  const properties = new Map();
  for (const property of resolved.properties || []) {
    if (property.type !== 'Property') {
      return {
        ok: false,
        reason: '对象参数包含 spread，当前无法安全改写。',
        object: resolved,
        properties,
      };
    }
    if (property.computed) {
      return {
        ok: false,
        reason: '对象参数包含 computed key，当前无法安全改写。',
        object: resolved,
        properties,
      };
    }
    const key = getPropertyKeyName(property.key);
    if (!key) {
      return {
        ok: false,
        reason: '对象参数存在无法解析的 key。',
        object: resolved,
        properties,
      };
    }
    properties.set(key, property);
  }

  return {
    ok: true,
    reason: null,
    object: resolved,
    properties,
  };
}

function isCtxMemberExpression(node, name) {
  return node?.type === 'MemberExpression'
    && node.object?.type === 'Identifier'
    && node.object.name === 'ctx'
    && !node.computed
    && node.property?.type === 'Identifier'
    && node.property.name === name;
}

function isCtxRequestCall(node) {
  return node?.type === 'CallExpression' && isCtxMemberExpression(node.callee, 'request');
}

function isRenderModelUse(modelUse) {
  return RENDER_MODEL_USES.has(modelUse);
}

function isFunctionNode(node) {
  return node?.type === 'FunctionDeclaration'
    || node?.type === 'FunctionExpression'
    || node?.type === 'ArrowFunctionExpression';
}

function isInnerHTMLMemberExpression(node) {
  return node?.type === 'MemberExpression'
    && node.computed !== true
    && node.property?.type === 'Identifier'
    && node.property.name === 'innerHTML';
}

function findOnRefReadyCallbackContext(ancestors) {
  for (let index = ancestors.length - 1; index >= 1; index -= 1) {
    const candidate = ancestors[index];
    if (!isFunctionNode(candidate)) continue;
    const parent = ancestors[index - 1];
    if (parent?.type !== 'CallExpression' || !isCtxMemberExpression(parent.callee, 'onRefReady')) {
      continue;
    }
    const firstParam = Array.isArray(candidate.params) ? candidate.params[0] : null;
    return {
      functionNode: candidate,
      paramName: firstParam?.type === 'Identifier' ? firstParam.name : null,
    };
  }
  return null;
}

function buildFunctionAliasMap(functionNode, maxStart, refReadyParamName = null) {
  const aliases = new Map();
  if (refReadyParamName) {
    aliases.set(refReadyParamName, {
      kind: 'ref-ready-element',
    });
  }
  const visit = (node) => {
    if (!isAstNode(node)) return;
    if (node !== functionNode && isFunctionNode(node)) return;
    if (
      node.type === 'VariableDeclarator'
      && node.id?.type === 'Identifier'
      && node.init
      && (!Number.isInteger(maxStart) || !Number.isInteger(node.start) || node.start < maxStart)
    ) {
      aliases.set(node.id.name, {
        kind: 'alias',
        init: node.init,
      });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        continue;
      }
      visit(value);
    }
  };

  if (functionNode?.body) {
    visit(functionNode.body);
  }
  return aliases;
}

function resolveElementReference(node, env, localAliases, currentPos, seen = new Set()) {
  if (!node) return null;
  if (isCtxMemberExpression(node, 'element')) {
    return {
      kind: 'ctx-element',
      label: 'ctx.element',
    };
  }
  if (node.type !== 'Identifier') return null;
  if (seen.has(node.name)) return null;
  seen.add(node.name);

  const localEntry = localAliases?.get(node.name);
  if (localEntry) {
    if (localEntry.kind === 'ref-ready-element') {
      return {
        kind: 'ref-ready-element',
        label: node.name,
      };
    }
    if (localEntry.kind === 'alias') {
      return resolveElementReference(localEntry.init, env, localAliases, currentPos, seen);
    }
  }

  const globalEntry = env?.get(node.name);
  if (
    globalEntry
    && (!Number.isInteger(globalEntry.start) || !Number.isInteger(currentPos) || globalEntry.start < currentPos)
  ) {
    return resolveElementReference(globalEntry.init, env, localAliases, currentPos, seen);
  }
  return null;
}

function findExpressionStatementContext(node, ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const candidate = ancestors[index];
    if (candidate?.type !== 'ExpressionStatement' || candidate.expression !== node) continue;
    for (let parentIndex = index - 1; parentIndex >= 0; parentIndex -= 1) {
      const parent = ancestors[parentIndex];
      const body = Array.isArray(parent?.body) ? parent.body : null;
      if (!body || !body.includes(candidate)) continue;
      return {
        statement: candidate,
        statements: body,
        statementIndex: body.indexOf(candidate),
      };
    }
    return {
      statement: candidate,
      statements: null,
      statementIndex: -1,
    };
  }
  return null;
}

function nodeUsesElementReference(node, env, localAliases) {
  let found = false;
  traverseAst(node, (candidate, ancestors) => {
    if (found) return;
    if (candidate?.type === 'MemberExpression') {
      const target = resolveElementReference(candidate.object, env, localAliases, candidate.start);
      if (target) {
        found = true;
      }
      return;
    }
    if (candidate?.type === 'Identifier') {
      const parent = ancestors[ancestors.length - 1];
      if (
        (parent?.type === 'VariableDeclarator' && parent.id === candidate)
        || (parent?.type === 'FunctionDeclaration' && parent.id === candidate)
        || (parent?.type === 'FunctionExpression' && parent.id === candidate)
        || (parent?.type === 'ArrowFunctionExpression' && parent.params?.includes(candidate))
        || (parent?.type === 'Property' && parent.key === candidate && parent.computed !== true)
        || (parent?.type === 'MemberExpression' && parent.property === candidate && parent.computed !== true)
      ) {
        return;
      }
      if (resolveElementReference(candidate, env, localAliases, candidate.start)) {
        found = true;
      }
    }
  });
  return found;
}

function buildInnerHTMLRewrite({ assignmentNode, ancestors, code, env, localAliases }) {
  if (assignmentNode.operator !== '=') return null;
  const statementContext = findExpressionStatementContext(assignmentNode, ancestors);
  if (!statementContext?.statement || !statementContext.statements) {
    return null;
  }

  for (let index = statementContext.statementIndex + 1; index < statementContext.statements.length; index += 1) {
    if (nodeUsesElementReference(statementContext.statements[index], env, localAliases)) {
      return null;
    }
  }

  return {
    start: statementContext.statement.start,
    end: statementContext.statement.end,
    replacement: `ctx.render(${sourceOf(code, assignmentNode.right)});`,
    transforms: [
      {
        code: 'RUNJS_ELEMENT_INNERHTML_TO_CTX_RENDER',
        message: '把 ctx.element.innerHTML 赋值改写为 ctx.render(...)。',
      },
    ],
  };
}

function analyzeInnerHTMLAssignment({ node, ancestors, code, env, modelUse, path: findingPath }) {
  if (!isRenderModelUse(modelUse)) return null;
  if (node?.type !== 'AssignmentExpression' || !isInnerHTMLMemberExpression(node.left)) {
    return null;
  }

  const onRefReadyContext = findOnRefReadyCallbackContext(ancestors);
  const localAliases = onRefReadyContext
    ? buildFunctionAliasMap(onRefReadyContext.functionNode, node.start, onRefReadyContext.paramName)
    : new Map();
  const elementTarget = resolveElementReference(node.left.object, env, localAliases, node.start);
  if (!elementTarget) return null;

  const line = node.left.property?.loc?.start?.line ?? node.loc?.start?.line ?? null;
  const column = node.left.property?.loc?.start?.column != null
    ? node.left.property.loc.start.column + 1
    : (node.loc?.start?.column != null ? node.loc.start.column + 1 : null);
  const rewrite = buildInnerHTMLRewrite({
    assignmentNode: node,
    ancestors,
    code,
    env,
    localAliases,
  });

  if (rewrite) {
    return {
      findings: [
        createFinding({
          severity: 'warning',
          code: 'RUNJS_ELEMENT_INNERHTML_REWRITE_AVAILABLE',
          message: '渲染型 JS model 不应直接写 innerHTML；当前赋值可自动改写为 ctx.render(...)。',
          path: findingPath,
          modelUse,
          line,
          column,
          details: {
            target: elementTarget.label,
          },
        }),
      ],
      rewrite,
    };
  }

  return {
    findings: [
      createFinding({
        code: 'RUNJS_ELEMENT_INNERHTML_FORBIDDEN',
        message: '渲染型 JS model 不允许直接写 innerHTML；请改用 ctx.render(...)，或先移除后续 DOM 依赖再重写。',
        path: findingPath,
        modelUse,
        line,
        column,
        details: {
          target: elementTarget.label,
          operator: node.operator,
        },
      }),
    ],
    rewrite: null,
  };
}

function parseRequestTarget(url) {
  const normalized = String(url ?? '').trim();
  if (!normalized || /^https?:\/\//i.test(normalized)) return null;
  const stripped = normalized
    .replace(/^\/+/, '')
    .replace(/^api\//, '');
  if (stripped === 'auth:check') {
    return {
      kind: 'auth-check',
      normalized: stripped,
    };
  }
  const match = stripped.match(/^([A-Za-z0-9_.-]+):(list|get)$/);
  if (!match) return null;
  return {
    kind: 'resource-read',
    resourceName: match[1],
    action: match[2],
    normalized: stripped,
  };
}

function looksLikeFilterGroupExpression(node, env) {
  const resolved = resolveExpressionNode(node, env);
  if (!resolved || resolved.type !== 'ObjectExpression') return false;
  let hasLogic = false;
  let hasItems = false;
  for (const property of resolved.properties || []) {
    if (property.type !== 'Property' || property.computed) continue;
    const key = getPropertyKeyName(property.key);
    if (key === 'logic') hasLogic = true;
    if (key === 'items') hasItems = true;
  }
  return hasLogic && hasItems;
}

function formatObjectKey(key) {
  return IDENTIFIER_KEY_RE.test(key) ? key : JSON.stringify(key);
}

function transformFilterGroupValue(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (typeof value.logic === 'string' && Array.isArray(value.items)) {
    return {
      [value.logic]: value.items.map((item) => transformFilterGroupValue(item)),
    };
  }
  if (typeof value.path === 'string' && typeof value.operator === 'string') {
    return {
      [value.path]: {
        [value.operator]: value.value,
      },
    };
  }
  return value;
}

export function transformFilterGroupToQueryFilter(filter) {
  return transformFilterGroupValue(cloneJson(filter));
}

function buildFilterNormalizerExpression(filterSource) {
  return `((value) => {
    const convert = (current) => {
      if (!current || typeof current !== 'object') {
        return current;
      }
      if (typeof current.logic === 'string' && Array.isArray(current.items)) {
        return {
          [current.logic]: current.items.map((item) => convert(item)),
        };
      }
      if (typeof current.path === 'string' && typeof current.operator === 'string') {
        return {
          [current.path]: {
            [current.operator]: current.value,
          },
        };
      }
      return current;
    };
    return convert(value);
  })(${filterSource})`;
}

function createResourceRequestIIFE({
  code,
  target,
  configInfo,
  paramsInfo,
  actionName,
}) {
  const resourceType = target.action === 'get' ? 'SingleRecordResource' : 'MultiRecordResource';
  const params = paramsInfo?.properties || new Map();
  const lines = [
    '(async () => {',
    `  const __runjsResource = ctx.makeResource('${resourceType}');`,
    `  __runjsResource.setResourceName(${JSON.stringify(target.resourceName)});`,
  ];

  const pushSetter = (methodName, propertyKey) => {
    const property = params.get(propertyKey);
    if (!property) return;
    lines.push(`  __runjsResource.${methodName}(${sourceOf(code, property.value)});`);
  };

  pushSetter('setPage', 'page');
  pushSetter('setPageSize', 'pageSize');
  pushSetter('setSort', 'sort');
  pushSetter('setFields', 'fields');
  pushSetter('setAppends', 'appends');
  pushSetter('setExcept', 'except');
  pushSetter('setFilterByTk', 'filterByTk');

  const filterProperty = params.get('filter');
  if (filterProperty) {
    lines.push(`  __runjsResource.setFilter(${buildFilterNormalizerExpression(sourceOf(code, filterProperty.value))});`);
  }

  const actionOptionEntries = [];
  for (const key of ['headers', 'skipNotify', 'skipAuth']) {
    const property = configInfo.properties.get(key);
    if (property) {
      actionOptionEntries.push(`${formatObjectKey(key)}: ${sourceOf(code, property.value)}`);
    }
  }

  const extraParamEntries = [];
  for (const [key, property] of params.entries()) {
    if (['page', 'pageSize', 'sort', 'fields', 'appends', 'except', 'filter', 'filterByTk'].includes(key)) {
      continue;
    }
    extraParamEntries.push(`${formatObjectKey(key)}: ${sourceOf(code, property.value)}`);
  }
  if (extraParamEntries.length > 0) {
    actionOptionEntries.push(`params: { ${extraParamEntries.join(', ')} }`);
  }
  if (actionOptionEntries.length > 0) {
    lines.push(`  __runjsResource.setRunActionOptions('${actionName}', { ${actionOptionEntries.join(', ')} });`);
  }

  lines.push('  await __runjsResource.refresh();');
  lines.push('  return {');
  lines.push('    data: {');
  if (target.action === 'get') {
    lines.push('      data: __runjsResource.getData?.() ?? null,');
  } else {
    lines.push('      data: Array.isArray(__runjsResource.getData?.()) ? __runjsResource.getData() : [],');
  }
  lines.push('      meta: __runjsResource.getMeta?.() ?? null,');
  lines.push('    },');
  lines.push('  };');
  lines.push('})()');

  return lines.join('\n');
}

function analyzeCtxRequestCall({ callNode, code, env, modelUse, path: findingPath }) {
  if (!Array.isArray(callNode.arguments) || callNode.arguments.length === 0) {
    return null;
  }

  const configInfo = inspectObjectExpression(callNode.arguments[0], env);
  if (!configInfo.ok) {
    return null;
  }

  const urlProperty = configInfo.properties.get('url');
  const urlValue = urlProperty ? resolveStaticString(urlProperty.value, env) : null;
  if (!urlValue) {
    return null;
  }

  const target = parseRequestTarget(urlValue);
  if (!target) {
    return null;
  }

  const methodProperty = configInfo.properties.get('method');
  const methodValue = methodProperty ? resolveStaticString(methodProperty.value, env) : null;
  if (methodValue && methodValue.toLowerCase() !== 'get') {
    return null;
  }

  if (target.kind === 'auth-check') {
    return {
      findings: [
        createFinding({
          severity: 'warning',
          code: 'RUNJS_AUTH_CHECK_REDUNDANT',
          message: '读取当前登录用户时不应再请求 auth:check；优先使用 ctx.user 或 ctx.auth?.user。',
          path: findingPath,
          modelUse,
          line: callNode.loc?.start?.line,
          column: callNode.loc?.start?.column != null ? callNode.loc.start.column + 1 : null,
          details: {
            url: target.normalized,
          },
        }),
      ],
      rewrite: {
        start: callNode.start,
        end: callNode.end,
        replacement: `(async () => ({ data: { data: (ctx.user ?? ctx.auth?.user ?? null) } }))()`,
        transforms: [
          {
            code: 'RUNJS_AUTH_CHECK_TO_CTX_USER',
            message: '把 auth:check 请求改写为直接读取 ctx.user / ctx.auth?.user。',
            details: {
              url: target.normalized,
            },
          },
        ],
      },
    };
  }

  const unsupportedTopLevelKeys = [...configInfo.properties.keys()].filter((key) => !SAFE_REQUEST_TOP_LEVEL_KEYS.has(key));
  if (unsupportedTopLevelKeys.length > 0) {
    return {
      findings: [
        createFinding({
          code: 'RUNJS_RESOURCE_REQUEST_REWRITE_REQUIRED',
          message: `ctx.request 命中了资源读取接口 "${target.normalized}"，但包含当前无法安全改写的顶层参数：${unsupportedTopLevelKeys.join(', ')}。请改用 resource API。`,
          path: findingPath,
          modelUse,
          line: callNode.loc?.start?.line,
          column: callNode.loc?.start?.column != null ? callNode.loc.start.column + 1 : null,
          details: {
            url: target.normalized,
            unsupportedTopLevelKeys,
          },
        }),
      ],
      rewrite: null,
    };
  }

  let paramsInfo = { ok: true, reason: null, properties: new Map() };
  const paramsProperty = configInfo.properties.get('params');
  if (paramsProperty) {
    paramsInfo = inspectObjectExpression(paramsProperty.value, env);
    if (!paramsInfo.ok) {
      const filterUnsupported = looksLikeFilterGroupExpression(paramsProperty.value, env);
      return {
        findings: [
          createFinding({
            code: filterUnsupported ? 'RUNJS_REQUEST_FILTER_GROUP_UNSUPPORTED' : 'RUNJS_RESOURCE_REQUEST_REWRITE_REQUIRED',
            message: filterUnsupported
              ? `ctx.request 命中了资源读取接口 "${target.normalized}"，且 filter 使用了 builder 风格结构，但 params 不是可安全改写的静态对象。请改用 resource API 或服务端 query filter。`
              : `ctx.request 命中了资源读取接口 "${target.normalized}"，但 params 当前不是可安全改写的静态对象。请改用 resource API。`,
            path: findingPath,
            modelUse,
            line: callNode.loc?.start?.line,
            column: callNode.loc?.start?.column != null ? callNode.loc.start.column + 1 : null,
            details: {
              url: target.normalized,
              reason: paramsInfo.reason,
            },
          }),
        ],
        rewrite: null,
      };
    }
  }

  const unsupportedParamKeys = [...paramsInfo.properties.keys()].filter((key) => !SAFE_REQUEST_PARAM_KEYS.has(key));
  if (unsupportedParamKeys.length > 0) {
    return {
      findings: [
        createFinding({
          code: 'RUNJS_RESOURCE_REQUEST_REWRITE_REQUIRED',
          message: `ctx.request 命中了资源读取接口 "${target.normalized}"，但 params 包含当前无法安全改写的字段：${unsupportedParamKeys.join(', ')}。请改用 resource API。`,
          path: findingPath,
          modelUse,
          line: callNode.loc?.start?.line,
          column: callNode.loc?.start?.column != null ? callNode.loc.start.column + 1 : null,
          details: {
            url: target.normalized,
            unsupportedParamKeys,
          },
        }),
      ],
      rewrite: null,
    };
  }

  const findings = [
    createFinding({
      severity: 'warning',
      code: 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST',
      message: `读取 NocoBase 资源 "${target.normalized}" 时不应默认使用 ctx.request；应优先改写为 ${target.action === 'get' ? 'SingleRecordResource' : 'MultiRecordResource'}。`,
      path: findingPath,
      modelUse,
      line: callNode.loc?.start?.line,
      column: callNode.loc?.start?.column != null ? callNode.loc.start.column + 1 : null,
      details: {
        url: target.normalized,
        resourceName: target.resourceName,
        action: target.action,
      },
    }),
  ];

  const transforms = [
    {
      code: target.action === 'get'
        ? 'RUNJS_REQUEST_GET_TO_SINGLE_RECORD_RESOURCE'
        : 'RUNJS_REQUEST_LIST_TO_MULTI_RECORD_RESOURCE',
      message: `把 ${target.normalized} 的 ctx.request 调用改写为 ${target.action === 'get' ? 'SingleRecordResource' : 'MultiRecordResource'}。`,
      details: {
        url: target.normalized,
        resourceName: target.resourceName,
        action: target.action,
      },
    },
  ];

  const filterProperty = paramsInfo.properties.get('filter');
  if (filterProperty && looksLikeFilterGroupExpression(filterProperty.value, env)) {
    transforms.unshift({
      code: 'RUNJS_REQUEST_FILTER_GROUP_TO_QUERY_FILTER',
      message: `把 ${target.normalized} 请求里的 builder filter 自动收敛为服务端 query filter。`,
      details: {
        url: target.normalized,
      },
    });
  }

  return {
    findings,
    rewrite: {
      start: callNode.start,
      end: callNode.end,
      replacement: createResourceRequestIIFE({
        code,
        target,
        configInfo,
        paramsInfo,
        actionName: target.action,
      }),
      transforms,
    },
  };
}

function inspectRunJSSemantics({ code, ast, modelUse = 'JSBlockModel', path: findingPath = '$' }) {
  const findings = [];
  const rewrites = [];
  const env = collectVariableInitializers(ast);

  traverseAst(ast, (node, ancestors) => {
    if (isCtxRequestCall(node)) {
      const result = analyzeCtxRequestCall({
        callNode: node,
        code,
        env,
        modelUse,
        path: findingPath,
      });
      if (result) {
        findings.push(...(result.findings || []));
        if (result.rewrite) {
          rewrites.push(result.rewrite);
        }
      }
    }

    const innerHTMLResult = analyzeInnerHTMLAssignment({
      node,
      ancestors,
      code,
      env,
      modelUse,
      path: findingPath,
    });
    if (!innerHTMLResult) return;
    findings.push(...(innerHTMLResult.findings || []));
    if (innerHTMLResult.rewrite) {
      rewrites.push(innerHTMLResult.rewrite);
    }
  });

  return {
    blockers: findings.filter((item) => item.severity !== 'warning'),
    warnings: findings.filter((item) => item.severity === 'warning'),
    rewrites: rewrites.sort((left, right) => right.start - left.start),
  };
}

export function canonicalizeRunJSCode({ code, modelUse = 'JSBlockModel', version = 'v1', nocobaseRoot, path: findingPath = '$' } = {}) {
  const src = String(code ?? '');
  let ast = null;
  try {
    ast = parseRunJSAst(src, nocobaseRoot);
  } catch (error) {
    return {
      ok: false,
      code: src,
      changed: false,
      transforms: [],
      unresolved: [
        {
          code: 'RUNJS_PARSE_ERROR',
          message: `Syntax error: ${error.message}`,
          path: findingPath,
          modelUse,
        },
      ],
      semantic: {
        blockerCount: 1,
        warningCount: 0,
        autoRewriteCount: 0,
      },
      version,
    };
  }

  const semantic = inspectRunJSSemantics({
    code: src,
    ast,
    modelUse,
    path: findingPath,
  });

  let nextCode = src;
  for (const rewrite of semantic.rewrites) {
    nextCode = `${nextCode.slice(0, rewrite.start)}${rewrite.replacement}${nextCode.slice(rewrite.end)}`;
  }

  return {
    ok: semantic.blockers.length === 0,
    code: nextCode,
    changed: nextCode !== src,
    transforms: semantic.rewrites.flatMap((item) => item.transforms || []),
    unresolved: semantic.blockers.map((item) => ({
      code: item.code,
      message: item.message,
      path: item.path,
      modelUse: item.modelUse,
      ...(item.details ? { details: item.details } : {}),
    })),
    semantic: {
      blockerCount: semantic.blockers.length,
      warningCount: semantic.warnings.length,
      autoRewriteCount: semantic.rewrites.length,
    },
    version,
  };
}

export function canonicalizeRunJSPayload({ payload, nocobaseRoot, snapshotPath } = {}) {
  const transforms = [];
  const unresolved = [];
  let autoRewriteCount = 0;
  let semanticBlockerCount = 0;
  let semanticWarningCount = 0;

  walkPayload(payload, (node, pathValue, context) => {
    if (!isPlainObject(node)) return;
    const modelUse = context.nearestUse || 'JSBlockModel';
    const applyCanonicalize = (runJsNode, runJsPath) => {
      if (!isPlainObject(runJsNode) || typeof runJsNode.code !== 'string') return;
      const result = canonicalizeRunJSCode({
        code: runJsNode.code,
        modelUse,
        version: runJsNode.version,
        nocobaseRoot,
        snapshotPath,
        path: runJsPath,
      });
      if (result.changed) {
        runJsNode.code = result.code;
      }
      autoRewriteCount += result.semantic?.autoRewriteCount || 0;
      semanticBlockerCount += result.semantic?.blockerCount || 0;
      semanticWarningCount += result.semantic?.warningCount || 0;
      for (const item of result.transforms || []) {
        transforms.push({
          ...item,
          path: runJsPath,
        });
      }
      for (const item of result.unresolved || []) {
        unresolved.push({
          ...item,
          path: runJsPath,
        });
      }
    };

    if (isPlainObject(node.stepParams?.jsSettings?.runJs)) {
      applyCanonicalize(node.stepParams.jsSettings.runJs, `${pathValue}.stepParams.jsSettings.runJs`);
    }
    if (isPlainObject(node.clickSettings?.runJs)) {
      applyCanonicalize(node.clickSettings.runJs, `${pathValue}.clickSettings.runJs`);
    }
    if (context.parentKey !== 'runJs' && isRunJSValueObject(node)) {
      applyCanonicalize(node, pathValue);
    }
  });

  return {
    payload,
    transforms,
    unresolved,
    semantic: {
      blockerCount: semanticBlockerCount,
      warningCount: semanticWarningCount,
      autoRewriteCount,
    },
  };
}

function detectDeprecatedTemplateSyntax(code) {
  const regex = /(^|[=(:,[\s)])(\{\{\s*(ctx(?:\.|\[|\?\.)[^}]*)\s*\}\})/m;
  const match = String(code ?? '').match(regex);
  if (!match) return null;
  const placeholder = normalizeOptionalText(match[2]);
  const expression = normalizeOptionalText(match[3]);
  const index = match.index + match[1].length;
  return {
    placeholder,
    expression,
    index,
  };
}

function resolveRootMemberName(node) {
  if (!node) return null;
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
  if (node.computed && node.property?.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  return null;
}

function inspectStaticCode({ code, modelUse, version, contract, nocobaseRoot, path: findingPath }) {
  const findings = { items: [], _seen: new Set() };
  const warnings = { items: [], _seen: new Set() };
  const src = String(code ?? '');
  const modelContract = contract.models?.[modelUse] || {};
  const allowedCtxRoots = new Set([
    ...uniqueStrings(contract.ctx?.baseProperties),
    ...uniqueStrings(contract.ctx?.baseMethods),
    ...uniqueStrings(modelContract.properties),
    ...uniqueStrings(modelContract.methods),
  ]);

  const deprecatedTemplate = detectDeprecatedTemplateSyntax(src);
  if (deprecatedTemplate) {
    const loc = getLineColumnFromPos(src, deprecatedTemplate.index);
    addFinding(findings, createFinding({
      code: 'RUNJS_DEPRECATED_CTX_TEMPLATE_SYNTAX',
      message: `"${deprecatedTemplate.placeholder}" cannot be used as executable RunJS syntax. Use await ctx.getVar("${deprecatedTemplate.expression}") instead.`,
      path: findingPath,
      modelUse,
      line: loc.line,
      column: loc.column,
      evidence: deprecatedTemplate.placeholder,
    }));
  }

  let ast = null;
  try {
    ast = parseRunJSAst(src, nocobaseRoot);
  } catch (error) {
    const loc = error?.loc
      ? { line: error.loc.line, column: error.loc.column + 1 }
      : getLineColumnFromPos(src, error?.pos || 0);
    addFinding(findings, createFinding({
      code: 'RUNJS_PARSE_ERROR',
      message: `Syntax error: ${error.message}`,
      path: findingPath,
      modelUse,
      line: loc.line,
      column: loc.column,
    }));
    return {
      blockers: findings.items,
      warnings: warnings.items,
      ast: null,
    };
  }

  const declared = new Set(KNOWN_BARE_GLOBALS);

  const addIdentifier = (identifier) => {
    if (identifier && typeof identifier.name === 'string') {
      declared.add(identifier.name);
    }
  };
  const addPatternIdentifiers = (pattern) => {
    if (!pattern) return;
    const queue = [pattern];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) continue;
      if (current.type === 'Identifier') {
        addIdentifier(current);
        continue;
      }
      if (current.type === 'AssignmentPattern') {
        queue.push(current.left);
        continue;
      }
      if (current.type === 'ArrayPattern') {
        for (const item of current.elements || []) queue.push(item);
        continue;
      }
      if (current.type === 'ObjectPattern') {
        for (const item of current.properties || []) queue.push(item.value || item.argument || item);
      }
    }
  };

  traverseAst(ast, (node) => {
    switch (node?.type) {
      case 'VariableDeclarator':
        addPatternIdentifiers(node.id);
        break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        addIdentifier(node.id);
        for (const param of node.params || []) addPatternIdentifiers(param);
        break;
      case 'CatchClause':
        addPatternIdentifiers(node.param);
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        addIdentifier(node.id);
        break;
      default:
        break;
    }
  });

  traverseAst(ast, (node, ancestors) => {
    if (node?.type === 'MemberExpression') {
      const root = node.object;
      if (root?.type === 'Identifier') {
        const memberName = resolveRootMemberName(node);
        if (!memberName) return;

        if (root.name === 'window') {
          if (!contract.safeGlobals?.window?.includes(memberName)) {
            addFinding(findings, createFinding({
              code: 'RUNJS_FORBIDDEN_WINDOW_PROPERTY',
              message: `window.${memberName} is not allowed in RunJS sandbox.`,
              path: findingPath,
              modelUse,
              line: node.property?.loc?.start?.line,
              column: node.property?.loc?.start?.column != null ? node.property.loc.start.column + 1 : null,
            }));
          }
          return;
        }

        if (root.name === 'document') {
          if (!contract.safeGlobals?.document?.includes(memberName)) {
            addFinding(findings, createFinding({
              code: 'RUNJS_FORBIDDEN_DOCUMENT_PROPERTY',
              message: `document.${memberName} is not allowed in RunJS sandbox.`,
              path: findingPath,
              modelUse,
              line: node.property?.loc?.start?.line,
              column: node.property?.loc?.start?.column != null ? node.property.loc.start.column + 1 : null,
            }));
          }
          return;
        }

        if (root.name === 'navigator') {
          if (!contract.safeGlobals?.navigator?.includes(memberName)) {
            addFinding(findings, createFinding({
              code: 'RUNJS_FORBIDDEN_NAVIGATOR_PROPERTY',
              message: `navigator.${memberName} is not allowed in RunJS sandbox.`,
              path: findingPath,
              modelUse,
              line: node.property?.loc?.start?.line,
              column: node.property?.loc?.start?.column != null ? node.property.loc.start.column + 1 : null,
            }));
          }
          return;
        }

        if (root.name === 'location') {
          addFinding(findings, createFinding({
            code: 'RUNJS_FORBIDDEN_GLOBAL',
            message: 'Bare location access is not available in RunJS sandbox. Use window.location with allowed members only.',
            path: findingPath,
            modelUse,
            line: root.loc?.start?.line,
            column: root.loc?.start?.column != null ? root.loc.start.column + 1 : null,
          }));
          return;
        }

        if (root.name === 'globalThis') {
          addFinding(findings, createFinding({
            code: 'RUNJS_FORBIDDEN_GLOBAL',
            message: 'globalThis access is not allowed in RunJS sandbox.',
            path: findingPath,
            modelUse,
            line: root.loc?.start?.line,
            column: root.loc?.start?.column != null ? root.loc.start.column + 1 : null,
          }));
          return;
        }

        if (root.name === 'ctx') {
          if (!allowedCtxRoots.has(memberName)) {
            addFinding(findings, createFinding({
              code: 'RUNJS_UNKNOWN_CTX_MEMBER',
              message: `ctx.${memberName} is not part of the known RunJS contract for ${modelUse}.`,
              path: findingPath,
              modelUse,
              line: node.property?.loc?.start?.line,
              column: node.property?.loc?.start?.column != null ? node.property.loc.start.column + 1 : null,
            }));
          }
        }
      }
      return;
    }

    if (node?.type === 'Identifier') {
      const name = node.name;
      if (!name || declared.has(name)) return;

      const parent = ancestors[ancestors.length - 1];
      if (!parent) return;
      if (
        (parent.type === 'VariableDeclarator' && parent.id === node) ||
        (parent.type === 'FunctionDeclaration' && parent.id === node) ||
        (parent.type === 'FunctionExpression' && parent.id === node) ||
        (parent.type === 'ClassDeclaration' && parent.id === node) ||
        (parent.type === 'ClassExpression' && parent.id === node) ||
        (parent.type === 'Property' && parent.key === node && parent.computed !== true) ||
        (parent.type === 'MemberExpression' && parent.property === node && parent.computed !== true) ||
        (parent.type === 'LabeledStatement' && parent.label === node) ||
        (parent.type === 'BreakStatement' && parent.label === node) ||
        (parent.type === 'ContinueStatement' && parent.label === node)
      ) {
        return;
      }

      const targetCode = FORBIDDEN_BARE_GLOBALS.has(name) ? 'RUNJS_FORBIDDEN_GLOBAL' : 'RUNJS_UNKNOWN_GLOBAL';
      const targetMessage = FORBIDDEN_BARE_GLOBALS.has(name)
        ? `${name} is forbidden in RunJS sandbox.`
        : `Possible undefined variable: ${name}`;
      addFinding(findings, createFinding({
        code: targetCode,
        message: targetMessage,
        path: findingPath,
        modelUse,
        line: node.loc?.start?.line,
        column: node.loc?.start?.column != null ? node.loc.start.column + 1 : null,
      }));
    }
  });

  return {
    blockers: findings.items,
    warnings: warnings.items,
    ast,
  };
}

function createNoopAsync() {
  return async () => undefined;
}

function createVoidProxy(label) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === Symbol.toStringTag) return label;
        if (prop === 'toJSON') return () => ({ type: label });
        return createNoopAsync();
      },
    },
  );
}

function createResourceStub(resourceType = 'MultiRecordResource') {
  const state = {
    resourceType,
    resourceName: null,
    filterByTk: null,
    filter: null,
    sort: [],
    fields: [],
    appends: [],
    except: [],
    page: 1,
    meta: {
      page: 1,
      pageSize: 20,
      count: resourceType === 'SingleRecordResource' ? 1 : DEFAULT_RESOURCE_DATA.length,
      totalPage: 1,
    },
    data: cloneJson(resourceType === 'SingleRecordResource' ? DEFAULT_SINGLE_RECORD_DATA : DEFAULT_RESOURCE_DATA),
    pageSize: null,
    runActionOptions: {},
  };
  const api = {
    getData() {
      return state.data;
    },
    getMeta() {
      return state.meta;
    },
    getCount() {
      return Number(state.meta?.count || 0);
    },
    setData(value) {
      state.data = value;
      return api;
    },
    async refresh() {
      const count = Array.isArray(state.data) ? state.data.length : (state.data ? 1 : 0);
      state.meta = {
        page: state.page || 1,
        pageSize: state.pageSize || state.meta?.pageSize || 20,
        count,
        totalPage: 1,
      };
      return state.data;
    },
    setResourceName(value) {
      state.resourceName = value;
      return api;
    },
    getResourceName() {
      return state.resourceName;
    },
    setFilterByTk(value) {
      state.filterByTk = value;
      return api;
    },
    getFilterByTk() {
      return state.filterByTk;
    },
    setFilter(value) {
      state.filter = value;
      return api;
    },
    getFilter() {
      return state.filter;
    },
    setSort(value) {
      state.sort = value;
      return api;
    },
    getSort() {
      return state.sort;
    },
    setFields(value) {
      state.fields = value;
      return api;
    },
    setAppends(value) {
      state.appends = value;
      return api;
    },
    setExcept(value) {
      state.except = value;
      return api;
    },
    setPage(value) {
      state.page = value;
      return api;
    },
    getPage() {
      return state.page;
    },
    setPageSize(value) {
      state.pageSize = value;
      return api;
    },
    getPageSize() {
      return state.pageSize;
    },
    setRunActionOptions(actionName, value) {
      state.runActionOptions[actionName] = value;
      return api;
    },
    async runAction() {
      return { data: { data: state.data, meta: state.meta } };
    },
    getSelectedRows() {
      return Array.isArray(state.data) ? state.data.slice(0, 1) : [];
    },
    async destroySelectedRows() {
      state.data = [];
      return { data: { data: [] } };
    },
    on() {},
    off() {},
    setDataSourceKey() {
      return api;
    },
    getSourceId() {
      return 1;
    },
  };
  return api;
}

function createAntdProxy() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === Symbol.toStringTag) return 'antd';
        if (prop === 'message') return createVoidProxy('antd.message');
        return function AntdPlaceholder(props) {
          return { type: String(prop), props };
        };
      },
    },
  );
}

function createLoggerStub(logs) {
  const append = (level, args) => {
    logs.push({
      level,
      message: args.map((item) => safeToString(item)).join(' '),
    });
  };
  const logger = {};
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    logger[level] = (...args) => append(level, args);
  }
  logger.child = () => logger;
  return logger;
}

function createMessageStub(logs, label) {
  const stub = {};
  for (const method of ['info', 'success', 'error', 'warning', 'loading', 'open', 'destroy']) {
    stub[method] = (...args) => {
      logs.push({ level: method === 'error' ? 'error' : method === 'warning' ? 'warn' : 'info', message: `[${label}.${method}] ${args.map((item) => safeToString(item)).join(' ')}` });
      return undefined;
    };
  }
  return stub;
}

function createLocationProxy() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        switch (prop) {
          case 'origin':
            return 'http://127.0.0.1:23000';
          case 'protocol':
            return 'http:';
          case 'host':
            return '127.0.0.1:23000';
          case 'hostname':
            return '127.0.0.1';
          case 'port':
            return '23000';
          case 'pathname':
            return '/admin';
          case 'assign':
          case 'replace':
          case 'reload':
            return () => undefined;
          case 'href':
            throw new Error('Reading location.href is not allowed.');
          default:
            throw new Error(`Access to location property "${String(prop)}" is not allowed.`);
        }
      },
      set(_target, prop) {
        if (prop === 'href') return true;
        throw new Error('Mutation on location is not allowed.');
      },
    },
  );
}

function createSafeTopLevelWindow(contract, logs) {
  const locationProxy = createLocationProxy();
  const allowed = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console: {
      log: (...args) => logs.push({ level: 'log', message: args.map((item) => safeToString(item)).join(' ') }),
      info: (...args) => logs.push({ level: 'info', message: args.map((item) => safeToString(item)).join(' ') }),
      warn: (...args) => logs.push({ level: 'warn', message: args.map((item) => safeToString(item)).join(' ') }),
      error: (...args) => logs.push({ level: 'error', message: args.map((item) => safeToString(item)).join(' ') }),
    },
    Math,
    Date,
    FormData: globalThis.FormData,
    Blob: globalThis.Blob,
    URL,
    addEventListener: () => undefined,
    open: () => null,
    location: locationProxy,
  };

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop in allowed) return allowed[prop];
        if (contract.safeGlobals?.window?.includes(prop)) return allowed[prop];
        throw new Error(`Access to global property "${prop}" is not allowed.`);
      },
      set(_target, prop) {
        throw new Error(`Mutation of global property "${String(prop)}" is not allowed.`);
      },
    },
  );
}

function createSafeDocumentProxy(contract) {
  const allowed = {
    createElement: () => ({ nodeType: 1, style: {}, appendChild() {}, remove() {}, innerHTML: '' }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop in allowed) return allowed[prop];
        if (contract.safeGlobals?.document?.includes(prop)) return allowed[prop];
        throw new Error(`Access to document property "${prop}" is not allowed.`);
      },
      set() {
        throw new Error('Mutation of document property is not allowed.');
      },
    },
  );
}

function createSafeNavigatorProxy(contract) {
  const allowed = {
    clipboard: {
      async writeText() {
        return undefined;
      },
    },
    onLine: true,
    language: 'zh-CN',
    languages: ['zh-CN', 'en-US'],
  };
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop in allowed) return allowed[prop];
        if (contract.safeGlobals?.navigator?.includes(prop)) return allowed[prop];
        throw new Error(`Access to navigator property "${String(prop)}" is not allowed.`);
      },
    },
  );
}

function createReactStub() {
  return {
    Fragment: Symbol.for('RunJS.Fragment'),
    createElement(type, props, ...children) {
      return { type, props: { ...(props || {}), children } };
    },
  };
}

function createCtxStub({ contract, modelUse, version, logs }) {
  const modelContract = contract.models?.[modelUse] || {};
  const allowedRoots = new Set([
    ...uniqueStrings(contract.ctx?.baseProperties),
    ...uniqueStrings(contract.ctx?.baseMethods),
    ...uniqueStrings(modelContract.properties),
    ...uniqueStrings(modelContract.methods),
  ]);

  let resource = createResourceStub('MultiRecordResource');
  const React = createReactStub();
  const antd = createAntdProxy();
  const libs = {
    React,
    ReactDOM: {
      createRoot() {
        return {
          render() {},
          unmount() {},
        };
      },
    },
    antd,
    antdIcons: new Proxy({}, { get: () => function IconPlaceholder() { return null; } }),
    lodash: new Proxy({}, { get: () => () => undefined }),
    formula: new Proxy({}, { get: () => () => undefined }),
    math: new Proxy({}, { get: () => () => undefined }),
  };
  const logger = createLoggerStub(logs);
  const message = createMessageStub(logs, 'message');
  const notification = createMessageStub(logs, 'notification');
  const modal = createMessageStub(logs, 'modal');

  const commonValues = {
    logger,
    message,
    notification,
    modal,
    resource,
    urlSearchParams: new URLSearchParams('filterByTk=1'),
    token: 'preview-token',
    role: { name: 'admin' },
    auth: {
      locale: 'zh-CN',
      roleName: 'admin',
      token: 'preview-token',
      user: { id: 1, nickname: 'Preview user', username: 'preview' },
    },
    viewer: createVoidProxy('viewer'),
    view: { inputArgs: { filterByTk: 1 }, drawer: createNoopAsync(), dialog: createNoopAsync(), popover: createNoopAsync() },
    currentViewBlocks: [],
    collection: { name: 'tasks', filterTargetKey: 'id', getFilterByTK: () => 1 },
    collectionField: { name: 'title', type: 'string' },
    currentRecord: { id: 1, title: 'Preview task' },
    record: { id: 1, title: 'Preview task' },
    row: { id: 1, title: 'Preview task' },
    recordIndex: 0,
    value: 'Preview value',
    form: {
      getFieldsValue() {
        return { title: 'Preview task' };
      },
      setFieldsValue() {},
      submit() {},
    },
    formValues: { title: 'Preview task' },
    blockModel: { resource, collection: { name: 'tasks' } },
    actionParams: {},
    inputArgs: { preview: { version } },
    params: {},
    api: { auth: { locale: 'zh-CN' } },
    app: {},
    engine: {},
    model: { uid: 'preview-model', props: {}, constructor: { name: modelUse } },
    ref: { current: {} },
    element: { innerHTML: '', append() {}, remove() {}, nodeType: 1 },
    React,
    ReactDOM: libs.ReactDOM,
    antd,
    user: { id: 1, nickname: 'Preview user', username: 'preview' },
    locale: 'zh-CN',
    i18n: { t: (key) => key },
    libs,
  };

  const commonMethods = {
    t(key) {
      return key;
    },
    render(value) {
      logs.push({ level: 'info', message: `[render] ${safeToString(value)}` });
      return null;
    },
    async request() {
      return { data: { data: null, meta: null } };
    },
    async getVar() {
      return undefined;
    },
    defineProperty() {},
    defineMethod() {},
    async resolveJsonTemplate(value) {
      return value;
    },
    onRefReady(_ref, callback) {
      if (typeof callback === 'function') callback({ nodeType: 1 });
    },
    requireAsync: createNoopAsync(),
    importAsync: createNoopAsync(),
    initResource(type = 'MultiRecordResource') {
      resource = createResourceStub(type);
      commonValues.resource = resource;
      commonValues.blockModel.resource = resource;
      return resource;
    },
    makeResource(type = 'MultiRecordResource') {
      return createResourceStub(type);
    },
    loadCSS: createNoopAsync(),
    openView: createNoopAsync(),
    closeView: createNoopAsync(),
    refresh: createNoopAsync(),
    exit() {},
    exitAll() {},
    setValue() {},
    getValue() {
      return undefined;
    },
    setProps() {},
  };

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (!allowedRoots.has(prop)) {
          throw new Error(`Access to ctx property "${prop}" is not allowed.`);
        }
        if (Object.prototype.hasOwnProperty.call(commonMethods, prop)) return commonMethods[prop];
        if (Object.prototype.hasOwnProperty.call(commonValues, prop)) return commonValues[prop];
        return createVoidProxy(`ctx.${prop}`);
      },
      set(_target, prop, value) {
        commonValues[prop] = value;
        return true;
      },
      has(_target, prop) {
        return typeof prop === 'string' ? allowedRoots.has(prop) : false;
      },
    },
  );
}

async function executeRuntimeCode({ code, modelUse, version, contract, nocobaseRoot }) {
  const logs = [];
  const ctx = createCtxStub({ contract, modelUse, version, logs });
  const windowProxy = createSafeTopLevelWindow(contract, logs);
  const documentProxy = createSafeDocumentProxy(contract);
  const navigatorProxy = createSafeNavigatorProxy(contract);
  const { sucrase } = loadNodeModules(nocobaseRoot);
  const compiled = compileRunJSWithSucrase(code, sucrase);
  const globals = {
    ctx,
    window: windowProxy,
    document: documentProxy,
    navigator: navigatorProxy,
    console: windowProxy.console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Blob: globalThis.Blob,
    URL,
  };

  const wrapped = `(async () => {\n${compiled}\n})()`;
  const context = vm.createContext(globals, {
    codeGeneration: {
      strings: false,
      wasm: false,
    },
  });
  const script = new vm.Script(wrapped, {
    filename: `${modelUse}.runjs`,
  });

  const execution = {
    compiled,
    logs,
  };

  let timerId = null;
  try {
    const result = script.runInContext(context, { timeout: RUNJS_DEFAULT_TIMEOUT_MS });
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('Execution timed out')), RUNJS_DEFAULT_TIMEOUT_MS);
    });
    const finalValue = await Promise.race([result, timeoutPromise]);
    if (timerId) clearTimeout(timerId);
    return {
      ok: true,
      logs,
      value: finalValue,
      execution,
    };
  } catch (error) {
    if (timerId) clearTimeout(timerId);
    return {
      ok: false,
      logs,
      error,
      execution,
    };
  }
}

function classifyRuntimeError(error, { path: findingPath, modelUse }) {
  const message = safeToString(error?.message || error || 'Unknown runtime error');
  if (/Execution timed out/i.test(message)) {
    return createFinding({
      code: 'RUNJS_RUNTIME_TIMEOUT',
      message: 'RunJS sandbox execution timed out.',
      path: findingPath,
      modelUse,
      evidence: message,
    });
  }
  if (/Access to (global|document|navigator|location|ctx) property/i.test(message) || /Reading location\.href is not allowed/i.test(message)) {
    return createFinding({
      code: 'RUNJS_RUNTIME_ACCESS_DENIED',
      message,
      path: findingPath,
      modelUse,
    });
  }
  if (error instanceof ReferenceError || /\bis not defined\b/i.test(message)) {
    return createFinding({
      code: 'RUNJS_RUNTIME_REFERENCE_ERROR',
      message,
      path: findingPath,
      modelUse,
    });
  }
  return createFinding({
    severity: 'warning',
    code: 'RUNJS_RUNTIME_UNCERTAIN',
    message: `RunJS sandbox runtime produced a non-deterministic error: ${message}`,
    path: findingPath,
    modelUse,
  });
}

function sortFindings(findings) {
  return [...findings].sort((left, right) =>
    left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || String(left.modelUse || '').localeCompare(String(right.modelUse || ''))
    || Number(left.line || 0) - Number(right.line || 0)
    || Number(left.column || 0) - Number(right.column || 0));
}

function normalizeModelUseForContract(contract, modelUse) {
  if (typeof modelUse === 'string' && contract.models?.[modelUse]) {
    return modelUse;
  }
  return 'JSBlockModel';
}

function inspectStaticRunJSCodeWithContract({
  code,
  modelUse = 'JSBlockModel',
  version = 'v1',
  nocobaseRoot,
  contract,
  contractSource = 'live',
  contractWarnings = [],
  path: findingPath = '$',
} = {}) {
  const normalizedModelUse = normalizeModelUseForContract(contract, modelUse);
  const effectiveNocobaseRoot = contract?.nocobaseRoot || nocobaseRoot;
  const staticResult = inspectStaticCode({
    code,
    modelUse: normalizedModelUse,
    version,
    contract,
    nocobaseRoot: effectiveNocobaseRoot,
    path: findingPath,
  });
  const semanticResult = staticResult.ast
    ? inspectRunJSSemantics({
      code,
      ast: staticResult.ast,
      modelUse: normalizedModelUse,
      path: findingPath,
    })
    : { blockers: [], warnings: [], rewrites: [] };
  const blockers = sortFindings([...staticResult.blockers, ...semanticResult.blockers]);
  const warnings = sortFindings([...contractWarnings, ...staticResult.warnings, ...semanticResult.warnings]);

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    inspectedNode: {
      modelUse: normalizedModelUse,
      version,
      path: findingPath,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    execution: {
      attempted: false,
      source: contractSource,
      semanticBlockerCount: semanticResult.blockers.length,
      semanticWarningCount: semanticResult.warnings.length,
      autoRewriteCount: semanticResult.rewrites.length,
    },
    contractSource,
  };
}

export function inspectRunJSStaticCode({ code, modelUse = 'JSBlockModel', version = 'v1', nocobaseRoot, snapshotPath, path: findingPath = '$' } = {}) {
  const { contract, source, warnings: contractWarnings } = loadRunJSContract({ nocobaseRoot, snapshotPath });
  return inspectStaticRunJSCodeWithContract({
    code,
    modelUse,
    version,
    nocobaseRoot,
    contract,
    contractSource: source,
    contractWarnings,
    path: findingPath,
  });
}

export async function inspectRunJSCode({ code, modelUse = 'JSBlockModel', version = 'v1', nocobaseRoot, snapshotPath, path: findingPath = '$' } = {}) {
  const { contract, source, warnings: contractWarnings } = loadRunJSContract({ nocobaseRoot, snapshotPath });
  const staticOnly = inspectStaticRunJSCodeWithContract({
    code,
    modelUse,
    version,
    contract,
    nocobaseRoot,
    contractSource: source,
    contractWarnings,
    path: findingPath,
  });
  const blockers = [...staticOnly.blockers];
  const warnings = [...staticOnly.warnings];
  const inspectedNode = { ...staticOnly.inspectedNode };

  let execution = {
    attempted: false,
    source,
    semanticBlockerCount: staticOnly.execution?.semanticBlockerCount || 0,
    semanticWarningCount: staticOnly.execution?.semanticWarningCount || 0,
    autoRewriteCount: staticOnly.execution?.autoRewriteCount || 0,
  };

  if (blockers.some((item) => item.code === 'RUNJS_PARSE_ERROR' || item.code === 'RUNJS_DEPRECATED_CTX_TEMPLATE_SYNTAX')) {
    return {
      ok: blockers.length === 0,
      blockers: sortFindings(blockers),
      warnings: sortFindings(warnings),
      inspectedNode,
      execution,
      contractSource: source,
    };
  }

  try {
    execution.attempted = true;
    const runtime = await executeRuntimeCode({
      code,
      modelUse,
      version,
      contract,
      nocobaseRoot: contract?.nocobaseRoot || nocobaseRoot,
    });
    execution = {
      ...execution,
      attempted: true,
      compiled: runtime.execution?.compiled || null,
      logs: runtime.logs || [],
    };
    if (!runtime.ok) {
      const classified = classifyRuntimeError(runtime.error, { path: findingPath, modelUse });
      if (classified.severity === 'warning') {
        warnings.push(classified);
      } else {
        blockers.push(classified);
      }
    }
  } catch (error) {
    warnings.push(
      createFinding({
        severity: 'warning',
        code: 'RUNJS_SANDBOX_INCOMPLETE',
        message: `RunJS sandbox runtime could not start: ${error.message}`,
        path: findingPath,
        modelUse,
      }),
    );
  }

  inspectedNode.blockerCount = blockers.length;
  inspectedNode.warningCount = warnings.length;

  return {
    ok: blockers.length === 0,
    blockers: sortFindings(blockers),
    warnings: sortFindings(warnings),
    inspectedNode,
    execution,
    contractSource: source,
  };
}

function walkPayload(value, visitor, currentPath = '$', context = { nearestUse: null, parentKey: null }) {
  const nextNearestUse = isPlainObject(value) && typeof value.use === 'string' ? value.use : context.nearestUse;
  visitor(value, currentPath, { ...context, nearestUse: nextNearestUse });
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkPayload(item, visitor, `${currentPath}[${index}]`, { nearestUse: nextNearestUse, parentKey: String(index) }));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const separator = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
    walkPayload(child, visitor, `${currentPath}${separator}`, { nearestUse: nextNearestUse, parentKey: key });
  }
}

function isRunJSValueObject(node) {
  if (!isPlainObject(node)) return false;
  const keys = Object.keys(node);
  if (!keys.includes('code')) return false;
  if (typeof node.code !== 'string') return false;
  return keys.every((key) => ['code', 'version'].includes(key));
}

export function collectRunJSNodes(payload) {
  const nodes = [];
  const seenPaths = new Set();

  const pushNode = (pathValue, node, modelUse) => {
    if (!isPlainObject(node) || seenPaths.has(pathValue)) return;
    seenPaths.add(pathValue);
    nodes.push({
      path: pathValue,
      code: typeof node.code === 'string' ? node.code : '',
      version: typeof node.version === 'string' && node.version.trim() ? node.version.trim() : 'v1',
      modelUse: modelUse || 'JSBlockModel',
    });
  };

  walkPayload(payload, (node, pathValue, context) => {
    if (!isPlainObject(node)) return;
    const modelUse = context.nearestUse;
    if (isPlainObject(node.stepParams?.jsSettings?.runJs)) {
      pushNode(`${pathValue}.stepParams.jsSettings.runJs`, node.stepParams.jsSettings.runJs, modelUse);
    }
    if (isPlainObject(node.clickSettings?.runJs)) {
      pushNode(`${pathValue}.clickSettings.runJs`, node.clickSettings.runJs, modelUse);
    }
    if (context.parentKey !== 'runJs' && isRunJSValueObject(node)) {
      pushNode(pathValue, node, modelUse);
    }
  });

  return nodes.sort((left, right) => left.path.localeCompare(right.path));
}

export function inspectRunJSPayloadStatic({ payload, mode = 'general', nocobaseRoot, snapshotPath } = {}) {
  const { contract, source, warnings: contractWarnings } = loadRunJSContract({ nocobaseRoot, snapshotPath });
  const nodes = collectRunJSNodes(payload);
  const blockers = [];
  const warnings = [...contractWarnings];
  const inspectedNodes = [];
  let semanticBlockerCount = 0;
  let semanticWarningCount = 0;
  let autoRewriteCount = 0;

  for (const node of nodes) {
    const result = inspectStaticRunJSCodeWithContract({
      code: node.code,
      modelUse: node.modelUse,
      version: node.version,
      nocobaseRoot,
      contract,
      contractSource: source,
      contractWarnings: [],
      path: node.path,
    });
    blockers.push(...result.blockers);
    warnings.push(...result.warnings);
    semanticBlockerCount += result.execution?.semanticBlockerCount || 0;
    semanticWarningCount += result.execution?.semanticWarningCount || 0;
    autoRewriteCount += result.execution?.autoRewriteCount || 0;
    inspectedNodes.push({
      ...node,
      modelUse: result.inspectedNode.modelUse,
      blockerCount: result.blockers.length,
      warningCount: result.warnings.length,
    });
  }

  return {
    ok: blockers.length === 0,
    mode,
    blockers: sortFindings(blockers),
    warnings: sortFindings(warnings),
    inspectedNodes,
    contractSource: source,
    execution: {
      inspectedNodeCount: inspectedNodes.length,
      runtimeAttempted: false,
      semanticBlockerCount,
      semanticWarningCount,
      autoRewriteCount,
    },
  };
}

export async function inspectRunJSPayload({ payload, mode = 'general', nocobaseRoot, snapshotPath } = {}) {
  const { contract, source, warnings: contractWarnings } = loadRunJSContract({ nocobaseRoot, snapshotPath });
  const nodes = collectRunJSNodes(payload);
  const blockers = [];
  const warnings = [...contractWarnings];
  const inspectedNodes = [];
  let semanticBlockerCount = 0;
  let semanticWarningCount = 0;
  let autoRewriteCount = 0;

  if (nodes.length === 0) {
    return {
      ok: true,
      mode,
      blockers: [],
      warnings: sortFindings(warnings),
      inspectedNodes: [],
      contractSource: source,
      execution: {
        inspectedNodeCount: 0,
        semanticBlockerCount: 0,
        semanticWarningCount: 0,
        autoRewriteCount: 0,
      },
    };
  }

  for (const node of nodes) {
    const normalizedModelUse = normalizeModelUseForContract(contract, node.modelUse);
    const result = await inspectRunJSCode({
      code: node.code,
      modelUse: normalizedModelUse,
      version: node.version,
      nocobaseRoot,
      snapshotPath,
      path: node.path,
    });
    blockers.push(...result.blockers);
    warnings.push(...result.warnings);
    semanticBlockerCount += result.execution?.semanticBlockerCount || 0;
    semanticWarningCount += result.execution?.semanticWarningCount || 0;
    autoRewriteCount += result.execution?.autoRewriteCount || 0;
    inspectedNodes.push({
      ...node,
      modelUse: normalizedModelUse,
      blockerCount: result.blockers.length,
      warningCount: result.warnings.length,
    });
  }

  return {
    ok: blockers.length === 0,
    mode,
    blockers: sortFindings(blockers),
    warnings: sortFindings(warnings),
    inspectedNodes,
    contractSource: source,
    execution: {
      inspectedNodeCount: inspectedNodes.length,
      semanticBlockerCount,
      semanticWarningCount,
      autoRewriteCount,
    },
  };
}

function handleInspectCode(flags) {
  const code = readCodeInput(flags);
  return inspectRunJSCode({
    code,
    modelUse: normalizeRequiredText(flags['model-use'], 'model-use'),
    version: normalizeOptionalText(flags.version) || 'v1',
    nocobaseRoot: flags['nocobase-root'],
    snapshotPath: flags['snapshot-file'],
    path: normalizeOptionalText(flags.path) || '$',
  });
}

function handleInspectPayload(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  return inspectRunJSPayload({
    payload,
    mode: normalizeOptionalText(flags.mode) || 'general',
    nocobaseRoot: flags['nocobase-root'],
    snapshotPath: flags['snapshot-file'],
  });
}

async function main(argv) {
  try {
    const { command, flags } = parseArgs(argv);
    if (command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return;
    }

    if (command === 'refresh-contract') {
      const contract = buildRunJSContract({ nocobaseRoot: flags['nocobase-root'] });
      const targetPath = resolveSnapshotPath(flags['snapshot-file']);
      fs.writeFileSync(targetPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
      process.stdout.write(`${JSON.stringify({ ok: true, snapshotPath: path.relative(process.cwd(), targetPath) || targetPath }, null, 2)}\n`);
      return;
    }

    if (command === 'inspect-code') {
      const result = await handleInspectCode(flags);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = RUNJS_BLOCKER_EXIT_CODE;
      return;
    }

    if (command === 'inspect-payload') {
      const result = await handleInspectPayload(flags);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = RUNJS_BLOCKER_EXIT_CODE;
      return;
    }

    throw new Error(`Unknown command "${command}"`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (executedPath === path.resolve(__filename)) {
  main(process.argv.slice(2));
}
