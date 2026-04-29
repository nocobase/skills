import {
  RUNJS_EFFECT_STYLES as SURFACE_EFFECT_STYLES,
  RUNJS_MODEL_USES as SURFACE_MODEL_USES,
  RUNJS_SURFACE_IDS as SURFACE_IDS,
} from '../runtime/src/surface-policy.js';

export const RUNJS_SNIPPET_TIERS = new Set(['safe', 'guarded', 'advanced']);

export const RUNJS_SNIPPET_FAMILIES = new Set([
  'global',
  'scene/block',
  'scene/detail',
  'scene/form',
  'scene/table',
  'value-return',
  'render',
  'action',
]);

export const RUNJS_SCENE_HINTS = new Set([
  'eventFlow',
  'linkage',
  'formValue',
  'customVariable',
  'block',
  'popup',
  'detail',
  'form',
  'table',
  'action',
]);

export const RUNJS_SURFACES = new Set(SURFACE_IDS);

export const RUNJS_EFFECT_STYLES = new Set(SURFACE_EFFECT_STYLES);

export const RUNJS_MODEL_USES = new Set(SURFACE_MODEL_USES);

export const RUNJS_SNIPPET_REQUIRED_DOC_SECTIONS = [
  'Use when',
  'Do not use when',
  'Surfaces',
  'Required ctx roots',
  'Contract',
  'Normalized snippet',
  'Editable slots',
  'Skill-mode notes',
];
