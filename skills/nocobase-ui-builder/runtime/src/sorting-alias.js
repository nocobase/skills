const SORTABLE_PUBLIC_BLOCK_TYPES = new Set(['table', 'details', 'list', 'tree', 'kanban', 'gridCard', 'map']);
const SORTABLE_PUBLIC_LIVE_USES = new Set([
  'TableBlockModel',
  'DetailsBlockModel',
  'ListBlockModel',
  'TreeBlockModel',
  'KanbanBlockModel',
  'GridCardBlockModel',
  'MapBlockModel',
]);

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isSortablePublicBlockType(type) {
  return SORTABLE_PUBLIC_BLOCK_TYPES.has(normalizeText(type));
}

export function isSortablePublicLiveUse(use) {
  return SORTABLE_PUBLIC_LIVE_USES.has(normalizeText(use));
}

export function normalizeSortingDirection(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || normalized === 'asc' || normalized === 'ascend' || normalized === 'ascending') {
    return 'asc';
  }
  if (normalized === 'desc' || normalized === 'descend' || normalized === 'descending') {
    return 'desc';
  }
  return normalized;
}

export function normalizeSortingValue(value) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (typeof item === 'string') {
      const trimmed = normalizeText(item);
      if (!trimmed) return item;
      const direction = trimmed.startsWith('-') ? 'desc' : 'asc';
      const field = trimmed.replace(/^[+-]/, '');
      return field ? { field, direction } : item;
    }
    if (isObjectRecord(item)) {
      return {
        ...item,
        ...(Object.hasOwn(item, 'direction') ? { direction: normalizeSortingDirection(item.direction) } : {}),
      };
    }
    return item;
  });
}

function normalizeComparableJson(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeComparableJson(item));
  if (!isObjectRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeComparableJson(value[key])]),
  );
}

export function settingsSortValuesMatch(left, right) {
  return JSON.stringify(normalizeComparableJson(normalizeSortingValue(left)))
    === JSON.stringify(normalizeComparableJson(normalizeSortingValue(right)));
}

export function normalizeSortAliasInSettings(settings) {
  if (!isObjectRecord(settings) || !Object.hasOwn(settings, 'sort')) {
    return settings;
  }
  const nextSettings = {
    ...settings,
    sorting: Object.hasOwn(settings, 'sorting') ? normalizeSortingValue(settings.sorting) : normalizeSortingValue(settings.sort),
  };
  delete nextSettings.sort;
  return nextSettings;
}

