import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareApplyBlueprintRequest } from './page-blueprint-prepare.js';
import { resolveMissingCollectionMetadataForBlueprint } from './collection-metadata-resolver.js';
import {
  findPageIdentityByGroupRouteIdAndTitle,
  loadPageIdentityRegistry,
} from '../../scripts/opaque_uid.mjs';

const execFileAsync = promisify(execFile);

function normalizeText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())));
}

function isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractPrepareBlueprint(payload) {
  if (!isObjectRecord(payload)) return payload;
  if (isObjectRecord(payload.blueprint)) return payload.blueprint;
  if (isObjectRecord(payload.requestBody)) return payload.requestBody;
  return payload;
}

function extractPrepareCollectionMetadata(payload) {
  return isObjectRecord(payload) && Object.prototype.hasOwnProperty.call(payload, 'collectionMetadata')
    ? payload.collectionMetadata
    : undefined;
}

function withResolvedCollectionMetadata(payload, metadata) {
  if (!isObjectRecord(payload)) return payload;
  if (Object.prototype.hasOwnProperty.call(payload, 'blueprint') || Object.prototype.hasOwnProperty.call(payload, 'requestBody')) {
    return {
      ...payload,
      collectionMetadata: metadata,
    };
  }
  return {
    blueprint: payload,
    collectionMetadata: metadata,
  };
}

function hasInvalidCollectionMetadataError(errors) {
  return Array.isArray(errors) && errors.some((issue) => issue?.ruleId === 'invalid-collection-metadata');
}

function hasResolvedCollectionMetadata(metadata) {
  return isObjectRecord(metadata?.collections) && Object.keys(metadata.collections).length > 0;
}

function createAutoCollectionMetadataMissingError(resolution) {
  const missingCollections = Array.isArray(resolution?.missingCollections) ? resolution.missingCollections.filter(Boolean) : [];
  const suffix = missingCollections.length > 0 ? ` Missing collections: ${missingCollections.join(', ')}.` : '';
  return {
    path: 'collectionMetadata',
    ruleId: 'missing-collection-metadata',
    message: `collectionMetadata is required for prepare-write when automatic collection metadata resolution cannot complete.${suffix}`,
  };
}

async function execNbText(args, options = {}) {
  const { execFileImpl, cwd = process.cwd() } = options;
  if (!execFileImpl) {
    const result = await execFileAsync('nb', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout || '';
  }
  const result = await execFileImpl('nb', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return typeof result === 'string' ? result : result?.stdout || '';
}

async function execNbJson(args, options = {}) {
  const stdout = await execNbText(args, options);
  return JSON.parse(stdout || '{}');
}

function getPrepareNavigationGroupTitle(payload) {
  const blueprint = extractPrepareBlueprint(payload);
  const group = isObjectRecord(blueprint?.navigation?.group) ? blueprint.navigation.group : null;
  if (!group || normalizeText(group.routeId) || !normalizeText(group.title)) return '';
  return normalizeText(group.title);
}

function groupHasMetadataFields(group) {
  return ['icon', 'tooltip', 'hideInMenu'].some((key) => Object.prototype.hasOwnProperty.call(group, key));
}

function withResolvedNavigationGroup(payload, routeId) {
  if (!isObjectRecord(payload)) return payload;
  const wrappedKey = isObjectRecord(payload.blueprint) ? 'blueprint' : isObjectRecord(payload.requestBody) ? 'requestBody' : '';
  const blueprint = wrappedKey ? payload[wrappedKey] : payload;
  if (!isObjectRecord(blueprint)) return payload;
  const nextBlueprint = {
    ...blueprint,
    navigation: {
      ...(blueprint.navigation || {}),
      group: { routeId },
    },
  };
  return wrappedKey ? { ...payload, [wrappedKey]: nextBlueprint } : nextBlueprint;
}

function extractDesktopRouteRows(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload)) return payload;
  return [];
}

