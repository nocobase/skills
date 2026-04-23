#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNJS_SCENE_HINTS, RUNJS_SURFACES } from './runjs_snippet_constants.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_SKILL_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_SKILL_ROOT, 'references', 'js-surfaces', 'snippet-manifest.json');
export const DEFAULT_CATALOG_PATH = path.join(DEFAULT_SKILL_ROOT, 'references', 'js-snippets', 'catalog.json');

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateRecommendedSnippetIds({
  failures,
  label,
  snippetIds,
  surfaceId,
  catalogById,
  expectedSceneHint = null,
}) {
  if (!Array.isArray(snippetIds) || snippetIds.length === 0) {
    failures.push(`${label} must be a non-empty array`);
    return;
  }
  if (snippetIds.length > 3) {
    failures.push(`${label} must contain at most 3 snippets`);
  }

  for (const [snippetIndex, snippetId] of snippetIds.entries()) {
    const snippetLabel = `${label}[${snippetIndex}]`;
    if (!isNonEmptyString(snippetId)) {
      failures.push(`${snippetLabel} must be a non-empty string`);
      continue;
    }
    const catalogEntry = catalogById.get(snippetId);
    if (!catalogEntry) {
      failures.push(`${snippetLabel} references missing catalog snippet: ${snippetId}`);
      continue;
    }
    if (catalogEntry.tier !== 'safe') {
      failures.push(`${snippetLabel} must reference a safe-tier snippet: ${snippetId}`);
    }
    if (!Array.isArray(catalogEntry.surfaces) || !catalogEntry.surfaces.includes(surfaceId)) {
      failures.push(`${snippetLabel} snippet ${snippetId} does not declare surface ${surfaceId}`);
    }
    if (expectedSceneHint && (!Array.isArray(catalogEntry.sceneHints) || !catalogEntry.sceneHints.includes(expectedSceneHint))) {
      failures.push(`${snippetLabel} snippet ${snippetId} does not declare sceneHint ${expectedSceneHint}`);
    }
  }
}

export function collectRunJSSnippetManifestFailures({
  manifestPath = DEFAULT_MANIFEST_PATH,
  catalogPath = DEFAULT_CATALOG_PATH,
  skillRoot = DEFAULT_SKILL_ROOT,
} = {}) {
  const failures = [];
  const resolvedManifestPath = path.resolve(manifestPath);
  const resolvedSkillRoot = path.resolve(skillRoot);

  if (!fs.existsSync(resolvedManifestPath)) {
    return [`Missing RunJS snippet manifest: ${resolvedManifestPath}`];
  }

  const manifest = readJson(resolvedManifestPath);
  const catalog = fs.existsSync(path.resolve(catalogPath)) ? readJson(path.resolve(catalogPath)) : null;
  const catalogById = new Map((catalog?.snippets || []).map((entry) => [entry.id, entry]));
  if (!catalog) {
    failures.push(`Missing RunJS snippet catalog: ${path.resolve(catalogPath)}`);
  }
  if (manifest.version !== 1) {
    failures.push(`snippet-manifest.json must use version 1, received ${JSON.stringify(manifest.version)}`);
  }
  if (!Array.isArray(manifest.surfaces) || manifest.surfaces.length === 0) {
    failures.push('snippet-manifest.json must contain a non-empty surfaces array');
    return failures;
  }

  const seenIds = new Set();
  for (const [index, surface] of manifest.surfaces.entries()) {
    const label = `surfaces[${index}]`;
    if (!isNonEmptyString(surface?.id)) {
      failures.push(`${label}.id must be a non-empty string`);
    } else if (seenIds.has(surface.id)) {
      failures.push(`Duplicate surface id: ${surface.id}`);
    } else {
      seenIds.add(surface.id);
      if (!RUNJS_SURFACES.has(surface.id)) {
        failures.push(`${label}.id has unsupported value: ${surface.id}`);
      }
    }

    if (!isNonEmptyString(surface?.entryDoc)) {
      failures.push(`${label}.entryDoc must be a non-empty string`);
    } else {
      const entryDocPath = path.join(resolvedSkillRoot, 'references', surface.entryDoc.replace(/^references\//, ''));
      if (!fs.existsSync(entryDocPath)) {
        failures.push(`${label}.entryDoc does not exist: ${surface.entryDoc}`);
      }
    }

    validateRecommendedSnippetIds({
      failures,
      label: `${label}.recommendedSnippetIds`,
      snippetIds: surface?.recommendedSnippetIds,
      surfaceId: surface?.id,
      catalogById,
    });

    if (surface?.recommendedBySceneHint != null) {
      if (Object.prototype.toString.call(surface.recommendedBySceneHint) !== '[object Object]') {
        failures.push(`${label}.recommendedBySceneHint must be an object keyed by sceneHint`);
      } else {
        for (const [sceneHint, snippetIds] of Object.entries(surface.recommendedBySceneHint)) {
          if (!RUNJS_SCENE_HINTS.has(sceneHint)) {
            failures.push(`${label}.recommendedBySceneHint has unsupported sceneHint key: ${sceneHint}`);
            continue;
          }
          validateRecommendedSnippetIds({
            failures,
            label: `${label}.recommendedBySceneHint.${sceneHint}`,
            snippetIds,
            surfaceId: surface?.id,
            catalogById,
            expectedSceneHint: sceneHint,
          });
        }
      }
    }
  }

  return failures;
}

function main(argv) {
  const manifestPath = argv[0];
  const failures = collectRunJSSnippetManifestFailures({
    ...(manifestPath ? { manifestPath } : {}),
  });
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('RunJS snippet manifest OK\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
