/**
 * Apply sub-table rendering to o2m/m2m form fields.
 *
 * NocoBase compose defaults o2m fields to RecordSelectFieldModel (a
 * picker for existing records). When DSL declares `type: subTable` on
 * a field, we swap the inner field model to PatternFormFieldModel and
 * add SubTableColumnModel children — the inline-editable rows the
 * user expects.
 *
 * Why a separate post-compose pass:
 *   - The compose API doesn't currently let us pick a field model by
 *     class name, so we let it create the default RecordSelect, then
 *     mutate via flowModels:save (idempotent upsert by uid).
 *   - The column choice + per-column field interface needs collection
 *     metadata that compose doesn't see at our layer.
 */
import type { BlockSpec, FieldRef, SubTableColumn } from '../../types/spec';
import type { DeployContext } from './types';
import { generateUid } from '../../utils/uid';

/** Map collection field interface → input FieldModel class for sub-table cells. */
const INPUT_FIELD_MODEL_MAP: Record<string, string> = {
  input: 'InputFieldModel',
  textarea: 'InputFieldModel',
  email: 'InputFieldModel',
  phone: 'InputFieldModel',
  url: 'InputFieldModel',
  password: 'InputFieldModel',
  integer: 'NumberFieldModel',
  number: 'NumberFieldModel',
  percent: 'NumberFieldModel',
  select: 'SelectFieldModel',
  radioGroup: 'SelectFieldModel',
  multipleSelect: 'SelectFieldModel',
  checkboxGroup: 'SelectFieldModel',
  checkbox: 'CheckboxFieldModel',
  date: 'DatePickerFieldModel',
  datetime: 'DatePickerFieldModel',
  time: 'TimePickerFieldModel',
  color: 'ColorPickerFieldModel',
  m2o: 'RecordSelectFieldModel',
  o2o: 'RecordSelectFieldModel',
  m2m: 'RecordSelectFieldModel',
  attachment: 'AttachmentFieldModel',
  json: 'JSONFieldModel',
  richText: 'RichTextFieldModel',
};

