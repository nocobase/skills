import { cloneSerializable, ensureArray, isPlainObject } from "./utils.js";
import { getPublicCollectionMeta } from "./public-block-contract.js";

export const FIELD_LINKAGE_REACTION_TYPE = "setFieldLinkageRules";
export const DESCRIPTION_FIELD_SETTINGS_BLOCK_TYPES = new Set([
  "createForm",
  "editForm",
  "filterForm",
]);

const CJK_TEXT_PATTERN = /[\u3400-\u9fff]/;

function normalizeText(value, fallback = "") {
  const source =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const normalized = source.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizeLooseText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_\-.,;:，。；：、()（）"'“”‘’[\]{}<>《》]+/g, "");
}

function escapeRegExp(value) {
  return normalizeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasOwn(target, key) {
  return (
    isPlainObject(target) && Object.prototype.hasOwnProperty.call(target, key)
  );
}

function normalizeApplyBlueprintToken(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .replace(/[.[\](){}]+/g, "_")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function normalizePrimitiveText(value) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }
  return "";
}

function normalizeComparableText(value) {
  return normalizeLooseText(value);
}

function getOptionRawValue(option) {
  if (!isPlainObject(option)) return option;
  for (const key of ["value", "name", "key", "id"]) {
    if (typeof option[key] !== "undefined" && option[key] !== null) {
      return option[key];
    }
  }
  return undefined;
}

function getOptionLabels(option, rawValue) {
  if (!isPlainObject(option)) {
    return [normalizePrimitiveText(option)].filter(Boolean);
  }
  return [
    option.label,
    option.title,
    option.name,
    option.text,
    option.uiSchema?.title,
    rawValue,
  ]
    .map((value) => normalizePrimitiveText(value))
    .filter(Boolean);
}

function collectOptionEntries(source, output = []) {
  for (const option of ensureArray(source)) {
    if (
      typeof option !== "string" &&
      typeof option !== "number" &&
      typeof option !== "boolean" &&
      !isPlainObject(option)
    ) {
      continue;
    }
    const rawValue = getOptionRawValue(option);
    const value =
      typeof rawValue === "undefined" || rawValue === null ? option : rawValue;
    const labels = getOptionLabels(option, value);
    if (labels.length) {
      output.push({ value, labels });
    }
    if (isPlainObject(option)) {
      collectOptionEntries(option.children, output);
      collectOptionEntries(option.options, output);
    }
  }
  return output;
}

function getFieldOptionEntries(fieldMeta) {
  if (!isPlainObject(fieldMeta)) return [];
  const sources = [
    fieldMeta.options,
    fieldMeta.options?.options,
    fieldMeta.uiSchema?.enum,
    fieldMeta.uiSchema?.["x-component-props"]?.options,
    fieldMeta.uiSchema?.["x-component-props"]?.dataSource,
    fieldMeta.uiSchema?.["x-component-props"]?.treeData,
  ];
  return sources.flatMap((source) => collectOptionEntries(source));
}

function matchConditionOptionValue(text, fieldMeta) {
  const normalized = normalizeComparableText(text);
  if (!normalized) return undefined;
  const candidates = getFieldOptionEntries(fieldMeta)
    .flatMap((entry) =>
      entry.labels.map((label) => ({
        value: entry.value,
        label,
        normalizedLabel: normalizeComparableText(label),
      })),
    )
    .filter((entry) => entry.normalizedLabel)
    .sort(
      (left, right) =>
        right.normalizedLabel.length - left.normalizedLabel.length,
    );
  for (const candidate of candidates) {
    if (normalized.includes(candidate.normalizedLabel)) {
      return candidate.value;
    }
  }
  return undefined;
}

function normalizeRuleValue(value) {
  if (typeof value === "undefined") return "__undefined__";
  return value;
}

