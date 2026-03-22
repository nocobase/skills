#!/usr/bin/env node

import { recordGroupRoute, reserveGroup } from './opaque_uid.mjs';
import { buildMenuGroupReservationKey, normalizeMenuPlacement } from './spec_contracts.mjs';

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeTreeInput(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (isPlainObject(value) && Array.isArray(value.data)) {
    return value.data;
  }
  return [];
}

export function normalizeMenuPlacementCliOverride(input) {
  const raw = input && typeof input === 'object' ? input : {};
  let mode = normalizeOptionalText(raw.mode ?? raw['menu-mode']) || 'auto';
  const groupTitle = normalizeOptionalText(raw.groupTitle ?? raw['menu-group-title']);
  const existingGroupRouteId = normalizeOptionalText(raw.existingGroupRouteId ?? raw['existing-group-route-id']);
  const existingGroupTitle = normalizeOptionalText(raw.existingGroupTitle ?? raw['existing-group-title']);

  if (!['auto', 'group', 'root'].includes(mode)) {
    mode = 'auto';
  }
  if (mode === 'auto' && (groupTitle || existingGroupRouteId || existingGroupTitle)) {
    mode = 'group';
  }

  return {
    mode,
    groupTitle,
    existingGroupRouteId,
    existingGroupTitle,
  };
}

function hasExplicitMenuPlacementOverride(override) {
  return override.mode !== 'auto'
    || Boolean(override.groupTitle)
    || Boolean(override.existingGroupRouteId)
    || Boolean(override.existingGroupTitle);
}

function buildOverrideMenuPlacement({
  override,
  fallbackGroupTitle,
  sessionId,
}) {
  if (override.mode === 'root') {
    return normalizeMenuPlacement({
      strategy: 'root',
      source: 'explicit',
    }, {
      targetTitle: fallbackGroupTitle,
    });
  }

  if (override.existingGroupRouteId || override.existingGroupTitle) {
    return normalizeMenuPlacement({
      strategy: 'group',
      source: 'explicit-reuse',
      existingGroupRouteId: override.existingGroupRouteId,
      existingGroupTitle: override.existingGroupTitle,
      groupTitle: override.groupTitle,
    }, {
      targetTitle: fallbackGroupTitle,
    });
  }

  const groupTitle = override.groupTitle || fallbackGroupTitle;
  return normalizeMenuPlacement({
    strategy: 'group',
    source: 'explicit',
    groupTitle,
    groupReservationKey: buildMenuGroupReservationKey({
      sessionId,
      groupTitle,
      source: 'explicit',
    }),
  }, {
    targetTitle: groupTitle,
  });
}

export function resolveEffectiveMenuPlacement({
  buildMenuPlacement,
  compileMenuPlacement,
  menuPlacementOverride,
  fallbackGroupTitle = '',
  sessionId,
}) {
  const normalizedOverride = normalizeMenuPlacementCliOverride(menuPlacementOverride);
  let resolved;

  if (hasExplicitMenuPlacementOverride(normalizedOverride)) {
    resolved = buildOverrideMenuPlacement({
      override: normalizedOverride,
      fallbackGroupTitle,
      sessionId,
    });
  } else if (isPlainObject(buildMenuPlacement) && Object.keys(buildMenuPlacement).length > 0) {
    resolved = normalizeMenuPlacement(buildMenuPlacement, {
      targetTitle: fallbackGroupTitle,
    });
  } else if (isPlainObject(compileMenuPlacement) && Object.keys(compileMenuPlacement).length > 0) {
    resolved = normalizeMenuPlacement(compileMenuPlacement, {
      targetTitle: fallbackGroupTitle,
    });
  } else {
    resolved = normalizeMenuPlacement({
      strategy: 'root',
      source: 'auto',
    }, {
      targetTitle: fallbackGroupTitle,
    });
  }

  if (
    resolved.strategy === 'group'
    && resolved.source !== 'explicit-reuse'
    && !normalizeOptionalText(resolved.groupReservationKey)
  ) {
    return {
      ...resolved,
      groupReservationKey: buildMenuGroupReservationKey({
        sessionId,
        groupTitle: resolved.groupTitle || fallbackGroupTitle,
        source: resolved.source || 'auto',
      }),
    };
  }

  return resolved;
}

export function normalizeDesktopRouteWriteResult(payload) {
  let current = payload;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (Array.isArray(current)) {
      return current.find((item) => isPlainObject(item)) || null;
    }
    if (!isPlainObject(current)) {
      return null;
    }
    if ((isPlainObject(current.data) || Array.isArray(current.data)) && !current.id) {
      current = current.data;
      continue;
    }
    return current;
  }
  return null;
}

export function flattenAccessibleRoutes(routeTree) {
  const flattened = [];
  const visit = (items, parent = null, depth = 0) => {
    for (const node of normalizeTreeInput(items)) {
      if (!isPlainObject(node)) {
        continue;
      }
      flattened.push({ node, parent, depth });
      visit(node.children, node, depth + 1);
    }
  };
  visit(routeTree);
  return flattened;
}

