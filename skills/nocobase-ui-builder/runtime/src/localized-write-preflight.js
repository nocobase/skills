import {
  DEFAULT_AUDIT_MODE,
  auditPayload,
  canonicalizePayload,
  extractRequiredMetadata,
} from '../../scripts/flow_payload_guard.mjs';

const LOCALIZED_WRITE_OPERATIONS = new Set(['add-block', 'add-blocks', 'compose']);
const PUBLIC_MAIN_BLOCK_SECTION_RULES = {
  calendar: [
    {
      slot: 'fields',
      code: 'CALENDAR_MAIN_FIELDS_UNSUPPORTED',
      message: 'calendar does not support fields[] on the main block; add event fields under the quick-create or event-view popup host instead',
    },
    {
      slot: 'fieldGroups',
      code: 'CALENDAR_MAIN_FIELD_GROUPS_UNSUPPORTED',
      message: 'calendar does not support fieldGroups[] on the main block; add grouped fields under the quick-create or event-view popup host instead',
    },
    {
      slot: 'recordActions',
      code: 'CALENDAR_MAIN_RECORD_ACTIONS_UNSUPPORTED',
      message: 'calendar does not support recordActions[] on the main block; configure event actions inside the event-view popup host instead',
    },
  ],
  kanban: [
    {
      slot: 'fieldGroups',
      code: 'KANBAN_MAIN_FIELD_GROUPS_UNSUPPORTED',
      message: 'kanban does not support fieldGroups[] on the main block; add card fields directly under fields[] instead',
    },
    {
      slot: 'recordActions',
      code: 'KANBAN_MAIN_RECORD_ACTIONS_UNSUPPORTED',
      message: 'kanban does not support recordActions[] on the main block; configure block actions only in v1',
    },
    {
      slot: 'fieldsLayout',
      code: 'KANBAN_MAIN_FIELDS_LAYOUT_UNSUPPORTED',
      message: 'kanban does not support fieldsLayout on the main block',
    },
  ],
};

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeOperation(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!LOCALIZED_WRITE_OPERATIONS.has(normalized)) {
    throw new Error(`Unsupported localized write operation "${value}". Expected one of: add-block, add-blocks, compose.`);
  }
  return normalized;
}

function normalizeBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Localized write preflight requires one object body.');
  }
  return value;
}

function normalizeMetadata(value) {
  if (typeof value === 'undefined' || value === null) {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('collectionMetadata must be one object when provided.');
  }
  return value;
}

function toKebabCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toRuleId(finding) {
  if (finding?.code === 'REQUIRED_COLLECTION_METADATA_MISSING') {
    return 'missing-collection-metadata';
  }
  return toKebabCase(finding?.code || 'unknown-preflight-issue') || 'unknown-preflight-issue';
}

function summarizeCollectionRefs(requiredMetadata) {
  const uniqueNames = [...new Set((requiredMetadata?.collectionRefs || []).map((item) => normalizeText(item.collectionName)).filter(Boolean))];
  return uniqueNames.sort();
}

