const EVENT_FLOW_ALLOWED_ROOTS = Object.freeze([
  'acl',
  'auth',
  'console',
  'dataSourceManager',
  'date',
  'dayjs',
  'engine',
  'getVar',
  'importAsync',
  'initResource',
  'libs',
  'logger',
  'makeResource',
  'message',
  'modal',
  'model',
  'notification',
  'record',
  'React',
  'ReactDOM',
  'request',
  'requireAsync',
  'resource',
  'role',
  'runAction',
  't',
  'user',
  'viewer',
]);

const LINKAGE_ALLOWED_MODEL_USES = Object.freeze([
  'JSEditableFieldModel',
  'JSItemModel',
  'JSRecordActionModel',
  'JSCollectionActionModel',
  'JSItemActionModel',
  'FormJSFieldItemModel',
]);

const VALUE_ALLOWED_MODEL_USES = Object.freeze([
  'JSEditableFieldModel',
  'JSItemModel',
  'FormJSFieldItemModel',
]);

export const RUNJS_RENDER_MODEL_USES = Object.freeze([
  'JSBlockModel',
  'JSColumnModel',
  'JSFieldModel',
  'JSItemModel',
  'JSEditableFieldModel',
  'FormJSFieldItemModel',
]);

export const RUNJS_ACTION_MODEL_USES = Object.freeze([
  'JSActionModel',
  'JSFormActionModel',
  'JSRecordActionModel',
  'JSCollectionActionModel',
  'JSItemActionModel',
  'FilterFormJSActionModel',
]);

export const RUNJS_SURFACE_POLICIES = Object.freeze({
  'event-flow.execute-javascript': Object.freeze({
    effectStyle: 'action',
    fallbackRuntimeModel: 'JSActionModel',
    allowedModelUses: Object.freeze(['JSActionModel']),
    extraAllowedRoots: EVENT_FLOW_ALLOWED_ROOTS,
    suppressExplicitRenderRequirement: false,
    explicitModelLabel: '',
    requiresExplicitModel: false,
  }),
  'linkage.execute-javascript': Object.freeze({
    effectStyle: 'action',
    fallbackRuntimeModel: 'JSFormActionModel',
    allowedModelUses: LINKAGE_ALLOWED_MODEL_USES,
    extraAllowedRoots: Object.freeze([]),
    suppressExplicitRenderRequirement: true,
    explicitModelLabel: '',
    requiresExplicitModel: false,
  }),
  'reaction.value-runjs': Object.freeze({
    effectStyle: 'value',
    fallbackRuntimeModel: 'JSEditableFieldModel',
    allowedModelUses: VALUE_ALLOWED_MODEL_USES,
    extraAllowedRoots: Object.freeze([]),
    suppressExplicitRenderRequirement: true,
    explicitModelLabel: '',
    requiresExplicitModel: false,
  }),
  'custom-variable.runjs': Object.freeze({
    effectStyle: 'value',
    fallbackRuntimeModel: 'JSEditableFieldModel',
    allowedModelUses: VALUE_ALLOWED_MODEL_USES,
    extraAllowedRoots: Object.freeze([]),
    suppressExplicitRenderRequirement: true,
    explicitModelLabel: '',
    requiresExplicitModel: false,
  }),
  'js-model.render': Object.freeze({
    effectStyle: 'render',
    fallbackRuntimeModel: '',
    allowedModelUses: RUNJS_RENDER_MODEL_USES,
    extraAllowedRoots: Object.freeze([]),
    suppressExplicitRenderRequirement: false,
    explicitModelLabel: 'known render model',
    requiresExplicitModel: true,
  }),
  'js-model.action': Object.freeze({
    effectStyle: 'action',
    fallbackRuntimeModel: '',
    allowedModelUses: RUNJS_ACTION_MODEL_USES,
    extraAllowedRoots: Object.freeze([]),
    suppressExplicitRenderRequirement: false,
    explicitModelLabel: 'locked action model',
    requiresExplicitModel: true,
  }),
});

export const RUNJS_SURFACE_IDS = Object.freeze(Object.keys(RUNJS_SURFACE_POLICIES));
export const RUNJS_EFFECT_STYLES = Object.freeze(
  [...new Set(RUNJS_SURFACE_IDS.map((surface) => RUNJS_SURFACE_POLICIES[surface].effectStyle))],
);

function normalizeSurface(surface) {
  return typeof surface === 'string' && surface.trim() ? surface.trim() : '';
}

export function getRunJSSurfacePolicy(surface) {
  return RUNJS_SURFACE_POLICIES[normalizeSurface(surface)] || null;
}

export function getRunJSEffectStyle(surface) {
  return getRunJSSurfacePolicy(surface)?.effectStyle || null;
}

export function getRunJSFallbackRuntimeModel(surface) {
  return getRunJSSurfacePolicy(surface)?.fallbackRuntimeModel || '';
}

export function getRunJSSurfaceAllowedModelUses(surface) {
  return getRunJSSurfacePolicy(surface)?.allowedModelUses || [];
}

export function getRunJSSurfaceExtraAllowedRoots(surface) {
  return getRunJSSurfacePolicy(surface)?.extraAllowedRoots || [];
}
