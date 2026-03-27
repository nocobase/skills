import fs from 'node:fs';
import path from 'node:path';

export function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeOptionalText(value) {
  return normalizeText(value) || '';
}

export function normalizeRequiredText(value, label) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJson(filePath, value) {
  const resolvedPath = path.resolve(filePath);
  ensureDir(path.dirname(resolvedPath));
  fs.writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function parseJson(rawValue, label) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function readJsonInput(jsonValue, fileValue, label, { required = true } = {}) {
  const hasJson = typeof jsonValue === 'string' && jsonValue.trim();
  const hasFile = typeof fileValue === 'string' && fileValue.trim();
  if (hasJson && hasFile) {
    throw new Error(`${label} accepts either inline json or file, not both`);
  }
  if (hasJson) {
    return parseJson(jsonValue, label);
  }
  if (hasFile) {
    return parseJson(fs.readFileSync(path.resolve(fileValue), 'utf8'), `${label} file`);
  }
  if (required) {
    throw new Error(`${label} is required`);
  }
  return null;
}

export function unwrapResponseEnvelope(value) {
  let current = value;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (!trimmed) {
        return current;
      }
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return current;
      }
    }

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return current;
    }

    if (current.type === 'mcp_tool_call_output' && Array.isArray(current.output?.content)) {
      const textContent = current.output.content.find((item) => item?.type === 'text' && typeof item.text === 'string');
      if (!textContent) {
        return current;
      }
      current = textContent.text;
      continue;
    }

    if (isPlainObject(current.output) && Array.isArray(current.output.content)) {
      const textContent = current.output.content.find((item) => item?.type === 'text' && typeof item.text === 'string');
      if (textContent) {
        current = textContent.text;
        continue;
      }
    }

    if (isPlainObject(current.body)) {
      current = current.body;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data;
      continue;
    }

    return current;
  }
  return current;
}

export function loadArtifactValue(value, { label = 'artifact' } = {}) {
  if (value === undefined) {
    throw new Error(`${label} is required`);
  }
  const raw = cloneJson(value);
  return {
    raw,
    data: unwrapResponseEnvelope(raw),
  };
}

export function loadArtifactInput({ jsonValue, fileValue, label, required = true } = {}) {
  const raw = readJsonInput(jsonValue, fileValue, label, { required });
  if (raw === null) {
    return null;
  }
  return {
    raw,
    data: unwrapResponseEnvelope(raw),
  };
}

export function deriveAdminBaseFromCandidatePageUrl(candidatePageUrl) {
  const raw = normalizeText(candidatePageUrl);
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    const pathName = url.pathname || '';
    const origin = url.origin;
    if (!pathName || pathName === '/') {
      return `${origin}/admin`;
    }
    if (pathName === '/admin' || pathName.startsWith('/admin/')) {
      return `${origin}/admin`;
    }
    const match = /^(.*\/admin)(?:\/|$)/.exec(pathName);
    if (match && match[1]) {
      return `${origin}${match[1]}`;
    }
    return `${origin}/admin`;
  } catch {
    return '';
  }
}

export function buildPageUrlFromCandidatePageUrl(candidatePageUrl, schemaUid) {
  const adminBase = deriveAdminBaseFromCandidatePageUrl(candidatePageUrl);
  if (!adminBase || !normalizeOptionalText(schemaUid)) {
    return '';
  }
  return `${adminBase.replace(/\/+$/, '')}/${encodeURIComponent(normalizeOptionalText(schemaUid))}`;
}
