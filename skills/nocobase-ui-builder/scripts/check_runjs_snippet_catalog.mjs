#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectRunJSStaticCode } from './runjs_guard.mjs';
import {
  RUNJS_EFFECT_STYLES,
  RUNJS_MODEL_USES,
  RUNJS_SCENE_HINTS,
  RUNJS_SNIPPET_FAMILIES,
  RUNJS_SNIPPET_REQUIRED_DOC_SECTIONS,
  RUNJS_SNIPPET_TIERS,
  RUNJS_SURFACES,
} from './runjs_snippet_constants.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_SKILL_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_CATALOG_PATH = path.join(DEFAULT_SKILL_ROOT, 'references', 'js-snippets', 'catalog.json');
const SNAPSHOT_PATH = path.join(DEFAULT_SKILL_ROOT, 'scripts', 'runjs_contract_snapshot.json');

const FORBIDDEN_KEYS = new Set(['sourcePath', 'upstreamPath', 'externalPath', 'absolutePath']);

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractFirstJsCodeFence(markdown) {
  const match = String(markdown ?? '').match(/```(?:js|javascript)\n([\s\S]*?)```/i);
  return match ? match[1].trim() : '';
}

function validateSnippetDocTemplate({ failures, label, markdown }) {
  const headings = new Set();
  const headingRegex = /^##\s+(.+?)\s*$/gm;
  for (const match of String(markdown ?? '').matchAll(headingRegex)) {
    headings.add(match[1].trim().toLowerCase());
  }
  for (const section of RUNJS_SNIPPET_REQUIRED_DOC_SECTIONS) {
    if (!headings.has(section.toLowerCase())) {
      failures.push(`${label}.doc missing required section: ${section}`);
    }
  }
}

function hasForbiddenPathShape(value) {
  return path.isAbsolute(value) || value.includes('..') || /^(https?:|file:)/i.test(value);
}

function addFieldFailure(failures, label, field, message) {
  failures.push(`${label}.${field} ${message}`);
}

function validateStringArray(failures, label, field, value, { allowed = null, nonEmpty = true } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    addFieldFailure(failures, label, field, 'must be a non-empty array');
    return [];
  }
  const normalized = [];
  for (const [index, item] of value.entries()) {
    if (!isNonEmptyString(item)) {
      failures.push(`${label}.${field}[${index}] must be a non-empty string`);
      continue;
    }
    normalized.push(item);
    if (allowed && !allowed.has(item)) {
      failures.push(`${label}.${field}[${index}] has unsupported value: ${item}`);
    }
  }
  return normalized;
}

function validateModelUsesBySurface(failures, label, surfaces, value) {
  if (!isPlainObject(value)) {
    addFieldFailure(failures, label, 'modelUses', 'must be an object keyed by surface id');
    return new Map();
  }

  const normalized = new Map();
  const declaredSurfaces = new Set(Array.isArray(surfaces) ? surfaces : []);

  for (const [surface, modelUses] of Object.entries(value)) {
    if (!declaredSurfaces.has(surface)) {
      failures.push(`${label}.modelUses has unsupported surface key: ${surface}`);
      continue;
    }
    const resolved = validateStringArray(failures, label, `modelUses.${surface}`, modelUses, { allowed: RUNJS_MODEL_USES });
    normalized.set(surface, resolved);
  }

  for (const surface of declaredSurfaces) {
    if (!normalized.has(surface)) {
      failures.push(`${label}.modelUses must declare at least one modelUse for ${surface}`);
    }
  }

  return normalized;
}