export function getFieldLinkageRuleSemanticKey(rule) {
  if (!isPlainObject(rule)) return "";
  const conditionItems = ensureArray(rule.when?.items)
    .filter((item) => isPlainObject(item))
    .map((item) => ({
      path: normalizeText(item.path),
      operator: normalizeText(item.operator),
      value: normalizeRuleValue(item.value),
    }))
    .filter((item) => item.path && item.operator)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const stateActions = ensureArray(rule.then)
    .filter((action) => isPlainObject(action))
    .map((action) => ({
      type: normalizeText(action.type),
      state: normalizeText(action.state),
      fieldPaths: ensureArray(action.fieldPaths || action.fieldPath)
        .map((fieldPath) => normalizeText(fieldPath))
        .filter(Boolean)
        .sort(),
    }))
    .filter(
      (action) =>
        action.type === "setFieldState" &&
        action.state &&
        action.fieldPaths.length,
    )
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (!conditionItems.length || !stateActions.length) return "";
  return JSON.stringify({
    when: conditionItems,
    then: stateActions,
  });
}

export function getFieldDescriptionText(fieldMeta) {
  if (!isPlainObject(fieldMeta)) return "";
  return (
    normalizeText(fieldMeta.description) ||
    normalizeText(fieldMeta.options?.description) ||
    normalizeText(fieldMeta.uiSchema?.description)
  );
}

function getStructuredDescriptionBehaviorHint(fieldMeta, options = {}) {
  const candidates = [
    options.descriptionBehavior,
    fieldMeta?.descriptionBehavior,
    fieldMeta?.options?.descriptionBehavior,
    fieldMeta?.uiSchema?.descriptionBehavior,
    fieldMeta?.options?.uiSchema?.descriptionBehavior,
  ];
  for (const candidate of candidates) {
    if (!isPlainObject(candidate)) continue;
    if (isPlainObject(candidate.settings) || isPlainObject(candidate.linkage)) {
      const output = {};
      if (isPlainObject(candidate.settings)) {
        output.settings = cloneSerializable(candidate.settings);
      }
      if (isPlainObject(candidate.linkage)) {
        output.linkage = cloneSerializable(candidate.linkage);
      }
      return output;
    }
    if (isPlainObject(candidate.when) && Array.isArray(candidate.then)) {
      return { linkage: cloneSerializable(candidate) };
    }
    const settings = {};
    for (const key of ["required", "rules", "maxCount", "extra", "tooltip"]) {
      if (hasOwn(candidate, key)) {
        settings[key] = cloneSerializable(candidate[key]);
      }
    }
    if (Object.keys(settings).length) {
      return { settings };
    }
  }
  return null;
}

function getDescriptionRequiredHint(description) {
  const compact = normalizeLooseText(description);
  if (!compact) return undefined;
  if (
    compact.includes("notrequired") ||
    compact.includes("optional") ||
    compact.includes("nonrequired") ||
    compact.includes("notmandatory") ||
    compact.includes("非必填") ||
    compact.includes("无需必填") ||
    compact.includes("不必填") ||
    compact.includes("不是必填") ||
    compact.includes("可选") ||
    compact.includes("选填")
  ) {
    return false;
  }
  if (
    compact.includes("required") ||
    compact.includes("mandatory") ||
    compact.includes("mustfill") ||
    compact.includes("mustprovide") ||
    compact.includes("必填") ||
    compact.includes("必录") ||
    compact.includes("必须填写") ||
    compact.includes("必须提供") ||
    compact.includes("不能为空") ||
    compact.includes("不可为空")
  ) {
    return true;
  }
  return undefined;
}

function getDescriptionRuleMessage(description, matchedText) {
  const message = normalizeText(matchedText) || normalizeText(description);
  if (!message) return undefined;
  if (/[。.!！?？]$/.test(message)) return message;
  return CJK_TEXT_PATTERN.test(message) ? `${message}。` : `${message}.`;
}

function appendDerivedValidationRule(rules, rule, description, matchedText) {
  const nextRule = Object.fromEntries(
    Object.entries({
      ...rule,
      message:
        rule.message || getDescriptionRuleMessage(description, matchedText),
    }).filter(([, value]) => typeof value !== "undefined"),
  );
  if (!Object.keys(nextRule).length) return;
  const fingerprint = JSON.stringify(nextRule);
  if (
    rules.some((existingRule) => JSON.stringify(existingRule) === fingerprint)
  ) {
    return;
  }
  rules.push(nextRule);
}

