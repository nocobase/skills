#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { buildWrappedRunJSCode, collectWrappedRunJSSemantics } from '../runtime/src/runjs-parser.js';
import {
  DEFAULT_RESOURCE_DATA,
  DEFAULT_SINGLE_RECORD_DATA,
  parseRunJSRequestTarget,
} from '../runtime/src/runjs-request-target.js';
import { maskJavaScriptSource } from '../runtime/src/source-mask.js';
import {
  RUNJS_ACTION_MODEL_USES,
  RUNJS_RENDER_MODEL_USES,
  getRunJSEffectStyle,
  getRunJSFallbackRuntimeModel,
  getRunJSSurfaceAllowedModelUses,
  getRunJSSurfaceExtraAllowedRoots,
  getRunJSSurfacePolicy,
  getRunJSSurfaceValidationModelUses,
} from '../runtime/src/surface-policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RUNJS_BLOCKER_EXIT_CODE = 2;
export const RUNJS_DEFAULT_TIMEOUT_MS = 1500;
export const DEFAULT_SNAPSHOT_PATH = path.join(__dirname, 'runjs_contract_snapshot.json');

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

const SAFE_REQUEST_TOP_LEVEL_KEYS = new Set([
  'url',
  'method',
  'params',
  'headers',
  'skipNotify',
  'skipAuth',
]);
const SAFE_REQUEST_OPTIONS_KEYS = new Set([
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
const RENDER_MODEL_USES = new Set(RUNJS_RENDER_MODEL_USES);
const ACTION_MODEL_USES = new Set(RUNJS_ACTION_MODEL_USES);
const SKILL_LOCAL_COMPAT_ROOTS = Object.freeze(['api', 'runjs']);
const LOCAL_MODEL_CONTRACTS = {
  JSActionModel: {
    properties: ['resource', 'collection'],
    methods: [],
  },
  JSFormActionModel: {
    properties: ['record', 'formValues', 'form', 'resource', 'collection'],
    methods: [],
  },
  FilterFormJSActionModel: {
    properties: ['formValues', 'form', 'resource', 'collection'],
    methods: [],
  },
  JSItemModel: {
    properties: ['record', 'formValues', 'form', 'resource', 'collection'],
    methods: ['onRefReady'],
  },
  FormJSFieldItemModel: {
    properties: ['record', 'formValues', 'form', 'resource', 'collection'],
    methods: ['setProps'],
  },
  JSItemActionModel: {
    properties: ['element', 'record', 'formValues', 'form', 'resource', 'collection'],
    methods: ['onRefReady'],
  },
};

function usage() {
  return [
    'Usage:',
    '  node scripts/runjs_guard.mjs inspect-code (--model-use <use> | --surface <surface>) --code-file <path> [--version <v1|v2>] [--snapshot-file <path>]',
    '  node scripts/runjs_guard.mjs inspect-payload --payload-file <path> [--mode <general|validation-case>] [--snapshot-file <path>]',
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

const REPAIR_METADATA_BY_CODE = {
  RUNJS_RESOURCE_REQUEST_REWRITE_REQUIRED: {
    repairClass: 'switch-to-resource-api',
    preferredFix: 'Use ctx.makeResource(...) or ctx.initResource(...) instead of ctx.request(...) for NocoBase collection:list/get.',
    suggestedSnippetIds: ['global/resource-list', 'global/resource-get'],
    retryable: true,
  },
  RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST: {
    repairClass: 'switch-to-resource-api',
    preferredFix: 'Let canonicalize rewrite static collection:list/get calls, or choose a resource API snippet directly.',
    suggestedSnippetIds: ['global/resource-list', 'global/resource-get'],
    retryable: true,
  },
  RUNJS_REQUEST_FILTER_GROUP_UNSUPPORTED: {
    repairClass: 'switch-to-resource-api',
    preferredFix: 'Use resource API with a server query filter; do not keep builder filter groups inside ctx.request(...).',
    suggestedSnippetIds: ['global/resource-list'],
    retryable: true,
  },
  RUNJS_VALUE_SURFACE_RETURN_REQUIRED: {
    repairClass: 'missing-top-level-return',
    preferredFix: 'Switch to a value-return snippet with a top-level return.',
    suggestedSnippetIds: ['value-return/subtotal', 'value-return/total-with-tax', 'value-return/copy-single-field'],
    retryable: true,
  },
  RUNJS_VALUE_SURFACE_CTX_RENDER_FORBIDDEN: {
    repairClass: 'value-surface-forbids-render',
    preferredFix: 'Remove ctx.render(...) and return the computed value.',
    suggestedSnippetIds: ['value-return/subtotal', 'value-return/total-with-tax', 'value-return/copy-single-field'],
    retryable: true,
  },
  RUNJS_RENDER_SURFACE_RENDER_REQUIRED: {
    repairClass: 'replace-innerhtml-with-render',
    preferredFix: 'Render-model surfaces must call ctx.render(...). Choose a render snippet.',
    suggestedSnippetIds: ['render/text-from-record', 'render/status-tag', 'render/null-when-empty'],
    retryable: true,
  },
  RUNJS_RENDER_TOP_LEVEL_FUNCTION_WRAPPER_FORBIDDEN: {
    repairClass: 'render-top-level-function-wrapper',
    preferredFix: 'Move the function body to the top level and call ctx.render(...) on the executed top-level path.',
    suggestedSnippetIds: ['render/text-from-record', 'render/status-tag', 'render/null-when-empty'],
    retryable: true,
  },
  RUNJS_RENDER_UNREACHABLE_RENDER_CALL: {
    repairClass: 'render-unreachable-render-call',
    preferredFix: 'Move ctx.render(...) into the top-level execution path of the render-model script.',
    suggestedSnippetIds: ['render/text-from-record', 'render/status-tag', 'render/null-when-empty'],
    retryable: true,
  },
  RUNJS_SURFACE_UNRESOLVED: {
    repairClass: 'unknown-surface-stop',
    preferredFix: 'Stop and lock the authoring surface before generating code.',
    suggestedSnippetIds: [],
    retryable: false,
  },
  RUNJS_UNKNOWN_MODEL_USE: {
    repairClass: 'unknown-model-stop',
    preferredFix: 'Inspect live model metadata and choose a known JS model or surface.',
    suggestedSnippetIds: [],
    retryable: false,
  },
  RUNJS_ELEMENT_INNERHTML_REWRITE_AVAILABLE: {
    repairClass: 'replace-innerhtml-with-render',
    preferredFix: 'Accept the deterministic ctx.render(...) rewrite.',
    suggestedSnippetIds: [],
    retryable: true,
  },
  RUNJS_ELEMENT_INNERHTML_FORBIDDEN: {
    repairClass: 'replace-innerhtml-with-render',
    preferredFix: 'Rewrite rendering with ctx.render(...) and remove later DOM dependencies.',
    suggestedSnippetIds: [],
    retryable: true,
  },
  RUNJS_FORBIDDEN_GLOBAL: {
    repairClass: 'blocked-global-stop',
    preferredFix: 'Replace forbidden globals with allowed ctx/window/navigator APIs or stop.',
    suggestedSnippetIds: [],
    retryable: false,
  },
  RUNJS_FORBIDDEN_WINDOW_PROPERTY: {
    repairClass: 'blocked-global-stop',
    preferredFix: 'Use only allowlisted window properties or a ctx API.',
    suggestedSnippetIds: [],
    retryable: false,
  },
  RUNJS_FORBIDDEN_DOCUMENT_PROPERTY: {
    repairClass: 'blocked-global-stop',
    preferredFix: 'Avoid direct DOM access unless a guarded render-model snippet explicitly allows it.',
    suggestedSnippetIds: ['global/query-selector'],
    retryable: false,
  },
  RUNJS_FORBIDDEN_NAVIGATOR_PROPERTY: {
    repairClass: 'blocked-global-stop',
    preferredFix: 'Use only allowlisted navigator properties.',
    suggestedSnippetIds: [],
    retryable: false,
  },
  RUNJS_BLOCKED_CTX_CAPABILITY: {
    repairClass: 'blocked-capability-reroute',
    preferredFix: 'Configure popup action, field popup, or event-flow behavior outside JS.',
    suggestedSnippetIds: [],
    retryable: false,
  },
  RUNJS_UNKNOWN_CTX_MEMBER: {
    repairClass: 'ctx-root-mismatch-stop',
    preferredFix: 'Switch to a surface/snippet whose ctx roots match the host, or inspect live metadata.',
    suggestedSnippetIds: [],
    retryable: false,
  },
  RUNJS_DYNAMIC_CTX_MEMBER_UNRESOLVED: {
    repairClass: 'ctx-root-mismatch-stop',
    preferredFix: 'Replace dynamic ctx[...] access with an explicit ctx.<member> call before validation.',
    suggestedSnippetIds: [],
    retryable: false,
  },
};

function enrichFindingDetails(code, details) {
  const metadata = REPAIR_METADATA_BY_CODE[code] || null;
  const baseDetails = isPlainObject(details) ? details : {};
  return metadata ? { ...metadata, ...baseDetails } : baseDetails;
}

function createFinding({ severity = 'blocker', code, message, path: findingPath = '$', modelUse = null, line = null, column = null, evidence = null, details = {} }) {
  const enrichedDetails = enrichFindingDetails(code, details);
  return {
    severity,
    code,
    message,
    path: findingPath,
    ...(modelUse ? { modelUse } : {}),
    ...(Number.isFinite(line) ? { line } : {}),
    ...(Number.isFinite(column) ? { column } : {}),
    ...(evidence ? { evidence } : {}),
    ...(isPlainObject(enrichedDetails) && Object.keys(enrichedDetails).length > 0 ? { details: enrichedDetails } : {}),
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

export function resolveSnapshotPath(input) {
  return path.resolve(
    normalizeOptionalText(input)
      || normalizeOptionalText(process.env.NOCOBASE_UI_BUILDER_RUNJS_CONTRACT_SNAPSHOT)
      || DEFAULT_SNAPSHOT_PATH,
  );
}

function loadSnapshotContract(snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  const resolved = resolveSnapshotPath(snapshotPath);
  if (!fs.existsSync(resolved)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export function loadRunJSContract({ snapshotPath } = {}) {
  const snapshot = loadSnapshotContract(snapshotPath);
  if (!snapshot) {
    throw new Error(`RunJS contract snapshot not found: ${resolveSnapshotPath(snapshotPath)}`);
  }
  return {
    contract: snapshot,
    source: 'snapshot',
    warnings: [],
  };
}

function compileRunJSCode(code) {
  const compiled = buildWrappedRunJSCode(code);
  if (compiled.compileIssues?.length) {
    const firstIssue = compiled.compileIssues[0];
    throw new Error(firstIssue?.message || 'JSX compile error');
  }
  return compiled.code;
}

function getLineColumnFromPos(code, pos) {
  const safePos = Math.max(0, Math.min(String(code ?? '').length, Number(pos) || 0));
  const before = String(code ?? '').slice(0, safePos).split('\n');
  return {
    line: before.length,
    column: before[before.length - 1].length + 1,
  };
}

function isIdentifierStartChar(char) {
  return /[A-Za-z_$]/.test(char || '');
}

function isIdentifierPartChar(char) {
  return /[\w$]/.test(char || '');
}

function skipWhitespaceIn(source, index) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  return cursor;
}

function readIdentifierFrom(source, index) {
  if (!isIdentifierStartChar(source[index])) return null;
  let cursor = index + 1;
  while (cursor < source.length && isIdentifierPartChar(source[cursor])) cursor += 1;
  return {
    value: source.slice(index, cursor),
    start: index,
    end: cursor,
  };
}

function maskRunJSSource(source) {
  return maskJavaScriptSource(source);
}

function findMatchingToken(maskedSource, openIndex, openChar, closeChar) {
  let depth = 0;
  for (let cursor = openIndex; cursor < maskedSource.length; cursor += 1) {
    const char = maskedSource[cursor];
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function parseStaticStringLiteralAt(source, index) {
  const quote = source[index];
  if (!quote || ![`'`, '"', '`'].includes(quote)) return null;
  let cursor = index + 1;
  let value = '';
  let escape = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (escape) {
      value += char;
      escape = false;
      cursor += 1;
      continue;
    }
    if (char === '\\') {
      escape = true;
      cursor += 1;
      continue;
    }
    if (quote === '`' && char === '$' && source[cursor + 1] === '{') {
      return null;
    }
    if (char === quote) {
      return {
        value,
        start: index,
        end: cursor + 1,
      };
    }
    value += char;
    cursor += 1;
  }
  return null;
}

function skipExpressionSource(maskedSource, index, stopChars = new Set([',', ';', '}', ']'])) {
  let cursor = index;
  while (cursor < maskedSource.length) {
    const char = maskedSource[cursor];
    if (char === '{') {
      const end = findMatchingToken(maskedSource, cursor, '{', '}');
      cursor = end >= 0 ? end + 1 : maskedSource.length;
      continue;
    }
    if (char === '[') {
      const end = findMatchingToken(maskedSource, cursor, '[', ']');
      cursor = end >= 0 ? end + 1 : maskedSource.length;
      continue;
    }
    if (char === '(') {
      const end = findMatchingToken(maskedSource, cursor, '(', ')');
      cursor = end >= 0 ? end + 1 : maskedSource.length;
      continue;
    }
    if (stopChars.has(char)) break;
    cursor += 1;
  }
  return cursor;
}

function createRunJSScan(source) {
  const normalizedSource = String(source ?? '');
  return {
    source: normalizedSource,
    masked: maskRunJSSource(normalizedSource),
  };
}

function parseRunJSSourceForSyntax(code) {
  const parsed = collectWrappedRunJSSemantics(code);
  new vm.Script(parsed.wrappedCode, {
    filename: 'runjs.syntax-check.js',
  });
  return {
    ...createRunJSScan(parsed.code),
    wrappedAst: parsed.ast,
    wrappedBody: parsed.wrappedBody,
    wrappedStatements: parsed.wrappedStatements,
    semanticNodes: parsed.semantics,
    sourceOffset: parsed.sourceOffset,
  };
}

function collectSimpleInitializers(source, masked) {
  const initializers = new Map();
  const staticStrings = new Map();
  const regex = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  let match = regex.exec(masked);
  while (match) {
    const name = match[1];
    const valueStart = skipWhitespaceIn(source, regex.lastIndex);
    const valueEnd = skipExpressionSource(masked, valueStart, new Set([';', '\n']));
    const valueSource = source.slice(valueStart, valueEnd).trim();
    if (valueSource) {
      initializers.set(name, {
        source: valueSource,
        start: valueStart,
        end: valueEnd,
      });
    }
    const literal = parseStaticStringLiteralAt(source, valueStart);
    if (literal) {
      staticStrings.set(name, literal.value);
    }
    regex.lastIndex = Math.max(regex.lastIndex, valueEnd);
    match = regex.exec(masked);
  }
  return { initializers, staticStrings };
}

function collectDeclaredNames(masked) {
  const declared = new Set(KNOWN_BARE_GLOBALS);
  for (const regex of [
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
  ]) {
    let match = regex.exec(masked);
    while (match) {
      declared.add(match[1]);
      match = regex.exec(masked);
    }
  }

  for (const regex of [/\bfunction(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g, /\(([^)]*)\)\s*=>/g]) {
    let match = regex.exec(masked);
    while (match) {
      for (const part of String(match[1] || '').split(',')) {
        const identifier = part.trim().match(/^([A-Za-z_$][\w$]*)/);
        if (identifier) declared.add(identifier[1]);
      }
      match = regex.exec(masked);
    }
  }

  const simpleArrowRegex = /\b([A-Za-z_$][\w$]*)\s*=>/g;
  let simpleArrow = simpleArrowRegex.exec(masked);
  while (simpleArrow) {
    declared.add(simpleArrow[1]);
    simpleArrow = simpleArrowRegex.exec(masked);
  }

  return declared;
}

function parseMemberChain(source, masked, index, staticStrings = new Map()) {
  const root = readIdentifierFrom(masked, index);
  if (!root) return null;
  const segments = [root.value];
  const segmentStarts = [root.start];
  let cursor = root.end;
  let dynamicComputed = false;
  let dynamicComputedStart = null;

  while (cursor < masked.length) {
    let before = skipWhitespaceIn(masked, cursor);
    let optional = false;
    if (masked[before] === '?' && masked[before + 1] === '.') {
      optional = true;
      before += 2;
    } else if (masked[before] === '.') {
      before += 1;
    } else if (masked[before] === '[') {
      optional = false;
    } else {
      break;
    }

    if (masked[before] === '[') {
      const bracketStart = before;
      let inner = skipWhitespaceIn(source, bracketStart + 1);
      const literal = parseStaticStringLiteralAt(source, inner);
      if (literal) {
        inner = skipWhitespaceIn(source, literal.end);
        if (masked[inner] === ']') {
          segments.push(literal.value);
          segmentStarts.push(literal.start);
          cursor = inner + 1;
          continue;
        }
      }
      const identifier = readIdentifierFrom(masked, inner);
      if (identifier && staticStrings.has(identifier.value)) {
        const afterIdentifier = skipWhitespaceIn(source, identifier.end);
        if (masked[afterIdentifier] === ']') {
          segments.push(staticStrings.get(identifier.value));
          segmentStarts.push(identifier.start);
          cursor = afterIdentifier + 1;
          continue;
        }
      }
      dynamicComputed = true;
      dynamicComputedStart = inner;
      const bracketEnd = findMatchingToken(masked, bracketStart, '[', ']');
      return {
        segments,
        segmentStarts,
        start: root.start,
        end: bracketEnd >= 0 ? bracketEnd + 1 : masked.length,
        dynamicComputed,
        dynamicComputedStart,
      };
    }

    before = skipWhitespaceIn(masked, before);
    const nextIdentifier = readIdentifierFrom(masked, before);
    if (!nextIdentifier) {
      if (optional) cursor = before;
      break;
    }
    segments.push(nextIdentifier.value);
    segmentStarts.push(nextIdentifier.start);
    cursor = nextIdentifier.end;
  }

  return {
    segments,
    segmentStarts,
    start: root.start,
    end: cursor,
    dynamicComputed,
    dynamicComputedStart,
  };
}

function previousSignificantChar(source, index) {
  const cursor = previousSignificantIndex(source, index);
  return cursor >= 0 ? source[cursor] : '';
}

function previousSignificantIndex(source, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
  return cursor;
}

function nextSignificantIndex(source, index) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  return cursor;
}

function isObjectPropertyKeyLike(masked, start, end) {
  const previousChar = previousSignificantChar(masked, start);
  const nextIndex = skipWhitespaceIn(masked, end);
  return (previousChar === '{' || previousChar === ',') && masked[nextIndex] === ':';
}

function forEachMemberChain(scan, staticStrings, visitor) {
  const { source, masked } = scan;
  for (let index = 0; index < masked.length; index += 1) {
    if (!isIdentifierStartChar(masked[index])) continue;
    const previousChar = masked[index - 1] || '';
    if (isIdentifierPartChar(previousChar) || previousChar === '.') continue;
    const chain = parseMemberChain(source, masked, index, staticStrings);
    if (!chain) continue;
    if (!isObjectPropertyKeyLike(masked, chain.start, chain.end)) {
      visitor(chain);
    }
    index = Math.max(index, chain.end - 1);
  }
}

function isCallAfter(masked, index) {
  return masked[skipWhitespaceIn(masked, index)] === '(';
}

function parseObjectPropertiesFromSource(source, masked, startIndex = 0) {
  const start = skipWhitespaceIn(source, startIndex);
  if (masked[start] !== '{') return null;
  const end = findMatchingToken(masked, start, '{', '}');
  if (end < 0) return null;
  const properties = new Map();
  let cursor = start + 1;
  while (cursor < end) {
    cursor = skipWhitespaceIn(source, cursor);
    if (cursor >= end) break;
    if (masked[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (masked.slice(cursor, cursor + 3) === '...') {
      return { ok: false, reason: '对象参数包含 spread，当前无法安全改写。', properties, end };
    }

    let key = null;
    const stringKey = parseStaticStringLiteralAt(source, cursor);
    if (stringKey) {
      key = stringKey.value;
      cursor = stringKey.end;
    } else {
      const identifier = readIdentifierFrom(masked, cursor);
      if (!identifier) {
        return { ok: false, reason: '对象参数存在无法解析的 key。', properties, end };
      }
      key = identifier.value;
      cursor = identifier.end;
    }

    cursor = skipWhitespaceIn(source, cursor);
    let valueStart = cursor;
    let valueEnd = cursor;
    if (masked[cursor] === ':') {
      valueStart = skipWhitespaceIn(source, cursor + 1);
      valueEnd = skipExpressionSource(masked, valueStart, new Set([',', '}']));
    } else {
      valueEnd = cursor;
    }

    properties.set(key, {
      key,
      valueSource: source.slice(valueStart, valueEnd).trim() || key,
      valueStart,
      valueEnd,
    });

    cursor = skipWhitespaceIn(source, valueEnd);
    if (masked[cursor] === ',') cursor += 1;
  }

  return {
    ok: true,
    reason: null,
    properties,
    start,
    end,
  };
}

function resolveInitializerSource(valueSource, initializers, seen = new Set()) {
  const trimmed = String(valueSource ?? '').trim();
  if (!IDENTIFIER_KEY_RE.test(trimmed) || !initializers.has(trimmed) || seen.has(trimmed)) {
    return trimmed;
  }
  seen.add(trimmed);
  return resolveInitializerSource(initializers.get(trimmed).source, initializers, seen);
}

function inspectObjectSource(valueSource, initializers) {
  const resolvedSource = resolveInitializerSource(valueSource, initializers);
  const scan = createRunJSScan(resolvedSource);
  const result = parseObjectPropertiesFromSource(scan.source, scan.masked, 0);
  if (!result) {
    return {
      ok: false,
      reason: '参数不是静态对象字面量。',
      properties: new Map(),
    };
  }
  return result;
}

function looksLikeFilterGroupSource(valueSource, initializers) {
  const resolvedSource = resolveInitializerSource(valueSource, initializers);
  const scan = createRunJSScan(resolvedSource);
  const objectInfo = parseObjectPropertiesFromSource(scan.source, scan.masked, 0);
  if (!objectInfo?.ok) return false;
  return objectInfo.properties.has('logic') && objectInfo.properties.has('items');
}

function propertyStaticString(property, initializers) {
  if (!property) return null;
  const resolved = resolveInitializerSource(property.valueSource, initializers);
  const literal = parseStaticStringLiteralAt(resolved, skipWhitespaceIn(resolved, 0));
  return literal?.value ?? null;
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

function createEmptyPropertyInspection() {
  return {
    ok: true,
    reason: null,
    properties: new Map(),
  };
}

function inspectOptionalObjectExpression(node, env) {
  return node ? inspectObjectExpression(node, env) : createEmptyPropertyInspection();
}

function inspectCtxRequestCallExpressionInput(callNode, env) {
  const firstArg = Array.isArray(callNode?.arguments) ? callNode.arguments[0] : null;
  if (!firstArg) return null;

  const resolvedFirstArg = resolveExpressionNode(firstArg, env);
  if (resolvedFirstArg?.type === 'ObjectExpression') {
    const configInfo = inspectObjectExpression(firstArg, env);
    if (!configInfo.ok) return null;

    const urlProperty = configInfo.properties.get('url');
    const urlValue = urlProperty ? resolveStaticString(urlProperty.value, env) : null;
    if (!urlValue) return null;

    return {
      target: parseRunJSRequestTarget(urlValue),
      configInfo,
      methodValue: resolveStaticString(configInfo.properties.get('method')?.value, env),
      topLevelKeys: SAFE_REQUEST_TOP_LEVEL_KEYS,
    };
  }

  const urlValue = resolveStaticString(firstArg, env);
  if (!urlValue) return null;

  const configInfo = inspectOptionalObjectExpression(callNode.arguments[1], env);
  if (!configInfo.ok) return null;

  return {
    target: parseRunJSRequestTarget(urlValue),
    configInfo,
    methodValue: resolveStaticString(configInfo.properties.get('method')?.value, env),
    topLevelKeys: SAFE_REQUEST_OPTIONS_KEYS,
  };
}

function isCtxMemberExpression(node, name) {
  return node?.type === 'MemberExpression'
    && node.object?.type === 'Identifier'
    && node.object.name === 'ctx'
    && resolveRootMemberName(node) === name;
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

function analyzeInnerHTMLAssignment({ node, ancestors, code, env, modelUse, findingModelUse = modelUse, path: findingPath }) {
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
          modelUse: findingModelUse,
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
        modelUse: findingModelUse,
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

function createCtxRequestAuthCheckResult({
  target,
  path,
  modelUse,
  line,
  column,
  start,
  end,
}) {
  return {
    findings: [
      createFinding({
        severity: 'warning',
        code: 'RUNJS_AUTH_CHECK_REDUNDANT',
        message: '读取当前登录用户时不应再请求 auth:check；优先使用 ctx.user 或 ctx.auth?.user。',
        path,
        modelUse,
        line,
        column,
        details: {
          url: target.normalized,
        },
      }),
    ],
    rewrite: {
      start,
      end,
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

function createCtxRequestRewriteRequiredResult({
  code = 'RUNJS_RESOURCE_REQUEST_REWRITE_REQUIRED',
  message,
  target,
  path,
  modelUse,
  line,
  column,
  details = {},
}) {
  return {
    findings: [
      createFinding({
        code,
        message,
        path,
        modelUse,
        line,
        column,
        details: {
          url: target.normalized,
          ...details,
        },
      }),
    ],
    rewrite: null,
  };
}

function createCtxRequestResourceRewriteResult({
  target,
  path,
  modelUse,
  line,
  column,
  start,
  end,
  replacement,
  includeFilterTransform = false,
}) {
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

  if (includeFilterTransform) {
    transforms.unshift({
      code: 'RUNJS_REQUEST_FILTER_GROUP_TO_QUERY_FILTER',
      message: `把 ${target.normalized} 请求里的 builder filter 自动收敛为服务端 query filter。`,
      details: {
        url: target.normalized,
      },
    });
  }

  return {
    findings: [
      createFinding({
        severity: 'warning',
        code: 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST',
        message: `读取 NocoBase 资源 "${target.normalized}" 时不应默认使用 ctx.request；应优先改写为 ${target.action === 'get' ? 'SingleRecordResource' : 'MultiRecordResource'}。`,
        path,
        modelUse,
        line,
        column,
        details: {
          url: target.normalized,
          resourceName: target.resourceName,
          action: target.action,
        },
      }),
    ],
    rewrite: {
      start,
      end,
      replacement,
      transforms,
    },
  };
}

function analyzeResolvedCtxRequestCall({
  requestInfo,
  path,
  modelUse,
  line,
  column,
  start,
  end,
  inspectParams,
  isFilterGroup,
  createReplacement,
}) {
  if (!requestInfo?.target) {
    return null;
  }

  const { configInfo, methodValue, target, topLevelKeys } = requestInfo;
  if (methodValue && methodValue.toLowerCase() !== 'get') {
    return null;
  }

  if (target.kind === 'auth-check') {
    return createCtxRequestAuthCheckResult({
      target,
      path,
      modelUse,
      line,
      column,
      start,
      end,
    });
  }

  const unsupportedTopLevelKeys = [...configInfo.properties.keys()].filter((key) => !topLevelKeys.has(key));
  if (unsupportedTopLevelKeys.length > 0) {
    return createCtxRequestRewriteRequiredResult({
      message: `ctx.request 命中了资源读取接口 "${target.normalized}"，但包含当前无法安全改写的顶层参数：${unsupportedTopLevelKeys.join(', ')}。请改用 resource API。`,
      target,
      path,
      modelUse,
      line,
      column,
      details: {
        unsupportedTopLevelKeys,
      },
    });
  }

  let paramsInfo = createEmptyPropertyInspection();
  const paramsProperty = configInfo.properties.get('params');
  if (paramsProperty) {
    paramsInfo = inspectParams(paramsProperty);
    if (!paramsInfo.ok) {
      const filterUnsupported = isFilterGroup(paramsProperty);
      return createCtxRequestRewriteRequiredResult({
        code: filterUnsupported ? 'RUNJS_REQUEST_FILTER_GROUP_UNSUPPORTED' : 'RUNJS_RESOURCE_REQUEST_REWRITE_REQUIRED',
        message: filterUnsupported
          ? `ctx.request 命中了资源读取接口 "${target.normalized}"，且 filter 使用了 builder 风格结构，但 params 不是可安全改写的静态对象。请改用 resource API 或服务端 query filter。`
          : `ctx.request 命中了资源读取接口 "${target.normalized}"，但 params 当前不是可安全改写的静态对象。请改用 resource API。`,
        target,
        path,
        modelUse,
        line,
        column,
        details: {
          reason: paramsInfo.reason,
        },
      });
    }
  }

  const unsupportedParamKeys = [...paramsInfo.properties.keys()].filter((key) => !SAFE_REQUEST_PARAM_KEYS.has(key));
  if (unsupportedParamKeys.length > 0) {
    return createCtxRequestRewriteRequiredResult({
      message: `ctx.request 命中了资源读取接口 "${target.normalized}"，但 params 包含当前无法安全改写的字段：${unsupportedParamKeys.join(', ')}。请改用 resource API。`,
      target,
      path,
      modelUse,
      line,
      column,
      details: {
        unsupportedParamKeys,
      },
    });
  }

  const filterProperty = paramsInfo.properties.get('filter');
  return createCtxRequestResourceRewriteResult({
    target,
    path,
    modelUse,
    line,
    column,
    start,
    end,
    replacement: createReplacement({ target, configInfo, paramsInfo }),
    includeFilterTransform: Boolean(filterProperty && isFilterGroup(filterProperty)),
  });
}

function analyzeCtxRequestCall({ callNode, code, env, modelUse, findingModelUse = modelUse, path: findingPath }) {
  return analyzeResolvedCtxRequestCall({
    requestInfo: inspectCtxRequestCallExpressionInput(callNode, env),
    path: findingPath,
    modelUse: findingModelUse,
    line: callNode.loc?.start?.line ?? null,
    column: callNode.loc?.start?.column != null ? callNode.loc.start.column + 1 : null,
    start: callNode.start,
    end: callNode.end,
    inspectParams: (property) => inspectObjectExpression(property.value, env),
    isFilterGroup: (property) => looksLikeFilterGroupExpression(property.value, env),
    createReplacement: ({ target, configInfo, paramsInfo }) => createResourceRequestIIFE({
      code,
      target,
      configInfo,
      paramsInfo,
      actionName: target.action,
    }),
  });
}

function createResourceRequestIIFEFromProperties({
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
    lines.push(`  __runjsResource.${methodName}(${property.valueSource});`);
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
    lines.push(`  __runjsResource.setFilter(${buildFilterNormalizerExpression(filterProperty.valueSource)});`);
  }

  const actionOptionEntries = [];
  for (const key of ['headers', 'skipNotify', 'skipAuth']) {
    const property = configInfo.properties.get(key);
    if (property) {
      actionOptionEntries.push(`${formatObjectKey(key)}: ${property.valueSource}`);
    }
  }

  const extraParamEntries = [];
  for (const [key, property] of params.entries()) {
    if (['page', 'pageSize', 'sort', 'fields', 'appends', 'except', 'filter', 'filterByTk'].includes(key)) {
      continue;
    }
    extraParamEntries.push(`${formatObjectKey(key)}: ${property.valueSource}`);
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

function inspectOptionalObjectSource(valueSource, initializers) {
  return valueSource ? inspectObjectSource(valueSource, initializers) : createEmptyPropertyInspection();
}

function parseCallArgumentSources(source, masked, openParenIndex, closeParenIndex) {
  const args = [];
  let cursor = skipWhitespaceIn(source, openParenIndex + 1);

  while (cursor < closeParenIndex) {
    if (masked[cursor] === ')') break;
    const valueStart = cursor;
    const valueEnd = skipExpressionSource(masked, valueStart, new Set([',', ')']));
    args.push({
      valueSource: source.slice(valueStart, valueEnd).trim(),
      valueStart,
      valueEnd,
    });
    cursor = skipWhitespaceIn(source, valueEnd);
    if (cursor >= closeParenIndex || masked[cursor] !== ',') break;
    cursor = skipWhitespaceIn(source, cursor + 1);
  }

  return args;
}

function inspectCtxRequestCallSourceInput({ chain, scan, initializers }) {
  const { source, masked } = scan;
  const openParenIndex = skipWhitespaceIn(masked, chain.end);
  if (masked[openParenIndex] !== '(') return null;
  const closeParenIndex = findMatchingToken(masked, openParenIndex, '(', ')');
  if (closeParenIndex < 0) return null;

  const args = parseCallArgumentSources(source, masked, openParenIndex, closeParenIndex);
  const firstArg = args[0];
  if (!firstArg?.valueSource) return null;

  const resolvedFirstArgSource = resolveInitializerSource(firstArg.valueSource, initializers);
  const firstArgLiteral = parseStaticStringLiteralAt(
    resolvedFirstArgSource,
    skipWhitespaceIn(resolvedFirstArgSource, 0),
  );

  if (firstArgLiteral) {
    const configInfo = inspectOptionalObjectSource(args[1]?.valueSource, initializers);
    if (!configInfo.ok) return null;

    return {
      callStart: chain.start,
      callEnd: closeParenIndex + 1,
      target: parseRunJSRequestTarget(firstArgLiteral.value),
      configInfo,
      methodValue: propertyStaticString(configInfo.properties.get('method'), initializers),
      topLevelKeys: SAFE_REQUEST_OPTIONS_KEYS,
    };
  }

  const configInfo = inspectObjectSource(firstArg.valueSource, initializers);
  if (!configInfo.ok) return null;

  const urlValue = propertyStaticString(configInfo.properties.get('url'), initializers);
  if (!urlValue) return null;

  return {
    callStart: chain.start,
    callEnd: closeParenIndex + 1,
    target: parseRunJSRequestTarget(urlValue),
    configInfo,
    methodValue: propertyStaticString(configInfo.properties.get('method'), initializers),
    topLevelKeys: SAFE_REQUEST_TOP_LEVEL_KEYS,
  };
}

function analyzeCtxRequestCallFromSource({ chain, scan, initializers, modelUse, findingModelUse = modelUse, path: findingPath }) {
  const { source } = scan;
  const loc = getLineColumnFromPos(source, chain.start);
  const requestInfo = inspectCtxRequestCallSourceInput({ chain, scan, initializers });
  return analyzeResolvedCtxRequestCall({
    requestInfo,
    path: findingPath,
    modelUse: findingModelUse,
    line: loc.line,
    column: loc.column,
    start: requestInfo?.callStart ?? null,
    end: requestInfo?.callEnd ?? null,
    inspectParams: (property) => inspectObjectSource(property.valueSource, initializers),
    isFilterGroup: (property) => looksLikeFilterGroupSource(property.valueSource, initializers),
    createReplacement: ({ target, configInfo, paramsInfo }) => createResourceRequestIIFEFromProperties({
      target,
      configInfo,
      paramsInfo,
      actionName: target.action,
    }),
  });
}

function collectElementAliasNames(initializers) {
  const aliases = new Set();
  for (const [name, initializer] of initializers.entries()) {
    if (/^ctx\s*(?:\?\.|\.)\s*element$/.test(maskRunJSSource(initializer.source).replace(/\s+/g, ''))) {
      aliases.add(name);
    }
  }
  return aliases;
}

function collectOnRefReadyParamNames(source, masked) {
  const names = new Set();
  const regex = /\bctx\s*(?:\?\.|\.)\s*onRefReady\s*\(/g;
  let match = regex.exec(masked);
  while (match) {
    const openParenIndex = masked.indexOf('(', match.index);
    const closeParenIndex = findMatchingToken(masked, openParenIndex, '(', ')');
    if (closeParenIndex < 0) break;
    const argsSource = source.slice(openParenIndex + 1, closeParenIndex);
    const arrowMatch = argsSource.match(/,\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/);
    const functionMatch = argsSource.match(/,\s*function\s*\(\s*([A-Za-z_$][\w$]*)/);
    const paramName = arrowMatch?.[1] || functionMatch?.[1] || null;
    if (paramName) names.add(paramName);
    regex.lastIndex = closeParenIndex + 1;
    match = regex.exec(masked);
  }
  return names;
}

function hasLaterElementReference(maskedRemainder, targetLabel) {
  if (targetLabel === 'ctx.element') {
    return /\bctx\s*(?:\?\.|\.)\s*element\s*(?:\?\.|\.)\s*(?!innerHTML\b)[A-Za-z_$]/.test(maskedRemainder);
  }
  const escaped = targetLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\s*(?:\\?\\.|\\.)\\s*(?!innerHTML\\b)[A-Za-z_$]`).test(maskedRemainder);
}

function analyzeInnerHTMLAssignmentsFromSource({ scan, initializers, modelUse, findingModelUse = modelUse, path: findingPath }) {
  if (!isRenderModelUse(modelUse)) {
    return {
      findings: [],
      rewrites: [],
    };
  }

  const findings = [];
  const rewrites = [];
  const aliases = collectElementAliasNames(initializers);
  const refReadyParams = collectOnRefReadyParamNames(scan.source, scan.masked);

  forEachMemberChain(scan, new Map(), (chain) => {
    const segments = chain.segments;
    if (segments.at(-1) !== 'innerHTML') return;

    let targetLabel = null;
    if (segments[0] === 'ctx' && segments[1] === 'element' && segments.length === 3) {
      targetLabel = 'ctx.element';
    } else if (segments.length === 2 && (aliases.has(segments[0]) || refReadyParams.has(segments[0]))) {
      targetLabel = segments[0];
    }
    if (!targetLabel) return;

    const operatorIndex = skipWhitespaceIn(scan.source, chain.end);
    if (scan.masked[operatorIndex] !== '=' || scan.masked[operatorIndex + 1] === '=' || scan.masked[operatorIndex - 1] === '=') {
      return;
    }

    const valueStart = skipWhitespaceIn(scan.source, operatorIndex + 1);
    const valueEnd = skipExpressionSource(scan.masked, valueStart, new Set([';']));
    const statementEnd = scan.masked[valueEnd] === ';' ? valueEnd + 1 : valueEnd;
    const valueSource = scan.source.slice(valueStart, valueEnd).trim() || 'undefined';
    const loc = getLineColumnFromPos(scan.source, chain.segmentStarts.at(-1) ?? chain.start);
    const laterSource = scan.masked.slice(statementEnd);

    if (hasLaterElementReference(laterSource, targetLabel)) {
      findings.push(
        createFinding({
          code: 'RUNJS_ELEMENT_INNERHTML_FORBIDDEN',
          message: '渲染型 JS model 不允许直接写 innerHTML；请改用 ctx.render(...)，或先移除后续 DOM 依赖再重写。',
          path: findingPath,
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
          details: {
            target: targetLabel,
            operator: '=',
          },
        }),
      );
      return;
    }

    findings.push(
      createFinding({
        severity: 'warning',
        code: 'RUNJS_ELEMENT_INNERHTML_REWRITE_AVAILABLE',
        message: '渲染型 JS model 不应直接写 innerHTML；当前赋值可自动改写为 ctx.render(...)。',
        path: findingPath,
        modelUse: findingModelUse,
        line: loc.line,
        column: loc.column,
        details: {
          target: targetLabel,
        },
      }),
    );
    rewrites.push({
      start: chain.start,
      end: statementEnd,
      replacement: `ctx.render(${valueSource});`,
      transforms: [
        {
          code: 'RUNJS_ELEMENT_INNERHTML_TO_CTX_RENDER',
          message: '把 ctx.element.innerHTML 赋值改写为 ctx.render(...)。',
        },
      ],
    });
  });

  return {
    findings,
    rewrites,
  };
}

function collectCtxRequestRewritesFromAst({ scan, initializers, modelUse, findingModelUse, path: findingPath }) {
  const rewrites = [];
  for (const entry of scan.semanticNodes?.ctxRequestCalls || []) {
    const chain = {
      segments: ['ctx', ...String(entry.path || '').split('.').filter(Boolean)],
      start: entry.calleeStart ?? entry.start,
      end: entry.calleeEnd ?? entry.end,
      dynamicComputed: false,
      segmentStarts: [],
    };
    const result = analyzeCtxRequestCallFromSource({
      chain,
      scan,
      initializers,
      modelUse,
      findingModelUse,
      path: findingPath,
    });
    if (result?.rewrite) {
      rewrites.push(result.rewrite);
    }
  }
  return rewrites;
}

function collectInnerHTMLRewritesFromSource({ scan, initializers, modelUse, findingModelUse, path: findingPath }) {
  return analyzeInnerHTMLAssignmentsFromSource({
    scan,
    initializers,
    modelUse,
    findingModelUse,
    path: findingPath,
  }).rewrites;
}

function inspectRunJSSemantics({ code, modelUse = 'JSBlockModel', findingModelUse = modelUse, path: findingPath = '$' }) {
  let scan = null;
  try {
    scan = parseRunJSSourceForSyntax(code);
  } catch (error) {
    return {
      blockers: [
        createFinding({
          code: 'RUNJS_PARSE_ERROR',
          message: `Syntax error: ${error.message}`,
          path: findingPath,
          modelUse: findingModelUse,
        }),
      ],
      warnings: [],
      rewrites: [],
    };
  }

  const findings = [];
  const { initializers } = collectSimpleInitializers(scan.source, scan.masked);
  const env = collectVariableInitializers(scan.wrappedBody || scan.wrappedAst);

  for (const entry of scan.semanticNodes?.ctxRequestCalls || []) {
    const result = analyzeCtxRequestCall({
      callNode: entry.node,
      code: scan.source,
      env,
      modelUse,
      findingModelUse,
      path: findingPath,
    });
    if (!result) continue;
    findings.push(...(result.findings || []));
  }

  for (const entry of scan.semanticNodes?.innerHTMLAssignments || []) {
    const result = analyzeInnerHTMLAssignment({
      node: entry.node,
      ancestors: entry.ancestors,
      code: scan.source,
      env,
      modelUse,
      findingModelUse,
      path: findingPath,
    });
    if (!result) continue;
    findings.push(...(result.findings || []));
  }

  const rewrites = [
    ...collectCtxRequestRewritesFromAst({
      scan,
      initializers,
      modelUse,
      findingModelUse,
      path: findingPath,
    }),
    ...collectInnerHTMLRewritesFromSource({
      scan,
      initializers,
      modelUse,
      findingModelUse,
      path: findingPath,
    }),
  ];

  return {
    blockers: findings.filter((item) => item.severity !== 'warning'),
    warnings: findings.filter((item) => item.severity === 'warning'),
    rewrites: rewrites.sort((left, right) => right.start - left.start),
  };
}

export function canonicalizeRunJSCode({
  code,
  modelUse = 'JSBlockModel',
  findingModelUse = modelUse,
  version = 'v1',
  path: findingPath = '$',
} = {}) {
  const src = String(code ?? '');
  try {
    parseRunJSSourceForSyntax(src);
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
          modelUse: findingModelUse,
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
    modelUse,
    findingModelUse,
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

export function canonicalizeRunJSPayload({ payload, snapshotPath } = {}) {
  const { contract } = loadRunJSContract({ snapshotPath });
  const transforms = [];
  const unresolved = [];
  const surfaceStats = new Map();
  let autoRewriteCount = 0;
  let semanticBlockerCount = 0;
  let semanticWarningCount = 0;

  const addSurfaceStats = (surface, { blockerCount = 0, warningCount = 0 } = {}) => {
    const key = normalizeOptionalText(surface) || 'runjs.unknown';
    const current = surfaceStats.get(key) || { nodeCount: 0, blockerCount: 0, warningCount: 0 };
    current.nodeCount += 1;
    current.blockerCount += blockerCount;
    current.warningCount += warningCount;
    surfaceStats.set(key, current);
  };

  visitRunJSNodes(payload, (item) => {
    const policy = resolveRunJSInspectionPolicy(contract, {
      modelUse: item.modelUse,
      surface: item.surface,
      path: item.path,
    });
    if (!policy.ok) {
      const policyBlockerCount = (policy.blockers || []).length;
      semanticBlockerCount += policyBlockerCount;
      addSurfaceStats(item.surface, { blockerCount: policyBlockerCount });
      for (const finding of policy.blockers || []) {
        unresolved.push({
          code: finding.code,
          message: finding.message,
          path: item.path,
          modelUse: finding.modelUse,
          ...(finding.details ? { details: finding.details } : {}),
        });
      }
      return;
    }

    const writeNormalization = normalizeRunJSCodeForWrite(item.code);
    if (writeNormalization.changed) {
      item.setCode?.(writeNormalization.code);
    }

    const result = canonicalizeRunJSCode({
      code: writeNormalization.code,
      modelUse: policy.modelUse,
      findingModelUse: policy.findingModelUse,
      version: item.version,
      path: item.path,
    });
    if (result.changed) {
      item.setCode?.(result.code);
    }
    autoRewriteCount += (writeNormalization.semantic?.autoRewriteCount || 0) + (result.semantic?.autoRewriteCount || 0);
    semanticBlockerCount += (writeNormalization.semantic?.blockerCount || 0) + (result.semantic?.blockerCount || 0);
    semanticWarningCount += (writeNormalization.semantic?.warningCount || 0) + (result.semantic?.warningCount || 0);
    addSurfaceStats(policy.surface, {
      blockerCount: (writeNormalization.semantic?.blockerCount || 0) + (result.semantic?.blockerCount || 0),
      warningCount: (writeNormalization.semantic?.warningCount || 0) + (result.semantic?.warningCount || 0),
    });
    for (const transform of writeNormalization.transforms || []) {
      transforms.push({
        ...transform,
        path: item.path,
      });
    }
    for (const transform of result.transforms || []) {
      transforms.push({
        ...transform,
        path: item.path,
      });
    }
    for (const unresolvedItem of result.unresolved || []) {
      unresolved.push({
        ...unresolvedItem,
        path: item.path,
      });
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
      hasAutoRewrite: autoRewriteCount > 0,
      repairClassSummary: summarizeRepairClasses(unresolved),
      surfaceSummary: Object.fromEntries([...surfaceStats.entries()].sort(([left], [right]) => left.localeCompare(right))),
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

function resolveStaticStringNodeValue(node, staticStrings = new Map()) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'Identifier' && staticStrings.has(node.name)) return staticStrings.get(node.name);
  if (
    node?.type === 'TemplateLiteral'
    && Array.isArray(node.expressions)
    && node.expressions.length === 0
    && Array.isArray(node.quasis)
  ) {
    return node.quasis.map((item) => item.value?.cooked ?? item.value?.raw ?? '').join('');
  }
  return null;
}

function collectStaticStringBindings(ast) {
  const bindings = new Map();
  traverseAst(ast, (node, ancestors) => {
    if (
      node?.type !== 'VariableDeclarator'
      || node.id?.type !== 'Identifier'
      || !node.init
    ) {
      return;
    }
    const declaration = ancestors[ancestors.length - 1];
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') return;
    const value = resolveStaticStringNodeValue(node.init, bindings);
    if (typeof value === 'string') {
      bindings.set(node.id.name, value);
    }
  });
  return bindings;
}

function resolveRootMemberName(node, staticStrings = new Map()) {
  if (!node) return null;
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
  if (node.computed) return resolveStaticStringNodeValue(node.property, staticStrings);
  return null;
}

function inspectStaticCode({
  code,
  modelUse,
  findingModelUse = modelUse,
  version,
  contract,
  path: findingPath,
  allowedCtxRoots,
  surfaceStyle = 'render',
}) {
  const findings = { items: [], _seen: new Set() };
  const warnings = { items: [], _seen: new Set() };
  const src = String(code ?? '');
  const effectiveAllowedCtxRoots = allowedCtxRoots instanceof Set
    ? allowedCtxRoots
    : buildAllowedCtxRoots(contract, [modelUse]);

  const deprecatedTemplate = detectDeprecatedTemplateSyntax(src);
  if (deprecatedTemplate) {
    const loc = getLineColumnFromPos(src, deprecatedTemplate.index);
    addFinding(findings, createFinding({
      code: 'RUNJS_DEPRECATED_CTX_TEMPLATE_SYNTAX',
      message: `"${deprecatedTemplate.placeholder}" cannot be used as executable RunJS syntax. Use await ctx.getVar("${deprecatedTemplate.expression}") instead.`,
      path: findingPath,
      modelUse: findingModelUse,
      line: loc.line,
      column: loc.column,
      evidence: deprecatedTemplate.placeholder,
    }));
  }

  let scan = null;
  try {
    scan = parseRunJSSourceForSyntax(src);
  } catch (error) {
    const loc = getLineColumnFromPos(src, error?.pos || 0);
    addFinding(findings, createFinding({
      code: 'RUNJS_PARSE_ERROR',
      message: `Syntax error: ${error.message}`,
      path: findingPath,
      modelUse: findingModelUse,
      line: loc.line,
      column: loc.column,
    }));
    return {
      blockers: findings.items,
      warnings: warnings.items,
      syntaxOk: false,
    };
  }

  const surfaceResult = inspectSurfaceStyle({
    scan,
    surfaceStyle,
    path: findingPath,
    modelUse: findingModelUse,
  });
  for (const item of surfaceResult.blockers) {
    addFinding(findings, item);
  }
  for (const item of surfaceResult.warnings) {
    addFinding(warnings, item);
  }

  const declared = collectDeclaredNames(scan.masked);
  const { staticStrings } = collectSimpleInitializers(scan.source, scan.masked);
  const astCtxChainKeys = new Set();

  for (const entry of scan.semanticNodes?.ctxMemberChains || []) {
    const memberName = entry.segments[0] || null;
    const memberStart = entry.memberStart ?? entry.start;
    const loc = getLineColumnFromPos(scan.source, memberStart);
    astCtxChainKeys.add(`${entry.start}:${entry.path}:${entry.dynamicComputed ? '1' : '0'}`);

    if (!memberName && entry.dynamicComputed) {
      addFinding(findings, createFinding({
        code: 'RUNJS_DYNAMIC_CTX_MEMBER_UNRESOLVED',
        message: 'Dynamic ctx[...] access cannot be validated. Use an explicit ctx.<member> reference.',
        path: findingPath,
        modelUse: findingModelUse,
        line: loc.line,
        column: loc.column,
      }));
      continue;
    }

    if (!memberName) continue;

    if (memberName === 'openView') {
      addFinding(findings, createFinding({
        code: 'RUNJS_BLOCKED_CTX_CAPABILITY',
        message: 'ctx.openView(...) is reference-only for this skill. Configure popup/action/field popup behavior outside JS.',
        path: findingPath,
        modelUse: findingModelUse,
        line: loc.line,
        column: loc.column,
        details: {
          capability: 'ctx.openView',
          reroute: 'popup-action-or-field-popup',
        },
      }));
      continue;
    }

    if (!effectiveAllowedCtxRoots.has(memberName)) {
      addFinding(findings, createFinding({
        code: 'RUNJS_UNKNOWN_CTX_MEMBER',
        message: `ctx.${memberName} is not part of the known RunJS contract for ${findingModelUse}.`,
        path: findingPath,
        modelUse: findingModelUse,
        line: loc.line,
        column: loc.column,
      }));
    }
  }

  forEachMemberChain(scan, staticStrings, (chain) => {
    const rootName = chain.segments[0];
    const memberName = chain.segments[1] || null;
    const memberStart = chain.segmentStarts[1] ?? chain.dynamicComputedStart ?? chain.start;
    const loc = getLineColumnFromPos(scan.source, memberStart);

    if (rootName === 'ctx') {
      const sourceKey = `${chain.start}:${chain.segments.slice(1).join('.')}:${chain.dynamicComputed ? '1' : '0'}`;
      if (astCtxChainKeys.has(sourceKey)) return;
    }

    if (rootName === 'ctx' && chain.dynamicComputed && !memberName) {
      addFinding(findings, createFinding({
        code: 'RUNJS_DYNAMIC_CTX_MEMBER_UNRESOLVED',
        message: 'Dynamic ctx[...] access cannot be validated. Use an explicit ctx.<member> reference.',
        path: findingPath,
        modelUse: findingModelUse,
        line: loc.line,
        column: loc.column,
      }));
      return;
    }

    if (rootName === 'window' && memberName) {
      if (!contract.safeGlobals?.window?.includes(memberName)) {
        addFinding(findings, createFinding({
          code: 'RUNJS_FORBIDDEN_WINDOW_PROPERTY',
          message: `window.${memberName} is not allowed in RunJS sandbox.`,
          path: findingPath,
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
        }));
      }
      return;
    }

    if (rootName === 'document' && memberName) {
      if (!contract.safeGlobals?.document?.includes(memberName)) {
        addFinding(findings, createFinding({
          code: 'RUNJS_FORBIDDEN_DOCUMENT_PROPERTY',
          message: `document.${memberName} is not allowed in RunJS sandbox.`,
          path: findingPath,
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
        }));
      }
      return;
    }

    if (rootName === 'navigator' && memberName) {
      if (!contract.safeGlobals?.navigator?.includes(memberName)) {
        addFinding(findings, createFinding({
          code: 'RUNJS_FORBIDDEN_NAVIGATOR_PROPERTY',
          message: `navigator.${memberName} is not allowed in RunJS sandbox.`,
          path: findingPath,
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
        }));
      }
      return;
    }

    if (rootName === 'location') {
      const rootLoc = getLineColumnFromPos(scan.source, chain.start);
      addFinding(findings, createFinding({
        code: 'RUNJS_FORBIDDEN_GLOBAL',
        message: 'Bare location access is not available in RunJS sandbox. Use window.location with allowed members only.',
        path: findingPath,
        modelUse: findingModelUse,
        line: rootLoc.line,
        column: rootLoc.column,
      }));
      return;
    }

    if (rootName === 'globalThis') {
      const rootLoc = getLineColumnFromPos(scan.source, chain.start);
      addFinding(findings, createFinding({
        code: 'RUNJS_FORBIDDEN_GLOBAL',
        message: 'globalThis access is not allowed in RunJS sandbox.',
        path: findingPath,
        modelUse: findingModelUse,
        line: rootLoc.line,
        column: rootLoc.column,
      }));
      return;
    }

    if (rootName === 'ctx' && memberName) {
      if (memberName === 'openView') {
        addFinding(findings, createFinding({
          code: 'RUNJS_BLOCKED_CTX_CAPABILITY',
          message: 'ctx.openView(...) is reference-only for this skill. Configure popup/action/field popup behavior outside JS.',
          path: findingPath,
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
          details: {
            capability: 'ctx.openView',
            reroute: 'popup-action-or-field-popup',
          },
        }));
        return;
      }
      if (!effectiveAllowedCtxRoots.has(memberName)) {
        addFinding(findings, createFinding({
          code: 'RUNJS_UNKNOWN_CTX_MEMBER',
          message: `ctx.${memberName} is not part of the known RunJS contract for ${findingModelUse}.`,
          path: findingPath,
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
        }));
      }
      return;
    }

    if (FORBIDDEN_BARE_GLOBALS.has(rootName) && !declared.has(rootName)) {
      const rootLoc = getLineColumnFromPos(scan.source, chain.start);
      addFinding(findings, createFinding({
        code: 'RUNJS_FORBIDDEN_GLOBAL',
        message: `${rootName} is forbidden in RunJS sandbox.`,
        path: findingPath,
        modelUse: findingModelUse,
        line: rootLoc.line,
        column: rootLoc.column,
      }));
    }
  });

  return {
    blockers: findings.items,
    warnings: warnings.items,
    syntaxOk: true,
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

function createJsxElementStub(type, props, ...children) {
  const normalizedChildren = children.filter((item) => item !== undefined && item !== null && item !== false);
  const nextProps = props && typeof props === 'object' ? { ...props } : {};
  if (normalizedChildren.length === 1) {
    nextProps.children = normalizedChildren[0];
  } else if (normalizedChildren.length > 1) {
    nextProps.children = normalizedChildren;
  }
  return {
    $$typeof: Symbol.for('react.element'),
    type,
    props: nextProps,
  };
}

function createCtxStub({ contract, modelUse, version, logs, allowedRoots }) {
  const effectiveAllowedRoots = allowedRoots instanceof Set
    ? allowedRoots
    : buildAllowedCtxRoots(contract, [modelUse]);

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
    acl: {},
    console: logger,
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
    dataSourceManager: {},
    date: {},
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
    runAction: createNoopAsync(),
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
        if (!effectiveAllowedRoots.has(prop)) {
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
        return typeof prop === 'string' ? effectiveAllowedRoots.has(prop) : false;
      },
    },
  );
}

async function executeRuntimeCode({ code, modelUse, version, contract, allowedRoots, executionLabel }) {
  const logs = [];
  const ctx = createCtxStub({ contract, modelUse, version, logs, allowedRoots });
  const windowProxy = createSafeTopLevelWindow(contract, logs);
  const documentProxy = createSafeDocumentProxy(contract);
  const navigatorProxy = createSafeNavigatorProxy(contract);
  const compiled = compileRunJSCode(code);
  const globals = {
    ctx,
    window: windowProxy,
    document: documentProxy,
    navigator: navigatorProxy,
    console: windowProxy.console,
    __nbJsx: createJsxElementStub,
    __nbJsxFragment: 'Fragment',
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
    filename: `${String(executionLabel || modelUse || 'runjs').replaceAll(/[^A-Za-z0-9_.-]+/g, '_')}.runjs`,
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

function summarizeRepairClasses(findings) {
  const summary = {};
  for (const finding of Array.isArray(findings) ? findings : []) {
    const repairClass = finding?.details?.repairClass;
    if (!repairClass) continue;
    summary[repairClass] = (summary[repairClass] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeSurfaceStats(inspectedNodes) {
  const summary = {};
  for (const node of Array.isArray(inspectedNodes) ? inspectedNodes : []) {
    const surface = normalizeOptionalText(node?.surface) || 'runjs.unknown';
    if (!summary[surface]) {
      summary[surface] = {
        nodeCount: 0,
        blockerCount: 0,
        warningCount: 0,
      };
    }
    summary[surface].nodeCount += 1;
    summary[surface].blockerCount += Number(node.blockerCount || 0);
    summary[surface].warningCount += Number(node.warningCount || 0);
  }
  return Object.fromEntries(Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)));
}

function resolveKnownModelUseForContract(contract, modelUse) {
  if (typeof modelUse === 'string' && (contract.models?.[modelUse] || LOCAL_MODEL_CONTRACTS[modelUse])) {
    return modelUse;
  }
  return null;
}

function getModelContract(contract, modelUse) {
  const base = contract.models?.[modelUse] || null;
  const local = LOCAL_MODEL_CONTRACTS[modelUse] || null;
  if (!base) return local;
  if (!local) return base;
  return {
    ...base,
    properties: uniqueStrings([...(base.properties || []), ...(local.properties || [])]),
    methods: uniqueStrings([...(base.methods || []), ...(local.methods || [])]),
  };
}

function addCtxRootNames(allowedRoots, names = []) {
  for (const name of uniqueStrings(names)) {
    allowedRoots.add(name);
  }
}

function buildAllowedCtxRoots(contract, modelUses = [], extraRoots = []) {
  const allowedRoots = new Set([
    ...uniqueStrings(contract.ctx?.baseProperties),
    ...uniqueStrings(contract.ctx?.baseMethods),
  ]);
  addCtxRootNames(allowedRoots, SKILL_LOCAL_COMPAT_ROOTS);
  addCtxRootNames(allowedRoots, extraRoots);
  for (const candidate of uniqueStrings(modelUses)) {
    const modelContract = getModelContract(contract, candidate);
    if (!modelContract) continue;
    for (const name of uniqueStrings(modelContract.properties)) {
      allowedRoots.add(name);
    }
    for (const name of uniqueStrings(modelContract.methods)) {
      allowedRoots.add(name);
    }
  }
  return allowedRoots;
}

function getScanNodeLocation(scan, node) {
  const sourceOffset = Number(scan?.sourceOffset || 0);
  const sourceStart = Math.max(0, Number(node?.start || 0) - sourceOffset);
  return getLineColumnFromPos(scan?.source || '', sourceStart);
}

function isFunctionExpressionAssignment(statement) {
  const expression = statement?.type === 'ExpressionStatement' ? statement.expression : null;
  return expression?.type === 'AssignmentExpression' && isFunctionNode(expression.right);
}

function isBareFunctionExpressionStatement(statement) {
  const expression = statement?.type === 'ExpressionStatement' ? unwrapChainNode(statement.expression) : null;
  return isFunctionNode(expression);
}

function isFunctionVariableDeclaration(statement) {
  return statement?.type === 'VariableDeclaration'
    && Array.isArray(statement.declarations)
    && statement.declarations.length > 0
    && statement.declarations.every((declarator) => isFunctionNode(declarator?.init));
}

function isTopLevelFunctionDefinitionStatement(statement) {
  return statement?.type === 'FunctionDeclaration'
    || isBareFunctionExpressionStatement(statement)
    || isFunctionVariableDeclaration(statement)
    || isFunctionExpressionAssignment(statement);
}

function hasOnlyTopLevelFunctionDefinitions(scan) {
  const statements = (scan?.wrappedStatements || []).filter((statement) => statement?.type !== 'EmptyStatement');
  return statements.length > 0 && statements.every((statement) => isTopLevelFunctionDefinitionStatement(statement));
}

function findAnyCtxRenderCall(scan) {
  return (scan?.semanticNodes?.ctxCallSites || []).find((entry) => entry.path === 'render') || null;
}

function unwrapChainNode(node) {
  return node?.type === 'ChainExpression' ? node.expression : node;
}

function isCtxRenderCallExpression(node) {
  const expression = unwrapChainNode(node);
  const callee = unwrapChainNode(expression?.callee);
  return expression?.type === 'CallExpression' && isCtxMemberExpression(callee, 'render');
}

function addFunctionDefinition(definitions, name, definition) {
  if (!name || !definition) return;
  if (!definitions.has(name)) {
    definitions.set(name, []);
  }
  definitions.get(name).push(definition);
}

function addFunctionDefinitionToScope(scope, name, definition) {
  if (!name || !definition?.node) return;
  scope.declared.add(name);
  addUnavailableStaticPrimitiveDefinitionToScope(scope, name, definition.initializedAt);
  unmarkContainerPath(scope, name);
  removeContainerAliasesForPath(scope, name);
  addFunctionDefinition(scope.definitions, name, definition);
}

function addStaticPrimitiveDefinition(definitions, name, definition) {
  if (!name || !definition) return;
  if (!definitions.has(name)) {
    definitions.set(name, []);
  }
  definitions.get(name).push(definition);
}

let nextRenderExecutionScopeId = 1;

function createRenderExecutionScope(parent = null, { varTarget = null } = {}) {
  const scope = {
    id: nextRenderExecutionScopeId,
    parent,
    declared: new Set(),
    definitions: new Map(),
    staticPrimitives: new Map(),
    containers: new Set(),
    containerAliases: new Map(),
    staticContainers: new Map(),
    activeConditionKeys: normalizeRenderExecutionConditionKeys(parent?.activeConditionKeys || []),
    activeThrowScopes: Array.isArray(parent?.activeThrowScopes) ? [...parent.activeThrowScopes] : [],
    activeThrowScopesExhaustive: Boolean(parent?.activeThrowScopesExhaustive),
    strict: Boolean(parent?.strict),
  };
  nextRenderExecutionScopeId += 1;
  scope.varTarget = varTarget || scope;
  return scope;
}

function cloneRenderExecutionScopeChain(scope, cloned = new Map()) {
  if (!scope) return null;
  if (cloned.has(scope)) return cloned.get(scope);
  const parent = cloneRenderExecutionScopeChain(scope.parent, cloned);
  const clone = {
    id: scope.id,
    parent,
    declared: new Set(scope.declared),
    definitions: new Map(
      Array.from(scope.definitions.entries(), ([name, definitions]) => [name, [...definitions]]),
    ),
    staticPrimitives: new Map(
      Array.from(scope.staticPrimitives.entries(), ([name, definitions]) => [name, [...definitions]]),
    ),
    containers: new Set(scope.containers),
    containerAliases: new Map(
      Array.from(scope.containerAliases.entries(), ([name, aliases]) => [name, new Set(aliases)]),
    ),
    staticContainers: new Map(
      Array.from(scope.staticContainers.entries(), ([name, info]) => [name, cloneStaticContainerInfo(info)]),
    ),
    activeConditionKeys: normalizeRenderExecutionConditionKeys(scope.activeConditionKeys || []),
    activeThrowScopes: Array.isArray(scope.activeThrowScopes) ? [...scope.activeThrowScopes] : [],
    activeThrowScopesExhaustive: Boolean(scope.activeThrowScopesExhaustive),
    strict: scope.strict,
    varTarget: null,
  };
  cloned.set(scope, clone);
  clone.varTarget = scope.varTarget
    ? cloneRenderExecutionScopeChain(scope.varTarget, cloned)
    : clone;
  return clone;
}

function cloneRenderExecutionScopeChainWithMap(scope) {
  const cloned = new Map();
  return {
    scope: cloneRenderExecutionScopeChain(scope, cloned),
    cloned,
  };
}

function snapshotRenderExecutionScopeChain(scope) {
  const snapshots = [];
  let current = scope;
  while (current) {
    snapshots.push({
      scope: current,
      declared: new Set(current.declared),
      definitions: new Map(
        Array.from(current.definitions.entries(), ([name, definitions]) => [name, [...definitions]]),
      ),
      staticPrimitives: new Map(
        Array.from(current.staticPrimitives.entries(), ([name, definitions]) => [name, [...definitions]]),
      ),
      containers: new Set(current.containers),
      containerAliases: new Map(
        Array.from(current.containerAliases.entries(), ([name, aliases]) => [name, new Set(aliases)]),
      ),
      staticContainers: new Map(
        Array.from(current.staticContainers.entries(), ([name, info]) => [name, cloneStaticContainerInfo(info)]),
      ),
      activeConditionKeys: normalizeRenderExecutionConditionKeys(current.activeConditionKeys || []),
      activeThrowScopes: Array.isArray(current.activeThrowScopes) ? [...current.activeThrowScopes] : [],
      activeThrowScopesExhaustive: Boolean(current.activeThrowScopesExhaustive),
      strict: current.strict,
    });
    current = current.parent;
  }
  return snapshots;
}

function restoreRenderExecutionScopeChain(snapshots) {
  for (const snapshot of snapshots || []) {
    snapshot.scope.declared = new Set(snapshot.declared);
    snapshot.scope.definitions = new Map(
      Array.from(snapshot.definitions.entries(), ([name, definitions]) => [name, [...definitions]]),
    );
    snapshot.scope.staticPrimitives = new Map(
      Array.from(snapshot.staticPrimitives.entries(), ([name, definitions]) => [name, [...definitions]]),
    );
    snapshot.scope.containers = new Set(snapshot.containers);
    snapshot.scope.containerAliases = new Map(
      Array.from(snapshot.containerAliases.entries(), ([name, aliases]) => [name, new Set(aliases)]),
    );
    snapshot.scope.staticContainers = new Map(
      Array.from(snapshot.staticContainers.entries(), ([name, info]) => [name, cloneStaticContainerInfo(info)]),
    );
    snapshot.scope.activeConditionKeys = normalizeRenderExecutionConditionKeys(snapshot.activeConditionKeys || []);
    snapshot.scope.activeThrowScopes = Array.isArray(snapshot.activeThrowScopes) ? [...snapshot.activeThrowScopes] : [];
    snapshot.scope.activeThrowScopesExhaustive = Boolean(snapshot.activeThrowScopesExhaustive);
    snapshot.scope.strict = snapshot.strict;
  }
}

function cloneRenderExecutionScopeChainWithThrowScopes(scope, throwScopes) {
  const snapshots = snapshotRenderExecutionScopeChain(scope);
  mergeThrowScopesIntoOriginal(throwScopes, { conditional: true });
  const cloned = cloneRenderExecutionScopeChainWithMap(scope);
  restoreRenderExecutionScopeChain(snapshots);
  return cloned;
}

function normalizeRenderExecutionConditionKeys(conditionKeys) {
  const keys = Array.isArray(conditionKeys) ? conditionKeys : [conditionKeys];
  return Array.from(new Set(keys.filter((key) => typeof key === 'string' && key.length > 0))).sort();
}

function mergeRenderExecutionConditionKeys(...conditionKeySets) {
  return normalizeRenderExecutionConditionKeys(conditionKeySets.flatMap((keys) => (
    Array.isArray(keys) ? keys : [keys]
  )));
}

function addActiveRenderExecutionConditionKeys(scope, conditionKeys) {
  if (!scope) return;
  scope.activeConditionKeys = mergeRenderExecutionConditionKeys(scope.activeConditionKeys, conditionKeys);
}

function setActiveRenderExecutionThrowScopes(scope, throwScopes, { exhaustive = false } = {}) {
  if (!scope) return;
  scope.activeThrowScopes = (Array.isArray(throwScopes) ? throwScopes : [])
    .filter((entry) => entry?.clonedScope);
  scope.activeThrowScopesExhaustive = Boolean(exhaustive && scope.activeThrowScopes.length > 0);
}

function conditionKeysImply(activeKeys, conditionKeys) {
  const active = new Set(normalizeRenderExecutionConditionKeys(activeKeys));
  const required = normalizeRenderExecutionConditionKeys(conditionKeys);
  return required.length > 0
    && active.size > 0
    && required.every((key) => renderExecutionConditionKeyImpliedByEarlier(key, active));
}

function getFunctionDefinitionValueState(definition) {
  if (!definition) return null;
  if (definition.node) {
    return { truthy: true, nonNullish: true };
  }
  const state = {};
  if (typeof definition.truthy === 'boolean') state.truthy = definition.truthy;
  if (typeof definition.nonNullish === 'boolean') state.nonNullish = definition.nonNullish;
  return Object.keys(state).length > 0 ? state : null;
}

function mergeCompatibleStaticValueStates(states) {
  const normalizedStates = (Array.isArray(states) ? states : []).filter(Boolean);
  if (normalizedStates.length === 0) return null;
  const merged = {};
  for (const key of ['truthy', 'nonNullish']) {
    const values = normalizedStates.map((state) => state?.[key]);
    if (
      values.every((value) => typeof value === 'boolean')
      && values.every((value) => value === values[0])
    ) {
      merged[key] = values[0];
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

function getGuaranteedValueStateFromScopeName(scope, name, referenceStart = null) {
  if (!scope || !name) return null;
  const definitions = resolveFunctionDefinitionsFromScopeName(scope, name, referenceStart);
  if (definitions?.length > 0) {
    const states = definitions.map((definition) => getFunctionDefinitionValueState(definition));
    if (states.some((state) => !state)) return null;
    return mergeCompatibleStaticValueStates(states);
  }
  if (scopeHasKnownContainerPath(scope, name)) {
    return { truthy: true, nonNullish: true };
  }
  return null;
}

function resolveActiveThrowScopeTargetValueState(scope, targetName, referenceStart = null) {
  if (!scope?.activeThrowScopesExhaustive || !targetName) return null;
  const throwScopes = (Array.isArray(scope.activeThrowScopes) ? scope.activeThrowScopes : [])
    .filter((entry) => entry?.clonedScope);
  if (throwScopes.length === 0) return null;
  const states = [];
  for (const entry of throwScopes) {
    const state = getGuaranteedValueStateFromScopeName(entry.clonedScope, targetName, referenceStart);
    if (!state) return null;
    states.push(state);
  }
  return mergeCompatibleStaticValueStates(states);
}

function applyRenderExecutionDefinitionConditions(definition, { conditional = false, conditionKeys = [] } = {}) {
  const merged = {
    ...definition,
    conditional: Boolean(conditional || definition?.conditional),
  };
  const mergedKeys = mergeRenderExecutionConditionKeys(definition?.conditionKeys, conditionKeys);
  if (merged.conditional && mergedKeys.length > 0) {
    merged.conditionKeys = mergedKeys;
  } else {
    delete merged.conditionKeys;
  }
  return merged;
}

function parseSwitchDefaultConditionKey(key) {
  const prefix = 'T:switch-default:';
  const marker = ':not:';
  if (typeof key !== 'string' || !key.startsWith(prefix)) return null;
  const markerIndex = key.lastIndexOf(marker);
  if (markerIndex < prefix.length) return null;
  const discriminant = key.slice(prefix.length, markerIndex);
  const excludedText = key.slice(markerIndex + marker.length);
  const excluded = excludedText === 'none' || !excludedText
    ? []
    : excludedText.split('|').filter(Boolean);
  return { discriminant, excluded: new Set(excluded) };
}

function parseSwitchCaseConditionKey(key) {
  const prefix = 'T:switch-case:';
  const marker = '===';
  if (typeof key !== 'string' || !key.startsWith(prefix)) return null;
  const markerIndex = key.lastIndexOf(marker);
  if (markerIndex < prefix.length) return null;
  return {
    discriminant: key.slice(prefix.length, markerIndex),
    test: key.slice(markerIndex + marker.length),
  };
}

function switchConditionKeyImpliedByEarlier(laterKey, earlierKey) {
  const laterDefault = parseSwitchDefaultConditionKey(laterKey);
  if (!laterDefault) return false;
  const earlierDefault = parseSwitchDefaultConditionKey(earlierKey);
  if (earlierDefault?.discriminant === laterDefault.discriminant) {
    return [...laterDefault.excluded].every((key) => earlierDefault.excluded.has(key));
  }
  const earlierCase = parseSwitchCaseConditionKey(earlierKey);
  if (earlierCase?.discriminant === laterDefault.discriminant) {
    return !laterDefault.excluded.has(earlierCase.test);
  }
  return false;
}

function renderExecutionConditionKeyImpliedByEarlier(laterKey, earlierKeys) {
  if (earlierKeys.has(laterKey)) return true;
  for (const earlierKey of earlierKeys) {
    if (switchConditionKeyImpliedByEarlier(laterKey, earlierKey)) return true;
  }
  return false;
}

function renderExecutionConditionKeysDominate(laterKeys, earlierKeys) {
  const later = normalizeRenderExecutionConditionKeys(laterKeys);
  const earlier = new Set(normalizeRenderExecutionConditionKeys(earlierKeys));
  return later.length > 0
    && earlier.size > 0
    && later.every((key) => renderExecutionConditionKeyImpliedByEarlier(key, earlier));
}

function laterDefinitionDominatesEarlierConditionalPath(laterDefinition, earlierDefinition) {
  return Boolean(laterDefinition?.conditional && earlierDefinition?.conditional)
    && renderExecutionConditionKeysDominate(laterDefinition.conditionKeys, earlierDefinition.conditionKeys);
}

function pruneDominatedConditionalFunctionDefinitions(definitions) {
  const pruned = [];
  for (const definition of definitions || []) {
    if (definition?.conditional) {
      for (let index = pruned.length - 1; index >= 0; index -= 1) {
        if (laterDefinitionDominatesEarlierConditionalPath(definition, pruned[index])) {
          pruned.splice(index, 1);
        }
      }
    }
    pruned.push(definition);
  }
  return pruned;
}

function getLatestRenderExecutionConditionDefinitionStart(definitions, referenceStart) {
  let latest = null;
  for (const definition of definitions || []) {
    const start = Number.isInteger(definition?.initializedAt)
      ? definition.initializedAt
      : definition?.declarationStart;
    if (!Number.isInteger(start)) continue;
    if (Number.isInteger(referenceStart) && start >= referenceStart) continue;
    latest = latest == null ? start : Math.max(latest, start);
  }
  return latest;
}

function findRenderExecutionConditionBindingScope(scope, name) {
  let current = scope;
  while (current) {
    if (
      current.declared.has(name)
      || current.definitions.has(name)
      || current.staticPrimitives.has(name)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function createRenderExecutionConditionBindingKey(scope, name, referenceStart = null) {
  if (!scope || !name) return 'global@unknown';
  const bindingScope = findRenderExecutionConditionBindingScope(scope, name);
  if (!bindingScope) return 'global@unknown';
  const latestFunctionStart = getLatestRenderExecutionConditionDefinitionStart(
    bindingScope.definitions.get(name),
    referenceStart,
  );
  const latestPrimitiveStart = getLatestRenderExecutionConditionDefinitionStart(
    bindingScope.staticPrimitives.get(name),
    referenceStart,
  );
  const latestStart = [latestFunctionStart, latestPrimitiveStart]
    .filter((start) => Number.isInteger(start))
    .reduce((latest, start) => Math.max(latest, start), null);
  return `scope:${bindingScope.id}@${latestStart == null ? 'declared' : latestStart}`;
}

function serializeRenderExecutionConditionNode(node, scope = null, referenceStart = null) {
  const expression = unwrapChainNode(node);
  if (!isAstNode(expression)) return null;
  if (expression.type === 'Identifier') {
    return `id:${createRenderExecutionConditionBindingKey(scope, expression.name, referenceStart)}:${expression.name}`;
  }
  if (expression.type === 'ThisExpression') return 'this';
  if (expression.type === 'Literal') return `literal:${typeof expression.value}:${String(expression.value)}`;
  if (
    expression.type === 'TemplateLiteral'
    && Array.isArray(expression.expressions)
    && expression.expressions.length === 0
  ) {
    const value = expression.quasis?.map((item) => item.value?.cooked ?? item.value?.raw ?? '').join('') ?? '';
    return `literal:string:${value}`;
  }
  if (expression.type === 'MemberExpression') {
    const objectKey = serializeRenderExecutionConditionNode(expression.object, scope, referenceStart);
    const propertyName = getStaticPropertyName(expression.property, { computed: Boolean(expression.computed) });
    if (!objectKey || propertyName == null) return null;
    const memberPath = getStaticMemberPath(expression);
    const memberName = memberPath?.join('.');
    const memberKey = memberName
      ? createRenderExecutionConditionBindingKey(scope, memberName, referenceStart)
      : 'member@unknown';
    return `member:${objectKey}.${propertyName}@${memberKey}`;
  }
  if (expression.type === 'LogicalExpression') {
    const leftKey = serializeRenderExecutionConditionNode(expression.left, scope, referenceStart);
    const rightKey = serializeRenderExecutionConditionNode(expression.right, scope, referenceStart);
    if (!leftKey || !rightKey) return null;
    const operandKeys = ['&&', '||'].includes(expression.operator)
      ? [leftKey, rightKey].sort()
      : [leftKey, rightKey];
    return `logical:${expression.operator}:${operandKeys.join(':')}`;
  }
  if (expression.type === 'UnaryExpression' && expression.operator !== '!') {
    const argumentKey = serializeRenderExecutionConditionNode(expression.argument, scope, referenceStart);
    return argumentKey ? `unary:${expression.operator}:${argumentKey}` : null;
  }
  if (expression.type === 'BinaryExpression') {
    const leftKey = serializeRenderExecutionConditionNode(expression.left, scope, referenceStart);
    const rightKey = serializeRenderExecutionConditionNode(expression.right, scope, referenceStart);
    return leftKey && rightKey ? `binary:${expression.operator}:${leftKey}:${rightKey}` : null;
  }
  return null;
}

function createRenderExecutionConditionKey(node, truthy = true, scope = null, referenceStart = null) {
  const expression = unwrapChainNode(node);
  if (expression?.type === 'UnaryExpression' && expression.operator === '!') {
    return createRenderExecutionConditionKey(expression.argument, !truthy, scope, referenceStart);
  }
  const serialized = serializeRenderExecutionConditionNode(expression, scope, referenceStart);
  return serialized ? `${truthy ? 'T' : 'F'}:${serialized}` : null;
}

function createRenderExecutionConditionKeys(node, truthy = true, scope = null, referenceStart = null) {
  const expression = unwrapChainNode(node);
  if (expression?.type === 'UnaryExpression' && expression.operator === '!') {
    return createRenderExecutionConditionKeys(expression.argument, !truthy, scope, referenceStart);
  }
  if (expression?.type === 'LogicalExpression') {
    const wholeKey = createRenderExecutionConditionKey(expression, truthy, scope, referenceStart);
    if (!wholeKey) return [];
    if (expression.operator === '&&' && truthy) {
      return mergeRenderExecutionConditionKeys(
        createRenderExecutionConditionKeys(expression.left, true, scope, referenceStart),
        createRenderExecutionConditionKeys(expression.right, true, scope, referenceStart),
        wholeKey,
      );
    }
    if (expression.operator === '||' && !truthy) {
      return mergeRenderExecutionConditionKeys(
        createRenderExecutionConditionKeys(expression.left, false, scope, referenceStart),
        createRenderExecutionConditionKeys(expression.right, false, scope, referenceStart),
        wholeKey,
      );
    }
    return [wholeKey];
  }
  const key = createRenderExecutionConditionKey(node, truthy, scope, referenceStart);
  return key ? [key] : [];
}

function createRenderExecutionSwitchCaseConditionKeys(discriminant, switchCase, switchCases, scope, referenceStart = null) {
  const test = switchCase?.test || null;
  const discriminantKey = serializeRenderExecutionConditionNode(discriminant, scope, referenceStart);
  if (!discriminantKey) return [];
  if (!test) {
    const caseKeys = (switchCases || [])
      .map((candidate) => candidate?.test)
      .filter(Boolean)
      .map((candidate) => serializeRenderExecutionConditionNode(candidate, scope, referenceStart))
      .filter(Boolean)
      .sort();
    return [`T:switch-default:${discriminantKey}:not:${caseKeys.join('|') || 'none'}`];
  }
  const testKey = serializeRenderExecutionConditionNode(test, scope, referenceStart);
  return discriminantKey && testKey ? [`T:switch-case:${discriminantKey}===${testKey}`] : [];
}

function createFunctionDefinition(node, {
  hoisted,
  initializedAt,
  conditional = false,
  conditionKeys = [],
}) {
  const normalizedConditionKeys = normalizeRenderExecutionConditionKeys(conditionKeys);
  return {
    node,
    hoisted,
    initializedAt: Number.isInteger(initializedAt) ? initializedAt : null,
    declarationStart: Number.isInteger(node?.start) ? node.start : (Number.isInteger(initializedAt) ? initializedAt : null),
    conditional,
    ...(conditional && normalizedConditionKeys.length > 0 ? { conditionKeys: normalizedConditionKeys } : {}),
  };
}

function createUnavailableFunctionDefinition({
  initializedAt,
  conditional = false,
  conditionKeys = [],
  truthy = null,
  nonNullish = null,
}) {
  const normalizedConditionKeys = normalizeRenderExecutionConditionKeys(conditionKeys);
  return {
    node: null,
    hoisted: false,
    initializedAt: Number.isInteger(initializedAt) ? initializedAt : null,
    declarationStart: Number.isInteger(initializedAt) ? initializedAt : null,
    conditional,
    ...(conditional && normalizedConditionKeys.length > 0 ? { conditionKeys: normalizedConditionKeys } : {}),
    ...(typeof truthy === 'boolean' ? { truthy } : {}),
    ...(typeof nonNullish === 'boolean' ? { nonNullish } : {}),
  };
}

function createStaticPrimitiveDefinition(value, { initializedAt, conditional = false, unavailable = false }) {
  return {
    value,
    initializedAt: Number.isInteger(initializedAt) ? initializedAt : null,
    conditional,
    unavailable,
  };
}

function addStaticPrimitiveDefinitionToScope(scope, name, value, initializedAt, { conditional = false } = {}) {
  if (!name || !isStaticPrimitiveValue(value)) return;
  scope.declared.add(name);
  addStaticPrimitiveDefinition(scope.staticPrimitives, name, createStaticPrimitiveDefinition(value, {
    initializedAt,
    conditional,
  }));
}

function addUnavailableStaticPrimitiveDefinitionToScope(scope, name, initializedAt) {
  if (!name) return;
  addStaticPrimitiveDefinition(scope.staticPrimitives, name, createStaticPrimitiveDefinition(STATIC_PRIMITIVE_UNKNOWN, {
    initializedAt,
    unavailable: true,
  }));
}

function registerStaticPrimitiveInvalidation(scope, name, initializedAt) {
  if (!name) return;
  const targetScope = findAssignmentTargetScope(scope, name);
  addUnavailableStaticPrimitiveDefinitionToScope(targetScope, name, initializedAt);
}

function registerStaticPrimitiveDefinitionFromNode(
  scope,
  name,
  node,
  initializedAt,
  { resolveScope = scope, referenceStart = initializedAt, conditional = false } = {},
) {
  const primitive = resolveStaticPrimitiveValue(node, resolveScope, referenceStart);
  if (primitive !== STATIC_PRIMITIVE_UNKNOWN) {
    addStaticPrimitiveDefinitionToScope(scope, name, primitive, initializedAt, { conditional });
  }
}

function registerStaticPrimitiveDefinitionFromSourcePath(
  scope,
  name,
  sourcePath,
  initializedAt,
  { resolveScope = scope, referenceStart = initializedAt, conditional = false } = {},
) {
  if (!Array.isArray(sourcePath) || sourcePath.length === 0) return;
  const primitive = resolveStaticPrimitiveFromScopeName(resolveScope, sourcePath.join('.'), referenceStart);
  if (primitive !== STATIC_PRIMITIVE_UNKNOWN) {
    addStaticPrimitiveDefinitionToScope(scope, name, primitive, initializedAt, { conditional });
  }
}

function mergeDefinitionsFromScopeClone(originalScope, clonedScope, { conditional = false, conditionKeys = [] } = {}) {
  let original = originalScope;
  let cloned = clonedScope;
  while (original && cloned) {
    for (const [name, clonedDefinitions] of cloned.definitions.entries()) {
      const originalDefinitions = original.definitions.get(name) || [];
      const newDefinitions = clonedDefinitions.slice(originalDefinitions.length);
      let lastUnconditionalIndex = -1;
      for (let index = 0; index < newDefinitions.length; index += 1) {
        if (!newDefinitions[index].conditional) lastUnconditionalIndex = index;
      }
      const definitionsToMerge = lastUnconditionalIndex >= 0
        ? newDefinitions.slice(lastUnconditionalIndex)
        : newDefinitions;
      for (const definition of definitionsToMerge) {
        addFunctionDefinition(
          original.definitions,
          name,
          applyRenderExecutionDefinitionConditions(definition, { conditional, conditionKeys }),
        );
      }
    }
    for (const [name, clonedDefinitions] of cloned.staticPrimitives.entries()) {
      const originalDefinitions = original.staticPrimitives.get(name) || [];
      const newDefinitions = clonedDefinitions.slice(originalDefinitions.length);
      for (const definition of newDefinitions) {
        addStaticPrimitiveDefinition(original.staticPrimitives, name, {
          ...definition,
          conditional: Boolean(conditional || definition.conditional),
        });
      }
    }
    for (const name of new Set([...original.staticContainers.keys(), ...cloned.staticContainers.keys()])) {
      const originalInfo = original.staticContainers.get(name) || null;
      const clonedInfo = cloned.staticContainers.get(name) || null;
      if (staticContainerInfosEqual(originalInfo, clonedInfo)) continue;
      if (conditional) {
        const mergedInfo = cloneStaticContainerInfo(originalInfo || clonedInfo);
        if (mergedInfo) {
          mergedInfo.exact = false;
          original.staticContainers.set(name, mergedInfo);
        }
      } else if (clonedInfo) {
        original.staticContainers.set(name, cloneStaticContainerInfo(clonedInfo));
        replaceScopedDefinitionsFromScopeClone(original, cloned, name);
      } else {
        original.staticContainers.delete(name);
        replaceScopedDefinitionsFromScopeClone(original, cloned, name);
      }
    }
    original = original.parent;
    cloned = cloned.parent;
  }
}

function replaceScopedDefinitionsFromScopeClone(original, cloned, name) {
  if (!original || !cloned || !name) return;
  const inScope = (key) => key === name || key.startsWith(`${name}.`);
  for (const key of [...original.definitions.keys()]) {
    if (inScope(key)) original.definitions.delete(key);
  }
  for (const key of [...original.staticPrimitives.keys()]) {
    if (inScope(key)) original.staticPrimitives.delete(key);
  }
  for (const [key, definitions] of cloned.definitions.entries()) {
    if (inScope(key)) original.definitions.set(key, [...definitions]);
  }
  for (const [key, definitions] of cloned.staticPrimitives.entries()) {
    if (inScope(key)) original.staticPrimitives.set(key, [...definitions]);
  }
}

function mergeConditionalDefinitionsFromScopeClone(originalScope, clonedScope, { conditionKeys = [] } = {}) {
  mergeDefinitionsFromScopeClone(originalScope, clonedScope, { conditional: true, conditionKeys });
}

function predeclareFunctionScopeBindings(scope, statements) {
  for (const statement of statements || []) {
    if (statement?.type === 'FunctionDeclaration' && statement.id?.type === 'Identifier') {
      addFunctionDefinitionToScope(scope, statement.id.name, createFunctionDefinition(statement, {
        hoisted: true,
        initializedAt: statement.start,
      }));
      continue;
    }
    if (statement?.type === 'VariableDeclaration') {
      const declarationScope = statement.kind === 'var' ? scope.varTarget : scope;
      for (const declarator of statement.declarations || []) {
        for (const name of collectAssignmentTargetIdentifiers(declarator?.id)) {
          declarationScope.declared.add(name);
        }
      }
    }
  }
}

function predeclareUnavailableBindings(scope, bindings) {
  for (const binding of bindings || []) {
    const initializedAt = Number.isInteger(binding?.start) ? binding.start : null;
    for (const name of collectAssignmentTargetIdentifiers(binding)) {
      scope.declared.add(name);
      addFunctionDefinition(scope.definitions, name, createUnavailableFunctionDefinition({ initializedAt }));
    }
  }
}

function statementListHasUseStrictDirective(statements) {
  for (const statement of statements || []) {
    if (
      statement?.type === 'ExpressionStatement'
      && statement.expression?.type === 'Literal'
      && typeof statement.expression.value === 'string'
    ) {
      if (statement.expression.value === 'use strict') return true;
      continue;
    }
    return false;
  }
  return false;
}

function exposeExecutedBlockFunctionDeclaration(scope, statement) {
  if (
    statement?.type !== 'FunctionDeclaration'
    || statement.id?.type !== 'Identifier'
    || !scope?.varTarget
    || scope.varTarget === scope
    || scope.strict
  ) {
    return;
  }
  addFunctionDefinitionToScope(scope.varTarget, statement.id.name, createFunctionDefinition(statement, {
    hoisted: false,
    initializedAt: Number.isInteger(statement.start) ? statement.start : null,
  }));
}

function collectNestedVarDeclarations(scope, node) {
  if (!isAstNode(node)) return;
  if (isFunctionNode(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const declarator of node.declarations || []) {
      for (const name of collectAssignmentTargetIdentifiers(declarator?.id)) {
        scope.varTarget.declared.add(name);
      }
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectNestedVarDeclarations(scope, item);
      continue;
    }
    collectNestedVarDeclarations(scope, value);
  }
}

function createInitializedExecutionScope(parent, statements, { functionScope = false, params = [] } = {}) {
  const scope = createRenderExecutionScope(parent, {
    varTarget: functionScope || !parent ? null : parent.varTarget,
  });
  if (functionScope || !parent) {
    scope.strict = Boolean(scope.strict || statementListHasUseStrictDirective(statements));
  }
  predeclareUnavailableBindings(scope, params);
  predeclareFunctionScopeBindings(scope, statements);
  if (functionScope || !parent) {
    for (const statement of statements || []) {
      collectNestedVarDeclarations(scope, statement);
    }
  }
  return scope;
}

function findAssignmentTargetScope(scope, name) {
  let current = scope;
  while (current) {
    if (current.declared.has(name) || current.definitions.has(name)) {
      return current;
    }
    current = current.parent;
  }
  return scope;
}

function collectAssignmentTargetIdentifiers(node, identifiers = []) {
  if (!isAstNode(node)) return identifiers;
  if (node.type === 'Identifier') {
    identifiers.push(node.name);
    return identifiers;
  }
  if (node.type === 'RestElement') {
    collectAssignmentTargetIdentifiers(node.argument, identifiers);
    return identifiers;
  }
  if (node.type === 'AssignmentPattern') {
    collectAssignmentTargetIdentifiers(node.left, identifiers);
    return identifiers;
  }
  if (node.type === 'ArrayPattern') {
    for (const element of node.elements || []) {
      collectAssignmentTargetIdentifiers(element, identifiers);
    }
    return identifiers;
  }
  if (node.type === 'ObjectPattern') {
    for (const property of node.properties || []) {
      if (property?.type === 'Property') {
        collectAssignmentTargetIdentifiers(property.value, identifiers);
      } else if (property?.type === 'RestElement') {
        collectAssignmentTargetIdentifiers(property.argument, identifiers);
      }
    }
  }
  return identifiers;
}

function getStaticPropertyName(node, { computed = false } = {}) {
  const expression = unwrapChainNode(node);
  if (expression?.type === 'Identifier') return computed ? null : expression.name;
  if (expression?.type === 'Literal' && (typeof expression.value === 'string' || typeof expression.value === 'number')) {
    return String(expression.value);
  }
  if (expression?.type === 'TemplateLiteral' && expression.expressions?.length === 0) {
    return expression.quasis?.map((item) => item.value?.cooked ?? item.value?.raw ?? '').join('') ?? null;
  }
  return null;
}

function getStaticMemberPath(node) {
  const expression = unwrapChainNode(node);
  if (expression?.type === 'Identifier') return [expression.name];
  if (expression?.type !== 'MemberExpression') return null;
  const objectPath = getStaticMemberPath(expression.object);
  const propertyName = getStaticPropertyName(expression.property, { computed: Boolean(expression.computed) });
  if (!objectPath || propertyName == null) return null;
  return [...objectPath, propertyName];
}

function addUnavailableFunctionDefinitionToScope(scope, name, initializedAt, { conditional = false, conditionKeys = [] } = {}) {
  unmarkContainerPath(scope, name);
  removeContainerAliasesForPath(scope, name);
  addFunctionDefinition(scope.definitions, name, createUnavailableFunctionDefinition({ initializedAt, conditional, conditionKeys }));
  for (const key of [...scope.definitions.keys()]) {
    if (key.startsWith(`${name}.`)) {
      addFunctionDefinition(scope.definitions, key, createUnavailableFunctionDefinition({ initializedAt, conditional, conditionKeys }));
    }
  }
  for (const key of [...scope.staticPrimitives.keys()]) {
    if (key.startsWith(`${name}.`)) {
      addUnavailableStaticPrimitiveDefinitionToScope(scope, key, initializedAt);
    }
  }
}

function addFunctionValueStateDefinitionToScope(
  scope,
  name,
  initializedAt,
  valueState,
  { conditional = false, conditionKeys = [] } = {},
) {
  if (!scope || !name || !valueState) return;
  if (typeof valueState.truthy !== 'boolean' && typeof valueState.nonNullish !== 'boolean') return;
  addFunctionDefinition(scope.definitions, name, createUnavailableFunctionDefinition({
    initializedAt,
    conditional,
    conditionKeys,
    truthy: valueState.truthy,
    nonNullish: valueState.nonNullish,
  }));
}

function registerUnavailableFunctionDefinition(scope, name, initializedAt, { conditional = false } = {}) {
  if (!name) return;
  const targetScope = findAssignmentTargetScope(scope, name);
  addUnavailableFunctionDefinitionToScope(targetScope, name, initializedAt, { conditional });
}

function addDeletedMemberDefinitionToScope(scope, name, initializedAt) {
  if (!scope || !name) return;
  updateStaticContainerInfoForMemberDelete(scope, name);
  addUnavailableFunctionDefinitionToScope(scope, name, initializedAt);
  addStaticPrimitiveDefinition(scope.staticPrimitives, name, createStaticPrimitiveDefinition(undefined, {
    initializedAt,
  }));
}

function registerDeleteExpressionInvalidation(scope, expression) {
  if (expression?.type !== 'UnaryExpression' || expression.operator !== 'delete') return;
  const memberPath = getStaticMemberPath(expression.argument);
  if (!memberPath || memberPath.length <= 1) return;
  const initializedAt = Number.isInteger(expression.start) ? expression.start : null;
  const memberName = memberPath.join('.');
  for (const target of collectEquivalentContainerMemberAssignmentTargets(scope, memberName)) {
    addDeletedMemberDefinitionToScope(target.scope, target.name, initializedAt);
  }
}

function createStaticContainerInfo(kind, { keys = [], values = [], exact = true } = {}) {
  if (!kind) return null;
  return {
    kind,
    keys: new Set(keys.map((key) => String(key))),
    values: [...values],
    exact: Boolean(exact),
  };
}

function cloneStaticContainerInfo(info) {
  if (!info?.kind) return null;
  return createStaticContainerInfo(info.kind, {
    keys: [...(info.keys || [])],
    values: [...(info.values || [])],
    exact: info.exact,
  });
}

function staticContainerInfosEqual(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.kind !== right.kind || Boolean(left.exact) !== Boolean(right.exact)) return false;
  const leftKeys = [...(left.keys || [])].map((key) => String(key)).sort();
  const rightKeys = [...(right.keys || [])].map((key) => String(key)).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) return false;
  }
  const leftValues = left.values || [];
  const rightValues = right.values || [];
  if (leftValues.length !== rightValues.length) return false;
  for (let index = 0; index < leftValues.length; index += 1) {
    if (leftValues[index] !== rightValues[index]) return false;
  }
  return true;
}

function getArrayExpressionStaticContainerInfo(arrayNode) {
  const expression = unwrapChainNode(arrayNode);
  if (expression?.type !== 'ArrayExpression') return null;
  const values = [];
  const keys = [];
  let exact = true;
  for (let index = 0; index < (expression.elements || []).length; index += 1) {
    const value = expression.elements[index] || null;
    if (value?.type === 'SpreadElement') {
      exact = false;
      continue;
    }
    values.push(value);
    if (value) keys.push(String(index));
  }
  return createStaticContainerInfo('array', { keys, values, exact });
}

function getObjectExpressionStaticContainerInfo(objectNode) {
  const expression = unwrapChainNode(objectNode);
  if (expression?.type !== 'ObjectExpression') return null;
  const keys = [];
  let exact = true;
  for (const property of expression.properties || []) {
    if (property?.type !== 'Property') {
      exact = false;
      continue;
    }
    const key = getStaticPropertyName(property.key, { computed: Boolean(property.computed) });
    if (key == null) {
      exact = false;
      continue;
    }
    keys.push(key);
  }
  return createStaticContainerInfo('object', { keys, values: [], exact });
}

function markContainerPath(scope, name, info = null) {
  if (!scope || !name) return;
  scope.containers.add(name);
  const staticInfo = cloneStaticContainerInfo(info);
  if (staticInfo) scope.staticContainers.set(name, staticInfo);
}

function unmarkContainerPath(scope, name) {
  if (!scope || !name) return;
  for (const key of [...scope.containers]) {
    if (key === name || key.startsWith(`${name}.`)) {
      scope.containers.delete(key);
    }
  }
  for (const key of [...scope.staticContainers.keys()]) {
    if (key === name || key.startsWith(`${name}.`)) {
      scope.staticContainers.delete(key);
    }
  }
}

function removeContainerAliasesForPath(scope, name) {
  if (!scope || !name) return;
  for (const key of [...scope.containerAliases.keys()]) {
    if (key === name || key.startsWith(`${name}.`)) {
      scope.containerAliases.delete(key);
      continue;
    }
    const aliases = scope.containerAliases.get(key);
    for (const alias of [...aliases]) {
      if (alias === name || alias.startsWith(`${name}.`)) {
        aliases.delete(alias);
      }
    }
    if (aliases.size === 0) scope.containerAliases.delete(key);
  }
}

function addContainerAlias(scope, leftName, rightName) {
  if (!scope || !leftName || !rightName || leftName === rightName) return;
  const staticInfo = getStaticContainerInfoFromScope(scope, leftName)
    || getStaticContainerInfoFromScope(scope, rightName);
  const related = new Set([leftName, rightName]);
  for (const name of [leftName, rightName]) {
    for (const alias of scope.containerAliases.get(name) || []) {
      related.add(alias);
    }
  }
  for (const name of related) {
    if (!scope.containerAliases.has(name)) {
      scope.containerAliases.set(name, new Set());
    }
    const aliases = scope.containerAliases.get(name);
    for (const alias of related) {
      if (alias !== name) aliases.add(alias);
    }
  }
  for (const name of related) {
    markContainerPath(scope, name, staticInfo);
  }
}

function scopeHasContainerPath(scope, name) {
  return Boolean(name && scope?.containers?.has(name));
}

function scopeHasKnownContainerPath(scope, name) {
  if (!name) return false;
  let current = scope;
  while (current) {
    if (scopeHasContainerPath(current, name)) return true;
    if (scopeHasBinding(current, name) || scopeHasPrefixBinding(current, name)) return false;
    current = current.parent;
  }
  return false;
}

function getStaticContainerInfoFromScope(scope, name, seen = new Set()) {
  if (!scope || !name) return null;
  const seenKey = name;
  if (seen.has(seenKey)) return null;
  seen.add(seenKey);
  let current = scope;
  while (current) {
    const info = current.staticContainers.get(name);
    if (info) return cloneStaticContainerInfo(info);
    for (const alias of current.containerAliases.get(name) || []) {
      const aliasInfo = getStaticContainerInfoFromScope(current, alias, seen);
      if (aliasInfo) return aliasInfo;
    }
    if (scopeHasBinding(current, name) || scopeHasPrefixBinding(current, name)) return null;
    current = current.parent;
  }
  return null;
}

function isArrayIndexKey(key) {
  return /^(0|[1-9]\d*)$/.test(String(key));
}

function updateStaticContainerInfoForMemberAssignment(scope, memberName, valueNode) {
  if (!scope || !memberName || !memberName.includes('.')) return;
  const parts = memberName.split('.');
  const key = parts.pop();
  const parentName = parts.join('.');
  const info = scope.staticContainers.get(parentName);
  if (!info?.kind) return;
  if (info.kind === 'array') {
    if (key === 'length') {
      return;
    }
    info.keys.add(String(key));
    if (isArrayIndexKey(key)) {
      const index = Number(key);
      while (info.values.length <= index) {
        info.values.push(null);
      }
      info.values[index] = valueNode || null;
    }
    return;
  }
  if (info.kind === 'object') {
    info.keys.add(String(key));
  }
}

function invalidateStaticContainerInfoForMemberWrite(scope, memberName) {
  if (!scope || !memberName || !memberName.includes('.')) return;
  const parts = memberName.split('.');
  const key = parts.pop();
  const parentName = parts.join('.');
  const info = scope.staticContainers.get(parentName);
  if (!info?.kind) return;
  if (info.kind === 'array') {
    if (key === 'length') {
      info.exact = false;
      return;
    }
    if (isArrayIndexKey(key)) {
      const index = Number(key);
      while (info.values.length <= index) {
        info.values.push(null);
      }
      info.values[index] = null;
      info.keys.add(String(index));
      return;
    }
    info.exact = false;
    return;
  }
  if (info.kind === 'object') {
    info.keys.add(String(key));
  }
}

function resolveStaticArrayLengthAssignment(valueNode, scope, initializedAt) {
  const value = resolveStaticPrimitiveValue(valueNode, scope, initializedAt);
  if (value === STATIC_PRIMITIVE_UNKNOWN) return null;
  const length = Number(value);
  if (!Number.isInteger(length) || length < 0 || length > 4294967295) return null;
  return length;
}

function registerStaticArrayLengthAssignment(scope, memberName, valueNode, initializedAt) {
  if (!scope || !memberName || !memberName.endsWith('.length')) return false;
  const parentName = memberName.slice(0, -'.length'.length);
  const info = scope.staticContainers.get(parentName);
  if (info?.kind !== 'array') return false;
  const indexes = collectStaticArrayContainerMemberIndexes(scope, parentName);
  for (let index = 0; index < info.values.length; index += 1) {
    indexes.add(index);
  }
  const length = resolveStaticArrayLengthAssignment(valueNode, scope, initializedAt);
  if (length == null) {
    info.exact = false;
    for (const index of indexes) {
      const memberNameForIndex = `${parentName}.${index}`;
      addUnavailableFunctionDefinitionToScope(scope, memberNameForIndex, initializedAt);
      addUnavailableStaticPrimitiveDefinitionToScope(scope, memberNameForIndex, initializedAt);
    }
    return true;
  }
  while (info.values.length < length) {
    info.values.push(null);
  }
  info.values.length = length;
  for (const key of [...info.keys]) {
    if (isArrayIndexKey(key) && Number(key) >= length) {
      info.keys.delete(key);
    }
  }
  for (const index of indexes) {
    if (index >= length || !info.values[index]) {
      const memberNameForIndex = `${parentName}.${index}`;
      addUnavailableFunctionDefinitionToScope(scope, memberNameForIndex, initializedAt);
      addUnavailableStaticPrimitiveDefinitionToScope(scope, memberNameForIndex, initializedAt);
    }
  }
  return true;
}

function updateStaticContainerInfoForMemberDelete(scope, memberName) {
  if (!scope || !memberName || !memberName.includes('.')) return;
  const parts = memberName.split('.');
  const key = parts.pop();
  const parentName = parts.join('.');
  const info = scope.staticContainers.get(parentName);
  if (!info?.kind) return;
  if (info.kind === 'array') {
    if (key === 'length') {
      info.exact = false;
      return;
    }
    info.keys.delete(String(key));
    if (isArrayIndexKey(key)) {
      const index = Number(key);
      if (index < info.values.length) {
        info.values[index] = null;
      }
    }
    return;
  }
  if (info.kind === 'object') {
    info.keys.delete(String(key));
  }
}

function recomputeArrayStaticContainerKeys(info) {
  if (info?.kind !== 'array') return;
  info.keys = new Set();
  for (let index = 0; index < info.values.length; index += 1) {
    if (info.values[index]) info.keys.add(String(index));
  }
}

function normalizeArrayMutationIndex(value, length) {
  if (!Number.isFinite(value)) return null;
  const integer = Math.trunc(value);
  if (integer < 0) return Math.max(length + integer, 0);
  return Math.min(integer, length);
}

function updateStaticArrayContainerInfoForMethod(info, methodName, args, scope, executionStart) {
  if (info?.kind !== 'array') return false;
  if (['push', 'unshift'].includes(methodName)) {
    const values = [];
    for (const argument of args || []) {
      if (!argument || argument.type === 'SpreadElement') {
        info.exact = false;
        return true;
      }
      values.push(argument);
    }
    if (methodName === 'push') {
      info.values.push(...values);
    } else {
      info.values.unshift(...values);
    }
    recomputeArrayStaticContainerKeys(info);
    return true;
  }
  if (methodName === 'pop') {
    info.values.pop();
    recomputeArrayStaticContainerKeys(info);
    return true;
  }
  if (methodName === 'shift') {
    info.values.shift();
    recomputeArrayStaticContainerKeys(info);
    return true;
  }
  if (methodName === 'reverse') {
    info.values.reverse();
    recomputeArrayStaticContainerKeys(info);
    return true;
  }
  if (methodName === 'sort') {
    info.exact = false;
    return true;
  }
  if (methodName === 'splice') {
    const startValue = resolveStaticPrimitiveValue(args?.[0], scope, executionStart);
    if (startValue === STATIC_PRIMITIVE_UNKNOWN) {
      info.exact = false;
      return true;
    }
    const start = normalizeArrayMutationIndex(Number(startValue), info.values.length);
    if (start == null) {
      info.exact = false;
      return true;
    }
    let deleteCount = info.values.length - start;
    if ((args || []).length > 1) {
      const deleteValue = resolveStaticPrimitiveValue(args[1], scope, executionStart);
      if (deleteValue === STATIC_PRIMITIVE_UNKNOWN) {
        info.exact = false;
        return true;
      }
      deleteCount = Math.max(0, Math.min(Number(deleteValue), info.values.length - start));
    }
    const inserts = [];
    for (const argument of (args || []).slice(2)) {
      if (!argument || argument.type === 'SpreadElement') {
        info.exact = false;
        return true;
      }
      inserts.push(argument);
    }
    info.values.splice(start, deleteCount, ...inserts);
    recomputeArrayStaticContainerKeys(info);
    return true;
  }
  if (['fill', 'copyWithin'].includes(methodName)) {
    info.exact = false;
    return true;
  }
  return false;
}

function updateStaticObjectContainerInfoForAssign(info, sourceNodes) {
  if (info?.kind !== 'object') return false;
  for (const sourceNode of sourceNodes || []) {
    const source = unwrapChainNode(sourceNode);
    if (source?.type !== 'ObjectExpression') {
      info.exact = false;
      return true;
    }
    const sourceInfo = getObjectExpressionStaticContainerInfo(source);
    if (!sourceInfo?.exact) {
      info.exact = false;
      return true;
    }
    for (const key of sourceInfo.keys) {
      info.keys.add(String(key));
    }
  }
  return true;
}

function updateStaticArrayContainerInfoForAssign(info, sourceNodes) {
  if (info?.kind !== 'array') return false;
  for (const sourceNode of sourceNodes || []) {
    const source = unwrapChainNode(sourceNode);
    if (source?.type !== 'ObjectExpression') {
      info.exact = false;
      return true;
    }
    for (const property of source.properties || []) {
      if (property?.type !== 'Property') {
        info.exact = false;
        return true;
      }
      const key = getStaticPropertyName(property.key, { computed: Boolean(property.computed) });
      if (key == null) {
        info.exact = false;
        return true;
      }
      if (key === 'length') {
        info.exact = false;
        continue;
      }
      info.keys.add(String(key));
      if (isArrayIndexKey(key)) {
        const index = Number(key);
        while (info.values.length <= index) {
          info.values.push(null);
        }
        info.values[index] = property.value || null;
      }
    }
  }
  return true;
}

function updateStaticContainerInfoForAssign(info, sourceNodes) {
  return updateStaticObjectContainerInfoForAssign(info, sourceNodes)
    || updateStaticArrayContainerInfoForAssign(info, sourceNodes);
}

function collectEquivalentContainerMutationTargets(scope, containerName) {
  if (!scope || !containerName) return [];
  const sentinel = '__runjsMutationTarget__';
  const syntheticMemberName = `${containerName}.${sentinel}`;
  return collectEquivalentContainerMemberAssignmentTargets(scope, syntheticMemberName)
    .map((target) => ({
      scope: target.scope,
      name: target.name.endsWith(`.${sentinel}`)
        ? target.name.slice(0, -1 * (`.${sentinel}`).length)
        : containerName,
    }))
    .filter((target, index, targets) => (
      target.name
      && target.scope
      && targets.findIndex((candidate) => candidate.name === target.name && candidate.scope === target.scope) === index
    ));
}

function invalidateStaticContainerMemberDefinitions(scope, containerName, initializedAt) {
  if (!scope || !containerName) return;
  const prefix = `${containerName}.`;
  const names = new Set([
    ...[...scope.definitions.keys()].filter((key) => key.startsWith(prefix)),
    ...[...scope.staticPrimitives.keys()].filter((key) => key.startsWith(prefix)),
  ]);
  for (const name of names) {
    addUnavailableFunctionDefinitionToScope(scope, name, initializedAt);
    addUnavailableStaticPrimitiveDefinitionToScope(scope, name, initializedAt);
  }
}

function collectStaticArrayContainerMemberIndexes(scope, containerName) {
  const indexes = new Set();
  if (!scope || !containerName) return indexes;
  const prefix = `${containerName}.`;
  for (const key of new Set([...scope.definitions.keys(), ...scope.staticPrimitives.keys()])) {
    if (!key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length).split('.')[0];
    if (isArrayIndexKey(suffix)) indexes.add(Number(suffix));
  }
  return indexes;
}

function refreshStaticArrayContainerMemberDefinitions(scope, containerName, info, initializedAt) {
  if (!scope || !containerName || info?.kind !== 'array') return;
  const indexes = collectStaticArrayContainerMemberIndexes(scope, containerName);
  for (let index = 0; index < info.values.length; index += 1) {
    indexes.add(index);
  }
  for (const index of [...indexes].sort((left, right) => left - right)) {
    const value = info.values[index];
    const memberName = `${containerName}.${index}`;
    if (index >= info.values.length || !value) {
      addUnavailableFunctionDefinitionToScope(scope, memberName, initializedAt);
      addUnavailableStaticPrimitiveDefinitionToScope(scope, memberName, initializedAt);
      continue;
    }
    registerMemberFunctionAssignmentTarget(scope, scope, memberName, { right: value }, initializedAt);
  }
}

function registerObjectAssignSourceDefinitions(scope, containerName, sourceNode, initializedAt) {
  const source = unwrapChainNode(sourceNode);
  if (source?.type !== 'ObjectExpression') {
    invalidateStaticContainerMemberDefinitions(scope, containerName, initializedAt);
    return;
  }
  for (const property of source.properties || []) {
    if (property?.type !== 'Property') {
      invalidateStaticContainerMemberDefinitions(scope, containerName, initializedAt);
      return;
    }
    const key = getStaticPropertyName(property.key, { computed: Boolean(property.computed) });
    if (key == null) {
      invalidateStaticContainerMemberDefinitions(scope, containerName, initializedAt);
      return;
    }
    registerMemberFunctionAssignmentTarget(scope, scope, `${containerName}.${key}`, { right: property.value }, initializedAt);
  }
}

function registerStaticContainerMethodMutation(scope, expression, executionStart) {
  if (expression?.type !== 'CallExpression') return;
  const callee = unwrapChainNode(expression.callee);
  const args = expression.arguments || [];
  const calleePath = getStaticMemberPath(callee);
  if (calleePath?.length === 2 && calleePath[0] === 'Object' && calleePath[1] === 'assign') {
    const targetPath = getStaticMemberPath(args[0]);
    const targetName = targetPath?.join('.') || null;
    if (!targetName) return;
    for (const target of collectEquivalentContainerMutationTargets(scope, targetName)) {
      const info = target.scope.staticContainers.get(target.name);
      if (updateStaticContainerInfoForAssign(info, args.slice(1))) {
        for (const sourceNode of args.slice(1)) {
          registerObjectAssignSourceDefinitions(target.scope, target.name, sourceNode, executionStart);
        }
      }
    }
    return;
  }
  if (callee?.type !== 'MemberExpression') return;
  const methodName = getStaticPropertyName(callee.property, { computed: Boolean(callee.computed) });
  if (!methodName) return;
  const objectPath = getStaticMemberPath(callee.object);
  const objectName = objectPath?.join('.') || null;
  if (!objectName) return;
  for (const target of collectEquivalentContainerMutationTargets(scope, objectName)) {
    const info = target.scope.staticContainers.get(target.name);
    if (!info) continue;
    if (info.kind === 'array') {
      const changed = updateStaticArrayContainerInfoForMethod(info, methodName, args, target.scope, executionStart);
      if (!changed) continue;
      if (info.exact) {
        refreshStaticArrayContainerMemberDefinitions(target.scope, target.name, info, executionStart);
      } else {
        invalidateStaticContainerMemberDefinitions(target.scope, target.name, executionStart);
      }
    }
  }
}

function findObjectPropertyValue(objectNode, propertyName) {
  const expression = unwrapChainNode(objectNode);
  if (expression?.type !== 'ObjectExpression') return null;
  for (const property of expression.properties || []) {
    if (property?.type !== 'Property') continue;
    const key = getStaticPropertyName(property.key, { computed: Boolean(property.computed) });
    if (key === propertyName) return property.value;
  }
  return null;
}

function findArrayElementValue(arrayNode, index) {
  const expression = unwrapChainNode(arrayNode);
  if (expression?.type !== 'ArrayExpression') return null;
  return expression.elements?.[index] || null;
}

function findStaticContainerMemberValue(containerNode, propertyName) {
  const expression = unwrapChainNode(containerNode);
  if (expression?.type === 'ObjectExpression') {
    return findObjectPropertyValue(expression, propertyName);
  }
  if (expression?.type === 'ArrayExpression') {
    const index = Number(propertyName);
    if (!Number.isInteger(index) || index < 0 || String(index) !== String(propertyName)) return null;
    return findArrayElementValue(expression, index);
  }
  return null;
}

function resolveStaticLiteralExpressionValue(node) {
  const expression = unwrapChainNode(node);
  if (!isAstNode(expression)) return null;
  if (isFunctionNode(expression) || expression.type === 'ObjectExpression' || expression.type === 'ArrayExpression') {
    return expression;
  }
  if (expression.type !== 'MemberExpression') return null;
  const container = resolveStaticLiteralExpressionValue(expression.object);
  const propertyName = getStaticPropertyName(expression.property, { computed: Boolean(expression.computed) });
  if (!container || propertyName == null) return null;
  return findStaticContainerMemberValue(container, propertyName);
}

function addAliasedFunctionDefinitionToScope(scope, name, definition, initializedAt, { conditional = false, conditionKeys = [] } = {}) {
  if (!name || !definition) return;
  const mergedConditionKeys = mergeRenderExecutionConditionKeys(definition.conditionKeys, conditionKeys);
  const mergedConditional = Boolean(conditional || definition.conditional);
  if (definition.node) {
    addFunctionDefinition(scope.definitions, name, createFunctionDefinition(definition.node, {
      hoisted: false,
      initializedAt,
      conditional: mergedConditional,
      conditionKeys: mergedConditionKeys,
    }));
    return;
  }
  addFunctionDefinition(scope.definitions, name, createUnavailableFunctionDefinition({
    initializedAt,
    conditional: mergedConditional,
    conditionKeys: mergedConditionKeys,
    truthy: definition.truthy,
    nonNullish: definition.nonNullish,
  }));
}

function selectPossibleFunctionDefinitions(definitions, referenceStart) {
  const availableDefinitions = (definitions || [])
    .filter((candidate) => isFunctionDefinitionAvailable(candidate, referenceStart))
    .sort(compareFunctionDefinitionsForCall);
  let lastUnconditionalIndex = -1;
  for (let index = 0; index < availableDefinitions.length; index += 1) {
    if (!availableDefinitions[index].conditional) lastUnconditionalIndex = index;
  }
  const possibleDefinitions = [];
  if (lastUnconditionalIndex >= 0) {
    possibleDefinitions.push(availableDefinitions[lastUnconditionalIndex]);
  }
  for (const definition of pruneDominatedConditionalFunctionDefinitions(
    availableDefinitions.slice(lastUnconditionalIndex + 1),
  )) {
    if (definition.conditional) possibleDefinitions.push(definition);
  }
  return possibleDefinitions;
}

function memberPathPrefixes(name) {
  const parts = typeof name === 'string' ? name.split('.') : [];
  const prefixes = [];
  for (let index = 1; index < parts.length; index += 1) {
    prefixes.push(parts.slice(0, index).join('.'));
  }
  return prefixes;
}

function scopeHasBinding(scope, name) {
  return Boolean(name && (scope?.declared?.has(name) || scope?.definitions?.has(name)));
}

function scopeHasPrefixBinding(scope, name) {
  return memberPathPrefixes(name).some((prefix) => scopeHasBinding(scope, prefix));
}

function resolveAliasedFunctionDefinitionsFromScope(scope, name, referenceStart, seen) {
  const parts = typeof name === 'string' ? name.split('.') : [];
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const prefix = parts.slice(0, index).join('.');
    const suffix = parts.slice(index).join('.');
    for (const alias of scope.containerAliases.get(prefix) || []) {
      const aliasedName = suffix ? `${alias}.${suffix}` : alias;
      const seenKey = `${aliasedName}@${referenceStart ?? ''}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      const definitions = resolveFunctionDefinitionsFromScopeNameInternal(scope, aliasedName, referenceStart, seen);
      if (definitions !== null) return definitions;
    }
  }
  return null;
}

function copyDescendantFunctionDefinitions(
  sourceScope,
  sourceName,
  targetName,
  initializedAt,
  targetScope = sourceScope,
  referenceStart = initializedAt,
  { conditional = false } = {},
) {
  if (!sourceName || !targetName) return false;
  const sourcePrefix = `${sourceName}.`;
  let current = sourceScope;
  while (current) {
    let copiedInScope = false;
    for (const [key, definitions] of current.definitions.entries()) {
      if (!key.startsWith(sourcePrefix)) continue;
      const suffix = key.slice(sourcePrefix.length);
      const aliasName = `${targetName}.${suffix}`;
      const possibleDefinitions = selectPossibleFunctionDefinitions(definitions, referenceStart);
      if (possibleDefinitions.length === 0) {
        addFunctionDefinition(targetScope.definitions, aliasName, createUnavailableFunctionDefinition({ initializedAt, conditional }));
        copiedInScope = true;
        continue;
      }
      for (const definition of possibleDefinitions) {
        addAliasedFunctionDefinitionToScope(targetScope, aliasName, definition, initializedAt, { conditional });
        copiedInScope = true;
      }
    }
    if (copiedInScope || scopeHasBinding(current, sourceName) || scopeHasPrefixBinding(current, sourceName)) {
      return copiedInScope;
    }
    current = current.parent;
  }
  return false;
}

function hasEquivalentContainerMemberEntry(entries, name, scope) {
  return entries.some((entry) => entry.name === name && entry.scope === scope);
}

function collectEquivalentContainerMemberEntries(scope, name) {
  if (!scope || !name || !name.includes('.')) return [{ name, scope }];
  const entries = [];
  const queue = [];
  const enqueue = (entryName, entryScope) => {
    if (!entryName || !entryScope || hasEquivalentContainerMemberEntry(entries, entryName, entryScope)) return;
    const entry = { name: entryName, scope: entryScope };
    entries.push(entry);
    queue.push(entry);
  };

  enqueue(name, scope);
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const entry = queue[queueIndex];
    const parts = entry.name.split('.');
    let current = entry.scope;
    while (current) {
      for (let index = parts.length - 1; index >= 1; index -= 1) {
        const prefix = parts.slice(0, index).join('.');
        const suffix = parts.slice(index).join('.');
        for (const alias of current.containerAliases.get(prefix) || []) {
          enqueue(suffix ? `${alias}.${suffix}` : alias, current);
        }
      }
      if (scopeHasBinding(current, entry.name) || scopeHasPrefixBinding(current, entry.name)) {
        break;
      }
      current = current.parent;
    }
  }
  return entries;
}

function collectEquivalentContainerMemberAssignmentTargets(scope, name) {
  const targets = [];
  for (const entry of collectEquivalentContainerMemberEntries(scope, name)) {
    const rootName = entry.name.split('.')[0];
    const targetScope = findAssignmentTargetScope(entry.scope, rootName);
    if (targets.some((target) => target.name === entry.name && target.scope === targetScope)) continue;
    targets.push({ name: entry.name, scope: targetScope });
  }
  return targets;
}

function resolveFunctionDefinitionsFromScopeName(scope, name, referenceStart = null) {
  return resolveFunctionDefinitionsFromScopeNameInternal(scope, name, referenceStart, new Set());
}

function resolveFunctionDefinitionsFromScopeNameInternal(scope, name, referenceStart = null, seen = new Set()) {
  if (!name) return null;
  const ownSeenKey = `${name}@${referenceStart ?? ''}`;
  if (seen.has(ownSeenKey)) return null;
  seen.add(ownSeenKey);
  let current = scope;
  while (current) {
    if (current.declared.has(name) || current.definitions.has(name)) {
      const callStart = Number.isInteger(referenceStart) ? referenceStart : null;
      return selectPossibleFunctionDefinitions(current.definitions.get(name) || [], callStart);
    }
    const aliasedDefinitions = resolveAliasedFunctionDefinitionsFromScope(current, name, referenceStart, seen);
    if (aliasedDefinitions !== null) return aliasedDefinitions;
    if (scopeHasPrefixBinding(current, name)) {
      return [];
    }
    current = current.parent;
  }
  return null;
}

function addResolvedFunctionDefinitionsByNameToScope(
  scope,
  targetName,
  sourceName,
  initializedAt,
  { resolveScope = scope, referenceStart = initializedAt, conditional = false } = {},
) {
  const definitions = resolveFunctionDefinitionsFromScopeName(resolveScope, sourceName, referenceStart);
  const sourceIsKnownContainer = scopeHasKnownContainerPath(resolveScope, sourceName);
  const sourceStaticInfo = getStaticContainerInfoFromScope(resolveScope, sourceName);
  const sourceValueState = createStaticValueStateFromScopeName(resolveScope, sourceName, referenceStart);
  if (!definitions && !sourceIsKnownContainer) return false;
  scope.declared.add(targetName);
  copyDescendantFunctionDefinitions(resolveScope, sourceName, targetName, initializedAt, scope, referenceStart, { conditional });
  if (sourceStaticInfo) {
    markContainerPath(scope, targetName, sourceStaticInfo);
  }
  if (sourceIsKnownContainer && scopeHasKnownContainerPath(scope, sourceName)) {
    addContainerAlias(scope, targetName, sourceName);
  }
  if (sourceIsKnownContainer && resolveScope !== scope) {
    addContainerAlias(resolveScope, targetName, sourceName);
  }
  if (!definitions) {
    addFunctionValueStateDefinitionToScope(scope, targetName, initializedAt, sourceValueState, { conditional });
    return true;
  }
  if (definitions.length === 0) {
    addFunctionDefinition(scope.definitions, targetName, createUnavailableFunctionDefinition({ initializedAt, conditional }));
    addFunctionValueStateDefinitionToScope(scope, targetName, initializedAt, sourceValueState, { conditional });
    return true;
  }
  for (const definition of definitions) {
    addAliasedFunctionDefinitionToScope(scope, targetName, definition, initializedAt, { conditional });
  }
  if (!definitions.some((definition) => definition?.node)) {
    addFunctionValueStateDefinitionToScope(scope, targetName, initializedAt, sourceValueState, { conditional });
  }
  return true;
}

function addResolvedFunctionDefinitionsToScope(
  scope,
  targetName,
  sourceExpression,
  initializedAt,
  { resolveScope = scope, referenceStart = initializedAt, conditional = false } = {},
) {
  const literalValue = unwrapChainNode(resolveStaticLiteralExpressionValue(sourceExpression));
  if (isFunctionNode(literalValue)) {
    scope.declared.add(targetName);
    addAliasedFunctionDefinitionToScope(scope, targetName, createFunctionDefinition(literalValue, {
      hoisted: false,
      initializedAt,
    }), initializedAt, { conditional });
    return true;
  }
  if (literalValue?.type === 'ObjectExpression') {
    scope.declared.add(targetName);
    registerObjectMemberFunctionDefinitions(scope, targetName, literalValue, initializedAt, { conditional });
    addFunctionDefinition(scope.definitions, targetName, createUnavailableFunctionDefinition({
      initializedAt,
      conditional,
      truthy: true,
      nonNullish: true,
    }));
    return true;
  }
  if (literalValue?.type === 'ArrayExpression') {
    scope.declared.add(targetName);
    registerArrayElementFunctionDefinitions(scope, targetName, literalValue, initializedAt, { conditional });
    addFunctionDefinition(scope.definitions, targetName, createUnavailableFunctionDefinition({
      initializedAt,
      conditional,
      truthy: true,
      nonNullish: true,
    }));
    return true;
  }
  const sourcePath = getStaticMemberPath(sourceExpression);
  const sourceName = sourcePath?.join('.') || null;
  return addResolvedFunctionDefinitionsByNameToScope(scope, targetName, sourceName, initializedAt, {
    resolveScope,
    referenceStart,
    conditional,
  });
}

function registerArrayElementFunctionDefinitions(scope, baseName, arrayNode, initializedAt, { conditional = false } = {}) {
  const expression = unwrapChainNode(arrayNode);
  if (!baseName || expression?.type !== 'ArrayExpression') return;
  markContainerPath(scope, baseName, getArrayExpressionStaticContainerInfo(expression));
  for (let index = 0; index < (expression.elements || []).length; index += 1) {
    const value = unwrapChainNode(expression.elements[index]);
    if (value?.type === 'SpreadElement') continue;
    const memberName = `${baseName}.${index}`;
    if (isFunctionNode(value)) {
      addFunctionDefinitionToScope(scope, memberName, createFunctionDefinition(value, {
        hoisted: false,
        initializedAt,
        conditional,
      }));
    } else if (value?.type === 'ObjectExpression') {
      addUnavailableFunctionDefinitionToScope(scope, memberName, initializedAt, { conditional });
      registerObjectMemberFunctionDefinitions(scope, memberName, value, initializedAt, { conditional });
      addFunctionDefinition(scope.definitions, memberName, createUnavailableFunctionDefinition({
        initializedAt,
        conditional,
        truthy: true,
        nonNullish: true,
      }));
    } else if (value?.type === 'ArrayExpression') {
      addUnavailableFunctionDefinitionToScope(scope, memberName, initializedAt, { conditional });
      registerArrayElementFunctionDefinitions(scope, memberName, value, initializedAt, { conditional });
      addFunctionDefinition(scope.definitions, memberName, createUnavailableFunctionDefinition({
        initializedAt,
        conditional,
        truthy: true,
        nonNullish: true,
      }));
    } else {
      const valueState = createStaticValueStateFromNode(value, scope, initializedAt);
      registerStaticPrimitiveDefinitionFromNode(scope, memberName, value, initializedAt, { conditional });
      addUnavailableFunctionDefinitionToScope(scope, memberName, initializedAt, { conditional });
      addFunctionValueStateDefinitionToScope(scope, memberName, initializedAt, valueState, { conditional });
    }
  }
}

function registerObjectMemberFunctionDefinitions(scope, baseName, objectNode, initializedAt, { conditional = false } = {}) {
  const expression = unwrapChainNode(objectNode);
  if (!baseName || expression?.type !== 'ObjectExpression') return;
  markContainerPath(scope, baseName, getObjectExpressionStaticContainerInfo(expression));
  for (const property of expression.properties || []) {
    if (property?.type !== 'Property') continue;
    const key = getStaticPropertyName(property.key, { computed: Boolean(property.computed) });
    if (!key) continue;
    const memberName = `${baseName}.${key}`;
    if (isFunctionNode(property.value)) {
      addFunctionDefinitionToScope(scope, memberName, createFunctionDefinition(property.value, {
        hoisted: false,
        initializedAt,
        conditional,
      }));
    } else if (unwrapChainNode(property.value)?.type === 'ObjectExpression') {
      addUnavailableFunctionDefinitionToScope(scope, memberName, initializedAt, { conditional });
      registerObjectMemberFunctionDefinitions(scope, memberName, property.value, initializedAt, { conditional });
      addFunctionDefinition(scope.definitions, memberName, createUnavailableFunctionDefinition({
        initializedAt,
        conditional,
        truthy: true,
        nonNullish: true,
      }));
    } else if (unwrapChainNode(property.value)?.type === 'ArrayExpression') {
      addUnavailableFunctionDefinitionToScope(scope, memberName, initializedAt, { conditional });
      registerArrayElementFunctionDefinitions(scope, memberName, property.value, initializedAt, { conditional });
      addFunctionDefinition(scope.definitions, memberName, createUnavailableFunctionDefinition({
        initializedAt,
        conditional,
        truthy: true,
        nonNullish: true,
      }));
    } else {
      const valueState = createStaticValueStateFromNode(property.value, scope, initializedAt);
      registerStaticPrimitiveDefinitionFromNode(scope, memberName, property.value, initializedAt, { conditional });
      addUnavailableFunctionDefinitionToScope(scope, memberName, initializedAt, { conditional });
      addFunctionValueStateDefinitionToScope(scope, memberName, initializedAt, valueState, { conditional });
    }
  }
}

function isStaticUndefinedNode(node) {
  const expression = unwrapChainNode(node);
  return !isAstNode(expression)
    || (expression.type === 'Identifier' && expression.name === 'undefined')
    || (expression.type === 'UnaryExpression' && expression.operator === 'void');
}

function shouldUseValueDestructuringDefault(value) {
  return isStaticUndefinedNode(value);
}

function shouldUseSourcePathDestructuringDefault(scope, sourcePath, initializedAt) {
  if (!Array.isArray(sourcePath) || sourcePath.length === 0) return true;
  const sourceName = sourcePath.join('.');
  const primitive = resolveStaticPrimitiveFromScopeName(scope, sourceName, initializedAt);
  if (primitive === undefined) return true;
  if (primitive !== STATIC_PRIMITIVE_UNKNOWN) return false;
  if (scopeHasKnownContainerPath(scope, sourceName)) return false;
  const definitions = resolveFunctionDefinitionsFromScopeName(scope, sourceName, initializedAt);
  return !definitions || definitions.length === 0;
}

function registerPatternFunctionDefinitionsFromSourcePath(
  scope,
  pattern,
  sourcePath,
  initializedAt,
  { resolveScope = scope, referenceStart = initializedAt, conditional = false } = {},
) {
  const target = unwrapChainNode(pattern);
  if (!isAstNode(target) || !Array.isArray(sourcePath) || sourcePath.length === 0) return;
  if (target.type === 'Identifier') {
    const sourceName = sourcePath.join('.');
    const targetScope = findAssignmentTargetScope(scope, target.name);
    const valueState = createStaticValueStateFromSourcePath(resolveScope, sourcePath, referenceStart);
    registerStaticPrimitiveDefinitionFromSourcePath(targetScope, target.name, sourcePath, initializedAt, {
      resolveScope,
      referenceStart,
      conditional,
    });
    if (addResolvedFunctionDefinitionsByNameToScope(targetScope, target.name, sourceName, initializedAt, {
      resolveScope,
      referenceStart,
      conditional,
    })) return;
    targetScope.declared.add(target.name);
    addFunctionDefinition(targetScope.definitions, target.name, createUnavailableFunctionDefinition({ initializedAt, conditional }));
    addFunctionValueStateDefinitionToScope(targetScope, target.name, initializedAt, valueState, { conditional });
    return;
  }
  if (target.type === 'AssignmentPattern') {
    if (shouldUseSourcePathDestructuringDefault(resolveScope, sourcePath, initializedAt)) {
      registerPatternFunctionDefinitions(scope, target.left, target.right, initializedAt, {
        resolveScope,
        referenceStart,
        conditional,
      });
    } else {
      registerPatternFunctionDefinitionsFromSourcePath(scope, target.left, sourcePath, initializedAt, {
        resolveScope,
        referenceStart,
        conditional,
      });
    }
    return;
  }
  if (target.type === 'RestElement') {
    for (const name of collectAssignmentTargetIdentifiers(target.argument)) {
      addUnavailableFunctionDefinitionToScope(findAssignmentTargetScope(scope, name), name, initializedAt, { conditional });
    }
    return;
  }
  if (target.type === 'ArrayPattern') {
    for (let index = 0; index < (target.elements || []).length; index += 1) {
      const element = target.elements[index];
      if (!element) continue;
      registerPatternFunctionDefinitionsFromSourcePath(scope, element, [...sourcePath, String(index)], initializedAt, {
        resolveScope,
        referenceStart,
        conditional,
      });
    }
    return;
  }
  if (target.type === 'ObjectPattern') {
    for (const property of target.properties || []) {
      if (property?.type === 'RestElement') {
        for (const name of collectAssignmentTargetIdentifiers(property.argument)) {
          addUnavailableFunctionDefinitionToScope(findAssignmentTargetScope(scope, name), name, initializedAt, { conditional });
        }
        continue;
      }
      if (property?.type !== 'Property') continue;
      const key = getStaticPropertyName(property.key, { computed: Boolean(property.computed) });
      if (key == null) {
        for (const name of collectAssignmentTargetIdentifiers(property.value)) {
          addUnavailableFunctionDefinitionToScope(findAssignmentTargetScope(scope, name), name, initializedAt, { conditional });
        }
        continue;
      }
      registerPatternFunctionDefinitionsFromSourcePath(scope, property.value, [...sourcePath, key], initializedAt, {
        resolveScope,
        referenceStart,
        conditional,
      });
    }
  }
}

function registerPatternFunctionDefinitions(
  scope,
  pattern,
  valueNode,
  initializedAt,
  { resolveScope = scope, referenceStart = initializedAt, conditional = false } = {},
) {
  const target = unwrapChainNode(pattern);
  const value = unwrapChainNode(valueNode);
  if (!isAstNode(target)) return;
  if (target.type === 'Identifier') {
    const targetScope = findAssignmentTargetScope(scope, target.name);
    const valueState = createStaticValueStateFromNode(value, resolveScope, referenceStart);
    registerStaticPrimitiveDefinitionFromNode(targetScope, target.name, value, initializedAt, {
      resolveScope,
      referenceStart,
      conditional,
    });
    if (isFunctionNode(value)) {
      addFunctionDefinitionToScope(targetScope, target.name, createFunctionDefinition(value, {
        hoisted: false,
        initializedAt,
        conditional,
      }));
    } else if (value?.type === 'ObjectExpression') {
      addUnavailableFunctionDefinitionToScope(targetScope, target.name, initializedAt, { conditional });
      registerObjectMemberFunctionDefinitions(targetScope, target.name, value, initializedAt, { conditional });
      addFunctionDefinition(targetScope.definitions, target.name, createUnavailableFunctionDefinition({
        initializedAt,
        conditional,
        ...valueState,
      }));
    } else if (value?.type === 'ArrayExpression') {
      addUnavailableFunctionDefinitionToScope(targetScope, target.name, initializedAt, { conditional });
      registerArrayElementFunctionDefinitions(targetScope, target.name, value, initializedAt, { conditional });
      addFunctionDefinition(targetScope.definitions, target.name, createUnavailableFunctionDefinition({
        initializedAt,
        conditional,
        ...valueState,
      }));
    } else if (addResolvedFunctionDefinitionsToScope(targetScope, target.name, value, initializedAt, {
      resolveScope,
      referenceStart,
      conditional,
    })) {
      return;
    } else {
      addUnavailableFunctionDefinitionToScope(targetScope, target.name, initializedAt, { conditional });
      addFunctionValueStateDefinitionToScope(targetScope, target.name, initializedAt, valueState, { conditional });
    }
    return;
  }
  if (target.type === 'AssignmentPattern') {
    registerPatternFunctionDefinitions(
      scope,
      target.left,
      shouldUseValueDestructuringDefault(value) ? target.right : value,
      initializedAt,
      { resolveScope, referenceStart, conditional },
    );
    return;
  }
  if (target.type === 'RestElement') {
    for (const name of collectAssignmentTargetIdentifiers(target.argument)) {
      addUnavailableFunctionDefinitionToScope(findAssignmentTargetScope(scope, name), name, initializedAt, { conditional });
    }
    return;
  }
  if (target.type === 'ArrayPattern') {
    const valuePath = getStaticMemberPath(value);
    if (valuePath) {
      registerPatternFunctionDefinitionsFromSourcePath(scope, target, valuePath, initializedAt, {
        resolveScope,
        referenceStart,
        conditional,
      });
      return;
    }
    const elements = value?.type === 'ArrayExpression' ? value.elements || [] : [];
    for (let index = 0; index < (target.elements || []).length; index += 1) {
      const element = target.elements[index];
      if (!element) continue;
      registerPatternFunctionDefinitions(scope, element, elements[index], initializedAt, {
        resolveScope,
        referenceStart,
        conditional,
      });
    }
    return;
  }
  if (target.type === 'ObjectPattern') {
    const valuePath = getStaticMemberPath(value);
    if (valuePath) {
      registerPatternFunctionDefinitionsFromSourcePath(scope, target, valuePath, initializedAt, {
        resolveScope,
        referenceStart,
        conditional,
      });
      return;
    }
    for (const property of target.properties || []) {
      if (property?.type === 'RestElement') {
        for (const name of collectAssignmentTargetIdentifiers(property.argument)) {
          addUnavailableFunctionDefinitionToScope(findAssignmentTargetScope(scope, name), name, initializedAt, { conditional });
        }
        continue;
      }
      if (property?.type !== 'Property') continue;
      const key = getStaticPropertyName(property.key, { computed: Boolean(property.computed) });
      const propertyValue = key == null ? null : findObjectPropertyValue(value, key);
      registerPatternFunctionDefinitions(scope, property.value, propertyValue, initializedAt, {
        resolveScope,
        referenceStart,
        conditional,
      });
    }
  }
}

function registerFunctionVariableDefinition(scope, declarator, statement) {
  if (!declarator.init) return;
  const initializedAt = Number.isInteger(declarator.start)
    ? declarator.start
    : (Number.isInteger(statement?.start) ? statement.start : null);
  const targetScope = statement?.kind === 'var' ? scope.varTarget : scope;
  if (declarator?.id?.type !== 'Identifier') {
    registerPatternFunctionDefinitions(targetScope, declarator?.id, declarator.init, initializedAt, { resolveScope: scope });
    return;
  }
  if (!isFunctionNode(declarator.init)) {
    const valueState = createStaticValueStateFromNode(declarator.init, targetScope, initializedAt);
    const primitive = resolveStaticPrimitiveValue(declarator.init, targetScope, initializedAt);
    if (primitive !== STATIC_PRIMITIVE_UNKNOWN) {
      addStaticPrimitiveDefinitionToScope(targetScope, declarator.id.name, primitive, initializedAt);
    }
    if (unwrapChainNode(declarator.init)?.type === 'ObjectExpression') {
      registerObjectMemberFunctionDefinitions(targetScope, declarator.id.name, declarator.init, initializedAt);
      addFunctionDefinition(targetScope.definitions, declarator.id.name, createUnavailableFunctionDefinition({ initializedAt, ...valueState }));
      return;
    }
    if (unwrapChainNode(declarator.init)?.type === 'ArrayExpression') {
      registerArrayElementFunctionDefinitions(targetScope, declarator.id.name, declarator.init, initializedAt);
      addFunctionDefinition(targetScope.definitions, declarator.id.name, createUnavailableFunctionDefinition({ initializedAt, ...valueState }));
      return;
    }
    if (addResolvedFunctionDefinitionsToScope(targetScope, declarator.id.name, declarator.init, initializedAt)) {
      return;
    }
    addUnavailableFunctionDefinitionToScope(targetScope, declarator.id.name, initializedAt);
    addFunctionValueStateDefinitionToScope(targetScope, declarator.id.name, initializedAt, valueState);
    return;
  }
  addFunctionDefinitionToScope(targetScope, declarator.id.name, createFunctionDefinition(declarator.init, {
    hoisted: false,
    initializedAt,
  }));
}

function registerMemberFunctionAssignmentTarget(resolveScope, targetScope, memberName, expression, initializedAt) {
  const valueState = createStaticValueStateFromNode(expression.right, resolveScope, initializedAt);
  if (!registerStaticArrayLengthAssignment(targetScope, memberName, expression.right, initializedAt)) {
    updateStaticContainerInfoForMemberAssignment(targetScope, memberName, expression.right);
  }
  addUnavailableStaticPrimitiveDefinitionToScope(targetScope, memberName, initializedAt);
  if (isFunctionNode(expression.right)) {
    addFunctionDefinitionToScope(targetScope, memberName, createFunctionDefinition(expression.right, {
      hoisted: false,
      initializedAt,
    }));
  } else if (unwrapChainNode(expression.right)?.type === 'ObjectExpression') {
    addUnavailableFunctionDefinitionToScope(targetScope, memberName, initializedAt);
    registerObjectMemberFunctionDefinitions(targetScope, memberName, expression.right, initializedAt);
    addFunctionDefinition(targetScope.definitions, memberName, createUnavailableFunctionDefinition({ initializedAt, ...valueState }));
  } else if (unwrapChainNode(expression.right)?.type === 'ArrayExpression') {
    addUnavailableFunctionDefinitionToScope(targetScope, memberName, initializedAt);
    registerArrayElementFunctionDefinitions(targetScope, memberName, expression.right, initializedAt);
    addFunctionDefinition(targetScope.definitions, memberName, createUnavailableFunctionDefinition({ initializedAt, ...valueState }));
  } else if (!addResolvedFunctionDefinitionsToScope(targetScope, memberName, expression.right, initializedAt, { resolveScope })) {
    registerStaticPrimitiveDefinitionFromNode(targetScope, memberName, expression.right, initializedAt, { resolveScope });
    addUnavailableFunctionDefinitionToScope(targetScope, memberName, initializedAt);
    addFunctionValueStateDefinitionToScope(targetScope, memberName, initializedAt, valueState);
  }
}

function registerMemberFunctionAssignmentTargets(scope, memberName, expression, initializedAt) {
  for (const target of collectEquivalentContainerMemberAssignmentTargets(scope, memberName)) {
    registerMemberFunctionAssignmentTarget(scope, target.scope, target.name, expression, initializedAt);
  }
}

function registerFunctionAssignmentDefinition(scope, expression, statement) {
  if (
    expression?.type !== 'AssignmentExpression'
    || expression.operator !== '='
  ) {
    return;
  }
  const initializedAt = Number.isInteger(expression.start)
    ? expression.start
    : (Number.isInteger(statement?.start) ? statement.start : null);
  if (isStaticSelfAssignmentExpression(expression)) {
    return;
  }
  const memberPath = getStaticMemberPath(expression.left);
  if (memberPath?.length > 1) {
    const memberName = memberPath.join('.');
    unmarkContainerPath(scope, memberName);
    removeContainerAliasesForPath(scope, memberName);
    registerMemberFunctionAssignmentTargets(scope, memberName, expression, initializedAt);
    return;
  }
  if (expression.left?.type !== 'Identifier') {
    for (const name of collectAssignmentTargetIdentifiers(expression.left)) {
      registerStaticPrimitiveInvalidation(scope, name, initializedAt);
    }
    registerPatternFunctionDefinitions(scope, expression.left, expression.right, initializedAt);
    return;
  }
  const targetScope = findAssignmentTargetScope(scope, expression.left.name);
  unmarkContainerPath(scope, expression.left.name);
  removeContainerAliasesForPath(scope, expression.left.name);
  registerStaticPrimitiveInvalidation(scope, expression.left.name, initializedAt);
  if (!isFunctionNode(expression.right)) {
    const valueState = createStaticValueStateFromNode(expression.right, scope, initializedAt);
    if (unwrapChainNode(expression.right)?.type === 'ObjectExpression') {
      addUnavailableFunctionDefinitionToScope(targetScope, expression.left.name, initializedAt);
      registerObjectMemberFunctionDefinitions(targetScope, expression.left.name, expression.right, initializedAt);
      addFunctionDefinition(targetScope.definitions, expression.left.name, createUnavailableFunctionDefinition({ initializedAt, ...valueState }));
      return;
    }
    if (unwrapChainNode(expression.right)?.type === 'ArrayExpression') {
      addUnavailableFunctionDefinitionToScope(targetScope, expression.left.name, initializedAt);
      registerArrayElementFunctionDefinitions(targetScope, expression.left.name, expression.right, initializedAt);
      addFunctionDefinition(targetScope.definitions, expression.left.name, createUnavailableFunctionDefinition({ initializedAt, ...valueState }));
      return;
    }
    if (addResolvedFunctionDefinitionsToScope(targetScope, expression.left.name, expression.right, initializedAt, { resolveScope: scope })) {
      return;
    }
    addUnavailableFunctionDefinitionToScope(targetScope, expression.left.name, initializedAt);
    addFunctionValueStateDefinitionToScope(targetScope, expression.left.name, initializedAt, valueState);
    return;
  }
  addFunctionDefinitionToScope(targetScope, expression.left.name, createFunctionDefinition(expression.right, {
    hoisted: false,
    initializedAt,
  }));
}

function registerUpdateExpressionInvalidation(scope, expression) {
  if (expression?.type !== 'UpdateExpression') return;
  const initializedAt = Number.isInteger(expression.start) ? expression.start : null;
  if (getStaticMemberPath(expression.argument)?.length > 1) {
    invalidateAssignmentTarget(scope, expression.argument, initializedAt);
    return;
  }
  if (expression.argument?.type !== 'Identifier') return;
  registerUnavailableFunctionDefinition(scope, expression.argument.name, initializedAt);
  registerStaticPrimitiveInvalidation(scope, expression.argument.name, initializedAt);
}

function isLogicalAssignmentOperator(operator) {
  return operator === '||=' || operator === '&&=' || operator === '??=';
}

function getStaticAssignmentTargetName(node) {
  const targetPath = getStaticMemberPath(node);
  return targetPath?.join('.') || null;
}

function staticMemberPathsEqual(left, right) {
  const leftPath = getStaticMemberPath(left);
  const rightPath = getStaticMemberPath(right);
  return Boolean(leftPath && rightPath)
    && leftPath.length === rightPath.length
    && leftPath.every((part, index) => part === rightPath[index]);
}

function isStaticSelfAssignmentExpression(expression) {
  return expression?.type === 'AssignmentExpression'
    && expression.operator === '='
    && staticMemberPathsEqual(expression.left, expression.right);
}

function resolveStaticTargetTruthyValue(node, scope, referenceStart = null) {
  const primitive = resolveStaticPrimitiveValue(node, scope, referenceStart);
  if (primitive !== STATIC_PRIMITIVE_UNKNOWN) return Boolean(primitive);
  const targetName = getStaticAssignmentTargetName(node);
  if (!targetName) {
    const literal = unwrapChainNode(resolveStaticLiteralExpressionValue(node));
    return isFunctionNode(literal) || literal?.type === 'ObjectExpression' || literal?.type === 'ArrayExpression'
      ? true
      : null;
  }
  const definitions = resolveFunctionDefinitionsFromScopeName(scope, targetName, referenceStart);
  if (definitions?.length > 0 && definitions.every((definition) => Boolean(definition?.node))) {
    return true;
  }
  if (scopeHasKnownContainerPath(scope, targetName)) return true;
  return null;
}

function resolveActivePathTargetValueState(node, scope, referenceStart = null) {
  const targetName = getStaticAssignmentTargetName(node);
  if (!targetName) return null;
  const activeConditionKeys = normalizeRenderExecutionConditionKeys(scope?.activeConditionKeys || []);
  const throwScopeState = resolveActiveThrowScopeTargetValueState(scope, targetName, referenceStart);
  if (activeConditionKeys.length === 0) return throwScopeState;
  const definitions = resolveFunctionDefinitionsFromScopeName(scope, targetName, referenceStart) || [];
  let latestState = null;
  for (const definition of definitions) {
    if (definition?.conditional) {
      const definitionConditionKeys = normalizeRenderExecutionConditionKeys(definition.conditionKeys);
      if (
        definitionConditionKeys.length === 0
        || !conditionKeysImply(activeConditionKeys, definitionConditionKeys)
      ) {
        continue;
      }
    }
    const state = getFunctionDefinitionValueState(definition);
    if (state) latestState = state;
  }
  return latestState || throwScopeState;
}

function shouldEvaluateLogicalAssignmentRight(expression, scope, executionStart) {
  if (!isLogicalAssignmentOperator(expression?.operator)) return null;
  const referenceStart = Number.isInteger(executionStart) ? executionStart : expression.start;
  if (expression.operator === '??=') {
    const primitive = resolveStaticPrimitiveValue(expression.left, scope, referenceStart);
    if (primitive !== STATIC_PRIMITIVE_UNKNOWN) return primitive == null;
    const pathState = resolveActivePathTargetValueState(expression.left, scope, referenceStart);
    if (typeof pathState?.nonNullish === 'boolean') return !pathState.nonNullish;
    const truthy = resolveStaticTargetTruthyValue(expression.left, scope, referenceStart);
    return truthy === true ? false : null;
  }
  const pathState = resolveActivePathTargetValueState(expression.left, scope, referenceStart);
  if (typeof pathState?.truthy === 'boolean') {
    return expression.operator === '&&=' ? pathState.truthy : !pathState.truthy;
  }
  const truthy = resolveStaticTargetTruthyValue(expression.left, scope, referenceStart);
  if (truthy == null) return null;
  return expression.operator === '&&=' ? truthy : !truthy;
}

function invalidateAssignmentTarget(scope, target, initializedAt) {
  const memberPath = getStaticMemberPath(target);
  if (memberPath?.length > 1) {
    const memberName = memberPath.join('.');
    unmarkContainerPath(scope, memberName);
    removeContainerAliasesForPath(scope, memberName);
    for (const assignmentTarget of collectEquivalentContainerMemberAssignmentTargets(scope, memberName)) {
      invalidateStaticContainerInfoForMemberWrite(assignmentTarget.scope, assignmentTarget.name);
      addUnavailableFunctionDefinitionToScope(assignmentTarget.scope, assignmentTarget.name, initializedAt);
      addUnavailableStaticPrimitiveDefinitionToScope(assignmentTarget.scope, assignmentTarget.name, initializedAt);
    }
    return;
  }
  for (const name of collectAssignmentTargetIdentifiers(target)) {
    const targetScope = findAssignmentTargetScope(scope, name);
    unmarkContainerPath(targetScope, name);
    removeContainerAliasesForPath(targetScope, name);
    addUnavailableFunctionDefinitionToScope(targetScope, name, initializedAt);
    addUnavailableStaticPrimitiveDefinitionToScope(targetScope, name, initializedAt);
  }
}

function analyzeForcedAssignmentExecutionPath(expression, scope, executionStart, seen) {
  const forcedExpression = expression.operator === '=' ? expression : { ...expression, operator: '=' };
  registerFunctionAssignmentDefinition(scope, forcedExpression, expression);
  if (isFunctionNode(expression.right)) return createExecutionPathResult();
  return analyzeExpressionExecutionPath(expression.right, scope, executionStart, seen);
}

function analyzeForcedAssignmentExecutionPathInConditionalScope(
  expression,
  scope,
  executionStart,
  seen,
  { conditionKeys = [] } = {},
) {
  const cloned = cloneRenderExecutionScopeChainWithMap(scope);
  addActiveRenderExecutionConditionKeys(cloned.scope, conditionKeys);
  const result = analyzeForcedAssignmentExecutionPath(
    expression,
    cloned.scope,
    executionStart,
    new Set(seen),
  );
  if (!result.hasRender && !result.terminated) {
    mergeConditionalDefinitionsFromScopeClone(scope, cloned.scope, { conditionKeys });
  }
  return addConditionalThrowScope(result, scope, cloned.scope, { conditionKeys });
}

function analyzeCompoundAssignmentExecutionPath(expression, scope, executionStart, seen) {
  const initializedAt = Number.isInteger(expression.start) ? expression.start : null;
  const leftResult = analyzeExpressionExecutionPath(expression.left, scope, executionStart, seen);
  if (leftResult.hasRender || leftResult.terminated) return leftResult;
  const rightResult = isFunctionNode(expression.right)
    ? createExecutionPathResult()
    : analyzeExpressionExecutionPath(expression.right, scope, executionStart, seen);
  if (rightResult.hasRender || rightResult.terminated) return rightResult;
  invalidateAssignmentTarget(scope, expression.left, initializedAt);
  return createExecutionPathResult({
    mayThrow: leftResult.mayThrow || rightResult.mayThrow,
    throwScopes: collectThrowScopes(leftResult, rightResult),
  });
}

function analyzeLogicalAssignmentExecutionPath(expression, scope, executionStart, seen) {
  const leftResult = analyzeExpressionExecutionPath(expression.left, scope, executionStart, seen);
  if (leftResult.hasRender || leftResult.terminated) return leftResult;
  const shouldEvaluateRight = shouldEvaluateLogicalAssignmentRight(expression, scope, executionStart);
  if (shouldEvaluateRight === false) {
    return createExecutionPathResult({
      mayThrow: leftResult.mayThrow,
      throwScopes: getThrowScopes(leftResult),
    });
  }
  if (shouldEvaluateRight === true) {
    const rightResult = analyzeForcedAssignmentExecutionPath(expression, scope, executionStart, seen);
    return createExecutionPathResult({
      hasRender: rightResult.hasRender,
      terminated: rightResult.terminated,
      throws: rightResult.throws,
      mayThrow: leftResult.mayThrow || rightResult.mayThrow,
      termination: rightResult.termination,
      throwScopes: collectThrowScopes(leftResult, rightResult),
    });
  }
  const conditionKeys = expression.operator === '&&='
    ? createRenderExecutionConditionKeys(
      expression.left,
      true,
      scope,
      Number.isInteger(expression.left?.start) ? expression.left.start : executionStart,
    )
    : (expression.operator === '||=' ? createRenderExecutionConditionKeys(
      expression.left,
      false,
      scope,
      Number.isInteger(expression.left?.start) ? expression.left.start : executionStart,
    ) : []);
  const rightResult = analyzeForcedAssignmentExecutionPathInConditionalScope(
    expression,
    scope,
    executionStart,
    seen,
    { conditionKeys },
  );
  return createExecutionPathResult({
    hasRender: rightResult.hasRender,
    terminated: false,
    mayThrow: leftResult.mayThrow || rightResult.mayThrow,
    throwScopes: collectThrowScopes(leftResult, rightResult),
  });
}

function isFunctionDefinitionAvailable(definition, callStart) {
  if (!definition) return false;
  if (definition.hoisted) return true;
  return Number.isInteger(definition.initializedAt)
    && Number.isInteger(callStart)
    && definition.initializedAt < callStart;
}

function compareFunctionDefinitionsForCall(left, right) {
  const leftEffectiveAt = left.hoisted ? Number.NEGATIVE_INFINITY : Number(left.initializedAt);
  const rightEffectiveAt = right.hoisted ? Number.NEGATIVE_INFINITY : Number(right.initializedAt);
  if (leftEffectiveAt !== rightEffectiveAt) {
    return leftEffectiveAt - rightEffectiveAt;
  }
  return Number(left.declarationStart || 0) - Number(right.declarationStart || 0);
}

function resolveCalledFunctionsFromScope(callExpression, scope, executionStart = null) {
  const callee = unwrapChainNode(callExpression?.callee);
  if (isFunctionNode(callee)) return [callee];
  const literalCallee = unwrapChainNode(resolveStaticLiteralExpressionValue(callee));
  if (isFunctionNode(literalCallee)) return [literalCallee];
  const calleePath = getStaticMemberPath(callee);
  const calleeName = calleePath?.join('.') || null;
  if (!calleeName) return [];

  const callStart = Number.isInteger(executionStart) ? executionStart : callExpression?.start;
  const possibleDefinitions = resolveFunctionDefinitionsFromScopeName(scope, calleeName, callStart) || [];
  return Array.from(new Set(possibleDefinitions.map((definition) => definition?.node).filter(Boolean)));
}

function getFunctionCallArgument(args, index) {
  const argument = args?.[index] || null;
  if (!argument || argument.type === 'SpreadElement') {
    return { hasArgument: false, node: null };
  }
  return { hasArgument: true, node: argument };
}

function bindFunctionCallParameter(
  scope,
  parameter,
  argument,
  initializedAt,
  argumentScope,
  referenceStart,
  seen,
) {
  const target = unwrapChainNode(parameter);
  if (!isAstNode(target)) return createExecutionPathResult();
  if (target.type === 'AssignmentPattern') {
    const useDefault = !argument.hasArgument || isStaticUndefinedNode(argument.node);
    if (useDefault) {
      const defaultResult = analyzeExpressionExecutionPath(target.right, scope, referenceStart, seen);
      if (defaultResult.hasRender || defaultResult.terminated) return defaultResult;
      registerPatternFunctionDefinitions(scope, target.left, target.right, initializedAt, {
        resolveScope: scope,
        referenceStart,
      });
      return createExecutionPathResult({
        mayThrow: defaultResult.mayThrow,
        throwScopes: getThrowScopes(defaultResult),
      });
    }
    registerPatternFunctionDefinitions(scope, target.left, argument.node, initializedAt, {
      resolveScope: argumentScope,
      referenceStart,
    });
    return createExecutionPathResult();
  }
  if (target.type === 'RestElement') {
    for (const name of collectAssignmentTargetIdentifiers(target.argument)) {
      addUnavailableFunctionDefinitionToScope(findAssignmentTargetScope(scope, name), name, initializedAt);
    }
    return createExecutionPathResult();
  }
  if (!argument.hasArgument) return createExecutionPathResult();
  registerPatternFunctionDefinitions(scope, target, argument.node, initializedAt, {
    resolveScope: argumentScope,
    referenceStart,
  });
  return createExecutionPathResult();
}

function bindFunctionCallParameters(scope, params, args, initializedAt, argumentScope, referenceStart, seen) {
  let mayThrow = false;
  let throwScopes = [];
  for (let index = 0; index < (params || []).length; index += 1) {
    const result = bindFunctionCallParameter(
      scope,
      params[index],
      getFunctionCallArgument(args, index),
      initializedAt,
      argumentScope,
      referenceStart,
      seen,
    );
    if (result.hasRender || result.terminated) return result;
    mayThrow = mayThrow || result.mayThrow;
    throwScopes = [...throwScopes, ...getThrowScopes(result)];
  }
  return createExecutionPathResult({ mayThrow, throwScopes });
}

function getFunctionParameterInitializedAt(functionNode, fallback) {
  const paramEnds = (functionNode?.params || [])
    .map((param) => param?.end)
    .filter((value) => Number.isInteger(value));
  if (paramEnds.length > 0) return Math.max(...paramEnds);
  return Number.isInteger(functionNode?.start) ? functionNode.start : fallback;
}

function isStaticPrimitiveDefinitionAvailable(definition, referenceStart) {
  if (!definition) return false;
  if (!Number.isInteger(referenceStart)) return true;
  return Number.isInteger(definition.initializedAt) && definition.initializedAt < referenceStart;
}

function resolveStaticPrimitiveFromScopeName(scope, name, referenceStart = null) {
  if (!scope || !name) return STATIC_PRIMITIVE_UNKNOWN;
  let current = scope;
  while (current) {
    if (current.declared.has(name) || current.staticPrimitives.has(name)) {
      const definitions = (current.staticPrimitives.get(name) || [])
        .filter((candidate) => isStaticPrimitiveDefinitionAvailable(candidate, referenceStart));
      let lastUnconditional = null;
      for (const definition of definitions) {
        if (!definition.conditional) lastUnconditional = definition;
      }
      if (!lastUnconditional || lastUnconditional.unavailable) return STATIC_PRIMITIVE_UNKNOWN;
      if (definitions.some((definition) => definition.conditional && definition.initializedAt > lastUnconditional.initializedAt)) {
        return STATIC_PRIMITIVE_UNKNOWN;
      }
      return lastUnconditional.value;
    }
    current = current.parent;
  }
  return STATIC_PRIMITIVE_UNKNOWN;
}

function resolveStaticBooleanValue(node, scope = null, executionStart = null) {
  const primitive = resolveStaticPrimitiveValue(node, scope, executionStart);
  return primitive === STATIC_PRIMITIVE_UNKNOWN ? null : Boolean(primitive);
}

const STATIC_PRIMITIVE_UNKNOWN = Symbol('runjs-static-primitive-unknown');

function isStaticPrimitiveValue(value) {
  return value == null || ['boolean', 'number', 'string', 'bigint'].includes(typeof value);
}

function createStaticBinaryValue(operator, left, right) {
  try {
    switch (operator) {
      case '===':
        return left === right;
      case '!==':
        return left !== right;
      case '==':
        return left == right;
      case '!=':
        return left != right;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        return left / right;
      case '%':
        return left % right;
      case '**':
        return left ** right;
      case '|':
        return left | right;
      case '&':
        return left & right;
      case '^':
        return left ^ right;
      case '<<':
        return left << right;
      case '>>':
        return left >> right;
      case '>>>':
        return left >>> right;
      default:
        return STATIC_PRIMITIVE_UNKNOWN;
    }
  } catch (_) {
    return STATIC_PRIMITIVE_UNKNOWN;
  }
}

function resolveStaticPrimitiveValue(node, scope = null, executionStart = null) {
  const expression = unwrapChainNode(node);
  if (!expression) return STATIC_PRIMITIVE_UNKNOWN;
  if (expression.type === 'Identifier') {
    if (expression.name === 'undefined') return undefined;
    const referenceStart = Number.isInteger(executionStart) ? executionStart : expression.start;
    return resolveStaticPrimitiveFromScopeName(scope, expression.name, referenceStart);
  }
  if (expression.type === 'Literal') {
    return isStaticPrimitiveValue(expression.value) ? expression.value : STATIC_PRIMITIVE_UNKNOWN;
  }
  if (
    expression.type === 'TemplateLiteral'
    && Array.isArray(expression.expressions)
    && expression.expressions.length === 0
  ) {
    return expression.quasis?.map((item) => item.value?.cooked ?? item.value?.raw ?? '').join('') ?? '';
  }
  if (expression.type === 'UnaryExpression' && expression.operator === 'void') {
    return undefined;
  }
  if (expression.type === 'UnaryExpression' && expression.operator === '!') {
    const argument = resolveStaticPrimitiveValue(expression.argument, scope, executionStart);
    return argument === STATIC_PRIMITIVE_UNKNOWN ? STATIC_PRIMITIVE_UNKNOWN : !Boolean(argument);
  }
  if (expression.type === 'UnaryExpression' && ['+', '-', '~'].includes(expression.operator)) {
    const argument = resolveStaticPrimitiveValue(expression.argument, scope, executionStart);
    if (argument === STATIC_PRIMITIVE_UNKNOWN) return STATIC_PRIMITIVE_UNKNOWN;
    if (expression.operator === '+') return +argument;
    if (expression.operator === '-') return -argument;
    return ~argument;
  }
  if (expression.type === 'BinaryExpression') {
    const left = resolveStaticPrimitiveValue(expression.left, scope, executionStart);
    const right = resolveStaticPrimitiveValue(expression.right, scope, executionStart);
    if (left === STATIC_PRIMITIVE_UNKNOWN || right === STATIC_PRIMITIVE_UNKNOWN) return STATIC_PRIMITIVE_UNKNOWN;
    return createStaticBinaryValue(expression.operator, left, right);
  }
  if (expression.type === 'LogicalExpression') {
    const left = resolveStaticPrimitiveValue(expression.left, scope, executionStart);
    if (left === STATIC_PRIMITIVE_UNKNOWN) return STATIC_PRIMITIVE_UNKNOWN;
    if (expression.operator === '&&') return left ? resolveStaticPrimitiveValue(expression.right, scope, executionStart) : left;
    if (expression.operator === '||') return left ? left : resolveStaticPrimitiveValue(expression.right, scope, executionStart);
    if (expression.operator === '??') return left == null ? resolveStaticPrimitiveValue(expression.right, scope, executionStart) : left;
  }
  if (expression.type === 'ConditionalExpression') {
    const test = resolveStaticBooleanValue(expression.test, scope, executionStart);
    if (test == null) return STATIC_PRIMITIVE_UNKNOWN;
    return resolveStaticPrimitiveValue(test ? expression.consequent : expression.alternate, scope, executionStart);
  }
  return STATIC_PRIMITIVE_UNKNOWN;
}

function createStaticValueStateFromNode(node, scope = null, executionStart = null) {
  const primitive = resolveStaticPrimitiveValue(node, scope, executionStart);
  const primitiveState = createStaticValueStateFromPrimitive(primitive);
  if (primitiveState) return primitiveState;
  const literal = unwrapChainNode(resolveStaticLiteralExpressionValue(node));
  if (isFunctionNode(literal) || literal?.type === 'ObjectExpression' || literal?.type === 'ArrayExpression') {
    return { truthy: true, nonNullish: true };
  }
  return null;
}

function createStaticValueStateFromPrimitive(primitive) {
  if (primitive === STATIC_PRIMITIVE_UNKNOWN) return null;
  return {
    truthy: Boolean(primitive),
    nonNullish: primitive != null,
  };
}

function createStaticValueStateFromSourcePath(scope, sourcePath, referenceStart = null) {
  if (!Array.isArray(sourcePath) || sourcePath.length === 0) return null;
  return createStaticValueStateFromScopeName(scope, sourcePath.join('.'), referenceStart);
}

function createStaticValueStateFromScopeName(scope, name, referenceStart = null) {
  if (!scope || !name) return null;
  const primitive = resolveStaticPrimitiveFromScopeName(scope, name, referenceStart);
  const primitiveState = createStaticValueStateFromPrimitive(primitive);
  if (primitiveState) return primitiveState;
  const definitions = resolveFunctionDefinitionsFromScopeName(scope, name, referenceStart) || [];
  for (let index = definitions.length - 1; index >= 0; index -= 1) {
    const state = getFunctionDefinitionValueState(definitions[index]);
    if (state) return state;
  }
  if (scopeHasKnownContainerPath(scope, name)) return { truthy: true, nonNullish: true };
  return createStaticValueStateFromPrimitive(primitive);
}

function staticPrimitiveValuesEqual(left, right) {
  return Object.is(left, right) || left === right;
}

function isFunctionTerminatingResult(result) {
  return result?.termination === 'return' || result?.termination === 'throw';
}

function combineBranchTermination(left, right) {
  if (!left?.terminated || !right?.terminated) return null;
  if (left.termination === right.termination) return left.termination || null;
  if (isFunctionTerminatingResult(left) && isFunctionTerminatingResult(right)) {
    return left.throws && right.throws ? 'throw' : 'return';
  }
  return null;
}

function getThrowScopes(result) {
  return Array.isArray(result?.throwScopes) ? result.throwScopes : [];
}

function collectThrowScopes(...results) {
  return results.flatMap((result) => getThrowScopes(result));
}

function addThrowScopesToResult(result, throwScopes) {
  const scopes = Array.isArray(throwScopes) ? throwScopes.filter(Boolean) : [];
  if (scopes.length > 0) {
    result.throwScopes = [...getThrowScopes(result), ...scopes];
  }
  return result;
}

function addConditionalThrowScope(result, originalScope, clonedScope, { conditionKeys = [] } = {}) {
  if (!result?.hasRender && result?.termination === 'throw' && originalScope && clonedScope) {
    addThrowScopesToResult(result, [{ originalScope, clonedScope, conditionKeys }]);
  }
  return result;
}

function mergeThrowScopesIntoOriginal(throwScopes, { conditional = true } = {}) {
  for (const entry of Array.isArray(throwScopes) ? throwScopes : []) {
    if (!entry?.originalScope || !entry?.clonedScope) continue;
    mergeDefinitionsFromScopeClone(entry.originalScope, entry.clonedScope, {
      conditional,
      conditionKeys: entry.conditionKeys || [],
    });
  }
}

function getCommonThrowScopeConditionKeys(throwScopes) {
  const groups = (Array.isArray(throwScopes) ? throwScopes : [])
    .map((entry) => normalizeRenderExecutionConditionKeys(entry?.conditionKeys || []));
  if (groups.length === 0 || groups.some((group) => group.length === 0)) return [];
  let common = new Set(groups[0]);
  for (const group of groups.slice(1)) {
    const current = new Set(group);
    common = new Set([...common].filter((key) => current.has(key)));
  }
  return [...common].sort();
}

function createExecutionPathResult({
  hasRender = false,
  terminated = false,
  throws = false,
  mayThrow = false,
  termination = null,
  throwScopes = [],
} = {}) {
  const result = {
    hasRender,
    terminated,
    throws,
    mayThrow: Boolean(mayThrow || throws),
  };
  if (termination) result.termination = termination;
  addThrowScopesToResult(result, throwScopes);
  return result;
}

function expressionExecutionPathResultInClonedScope(node, scope, executionStart, seen) {
  return analyzeExpressionExecutionPath(
    node,
    cloneRenderExecutionScopeChain(scope),
    executionStart,
    new Set(seen),
  );
}

function expressionExecutionPathContainsCtxRenderInClonedScope(node, scope, executionStart, seen) {
  return expressionExecutionPathResultInClonedScope(node, scope, executionStart, seen).hasRender;
}

function analyzeStatementExecutionPathInClonedScope(statement, scope, executionStart, seen) {
  return analyzeStatementExecutionPath(
    statement,
    cloneRenderExecutionScopeChain(scope),
    executionStart,
    new Set(seen),
  );
}

function analyzeStatementExecutionPathInConditionalScope(
  statement,
  scope,
  executionStart,
  seen,
  { conditionKeys = [] } = {},
) {
  const cloned = cloneRenderExecutionScopeChainWithMap(scope);
  addActiveRenderExecutionConditionKeys(cloned.scope, conditionKeys);
  const result = analyzeStatementExecutionPath(
    statement,
    cloned.scope,
    executionStart,
    new Set(seen),
  );
  if (!result.hasRender && (!result.terminated || result.termination === 'break')) {
    mergeConditionalDefinitionsFromScopeClone(scope, cloned.scope, { conditionKeys });
  }
  return addConditionalThrowScope(result, scope, cloned.scope, { conditionKeys });
}

function analyzeExpressionExecutionPathInConditionalScope(
  node,
  scope,
  executionStart,
  seen,
  { conditionKeys = [] } = {},
) {
  const cloned = cloneRenderExecutionScopeChainWithMap(scope);
  addActiveRenderExecutionConditionKeys(cloned.scope, conditionKeys);
  const result = analyzeExpressionExecutionPath(
    node,
    cloned.scope,
    executionStart,
    new Set(seen),
  );
  if (!result.hasRender && !result.terminated) {
    mergeConditionalDefinitionsFromScopeClone(scope, cloned.scope, { conditionKeys });
  }
  return addConditionalThrowScope(result, scope, cloned.scope, { conditionKeys });
}

function expressionExecutionPathContainsCtxRender(node, scope, executionStart, seen) {
  return analyzeExpressionExecutionPath(node, scope, executionStart, seen).hasRender;
}

function analyzeExpressionExecutionPath(node, scope, executionStart, seen) {
  const expression = unwrapChainNode(node);
  if (!isAstNode(expression)) return createExecutionPathResult();
  if (isFunctionNode(expression) || expression.type === 'ClassExpression' || expression.type === 'ClassDeclaration') {
    return createExecutionPathResult();
  }
  if (isCtxRenderCallExpression(expression)) {
    return createExecutionPathResult({ hasRender: true });
  }
  if (expression.type === 'AssignmentExpression') {
    if (isLogicalAssignmentOperator(expression.operator)) {
      return analyzeLogicalAssignmentExecutionPath(expression, scope, executionStart, seen);
    }
    if (expression.operator !== '=') {
      return analyzeCompoundAssignmentExecutionPath(expression, scope, executionStart, seen);
    }
    registerFunctionAssignmentDefinition(scope, expression, expression);
    if (isFunctionNode(expression.right)) return createExecutionPathResult();
  }
  if (expression.type === 'UpdateExpression') {
    registerUpdateExpressionInvalidation(scope, expression);
    return createExecutionPathResult();
  }
  if (expression.type === 'UnaryExpression' && expression.operator === 'delete') {
    const argumentResult = analyzeExpressionExecutionPath(expression.argument, scope, executionStart, seen);
    if (argumentResult.hasRender || argumentResult.terminated) return argumentResult;
    registerDeleteExpressionInvalidation(scope, expression);
    return createExecutionPathResult({
      mayThrow: argumentResult.mayThrow,
      throwScopes: getThrowScopes(argumentResult),
    });
  }
  if (expression.type === 'LogicalExpression') {
    const leftResult = analyzeExpressionExecutionPath(expression.left, scope, executionStart, seen);
    if (leftResult.hasRender || leftResult.terminated) return leftResult;
    const leftValue = resolveStaticBooleanValue(expression.left, scope, executionStart);
    if (expression.operator === '&&') {
      if (leftValue === false) return createExecutionPathResult({ mayThrow: leftResult.mayThrow, throwScopes: getThrowScopes(leftResult) });
      if (leftValue === true) return analyzeExpressionExecutionPath(expression.right, scope, executionStart, seen);
      const rightResult = analyzeExpressionExecutionPathInConditionalScope(
        expression.right,
        scope,
        executionStart,
        seen,
        {
          conditionKeys: createRenderExecutionConditionKeys(
            expression.left,
            true,
            scope,
            Number.isInteger(expression.left?.start) ? expression.left.start : executionStart,
          ),
        },
      );
      return createExecutionPathResult({
        hasRender: rightResult.hasRender,
        mayThrow: leftResult.mayThrow || rightResult.mayThrow,
        throwScopes: collectThrowScopes(leftResult, rightResult),
      });
    }
    if (expression.operator === '||') {
      if (leftValue === true) return createExecutionPathResult({ mayThrow: leftResult.mayThrow, throwScopes: getThrowScopes(leftResult) });
      if (leftValue === false) return analyzeExpressionExecutionPath(expression.right, scope, executionStart, seen);
      const rightResult = analyzeExpressionExecutionPathInConditionalScope(
        expression.right,
        scope,
        executionStart,
        seen,
        {
          conditionKeys: createRenderExecutionConditionKeys(
            expression.left,
            false,
            scope,
            Number.isInteger(expression.left?.start) ? expression.left.start : executionStart,
          ),
        },
      );
      return createExecutionPathResult({
        hasRender: rightResult.hasRender,
        mayThrow: leftResult.mayThrow || rightResult.mayThrow,
        throwScopes: collectThrowScopes(leftResult, rightResult),
      });
    }
    if (expression.operator === '??') {
      const leftPrimitive = resolveStaticPrimitiveValue(expression.left, scope, executionStart);
      if (leftPrimitive !== STATIC_PRIMITIVE_UNKNOWN) {
        return leftPrimitive == null
          ? analyzeExpressionExecutionPath(expression.right, scope, executionStart, seen)
          : createExecutionPathResult({ mayThrow: leftResult.mayThrow, throwScopes: getThrowScopes(leftResult) });
      }
      const rightResult = analyzeExpressionExecutionPathInConditionalScope(expression.right, scope, executionStart, seen);
      return createExecutionPathResult({
        hasRender: rightResult.hasRender,
        mayThrow: leftResult.mayThrow || rightResult.mayThrow,
        throwScopes: collectThrowScopes(leftResult, rightResult),
      });
    }
    return expressionExecutionPathResultInClonedScope(expression.right, scope, executionStart, seen);
  }
  if (expression.type === 'ConditionalExpression') {
    const testResult = analyzeExpressionExecutionPath(expression.test, scope, executionStart, seen);
    if (testResult.hasRender || testResult.terminated) return testResult;
    const testValue = resolveStaticBooleanValue(expression.test, scope, executionStart);
    if (testValue === true) {
      const consequent = analyzeExpressionExecutionPath(expression.consequent, scope, executionStart, seen);
      consequent.mayThrow = Boolean(testResult.mayThrow || consequent.mayThrow);
      return consequent;
    }
    if (testValue === false) {
      const alternate = analyzeExpressionExecutionPath(expression.alternate, scope, executionStart, seen);
      alternate.mayThrow = Boolean(testResult.mayThrow || alternate.mayThrow);
      return alternate;
    }
    const consequent = analyzeExpressionExecutionPathInConditionalScope(
      expression.consequent,
      scope,
      executionStart,
      seen,
      {
        conditionKeys: createRenderExecutionConditionKeys(
          expression.test,
          true,
          scope,
          Number.isInteger(expression.test?.start) ? expression.test.start : executionStart,
        ),
      },
    );
    if (consequent.hasRender) return createExecutionPathResult({ hasRender: true });
    const alternate = analyzeExpressionExecutionPathInConditionalScope(
      expression.alternate,
      scope,
      executionStart,
      seen,
      {
        conditionKeys: createRenderExecutionConditionKeys(
          expression.test,
          false,
          scope,
          Number.isInteger(expression.test?.start) ? expression.test.start : executionStart,
        ),
      },
    );
    if (alternate.hasRender) return createExecutionPathResult({ hasRender: true });
    const termination = combineBranchTermination(consequent, alternate);
    return createExecutionPathResult({
      terminated: consequent.terminated && alternate.terminated,
      throws: consequent.throws && alternate.throws,
      mayThrow: testResult.mayThrow || consequent.mayThrow || alternate.mayThrow,
      termination,
      throwScopes: collectThrowScopes(testResult, consequent, alternate),
    });
  }
  if (expression.type === 'AwaitExpression') {
    const argumentResult = analyzeExpressionExecutionPath(expression.argument, scope, executionStart, seen);
    if (argumentResult.hasRender || argumentResult.terminated) return argumentResult;
    return createExecutionPathResult({ mayThrow: true, throwScopes: getThrowScopes(argumentResult) });
  }
  if (expression.type === 'CallExpression') {
    let mayThrow = false;
    let throwScopes = [];
    const callee = unwrapChainNode(expression.callee);
    if (callee?.type !== 'Identifier' && !isFunctionNode(callee)) {
      const calleeResult = analyzeExpressionExecutionPath(expression.callee, scope, executionStart, seen);
      if (calleeResult.hasRender || calleeResult.terminated) return calleeResult;
      mayThrow = mayThrow || calleeResult.mayThrow;
      throwScopes = [...throwScopes, ...getThrowScopes(calleeResult)];
    }
    for (const argument of expression.arguments || []) {
      const argumentResult = analyzeExpressionExecutionPath(argument, scope, executionStart, seen);
      if (argumentResult.hasRender || argumentResult.terminated) return argumentResult;
      mayThrow = mayThrow || argumentResult.mayThrow;
      throwScopes = [...throwScopes, ...getThrowScopes(argumentResult)];
    }
    const callStart = Number.isInteger(expression.start) ? expression.start : executionStart;
    registerStaticContainerMethodMutation(scope, expression, callStart);
    const calledFunctions = resolveCalledFunctionsFromScope(expression, scope, callStart);
    if (calledFunctions.length > 0) {
      let allTerminated = true;
      let throws = true;
      let termination = null;
      for (const calledFunction of calledFunctions) {
        const callResult = analyzeFunctionExecutionPath(calledFunction, scope, callStart, seen, expression);
        if (callResult.hasRender) return callResult;
        allTerminated = allTerminated && callResult.terminated;
        throws = throws && callResult.throws;
        mayThrow = mayThrow || callResult.mayThrow;
        throwScopes = [...throwScopes, ...getThrowScopes(callResult)];
        termination = termination || callResult.termination || null;
      }
      if (allTerminated) {
        return createExecutionPathResult({
          terminated: true,
          throws,
          mayThrow,
          termination: throws ? 'throw' : (termination || 'loop'),
          throwScopes,
        });
      }
      return createExecutionPathResult({ mayThrow, throwScopes });
    }
    return createExecutionPathResult({ mayThrow: true, throwScopes });
  }
  let mayThrow = false;
  let throwScopes = [];
  for (const value of Object.values(expression)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = analyzeExpressionExecutionPath(item, scope, executionStart, seen);
        if (result.hasRender || result.terminated) return result;
        mayThrow = mayThrow || result.mayThrow;
        throwScopes = [...throwScopes, ...getThrowScopes(result)];
      }
      continue;
    }
    const result = analyzeExpressionExecutionPath(value, scope, executionStart, seen);
    if (result.hasRender || result.terminated) return result;
    mayThrow = mayThrow || result.mayThrow;
    throwScopes = [...throwScopes, ...getThrowScopes(result)];
  }
  return createExecutionPathResult({ mayThrow, throwScopes });
}

function analyzeStatementExecutionPath(statement, scope, executionStart, seen) {
  if (!isAstNode(statement)) {
    return { hasRender: false, terminated: false };
  }

  switch (statement.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'EmptyStatement':
      return { hasRender: false, terminated: false, throws: false };
    case 'VariableDeclaration':
      let mayThrow = false;
      let throwScopes = [];
      for (const declarator of statement.declarations || []) {
        registerFunctionVariableDefinition(scope, declarator, statement);
        if (!isFunctionNode(declarator?.init)) {
          const initResult = analyzeExpressionExecutionPath(declarator?.init, scope, executionStart, seen);
          if (initResult.hasRender || initResult.terminated) return initResult;
          mayThrow = mayThrow || initResult.mayThrow;
          throwScopes = [...throwScopes, ...getThrowScopes(initResult)];
        }
      }
      return { hasRender: false, terminated: false, throws: false, mayThrow, throwScopes };
    case 'ExpressionStatement':
      registerFunctionAssignmentDefinition(scope, statement.expression, statement);
      return analyzeExpressionExecutionPath(statement.expression, scope, executionStart, seen);
    case 'ReturnStatement': {
      const argumentResult = analyzeExpressionExecutionPath(statement.argument, scope, executionStart, seen);
      return {
        hasRender: argumentResult.hasRender,
        terminated: true,
        throws: false,
        mayThrow: argumentResult.mayThrow,
        termination: 'return',
        throwScopes: getThrowScopes(argumentResult),
      };
    }
    case 'ThrowStatement': {
      const argumentResult = analyzeExpressionExecutionPath(statement.argument, scope, executionStart, seen);
      return {
        hasRender: argumentResult.hasRender,
        terminated: true,
        throws: true,
        mayThrow: true,
        termination: 'throw',
        throwScopes: getThrowScopes(argumentResult),
      };
    }
    case 'BreakStatement':
      return { hasRender: false, terminated: true, throws: false, termination: 'break' };
    case 'ContinueStatement':
      return { hasRender: false, terminated: true, throws: false, termination: 'continue' };
    case 'BlockStatement':
      return analyzeStatementListExecutionPath(statement.body || [], createInitializedExecutionScope(scope, statement.body || []), executionStart, seen);
    case 'IfStatement': {
      const testResult = analyzeExpressionExecutionPath(statement.test, scope, executionStart, seen);
      if (testResult.hasRender || testResult.terminated) return testResult;
      const testValue = resolveStaticBooleanValue(statement.test, scope, executionStart);
      if (testValue === true) {
        const consequent = analyzeStatementExecutionPath(statement.consequent, scope, executionStart, seen);
        consequent.mayThrow = Boolean(testResult.mayThrow || consequent.mayThrow);
        return consequent;
      }
      if (testValue === false) {
        const alternate = statement.alternate
          ? analyzeStatementExecutionPath(statement.alternate, scope, executionStart, seen)
          : { hasRender: false, terminated: false, throws: false };
        alternate.mayThrow = Boolean(testResult.mayThrow || alternate.mayThrow);
        return alternate;
      }
      const consequent = analyzeStatementExecutionPathInConditionalScope(
        statement.consequent,
        scope,
        executionStart,
        seen,
        {
          conditionKeys: createRenderExecutionConditionKeys(
            statement.test,
            true,
            scope,
            Number.isInteger(statement.test?.start) ? statement.test.start : executionStart,
          ),
        },
      );
      if (consequent.hasRender) return { hasRender: true, terminated: false };
      const alternate = statement.alternate
        ? analyzeStatementExecutionPathInConditionalScope(
          statement.alternate,
          scope,
          executionStart,
          seen,
          {
            conditionKeys: createRenderExecutionConditionKeys(
              statement.test,
              false,
              scope,
              Number.isInteger(statement.test?.start) ? statement.test.start : executionStart,
            ),
          },
        )
        : { hasRender: false, terminated: false, throws: false };
      if (alternate.hasRender) return { hasRender: true, terminated: false };
      const termination = combineBranchTermination(consequent, alternate);
      return {
        hasRender: false,
        terminated: consequent.terminated && alternate.terminated,
        throws: consequent.throws && alternate.throws,
        mayThrow: testResult.mayThrow || consequent.mayThrow || alternate.mayThrow,
        termination,
        throwScopes: collectThrowScopes(testResult, consequent, alternate),
      };
    }
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return analyzeLoopExecutionPath(statement, scope, executionStart, seen);
    case 'SwitchStatement':
      return analyzeSwitchExecutionPath(statement, scope, executionStart, seen);
    case 'TryStatement':
      return analyzeTryExecutionPath(statement, scope, executionStart, seen);
    default:
      return analyzeExpressionExecutionPath(statement, scope, executionStart, seen);
  }
}

function analyzeLoopExecutionPath(statement, scope, executionStart, seen) {
  const loopScope = createLoopExecutionScope(scope, statement);
  let mayThrow = false;
  let throwScopes = [];
  const initResult = analyzeLoopInitializationPath(statement, loopScope, executionStart, seen);
  if (initResult.hasRender || initResult.terminated) return initResult;
  mayThrow = mayThrow || initResult.mayThrow;
  throwScopes = [...throwScopes, ...getThrowScopes(initResult)];

  const definitelyInfinite = (statement.type === 'ForStatement' && !statement.test)
    || resolveStaticBooleanValue(statement.test, loopScope, executionStart) === true;
  const bodyDefinitelyExecutes = statement.type === 'DoWhileStatement' || definitelyInfinite;
  const initialKeys = statement.type === 'DoWhileStatement'
    ? []
    : (statement.type === 'ForStatement'
    ? ['test']
    : ['test', 'right']);

  for (const key of initialKeys) {
    const keyResult = analyzeExpressionExecutionPath(statement[key], loopScope, executionStart, seen);
    if (keyResult.hasRender || keyResult.terminated) return keyResult;
    mayThrow = mayThrow || keyResult.mayThrow;
    throwScopes = [...throwScopes, ...getThrowScopes(keyResult)];
  }
  const testValue = resolveStaticBooleanValue(statement.test, loopScope, executionStart);
  if (statement.type !== 'DoWhileStatement' && testValue === false) {
    return { hasRender: false, terminated: false, throws: false, throwScopes };
  }
  const staticIterationState = resolveStaticLoopIterationState(statement, loopScope);
  if (staticIterationState.known && staticIterationState.empty) {
    return { hasRender: false, terminated: false, throws: false, mayThrow, throwScopes };
  }
  if (
    statement.type === 'ForOfStatement'
    && staticIterationState.known
    && (staticIterationState.values || []).length > 0
  ) {
    return analyzeStaticForOfExecutionPath(statement, loopScope, executionStart, seen, staticIterationState, {
      mayThrow,
      throwScopes,
    });
  }
  const body = bodyDefinitelyExecutes
    ? analyzeStatementExecutionPath(statement.body, loopScope, executionStart, seen)
    : analyzeStatementExecutionPathInConditionalScope(statement.body, loopScope, executionStart, seen);
  if (body.hasRender) return { hasRender: true, terminated: false, throws: false };
  mayThrow = mayThrow || body.mayThrow;
  throwScopes = [...throwScopes, ...getThrowScopes(body)];
  if (
    statement.type === 'DoWhileStatement'
    && (!body.terminated || body.termination === 'continue')
  ) {
    const testResult = expressionExecutionPathResultInClonedScope(statement.test, loopScope, executionStart, seen);
    if (testResult.hasRender) return { hasRender: true, terminated: false, throws: false };
    if (testResult.terminated) return testResult;
    mayThrow = mayThrow || testResult.mayThrow;
    throwScopes = [...throwScopes, ...getThrowScopes(testResult)];
  }
  if (statement.type === 'ForStatement') {
    const updateResult = bodyDefinitelyExecutes && !body.terminated
      ? analyzeExpressionExecutionPath(statement.update, loopScope, executionStart, seen)
      : expressionExecutionPathResultInClonedScope(statement.update, loopScope, executionStart, seen);
    if (updateResult.hasRender || (bodyDefinitelyExecutes && !body.terminated && updateResult.terminated)) {
      return updateResult.hasRender
        ? { hasRender: true, terminated: false, throws: false }
        : updateResult;
    }
    mayThrow = mayThrow || updateResult.mayThrow;
    throwScopes = [...throwScopes, ...getThrowScopes(updateResult)];
  }
  if (bodyDefinitelyExecutes && isFunctionTerminatingResult(body)) {
    return { hasRender: false, terminated: true, throws: body.throws, mayThrow, termination: body.termination, throwScopes };
  }
  if (definitelyInfinite && body.termination === 'continue') {
    return { hasRender: false, terminated: true, throws: false, mayThrow, termination: 'loop', throwScopes };
  }
  return { hasRender: false, terminated: false, throws: false, mayThrow, throwScopes };
}

function createLoopExecutionScope(parentScope, statement) {
  const scopedStatements = [];
  if (statement.type === 'ForStatement' && statement.init?.type === 'VariableDeclaration') {
    scopedStatements.push(statement.init);
  }
  if (
    (statement.type === 'ForInStatement' || statement.type === 'ForOfStatement')
    && statement.left?.type === 'VariableDeclaration'
  ) {
    scopedStatements.push(statement.left);
  }
  return scopedStatements.length
    ? createInitializedExecutionScope(parentScope, scopedStatements)
    : parentScope;
}

function analyzeLoopInitializationPath(statement, loopScope, executionStart, seen) {
  if (statement.type === 'ForStatement' && statement.init) {
    if (statement.init.type === 'VariableDeclaration') {
      return analyzeStatementExecutionPath(statement.init, loopScope, executionStart, seen);
    }
    const initResult = analyzeExpressionExecutionPath(statement.init, loopScope, executionStart, seen);
    if (initResult.hasRender || initResult.terminated) return initResult;
    return { hasRender: false, terminated: false, throws: false, mayThrow: initResult.mayThrow, throwScopes: getThrowScopes(initResult) };
  }
  if (statement.type === 'ForInStatement' || statement.type === 'ForOfStatement') {
    const rightResult = analyzeExpressionExecutionPath(statement.right, loopScope, executionStart, seen);
    if (rightResult.hasRender || rightResult.terminated) return rightResult;
    const staticForOfState = statement.type === 'ForOfStatement'
      ? resolveStaticForOfIterationState(statement.right, loopScope, Number.isInteger(statement.start) ? statement.start : null)
      : { known: false };
    if (!staticForOfState.known) {
      registerForIterationBindings(statement, loopScope);
    }
    return { hasRender: false, terminated: false, throws: false, mayThrow: rightResult.mayThrow, throwScopes: getThrowScopes(rightResult) };
  }
  return { hasRender: false, terminated: false, throws: false };
}

function registerForIterationBindings(statement, loopScope) {
  const left = statement.left;
  const staticIterationState = statement.type === 'ForOfStatement'
    ? resolveStaticForOfIterationState(statement.right, loopScope, Number.isInteger(statement.start) ? statement.start : null)
    : { known: false, values: [] };
  const staticValues = staticIterationState.values || [];
  const registerPattern = (pattern, initializedAt) => {
    const names = collectAssignmentTargetIdentifiers(pattern);
    if (staticValues.length > 0) {
      const resetAt = Number.isInteger(initializedAt) ? initializedAt - 1 : initializedAt;
      for (const name of names) {
        addUnavailableFunctionDefinitionToScope(findAssignmentTargetScope(loopScope, name), name, resetAt);
      }
      for (const value of staticValues) {
        registerPatternFunctionDefinitions(loopScope, pattern, value, initializedAt, {
          resolveScope: loopScope,
          referenceStart: initializedAt,
          conditional: staticValues.length > 1,
        });
      }
      return;
    }
    for (const name of names) {
      addFunctionDefinition(loopScope.definitions, name, createUnavailableFunctionDefinition({
        initializedAt,
      }));
    }
  };

  if (left?.type === 'VariableDeclaration') {
    for (const declarator of left.declarations || []) {
      registerPattern(
        declarator?.id,
        Number.isInteger(declarator?.start) ? declarator.start : statement.start,
      );
    }
    return;
  }
  registerPattern(left, Number.isInteger(left?.start) ? left.start : statement.start);
}

function getForOfLeftPatterns(statement) {
  const left = statement?.left;
  if (left?.type === 'VariableDeclaration') {
    return (left.declarations || []).map((declarator) => declarator?.id).filter(Boolean);
  }
  return left ? [left] : [];
}

function clearPatternRuntimeBindings(scope, pattern) {
  for (const name of collectAssignmentTargetIdentifiers(pattern)) {
    const targetScope = findAssignmentTargetScope(scope, name);
    targetScope.definitions.delete(name);
    targetScope.staticPrimitives.delete(name);
    unmarkContainerPath(targetScope, name);
    removeContainerAliasesForPath(targetScope, name);
  }
}

function bindStaticForOfIterationValue(scope, statement, value) {
  const initializedAt = Number.isInteger(statement?.left?.start)
    ? statement.left.start
    : (Number.isInteger(statement?.start) ? statement.start : null);
  for (const pattern of getForOfLeftPatterns(statement)) {
    clearPatternRuntimeBindings(scope, pattern);
    registerPatternFunctionDefinitions(scope, pattern, value, initializedAt, {
      resolveScope: scope,
      referenceStart: initializedAt,
      conditional: false,
    });
  }
}

function analyzeStaticForOfExecutionPath(statement, loopScope, executionStart, seen, staticIterationState, base = {}) {
  let mayThrow = Boolean(base.mayThrow);
  let throwScopes = [...(base.throwScopes || [])];
  for (let index = 0; index < (staticIterationState.values || []).length; index += 1) {
    const cloned = cloneRenderExecutionScopeChainWithMap(loopScope);
    bindStaticForOfIterationValue(cloned.scope, statement, staticIterationState.values[index]);
    const body = analyzeStatementExecutionPath(statement.body, cloned.scope, executionStart, new Set(seen));
    if (body.hasRender) return { hasRender: true, terminated: false, throws: false };
    mayThrow = mayThrow || body.mayThrow;
    throwScopes = [...throwScopes, ...getThrowScopes(body)];
    if (body.termination === 'break') {
      mergeDefinitionsFromScopeClone(loopScope, cloned.scope);
      return { hasRender: false, terminated: false, throws: false, mayThrow, throwScopes };
    }
    if (isFunctionTerminatingResult(body)) {
      return {
        hasRender: false,
        terminated: true,
        throws: body.throws,
        mayThrow,
        termination: body.termination,
        throwScopes,
      };
    }
    mergeDefinitionsFromScopeClone(loopScope, cloned.scope);
  }
  return { hasRender: false, terminated: false, throws: false, mayThrow, throwScopes };
}

function collectStaticIterationValuesFromScope(scope, sourceName, referenceStart) {
  if (!scope || !sourceName) return [];
  const byIndex = new Map();
  const collect = (candidateName) => {
    const prefix = `${candidateName}.`;
    let current = scope;
    while (current) {
      for (const [key, definitions] of current.definitions.entries()) {
        if (!key.startsWith(prefix)) continue;
        const suffix = key.slice(prefix.length);
        if (!/^(0|[1-9]\d*)$/.test(suffix)) continue;
        const possibleDefinitions = selectPossibleFunctionDefinitions(definitions, referenceStart);
        if (!byIndex.has(Number(suffix))) byIndex.set(Number(suffix), []);
        const values = possibleDefinitions.length > 0
          ? possibleDefinitions.map((definition) => definition?.node || null)
          : [null];
        byIndex.get(Number(suffix)).push(...values);
      }
      if (scopeHasBinding(current, candidateName) || scopeHasPrefixBinding(current, candidateName)) break;
      current = current.parent;
    }
  };

  collect(sourceName);
  for (const entry of collectEquivalentContainerMemberEntries(scope, sourceName)) {
    collect(entry.name);
  }

  return [...byIndex.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, values]) => values);
}

function resolveStaticIterationValues(node, scope = null, referenceStart = null) {
  return resolveStaticForOfIterationState(node, scope, referenceStart).values;
}

function resolveStaticForOfIterationState(node, scope = null, referenceStart = null) {
  const expression = unwrapChainNode(node);
  if (expression?.type === 'ArrayExpression') {
    const info = getArrayExpressionStaticContainerInfo(expression);
    return info?.exact
      ? { known: true, empty: info.values.length === 0, values: [...info.values] }
      : { known: false, empty: false, values: [] };
  }
  const sourcePath = getStaticMemberPath(expression);
  const sourceName = sourcePath?.join('.') || null;
  if (sourceName) {
    const info = getStaticContainerInfoFromScope(scope, sourceName);
    if (info?.kind === 'array' && info.exact) {
      return { known: true, empty: info.values.length === 0, values: [...info.values] };
    }
    const values = collectStaticIterationValuesFromScope(scope, sourceName, referenceStart);
    if (values.length > 0) return { known: true, empty: false, values };
  }
  return { known: false, empty: false, values: [] };
}

function resolveStaticForInIterationState(node, scope = null) {
  const expression = unwrapChainNode(node);
  if (expression?.type === 'ArrayExpression') {
    const info = getArrayExpressionStaticContainerInfo(expression);
    return info?.exact
      ? { known: true, empty: info.keys.size === 0 }
      : { known: false, empty: false };
  }
  if (expression?.type === 'ObjectExpression') {
    const info = getObjectExpressionStaticContainerInfo(expression);
    return info?.exact
      ? { known: true, empty: info.keys.size === 0 }
      : { known: false, empty: false };
  }
  const sourcePath = getStaticMemberPath(expression);
  const sourceName = sourcePath?.join('.') || null;
  if (sourceName) {
    const info = getStaticContainerInfoFromScope(scope, sourceName);
    if (info?.exact) {
      return { known: true, empty: info.keys.size === 0 };
    }
  }
  return { known: false, empty: false };
}

function resolveStaticLoopIterationState(statement, loopScope) {
  if (statement?.type === 'ForOfStatement') {
    return resolveStaticForOfIterationState(
      statement.right,
      loopScope,
      Number.isInteger(statement.start) ? statement.start : null,
    );
  }
  if (statement?.type === 'ForInStatement') {
    return resolveStaticForInIterationState(statement.right, loopScope);
  }
  return { known: false, empty: false };
}

function analyzeSwitchExecutionPath(statement, scope, executionStart, seen) {
  const discriminantResult = analyzeExpressionExecutionPath(statement.discriminant, scope, executionStart, seen);
  if (discriminantResult.hasRender || discriminantResult.terminated) return discriminantResult;

  const switchScope = createInitializedExecutionScope(
    scope,
    (statement.cases || []).flatMap((switchCase) => switchCase.consequent || []),
  );
  const switchMayThrow = discriminantResult.mayThrow;
  const switchThrowScopes = getThrowScopes(discriminantResult);
  const discriminantValue = resolveStaticPrimitiveValue(statement.discriminant, scope, executionStart);
  const defaultIndex = (statement.cases || []).findIndex((switchCase) => !switchCase.test);
  let selectedIndex = -1;

  if (discriminantValue !== STATIC_PRIMITIVE_UNKNOWN) {
    let mayThrow = switchMayThrow;
    let throwScopes = [...switchThrowScopes];
    for (let caseIndex = 0; caseIndex < (statement.cases || []).length; caseIndex += 1) {
      const test = statement.cases[caseIndex].test;
      if (!test) continue;
      const testResult = analyzeExpressionExecutionPath(test, switchScope, executionStart, seen);
      if (testResult.hasRender || testResult.terminated) return testResult;
      mayThrow = mayThrow || testResult.mayThrow;
      throwScopes = [...throwScopes, ...getThrowScopes(testResult)];
      const caseValue = resolveStaticPrimitiveValue(test, switchScope, executionStart);
      if (
        caseValue !== STATIC_PRIMITIVE_UNKNOWN
        && staticPrimitiveValuesEqual(caseValue, discriminantValue)
      ) {
        selectedIndex = caseIndex;
        break;
      }
    }
    if (selectedIndex < 0) selectedIndex = defaultIndex;
    if (selectedIndex < 0) return { hasRender: false, terminated: false, throws: false, mayThrow, throwScopes };

    const selectedStatements = (statement.cases || [])
      .slice(selectedIndex)
      .flatMap((switchCase) => switchCase.consequent || []);
    const result = analyzeStatementListExecutionPath(selectedStatements, switchScope, executionStart, seen);
    if (result.hasRender) return { hasRender: true, terminated: false, throws: false };
    if (isFunctionTerminatingResult(result)) {
      return {
        hasRender: false,
        terminated: true,
        throws: result.throws,
        mayThrow: mayThrow || result.mayThrow,
        termination: result.termination,
        throwScopes: [...throwScopes, ...getThrowScopes(result)],
      };
    }
    return { hasRender: false, terminated: false, throws: false, mayThrow: mayThrow || result.mayThrow, throwScopes: [...throwScopes, ...getThrowScopes(result)] };
  }

  let mayThrow = switchMayThrow;
  let throwScopes = [...switchThrowScopes];
  const switchCases = statement.cases || [];
  const canSelectEveryRuntimePath = defaultIndex >= 0 && switchCases.length > 0;
  let analyzedSelectedPathCount = 0;
  let allSelectedPathsTerminate = canSelectEveryRuntimePath;
  let allSelectedPathsThrow = canSelectEveryRuntimePath;
  let selectedPathTermination = null;
  for (let startIndex = 0; startIndex < switchCases.length; startIndex += 1) {
    const cloned = cloneRenderExecutionScopeChainWithMap(switchScope);
    const conditionKeys = createRenderExecutionSwitchCaseConditionKeys(
      statement.discriminant,
      switchCases[startIndex],
      switchCases,
      switchScope,
      Number.isInteger(switchCases[startIndex].test?.start) ? switchCases[startIndex].test.start : executionStart,
    );
    addActiveRenderExecutionConditionKeys(cloned.scope, conditionKeys);
    const testEndIndex = switchCases[startIndex].test ? startIndex : switchCases.length - 1;
    let testPathBlocked = false;
    for (let testIndex = 0; testIndex <= testEndIndex; testIndex += 1) {
      const test = switchCases[testIndex].test;
      if (!test) continue;
      const testResult = analyzeExpressionExecutionPath(test, cloned.scope, executionStart, new Set(seen));
      if (testResult.hasRender) return { hasRender: true, terminated: false, throws: false };
      mayThrow = mayThrow || testResult.mayThrow;
      throwScopes = [...throwScopes, ...getThrowScopes(testResult)];
      if (testResult.terminated) {
        testPathBlocked = true;
        allSelectedPathsTerminate = false;
        allSelectedPathsThrow = false;
        if (testResult.termination === 'throw') {
          addConditionalThrowScope(testResult, switchScope, cloned.scope);
          throwScopes = [...throwScopes, ...getThrowScopes(testResult)];
        }
        break;
      }
    }
    if (testPathBlocked) break;
    const fallthroughStatements = (statement.cases || [])
      .slice(startIndex)
      .flatMap((switchCase) => switchCase.consequent || []);
    const result = analyzeStatementListExecutionPath(fallthroughStatements, cloned.scope, executionStart, new Set(seen));
    if (result.hasRender) return { hasRender: true, terminated: false, throws: false };
    mayThrow = mayThrow || result.mayThrow;
    throwScopes = [...throwScopes, ...getThrowScopes(result)];
    analyzedSelectedPathCount += 1;
    if (!result.terminated || result.termination === 'break') {
      allSelectedPathsTerminate = false;
      allSelectedPathsThrow = false;
    } else {
      allSelectedPathsThrow = allSelectedPathsThrow && result.termination === 'throw';
      selectedPathTermination = selectedPathTermination
        ? combineBranchTermination(
          {
            terminated: true,
            throws: selectedPathTermination === 'throw',
            termination: selectedPathTermination,
          },
          result,
        )
        : result.termination;
    }
    if (!result.terminated || result.termination === 'break') {
      mergeConditionalDefinitionsFromScopeClone(switchScope, cloned.scope, { conditionKeys });
    } else if (result.termination === 'throw') {
      addConditionalThrowScope(result, switchScope, cloned.scope, { conditionKeys });
      throwScopes = [...throwScopes, ...getThrowScopes(result)];
    }
  }
  if (allSelectedPathsTerminate && analyzedSelectedPathCount === switchCases.length) {
    return {
      hasRender: false,
      terminated: true,
      throws: allSelectedPathsThrow,
      mayThrow,
      termination: allSelectedPathsThrow ? 'throw' : (selectedPathTermination || 'loop'),
      throwScopes,
    };
  }
  return { hasRender: false, terminated: false, throws: false, mayThrow, throwScopes };
}

function analyzeTryExecutionPath(statement, scope, executionStart, seen) {
  const tryResult = statement.block
    ? analyzeStatementExecutionPath(statement.block, scope, executionStart, seen)
    : { hasRender: false, terminated: false, throws: false };
  if (tryResult.hasRender) return { hasRender: true, terminated: false, throws: false };
  const tryThrowScopes = getThrowScopes(tryResult);
  let mergedTryThrowScopes = false;
  const mergeTryThrowScopes = () => {
    if (mergedTryThrowScopes) return;
    mergeThrowScopesIntoOriginal(tryThrowScopes, { conditional: true });
    mergedTryThrowScopes = true;
  };
  let completion = tryResult;
  if ((tryResult.throws || tryResult.mayThrow) && statement.handler?.body) {
    const catchStatements = statement.handler.body.body || [];
    const cloned = cloneRenderExecutionScopeChainWithThrowScopes(scope, tryThrowScopes);
    setActiveRenderExecutionThrowScopes(cloned.scope, tryThrowScopes, { exhaustive: tryResult.throws });
    addActiveRenderExecutionConditionKeys(cloned.scope, getCommonThrowScopeConditionKeys(tryThrowScopes));
    const catchScope = createInitializedExecutionScope(cloned.scope, catchStatements, {
      params: statement.handler.param ? [statement.handler.param] : [],
    });
    const catchResult = analyzeStatementListExecutionPath(catchStatements, catchScope, executionStart, new Set(seen));
    if (catchResult.hasRender) return { hasRender: true, terminated: false, throws: false };
    if (!catchResult.terminated || catchResult.termination === 'break') {
      mergeDefinitionsFromScopeClone(scope, cloned.scope, { conditional: !tryResult.throws });
    } else if (catchResult.termination === 'throw') {
      addConditionalThrowScope(catchResult, scope, cloned.scope);
    }
    completion = tryResult.throws ? catchResult : {
      hasRender: false,
      terminated: false,
      throws: false,
      mayThrow: catchResult.mayThrow,
      throwScopes: collectThrowScopes(tryResult, catchResult),
    };
  }
  if (statement.finalizer) {
    if (!statement.handler?.body) {
      mergeTryThrowScopes();
    }
    mergeThrowScopesIntoOriginal(getThrowScopes(completion), { conditional: true });
    const finalizerResult = analyzeStatementExecutionPath(statement.finalizer, scope, executionStart, seen);
    if (finalizerResult.hasRender) return { hasRender: true, terminated: false, throws: false };
    if (finalizerResult.terminated) {
      return {
        hasRender: false,
        terminated: true,
        throws: finalizerResult.throws,
        mayThrow: finalizerResult.mayThrow,
        termination: finalizerResult.termination,
        throwScopes: getThrowScopes(finalizerResult),
      };
    }
    completion.mayThrow = Boolean(completion.mayThrow || finalizerResult.mayThrow);
    addThrowScopesToResult(completion, getThrowScopes(finalizerResult));
  }
  return {
    hasRender: false,
    terminated: completion.terminated,
    throws: completion.throws,
    mayThrow: completion.mayThrow,
    termination: completion.termination,
    throwScopes: getThrowScopes(completion),
  };
}

function analyzeStatementListExecutionPath(statements, scope, executionStart, seen) {
  let mayThrow = false;
  let throwScopes = [];
  for (const statement of statements || []) {
    exposeExecutedBlockFunctionDeclaration(scope, statement);
    const result = analyzeStatementExecutionPath(statement, scope, executionStart, seen);
    if (result.hasRender) return { hasRender: true, terminated: false, throws: false };
    mayThrow = mayThrow || result.mayThrow;
    throwScopes = [...throwScopes, ...getThrowScopes(result)];
    if (result.terminated) {
      return {
        hasRender: false,
        terminated: true,
        throws: result.throws,
        mayThrow,
        termination: result.termination,
        throwScopes,
      };
    }
  }
  return { hasRender: false, terminated: false, throws: false, mayThrow, throwScopes };
}

function analyzeFunctionExecutionPath(functionNode, parentScope, executionStart, seen = new Set(), callExpression = null) {
  if (!isFunctionNode(functionNode)) return createExecutionPathResult();
  if (seen.has(functionNode)) {
    return createExecutionPathResult({ terminated: true, termination: 'loop' });
  }
  seen.add(functionNode);
  try {
    const bodyStatements = Array.isArray(functionNode.body?.body) ? functionNode.body.body : [];
    const functionScope = createInitializedExecutionScope(parentScope, bodyStatements, {
      functionScope: true,
      params: functionNode.params || [],
    });
    const parameterInitializedAt = getFunctionParameterInitializedAt(functionNode, executionStart);
    const parameterResult = bindFunctionCallParameters(
      functionScope,
      functionNode.params || [],
      callExpression?.arguments || [],
      parameterInitializedAt,
      parentScope,
      executionStart,
      seen,
    );
    if (parameterResult.hasRender || parameterResult.terminated) return parameterResult;
    if (!bodyStatements.length && functionNode.body) {
      return analyzeExpressionExecutionPath(functionNode.body, functionScope, executionStart, seen);
    }
    return analyzeStatementListExecutionPath(bodyStatements, functionScope, executionStart, seen);
  } finally {
    seen.delete(functionNode);
  }
}

function functionExecutionPathContainsCtxRender(functionNode, parentScope, executionStart, seen = new Set()) {
  return analyzeFunctionExecutionPath(functionNode, parentScope, executionStart, seen).hasRender;
}

function hasTopLevelReachableCtxRenderCall(scan) {
  const topLevelScope = createInitializedExecutionScope(null, scan?.wrappedStatements || [], { functionScope: true });
  return analyzeStatementListExecutionPath(scan?.wrappedStatements || [], topLevelScope, null, new Set()).hasRender;
}

function inspectSurfaceStyle({ scan, surfaceStyle, path: findingPath = '$', modelUse }) {
  const renderCalls = (scan.semanticNodes?.topLevelCtxRenderCalls || []).map((entry) => entry.node);
  const topLevelReturns = scan.semanticNodes?.topLevelReturns || [];
  if (surfaceStyle === 'render') {
    const nestedRenderCall = findAnyCtxRenderCall(scan);
    if (hasTopLevelReachableCtxRenderCall(scan)) {
      return {
        blockers: [],
        warnings: [],
      };
    }
    if (hasOnlyTopLevelFunctionDefinitions(scan) && nestedRenderCall) {
      const firstStatement = (scan.wrappedStatements || []).find((statement) => statement?.type !== 'EmptyStatement');
      const loc = getScanNodeLocation(scan, firstStatement);
      return {
        blockers: [
          createFinding({
            code: 'RUNJS_RENDER_TOP_LEVEL_FUNCTION_WRAPPER_FORBIDDEN',
            message:
              'This RunJS render model needs a directly executed top-level script; defining a function wrapper does not render anything. Move the function body to the top level so ctx.render(...) runs immediately.',
            path: findingPath,
            modelUse,
            line: loc.line,
            column: loc.column,
          }),
        ],
        warnings: [],
      };
    }
    if (nestedRenderCall) {
      const loc = getLineColumnFromPos(scan.source || '', nestedRenderCall.calleeStart ?? nestedRenderCall.start ?? 0);
      return {
        blockers: [
          createFinding({
            code: 'RUNJS_RENDER_UNREACHABLE_RENDER_CALL',
            message:
              'This RunJS render model calls ctx.render(...), but not from the top-level execution path. Move ctx.render(...) to top-level code so the render runs immediately.',
            path: findingPath,
            modelUse,
            line: loc.line,
            column: loc.column,
          }),
        ],
        warnings: [],
      };
    }
    return {
      blockers: [
        createFinding({
          code: 'RUNJS_RENDER_SURFACE_RENDER_REQUIRED',
          message: 'This RunJS render surface must call ctx.render(...).',
          path: findingPath,
          modelUse,
        }),
      ],
      warnings: [],
    };
  }

  if (surfaceStyle !== 'value') {
    return {
      blockers: [],
      warnings: [],
    };
  }

  const blockers = [];
  if (topLevelReturns.length === 0) {
    blockers.push(
      createFinding({
        code: 'RUNJS_VALUE_SURFACE_RETURN_REQUIRED',
        message: 'This RunJS surface must return a value with a top-level return statement.',
        path: findingPath,
        modelUse,
      }),
    );
  }

  for (const callNode of renderCalls) {
    const line = callNode.callee?.property?.loc?.start?.line ?? callNode.loc?.start?.line ?? null;
    const column = callNode.callee?.property?.loc?.start?.column != null
      ? callNode.callee.property.loc.start.column + 1
      : (callNode.loc?.start?.column != null ? callNode.loc.start.column + 1 : null);
    blockers.push(
      createFinding({
        code: 'RUNJS_VALUE_SURFACE_CTX_RENDER_FORBIDDEN',
        message: 'This RunJS surface returns a value; do not call ctx.render(...).',
        path: findingPath,
        modelUse,
        line,
        column,
      }),
    );
  }

  return {
    blockers,
    warnings: [],
  };
}

function resolveRunJSInspectionPolicy(contract, { modelUse, surface, path: findingPath = '$' } = {}) {
  const knownModelUse = resolveKnownModelUseForContract(contract, modelUse);
  const requestedModelUse = normalizeOptionalText(modelUse) || null;
  const explicitSurface = normalizeOptionalText(surface) || null;

  if (!explicitSurface && knownModelUse && isRenderModelUse(knownModelUse)) {
    return {
      ok: true,
      surface: 'js-model.render',
      surfaceStyle: 'render',
      modelUse: knownModelUse,
      findingModelUse: knownModelUse,
      allowedRoots: buildAllowedCtxRoots(contract, [knownModelUse]),
    };
  }

  if (!explicitSurface && knownModelUse && ACTION_MODEL_USES.has(knownModelUse)) {
    return {
      ok: true,
      surface: 'js-model.action',
      surfaceStyle: 'action',
      modelUse: knownModelUse,
      findingModelUse: knownModelUse,
      allowedRoots: buildAllowedCtxRoots(contract, [knownModelUse]),
    };
  }

  const resolvedSurfacePolicy = explicitSurface ? getRunJSSurfacePolicy(explicitSurface) : null;
  if (explicitSurface && resolvedSurfacePolicy) {
    const allowedModelUses = new Set(getRunJSSurfaceAllowedModelUses(explicitSurface));
    const validationModelUses = getRunJSSurfaceValidationModelUses(explicitSurface);
    const fallbackRuntimeModel = getRunJSFallbackRuntimeModel(explicitSurface);
    const surfaceStyle = getRunJSEffectStyle(explicitSurface);
    const extraAllowedRoots = getRunJSSurfaceExtraAllowedRoots(explicitSurface);
    const explicitModelLabel = normalizeOptionalText(resolvedSurfacePolicy.explicitModelLabel) || 'known JS model';
    const requiresExplicitModel = Boolean(resolvedSurfacePolicy.requiresExplicitModel);

    if (requestedModelUse && knownModelUse) {
      const supportsRequestedModelUse = allowedModelUses.size === 0 || allowedModelUses.has(knownModelUse);

      if (!supportsRequestedModelUse) {
        return {
          ok: false,
          blockers: [
            createFinding({
              code: 'RUNJS_UNKNOWN_MODEL_USE',
              message: `RunJS surface "${explicitSurface}" does not support modelUse "${requestedModelUse}".`,
              path: findingPath,
              modelUse: requestedModelUse,
            }),
          ],
        };
      }

      return {
        ok: true,
        surface: explicitSurface,
        surfaceStyle,
        modelUse: knownModelUse,
        findingModelUse: knownModelUse,
        allowedRoots: buildAllowedCtxRoots(contract, [knownModelUse], extraAllowedRoots),
      };
    }

    if (requiresExplicitModel) {
      return {
        ok: false,
        blockers: [
          createFinding({
            code: 'RUNJS_UNKNOWN_MODEL_USE',
            message: `RunJS surface "${explicitSurface}" validation requires a ${explicitModelLabel}, but received ${requestedModelUse ? `"${requestedModelUse}"` : 'no modelUse'}.`,
            path: findingPath,
            modelUse: requestedModelUse || explicitSurface,
          }),
        ],
      };
    }

    return {
      ok: true,
      surface: explicitSurface,
      surfaceStyle,
      modelUse: fallbackRuntimeModel,
      findingModelUse: explicitSurface,
      allowedRoots: buildAllowedCtxRoots(
        contract,
        validationModelUses.length > 0
          ? validationModelUses
          : (fallbackRuntimeModel ? [fallbackRuntimeModel] : []),
        extraAllowedRoots,
      ),
    };
  }

  if (!explicitSurface && knownModelUse) {
    return {
      ok: true,
      surface: isRenderModelUse(knownModelUse) ? 'js-model.render' : 'js-model.action',
      surfaceStyle: isRenderModelUse(knownModelUse) ? 'render' : 'action',
      modelUse: knownModelUse,
      findingModelUse: knownModelUse,
      allowedRoots: buildAllowedCtxRoots(contract, [knownModelUse]),
    };
  }

  if (explicitSurface) {
    return {
      ok: false,
      blockers: [
        createFinding({
          code: 'RUNJS_SURFACE_UNRESOLVED',
          message: `Could not resolve a supported RunJS validation surface for "${explicitSurface}".`,
          path: findingPath,
          modelUse: explicitSurface,
        }),
      ],
    };
  }

  if (!knownModelUse) {
    return {
      ok: false,
      blockers: [
        createFinding({
          code: 'RUNJS_UNKNOWN_MODEL_USE',
          message: `Unknown RunJS modelUse "${String(modelUse ?? '') || '(empty)'}". Do not silently fall back to JSBlockModel.`,
          path: findingPath,
          modelUse: normalizeOptionalText(modelUse) || 'unknown',
        }),
      ],
    };
  }

  return {
    ok: false,
    blockers: [
      createFinding({
        code: 'RUNJS_SURFACE_UNRESOLVED',
        message: `Could not resolve a supported RunJS validation surface for ${explicitSurface ? `"${explicitSurface}"` : 'the current payload path'}.`,
        path: findingPath,
        modelUse: explicitSurface || knownModelUse,
      }),
    ],
  };
}

function inspectStaticRunJSCodeWithContract({
  code,
  modelUse = null,
  surface = null,
  version = 'v1',
  contract,
  contractSource = 'snapshot',
  contractWarnings = [],
  path: findingPath = '$',
} = {}) {
  const policy = resolveRunJSInspectionPolicy(contract, {
    modelUse,
    surface,
    path: findingPath,
  });
  if (!policy.ok) {
    const blockers = sortFindings(policy.blockers || []);
    const warnings = sortFindings(contractWarnings);
    return {
      ok: false,
      blockers,
      warnings,
      inspectedNode: {
        modelUse: normalizeOptionalText(surface) || normalizeOptionalText(modelUse) || 'unknown',
        surface: normalizeOptionalText(surface) || null,
        version,
        path: findingPath,
        blockerCount: blockers.length,
        warningCount: warnings.length,
      },
      execution: {
        attempted: false,
        source: contractSource,
        semanticBlockerCount: 0,
        semanticWarningCount: 0,
        autoRewriteCount: 0,
      },
      contractSource,
      policy: null,
    };
  }
  const staticResult = inspectStaticCode({
    code,
    modelUse: policy.modelUse,
    findingModelUse: policy.findingModelUse,
    version,
    contract,
    path: findingPath,
    allowedCtxRoots: policy.allowedRoots,
    surfaceStyle: policy.surfaceStyle,
  });
  const semanticResult = staticResult.syntaxOk
    ? inspectRunJSSemantics({
      code,
      modelUse: policy.modelUse,
      findingModelUse: policy.findingModelUse,
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
      modelUse: policy.findingModelUse,
      surface: policy.surface,
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
    policy,
  };
}

export function inspectRunJSStaticCode({
  code,
  modelUse = null,
  surface = null,
  version = 'v1',
  snapshotPath,
  path: findingPath = '$',
} = {}) {
  const { contract, source, warnings: contractWarnings } = loadRunJSContract({ snapshotPath });
  return inspectStaticRunJSCodeWithContract({
    code,
    modelUse,
    surface,
    version,
    contract,
    contractSource: source,
    contractWarnings,
    path: findingPath,
  });
}

export async function inspectRunJSCode({
  code,
  modelUse = null,
  surface = null,
  version = 'v1',
  snapshotPath,
  path: findingPath = '$',
} = {}) {
  const { contract, source, warnings: contractWarnings } = loadRunJSContract({ snapshotPath });
  const staticOnly = inspectStaticRunJSCodeWithContract({
    code,
    modelUse,
    surface,
    version,
    contract,
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

  if (!staticOnly.policy || blockers.some((item) => item.code === 'RUNJS_PARSE_ERROR' || item.code === 'RUNJS_DEPRECATED_CTX_TEMPLATE_SYNTAX')) {
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
      modelUse: staticOnly.policy.modelUse,
      version,
      contract,
      allowedRoots: staticOnly.policy.allowedRoots,
      executionLabel: staticOnly.policy.findingModelUse,
    });
    execution = {
      ...execution,
      attempted: true,
      compiled: runtime.execution?.compiled || null,
      logs: runtime.logs || [],
    };
    if (!runtime.ok) {
      const classified = classifyRuntimeError(runtime.error, {
        path: findingPath,
        modelUse: staticOnly.policy.findingModelUse,
      });
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
        modelUse: staticOnly.policy.findingModelUse,
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

function isEventFlowStepPath(pathValue) {
  return typeof pathValue === 'string'
    && pathValue.includes('flowRegistry')
    && pathValue.includes('steps');
}

function walkPayload(value, visitor, currentPath = '$', context = { nearestUse: null, parentKey: null, parentNode: null }) {
  const nextNearestUse = isPlainObject(value) && typeof value.use === 'string' && !isEventFlowStepPath(currentPath)
    ? value.use
    : context.nearestUse;
  visitor(value, currentPath, { ...context, nearestUse: nextNearestUse });
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkPayload(item, visitor, `${currentPath}[${index}]`, {
      nearestUse: nextNearestUse,
      parentKey: String(index),
      parentNode: value,
    }));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const separator = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
    walkPayload(child, visitor, `${currentPath}${separator}`, {
      nearestUse: nextNearestUse,
      parentKey: key,
      parentNode: value,
    });
  }
}

function normalizeRunJSVersion(version) {
  return typeof version === 'string' && version.trim() ? version.trim() : 'v1';
}

function normalizeRunJSCodeForWrite(code) {
  const src = String(code ?? '');
  if (!src.includes('\\n') || src.includes('\n')) {
    return {
      code: src,
      changed: false,
      transforms: [],
      unresolved: [],
      semantic: {
        blockerCount: 0,
        warningCount: 0,
        autoRewriteCount: 0,
      },
    };
  }

  const masked = maskJavaScriptSource(src);
  let candidate = '';
  let changed = false;
  for (let index = 0; index < src.length; index += 1) {
    if (masked[index] === '\\' && src[index] === '\\' && src[index + 1] === 'n') {
      candidate += '\n';
      index += 1;
      changed = true;
      continue;
    }
    if (masked[index] === '\\' && src[index] === '\\' && src[index + 1] === 'r' && src[index + 2] === '\\' && src[index + 3] === 'n') {
      candidate += '\n';
      index += 3;
      changed = true;
      continue;
    }
    candidate += src[index];
  }
  if (!changed) {
    return {
      code: src,
      changed: false,
      transforms: [],
      unresolved: [],
      semantic: {
        blockerCount: 0,
        warningCount: 0,
        autoRewriteCount: 0,
      },
    };
  }
  try {
    parseRunJSSourceForSyntax(candidate);
  } catch {
    return {
      code: src,
      changed: false,
      transforms: [],
      unresolved: [],
      semantic: {
        blockerCount: 0,
        warningCount: 0,
        autoRewriteCount: 0,
      },
    };
  }

  return {
    code: candidate,
    changed: candidate !== src,
    transforms: [
      {
        code: 'RUNJS_NEWLINE_LITERAL_NORMALIZED',
        message: 'RunJS code literal \\n escape sequences were normalized to real line breaks before write.',
        path: '$',
      },
    ],
    unresolved: [],
    semantic: {
      blockerCount: 0,
      warningCount: 0,
      autoRewriteCount: 1,
    },
  };
}

function isRunJSValueObject(node) {
  if (!isPlainObject(node)) return false;
  const keys = Object.keys(node);
  if (!keys.includes('code')) return false;
  if (typeof node.code !== 'string') return false;
  if (Object.prototype.hasOwnProperty.call(node, 'source') && node.source !== 'runjs') return false;
  return keys.every((key) => ['code', 'version', 'source'].includes(key));
}

function inferExplicitModelSurface(modelUse) {
  if (isRenderModelUse(modelUse)) return 'js-model.render';
  if (ACTION_MODEL_USES.has(modelUse)) return 'js-model.action';
  return null;
}

function getEventFlowRunJSNode(node, pathValue) {
  if (!isPlainObject(node) || !isEventFlowStepPath(pathValue)) {
    return null;
  }
  if (node.use === 'runjs' && typeof node.defaultParams?.code === 'string') {
    return {
      path: `${pathValue}.defaultParams.code`,
      code: node.defaultParams.code,
      version: node.defaultParams.version,
      setCode(nextCode) {
        node.defaultParams.code = nextCode;
      },
    };
  }
  if (node.name === 'runjs' && typeof node.params?.code === 'string') {
    return {
      path: `${pathValue}.params.code`,
      code: node.params.code,
      version: node.params.version,
      setCode(nextCode) {
        node.params.code = nextCode;
      },
    };
  }
  return null;
}

function isEventFlowRunJSNode(node, pathValue) {
  return Boolean(getEventFlowRunJSNode(node, pathValue));
}

function isLinkageRunJSNode(node) {
  return isPlainObject(node)
    && node.name === 'linkageRunjs'
    && typeof node.params?.value?.script === 'string';
}

function inferGenericRunJSSurface(node, pathValue, context) {
  if (pathValue.includes('.variables[') && (pathValue.endsWith('.runjs') || context.parentKey === 'runjs')) {
    return 'custom-variable.runjs';
  }
  if (node.source === 'runjs' || context.parentNode?.source === 'runjs') {
    return 'reaction.value-runjs';
  }
  return inferExplicitModelSurface(context.nearestUse) || 'runjs.unknown';
}

function isKnownRunJSContainerValueObject(pathValue, context) {
  if (context.parentKey === 'params' && pathValue.endsWith('.params')) {
    return isEventFlowRunJSNode(context.parentNode, pathValue.replace(/\.params$/, ''));
  }
  if (context.parentKey === 'defaultParams' && pathValue.endsWith('.defaultParams')) {
    return isEventFlowRunJSNode(context.parentNode, pathValue.replace(/\.defaultParams$/, ''));
  }
  return false;
}

function visitRunJSNodes(payload, visitor) {
  const seenPaths = new Set();
  const pushNode = ({ path: pathValue, code, version, modelUse, surface, setCode }) => {
    if (!pathValue || seenPaths.has(pathValue)) return;
    seenPaths.add(pathValue);
    visitor({
      path: pathValue,
      code: typeof code === 'string' ? code : '',
      version: normalizeRunJSVersion(version),
      modelUse: normalizeOptionalText(modelUse) || null,
      surface: normalizeOptionalText(surface) || 'runjs.unknown',
      setCode,
    });
  };

  walkPayload(payload, (node, pathValue, context) => {
    if (!isPlainObject(node)) return;
    const modelUse = context.nearestUse;

    const eventFlowRunJSNode = getEventFlowRunJSNode(node, pathValue);
    if (eventFlowRunJSNode) {
      pushNode({
        path: eventFlowRunJSNode.path,
        code: eventFlowRunJSNode.code,
        version: eventFlowRunJSNode.version,
        modelUse,
        surface: 'event-flow.execute-javascript',
        setCode: eventFlowRunJSNode.setCode,
      });
    }

    if (isLinkageRunJSNode(node)) {
      pushNode({
        path: `${pathValue}.params.value.script`,
        code: node.params.value.script,
        version: node.params.value.version,
        modelUse,
        surface: 'linkage.execute-javascript',
        setCode(nextCode) {
          node.params.value.script = nextCode;
        },
      });
    }

    if (isPlainObject(node.stepParams?.jsSettings?.runJs)) {
      pushNode({
        path: `${pathValue}.stepParams.jsSettings.runJs`,
        code: node.stepParams.jsSettings.runJs.code,
        version: node.stepParams.jsSettings.runJs.version,
        modelUse,
        surface: inferExplicitModelSurface(modelUse) || 'runjs.unknown',
        setCode(nextCode) {
          node.stepParams.jsSettings.runJs.code = nextCode;
        },
      });
    }

    if (isPlainObject(node.clickSettings?.runJs)) {
      pushNode({
        path: `${pathValue}.clickSettings.runJs`,
        code: node.clickSettings.runJs.code,
        version: node.clickSettings.runJs.version,
        modelUse,
        surface: inferExplicitModelSurface(modelUse) || 'js-model.action',
        setCode(nextCode) {
          node.clickSettings.runJs.code = nextCode;
        },
      });
    }

    if (isRunJSValueObject(node)) {
      if (isKnownRunJSContainerValueObject(pathValue, context)) {
        return;
      }
      const genericSurface = inferGenericRunJSSurface(node, pathValue, context);
      pushNode({
        path: pathValue,
        code: node.code,
        version: node.version,
        modelUse,
        surface: genericSurface,
        setCode(nextCode) {
          node.code = nextCode;
        },
      });
    }
  });
}

export function collectRunJSNodes(payload) {
  const nodes = [];
  visitRunJSNodes(payload, (item) => {
    nodes.push({
      path: item.path,
      code: item.code,
      version: item.version,
      modelUse: item.modelUse,
      surface: item.surface,
    });
  });

  return nodes.sort((left, right) => left.path.localeCompare(right.path));
}

export function inspectRunJSPayloadStatic({ payload, mode = 'general', snapshotPath } = {}) {
  const { contract, source, warnings: contractWarnings } = loadRunJSContract({ snapshotPath });
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
      surface: node.surface,
      version: node.version,
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
      surface: result.inspectedNode.surface,
      blockerCount: result.blockers.length,
      warningCount: result.warnings.length,
    });
  }

  const sortedBlockers = sortFindings(blockers);
  const sortedWarnings = sortFindings(warnings);
  return {
    ok: blockers.length === 0,
    mode,
    blockers: sortedBlockers,
    warnings: sortedWarnings,
    inspectedNodes,
    contractSource: source,
    surfaceSummary: summarizeSurfaceStats(inspectedNodes),
    repairClassSummary: summarizeRepairClasses([...sortedBlockers, ...sortedWarnings]),
    execution: {
      inspectedNodeCount: inspectedNodes.length,
      runtimeAttempted: false,
      semanticBlockerCount,
      semanticWarningCount,
      autoRewriteCount,
      hasAutoRewrite: autoRewriteCount > 0,
    },
  };
}

export async function inspectRunJSPayload({ payload, mode = 'general', snapshotPath } = {}) {
  const { contract, source, warnings: contractWarnings } = loadRunJSContract({ snapshotPath });
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
      surfaceSummary: {},
      repairClassSummary: {},
      execution: {
        inspectedNodeCount: 0,
        semanticBlockerCount: 0,
        semanticWarningCount: 0,
        autoRewriteCount: 0,
        hasAutoRewrite: false,
      },
    };
  }

  for (const node of nodes) {
    const result = await inspectRunJSCode({
      code: node.code,
      modelUse: node.modelUse ?? null,
      surface: node.surface,
      version: node.version,
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
      modelUse: result.inspectedNode.modelUse,
      surface: result.inspectedNode.surface,
      blockerCount: result.blockers.length,
      warningCount: result.warnings.length,
    });
  }

  const sortedBlockers = sortFindings(blockers);
  const sortedWarnings = sortFindings(warnings);
  return {
    ok: blockers.length === 0,
    mode,
    blockers: sortedBlockers,
    warnings: sortedWarnings,
    inspectedNodes,
    contractSource: source,
    surfaceSummary: summarizeSurfaceStats(inspectedNodes),
    repairClassSummary: summarizeRepairClasses([...sortedBlockers, ...sortedWarnings]),
    execution: {
      inspectedNodeCount: inspectedNodes.length,
      semanticBlockerCount,
      semanticWarningCount,
      autoRewriteCount,
      hasAutoRewrite: autoRewriteCount > 0,
    },
  };
}

function handleInspectCode(flags) {
  const code = readCodeInput(flags);
  const surface = normalizeOptionalText(flags.surface) || null;
  return inspectRunJSCode({
    code,
    modelUse: surface ? normalizeOptionalText(flags['model-use']) || null : normalizeRequiredText(flags['model-use'], 'model-use'),
    surface,
    version: normalizeOptionalText(flags.version) || 'v1',
    snapshotPath: flags['snapshot-file'],
    path: normalizeOptionalText(flags.path) || '$',
  });
}

function handleInspectPayload(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  return inspectRunJSPayload({
    payload,
    mode: normalizeOptionalText(flags.mode) || 'general',
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
