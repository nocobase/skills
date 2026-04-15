import { ensureArray, isPlainObject, unique } from './utils.js';
import { summarizeTemplateDecision } from './template-decision-summary.js';

const VALID_TEMPLATE_TYPES = new Set(['popup', 'block']);
const VALID_USAGES = new Set(['block', 'fields']);
const VALID_MODES = new Set(['reference', 'copy']);
const INLINE_REASON_CODES = new Set(['single-occurrence', 'not-repeat-eligible', 'no-usable-template']);
const PROBE_SOURCE = 'nb-template-decision.plan-query';
const PROBE_VERSION = '1';

function normalizeText(value) {
  const source = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return source.replace(/\s+/g, ' ').trim();
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

function splitWords(value) {
  const source = normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_./:-]+/g, ' ');
  if (!source) return [];
  return source.split(/[^\p{L}\p{N}]+/u).map((item) => normalizeText(item)).filter(Boolean);
}

function singularizeWord(word) {
  const normalized = normalizeLowerText(word);
  if (!/^[a-z0-9]+$/.test(normalized)) return [];
  if (normalized.endsWith('ies') && normalized.length > 3) return [`${normalized.slice(0, -3)}y`];
  if (/(xes|zes|ches|shes|sses)$/.test(normalized) && normalized.length > 4) return [normalized.slice(0, -2)];
  if (normalized.endsWith('s') && !normalized.endsWith('ss') && normalized.length > 3) return [normalized.slice(0, -1)];
  return [];
}

function expandSearchTerms(values) {
  const tokens = [];
  for (const value of ensureArray(values)) {
    const source = normalizeText(value);
    if (!source) continue;
    tokens.push(source);
    for (const word of splitWords(source)) {
      const normalized = normalizeLowerText(word);
      if (!normalized) continue;
      tokens.push(normalized);
      tokens.push(...singularizeWord(normalized));
    }
  }
  return unique(tokens.map((item) => normalizeText(item)).filter(Boolean));
}

function relationFieldFromValue(value) {
  const source = normalizeText(value);
  if (!source) return '';
  const segments = source.split(/[./]/).map((item) => normalizeText(item)).filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
}

function normalizeScene(scene) {
  if (!isPlainObject(scene)) return null;
  const context = isPlainObject(scene.context) ? scene.context : {};
  const templateType = normalizeLowerText(scene.templateType || scene.type);
  const usage = normalizeLowerText(scene.usage);
  const fieldPath = normalizeText(context.fieldPath || scene.fieldPath);
  const associationName = normalizeText(context.associationName || scene.associationName);
  const relationField = normalizeText(
    context.relationField ||
      scene.relationField ||
      relationFieldFromValue(fieldPath) ||
      relationFieldFromValue(associationName),
  );

  return {
    templateType,
    usage,
    repeatEligible: Boolean(scene.repeatEligible),
    singleOccurrence: Boolean(scene.singleOccurrence),
    targetUid: normalizeText(scene.targetUid || context.targetUid),
    actionType: normalizeLowerText(scene.actionType || context.actionType),
    actionScope: normalizeLowerText(scene.actionScope || context.actionScope),
    collectionName: normalizeText(context.collectionName || scene.collectionName),
    sourceCollectionName: normalizeText(context.sourceCollectionName || scene.sourceCollectionName),
    associationName,
    fieldPath,
    relationField,
    openerUse: normalizeText(context.openerUse || scene.openerUse),
    searchTerms: expandSearchTerms(scene.searchTerms),
    page: normalizePositiveInteger(scene.page, 1),
    pageSize: normalizePositiveInteger(scene.pageSize, 20),
    inlineReason:
      INLINE_REASON_CODES.has(normalizeLowerText(scene.inlineReason)) ? normalizeLowerText(scene.inlineReason) : '',
  };
}

function normalizeProbeRequestBody(requestBody) {
  if (!isPlainObject(requestBody)) return null;
  const targetUid = normalizeText(requestBody.target?.uid);
  const type = normalizeLowerText(requestBody.type);
  const usage = normalizeLowerText(requestBody.usage);
  const actionType = normalizeLowerText(requestBody.actionType);
  const actionScope = normalizeLowerText(requestBody.actionScope);
  const search = normalizeText(requestBody.search);
  const page = normalizePositiveInteger(requestBody.page, undefined);
  const pageSize = normalizePositiveInteger(requestBody.pageSize, undefined);

  return {
    ...(targetUid ? { target: { uid: targetUid } } : {}),
    ...(type ? { type } : {}),
    ...(usage ? { usage } : {}),
    ...(actionType ? { actionType } : {}),
    ...(actionScope ? { actionScope } : {}),
    ...(search ? { search } : {}),
    ...(typeof page === 'number' ? { page } : {}),
    ...(typeof pageSize === 'number' ? { pageSize } : {}),
  };
}

