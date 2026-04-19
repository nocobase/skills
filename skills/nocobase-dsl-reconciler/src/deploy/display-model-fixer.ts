/**
 * Fix display models after compose.
 *
 * Compose defaults everything to DisplayTextFieldModel.
 * This fixes them based on collection field interfaces.
 */
import type { NocoBaseClient } from '../client';
import type { FlowModelNode } from '../types/api';

// NocoBase interface → the Display*FieldModel NB uses when rendering that
// field inside a read-only surface (table cell, details item). When compose
// defaults a field to DisplayTextFieldModel but the interface deserves a
// richer widget (date picker, enum chips, color swatch, etc.), the fixer
// swaps in the right model. Unknown interfaces stay as plain text — safe
// fallback, not a bug.
export const DISPLAY_MODEL_MAP: Record<string, string> = {
  // Text-ish (default fine — kept here for documentation completeness).
  input: 'DisplayTextFieldModel',
  textarea: 'DisplayTextFieldModel',
  email: 'DisplayTextFieldModel',
  phone: 'DisplayTextFieldModel',
  password: 'DisplayTextFieldModel',
  sequence: 'DisplayTextFieldModel',      // auto-generated code string
  snowflakeId: 'DisplayTextFieldModel',   // id / hash
  uuid: 'DisplayTextFieldModel',
  nanoid: 'DisplayTextFieldModel',
  icon: 'DisplayTextFieldModel',
  collection: 'DisplayTextFieldModel',    // collection-name picker

  // Rich / url
  url: 'DisplayURLFieldModel',
  richText: 'DisplayHtmlFieldModel',
  vditor: 'DisplayHtmlFieldModel',
  markdown: 'DisplayHtmlFieldModel',

  // Enum-ish
  select: 'DisplayEnumFieldModel',
  radioGroup: 'DisplayEnumFieldModel',
  multipleSelect: 'DisplayEnumFieldModel',
  checkboxGroup: 'DisplayEnumFieldModel',

  // Boolean
  checkbox: 'DisplayCheckboxFieldModel',

  // Numeric
  integer: 'DisplayNumberFieldModel',
  number: 'DisplayNumberFieldModel',
  percent: 'DisplayPercentFieldModel',
  sort: 'DisplayNumberFieldModel',        // sort index is a number

  // Date / time — several NB variants all render as a formatted date.
  date: 'DisplayDateTimeFieldModel',
  dateOnly: 'DisplayDateTimeFieldModel',
  datetime: 'DisplayDateTimeFieldModel',
  datetimeNoTz: 'DisplayDateTimeFieldModel',
  unixTimestamp: 'DisplayDateTimeFieldModel',
  createdAt: 'DisplayDateTimeFieldModel',
  updatedAt: 'DisplayDateTimeFieldModel',
  time: 'DisplayTimeFieldModel',

  // Color / JSON
  color: 'DisplayColorFieldModel',
  json: 'DisplayJSONFieldModel',

  // Relations — m2o/o2o/obo/oho show the target's title; o2m/m2m show count.
  m2o: 'DisplayTextFieldModel',
  o2o: 'DisplayTextFieldModel',
  oho: 'DisplayTextFieldModel',
  obo: 'DisplayTextFieldModel',
  o2m: 'DisplayNumberFieldModel',
  m2m: 'DisplayNumberFieldModel',

  // User / audit fields resolve to the user record's display name.
  createdBy: 'DisplaySubItemFieldModel',
  updatedBy: 'DisplaySubItemFieldModel',
};

export async function fixDisplayModels(
  nb: NocoBaseClient,
  blockUid: string,
  coll: string,
  btype: 'table' | 'details',
): Promise<void> {
  const meta = await nb.collections.fieldMeta(coll);
  const data = await nb.get({ uid: blockUid });
  const tree = data.tree;

  if (btype === 'table') {
    const rawCols = tree.subModels?.columns;
    const cols = (Array.isArray(rawCols) ? rawCols : []) as FlowModelNode[];

    for (const col of cols) {
      const fp = (col.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>;
      const fieldPath = (fp?.init as Record<string, unknown>)?.fieldPath as string;
      if (!fieldPath || !(fieldPath in meta)) continue;

      const iface = meta[fieldPath].interface;
      const correctModel = DISPLAY_MODEL_MAP[iface] || 'DisplayTextFieldModel';
      if (correctModel === 'DisplayTextFieldModel') continue;

      const field = col.subModels?.field;
      if (field && !Array.isArray(field) && field.uid) {
        if (field.use !== correctModel) {
          await nb.models.save({
            uid: field.uid,
            use: correctModel,
            parentId: col.uid,
            subKey: 'field',
            subType: 'object',
            sortIndex: field.sortIndex ?? 0,
            stepParams: field.stepParams || {},
            flowRegistry: field.flowRegistry || {},
          });
          await nb.updateModel(col.uid, {
            tableColumnSettings: { model: { use: correctModel } },
          });
        }
      }
    }
  } else if (btype === 'details') {
    const grid = tree.subModels?.grid;
    if (!grid || Array.isArray(grid)) return;
    const rawItems = (grid as FlowModelNode).subModels?.items;
    const items = (Array.isArray(rawItems) ? rawItems : []) as FlowModelNode[];

    for (const item of items) {
      if (!item.use?.includes('DetailsItem')) continue;
      const fp = (item.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>;
      const fieldPath = (fp?.init as Record<string, unknown>)?.fieldPath as string;
      if (!fieldPath || !(fieldPath in meta)) continue;

      const iface = meta[fieldPath].interface;
      const correctModel = DISPLAY_MODEL_MAP[iface] || 'DisplayTextFieldModel';
      if (correctModel === 'DisplayTextFieldModel') continue;

      const field = item.subModels?.field;
      if (field && !Array.isArray(field) && field.uid) {
        if (field.use !== correctModel) {
          await nb.models.save({
            uid: field.uid,
            use: correctModel,
            parentId: item.uid,
            subKey: 'field',
            subType: 'object',
            sortIndex: 0,
            stepParams: field.stepParams || {},
            flowRegistry: field.flowRegistry || {},
          });
        }
      }
    }
  }
}
