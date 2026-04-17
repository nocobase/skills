export const PAGE_MODEL_USES = ['RootPageModel', 'PageModel', 'ChildPageModel'];
export const PAGE_MODEL_USES_SET = new Set(PAGE_MODEL_USES);

export const PAGE_TAB_USES = ['RootPageTabModel', 'PageTabModel', 'ChildPageTabModel'];
export const PAGE_TAB_USES_SET = new Set(PAGE_TAB_USES);

export const ALLOWED_TAB_USES_BY_PAGE_USE = {
  RootPageModel: ['RootPageTabModel'],
  PageModel: ['RootPageTabModel', 'PageTabModel'],
  ChildPageModel: ['ChildPageTabModel'],
};

export const DEFAULT_TAB_USE_BY_PAGE_USE = {
  RootPageModel: 'RootPageTabModel',
  PageModel: 'RootPageTabModel',
  ChildPageModel: 'ChildPageTabModel',
};

export const FORM_MODES = ['create', 'edit'];
export const FORM_MODES_SET = new Set(FORM_MODES);
export const FORM_USE_BY_MODE = {
  create: 'CreateFormModel',
  edit: 'EditFormModel',
};

export const SUPPORTED_POPUP_PAGE_USES = [...PAGE_MODEL_USES];
export const SUPPORTED_POPUP_PAGE_USES_SET = new Set(SUPPORTED_POPUP_PAGE_USES);
export const DEFAULT_POPUP_PAGE_USE = 'ChildPageModel';

export function normalizeNonEmptyString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export function normalizePageUse(value, label, {
  fallbackValue,
  allowNull = false,
  supportedUses = PAGE_MODEL_USES,
} = {}) {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) {
    if (allowNull) {
      return null;
    }
    if (fallbackValue) {
      return fallbackValue;
    }
    throw new Error(`${label} is required`);
  }
  if (!supportedUses.includes(normalized)) {
    throw new Error(`${label} must be one of ${supportedUses.join(', ')}`);
  }
  return normalized;
}

export function getAllowedTabUsesForPage(pageUse) {
  return ALLOWED_TAB_USES_BY_PAGE_USE[pageUse] ?? PAGE_TAB_USES;
}

export function getDefaultTabUseForPage(pageUse) {
  return DEFAULT_TAB_USE_BY_PAGE_USE[pageUse] ?? DEFAULT_TAB_USE_BY_PAGE_USE.RootPageModel;
}

export function normalizeFormMode(value, label, {
  fallbackValue = 'create',
} = {}) {
  const normalized = normalizeNonEmptyString(value) || fallbackValue;
  if (!FORM_MODES_SET.has(normalized)) {
    throw new Error(`${label} must be one of ${FORM_MODES.join(', ')}`);
  }
  return normalized;
}

export function getFormUseForMode(mode) {
  return FORM_USE_BY_MODE[mode] ?? FORM_USE_BY_MODE.create;
}

export function isPageUse(value) {
  return PAGE_MODEL_USES_SET.has(value);
}

export function isSupportedPopupPageUse(value) {
  return SUPPORTED_POPUP_PAGE_USES_SET.has(value);
}