function normalizeProbe(probeInput) {
  const input = isPlainObject(probeInput?.probe) ? probeInput.probe : probeInput;
  if (!isPlainObject(input)) return null;

  const querySummaryInput = isPlainObject(input.querySummary) ? input.querySummary : {};
  const querySummary = {
    ...(normalizeLowerText(querySummaryInput.templateType) ? { templateType: normalizeLowerText(querySummaryInput.templateType) } : {}),
    ...(normalizeLowerText(querySummaryInput.usage) ? { usage: normalizeLowerText(querySummaryInput.usage) } : {}),
    ...(Object.prototype.hasOwnProperty.call(querySummaryInput, 'repeatEligible')
      ? { repeatEligible: Boolean(querySummaryInput.repeatEligible) }
      : {}),
    ...(normalizeLowerText(querySummaryInput.contextStrength) ? { contextStrength: normalizeLowerText(querySummaryInput.contextStrength) } : {}),
    ...(ensureArray(querySummaryInput.contextReasons).length
      ? {
          contextReasons: unique(ensureArray(querySummaryInput.contextReasons).map((item) => normalizeText(item)).filter(Boolean)),
        }
      : {}),
    ...(expandSearchTerms(querySummaryInput.searchTerms).length
      ? { searchTerms: expandSearchTerms(querySummaryInput.searchTerms) }
      : {}),
  };
  const contextStrength = normalizeLowerText(input.contextStrength || querySummary.contextStrength);
  const requestBody = normalizeProbeRequestBody(input.requestBody);

  return {
    source: normalizeText(input.source),
    version: normalizeText(input.version),
    requestBody,
    querySummary,
    contextStrength,
    isContextualProbe: input.isContextualProbe === true && contextStrength === 'strong',
  };
}

function getSceneContextStrength(scene) {
  if (!scene) return { strength: 'weak', structuralCount: 0, reasons: [] };

  const reasons = [];
  const structuralCount = [
    scene.actionType,
    scene.actionScope,
    scene.collectionName,
    scene.sourceCollectionName,
    scene.associationName,
    scene.fieldPath,
    scene.relationField,
    scene.openerUse,
  ].filter(Boolean).length;

  if (scene.targetUid) reasons.push('live-target');
  if (scene.associationName) reasons.push('association');
  if (scene.fieldPath && (scene.collectionName || scene.sourceCollectionName || scene.relationField)) {
    reasons.push('field-context');
  }
  if (scene.actionType || scene.actionScope) reasons.push('opener-action');
  if (scene.collectionName || scene.sourceCollectionName) reasons.push('collection-context');
  if (scene.openerUse) reasons.push('opener-use');

  const strength =
    scene.targetUid ||
    scene.associationName ||
    (scene.fieldPath && (scene.collectionName || scene.sourceCollectionName || scene.relationField)) ||
    structuralCount >= 2
      ? 'strong'
      : 'weak';

  return {
    strength,
    structuralCount,
    reasons: unique(reasons),
  };
}

function buildDerivedSearchTerms(scene) {
  const contextualValues = [
    scene.collectionName,
    scene.sourceCollectionName,
    scene.associationName,
    scene.fieldPath,
    scene.relationField,
    scene.openerUse,
    scene.actionType,
    scene.actionScope,
    scene.templateType,
    scene.usage,
  ];
  return unique([...scene.searchTerms, ...expandSearchTerms(contextualValues)]);
}