function getPreparePageTitle(payload) {
  const blueprint = extractPrepareBlueprint(payload);
  return normalizeText(
    blueprint?.page?.title
    || blueprint?.navigation?.item?.title
    || blueprint?.target?.pageSchemaUid,
  );
}

function getPreparePageMenuGroupRouteId(payload) {
  const blueprint = extractPrepareBlueprint(payload);
  return normalizeText(blueprint?.navigation?.group?.routeId);
}

function getPreparePageMenuGroupTitle(payload) {
  const blueprint = extractPrepareBlueprint(payload);
  return normalizeText(blueprint?.navigation?.group?.title);
}

async function resolvePageIdentityFromLiveRoutes(payload, options = {}) {
  const title = getPreparePageTitle(payload);
  const groupRouteId = getPreparePageMenuGroupRouteId(payload);
  if (!title || !groupRouteId) {
    return null;
  }

  let rows = [];
  try {
    const response = await execNbJson([
      'api',
      'resource',
      'list',
      '--resource',
      'desktopRoutes',
      '--filter',
      JSON.stringify({ title, type: 'flowPage' }),
      '--fields',
      'id',
      '--fields',
      'title',
      '--fields',
      'type',
      '--fields',
      'schemaUid',
      '--fields',
      'parentId',
      '-j',
    ], options);
    rows = extractDesktopRouteRows(response);
  } catch {
    const pageIdentityRegistryPath = options.registryPath || '';
    if (!pageIdentityRegistryPath) {
      return null;
    }
    const { registry } = loadPageIdentityRegistry(pageIdentityRegistryPath, options);
    const localMatch = findPageIdentityByGroupRouteIdAndTitle(registry, groupRouteId, title);
    if (localMatch) {
      return localMatch;
    }
    return null;
  }

  const matches = rows.filter((row) => normalizeText(row?.title) === title
    && normalizeText(row?.type) === 'flowPage'
    && normalizeText(String(row?.parentId ?? '')) === groupRouteId);

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    return {
      error: {
        path: 'target.pageSchemaUid',
        ruleId: 'page-identity-ambiguous',
        message: `navigation.group.routeId "${groupRouteId}" already has multiple flow pages titled "${title}"; pass target.pageSchemaUid explicitly before applyBlueprint.`,
      },
    };
  }

  const match = matches[0];
  if (!normalizeText(match?.schemaUid)) {
    return {
      error: {
        path: 'target.pageSchemaUid',
        ruleId: 'page-identity-missing-schema-uid',
        message: `Existing flow page "${title}" under navigation.group.routeId "${groupRouteId}" is missing schemaUid; pass target.pageSchemaUid explicitly before applyBlueprint.`,
      },
    };
  }

  return {
    pageSchemaUid: normalizeText(match.schemaUid),
    pageUid: normalizeText(match.id),
    title,
    menuGroupTitle: getPreparePageMenuGroupTitle(payload),
    groupRouteId,
  };
}