function isDescriptionTextField(fieldMeta) {
  const fieldInterface = normalizeText(fieldMeta?.interface);
  const fieldType = normalizeText(fieldMeta?.type);
  return (
    fieldType === "string" ||
    fieldType === "text" ||
    [
      "input",
      "textarea",
      "richText",
      "markdown",
      "email",
      "phone",
      "url",
    ].includes(fieldInterface)
  );
}

function isDescriptionNumericField(fieldMeta) {
  const fieldInterface = normalizeText(fieldMeta?.interface);
  const fieldType = normalizeText(fieldMeta?.type);
  return (
    ["integer", "bigInt", "float", "double", "decimal", "number"].includes(
      fieldType,
    ) ||
    [
      "integer",
      "number",
      "percent",
      "float",
      "double",
      "decimal",
      "slider",
      "rate",
    ].includes(fieldInterface)
  );
}

function isDescriptionMultiValueField(fieldMeta) {
  const fieldInterface = normalizeText(fieldMeta?.interface);
  const fieldType = normalizeText(fieldMeta?.type);
  return (
    ["array", "hasMany", "belongsToMany"].includes(fieldType) ||
    [
      "m2m",
      "o2m",
      "obo",
      "checkboxGroup",
      "multipleSelect",
      "multiSelect",
      "attachment",
      "file",
    ].includes(fieldInterface)
  );
}

function parseIntegerDescriptionConstraint(description, patterns) {
  for (const pattern of patterns) {
    const match = normalizeText(description).match(pattern);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (!Number.isSafeInteger(value) || value < 0) continue;
    return { value, matchedText: match[0] };
  }
  return null;
}

function parseNumberDescriptionConstraint(description, patterns) {
  for (const pattern of patterns) {
    const match = normalizeText(description).match(pattern);
    if (!match) continue;
    const value = Number.parseFloat(match[1]);
    if (!Number.isFinite(value)) continue;
    return { value, matchedText: match[0] };
  }
  return null;
}

function deriveTextDescriptionValidationRules(fieldMeta, description) {
  if (!isDescriptionTextField(fieldMeta)) return [];
  const rules = [];
  const max = parseIntegerDescriptionConstraint(description, [
    /(?:最多|不超过|不得超过|上限|最大)\s*(\d+)\s*(?:个)?\s*(?:字符|字|位|长度)/i,
    /\b(?:max(?:imum)?|at most|up to|no more than)\s*(\d+)\s*(?:characters?|chars?|letters?)\b/i,
  ]);
  if (max) {
    appendDerivedValidationRule(
      rules,
      { max: max.value },
      description,
      max.matchedText,
    );
  }
  const min = parseIntegerDescriptionConstraint(description, [
    /(?:至少|不少于|最少|最小)\s*(\d+)\s*(?:个)?\s*(?:字符|字|位|长度)/i,
    /\b(?:min(?:imum)?|at least|no fewer than)\s*(\d+)\s*(?:characters?|chars?|letters?)\b/i,
  ]);
  if (min) {
    appendDerivedValidationRule(
      rules,
      { min: min.value },
      description,
      min.matchedText,
    );
  }
  const len = parseIntegerDescriptionConstraint(description, [
    /(?:必须|需|需要|固定|正好|恰好)\s*(\d+)\s*(?:个)?\s*(?:字符|字|位|长度)/i,
    /\b(?:exactly|must be)\s*(\d+)\s*(?:characters?|chars?|letters?)\b/i,
  ]);
  if (len && !max && !min) {
    appendDerivedValidationRule(
      rules,
      { len: len.value },
      description,
      len.matchedText,
    );
  }
  return rules;
}