function normalizeCandidate(candidate) {
  if (!isPlainObject(candidate)) return null;
  const associationName = normalizeText(candidate.associationName || candidate.associationPathName);
  const fieldPath = normalizeText(candidate.fieldPath || candidate.associationField || candidate.relationField);
  const relationField = normalizeText(candidate.relationField || candidate.associationField || relationFieldFromValue(fieldPath || associationName));
  const usageCount = Number(candidate.usageCount);
  const normalized = {
    uid: normalizeText(candidate.uid),
    name: normalizeText(candidate.name),
    description: normalizeText(candidate.description),
    type: normalizeLowerText(candidate.type),
    usage: normalizeLowerText(candidate.usage),
    available: candidate.available === true,
    disabledReason: normalizeText(candidate.disabledReason),
    usageCount: Number.isFinite(usageCount) ? usageCount : 0,
    actionType: normalizeLowerText(candidate.actionType),
    actionScope: normalizeLowerText(candidate.actionScope),
    collectionName: normalizeText(candidate.collectionName || candidate.collection),
    sourceCollectionName: normalizeText(candidate.sourceCollectionName || candidate.sourceCollection),
    associationName,
    fieldPath,
    relationField,
    openerUse: normalizeText(candidate.openerUse || candidate.useModel || candidate.use),
  };
  normalized.searchTokens = new Set(
    expandSearchTerms([
      normalized.name,
      normalized.description,
      normalized.collectionName,
      normalized.sourceCollectionName,
      normalized.associationName,
      normalized.fieldPath,
      normalized.relationField,
      normalized.openerUse,
    ]).map((item) => normalizeLowerText(item)),
  );
  return normalized;
}

function presentCandidate(candidate) {
  return {
    uid: candidate.uid,
    ...(candidate.name ? { name: candidate.name } : {}),
    ...(candidate.description ? { description: candidate.description } : {}),
    ...(candidate.type ? { type: candidate.type } : {}),
    ...(candidate.usage ? { usage: candidate.usage } : {}),
    available: candidate.available,
    ...(candidate.disabledReason ? { disabledReason: candidate.disabledReason } : {}),
    ...(candidate.usageCount ? { usageCount: candidate.usageCount } : {}),
    ...(candidate.actionType ? { actionType: candidate.actionType } : {}),
    ...(candidate.actionScope ? { actionScope: candidate.actionScope } : {}),
    ...(candidate.collectionName ? { collectionName: candidate.collectionName } : {}),
    ...(candidate.sourceCollectionName ? { sourceCollectionName: candidate.sourceCollectionName } : {}),
    ...(candidate.associationName ? { associationName: candidate.associationName } : {}),
    ...(candidate.fieldPath ? { fieldPath: candidate.fieldPath } : {}),
    ...(candidate.relationField ? { relationField: candidate.relationField } : {}),
    ...(candidate.openerUse ? { openerUse: candidate.openerUse } : {}),
  };
}

function resolveModePreference(modePreference) {
  const normalized = normalizeLowerText(modePreference);
  return VALID_MODES.has(normalized) ? normalized : 'reference';
}

function normalizeExplicitTemplate(explicitTemplate) {
  if (typeof explicitTemplate === 'string') {
    const value = normalizeText(explicitTemplate);
    return value ? { raw: value } : null;
  }
  if (!isPlainObject(explicitTemplate)) return null;
  const uid = normalizeText(explicitTemplate.uid);
  const name = normalizeText(explicitTemplate.name);
  if (!uid && !name) return null;
  return { ...(uid ? { uid } : {}), ...(name ? { name } : {}) };
}

function getExplicitTemplateSummary(explicitTemplate, matchedCandidate) {
  if (matchedCandidate) {
    return {
      uid: matchedCandidate.uid,
      ...(matchedCandidate.name ? { name: matchedCandidate.name } : {}),
      ...(matchedCandidate.description ? { description: matchedCandidate.description } : {}),
    };
  }
  if (!explicitTemplate) return undefined;
  if (explicitTemplate.uid) return { uid: explicitTemplate.uid };
  if (explicitTemplate.name) return { name: explicitTemplate.name };
  if (explicitTemplate.raw) return { name: explicitTemplate.raw };
  return undefined;
}

function buildSelectedDecision(candidate, mode) {
  return summarizeTemplateDecision({
    kind: mode === 'copy' ? 'selected-copy' : 'selected-reference',
    template: {
      uid: candidate.uid,
      ...(candidate.name ? { name: candidate.name } : {}),
      ...(candidate.description ? { description: candidate.description } : {}),
    },
    reasonCode: mode === 'copy' ? 'local-customization' : 'standard-reuse',
  });
}

function buildDiscoveryDecision(reasonCode, options = {}) {
  return summarizeTemplateDecision({
    kind: 'discovery-only',
    reasonCode,
    ...(options.template ? { template: options.template } : {}),
    ...(typeof options.discoveredCount === 'number' ? { discoveredCount: options.discoveredCount } : {}),
  });
}

