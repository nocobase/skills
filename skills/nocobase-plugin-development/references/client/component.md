# React Component Development

> Read when writing React page components, settings pages, or custom UI for NocoBase plugins.

## Template: Settings Page Component

```tsx
// pages/MySettingsPage.tsx
import React from 'react';
import { Form, Input, Button, Card, Space, message } from 'antd';
import { useFlowContext } from '@nocobase/flow-engine';
import { useRequest } from 'ahooks';
import { useT } from '../locale';

interface MySettings {
  apiKey: string;
  endpoint: string;
}

export default function MySettingsPage() {
  const ctx = useFlowContext();
  const t = useT();
  const [form] = Form.useForm<MySettings>();

  // Load existing settings
  const { loading } = useRequest(
    () => ctx.api.request({ url: 'myPlugin:get', method: 'get' }),
    {
      onSuccess(response) {
        if (response?.data?.data) {
          form.setFieldsValue(response.data.data);
        }
      },
    },
  );

  // Save settings
  const { run: save, loading: saving } = useRequest(
    (values: MySettings) =>
      ctx.api.request({ url: 'myPlugin:set', method: 'post', data: values }),
    {
      manual: true,
      onSuccess() {
        message.success(t('Saved successfully'));
      },
      onError() {
        message.error(t('Save failed'));
      },
    },
  );

  const handleSave = async () => {
    const values = await form.validateFields();
    save(values);
  };

  return (
    <Card title={t('My Plugin Settings')} loading={loading}>
      <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
        <Form.Item
          label="API Key"
          name="apiKey"
          rules={[{ required: true, message: t('Please enter API Key') }]}
        >
          <Input placeholder="sk-xxxxxxxxxxxx" />
        </Form.Item>

        <Form.Item
          label="Endpoint"
          name="endpoint"
          rules={[{ required: true, message: t('Please enter endpoint') }]}
        >
          <Input placeholder="https://api.example.com/v1" />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" onClick={handleSave} loading={saving}>
              {t('Save')}
            </Button>
            <Button onClick={() => form.resetFields()}>
              {t('Reset')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
```

## Template: Simple Page Component

```tsx
// pages/MyPage.tsx
import React, { useState } from 'react';
import { Table, Button, Space, Card } from 'antd';
import { useFlowContext } from '@nocobase/flow-engine';
import { useRequest } from 'ahooks';
import { useT } from '../locale';

export default function MyPage() {
  const ctx = useFlowContext();
  const t = useT();

  const { data, loading, refresh } = useRequest(() =>
    ctx.api.request({ url: 'myResource:list', method: 'get' }),
  );

  const columns = [
    { title: t('Name'), dataIndex: 'name', key: 'name' },
    { title: t('Status'), dataIndex: 'status', key: 'status' },
  ];

  return (
    <Card title={t('My Page')}>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={refresh}>{t('Refresh')}</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={data?.data?.data || []}
        loading={loading}
        rowKey="id"
      />
    </Card>
  );
}
```

## Template: Dialog Content Component

Used inside `ctx.viewer.dialog()` or `ctx.viewer.drawer()`:

```tsx
import React from 'react';
import { Form, Input, Button, Space } from 'antd';
import { observable, observer } from '@nocobase/flow-engine';

const formState = observable({ loading: false });

const MyFormDialog = observer(function MyFormDialog({
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
    <Form form={form} layout="vertical">
      <Form.Item label="Name" name="name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" onClick={handleSubmit} loading={formState.loading}>
            OK
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </Space>
      </Form.Item>
    </Form>
  );
});
```

## Key Points

- Use `useFlowContext()` from `@nocobase/flow-engine` to access ctx (api, t, router, viewer, etc.).
- Use `useT()` from `../locale` for i18n in components (not ctx.t directly -- useT binds plugin namespace).
- Use Ant Design v5 components: https://5x.ant.design
- Use `useRequest` from `ahooks` for data fetching with loading/error state.
- Page components must use `export default`.
- For reactive state in non-component code (e.g., dialog forms), use `observable` + `observer` from `@nocobase/flow-engine` instead of useState.
- Most runtime UI should be built with plain React + Antd, NOT uiSchema. uiSchema is only for FlowModel configuration panels.

## Commonly Used Antd Components

`Card`, `Table`, `Form`, `Input`, `Input.TextArea`, `Input.Password`, `InputNumber`, `Select`, `Switch`, `Checkbox`, `DatePicker`, `Button`, `Space`, `Tag`, `Badge`, `Modal`, `Drawer`, `Tabs`, `Alert`, `Spin`, `Typography`, `Divider`, `Tooltip`, `Popconfirm`

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/client/component/index.md
- https://5x.ant.design (Ant Design v5 component library)

## Related

- [./ctx.md](./ctx.md) -- ctx properties available in components
- [./router.md](./router.md) -- registering pages that use these components
- [./i18n.md](./i18n.md) -- useT() hook for translations
- [./plugin.md](./plugin.md) -- plugin entry where routes are registered