function validateSafeSnippetCode({ failures, label, entry, code, modelUsesBySurface }) {
  if (!code) {
    failures.push(`${label}.doc must contain one js code fence`);
    return;
  }
  if (entry.forbidsCtxRender && /\bctx\.render\s*\(/.test(code)) {
    failures.push(`${label}.doc uses ctx.render even though forbidsCtxRender is true`);
  }
  if (/\bctx\.openView\s*\(/.test(code)) {
    failures.push(`${label}.doc uses blocked capability ctx.openView`);
  }
  if (entry.tier !== 'safe') {
    return;
  }

  for (const surface of entry.surfaces || []) {
    const modelUses = modelUsesBySurface.get(surface) || [];
    for (const modelUse of modelUses) {
      const result = inspectRunJSStaticCode({
        code,
        surface,
        modelUse,
        snapshotPath: SNAPSHOT_PATH,
        path: `$catalog.${entry.id}`,
      });
      if (!result.ok) {
        failures.push(`${label}.doc failed ${surface} validation for ${modelUse}: ${(result.blockers || []).map((item) => item.code).join(', ')}`);
      }
    }
  }
}

export function loadRunJSSnippetCatalog({
  catalogPath = DEFAULT_CATALOG_PATH,
} = {}) {
  return readJson(path.resolve(catalogPath));
}

export function collectRunJSSnippetCatalogFailures({
  catalogPath = DEFAULT_CATALOG_PATH,
  skillRoot = DEFAULT_SKILL_ROOT,
} = {}) {
  const failures = [];
  const resolvedCatalogPath = path.resolve(catalogPath);
  const resolvedSkillRoot = path.resolve(skillRoot);
  if (!fs.existsSync(resolvedCatalogPath)) {
    return [`Missing RunJS snippet catalog: ${resolvedCatalogPath}`];
  }

  const catalog = readJson(resolvedCatalogPath);
  if (catalog.version !== 1) {
    failures.push(`catalog.json must use version 1, received ${JSON.stringify(catalog.version)}`);
  }
  if (!Array.isArray(catalog.snippets) || catalog.snippets.length === 0) {
    failures.push('catalog.json must contain a non-empty snippets array');
    return failures;
  }

  const seenIds = new Set();
  const entriesById = new Map();
  for (const [index, entry] of catalog.snippets.entries()) {
    const label = `snippets[${index}]`;
    if (!isPlainObject(entry)) {
      failures.push(`${label} must be an object`);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (FORBIDDEN_KEYS.has(key)) {
        failures.push(`${label}.${key} is forbidden in catalog metadata`);
      }
    }
    if (!isNonEmptyString(entry.id)) {
      addFieldFailure(failures, label, 'id', 'must be a non-empty string');
    } else if (seenIds.has(entry.id)) {
      failures.push(`Duplicate snippet id: ${entry.id}`);
    } else {
      seenIds.add(entry.id);
      entriesById.set(entry.id, entry);
    }
    if (!RUNJS_SNIPPET_TIERS.has(entry.tier)) addFieldFailure(failures, label, 'tier', 'must be safe, guarded, or advanced');
    if (!RUNJS_SNIPPET_FAMILIES.has(entry.family)) addFieldFailure(failures, label, 'family', 'has unsupported value');
    const surfaces = validateStringArray(failures, label, 'surfaces', entry.surfaces, { allowed: RUNJS_SURFACES });
    validateStringArray(failures, label, 'hostScenes', entry.hostScenes);
    const intentTags = validateStringArray(failures, label, 'intentTags', entry.intentTags);
    validateStringArray(failures, label, 'sceneHints', entry.sceneHints, { allowed: RUNJS_SCENE_HINTS });
    const modelUsesBySurface = validateModelUsesBySurface(failures, label, surfaces, entry.modelUses);
    validateStringArray(failures, label, 'ctxRoots', entry.ctxRoots, { nonEmpty: false });
    if (!RUNJS_EFFECT_STYLES.has(entry.effectStyle)) addFieldFailure(failures, label, 'effectStyle', 'must be action, value, or render');
    if (typeof entry.requiresTopLevelReturn !== 'boolean') addFieldFailure(failures, label, 'requiresTopLevelReturn', 'must be boolean');
    if (typeof entry.forbidsCtxRender !== 'boolean') addFieldFailure(failures, label, 'forbidsCtxRender', 'must be boolean');
    if (typeof entry.offlineSafe !== 'boolean') addFieldFailure(failures, label, 'offlineSafe', 'must be boolean');
    const preferredForIntents = validateStringArray(failures, label, 'preferredForIntents', entry.preferredForIntents, { nonEmpty: false });
    for (const intent of preferredForIntents) {
      if (!intentTags.includes(intent)) {
        failures.push(`${label}.preferredForIntents contains intent not declared in intentTags: ${intent}`);
      }
    }
    validateStringArray(failures, label, 'forbiddenApis', entry.forbiddenApis, { nonEmpty: false });
    validateStringArray(failures, label, 'relatedIds', entry.relatedIds, { nonEmpty: false });
    if (!isNonEmptyString(entry.doc)) {
      addFieldFailure(failures, label, 'doc', 'must be a non-empty string');
      continue;
    }
    if (hasForbiddenPathShape(entry.doc) || !entry.doc.startsWith('js-snippets/')) {
      addFieldFailure(failures, label, 'doc', 'must be an internal js-snippets path');
      continue;
    }
    if (!entry.doc.startsWith(`js-snippets/${entry.tier}/`)) {
      addFieldFailure(failures, label, 'doc', `must live under js-snippets/${entry.tier}/`);
      continue;
    }
    const docPath = path.join(resolvedSkillRoot, 'references', entry.doc);
    if (!fs.existsSync(docPath)) {
      addFieldFailure(failures, label, 'doc', `does not exist: ${entry.doc}`);
      continue;
    }
    const markdown = fs.readFileSync(docPath, 'utf8');
    validateSnippetDocTemplate({ failures, label, markdown });
    const code = extractFirstJsCodeFence(markdown);
    validateSafeSnippetCode({ failures, label, entry, code, modelUsesBySurface });
  }

  for (const [id, entry] of entriesById.entries()) {
    for (const relatedId of entry.relatedIds || []) {
      if (!entriesById.has(relatedId)) {
        failures.push(`${id}.relatedIds references missing snippet: ${relatedId}`);
      }
    }
  }

  return failures;
}

function main(argv) {
  const catalogPath = argv[0];
  const failures = collectRunJSSnippetCatalogFailures({
    ...(catalogPath ? { catalogPath } : {}),
  });
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('RunJS snippet catalog OK\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
