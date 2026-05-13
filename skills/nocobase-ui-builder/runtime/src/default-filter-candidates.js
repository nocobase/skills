const DEFAULT_FILTER_CANDIDATE_INTERFACES = new Set([
  'input',
  'email',
  'url',
  'phone',
  'textarea',
  'select',
  'radioGroup',
]);

const DEFAULT_FILTER_EQ_INTERFACES = new Set(['select', 'radioGroup']);

const ASSOCIATION_FIELD_TYPES = new Set([
  'belongsto',
  'hasone',
  'hasmany',
  'belongstomany',
  'belongstoarray',
  'onetoone',
]);

const ASSOCIATION_FIELD_INTERFACES = new Set([
  'm2o',
  'o2m',
  'm2m',
  'o2o',
  'mbm',
  'obo',
  'oho',
  'manytoone',
  'onetomany',
  'manytomany',
]);

const DEFAULT_FILTER_EXCLUDED_FIELD_NAMES = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdBy',
  'updatedBy',
  'deletedBy',
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by',
  'updated_by',
  'deleted_by',
  'sort',
]);

const DEFAULT_FILTER_PREFERRED_FIELD_NAMES = [
  'name',
  'title',
  'nickname',
  'username',
  'email',
  'status',
  'phone',
  'mobile',
  'label',
  'code',
  'subject',
  'category',
  'scope',
  'priority',
  'description',
];

export const DEFAULT_FILTER_MAX_CANDIDATE_FIELDS = 4;
export const DEFAULT_FILTER_MINIMUM_COVERAGE_FIELDS = 3;

function normalizeText(value, fallback = '') {
  const source = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const normalized = source.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function getFieldOptions(field) {
  return field?.options && typeof field.options === 'object' && !Array.isArray(field.options)
    ? field.options
    : {};
}

function getFieldName(field) {
  const options = getFieldOptions(field);
  return normalizeText(field?.name) || normalizeText(field?.field) || normalizeText(field?.key) || normalizeText(options.name);
}

function getFieldInterface(field) {
  const options = getFieldOptions(field);
  return normalizeText(field?.interface) || normalizeText(options.interface);
}

function getFieldType(field) {
  const options = getFieldOptions(field);
  return normalizeText(field?.type) || normalizeText(options.type);
}

function getFieldTarget(field) {
  const options = getFieldOptions(field);
  return normalizeText(field?.target) || normalizeText(field?.targetCollection) || normalizeText(options.target);
}

function isAssociationFieldLike(field) {
  if (!field || typeof field !== 'object' || Array.isArray(field)) {
    return false;
  }
  return (
    !!getFieldTarget(field)
    ||
    ASSOCIATION_FIELD_TYPES.has(normalizeLowerText(getFieldType(field)))
    || ASSOCIATION_FIELD_INTERFACES.has(normalizeLowerText(getFieldInterface(field)))
  );
}

function isCandidateBusinessField(field) {
  const fieldName = getFieldName(field);
  const fieldInterface = getFieldInterface(field);
  if (!fieldName || !fieldInterface) {
    return false;
  }
  if (DEFAULT_FILTER_EXCLUDED_FIELD_NAMES.has(fieldName)) {
    return false;
  }
  if (!DEFAULT_FILTER_CANDIDATE_INTERFACES.has(fieldInterface)) {
    return false;
  }
  if (field?.hidden === true || field?.options?.hidden === true) {
    return false;
  }
  return !isAssociationFieldLike(field);
}

export function resolveDefaultFilterCandidateFields(collectionMeta, options = {}) {
  const maxCandidates =
    typeof options.maxCandidates === 'number' && Number.isFinite(options.maxCandidates)
      ? Math.max(0, Math.trunc(options.maxCandidates))
      : DEFAULT_FILTER_MAX_CANDIDATE_FIELDS;

  if (!collectionMeta || !Array.isArray(collectionMeta.fields) || maxCandidates === 0) {
    return [];
  }

  const availableFields = collectionMeta.fields.filter(isCandidateBusinessField);
  const fieldsByName = new Map(
    availableFields.map((field) => [getFieldName(field), field]),
  );
  const selectedFields = [];
  const seenFieldNames = new Set();

  const pushFieldByName = (value) => {
    const fieldName = normalizeText(value);
    if (!fieldName || seenFieldNames.has(fieldName)) {
      return;
    }
    const field = fieldsByName.get(fieldName);
    if (!field) {
      return;
    }
    seenFieldNames.add(fieldName);
    selectedFields.push(field);
  };

  pushFieldByName(collectionMeta.titleField);
  DEFAULT_FILTER_PREFERRED_FIELD_NAMES.forEach(pushFieldByName);

  for (const field of availableFields) {
    if (selectedFields.length >= maxCandidates) {
      break;
    }
    pushFieldByName(getFieldName(field));
  }

  return selectedFields.slice(0, maxCandidates);
}

export function resolveDefaultFilterCandidateFieldNames(collectionMeta, options = {}) {
  return resolveDefaultFilterCandidateFields(collectionMeta, options).map((field) =>
    getFieldName(field),
  );
}

export function resolveDefaultFilterMinimumCandidateFieldNames(collectionMeta, options = {}) {
  const minimumFields =
    typeof options.minimumFields === 'number' && Number.isFinite(options.minimumFields)
      ? Math.max(0, Math.trunc(options.minimumFields))
      : DEFAULT_FILTER_MINIMUM_COVERAGE_FIELDS;
  const candidateFieldNames = resolveDefaultFilterCandidateFieldNames(collectionMeta, options);
  return candidateFieldNames.slice(0, Math.min(minimumFields, candidateFieldNames.length));
}

export function resolveDefaultFilterRequiredFieldCount(collectionMeta, options = {}) {
  const candidateFieldCount = resolveDefaultFilterCandidateFieldNames(collectionMeta, {
    maxCandidates: DEFAULT_FILTER_MAX_CANDIDATE_FIELDS,
    ...options,
  }).length;
  return Math.min(DEFAULT_FILTER_MINIMUM_COVERAGE_FIELDS, candidateFieldCount);
}

export function buildSuggestedDefaultFilterGroup(collectionMeta, options = {}) {
  const items = resolveDefaultFilterCandidateFields(collectionMeta, options).map((field) => ({
    path: getFieldName(field),
    operator: DEFAULT_FILTER_EQ_INTERFACES.has(getFieldInterface(field)) ? '$eq' : '$includes',
    value: '',
  }));
  return {
    logic: '$and',
    items,
  };
}