async function resolvePrepareNavigationGroup(payload, options = {}) {
  if (options.autoNavigationGroup === false) {
    return { payload, resolverErrors: [] };
  }
  const groupTitle = getPrepareNavigationGroupTitle(payload);
  if (!groupTitle) {
    return { payload, resolverErrors: [] };
  }
  const blueprint = extractPrepareBlueprint(payload);
  const group = blueprint.navigation.group;
  let rows = [];
  try {
    const response = await execNbJson([
      'api',
      'resource',
      'list',
      '--resource',
      'desktopRoutes',
      '--filter',
      JSON.stringify({ title: groupTitle, type: 'group' }),
      '-j',
    ], options);
    rows = extractDesktopRouteRows(response).filter((row) => normalizeText(row?.title) === groupTitle && normalizeText(row?.type) === 'group');
  } catch {
    return { payload, resolverErrors: [] };
  }

  if (rows.length === 0) {
    return { payload, resolverErrors: [] };
  }
  if (rows.length > 1) {
    return {
      payload,
      resolverErrors: [
        {
          path: 'navigation.group.routeId',
          ruleId: 'navigation-group-title-ambiguous',
          message: `navigation.group.title "${groupTitle}" matches ${rows.length} existing menu groups; pass navigation.group.routeId explicitly before applyBlueprint.`,
        },
      ],
    };
  }
  const routeId = rows[0]?.id;
  if (!normalizeText(routeId)) {
    return {
      payload,
      resolverErrors: [
        {
          path: 'navigation.group.routeId',
          ruleId: 'navigation-group-route-id-missing',
          message: `Existing navigation group "${groupTitle}" is missing route id; pass navigation.group.routeId explicitly before applyBlueprint.`,
        },
      ],
    };
  }
  return {
    payload: withResolvedNavigationGroup(payload, routeId),
    resolverErrors: [],
    warnings: groupHasMetadataFields(group)
      ? [`Resolved existing menu group "${groupTitle}" to routeId ${routeId}; group metadata is ignored when reusing an existing group.`]
      : [`Resolved existing menu group "${groupTitle}" to routeId ${routeId}.`],
  };
}

async function resolvePrepareWritePayload(payload, options = {}) {
  if (options.autoCollectionMetadata === false) {
    return {
      payload,
      resolverErrors: [],
    };
  }

  const resolution = await resolveMissingCollectionMetadataForBlueprint(
    extractPrepareBlueprint(payload),
    extractPrepareCollectionMetadata(payload),
    options,
  );
  if (!resolution.ok && !hasInvalidCollectionMetadataError(resolution.errors)) {
    return {
      payload: withResolvedCollectionMetadata(payload, resolution.metadata),
      resolverErrors: hasResolvedCollectionMetadata(resolution.metadata)
        ? [createAutoCollectionMetadataMissingError(resolution)]
        : [],
    };
  }
  return {
    payload: withResolvedCollectionMetadata(payload, resolution.metadata),
    resolverErrors: resolution.errors || [],
  };
}

export async function prepareApplyBlueprintWrite(payload, options = {}) {
  const collectionPreparePayload = await resolvePrepareWritePayload(payload, options);
  const navigationPreparePayload = await resolvePrepareNavigationGroup(collectionPreparePayload.payload, options);
  let writePayload = navigationPreparePayload.payload;
  const draftBlueprint = extractPrepareBlueprint(writePayload);
  const normalizedMode = normalizeText(draftBlueprint?.mode).toLowerCase();
  if (normalizedMode === 'create') {
    const identityResolution = await resolvePageIdentityFromLiveRoutes(writePayload, options);
    if (identityResolution?.error) {
      return {
        ok: false,
        warnings: uniqueStrings([...(Array.isArray(navigationPreparePayload.warnings) ? navigationPreparePayload.warnings : [])]),
        errors: [identityResolution.error],
      };
    }
    if (identityResolution?.pageSchemaUid) {
      const nextBlueprint = {
        ...draftBlueprint,
        mode: 'replace',
        target: {
          pageSchemaUid: identityResolution.pageSchemaUid,
        },
      };
      writePayload = {
        ...writePayload,
        blueprint: nextBlueprint,
      };
    }
  }

  const result = prepareApplyBlueprintRequest(writePayload, options);
  const resolverErrors = [
    ...(collectionPreparePayload.resolverErrors || []),
    ...(navigationPreparePayload.resolverErrors || []),
  ];

  if (navigationPreparePayload.warnings?.length) {
    result.warnings = uniqueStrings([...(Array.isArray(result.warnings) ? result.warnings : []), ...navigationPreparePayload.warnings]);
  }
  if (resolverErrors.length > 0) {
    result.errors = [...resolverErrors, ...(Array.isArray(result.errors) ? result.errors : [])];
    result.ok = false;
    delete result.cliBody;
  }
  return result;
}
