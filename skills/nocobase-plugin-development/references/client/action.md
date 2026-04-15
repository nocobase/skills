# Action Models

> Read when creating custom action buttons (e.g., "New", "Edit", "Delete", "Export") for blocks.

## Action Scenes

| Scene | Value | Description |
|---|---|---|
| collection | `ActionSceneEnum.collection` | Operates on the data table (e.g., "New" button). Appears in block toolbar |
| record | `ActionSceneEnum.record` | Operates on a single row (e.g., "Edit", "Delete"). Appears in table row actions |
| both | `ActionSceneEnum.both` | Available in both scenes |
| all | `ActionSceneEnum.all` | Available in all scenes (similar to `both`, includes special contexts) |

## Template: Collection-Level Action

```tsx
// models/NewTodoActionModel.tsx
import React from 'react';
import { ActionModel, ActionSceneEnum } from '@nocobase/client-v2';
import { MultiRecordResource, observable, observer } from '@nocobase/flow-engine';
import { Button, Form, Input, Select, Space } from 'antd';
import { ButtonProps } from 'antd';
import { tExpr } from '../locale';

export class NewTodoActionModel extends ActionModel {
  static scene = ActionSceneEnum.collection;

  defaultProps: ButtonProps = {
    type: 'primary',
    children: tExpr('New todo'),
  };
}

NewTodoActionModel.define({
  label: tExpr('New todo'),
});

NewTodoActionModel.registerFlow({
  key: 'newTodoFlow',
  title: tExpr('New todo'),
  on: 'click',
  steps: {
    openForm: {
      async handler(ctx) {
        const resource = ctx.blockModel?.resource as MultiRecordResource;
        if (!resource) return;

        ctx.viewer.dialog({
          title: ctx.t('New todo'),
          content: (view) => (
            <NewTodoForm
              onSubmit={async (values) => {
                await resource.create(values);
                ctx.message.success(ctx.t('Created successfully'));
                view.close();
              }}
              onCancel={() => view.close()}
            />
          ),
        });
      },
    },
  },
});

// Dialog form component
const formState = observable({ loading: false });

const NewTodoForm = observer(function NewTodoForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (values: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    const values = await form.validateFields();
    formState.loading = true;
    try {
      await onSubmit(values);
    } finally {
      formState.loading = false;
    }
  };

  return (
    <Form form={form} layout="vertical" initialValues={{ priority: 'medium' }}>
      <Form.Item label="Title" name="title" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item label="Priority" name="priority">
        <Select
          options={[
            { label: 'High', value: 'high' },
            { label: 'Medium', value: 'medium' },
            { label: 'Low', value: 'low' },
          ]}
        />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" onClick={handleSubmit} loading={formState.loading}>OK</Button>
          <Button onClick={onCancel}>Cancel</Button>
        </Space>
      </Form.Item>
    </Form>
  );
});
```

## Template: Record-Level Action

```tsx
// models/DeleteRecordActionModel.tsx
import { ActionModel, ActionSceneEnum } from '@nocobase/client-v2';
import { MultiRecordResource } from '@nocobase/flow-engine';
import { ButtonProps } from 'antd';
import { tExpr } from '../locale';

export class DeleteRecordActionModel extends ActionModel {
  static scene = ActionSceneEnum.record;

  defaultProps: ButtonProps = {
    danger: true,
    children: tExpr('Delete'),
  };
}

DeleteRecordActionModel.define({
  label: tExpr('Delete record'),
});

DeleteRecordActionModel.registerFlow({
  key: 'deleteRecordFlow',
  title: tExpr('Delete record'),
  on: 'click',
  steps: {
    confirmDelete: {
      async handler(ctx) {
        const record = ctx.model.context.record;       // current row data
        const recordIndex = ctx.model.context.recordIndex; // current row index
        const resource = ctx.blockModel?.resource as MultiRecordResource;
        if (!resource || !record) return;

        await resource.destroy(record.id);
        ctx.message.success(ctx.t('Deleted successfully'));
      },
    },
  },
});
```

