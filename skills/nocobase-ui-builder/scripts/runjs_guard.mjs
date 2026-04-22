#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { buildWrappedRunJSCode, parseWrappedRunJS } from '../runtime/src/runjs-parser.js';
import {
  RUNJS_ACTION_MODEL_USES,
  RUNJS_RENDER_MODEL_USES,
  getRunJSEffectStyle,
  getRunJSFallbackRuntimeModel,
  getRunJSSurfaceAllowedModelUses,
  getRunJSSurfaceExtraAllowedRoots,
  getRunJSSurfacePolicy,
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
const RENDER_MODEL_USES = new Set(RUNJS_RENDER_MODEL_USES);
const ACTION_MODEL_USES = new Set(RUNJS_ACTION_MODEL_USES);
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
    properties: ['record', 'formValues', 'form', 'resource', 'collection'],
    methods: [],
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
  const output = [];
  const stateStack = [{ mode: 'code' }];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const state = stateStack[stateStack.length - 1];

    if (state.mode === 'line-comment') {
      output.push(char === '\n' ? '\n' : ' ');
      if (char === '\n') stateStack.pop();
      continue;
    }
    if (state.mode === 'block-comment') {
      output.push(char === '\n' ? '\n' : ' ');
      if (char === '*' && next === '/') {
        output.push(' ');
        index += 1;
        stateStack.pop();
      }
      continue;
    }
    if (state.mode === 'single-quote' || state.mode === 'double-quote') {
      output.push(char === '\n' ? '\n' : ' ');
      if (state.escape) {
        state.escape = false;
        continue;
      }
      if (char === '\\') {
        state.escape = true;
        continue;
      }
      if ((state.mode === 'single-quote' && char === "'") || (state.mode === 'double-quote' && char === '"')) {
        stateStack.pop();
      }
      continue;
    }
    if (state.mode === 'template') {
      if (state.escape) {
        output.push(char === '\n' ? '\n' : ' ');
        state.escape = false;
        continue;
      }
      if (char === '\\') {
        output.push(' ');
        state.escape = true;
        continue;
      }
      if (char === '`') {
        output.push(' ');
        stateStack.pop();
        continue;
      }
      if (char === '$' && next === '{') {
        output.push('$');
        output.push('{');
        index += 1;
        stateStack.push({ mode: 'template-expression', braceDepth: 1 });
        continue;
      }
      output.push(char === '\n' ? '\n' : ' ');
      continue;
    }

    if (char === '/' && next === '/') {
      output.push(' ');
      output.push(' ');
      index += 1;
      stateStack.push({ mode: 'line-comment' });
      continue;
    }
    if (char === '/' && next === '*') {
      output.push(' ');
      output.push(' ');
      index += 1;
      stateStack.push({ mode: 'block-comment' });
      continue;
    }
    if (char === "'") {
      output.push(' ');
      stateStack.push({ mode: 'single-quote', escape: false });
      continue;
    }
    if (char === '"') {
      output.push(' ');
      stateStack.push({ mode: 'double-quote', escape: false });
      continue;
    }
    if (char === '`') {
      output.push(' ');
      stateStack.push({ mode: 'template', escape: false });
      continue;
    }
    if (state.mode === 'template-expression') {
      if (char === '{') {
        state.braceDepth += 1;
        output.push('{');
        continue;
      }
      if (char === '}') {
        state.braceDepth -= 1;
        output.push('}');
        if (state.braceDepth === 0) stateStack.pop();
        continue;
      }
    }
    output.push(char);
  }
  return output.join('');
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
  const parsed = parseWrappedRunJS(code);
  new vm.Script(parsed.wrappedCode, {
    filename: 'runjs.syntax-check.js',
  });
  return {
    ...createRunJSScan(parsed.code),
    wrappedAst: parsed.ast,
    wrappedBody: parsed.wrappedBody,
    wrappedStatements: parsed.wrappedStatements,
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

function collectCtxRenderCallsFromScan(scan, staticStrings = new Map()) {
  const calls = [];
  forEachMemberChain(scan, staticStrings, (chain) => {
    if (chain.segments[0] !== 'ctx' || chain.segments[1] !== 'render') return;
    if (!isCallAfter(scan.masked, chain.end)) return;
    calls.push({
      start: chain.start,
      propertyStart: chain.segmentStarts[1] ?? chain.start,
    });
  });
  return calls;
}

function isStandaloneWordAt(source, index, word) {
  if (source.slice(index, index + word.length) !== word) return false;
  const previousChar = source[index - 1] || '';
  const nextChar = source[index + word.length] || '';
  return !isIdentifierPartChar(previousChar) && !isIdentifierPartChar(nextChar);
}

function isTopLevelSemanticBoundary(node) {
  return isFunctionNode(node) || node?.type === 'ClassDeclaration' || node?.type === 'ClassExpression';
}

function unwrapChainExpression(node) {
  return node?.type === 'ChainExpression' ? node.expression : node;
}

function isCtxRenderCallExpression(node) {
  const expression = unwrapChainExpression(node);
  const callee = unwrapChainExpression(expression?.callee);
  return expression?.type === 'CallExpression' && isCtxMemberExpression(callee, 'render');
}

function traverseSurfaceTopLevel(scan, visitor) {
  const visit = (node, ancestors = []) => {
    if (!isAstNode(node)) return;
    visitor(node, ancestors);
    if (isTopLevelSemanticBoundary(node)) return;
    const nextAncestors = [...ancestors, node];
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) visit(item, nextAncestors);
        }
        continue;
      }
      if (isAstNode(value)) visit(value, nextAncestors);
    }
  };

  for (const statement of scan.wrappedStatements || []) {
    visit(statement);
  }
}