function deriveNumericDescriptionValidationRules(fieldMeta, description) {
  if (!isDescriptionNumericField(fieldMeta)) return [];
  const rules = [];
  const minimum = parseNumberDescriptionConstraint(description, [
    /(?:大于等于|不小于|不少于|至少|最小值?|>=|≥)\s*(-?\d+(?:\.\d+)?)/i,
    /\b(?:minimum|min|at least|greater than or equal to)\s*(-?\d+(?:\.\d+)?)\b/i,
  ]);
  if (minimum) {
    appendDerivedValidationRule(
      rules,
      { minimum: minimum.value },
      description,
      minimum.matchedText,
    );
  }
  const maximum = parseNumberDescriptionConstraint(description, [
    /(?:小于等于|不大于|不超过|至多|最多|最大值?|<=|≤)\s*(-?\d+(?:\.\d+)?)/i,
    /\b(?:maximum|max|at most|no more than|less than or equal to)\s*(-?\d+(?:\.\d+)?)\b/i,
  ]);
  if (maximum) {
    appendDerivedValidationRule(
      rules,
      { maximum: maximum.value },
      description,
      maximum.matchedText,
    );
  }
  return rules;
}

function deriveRegexDescriptionValidationRules(description) {
  const normalized = normalizeText(description);
  if (!/(正则|regex|pattern|匹配)/i.test(normalized)) return [];
  const match = normalized.match(/\/((?:\\\/|[^/])+)\/[gimsuy]*/);
  if (!match?.[1]) return [];
  return [
    {
      pattern: match[1],
      message: getDescriptionRuleMessage(description, match[0]),
    },
  ];
}

function deriveMaxCountDescriptionSetting(fieldMeta, description) {
  if (!isDescriptionMultiValueField(fieldMeta)) return undefined;
  const maxCount = parseIntegerDescriptionConstraint(description, [
    /(?:最多|不超过|不得超过|至多|上限|最大)\s*(\d+)\s*(?:个|项|条|件)?/i,
    /\b(?:at most|up to|no more than|max(?:imum)?)\s*(\d+)\s*(?:items?|files?|records?|choices?)?\b/i,
  ]);
  return maxCount?.value;
}

function deriveDescriptionValidationRules(fieldMeta, description) {
  return [
    ...deriveTextDescriptionValidationRules(fieldMeta, description),
    ...deriveNumericDescriptionValidationRules(fieldMeta, description),
    ...deriveRegexDescriptionValidationRules(description),
  ];
}

function isNoStructuredDescriptionBehaviorText(description) {
  const normalized = normalizeLooseText(description);
  if (!normalized) return false;
  return (
    normalized.includes("由ai自动生成") ||
    normalized.includes("ai自动生成") ||
    normalized.includes("自动生成") ||
    normalized.includes("autogenerated") ||
    normalized.includes("generatedbyai") ||
    normalized.includes("automaticallygenerated")
  );
}

function hasFieldDescriptionBehavior(description) {
  return (
    typeof getDescriptionRequiredHint(description) === "boolean" ||
    !!normalizeText(description)
  );
}

function getDescriptionStateKeyword(description) {
  const normalized = normalizeLooseText(description);
  if (!normalized) return "";
  if (
    normalized.includes("notrequired") ||
    normalized.includes("nonrequired") ||
    normalized.includes("notmandatory") ||
    normalized.includes("nonmandatory") ||
    normalized.includes("optional") ||
    normalized.includes("非必填") ||
    normalized.includes("无需必填") ||
    normalized.includes("不必填") ||
    normalized.includes("不是必填") ||
    normalized.includes("可选") ||
    normalized.includes("选填")
  ) {
    return "notRequired";
  }
  if (
    normalized.includes("required") ||
    normalized.includes("mandatory") ||
    normalized.includes("mustfill") ||
    normalized.includes("mustprovide") ||
    normalized.includes("必填") ||
    normalized.includes("必录") ||
    normalized.includes("必须填写") ||
    normalized.includes("必须提供") ||
    normalized.includes("不能为空") ||
    normalized.includes("不可为空")
  ) {
    return "required";
  }
  if (
    normalized.includes("disabled") ||
    normalized.includes("禁用") ||
    normalized.includes("不可编辑") ||
    normalized.includes("只读")
  ) {
    return "disabled";
  }
  if (normalized.includes("hidden") || normalized.includes("隐藏")) {
    return "hidden";
  }
  return "";
}

