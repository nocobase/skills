import { cloneSerializable, ensureArray, isPlainObject } from "./utils.js";
import {
  DESCRIPTION_FIELD_SETTINGS_BLOCK_TYPES,
  FIELD_LINKAGE_REACTION_TYPE,
  getFieldLinkageRuleSemanticKey,
  resolveDescriptionDrivenFieldLinkage,
} from "./description-form-behavior.js";

function normalizeText(value, fallback = "") {
  const source =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const normalized = source.replace(/\s+/g, " ").trim();
  return normalized || fallback;
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

function hasOwn(target, key) {
  return (
    isPlainObject(target) && Object.prototype.hasOwnProperty.call(target, key)
  );
}

function addRuleMergeKeys(rule, keySet, semanticSet) {
  const key = normalizeText(rule?.key);
  if (key) keySet.add(key);
  const semanticKey = getFieldLinkageRuleSemanticKey(rule);
  if (semanticKey) semanticSet.add(semanticKey);
}

function hasRuleMergeConflict(rule, keySet, semanticSet) {
  const key = normalizeText(rule?.key);
  if (key && keySet.has(key)) return true;
  const semanticKey = getFieldLinkageRuleSemanticKey(rule);
  return !!semanticKey && semanticSet.has(semanticKey);
}

function buildScopedKey(scopePrefix, localKey) {
  return scopePrefix ? `${scopePrefix}.${localKey}` : localKey;
}

function countItemsByTarget(itemsByTarget) {
  let count = 0;
  for (const rules of itemsByTarget.values()) {
    count += ensureArray(rules).length;
  }
  return count;
}

function resolveUniqueLocalKey(rawValue, fallback, usedKeys) {
  const explicit = normalizeText(rawValue);
  const baseKey = explicit || normalizeApplyBlueprintToken(fallback, fallback);
  if (!usedKeys.has(baseKey)) {
    usedKeys.add(baseKey);
    return {
      key: baseKey,
      explicit: !!explicit,
    };
  }
  if (explicit) {
    return {
      key: baseKey,
      explicit: true,
    };
  }
  let suffix = 2;
  let candidate = `${baseKey}_${suffix}`;
  while (usedKeys.has(candidate)) {
    suffix += 1;
    candidate = `${baseKey}_${suffix}`;
  }
  usedKeys.add(candidate);
  return {
    key: candidate,
    explicit: false,
  };
}

function resolveTabLocalKey(tab, index, usedKeys) {
  const fallback = normalizeText(tab?.title) || `tab_${index + 1}`;
  return resolveUniqueLocalKey(tab?.key, fallback, usedKeys);
}

function resolveBlockLocalKey(block, index, usedKeys) {
  return resolveUniqueLocalKey(
    block?.key,
    normalizeText(block?.type) || `block_${index + 1}`,
    usedKeys,
  );
}

function resolveActionLocalKey(action, index, usedKeys) {
  const type = normalizeText(action?.type) || "action";
  return resolveUniqueLocalKey(action?.key, `${type}_${index + 1}`, usedKeys);
}

function resolveFieldReactionHostLocalKey(field, index, usedKeys) {
  if (!isPlainObject(field)) return null;
  const explicitKey = normalizeText(field.key);
  if (explicitKey) {
    usedKeys.add(explicitKey);
    return { key: explicitKey, explicit: true };
  }
  const fieldPath = normalizeText(field.field);
  if (fieldPath) {
    return resolveUniqueLocalKey(
      undefined,
      normalizeApplyBlueprintToken(fieldPath, `field_${index + 1}`),
      usedKeys,
    );
  }
  return resolveUniqueLocalKey(field.key, `field_${index + 1}`, usedKeys);
}

function materializeGeneratedKey(node, localKeyInfo) {
  if (
    isPlainObject(node) &&
    !localKeyInfo.explicit &&
    !normalizeText(node.key)
  ) {
    node.key = localKeyInfo.key;
  }
}

function replaceFieldsLayoutKey(block, oldKey, newKey) {
  const fromKey = normalizeText(oldKey);
  const toKey = normalizeText(newKey);
  if (
    !isPlainObject(block?.fieldsLayout) ||
    !fromKey ||
    !toKey ||
    fromKey === toKey
  ) {
    return;
  }
  for (const row of ensureArray(block.fieldsLayout.rows)) {
    if (!Array.isArray(row)) continue;
    for (const [cellIndex, cell] of row.entries()) {
      if (typeof cell === "string") {
        if (normalizeText(cell) === fromKey) {
          row[cellIndex] = toKey;
        }
        continue;
      }
      if (isPlainObject(cell) && normalizeText(cell.key) === fromKey) {
        cell.key = toKey;
      }
    }
  }
}

export function getFieldEntryPathForDescription(field) {
  if (typeof field === "string") return normalizeText(field);
  if (!isPlainObject(field)) return "";
  return normalizeText(field.field);
}

function hasExplicitFieldStateSetting(field, state) {
  if (!isPlainObject(field) || !isPlainObject(field.settings)) return false;
  if (state === "required") return hasOwn(field.settings, "required");
  if (state === "disabled") return hasOwn(field.settings, "disabled");
  if (state === "hidden") return hasOwn(field.settings, "hidden");
  return false;
}

function getFieldEntriesFromBlock(block, options = {}) {
  if (typeof options.getBlockFieldEntries === "function") {
    return options.getBlockFieldEntries(block);
  }
  if (!isPlainObject(block)) return [];
  if (Array.isArray(block.fieldGroups)) {
    return ensureArray(block.fieldGroups).flatMap((group) =>
      ensureArray(group?.fields),
    );
  }
  return ensureArray(block.fields);
}

function forEachFieldGroup(fieldGroups, visitor, options = {}) {
  if (typeof options.forEachFieldGroup === "function") {
    options.forEachFieldGroup(fieldGroups, visitor);
    return;
  }
  for (const [index, group] of ensureArray(fieldGroups).entries()) {
    if (isPlainObject(group)) visitor(group, index);
  }
}

function collectDescriptionDrivenFieldLinkageRulesFromItems(
  items,
  options = {},
) {
  const rules = [];
  for (const field of ensureArray(items)) {
    const fieldPath = getFieldEntryPathForDescription(field);
    if (!fieldPath) continue;
    const fieldMeta = options.resolveFieldMetadata?.(fieldPath, options);
    const linkage = resolveDescriptionDrivenFieldLinkage(fieldMeta, {
      ...options,
      fieldName: fieldPath,
    });
    if (
      !linkage ||
      hasExplicitFieldStateSetting(field, linkage.then?.[0]?.state)
    ) {
      continue;
    }
    rules.push(linkage);
  }
  return rules;
}

function collectDescriptionDrivenFieldLinkageRulesFromBlock(
  block,
  target,
  options = {},
) {
  if (
    !target ||
    !DESCRIPTION_FIELD_SETTINGS_BLOCK_TYPES.has(normalizeText(block?.type))
  ) {
    return [];
  }

  const availableFieldNames = getFieldEntriesFromBlock(block, options)
    .map((field) => getFieldEntryPathForDescription(field))
    .filter(Boolean);
  const rules = [
    ...collectDescriptionDrivenFieldLinkageRulesFromItems(block.fields, {
      ...options,
      availableFieldNames,
    }),
  ];
  forEachFieldGroup(
    block.fieldGroups,
    (group) => {
      rules.push(
        ...collectDescriptionDrivenFieldLinkageRulesFromItems(group.fields, {
          ...options,
          availableFieldNames,
        }),
      );
    },
    options,
  );
  return rules;
}

function appendDescriptionDrivenFieldLinkageRules(
  itemsByTarget,
  target,
  block,
  options,
) {
  const rules = collectDescriptionDrivenFieldLinkageRulesFromBlock(
    block,
    target,
    options,
  );
  if (!rules.length) return;
  const existing = itemsByTarget.get(target) || [];
  existing.push(...rules);
  itemsByTarget.set(target, existing);
}

function collectDescriptionDrivenFieldLinkageItemsFromPopup(
  popup,
  popupTarget,
  parentContext,
  options,
  itemsByTarget,
) {
  if (!isPlainObject(popup) || !Array.isArray(popup.blocks)) return;
  const usedBlockKeys = new Set();
  for (const [blockIndex, block] of ensureArray(popup.blocks).entries()) {
    if (!isPlainObject(block)) continue;
    const blockInfo = resolveBlockLocalKey(block, blockIndex, usedBlockKeys);
    const beforeCount = countItemsByTarget(itemsByTarget);
    const blockContext = options.buildBlockTraversalContext?.(
      block,
      parentContext || {},
      options.collectionMetadata || {},
    );
    collectDescriptionDrivenFieldLinkageItemsFromBlock(
      block,
      buildScopedKey(popupTarget, blockInfo.key),
      blockContext || parentContext || {},
      options,
      itemsByTarget,
    );
    if (countItemsByTarget(itemsByTarget) > beforeCount) {
      materializeGeneratedKey(block, blockInfo);
    }
  }
}

function collectDescriptionDrivenFieldLinkageItemsFromActionPopups(
  block,
  blockTarget,
  blockContext,
  slotName,
  options,
  itemsByTarget,
) {
  const usedActionKeys = new Set();
  for (const [actionIndex, action] of ensureArray(block[slotName]).entries()) {
    if (!isPlainObject(action) || !isPlainObject(action.popup)) continue;
    const actionInfo = resolveActionLocalKey(action, actionIndex, usedActionKeys);
    const beforeCount = countItemsByTarget(itemsByTarget);
    collectDescriptionDrivenFieldLinkageItemsFromPopup(
      action.popup,
      buildScopedKey(blockTarget, `${slotName}.${actionInfo.key}`),
      blockContext,
      options,
      itemsByTarget,
    );
    if (countItemsByTarget(itemsByTarget) > beforeCount) {
      materializeGeneratedKey(action, actionInfo);
    }
  }
}

function collectDescriptionDrivenFieldLinkageItemsFromFieldPopups(
  fields,
  hostBlock,
  blockTarget,
  blockContext,
  options,
  itemsByTarget,
) {
  const usedFieldKeys = new Set();
  for (const [fieldIndex, field] of ensureArray(fields).entries()) {
    if (!isPlainObject(field) || !isPlainObject(field.popup)) continue;
    const fieldInfo = resolveFieldReactionHostLocalKey(
      field,
      fieldIndex,
      usedFieldKeys,
    );
    if (!fieldInfo) continue;
    const beforeCount = countItemsByTarget(itemsByTarget);
    const fieldsLayoutKey = getFieldEntryPathForDescription(field);
    const popupBlockContext = options.getRelationFieldPopupBlockContext?.(field, {
      ...options,
      blockContext,
    });
    collectDescriptionDrivenFieldLinkageItemsFromPopup(
      field.popup,
      buildScopedKey(blockTarget, `fields.${fieldInfo.key}`),
      popupBlockContext || blockContext,
      options,
      itemsByTarget,
    );
    if (countItemsByTarget(itemsByTarget) > beforeCount) {
      materializeGeneratedKey(field, fieldInfo);
      replaceFieldsLayoutKey(hostBlock, fieldsLayoutKey, fieldInfo.key);
    }
  }
}

function collectDescriptionDrivenFieldLinkageItemsFromBlockFieldPopups(
  block,
  blockTarget,
  blockContext,
  options,
  itemsByTarget,
) {
  collectDescriptionDrivenFieldLinkageItemsFromFieldPopups(
    block.fields,
    block,
    blockTarget,
    blockContext,
    options,
    itemsByTarget,
  );
  forEachFieldGroup(
    block.fieldGroups,
    (group) => {
      collectDescriptionDrivenFieldLinkageItemsFromFieldPopups(
        group.fields,
        block,
        blockTarget,
        blockContext,
        options,
        itemsByTarget,
      );
    },
    options,
  );
}

function collectDescriptionDrivenFieldLinkageItemsFromBlock(
  block,
  target,
  blockContext,
  options,
  itemsByTarget,
) {
  appendDescriptionDrivenFieldLinkageRules(itemsByTarget, target, block, {
    ...options,
    hostBlock: block,
    blockContext,
  });

  collectDescriptionDrivenFieldLinkageItemsFromActionPopups(
    block,
    target,
    blockContext,
    "actions",
    options,
    itemsByTarget,
  );
  collectDescriptionDrivenFieldLinkageItemsFromActionPopups(
    block,
    target,
    blockContext,
    "recordActions",
    options,
    itemsByTarget,
  );
  collectDescriptionDrivenFieldLinkageItemsFromBlockFieldPopups(
    block,
    target,
    blockContext,
    options,
    itemsByTarget,
  );
  if (isPlainObject(block.popup)) {
    collectDescriptionDrivenFieldLinkageItemsFromPopup(
      block.popup,
      buildScopedKey(target, "popup"),
      blockContext,
      options,
      itemsByTarget,
    );
  }
  options.forEachBlockHiddenPopup?.(block.settings, block, (popup, { key }) => {
    collectDescriptionDrivenFieldLinkageItemsFromPopup(
      popup,
      buildScopedKey(target, `settings.${key}`),
      blockContext,
      options,
      itemsByTarget,
    );
  });
}

export function collectDescriptionDrivenFieldLinkageItems(
  blueprint,
  options = {},
) {
  if (!isPlainObject(options.collectionMetadata)) return [];
  const itemsByTarget = new Map();
  const usedTabKeys = new Set();

  for (const [tabIndex, tab] of ensureArray(blueprint?.tabs).entries()) {
    if (!isPlainObject(tab)) continue;
    const tabInfo = resolveTabLocalKey(tab, tabIndex, usedTabKeys);
    const beforeTabCount = countItemsByTarget(itemsByTarget);
    const usedBlockKeys = new Set();
    for (const [blockIndex, block] of ensureArray(tab.blocks).entries()) {
      if (!isPlainObject(block)) continue;
      const blockInfo = resolveBlockLocalKey(block, blockIndex, usedBlockKeys);
      const beforeBlockCount = countItemsByTarget(itemsByTarget);
      const blockContext = options.buildBlockTraversalContext?.(
        block,
        {},
        options.collectionMetadata || {},
      );
      collectDescriptionDrivenFieldLinkageItemsFromBlock(
        block,
        buildScopedKey(tabInfo.key, blockInfo.key),
        blockContext || {},
        options,
        itemsByTarget,
      );
      if (countItemsByTarget(itemsByTarget) > beforeBlockCount) {
        materializeGeneratedKey(block, blockInfo);
      }
    }
    if (countItemsByTarget(itemsByTarget) > beforeTabCount) {
      materializeGeneratedKey(tab, tabInfo);
    }
  }

  return Array.from(itemsByTarget.entries()).map(([target, rules]) => ({
    type: FIELD_LINKAGE_REACTION_TYPE,
    target,
    rules,
  }));
}

export function mergeDescriptionDrivenFieldLinkageItems(
  blueprint,
  generatedItems,
) {
  if (!generatedItems.length) return blueprint;
  if (hasOwn(blueprint, "reaction") && !isPlainObject(blueprint.reaction)) {
    return blueprint;
  }
  if (
    isPlainObject(blueprint.reaction) &&
    hasOwn(blueprint.reaction, "items") &&
    !Array.isArray(blueprint.reaction.items)
  ) {
    return blueprint;
  }

  const reaction = isPlainObject(blueprint.reaction)
    ? { ...blueprint.reaction }
    : {};
  const items = Array.isArray(reaction.items)
    ? reaction.items.map((item) => cloneSerializable(item))
    : [];
  for (const generatedItem of generatedItems) {
    const existingItem = items.find(
      (item) =>
        isPlainObject(item) &&
        normalizeText(item.type) === FIELD_LINKAGE_REACTION_TYPE &&
        normalizeText(item.target) === normalizeText(generatedItem.target),
    );
    if (!existingItem) {
      items.push(generatedItem);
      continue;
    }
    if (hasOwn(existingItem, "rules") && !Array.isArray(existingItem.rules)) {
      continue;
    }
    if (Array.isArray(existingItem.rules) && existingItem.rules.length === 0) {
      continue;
    }
    const existingRuleKeys = new Set();
    const existingRuleSemantics = new Set();
    for (const rule of ensureArray(existingItem.rules)) {
      addRuleMergeKeys(rule, existingRuleKeys, existingRuleSemantics);
    }
    existingItem.rules = [
      ...ensureArray(existingItem.rules),
      ...ensureArray(generatedItem.rules).filter((rule) => {
        if (hasRuleMergeConflict(rule, existingRuleKeys, existingRuleSemantics)) {
          return false;
        }
        addRuleMergeKeys(rule, existingRuleKeys, existingRuleSemantics);
        return true;
      }),
    ];
  }
  reaction.items = items;
  blueprint.reaction = reaction;
  return blueprint;
}