function hasTopLevelReturnInScan(scan) {
  let found = false;
  traverseSurfaceTopLevel(scan, (node) => {
    if (!found && node?.type === 'ReturnStatement') {
      found = true;
    }
  });
  return found;
}

function collectTopLevelCtxRenderCalls(scan) {
  const calls = [];
  traverseSurfaceTopLevel(scan, (node) => {
    if (isCtxRenderCallExpression(node)) {
      calls.push(unwrapChainExpression(node));
    }
  });
  return calls;
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

function isCtxMemberExpression(node, name) {
  return node?.type === 'MemberExpression'
    && node.object?.type === 'Identifier'
    && node.object.name === 'ctx'
    && resolveRootMemberName(node) === name;
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

function analyzeCtxRequestCall({ callNode, code, env, modelUse, findingModelUse = modelUse, path: findingPath }) {
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
          modelUse: findingModelUse,
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
          modelUse: findingModelUse,
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
            modelUse: findingModelUse,
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
          modelUse: findingModelUse,
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
      modelUse: findingModelUse,
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

function analyzeCtxRequestCallFromSource({ chain, scan, initializers, modelUse, findingModelUse = modelUse, path: findingPath }) {
  const { source, masked } = scan;
  const openParenIndex = skipWhitespaceIn(masked, chain.end);
  if (masked[openParenIndex] !== '(') return null;
  const closeParenIndex = findMatchingToken(masked, openParenIndex, '(', ')');
  if (closeParenIndex < 0) return null;
  const configStart = skipWhitespaceIn(source, openParenIndex + 1);
  if (masked[configStart] !== '{') return null;
  const configEnd = findMatchingToken(masked, configStart, '{', '}');
  if (configEnd < 0 || configEnd > closeParenIndex) return null;

  const configInfo = inspectObjectSource(source.slice(configStart, configEnd + 1), initializers);
  if (!configInfo.ok) return null;

  const urlValue = propertyStaticString(configInfo.properties.get('url'), initializers);
  if (!urlValue) return null;

  const target = parseRequestTarget(urlValue);
  if (!target) return null;

  const methodValue = propertyStaticString(configInfo.properties.get('method'), initializers);
  if (methodValue && methodValue.toLowerCase() !== 'get') return null;

  const loc = getLineColumnFromPos(source, chain.start);

  if (target.kind === 'auth-check') {
    return {
      findings: [
        createFinding({
          severity: 'warning',
          code: 'RUNJS_AUTH_CHECK_REDUNDANT',
          message: '读取当前登录用户时不应再请求 auth:check；优先使用 ctx.user 或 ctx.auth?.user。',
          path: findingPath,
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
          details: {
            url: target.normalized,
          },
        }),
      ],
      rewrite: {
        start: chain.start,
        end: closeParenIndex + 1,
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
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
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
    paramsInfo = inspectObjectSource(paramsProperty.valueSource, initializers);
    if (!paramsInfo.ok) {
      const filterUnsupported = looksLikeFilterGroupSource(paramsProperty.valueSource, initializers);
      return {
        findings: [
          createFinding({
            code: filterUnsupported ? 'RUNJS_REQUEST_FILTER_GROUP_UNSUPPORTED' : 'RUNJS_RESOURCE_REQUEST_REWRITE_REQUIRED',
            message: filterUnsupported
              ? `ctx.request 命中了资源读取接口 "${target.normalized}"，且 filter 使用了 builder 风格结构，但 params 不是可安全改写的静态对象。请改用 resource API 或服务端 query filter。`
              : `ctx.request 命中了资源读取接口 "${target.normalized}"，但 params 当前不是可安全改写的静态对象。请改用 resource API。`,
            path: findingPath,
            modelUse: findingModelUse,
            line: loc.line,
            column: loc.column,
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
          modelUse: findingModelUse,
          line: loc.line,
          column: loc.column,
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
      modelUse: findingModelUse,
      line: loc.line,
      column: loc.column,
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
  if (filterProperty && looksLikeFilterGroupSource(filterProperty.valueSource, initializers)) {
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
      start: chain.start,
      end: closeParenIndex + 1,
      replacement: createResourceRequestIIFEFromProperties({
        target,
        configInfo,
        paramsInfo,
        actionName: target.action,
      }),
      transforms,
    },
  };
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

function inspectRunJSSemantics({ code, modelUse = 'JSBlockModel', findingModelUse = modelUse, path: findingPath = '$' }) {
  const findings = [];
  const rewrites = [];
  const scan = createRunJSScan(code);
  const { initializers, staticStrings } = collectSimpleInitializers(scan.source, scan.masked);

  forEachMemberChain(scan, staticStrings, (chain) => {
    if (chain.segments[0] !== 'ctx' || chain.segments[1] !== 'request') return;
    if (!isCallAfter(scan.masked, chain.end)) return;
    const result = analyzeCtxRequestCallFromSource({
      chain,
      scan,
      initializers,
      modelUse,
      findingModelUse,
      path: findingPath,
    });
    if (!result) return;
    findings.push(...(result.findings || []));
    if (result.rewrite) {
      rewrites.push(result.rewrite);
    }
  });

  const innerHTMLResult = analyzeInnerHTMLAssignmentsFromSource({
    scan,
    initializers,
    modelUse,
    findingModelUse,
    path: findingPath,
  });
  findings.push(...innerHTMLResult.findings);
  rewrites.push(...innerHTMLResult.rewrites);

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

    const result = canonicalizeRunJSCode({
      code: item.code,
      modelUse: policy.modelUse,
      findingModelUse: policy.findingModelUse,
      version: item.version,
      path: item.path,
    });
    if (result.changed) {
      item.setCode?.(result.code);
    }
    autoRewriteCount += result.semantic?.autoRewriteCount || 0;
    semanticBlockerCount += result.semantic?.blockerCount || 0;
    semanticWarningCount += result.semantic?.warningCount || 0;
    addSurfaceStats(policy.surface, {
      blockerCount: result.semantic?.blockerCount || 0,
      warningCount: result.semantic?.warningCount || 0,
    });
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

  forEachMemberChain(scan, staticStrings, (chain) => {
    const rootName = chain.segments[0];
    const memberName = chain.segments[1] || null;
    const memberStart = chain.segmentStarts[1] ?? chain.dynamicComputedStart ?? chain.start;
    const loc = getLineColumnFromPos(scan.source, memberStart);

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

function hasTopLevelReturn(ast) {
  let found = false;
  traverseAst(ast, (node, ancestors) => {
    if (found || node?.type !== 'ReturnStatement') return;
    const insideFunction = ancestors.some((ancestor) => isFunctionNode(ancestor));
    if (!insideFunction) {
      found = true;
    }
  });
  return found;
}

function collectCtxRenderCalls(ast) {
  const calls = [];
  traverseAst(ast, (node) => {
    if (node?.type === 'CallExpression' && isCtxMemberExpression(node.callee, 'render')) {
      calls.push(node);
    }
  });
  return calls;
}

function inspectSurfaceStyle({ scan, surfaceStyle, path: findingPath = '$', modelUse }) {
  const { staticStrings } = collectSimpleInitializers(scan.source, scan.masked);
  const renderCalls = collectCtxRenderCallsFromScan(scan, staticStrings);
  const topLevelRenderCalls = collectTopLevelCtxRenderCalls(scan);
  if (surfaceStyle === 'render') {
    if (topLevelRenderCalls.length > 0) {
      return {
        blockers: [],
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
  if (!hasTopLevelReturnInScan(scan)) {
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
    const loc = getLineColumnFromPos(scan.source, callNode.propertyStart);
    blockers.push(
      createFinding({
        code: 'RUNJS_VALUE_SURFACE_CTX_RENDER_FORBIDDEN',
        message: 'This RunJS surface returns a value; do not call ctx.render(...).',
        path: findingPath,
        modelUse,
        line: loc.line,
        column: loc.column,
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
    const fallbackRuntimeModel = getRunJSFallbackRuntimeModel(explicitSurface);
    const surfaceStyle = getRunJSEffectStyle(explicitSurface);
    const extraAllowedRoots = getRunJSSurfaceExtraAllowedRoots(explicitSurface);
    const explicitModelLabel = normalizeOptionalText(resolvedSurfacePolicy.explicitModelLabel) || 'known JS model';
    const requiresExplicitModel = Boolean(resolvedSurfacePolicy.requiresExplicitModel);

    if (requestedModelUse && knownModelUse) {
      const supportsRequestedModelUse = allowedModelUses.size === 0
        || allowedModelUses.has(knownModelUse)
        || knownModelUse === fallbackRuntimeModel;

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
      allowedRoots: buildAllowedCtxRoots(contract, getRunJSSurfaceAllowedModelUses(explicitSurface), extraAllowedRoots),
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

function walkPayload(value, visitor, currentPath = '$', context = { nearestUse: null, parentKey: null, parentNode: null }) {
  const nextNearestUse = isPlainObject(value) && typeof value.use === 'string' ? value.use : context.nearestUse;
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

function isEventFlowRunJSNode(node, pathValue) {
  return isPlainObject(node)
    && node.name === 'runjs'
    && typeof node.params?.code === 'string'
    && pathValue.includes('flowRegistry')
    && pathValue.includes('steps');
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
  return context.parentKey === 'params'
    && pathValue.endsWith('.params')
    && isEventFlowRunJSNode(context.parentNode, pathValue.replace(/\.params$/, ''));
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

    if (isEventFlowRunJSNode(node, pathValue)) {
      pushNode({
        path: `${pathValue}.params.code`,
        code: node.params.code,
        version: node.params.version,
        modelUse,
        surface: 'event-flow.execute-javascript',
        setCode(nextCode) {
          node.params.code = nextCode;
        },
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
        surface: 'js-model.action',
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