export async function applySubTableFields(
  ctx: DeployContext,
  blockUid: string,
  coll: string,
  bs: BlockSpec,
): Promise<void> {
  const subTableFields = (bs.fields || []).filter(
    (f): f is FieldRef => typeof f === 'object' && f !== null && (f as FieldRef).type === 'subTable',
  );
  if (!subTableFields.length) return;

  const { nb, log } = ctx;

  // Cache parent collection field metadata once
  const parentMeta = await nb.collections.fieldMeta(coll).catch(() => ({}));

  // Read live form grid items to find each FormItemModel by fieldPath
  const data = await nb.get({ uid: blockUid });
  const grid = data.tree.subModels?.grid;
  const items = (grid && !Array.isArray(grid))
    ? ((grid as any).subModels?.items || [])
    : [];
  const itemByFp = new Map<string, any>();
  for (const it of items) {
    const fp = ((it.stepParams || {}).fieldSettings || {}).init?.fieldPath as string;
    if (fp) itemByFp.set(fp, it);
  }

  for (const stf of subTableFields) {
    const item = itemByFp.get(stf.field);
    if (!item) {
      log(`      ⚠ subTable [${stf.field}]: form item not found in live grid`);
      continue;
    }

    // Resolve target collection (the o2m/m2m relation target)
    const parentFieldMeta = parentMeta[stf.field];
    const targetColl = (parentFieldMeta as any)?.target as string | undefined;
    if (!targetColl) {
      log(`      ⚠ subTable [${stf.field}]: no target collection — is this an o2m/m2m field?`);
      continue;
    }

    const childMeta = await nb.collections.fieldMeta(targetColl).catch(() => ({}));

    // Existing field model (compose put it there as RecordSelect by default)
    const existingField = item.subModels?.field;
    const fieldUid = existingField?.uid as string | undefined;
    if (!fieldUid) {
      log(`      ⚠ subTable [${stf.field}]: existing field model has no uid`);
      continue;
    }

    // Step 1a: keep the field model class as-is (RecordSelectFieldModel —
    // NocoBase's default for o2m/m2m) and add `fieldBinding.use =
    // SubTableFieldModel` to its stepParams. This is how CRM quotations
    // items sub-table is configured — the field model class doesn't
    // change, only the binding + the parent FormItem's editItemSettings.
    try {
      const existingSp = (existingField?.stepParams || {}) as Record<string, unknown>;
      const existingInit = (((existingSp.fieldSettings as Record<string, unknown>)?.init) || {}) as Record<string, unknown>;
      const newSp = {
        ...existingSp,
        fieldBinding: { use: 'SubTableFieldModel' },
        fieldSettings: {
          init: {
            dataSourceKey: 'main',
            collectionName: coll,
            fieldPath: stf.field,
            ...existingInit,
          },
        },
      };
      await nb.models.save({
        uid: fieldUid,
        use: (existingField?.use as string) || 'RecordSelectFieldModel',
        parentId: item.uid,
        subKey: 'field',
        subType: 'object',
        sortIndex: 0,
        stepParams: newSp,
        flowRegistry: existingField?.flowRegistry || {},
      });
    } catch (e) {
      log(`      ✗ subTable [${stf.field}]: switch model failed — ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      continue;
    }

    // Step 1b: update the parent FormItem's stepParams with
    // editItemSettings so NocoBase renders the sub-table widget instead
    // of the default record picker. Need to preserve the rest of the
    // FormItem's stepParams to avoid clobbering fieldSettings.init.
    try {
      const formItemSp = (item.stepParams || {}) as Record<string, unknown>;
      const newFormItemSp = {
        ...formItemSp,
        editItemSettings: {
          model: { use: 'SubTableFieldModel' },
          showLabel: { showLabel: false },
        },
      };
      await nb.models.save({
        uid: item.uid as string,
        use: (item.use as string) || 'FormItemModel',
        parentId: item.parentId,
        subKey: item.subKey || 'items',
        subType: item.subType || 'array',
        sortIndex: item.sortIndex || 0,
        stepParams: newFormItemSp,
        flowRegistry: (item.flowRegistry as Record<string, unknown>) || {},
      });
    } catch (e) {
      log(`      ✗ subTable [${stf.field}]: FormItem editItemSettings save failed — ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      continue;
    }

    // Step 2: create SubTableColumnModel children + their inner FieldModel.
    // Idempotency: if columns with these specs already exist on the field,
    // saving with same uids would overwrite — we generate fresh uids each
    // run for now, leaving NB to garbage-collect orphans on next sync.
    const cols = stf.columns || [];
    let added = 0;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const colSpec: SubTableColumn = typeof c === 'string' ? { field: c } : c;
      const childFieldName = colSpec.field;
      const childMetaEntry = childMeta[childFieldName];
      const childInterface = (childMetaEntry as any)?.interface || 'input';
      const fieldModelClass = INPUT_FIELD_MODEL_MAP[childInterface] || 'InputFieldModel';

      const colUid = generateUid();
      const innerFieldUid = generateUid();
      // Sub-table column wrapper.
      // fieldSettings.init MUST include dataSourceKey + collectionName
      // alongside fieldPath — NocoBase's SubTableFieldModel render flow
      // validates `dataSourceKey` as required and throws
      //   "dataSourceKey is a required parameter"
      // in the browser otherwise, hiding the whole popup. Default to
      // main; parent-table's collectionName identifies the sub-table
      // relation.
      try {
        await nb.models.save({
          uid: colUid,
          use: 'SubTableColumnModel',
          parentId: fieldUid,
          subKey: 'columns',
          subType: 'array',
          sortIndex: i,
          stepParams: {
            tableColumnSettings: {
              ...(colSpec.width ? { width: { width: colSpec.width } } : {}),
            },
            fieldSettings: {
              init: {
                dataSourceKey: 'main',
                collectionName: coll,
                fieldPath: `${stf.field}.${childFieldName}`,
                ...(childMetaEntry ? { interface: childInterface } : {}),
              },
            },
          },
          flowRegistry: {},
        });
      } catch (e) {
        log(`      ✗ subTable [${stf.field}].${childFieldName}: column failed — ${e instanceof Error ? e.message.slice(0, 60) : e}`);
        continue;
      }
      // Inner field model for the cell — same dataSourceKey requirement.
      try {
        await nb.models.save({
          uid: innerFieldUid,
          use: fieldModelClass,
          parentId: colUid,
          subKey: 'field',
          subType: 'object',
          sortIndex: 0,
          stepParams: {
            fieldSettings: {
              init: {
                dataSourceKey: 'main',
                collectionName: coll,
                fieldPath: `${stf.field}.${childFieldName}`,
                interface: childInterface,
              },
            },
          },
          flowRegistry: {},
        });
        added++;
      } catch (e) {
        log(`      ✗ subTable [${stf.field}].${childFieldName}: cell field failed — ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }
    log(`      ~ subTable ${stf.field}: ${added}/${cols.length} columns (target=${targetColl})`);
  }
}
