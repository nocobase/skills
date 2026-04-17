/**
 * Fix display models after compose.
 *
 * Compose defaults everything to DisplayTextFieldModel.
 * This fixes them based on collection field interfaces.
 */
import type { NocoBaseClient } from '../client';
import type { FlowModelNode } from '../types/api';

export const DISPLAY_MODEL_MAP: Record<string, string> = {
  input: 'DisplayTextFieldModel',
  textarea: 'DisplayTextFieldModel',
  email: 'DisplayTextFieldModel',
  phone: 'DisplayTextFieldModel',
  url: 'DisplayURLFieldModel',
  select: 'DisplayEnumFieldModel',
  radioGroup: 'DisplayEnumFieldModel',
  multipleSelect: 'DisplayEnumFieldModel',
  checkboxGroup: 'DisplayEnumFieldModel',
  checkbox: 'DisplayCheckboxFieldModel',
  integer: 'DisplayNumberFieldModel',
  number: 'DisplayNumberFieldModel',
  percent: 'DisplayPercentFieldModel',
  date: 'DisplayDateTimeFieldModel',
  datetime: 'DisplayDateTimeFieldModel',
  createdAt: 'DisplayDateTimeFieldModel',
  updatedAt: 'DisplayDateTimeFieldModel',
  time: 'DisplayTimeFieldModel',
  color: 'DisplayColorFieldModel',
  m2o: 'DisplayTextFieldModel',
  o2m: 'DisplayNumberFieldModel',
  createdBy: 'DisplaySubItemFieldModel',
  updatedBy: 'DisplaySubItemFieldModel',
  richText: 'DisplayHtmlFieldModel',
  json: 'DisplayJSONFieldModel',
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