function buildInlineDecision(reasonCode, options = {}) {
  return summarizeTemplateDecision({
    kind: 'inline-non-template',
    reasonCode,
    ...(options.template ? { template: options.template } : {}),
  });
}

function matchExplicitTemplate(explicitTemplate, candidates) {
  if (!explicitTemplate) return { matched: null, ambiguous: [] };
  if (explicitTemplate.uid) {
    return {
      matched: candidates.find((candidate) => candidate.uid === explicitTemplate.uid) || null,
      ambiguous: [],
    };
  }
  if (explicitTemplate.raw) {
    const uidMatch = candidates.find((candidate) => candidate.uid === explicitTemplate.raw) || null;
    if (uidMatch) {
      return {
        matched: uidMatch,
        ambiguous: [],
      };
    }
  }
  const explicitName = normalizeText(explicitTemplate.name || explicitTemplate.raw);
  const exactMatches = candidates.filter((candidate) => normalizeLowerText(candidate.name) === normalizeLowerText(explicitName));
  if (exactMatches.length > 1) return { matched: null, ambiguous: exactMatches };
  return { matched: exactMatches[0] || null, ambiguous: [] };
}

function candidateTypeUsageScore(candidate, scene) {
  if (!scene.templateType) return 0;
  let score = candidate.type === scene.templateType ? 1 : 0;
  if (scene.templateType === 'block' && scene.usage) {
    if (candidate.usage === scene.usage) score += 1;
    else score = 0;
  }
  return score;
}

function candidateOpenerScore(candidate, scene) {
  let score = 0;
  if (scene.actionType && candidate.actionType === scene.actionType) score += 1;
  if (scene.actionScope && candidate.actionScope === scene.actionScope) score += 1;
  return score;
}

function candidateRelationScore(candidate, scene) {
  let score = 0;
  if (scene.associationName && candidate.associationName === scene.associationName) score += 2;
  if (scene.fieldPath && candidate.fieldPath === scene.fieldPath) score += 1;
  if (scene.relationField && candidate.relationField === scene.relationField) score += 1;
  return score;
}

function candidateSceneFitScore(candidate, sceneSearchTerms) {
  let score = 0;
  for (const token of sceneSearchTerms) {
    const normalized = normalizeLowerText(token);
    if (!normalized) continue;
    if (candidate.searchTokens.has(normalized)) score += 1;
  }
  return score;
}

function candidateStructureScore(candidate, scene) {
  let score = 0;
  if (scene.collectionName && candidate.collectionName === scene.collectionName) score += 1;
  if (scene.sourceCollectionName && candidate.sourceCollectionName === scene.sourceCollectionName) score += 1;
  if (scene.openerUse && normalizeLowerText(candidate.openerUse) === normalizeLowerText(scene.openerUse)) score += 1;
  return score;
}

function buildScoreVector(candidate, scene, explicitTemplate, sceneSearchTerms) {
  const explicitIdentityScore = explicitTemplate
    ? explicitTemplate.uid
      ? Number(candidate.uid === explicitTemplate.uid)
      : Number(normalizeLowerText(candidate.name) === normalizeLowerText(explicitTemplate.name || explicitTemplate.raw))
    : 0;

  return [
    explicitIdentityScore,
    candidateTypeUsageScore(candidate, scene),
    candidateOpenerScore(candidate, scene),
    candidateRelationScore(candidate, scene),
    candidateSceneFitScore(candidate, sceneSearchTerms),
    candidateStructureScore(candidate, scene),
    candidate.usageCount,
  ];
}

function compareScoreVectors(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) return rightValue - leftValue;
  }
  return 0;
}

function chooseInlineReason(scene) {
  if (scene.inlineReason) return scene.inlineReason;
  if (scene.singleOccurrence) return 'single-occurrence';
  return 'not-repeat-eligible';
}

function validateScene(scene) {
  const errors = [];
  if (!scene) {
    errors.push('Scene must be one object.');
    return errors;
  }
  if (!scene.templateType) {
    errors.push('Scene requires templateType ("popup" or "block").');
  } else if (!VALID_TEMPLATE_TYPES.has(scene.templateType)) {
    errors.push(`Unsupported templateType "${scene.templateType}".`);
  }
  if (scene.templateType === 'block' && scene.usage && !VALID_USAGES.has(scene.usage)) {
    errors.push(`Unsupported block usage "${scene.usage}".`);
  }
  return errors;
}

