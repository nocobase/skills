import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureArray, isPlainObject } from './utils.js';
import {
  normalizeCollectionMetadataInput,
  resolveAssociationTargetCollection,
} from './page-blueprint-preview.js';

const execFileAsync = promisify(execFile);
const MAX_METADATA_RESOLUTION_ROUNDS = 5;
const RESOURCE_BLOCK_SHORTHAND_KEYS = new Set([
  'collection',
  'binding',
  'dataSourceKey',
  'associationPathName',
  'associationField',
]);
const HIDDEN_POPUP_SETTING_KEYS_BY_BLOCK_TYPE = new Map([
  ['calendar', ['quickCreatePopup', 'eventPopup']],
  ['kanban', ['quickCreatePopup', 'cardPopup']],
]);

function normalizeText(value) {
  const source = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return source.replace(/\s+/g, ' ').trim();
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function hasOwn(target, key) {
  return isPlainObject(target) && Object.prototype.hasOwnProperty.call(target, key);
}

function createValidationError(path, ruleId, message) {
  return {
    path,
    ruleId,
    message,
  };
}

function createMetadataEnvelope(collections) {
  return {
    collections: Object.fromEntries(
      Object.entries(collections || {}).filter(([collectionName]) => normalizeText(collectionName)),
    ),
  };
}

export function normalizePrepareCollectionMetadata(rawMetadata) {
  const normalized = normalizeCollectionMetadataInput(rawMetadata);
  const errors = normalized.provided ? normalized.errors : [];
  return {
    provided: normalized.provided,
    metadata: createMetadataEnvelope(normalized.collections),
    errors,
  };
}

function getCollectionLabel(node) {
  return (
    normalizeText(node?.collection)
    || normalizeText(node?.resource?.collectionName)
    || normalizeText(node?.resource?.collection)
    || normalizeText(node?.resourceInit?.collectionName)
    || normalizeText(node?.resourceInit?.collection)
  );
}

function getNodeBinding(node) {
  return normalizeLowerText(node?.binding || node?.resource?.binding || node?.resource?.resourceBinding);
}

function getNodeAssociationField(node) {
  return normalizeText(
    node?.associationField
    || node?.associationPathName
    || node?.resource?.associationField
    || node?.resource?.associationPathName,
  );
}

function hasResourceBinding(node) {
  if (!isPlainObject(node)) return false;
  if (isPlainObject(node.resource) && Object.keys(node.resource).length > 0) {
    return true;
  }
  for (const key of RESOURCE_BLOCK_SHORTHAND_KEYS) {
    if (normalizeText(node[key])) {
      return true;
    }
  }
  return false;
}

function shouldTraversePopupBlocks(popup) {
  return isPlainObject(popup) && Array.isArray(popup.blocks) && popup.blocks.length > 0;
}

function addCollectionName(collectionNames, value) {
  const collectionName = normalizeText(value);
  if (collectionName) {
    collectionNames.add(collectionName);
  }
}

function getTraversalSurfaceCollection(context) {
  return normalizeText(context?.surfaceCollection || context?.currentCollection);
}

function getDefaultsAssociationFieldKey(associationField) {
  return normalizeText(associationField).split('.')[0] || '';
}

function getAssociationPathPrefixes(fieldPath) {
  const segments = normalizeText(fieldPath).split('.').filter(Boolean);
  if (segments.length === 0) return [];
  return segments.map((_, index) => segments.slice(0, index + 1).join('.'));
}

function resolveScannedAssociation(metadata, sourceCollection, associationField, expectedTargetCollection = '') {
  const normalizedSourceCollection = normalizeText(sourceCollection);
  const normalizedAssociationPath = normalizeText(associationField);
  if (!normalizedSourceCollection || !normalizedAssociationPath) return null;
  const targetCollection = resolveAssociationTargetCollection(
    metadata,
    normalizedSourceCollection,
    normalizedAssociationPath,
  );
  const normalizedExpectedTargetCollection = normalizeText(expectedTargetCollection);
  if (!targetCollection) return null;
  if (normalizedExpectedTargetCollection && targetCollection !== normalizedExpectedTargetCollection) {
    return null;
  }
  return {
    sourceCollection: normalizedSourceCollection,
    associationField: getDefaultsAssociationFieldKey(normalizedAssociationPath),
    targetCollection,
  };
}

function resolveDeepestScannedAssociation(metadata, sourceCollection, fieldPath) {
  let deepestAssociation = null;
  for (const associationPath of getAssociationPathPrefixes(fieldPath)) {
    const association = resolveScannedAssociation(metadata, sourceCollection, associationPath);
    if (association) {
      deepestAssociation = association;
    }
  }
  return deepestAssociation;
}

function scanAssociationPathTargets(metadata, sourceCollection, fieldPath, collectionNames) {
  for (const associationPath of getAssociationPathPrefixes(fieldPath)) {
    const association = resolveScannedAssociation(metadata, sourceCollection, associationPath);
    addCollectionName(collectionNames, association?.targetCollection);
  }
}

function buildBlockTraversalContext(block, parentContext, metadata) {
  const binding = getNodeBinding(block);
  const directCollection = getCollectionLabel(block);
  const inheritedSurfaceCollection = getTraversalSurfaceCollection(parentContext);
  const normalizedDirectCollection = normalizeText(directCollection);
  let surfaceCollection = normalizedDirectCollection || inheritedSurfaceCollection;

  if (binding === 'associatedrecords') {
    const association = resolveScannedAssociation(
      metadata,
      inheritedSurfaceCollection,
      getNodeAssociationField(block),
      normalizedDirectCollection,
    );
    surfaceCollection = normalizedDirectCollection || association?.targetCollection || '';
  } else if (binding === 'currentrecord' && normalizedDirectCollection) {
    surfaceCollection = normalizedDirectCollection;
  }

  return {
    surfaceCollection,
    directCollection: normalizedDirectCollection,
    binding,
  };
}

function scanPopupCollections(popup, parentContext, metadata, collectionNames) {
  if (!shouldTraversePopupBlocks(popup)) return;
  scanBlocksForCollections(popup.blocks, parentContext, metadata, collectionNames);
}

function scanActionsForCollections(items, blockContext, metadata, collectionNames) {
  for (const item of ensureArray(items)) {
    if (!isPlainObject(item) || !hasOwn(item, 'popup')) continue;
    scanPopupCollections(
      item.popup,
      {
        surfaceCollection: getTraversalSurfaceCollection(blockContext),
      },
      metadata,
      collectionNames,
    );
  }
}

function scanFieldsForCollections(items, blockContext, metadata, collectionNames) {
  for (const item of ensureArray(items)) {
    const fieldPath =
      typeof item === 'string'
        ? normalizeText(item)
        : isPlainObject(item)
          ? normalizeText(item.field)
          : '';
    if (fieldPath) {
      scanAssociationPathTargets(
        metadata,
        getTraversalSurfaceCollection(blockContext),
        fieldPath,
        collectionNames,
      );
    }

    if (!isPlainObject(item) || !hasOwn(item, 'popup')) continue;
    const popupContext = fieldPath
      ? {
          surfaceCollection:
            resolveDeepestScannedAssociation(
              metadata,
              getTraversalSurfaceCollection(blockContext),
              fieldPath,
            )?.targetCollection
            || getTraversalSurfaceCollection(blockContext),
        }
      : {
          surfaceCollection: getTraversalSurfaceCollection(blockContext),
        };
    scanPopupCollections(item.popup, popupContext, metadata, collectionNames);
  }
}

function scanFieldGroupsForCollections(fieldGroups, blockContext, metadata, collectionNames) {
  for (const group of ensureArray(fieldGroups)) {
    if (!isPlainObject(group)) continue;
    scanFieldsForCollections(group.fields, blockContext, metadata, collectionNames);
  }
}

function scanHiddenPopupSettingsForCollections(block, blockContext, metadata, collectionNames) {
  const settings = block?.settings;
  if (!isPlainObject(settings)) return;
  const popupKeys = HIDDEN_POPUP_SETTING_KEYS_BY_BLOCK_TYPE.get(normalizeText(block?.type)) || [];
  for (const popupKey of popupKeys) {
    if (!hasOwn(settings, popupKey)) continue;
    scanPopupCollections(
      settings[popupKey],
      {
        surfaceCollection: getTraversalSurfaceCollection(blockContext),
      },
      metadata,
      collectionNames,
    );
  }
}

function scanBlockForCollections(block, parentContext, metadata, collectionNames) {
  if (!isPlainObject(block)) return;
  if (hasResourceBinding(block)) {
    addCollectionName(collectionNames, getCollectionLabel(block));
  }

  const blockContext = buildBlockTraversalContext(block, parentContext, metadata);
  addCollectionName(collectionNames, blockContext.directCollection);

  const associatedRecordsTarget =
    normalizeLowerText(blockContext.binding) === 'associatedrecords'
      ? resolveScannedAssociation(
          metadata,
          getTraversalSurfaceCollection(parentContext),
          getNodeAssociationField(block),
          blockContext.directCollection,
        )?.targetCollection
      : '';
  addCollectionName(collectionNames, associatedRecordsTarget);

  scanFieldsForCollections(block.fields, blockContext, metadata, collectionNames);
  scanFieldGroupsForCollections(block.fieldGroups, blockContext, metadata, collectionNames);
  scanActionsForCollections(block.actions, blockContext, metadata, collectionNames);
  scanActionsForCollections(block.recordActions, blockContext, metadata, collectionNames);
  scanHiddenPopupSettingsForCollections(block, blockContext, metadata, collectionNames);
}

function scanBlocksForCollections(blocks, parentContext, metadata, collectionNames) {
  for (const block of ensureArray(blocks)) {
    scanBlockForCollections(block, parentContext, metadata, collectionNames);
  }
}

export function collectBlueprintCollectionNames(blueprint, metadata = { collections: {} }) {
  const collectionNames = new Set();
  for (const tab of ensureArray(blueprint?.tabs)) {
    if (!isPlainObject(tab)) continue;
    scanBlocksForCollections(tab.blocks, { surfaceCollection: '' }, metadata, collectionNames);
  }
  return Array.from(collectionNames).sort();
}

function mergeCollectionMetadata(baseMetadata, fetchedMetadata) {
  const baseCollections = isPlainObject(baseMetadata?.collections) ? baseMetadata.collections : {};
  const fetchedCollections = isPlainObject(fetchedMetadata?.collections) ? fetchedMetadata.collections : {};
  return createMetadataEnvelope({
    ...fetchedCollections,
    ...baseCollections,
  });
}

function parseJsonOutput(stdout, commandDescription) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${commandDescription} returned invalid JSON: ${error.message}`);
  }
}

async function execNbJson(args, options = {}) {
  const { execFileImpl = execFileAsync, cwd = process.cwd() } = options;
  const commandDescription = `nb ${args.join(' ')}`;
  const result = await execFileImpl('nb', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const stdout = typeof result === 'string' ? result : result.stdout;
  return parseJsonOutput(stdout || '', commandDescription);
}

function extractCollectionResourceEntry(payload, collectionName) {
  if (isPlainObject(payload?.data)) {
    return extractCollectionResourceEntry(payload.data, collectionName);
  }
  if (Array.isArray(payload)) {
    const normalizedName = normalizeText(collectionName);
    return payload.find((entry) => {
      const source = isPlainObject(entry?.data) ? entry.data : entry;
      return normalizeText(source?.name) === normalizedName;
    }) || payload[0] || null;
  }
  if (isPlainObject(payload?.rows)) {
    return extractCollectionResourceEntry(payload.rows, collectionName);
  }
  if (Array.isArray(payload?.rows)) {
    return extractCollectionResourceEntry(payload.rows, collectionName);
  }
  if (Array.isArray(payload?.data)) {
    return extractCollectionResourceEntry(payload.data, collectionName);
  }
  if (isPlainObject(payload)) {
    return payload;
  }
  return null;
}

function normalizeFetchedCollectionMetadata(collectionName, payload) {
  const entry = extractCollectionResourceEntry(payload, collectionName);
  if (!entry) {
    throw new Error(`collection metadata for "${collectionName}" was not found in nb response.`);
  }
  const normalized = normalizeCollectionMetadataInput([entry]);
  if (normalized.errors.length) {
    throw new Error(normalized.errors.map((issue) => issue.message).join('; '));
  }
  if (!normalized.collections[collectionName]) {
    throw new Error(`collection metadata for "${collectionName}" was not found in nb response.`);
  }
  return createMetadataEnvelope(normalized.collections);
}

async function fetchCollectionMetadataWithDataModeling(collectionName, options = {}) {
  const payload = await execNbJson([
    'api',
    'data-modeling',
    'collections',
    'get',
    '--filter-by-tk',
    collectionName,
    '--appends',
    'fields',
    '-j',
  ], options);
  return normalizeFetchedCollectionMetadata(collectionName, payload);
}

async function fetchCollectionMetadataWithResourceList(collectionName, options = {}) {
  const payload = await execNbJson([
    'api',
    'resource',
    'list',
    '--resource',
    'collections',
    '--filter',
    JSON.stringify({ name: collectionName }),
    '--appends',
    'fields',
    '-j',
  ], options);
  return normalizeFetchedCollectionMetadata(collectionName, payload);
}

export async function fetchCollectionMetadata(collectionName, options = {}) {
  try {
    return await fetchCollectionMetadataWithDataModeling(collectionName, options);
  } catch (error) {
    if (options.onFallback) {
      options.onFallback(collectionName, error);
    }
    return fetchCollectionMetadataWithResourceList(collectionName, options);
  }
}

function buildMetadataFetchError(collectionName, error) {
  return createValidationError(
    'collectionMetadata',
    'collection-metadata-fetch-failed',
    `Failed to auto-resolve collectionMetadata for "${collectionName}": ${error?.message || String(error)}`,
  );
}

export async function resolveMissingCollectionMetadataForBlueprint(blueprint, rawMetadata, options = {}) {
  const normalized = normalizePrepareCollectionMetadata(rawMetadata);
  if (normalized.errors.length) {
    return {
      ok: false,
      metadata: normalized.metadata,
      errors: normalized.errors,
      fetchedCollections: [],
      missingCollections: [],
    };
  }

  let metadata = normalized.metadata;
  const fetchedCollections = [];
  const fetchCollection = options.fetchCollectionMetadata || fetchCollectionMetadata;
  const maxRounds = options.maxRounds || MAX_METADATA_RESOLUTION_ROUNDS;

  for (let round = 0; round < maxRounds; round += 1) {
    const requiredCollections = collectBlueprintCollectionNames(blueprint, metadata);
    const missingCollections = requiredCollections.filter(
      (collectionName) => !hasOwn(metadata.collections, collectionName),
    );
    if (missingCollections.length === 0) {
      return {
        ok: true,
        metadata,
        errors: [],
        fetchedCollections,
        missingCollections: [],
      };
    }

    let fetchedAny = false;
    for (const collectionName of missingCollections) {
      try {
        const fetchedMetadata = await fetchCollection(collectionName, options);
        const normalizedFetched = normalizePrepareCollectionMetadata(fetchedMetadata);
        if (normalizedFetched.errors.length) {
          return {
            ok: false,
            metadata,
            errors: normalizedFetched.errors,
            fetchedCollections,
            missingCollections,
          };
        }
        metadata = mergeCollectionMetadata(metadata, normalizedFetched.metadata);
        if (!hasOwn(metadata.collections, collectionName)) {
          return {
            ok: false,
            metadata,
            errors: [
              buildMetadataFetchError(
                collectionName,
                new Error(`nb response did not include collection "${collectionName}".`),
              ),
            ],
            fetchedCollections,
            missingCollections,
          };
        }
        fetchedCollections.push(collectionName);
        fetchedAny = true;
      } catch (error) {
        return {
          ok: false,
          metadata,
          errors: [buildMetadataFetchError(collectionName, error)],
          fetchedCollections,
          missingCollections,
        };
      }
    }

    if (!fetchedAny) {
      break;
    }
  }

  const unresolvedCollections = collectBlueprintCollectionNames(blueprint, metadata).filter(
    (collectionName) => !hasOwn(metadata.collections, collectionName),
  );
  return {
    ok: unresolvedCollections.length === 0,
    metadata,
    errors: unresolvedCollections.length
      ? [
          createValidationError(
            'collectionMetadata',
            'collection-metadata-resolution-incomplete',
            `Unable to auto-resolve all collectionMetadata after ${maxRounds} rounds: ${unresolvedCollections.join(', ')}.`,
          ),
        ]
      : [],
    fetchedCollections,
    missingCollections: unresolvedCollections,
  };
}
