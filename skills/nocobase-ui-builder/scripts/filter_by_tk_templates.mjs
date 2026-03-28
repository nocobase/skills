export const LEGACY_RECORD_CONTEXT_FILTER_BY_TK = '{{ctx.record.id}}';

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function normalizeFilterTargetKeyList(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const normalized = normalizeOptionalText(value);
  return normalized ? [normalized] : [];
}

export function buildRecordContextFilterByTkTemplate(filterTargetKey, {
  fallback = LEGACY_RECORD_CONTEXT_FILTER_BY_TK,
} = {}) {
  const filterTargetKeys = normalizeFilterTargetKeyList(filterTargetKey);
  if (filterTargetKeys.length === 0) {
    return fallback;
  }
  if (filterTargetKeys.length === 1) {
    return `{{ctx.record.${filterTargetKeys[0]}}}`;
  }
  return Object.fromEntries(
    filterTargetKeys.map((fieldName) => [fieldName, `{{ctx.record.${fieldName}}}`]),
  );
}