function getDescriptionConditionFieldName(
  description,
  collectionMeta,
  currentFieldName,
) {
  const normalized = normalizeLooseText(description);
  if (!normalized) return "";
  const candidateNames = ensureArray(collectionMeta?.fields)
    .map((field) => normalizeText(field?.name))
    .filter((fieldName) => fieldName && fieldName !== currentFieldName)
    .sort((left, right) => right.length - left.length);
  for (const candidateName of candidateNames) {
    if (normalized.includes(normalizeLooseText(candidateName))) {
      return candidateName;
    }
  }
  return "";
}

function hasDescriptionConditionCue(description) {
  const normalized = normalizeText(description);
  if (!normalized) return false;
  return (
    /\b(?:when|whenever|if|provided\s+that|while)\b/i.test(normalized) ||
    /(?:^|[\s,，。；;、])(?:当|如果|若|仅当)/.test(normalized) ||
    /(?:为|是|等于|=|:|：)\s*[^，。,；;]*时/.test(normalized)
  );
}

function collectLinkageConditionFieldNames(condition, output) {
  if (!isPlainObject(condition)) return;
  const path = normalizeText(condition.path);
  if (path.startsWith("formValues.")) {
    const fieldName = normalizeText(path.slice("formValues.".length));
    if (fieldName) output.add(fieldName);
  }
  for (const item of ensureArray(condition.items)) {
    collectLinkageConditionFieldNames(item, output);
  }
}

function getLinkageConditionFieldNames(linkage) {
  const fieldNames = new Set();
  collectLinkageConditionFieldNames(linkage?.when, fieldNames);
  return Array.from(fieldNames);
}

function getLinkageTargetFieldNames(linkage) {
  return ensureArray(linkage?.then)
    .filter((action) => isPlainObject(action))
    .flatMap((action) =>
      ensureArray(action.fieldPaths || action.fieldPath)
        .map((fieldPath) => normalizeText(fieldPath))
        .filter(Boolean),
    );
}

function isLinkageWithinAvailableFields(linkage, availableFieldNames) {
  if (!availableFieldNames.size) return true;
  const conditionFieldNames = getLinkageConditionFieldNames(linkage);
  if (
    conditionFieldNames.some(
      (fieldName) => !availableFieldNames.has(fieldName),
    )
  ) {
    return false;
  }
  return getLinkageTargetFieldNames(linkage).every((fieldName) =>
    availableFieldNames.has(fieldName),
  );
}