export function findAccessibleGroupRoutes(routeTree, match = {}) {
  const routeId = normalizeOptionalText(match.routeId);
  const title = normalizeOptionalText(match.title);
  const schemaUid = normalizeOptionalText(match.schemaUid);
  return flattenAccessibleRoutes(routeTree)
    .map((entry) => entry.node)
    .filter((node) => normalizeOptionalText(node?.type) === 'group')
    .filter((node) => {
      if (routeId) {
        return normalizeOptionalText(String(node?.id ?? '')) === routeId;
      }
      if (schemaUid) {
        return normalizeOptionalText(node?.schemaUid) === schemaUid;
      }
      if (title) {
        return normalizeOptionalText(node?.title) === title;
      }
      return true;
    });
}

export function resolveExplicitGroupRoute({
  routeTree,
  existingGroupRouteId,
  existingGroupTitle,
}) {
  const routeId = normalizeOptionalText(existingGroupRouteId);
  const title = normalizeOptionalText(existingGroupTitle);

  if (routeId) {
    const matches = findAccessibleGroupRoutes(routeTree, { routeId });
    if (matches.length === 0) {
      throw new Error(`existing menu group route "${routeId}" was not found in accessible desktop routes`);
    }
    return matches[0];
  }

  if (!title) {
    throw new Error('existingGroupRouteId or existingGroupTitle is required to reuse a menu group');
  }

  const matches = findAccessibleGroupRoutes(routeTree, { title });
  if (matches.length === 0) {
    throw new Error(`existing menu group title "${title}" was not found in accessible desktop routes`);
  }
  if (matches.length > 1) {
    throw new Error(`existing menu group title "${title}" is ambiguous in accessible desktop routes`);
  }
  return matches[0];
}

export async function resolveMenuParentRoute({
  menuPlacement,
  requestedParentId,
  registryPath,
  sessionId,
  sessionRoot,
  upsertGroupRoute,
  fetchAccessibleTree,
}) {
  const normalizedParentId = normalizeOptionalText(requestedParentId);
  if (!menuPlacement || menuPlacement.strategy === 'root') {
    return {
      pageParentId: normalizedParentId || null,
      groupRoute: null,
      groupUpsertResult: null,
      accessibleTreeResult: null,
    };
  }

  if (menuPlacement.source === 'explicit-reuse') {
    const accessibleTreeResult = await fetchAccessibleTree();
    const groupRoute = resolveExplicitGroupRoute({
      routeTree: accessibleTreeResult?.data ?? accessibleTreeResult,
      existingGroupRouteId: menuPlacement.existingGroupRouteId,
      existingGroupTitle: menuPlacement.existingGroupTitle,
    });
    return {
      pageParentId: normalizeOptionalText(String(groupRoute?.id ?? '')) || null,
      groupRoute,
      groupUpsertResult: null,
      accessibleTreeResult,
    };
  }

  const groupTitle = normalizeOptionalText(menuPlacement.groupTitle);
  const reservationKey = normalizeOptionalText(menuPlacement.groupReservationKey)
    || buildMenuGroupReservationKey({
      sessionId,
      groupTitle,
      source: menuPlacement.source || 'auto',
    });
  const reserved = reserveGroup({
    title: groupTitle,
    reservationKey,
    ...(registryPath ? { registryPath } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(sessionRoot ? { sessionRoot } : {}),
  });

  const groupUpsertResult = await upsertGroupRoute({
    schemaUid: reserved.group.schemaUid,
    title: groupTitle,
    parentId: normalizedParentId || null,
  });
  let accessibleTreeResult = null;
  let persistedRoute = normalizeDesktopRouteWriteResult(groupUpsertResult?.data ?? groupUpsertResult);
  if (!normalizeOptionalText(String(persistedRoute?.id ?? ''))) {
    accessibleTreeResult = await fetchAccessibleTree();
    persistedRoute = findAccessibleGroupRoutes(accessibleTreeResult?.data ?? accessibleTreeResult, {
      schemaUid: reserved.group.schemaUid,
    })[0] || null;
  }

  const routeId = normalizeOptionalText(String(persistedRoute?.id ?? ''));
  if (!routeId) {
    throw new Error(`unable to resolve persisted menu group route id for "${groupTitle}"`);
  }

  const recorded = recordGroupRoute({
    reservationKey,
    routeId,
    title: groupTitle,
    ...(registryPath ? { registryPath } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(sessionRoot ? { sessionRoot } : {}),
  });

  return {
    pageParentId: routeId,
    groupRoute: {
      ...reserved.group,
      ...recorded.group,
      ...(isPlainObject(persistedRoute) ? persistedRoute : {}),
    },
    groupUpsertResult,
    accessibleTreeResult,
  };
}