function validateProbe(probe, scene, { requiresProbe }) {
  if (!requiresProbe) return [];
  if (!probe) {
    return ['Repeat-eligible or explicit-template selection requires one probe from planTemplateQuery(...).'];
  }

  const errors = [];
  if (probe.source !== PROBE_SOURCE) {
    errors.push(`Probe source must be "${PROBE_SOURCE}".`);
  }
  if (probe.version !== PROBE_VERSION) {
    errors.push(`Probe version must be "${PROBE_VERSION}".`);
  }
  if (!probe.requestBody) {
    errors.push('Probe must include one requestBody.');
  }
  if (!isPlainObject(probe.querySummary) || !Object.keys(probe.querySummary).length) {
    errors.push('Probe must include one querySummary.');
  }
  if (probe.requestBody?.type && probe.requestBody.type !== scene.templateType) {
    errors.push(`Probe requestBody.type "${probe.requestBody.type}" does not match scene templateType "${scene.templateType}".`);
  }
  if (probe.querySummary?.templateType && probe.querySummary.templateType !== scene.templateType) {
    errors.push(
      `Probe querySummary.templateType "${probe.querySummary.templateType}" does not match scene templateType "${scene.templateType}".`,
    );
  }
  if (scene.templateType === 'block' && scene.usage) {
    if (probe.requestBody?.usage && probe.requestBody.usage !== scene.usage) {
      errors.push(`Probe requestBody.usage "${probe.requestBody.usage}" does not match scene usage "${scene.usage}".`);
    }
    if (probe.querySummary?.usage && probe.querySummary.usage !== scene.usage) {
      errors.push(`Probe querySummary.usage "${probe.querySummary.usage}" does not match scene usage "${scene.usage}".`);
    }
  }

  return errors;
}

export function planTemplateQuery(sceneInput) {
  const scene = normalizeScene(sceneInput);
  const errors = validateScene(scene);
  if (errors.length) {
    return {
      ok: false,
      requiresContextualProbe: true,
      errors,
      warnings: [],
    };
  }

  const contextStrength = getSceneContextStrength(scene);
  const searchTerms = buildDerivedSearchTerms(scene);
  const requestBody = {
    ...(scene.targetUid ? { target: { uid: scene.targetUid } } : {}),
    type: scene.templateType,
    ...(scene.templateType === 'block' && scene.usage ? { usage: scene.usage } : {}),
    ...(scene.actionType ? { actionType: scene.actionType } : {}),
    ...(scene.actionScope ? { actionScope: scene.actionScope } : {}),
    ...(searchTerms.length ? { search: searchTerms.join(' ') } : {}),
    page: scene.page,
    pageSize: scene.pageSize,
  };
  const querySummary = {
    templateType: scene.templateType,
    ...(scene.usage ? { usage: scene.usage } : {}),
    ...(scene.targetUid ? { targetUid: scene.targetUid } : {}),
    ...(scene.actionType ? { actionType: scene.actionType } : {}),
    ...(scene.actionScope ? { actionScope: scene.actionScope } : {}),
    repeatEligible: scene.repeatEligible,
    contextStrength: contextStrength.strength,
    contextReasons: contextStrength.reasons,
    searchTerms,
  };
  const probe = {
    source: PROBE_SOURCE,
    version: PROBE_VERSION,
    requestBody,
    querySummary,
    contextStrength: contextStrength.strength,
    isContextualProbe: contextStrength.strength === 'strong',
  };

  const warnings = [];
  if (contextStrength.strength !== 'strong') {
    warnings.push(
      'Planning context is still weak; keyword-only search stays discovery-only until the intended opener/host context is stronger.',
    );
  }
  if (!scene.repeatEligible) {
    warnings.push('Scene is not marked repeat-eligible; contextual probing is optional and should not force template binding.');
  }
  if (!searchTerms.length) {
    warnings.push('No search terms were derived; the query will rely only on live target/type/opener filters.');
  }

  return {
    ok: true,
    requiresContextualProbe: scene.repeatEligible,
    requestBody,
    querySummary,
    probe,
    warnings,
    errors: [],
  };
}