function collectLocalizedCollectionRefs(payload) {
  const refs = [];
  const seen = new Set();

  const push = (collectionName, path) => {
    const normalizedName = normalizeText(collectionName);
    if (!normalizedName) return;
    const dedupeKey = `${normalizedName}:${path}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    refs.push({
      collectionName: normalizedName,
      path,
      reason: 'localized-public-resource',
    });
  };

  const visitBlock = (block, path) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return;
    }
    push(block?.resource?.collectionName, `${path}.resource.collectionName`);
    push(block?.resourceInit?.collectionName, `${path}.resourceInit.collectionName`);
    if (Array.isArray(block.blocks)) {
      block.blocks.forEach((child, index) => visitBlock(child, `${path}.blocks[${index}]`));
    }
    if (Array.isArray(block.popup?.blocks)) {
      block.popup.blocks.forEach((child, index) => visitBlock(child, `${path}.popup.blocks[${index}]`));
    }
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
  } else {
    visitBlock(payload, '$');
  }

  return refs;
}

function summarizeSurfaceFacts(payload) {
  const blockTypes = [];
  const directBlockTypes = [];

  const visitBlock = (block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return;
    }
    const type = normalizeText(block.type);
    if (type) {
      blockTypes.push(type);
      if (!block.template) {
        directBlockTypes.push(type);
      }
    }
    if (Array.isArray(block.blocks)) {
      block.blocks.forEach(visitBlock);
    }
    if (Array.isArray(block.popup?.blocks)) {
      block.popup.blocks.forEach(visitBlock);
    }
    ['actions', 'recordActions', 'fields', 'fieldGroups'].forEach((slot) => {
      const items = Array.isArray(block[slot]) ? block[slot] : [];
      items.forEach((item) => {
        if (Array.isArray(item?.fields)) {
          item.fields.forEach(visitBlock);
        }
        if (Array.isArray(item?.popup?.blocks)) {
          item.popup.blocks.forEach(visitBlock);
        }
      });
    });
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach(visitBlock);
  } else if (payload && typeof payload === 'object' && !Array.isArray(payload) && (payload.type || payload.template)) {
    visitBlock(payload);
  }

  return {
    blockTypes: [...new Set(blockTypes)],
    directBlockTypes: [...new Set(directBlockTypes)],
  };
}

function normalizeFinding(finding) {
  return {
    path: finding?.path || '$',
    ruleId: toRuleId(finding),
    message: finding?.message || 'Unknown preflight issue.',
    ...(finding?.code ? { code: finding.code } : {}),
    ...(finding?.details ? { details: finding.details } : {}),
  };
}

function collectLocalizedMainBlockSectionErrors(payload) {
  const errors = [];

  const visitBlock = (block, path) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return;
    }

    const type = normalizeText(block.type);
    if (type && !block.template && PUBLIC_MAIN_BLOCK_SECTION_RULES[type]) {
      for (const rule of PUBLIC_MAIN_BLOCK_SECTION_RULES[type]) {
        if (rule.slot === 'fieldsLayout') {
          if (typeof block.fieldsLayout !== 'undefined') {
            errors.push({
              path: `${path}.fieldsLayout`,
              ruleId: toRuleId({ code: rule.code }),
              message: rule.message,
              code: rule.code,
            });
          }
          continue;
        }

        if (Array.isArray(block[rule.slot]) && block[rule.slot].length > 0) {
          errors.push({
            path: `${path}.${rule.slot}`,
            ruleId: toRuleId({ code: rule.code }),
            message: rule.message,
            code: rule.code,
          });
        }
      }
    }

    if (Array.isArray(block.blocks)) {
      block.blocks.forEach((child, index) => visitBlock(child, `${path}.blocks[${index}]`));
    }
    if (Array.isArray(block.popup?.blocks)) {
      block.popup.blocks.forEach((child, index) => visitBlock(child, `${path}.popup.blocks[${index}]`));
    }
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
    return errors;
  }

  visitBlock(payload, '$');
  return errors;
}

export function runLocalizedWritePreflight({
  operation,
  body,
  collectionMetadata,
  mode = DEFAULT_AUDIT_MODE,
  requirements = {},
  riskAccept = [],
  snapshotPath,
} = {}) {
  const normalizedOperation = normalizeOperation(operation);
  const normalizedBody = normalizeBody(body);
  const normalizedMetadata = normalizeMetadata(collectionMetadata);
  const extractedMetadata = extractRequiredMetadata({
    payload: normalizedBody,
    metadata: normalizedMetadata,
  });
  const localizedCollectionRefs = collectLocalizedCollectionRefs(normalizedBody);
  const requiredMetadata = {
    ...extractedMetadata,
    collectionRefs: [...(extractedMetadata.collectionRefs || []), ...localizedCollectionRefs],
  };

  const canonicalize = canonicalizePayload({
    payload: normalizedBody,
    metadata: normalizedMetadata,
    mode,
    snapshotPath,
  });
  const cliBody = canonicalize.payload;
  const audit = auditPayload({
    payload: cliBody,
    metadata: normalizedMetadata,
    mode,
    requirements,
    riskAccept,
    snapshotPath,
  });
  const errors = [];
  const errorSeen = new Set();
  const pushError = (issue) => {
    const key = `${issue.path}:${issue.ruleId}:${issue.message}`;
    if (errorSeen.has(key)) return;
    errorSeen.add(key);
    errors.push(issue);
  };
  requiredMetadata.collectionRefs
    .filter((item) => !normalizedMetadata.collections?.[item.collectionName])
    .forEach((item) => {
      pushError({
        path: item.path,
        ruleId: 'missing-collection-metadata',
        message: `collectionMetadata is required for collection "${item.collectionName}" before this localized write.`,
        code: 'REQUIRED_COLLECTION_METADATA_MISSING',
        details: item,
      });
    });
  collectLocalizedMainBlockSectionErrors(cliBody).forEach(pushError);
  audit.blockers.map(normalizeFinding).forEach(pushError);

  return {
    ok: errors.length === 0,
    operation: normalizedOperation,
    errors,
    warnings: audit.warnings.map(normalizeFinding),
    facts: {
      mode,
      operation: normalizedOperation,
      requiredCollections: summarizeCollectionRefs(requiredMetadata),
      metadataCollectionCount: audit.metadataCoverage?.collectionCount || 0,
      requiredCollectionCount: audit.metadataCoverage?.requiredCollectionCount || 0,
      canonicalizeChanged: (canonicalize.transforms || []).length > 0,
      canonicalizeTransformCodes: (canonicalize.transforms || []).map((item) => item.code),
      canonicalizeUnresolvedCodes: (canonicalize.unresolved || []).map((item) => item.code),
      ...summarizeSurfaceFacts(cliBody),
    },
    cliBody,
  };
}
