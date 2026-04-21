import { stableOpaqueId } from './opaque_uid.mjs';

const MENU_PLACEMENT_STRATEGIES = new Set(['root', 'group']);
const MENU_PLACEMENT_SOURCES = new Set(['auto', 'explicit', 'explicit-reuse']);

function normalizeNonEmpty(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildMenuGroupReservationKey({
  sessionId,
  groupTitle,
  source = 'auto',
}) {
  return stableOpaqueId(
    'menu-group-reservation',
    `${normalizeNonEmpty(sessionId, 'session id')}|${normalizeNonEmpty(groupTitle, 'group title')}|${normalizeOptionalText(source) || 'auto'}`,
  );
}

export function normalizeMenuPlacement(input, options = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const targetTitle = normalizeOptionalText(options.targetTitle);
  const strategy = MENU_PLACEMENT_STRATEGIES.has(normalizeOptionalText(raw.strategy))
    ? normalizeOptionalText(raw.strategy)
    : 'root';
  const sourceCandidate = normalizeOptionalText(raw.source) || 'auto';
  const source = MENU_PLACEMENT_SOURCES.has(sourceCandidate) ? sourceCandidate : 'auto';

  if (strategy === 'root') {
    return {
      strategy: 'root',
      source: source === 'explicit' ? 'explicit' : 'auto',
      groupTitle: '',
      groupReservationKey: '',
      existingGroupRouteId: '',
      existingGroupTitle: '',
    };
  }

  const existingGroupRouteId = normalizeOptionalText(raw.existingGroupRouteId);
  const existingGroupTitle = normalizeOptionalText(raw.existingGroupTitle);
  const groupTitle = normalizeOptionalText(raw.groupTitle) || (source === 'explicit-reuse' ? '' : targetTitle);
  const groupReservationKey = normalizeOptionalText(raw.groupReservationKey);

  if (source === 'explicit-reuse' && !existingGroupRouteId && !existingGroupTitle) {
    throw new Error('target.menuPlacement requires existingGroupRouteId or existingGroupTitle when source is explicit-reuse');
  }
  if (source !== 'explicit-reuse' && !groupTitle) {
    throw new Error('target.menuPlacement.groupTitle must not be empty when strategy is group');
  }

  return {
    strategy: 'group',
    source,
    groupTitle,
    groupReservationKey,
    existingGroupRouteId,
    existingGroupTitle,
  };
}