export function selectTemplateDecision({
  scene: sceneInput,
  probe: probeInput,
  candidates: candidatesInput,
  modePreference,
  explicitTemplate,
} = {}) {
  const scene = normalizeScene(sceneInput);
  const errors = validateScene(scene);
  if (!Array.isArray(candidatesInput)) errors.push('Candidates must be one array.');
  const probe = normalizeProbe(probeInput);
  if (errors.length) {
    return {
      ok: false,
      errors,
      warnings: [],
    };
  }

  const normalizedCandidates = candidatesInput.map((candidate) => normalizeCandidate(candidate)).filter(Boolean);
  const relevantCandidates = normalizedCandidates.filter((candidate) => {
    if (scene.templateType && candidate.type && candidate.type !== scene.templateType) return false;
    if (scene.templateType === 'block' && scene.usage && candidate.usage && candidate.usage !== scene.usage) return false;
    return true;
  });
  const explicit = normalizeExplicitTemplate(explicitTemplate);
  const explicitMatch = matchExplicitTemplate(explicit, relevantCandidates);

  if (explicitMatch.ambiguous.length) {
    return {
      ok: true,
      outcome: 'needs-user-choice',
      reason: 'ambiguous-explicit-name',
      candidates: explicitMatch.ambiguous.map((candidate) => presentCandidate(candidate)),
      warnings: [],
    };
  }

  if (!scene.repeatEligible && !explicit) {
    return {
      ok: true,
      outcome: 'inline-non-template',
      templateDecision: buildInlineDecision(chooseInlineReason(scene)),
      warnings: [],
    };
  }

  const probeErrors = validateProbe(probe, scene, {
    requiresProbe: Boolean(scene.repeatEligible || explicit),
  });
  if (probeErrors.length) {
    return {
      ok: false,
      errors: probeErrors,
      warnings: [],
    };
  }
  if (!probe?.isContextualProbe) {
    return {
      ok: true,
      outcome: 'discovery-only',
      templateDecision: buildDiscoveryDecision('missing-live-context', {
        ...(getExplicitTemplateSummary(explicit, explicitMatch.matched)
          ? { template: getExplicitTemplateSummary(explicit, explicitMatch.matched) }
          : {}),
        ...(relevantCandidates.length ? { discoveredCount: relevantCandidates.length } : {}),
      }),
      warnings: ['Current probe is not contextual enough for binding; keyword-only search remains discovery-only.'],
    };
  }

  if (explicit) {
    if (!explicitMatch.matched || !explicitMatch.matched.available) {
      return {
        ok: true,
        outcome: 'discovery-only',
        templateDecision: buildDiscoveryDecision('explicit-template-unavailable', {
          ...(getExplicitTemplateSummary(explicit, explicitMatch.matched)
            ? { template: getExplicitTemplateSummary(explicit, explicitMatch.matched) }
            : {}),
        }),
        ...(explicitMatch.matched?.disabledReason ? { disabledReason: explicitMatch.matched.disabledReason } : {}),
        warnings: [],
      };
    }

    const mode = resolveModePreference(modePreference);
    return {
      ok: true,
      outcome: 'selected',
      mode,
      selectedTemplate: presentCandidate(explicitMatch.matched),
      templateDecision: buildSelectedDecision(explicitMatch.matched, mode),
      warnings: [],
    };
  }

  const usableCandidates = relevantCandidates.filter((candidate) => candidate.available === true);
  if (!usableCandidates.length) {
    if (scene.singleOccurrence) {
      return {
        ok: true,
        outcome: 'inline-non-template',
        templateDecision: buildInlineDecision(chooseInlineReason(scene)),
        warnings: [],
      };
    }
    return {
      ok: true,
      outcome: 'discovery-only',
      templateDecision: buildDiscoveryDecision('bootstrap-after-first-write'),
      warnings: [],
    };
  }

  const sceneSearchTerms =
    probe?.querySummary?.searchTerms?.length ? probe.querySummary.searchTerms : buildDerivedSearchTerms(scene);
  const rankedCandidates = usableCandidates
    .map((candidate) => ({
      candidate,
      scoreVector: buildScoreVector(candidate, scene, explicit, sceneSearchTerms),
    }))
    .sort((left, right) => {
      const byScore = compareScoreVectors(left.scoreVector, right.scoreVector);
      if (byScore !== 0) return byScore;
      return left.candidate.uid.localeCompare(right.candidate.uid);
    });

  const best = rankedCandidates[0];
  const mode = resolveModePreference(modePreference);
  return {
    ok: true,
    outcome: 'selected',
    mode,
    selectedTemplate: presentCandidate(best.candidate),
    templateDecision: buildSelectedDecision(best.candidate, mode),
    warnings: [],
  };
}
