import { isPlainObject } from './utils.js';

function normalizeDefault(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function collectAssignValuesValidationIssues({
  assignValues,
  path,
  collectionName,
  collectionMeta,
  normalizeName = normalizeDefault,
  valueLabel = 'settings.assignValues',
  metadataValueLabel = valueLabel,
  includeDetails = false,
}) {
  if (!isPlainObject(assignValues)) {
    return [
      {
        path,
        ruleId: 'assign-values-must-be-object',
        message: `${valueLabel} must be one plain object; use {} to clear assignment values.`,
        code: 'ASSIGN_VALUES_MUST_BE_OBJECT',
      },
    ];
  }

  const fieldNames = Object.keys(assignValues).map(normalizeName).filter(Boolean);
  if (fieldNames.length === 0) {
    return [];
  }

  const normalizedCollectionName = normalizeName(collectionName);
  if (!collectionMeta) {
    return [
      {
        path,
        ruleId: 'missing-collection-metadata',
        message: `collectionMetadata is required for collection "${
          normalizedCollectionName || '(unknown)'
        }" before validating ${metadataValueLabel}.`,
        code: 'REQUIRED_COLLECTION_METADATA_MISSING',
        ...(includeDetails
          ? {
              details: {
                collectionName: normalizedCollectionName,
                path,
                reason: 'assign-values',
              },
            }
          : {}),
      },
    ];
  }

  return fieldNames
    .filter((fieldName) => !collectionMeta.fieldsByName.has(fieldName))
    .map((fieldName) => ({
      path: `${path}.${fieldName}`,
      ruleId: 'assign-values-field-unknown',
      message: `${valueLabel} references unknown field "${fieldName}" on collection "${normalizedCollectionName}".`,
      code: 'ASSIGN_VALUES_FIELD_UNKNOWN',
      ...(includeDetails
        ? {
            details: {
              collectionName: normalizedCollectionName,
              fieldName,
            },
          }
        : {}),
    }));
}