function parseDescriptionConditionValue(
  conditionText,
  conditionFieldName = "",
  options = {},
) {
  const normalized = normalizeText(conditionText);
  if (!normalized) {
    return { operator: "", value: undefined };
  }

  const fieldName = normalizeText(conditionFieldName);
  let workingText = normalized;
  if (fieldName) {
    const fieldPattern = new RegExp(
      `(?:^|[\\s,，。；;:：()（）\\[\\]{}、])(?:when|if|当|如果|若|如)?\\s*${escapeRegExp(fieldName)}\\s*`,
      "i",
    );
    const fieldMatch = workingText.match(fieldPattern);
    if (fieldMatch) {
      workingText = workingText.slice(
        (fieldMatch.index || 0) + fieldMatch[0].length,
      );
    }
  }

  workingText = normalizeText(workingText);
  if (!workingText) {
    return { operator: "", value: undefined };
  }
  workingText = workingText.replace(/^[\s,，。；;:：()（）\[\]{}、]+/, "");
  workingText = workingText.replace(
    /^(?:is|equals?|equal(?:\s+to)?|becomes|为|是|等于|=|:|：)\s*/i,
    "",
  );

  const optionValue = matchConditionOptionValue(
    workingText,
    options.conditionFieldMeta,
  );
  if (typeof optionValue !== "undefined") {
    return { operator: "$eq", value: optionValue };
  }

  const compact = normalizeLooseText(workingText);
  if (
    compact.includes("notempty") ||
    compact.includes("hasvalue") ||
    compact.includes("不为空") ||
    compact.includes("有值") ||
    compact.includes("已填")
  ) {
    return { operator: "$notEmpty", value: null };
  }
  if (
    compact.includes("empty") ||
    compact.includes("isempty") ||
    compact.includes("notfilled") ||
    compact.includes("blank") ||
    compact.includes("为空") ||
    compact.includes("未填") ||
    compact.includes("无值")
  ) {
    return { operator: "$empty", value: null };
  }

  const quotedValueMatch = workingText.match(
    /^[`"'“”‘’]([^`"'“”‘’]+)[`"'“”‘’]/i,
  );
  const unquotedValueMatch = quotedValueMatch
    ? null
    : workingText.match(/^([^\s，。,；;:：]+)/i);
  const valueMatch = quotedValueMatch || unquotedValueMatch;
  if (!valueMatch) {
    return { operator: "", value: undefined };
  }

  const rawValue = normalizeText(valueMatch[1]);
  if (!rawValue) {
    return { operator: "", value: undefined };
  }
  const rawOptionValue = matchConditionOptionValue(
    rawValue,
    options.conditionFieldMeta,
  );
  if (typeof rawOptionValue !== "undefined") {
    return { operator: "$eq", value: rawOptionValue };
  }
  if (/^(true|false)$/i.test(rawValue)) {
    return { operator: "$eq", value: rawValue.toLowerCase() === "true" };
  }
  if (/^(yes|no)$/i.test(rawValue)) {
    return { operator: "$eq", value: rawValue.toLowerCase() === "yes" };
  }
  return { operator: "$eq", value: rawValue };
}

export function resolveDescriptionDrivenFieldLinkage(fieldMeta, options = {}) {
  const structuredBehavior = getStructuredDescriptionBehaviorHint(
    fieldMeta,
    options,
  );
  if (isPlainObject(structuredBehavior?.linkage)) {
    const linkage = cloneSerializable(structuredBehavior.linkage);
    const availableFieldNames = new Set(
      ensureArray(options.availableFieldNames)
        .map((fieldName) => normalizeText(fieldName))
        .filter(Boolean),
    );
    if (!isLinkageWithinAvailableFields(linkage, availableFieldNames)) {
      return null;
    }
    return linkage;
  }

  const description = getFieldDescriptionText(fieldMeta);
  if (!description || !hasDescriptionConditionCue(description)) return null;
  const state = getDescriptionStateKeyword(description);
  if (!["required", "disabled", "hidden"].includes(state)) return null;
  const collectionName =
    normalizeText(options.collectionName) ||
    normalizeText(options.blockContext?.surfaceCollection) ||
    normalizeText(options.blockContext?.directCollection);
  const collectionMeta = getPublicCollectionMeta(
    options.collectionMetadata || {},
    collectionName,
  );
  if (!collectionMeta) return null;
  const currentFieldName = normalizeText(options.fieldName);
  const conditionFieldName = getDescriptionConditionFieldName(
    description,
    collectionMeta,
    currentFieldName,
  );
  if (!conditionFieldName) return null;
  const conditionFieldMeta =
    ensureArray(collectionMeta.fields).find(
      (field) => normalizeText(field?.name) === conditionFieldName,
    ) || null;
  const availableFieldNames = new Set(
    ensureArray(options.availableFieldNames)
      .map((fieldName) => normalizeText(fieldName))
      .filter(Boolean),
  );
  if (
    availableFieldNames.size > 0 &&
    !availableFieldNames.has(conditionFieldName)
  ) {
    return null;
  }

  const parsedCondition = parseDescriptionConditionValue(
    description,
    conditionFieldName,
    {
      conditionFieldMeta,
    },
  );
  if (!parsedCondition.operator) {
    return null;
  }

  return {
    key: `description-${normalizeApplyBlueprintToken(currentFieldName || "field")}-${normalizeApplyBlueprintToken(conditionFieldName)}-${state}`,
    when: {
      logic: "$and",
      items: [
        {
          path: `formValues.${conditionFieldName}`,
          operator: parsedCondition.operator,
          ...(typeof parsedCondition.value === "undefined"
            ? {}
            : { value: parsedCondition.value }),
        },
      ],
    },
    then: [
      {
        type: "setFieldState",
        fieldPaths: [currentFieldName],
        state,
      },
    ],
  };
}

export function deriveDescriptionFieldBehavior(fieldMeta, options = {}) {
  const structuredBehavior = getStructuredDescriptionBehaviorHint(
    fieldMeta,
    options,
  );
  const description = getFieldDescriptionText(fieldMeta);
  if (!description && !structuredBehavior) {
    return {
      description,
      settings: {},
      linkage: null,
    };
  }
  const hasConditionCue = hasDescriptionConditionCue(description);
  const requiredHint = hasConditionCue
    ? undefined
    : getDescriptionRequiredHint(description);
  const derivedRules = deriveDescriptionValidationRules(fieldMeta, description);
  const derivedMaxCount = deriveMaxCountDescriptionSetting(
    fieldMeta,
    description,
  );
  const noStructuredBehavior =
    options.emptyWhenNoStructuredDescriptionBehavior === true &&
    !structuredBehavior &&
    isNoStructuredDescriptionBehaviorText(description) &&
    typeof requiredHint === "undefined" &&
    !hasConditionCue &&
    derivedRules.length === 0 &&
    typeof derivedMaxCount === "undefined";
  if (noStructuredBehavior) {
    return {
      description,
      settings: {},
      linkage: null,
    };
  }
  const settings = isPlainObject(structuredBehavior?.settings)
    ? cloneSerializable(structuredBehavior.settings)
    : {};
  if (!hasOwn(settings, "required")) {
    if (requiredHint === true) {
      settings.required = true;
    }
  }
  if (
    !hasOwn(settings, "extra") &&
    !hasOwn(settings, "tooltip") &&
    description
  ) {
    settings.extra = description;
  }
  if (!hasOwn(settings, "rules")) {
    if (derivedRules.length) {
      settings.rules = derivedRules;
    }
  }
  if (!hasOwn(settings, "maxCount")) {
    if (typeof derivedMaxCount !== "undefined") {
      settings.maxCount = derivedMaxCount;
    }
  }
  const currentFieldName = normalizeText(options.fieldName);
  return {
    description,
    settings,
    linkage: resolveDescriptionDrivenFieldLinkage(fieldMeta, {
      ...options,
      fieldName: currentFieldName,
    }),
  };
}

export function isFormFieldDescriptionSettingsHost(options = {}) {
  return DESCRIPTION_FIELD_SETTINGS_BLOCK_TYPES.has(
    normalizeText(options.hostBlock?.type),
  );
}

export function applyFieldDescriptionSettings(field, fieldMeta, options = {}) {
  if (!isFormFieldDescriptionSettingsHost(options)) return field;
  const description = getFieldDescriptionText(fieldMeta);
  const behaviorSettings = isPlainObject(options.descriptionBehavior?.settings)
    ? options.descriptionBehavior.settings
    : {};
  if (
    Object.keys(behaviorSettings).length === 0 &&
    (!description || !hasFieldDescriptionBehavior(description))
  ) {
    return field;
  }

  const nextField = isPlainObject(field)
    ? cloneSerializable(field)
    : { field: normalizeText(field) };
  const currentSettings = isPlainObject(nextField.settings)
    ? nextField.settings
    : {};
  const nextSettings = { ...currentSettings };
  for (const [key, value] of Object.entries(behaviorSettings)) {
    if (key === "extra") {
      if (!hasOwn(nextSettings, "extra") && !hasOwn(nextSettings, "tooltip")) {
        nextSettings.extra = value;
      }
      continue;
    }
    if (key === "rules") {
      if (
        !hasOwn(nextSettings, "rules") &&
        Array.isArray(value) &&
        value.length
      ) {
        nextSettings.rules = cloneSerializable(value);
      }
      continue;
    }
    if (!hasOwn(nextSettings, key)) {
      nextSettings[key] = cloneSerializable(value);
    }
  }
  if (Object.keys(nextSettings).length > 0) {
    nextField.settings = nextSettings;
  }
  return nextField;
}
