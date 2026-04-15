import { isPlainObject } from './utils.js';

const TEMPLATE_DECISION_CONFIG = {
  'selected-reference': {
    mode: 'reference',
    reasons: {
      'standard-reuse': 'standard reuse',
    },
  },
  'selected-copy': {
    mode: 'copy',
    reasons: {
      'local-customization': 'local customization',
    },
  },
  'discovery-only': {
    reasons: {
      'bootstrap-after-first-write':
        'the first repeated scene must be written and saved before later instances can bind it; convert is preferred only when supported',
      'missing-live-context': 'the current opener/host/planning context was insufficient',
      'explicit-template-unavailable': 'the explicit template is unavailable in the current context',
      'multiple-discovered-not-bound': 'multiple templates were discovered but the best candidate was not uniquely resolved',
    },
  },
  'inline-non-template': {
    reasons: {
      'single-occurrence': 'the scene appeared only once in the current task',
      'not-repeat-eligible': 'the scene is too customized or structurally unique for template reuse',
      'no-usable-template': 'no usable template was available',
    },
  },
};

function normalizeText(value) {
  const source = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return source.replace(/\s+/g, ' ').trim();
}

function getTemplateLabel(template) {
  const name = normalizeText(template?.name);
  if (name) return name;
  const uid = normalizeText(template?.uid);
  if (uid) return uid;
  return '';
}

function assertDecisionKind(kind) {
  if (TEMPLATE_DECISION_CONFIG[kind]) return;
  throw new Error(
    `Unsupported template decision kind "${kind}". Expected one of: ${Object.keys(TEMPLATE_DECISION_CONFIG).join(', ')}.`,
  );
}

function assertReasonCode(kind, reasonCode) {
  const reasons = TEMPLATE_DECISION_CONFIG[kind].reasons;
  if (reasons[reasonCode]) return reasons[reasonCode];
  throw new Error(
    `Unsupported reasonCode "${reasonCode}" for "${kind}". Expected one of: ${Object.keys(reasons).join(', ')}.`,
  );
}

function buildSelectedSummary(kind, templateLabel, reasonText) {
  const mode = TEMPLATE_DECISION_CONFIG[kind].mode;
  return `Template ${templateLabel} via ${mode}: ${reasonText}.`;
}

function buildDiscoverySummary(templateLabel, reasonText, discoveredCount) {
  if (templateLabel) return `Template ${templateLabel} stayed discovery-only: ${reasonText}.`;
  if (Number.isInteger(discoveredCount) && discoveredCount > 0) {
    return `${discoveredCount} template(s) stayed discovery-only: ${reasonText}.`;
  }
  return `Template discovery stayed discovery-only: ${reasonText}.`;
}

function buildInlineSummary(templateLabel, reasonText) {
  if (templateLabel) return `Template ${templateLabel} stayed inline/non-template: ${reasonText}.`;
  return `Stayed inline/non-template: ${reasonText}.`;
}

export function summarizeTemplateDecision(decision) {
  if (!isPlainObject(decision)) throw new Error('Template decision must be one object.');

  const kind = normalizeText(decision.kind);
  assertDecisionKind(kind);

  const reasonCode = normalizeText(decision.reasonCode);
  const reason = assertReasonCode(kind, reasonCode);
  const template = isPlainObject(decision.template) ? { ...decision.template } : undefined;
  const templateLabel = getTemplateLabel(template);

  if (kind === 'selected-reference' || kind === 'selected-copy') {
    const uid = normalizeText(template?.uid);
    if (!uid) throw new Error(`Template decision "${kind}" requires template.uid.`);
    const mode = TEMPLATE_DECISION_CONFIG[kind].mode;
    const normalizedTemplate = {
      uid,
      ...(normalizeText(template?.name) ? { name: normalizeText(template.name) } : {}),
      ...(normalizeText(template?.description) ? { description: normalizeText(template.description) } : {}),
    };
    return {
      kind,
      mode,
      template: normalizedTemplate,
      reasonCode,
      reason,
      summary: buildSelectedSummary(kind, getTemplateLabel(normalizedTemplate) || uid, reason),
    };
  }

  const base = {
    kind,
    reasonCode,
    reason,
    summary:
      kind === 'discovery-only'
        ? buildDiscoverySummary(templateLabel, reason, decision.discoveredCount)
        : buildInlineSummary(templateLabel, reason),
  };

  if (templateLabel) {
    base.template = {
      ...(normalizeText(template?.uid) ? { uid: normalizeText(template.uid) } : {}),
      ...(normalizeText(template?.name) ? { name: normalizeText(template.name) } : {}),
      ...(normalizeText(template?.description) ? { description: normalizeText(template.description) } : {}),
    };
  }

  if (kind === 'discovery-only' && Number.isInteger(decision.discoveredCount) && decision.discoveredCount > 0) {
    base.discoveredCount = decision.discoveredCount;
  }

  return base;
}
