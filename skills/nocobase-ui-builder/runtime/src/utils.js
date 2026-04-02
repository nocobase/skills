import { MAX_HTML_CHARS, MAX_ISSUE_MESSAGE_CHARS, MAX_TEXT_CHARS } from './constants.js';

const MAX_SERIALIZE_DEPTH = 6;
const MAX_SERIALIZE_KEYS = 50;
const MAX_SERIALIZE_ITEMS = 50;

export function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'undefined' || value === null) return [];
  return [value];
}

export function unique(values) {
  return [...new Set(values)];
}

export function toSerializable(value, options = {}) {
  const depth = options.depth ?? 0;
  const seen = options.seen ?? new WeakSet();

  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;

  if (depth >= MAX_SERIALIZE_DEPTH) {
    if (Array.isArray(value)) return `[Array(${value.length})]`;
    return `[${value?.constructor?.name || 'Object'}]`;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: safeErrorMessage(value),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_SERIALIZE_ITEMS).map((item) =>
      toSerializable(item, {
        depth: depth + 1,
        seen,
      }),
    );
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (isDomNodeLike(value)) {
      const summary = {
        nodeType: value.nodeType,
        nodeName: value.nodeName,
        textContent: trimToLength(value.textContent || '', 200),
      };
      seen.delete(value);
      return summary;
    }

    if (isReactElementLike(value)) {
      const summary = {
        $$typeof: 'react.element',
        type:
          typeof value.type === 'string'
            ? value.type
            : `[Function ${value.type?.displayName || value.type?.name || 'anonymous'}]`,
        props: toSerializable(value.props, {
          depth: depth + 1,
          seen,
        }),
      };
      seen.delete(value);
      return summary;
    }

    const output = {};
    for (const key of Object.keys(value).slice(0, MAX_SERIALIZE_KEYS)) {
      output[key] = toSerializable(value[key], {
        depth: depth + 1,
        seen,
      });
    }
    seen.delete(value);
    return output;
  }

  return String(value);
}

export function cloneSerializable(value) {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // fall through
    }
  }
  return toSerializable(value ?? null);
}

export function mergeDeep(base, override) {
  if (Array.isArray(base) && Array.isArray(override)) return override.map((item) => cloneSerializable(item));
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return typeof override === 'undefined' ? cloneSerializable(base) : cloneSerializable(override);
  }
  const result = { ...cloneSerializable(base) };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? mergeDeep(result[key], value) : cloneSerializable(value);
  }
  return result;
}

export function toPathSegments(path) {
  if (Array.isArray(path)) return path.map((item) => String(item));
  const source = String(path || '').trim();
  if (!source) return [];
  const normalized = source
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\["([^"]+)"\]/g, '.$1')
    .replace(/\['([^']+)'\]/g, '.$1')
    .replace(/^\./, '');
  return normalized.split('.').filter(Boolean);
}

export function getByPath(target, path) {
  const segments = toPathSegments(path);
  let current = target;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

export function setByPath(target, path, value) {
  const segments = toPathSegments(path);
  if (!segments.length) return target;
  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!isPlainObject(current[segment]) && !Array.isArray(current[segment])) {
      const next = segments[index + 1];
      current[segment] = /^\d+$/.test(next) ? [] : {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
  return target;
}

export function interpolate(template, variables = {}) {
  return String(template ?? '').replace(/\{\{\s*([.\w[\]'"-]+)\s*\}\}/g, (_match, path) => {
    const value = getByPath(variables, path);
    return value == null ? '' : String(value);
  });
}

export function trimToLength(text, maxChars) {
  const source = String(text ?? '');
  if (source.length <= maxChars) return source;
  return `${source.slice(0, Math.max(0, maxChars - 15))}\n...[truncated]`;
}

export function summarizeHtml(text) {
  return trimToLength(text, MAX_HTML_CHARS);
}

export function summarizeText(text) {
  return trimToLength(text, MAX_TEXT_CHARS);
}

export function normalizeMethod(method) {
  return String(method || 'GET').trim().toUpperCase() || 'GET';
}

export function safeErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return trimToLength(error, MAX_ISSUE_MESSAGE_CHARS);
  if (error instanceof Error) return trimToLength(error.message || error.name || 'Error', MAX_ISSUE_MESSAGE_CHARS);
  try {
    return trimToLength(JSON.stringify(error), MAX_ISSUE_MESSAGE_CHARS);
  } catch {
    return trimToLength(String(error), MAX_ISSUE_MESSAGE_CHARS);
  }
}

export function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: safeErrorMessage(error),
    stack: typeof error?.stack === 'string' ? trimToLength(error.stack, MAX_ISSUE_MESSAGE_CHARS * 2) : undefined,
  };
}

export function isPromiseLike(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
}

export function isReactElementLike(value) {
  return !!value && typeof value === 'object' && '$$typeof' in value && 'props' in value;
}

export function isDomNodeLike(value) {
  return !!value && typeof value === 'object' && value.__nbCompatDomNode === true;
}

export function withDefault(value, fallback) {
  return typeof value === 'undefined' ? fallback : value;
}

export function sortIssues(issues) {
  return [...issues].sort((left, right) => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    const leftRank = severityOrder[left.severity] ?? 9;
    const rightRank = severityOrder[right.severity] ?? 9;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftLine = left.location?.line ?? Number.MAX_SAFE_INTEGER;
    const rightLine = right.location?.line ?? Number.MAX_SAFE_INTEGER;
    if (leftLine !== rightLine) return leftLine - rightLine;
    const leftColumn = left.location?.column ?? Number.MAX_SAFE_INTEGER;
    const rightColumn = right.location?.column ?? Number.MAX_SAFE_INTEGER;
    return leftColumn - rightColumn;
  });
}