## Template: Simple Action (No Flow Logic)

```tsx
// models/SimpleCollectionActionModel.tsx
import { ActionModel, ActionSceneEnum } from '@nocobase/client-v2';
import { ButtonProps } from 'antd';
import { tExpr } from '../locale';

export class SimpleCollectionActionModel extends ActionModel {
  static scene = ActionSceneEnum.collection;

  defaultProps: ButtonProps = {
    children: tExpr('Simple collection action'),
  };
}

SimpleCollectionActionModel.define({
  label: tExpr('Simple collection action'),
});
```

## Template: Action with uiSchema Config Panel

```tsx
NewTodoActionModel.registerFlow({
  key: 'newTodoFlow',
  title: tExpr('New todo'),
  on: 'click',
  steps: {
    openForm: {
      title: tExpr('Todo form'),
      uiSchema: {
        title: {
          type: 'string',
          title: tExpr('Title'),
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          required: true,
        },
        priority: {
          type: 'string',
          title: tExpr('Priority'),
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'High', value: 'high' },
            { label: 'Medium', value: 'medium' },
            { label: 'Low', value: 'low' },
          ],
        },
      },
      defaultParams: {
        priority: 'medium',
      },
      async handler(ctx, params) {
        const resource = ctx.blockModel?.resource as MultiRecordResource;
        if (!resource) return;
        await resource.create(params);
        ctx.message.success(ctx.t('Created successfully'));
      },
    },
  },
});
```

## Registration in Plugin

```ts
// plugin.tsx
this.flowEngine.registerModelLoaders({
  NewTodoActionModel: {
    loader: () => import('./models/NewTodoActionModel'),
  },
  DeleteRecordActionModel: {
    loader: () => import('./models/DeleteRecordActionModel'),
  },
});
```

## Key Points

- `static scene` determines where the action button appears: toolbar (collection) or row actions (record).
- `defaultProps` accepts Antd `ButtonProps` -- set `type`, `danger`, `children` (button text), etc.
- In record-level actions: `ctx.model.context.record` has the row data, `ctx.model.context.recordIndex` has the row index.
- In collection-level actions: `ctx.blockModel?.resource` accesses the block's data resource.
- Two approaches for action forms: (a) `ctx.viewer.dialog()` with a React form component, or (b) `uiSchema` in the step for a config-panel-based form.
- Import `tExpr` from `../locale` for button labels and define().
- Use `observable` + `observer` from `@nocobase/flow-engine` for reactive state in dialog form components.

## Built-in Action Models (from @nocobase/client-v2)

These concrete action models are available for extension or reference:

| Model | Scene | Purpose |
|---|---|---|
| `AddNewActionModel` | collection | "New" button, opens popup form |
| `EditActionModel` | record | "Edit" button, opens popup form |
| `ViewActionModel` | record | "View" button, opens popup detail |
| `DeleteActionModel` | record | "Delete" button for single record |
| `BulkDeleteActionModel` | collection | "Delete" button for selected records |
| `RefreshActionModel` | collection | "Refresh" button |
| `FilterActionModel` | collection | "Filter" button |
| `LinkActionModel` | all | Navigate to URL |
| `UpdateRecordActionModel` | — | Update record with preset values |

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/client/flow-engine/action.md

## Related

- [./flow.md](./flow.md) -- registerFlow details, on events, uiSchema
- [./ctx.md](./ctx.md) -- ctx.viewer, ctx.message, ctx.blockModel
- [./resource.md](./resource.md) -- resource.create(), resource.destroy()
- [./block.md](./block.md) -- blocks where actions are attached
- [./component.md](./component.md) -- writing dialog form components
- [./plugin.md](./plugin.md) -- registering actions in load()
- [./i18n.md](./i18n.md) -- tExpr for button labels
