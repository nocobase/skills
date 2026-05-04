import { ensureArray, isPlainObject } from './utils.js';

function defaultNormalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function hasTemplateDocument(template, normalizeText = defaultNormalizeText) {
  return !!normalizeText(template?.uid);
}

export function collectPopupDocumentContractIssues(popup, path, { normalizeText = defaultNormalizeText } = {}) {
  const issues = [];
  const push = (issuePath, ruleId, message) => {
    issues.push({ path: issuePath, ruleId, message });
  };

  if (!isPlainObject(popup)) {
    push(path, 'invalid-popup', 'Popup must be one object.');
    return issues;
  }

  if (Object.hasOwn(popup, 'tryTemplate') && typeof popup.tryTemplate !== 'boolean') {
    push(`${path}.tryTemplate`, 'invalid-popup-try-template', 'popup.tryTemplate must stay a boolean when present.');
  }

  const hasSaveAsTemplate = Object.hasOwn(popup, 'saveAsTemplate');
  if (hasSaveAsTemplate && !isPlainObject(popup.saveAsTemplate)) {
    push(`${path}.saveAsTemplate`, 'invalid-popup-save-as-template', 'popup.saveAsTemplate must stay one object when present.');
  }
  if (isPlainObject(popup.saveAsTemplate) && !normalizeText(popup.saveAsTemplate.name)) {
    push(`${path}.saveAsTemplate.name`, 'invalid-popup-save-as-template-name', 'popup.saveAsTemplate.name must stay a non-empty string.');
  }
  if (isPlainObject(popup.saveAsTemplate) && !normalizeText(popup.saveAsTemplate.description)) {
    push(
      `${path}.saveAsTemplate.description`,
      'invalid-popup-save-as-template-description',
      'popup.saveAsTemplate.description must stay a non-empty string.',
    );
  }
  if (hasSaveAsTemplate && hasTemplateDocument(popup.template, normalizeText)) {
    push(`${path}.saveAsTemplate`, 'conflicting-popup-save-as-template', 'popup.saveAsTemplate cannot be combined with popup.template.');
  }
  if (hasSaveAsTemplate && ensureArray(popup.blocks).length === 0 && popup.tryTemplate !== true) {
    push(`${path}.saveAsTemplate`, 'popup-save-as-template-missing-blocks', 'popup.saveAsTemplate requires explicit local popup.blocks.');
  }

  if (hasTemplateDocument(popup.template, normalizeText)) {
    return issues;
  }

  if (Object.hasOwn(popup, 'layout') && !isPlainObject(popup.layout)) {
    push(`${path}.layout`, 'invalid-layout-object', 'layout must stay one object when present on a popup document.');
  }

  if (Object.hasOwn(popup, 'blocks') && !Array.isArray(popup.blocks)) {
    push(`${path}.blocks`, 'invalid-popup-blocks', 'Popup blocks must stay one array when present.');
  }

  return issues;
}
