#!/usr/bin/env node

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeCollectionList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isAssociationFieldMeta(field) {
  const type = normalizeOptionalText(field?.type);
  const interfaceName = normalizeOptionalText(field?.interface);
  return Boolean(
    normalizeOptionalText(field?.target)
      || ['belongsTo', 'hasMany', 'belongsToMany', 'hasOne'].includes(type)
      || ['m2o', 'o2m', 'm2m', 'oho'].includes(interfaceName),
  );
}

function findCollectionMeta(collectionsMeta, collectionName) {
  return (Array.isArray(collectionsMeta) ? collectionsMeta : [])
    .find((item) => normalizeOptionalText(item?.name) === normalizeOptionalText(collectionName)) || null;
}

function findFieldMeta(collectionMeta, fieldName) {
  return (Array.isArray(collectionMeta?.fields) ? collectionMeta.fields : [])
    .find((item) => normalizeOptionalText(item?.name) === normalizeOptionalText(fieldName)) || null;
}

function buildDescriptor(fieldMeta) {
  return {
    name: normalizeOptionalText(fieldMeta?.name),
    title: normalizeOptionalText(fieldMeta?.uiSchema?.title) || normalizeOptionalText(fieldMeta?.title) || normalizeOptionalText(fieldMeta?.name),
    interface: normalizeOptionalText(fieldMeta?.interface),
    type: normalizeOptionalText(fieldMeta?.type),
  };
}

function resolveFieldMetaPath({ collectionsMeta, collectionName, fieldPath }) {
  const segments = normalizeOptionalText(fieldPath).split('.').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('fieldPath is required');
  }

  let currentCollection = findCollectionMeta(collectionsMeta, collectionName);
  if (!currentCollection) {
    throw new Error(`collection "${collectionName}" not found`);
  }

  let currentField = null;
  for (const segment of segments) {
    currentField = findFieldMeta(currentCollection, segment);
    if (!currentField) {
      throw new Error(`field "${segment}" not found on collection "${normalizeOptionalText(currentCollection?.name)}"`);
    }
    if (segment !== segments[segments.length - 1]) {
      const targetCollection = normalizeOptionalText(currentField?.target);
      if (!targetCollection) {
        throw new Error(`field "${segment}" is not a relation`);
      }
      currentCollection = findCollectionMeta(collectionsMeta, targetCollection);
      if (!currentCollection) {
        throw new Error(`target collection "${targetCollection}" not found`);
      }
    }
  }

  return currentField;
}

export function resolveRecordPopupFilterByTkTemplate({ collectionsMeta, collectionName }) {
  const collectionMeta = findCollectionMeta(collectionsMeta, collectionName);
  if (!collectionMeta) {
    throw new Error(`collection "${collectionName}" not found`);
  }
  const filterTargetKey = collectionMeta.filterTargetKey;
  if (typeof filterTargetKey === 'string' && filterTargetKey.trim()) {
    return `{{ctx.record.${filterTargetKey.trim()}}}`;
  }
  if (Array.isArray(filterTargetKey) && filterTargetKey.length > 0) {
    return Object.fromEntries(
      filterTargetKey
        .filter((item) => typeof item === 'string' && item.trim())
        .map((item) => [item.trim(), `{{ctx.record.${item.trim()}}}`]),
    );
  }
  throw new Error(`collection "${collectionName}" is missing filterTargetKey`);
}

export function resolveBuildFilterFieldSpec({
  collectionsMeta,
  collectionName,
  fieldPath,
}) {
  const fieldMeta = resolveFieldMetaPath({
    collectionsMeta,
    collectionName,
    fieldPath,
  });

  const descriptor = buildDescriptor(fieldMeta);
  const interfaceName = descriptor.interface;
  return {
    use: interfaceName === 'select' ? 'SelectFieldModel' : 'InputFieldModel',
    descriptor,
  };
}

function collectExplicitCollections(buildSpec) {
  return normalizeCollectionList([
    ...(Array.isArray(buildSpec?.dataBindings?.collections) ? buildSpec.dataBindings.collections : []),
    ...(Array.isArray(buildSpec?.scenario?.targetCollections) ? buildSpec.scenario.targetCollections : []),
  ]);
}

function collectCompileTargetCollections(compileArtifact) {
  return normalizeCollectionList(compileArtifact?.targetCollections);
}

export function evaluateBuildPreflight({ buildSpec, compileArtifact, collectionsMeta }) {
  const blockers = [];
  const warnings = [];
  const explicitCollections = collectExplicitCollections(buildSpec);
  const compileTargetCollections = collectCompileTargetCollections(compileArtifact);
  const availableCollections = normalizeCollectionList((Array.isArray(collectionsMeta) ? collectionsMeta : []).map((item) => item?.name));

  if (compileArtifact?.multiPageRequest?.detected) {
    blockers.push({
      code: 'PREFLIGHT_MULTI_PAGE_REQUEST_REQUIRES_PAGE_LEVEL_EXECUTION',
      message: 'multi-page validation request must be split before create-v2',
    });
  }

  if (explicitCollections.length > 0 && compileTargetCollections.length === 0) {
    blockers.push({
      code: 'EXPLICIT_COLLECTION_TARGET_MISSING',
      message: 'compile artifact does not contain targetCollections for explicitly requested collections',
      details: {
        explicitCollections,
      },
    });
  }

  const mismatchedCollections = explicitCollections.filter((item) => !compileTargetCollections.includes(item));
  if (explicitCollections.length > 0 && compileTargetCollections.length > 0 && mismatchedCollections.length > 0) {
    blockers.push({
      code: 'EXPLICIT_COLLECTION_TARGET_MISMATCH',
      message: 'compile artifact targetCollections do not match explicitly requested collections',
      details: {
        explicitCollections,
        compileTargetCollections,
      },
    });
  }

  const missingAvailableCollections = explicitCollections.filter((item) => !availableCollections.includes(item));
  if (missingAvailableCollections.length > 0) {
    warnings.push({
      code: 'EXPLICIT_COLLECTION_NOT_IN_METADATA',
      message: 'some explicit collections are not present in collections metadata',
      details: {
        missingAvailableCollections,
      },
    });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}

export function selectBuildCandidate({ buildSpec, compileArtifact, collectionsMeta }) {
  const preflight = evaluateBuildPreflight({
    buildSpec,
    compileArtifact,
    collectionsMeta,
  });
  return {
    requestedSelectedCandidateId: normalizeOptionalText(compileArtifact?.selectedCandidateId) || 'selected-primary',
    winner: {
      candidateId: normalizeOptionalText(compileArtifact?.selectedCandidateId) || 'selected-primary',
      buildSpec,
      compileArtifact,
      preflight,
    },
    evaluations: [
      {
        candidateId: normalizeOptionalText(compileArtifact?.selectedCandidateId) || 'selected-primary',
        ok: preflight.ok,
      },
    ],
  };
}

async function main() {
  throw new Error('rest_validation_builder no longer performs direct NocoBase REST writes; use MCP artifacts with ui_write_wrapper instead');
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('rest_validation_builder.mjs');
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
