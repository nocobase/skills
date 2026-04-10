# registerFlow

> Read when adding configuration panels, event handlers, or business logic to FlowModels.

## Template: Basic registerFlow

```ts
import { tExpr } from '../locale';

MyModel.registerFlow({
  key: 'mySettings',           // unique identifier
  title: tExpr('My settings'), // display title
  on: 'beforeRender',          // trigger event
  steps: {
    step1: {
      title: tExpr('Step 1'),
      uiSchema: { /* config panel fields */ },
      defaultParams: { /* defaults */ },
      handler(ctx, params) {
        // business logic
        ctx.model.props.someValue = params.someValue;
      },
    },
  },
});
```

## Event Types (on)

| Event | Trigger | Common Use |
|---|---|---|
| `'beforeRender'` | Before first render | Block/field initialization, setting props from config |
| `'click'` | Button click | Action handlers |
| `'submit'` | Form submit | Form processing |
| `'reset'` | Form reset | Reset logic |
| `'remove'` | Delete action | Cleanup |
| `'openView'` | View opened | Initialize dialog/drawer content |
| `'search'` | Search triggered | Filter/search logic |
| `'dropdownOpen'` | Dropdown opened | Lazy-load dropdown options |
| `'popupScroll'` | Popup scrolled | Infinite scroll |
| `'customRequest'` | Custom request | Custom API calls |
| `'collapseToggle'` | Collapse toggled | Section expand/collapse |
| Any custom string | `dispatchEvent('myEvent')` | Custom triggers |

## Step Definition

```ts
steps: {
  myStep: {
    title: tExpr('Step title'),     // display in settings UI
    sort: 0,                         // execution order (lower = first)
    hideInSettings: false,           // hide from settings panel
    preset: false,                   // true = params required at creation time
    paramsRequired: false,           // true = opens config dialog before adding model

    // Config panel UI (JSON Schema format)
    uiSchema: { /* ... */ },

    // Default parameter values
    defaultParams: { key: 'value' },
    // Or dynamic:
    // defaultParams: (ctx) => ({ userId: ctx.model.uid }),

    // Handler function
    handler(ctx, params) {
      // ctx = FlowRuntimeContext, params = merged config values
    },
    // Or async:
    // async handler(ctx, params) { ... },
  },
}
```

## uiSchema Common Components

All fields should use `'x-decorator': 'FormItem'` for consistent layout.

```ts
uiSchema: {
  // Text input
  title: {
    type: 'string',
    title: tExpr('Title'),
    'x-decorator': 'FormItem',
    'x-component': 'Input',
  },

  // Multi-line text
  description: {
    type: 'string',
    title: tExpr('Description'),
    'x-decorator': 'FormItem',
    'x-component': 'Input.TextArea',
  },

  // Number
  count: {
    type: 'number',
    title: tExpr('Count'),
    'x-decorator': 'FormItem',
    'x-component': 'InputNumber',
  },

  // Boolean switch
  enabled: {
    type: 'boolean',
    title: tExpr('Enabled'),
    'x-decorator': 'FormItem',
    'x-component': 'Switch',
  },

  // Select dropdown
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

  // Date picker
  deadline: {
    type: 'string',
    title: tExpr('Deadline'),
    'x-decorator': 'FormItem',
    'x-component': 'DatePicker',
  },

  // Required field
  name: {
    type: 'string',
    title: tExpr('Name'),
    'x-decorator': 'FormItem',
    'x-component': 'Input',
    required: true,
  },
}
```

## Phase Mechanism (Advanced)

When multiple flows bind to the same event, use `phase` to control execution order relative to built-in flows:

```ts
// Default: runs before all built-in flows
on: 'click'
// Equivalent to:
on: { eventName: 'click' }
// Equivalent to:
on: { eventName: 'click', phase: 'beforeAllFlows' }

// Run after all built-in flows
on: { eventName: 'click', phase: 'afterAllFlows' }

// Run before a specific built-in flow
on: { eventName: 'click', phase: 'beforeFlow', flowKey: 'buttonSettings' }

// Run after a specific built-in flow
on: { eventName: 'click', phase: 'afterFlow', flowKey: 'buttonSettings' }

// Run before a specific step in a specific flow
on: { eventName: 'click', phase: 'beforeStep', flowKey: 'buttonSettings', stepKey: 'general' }

// Run after a specific step in a specific flow
on: { eventName: 'click', phase: 'afterStep', flowKey: 'buttonSettings', stepKey: 'general' }
```

| Phase | Description | Required Fields |
|---|---|---|
| `beforeAllFlows` (default) | Before all built-in flows | - |
| `afterAllFlows` | After all built-in flows | - |
| `beforeFlow` | Before a specific flow | `flowKey` |
| `afterFlow` | After a specific flow | `flowKey` |
| `beforeStep` | Before a specific step | `flowKey` + `stepKey` |
| `afterStep` | After a specific step | `flowKey` + `stepKey` |

## Flow-Level defaultParams

Sets initial values for step params at model creation time (fills missing, does not overwrite):

```ts
MyModel.registerFlow({
  key: 'myFlow',
  on: 'beforeRender',
  steps: { step1: { handler(ctx, params) { /* ... */ } } },
  defaultParams: {
    step1: { title: 'Default title', count: 10 },
  },
});

// Or dynamic:
defaultParams: (ctx) => ({
  step1: { userId: ctx.model.uid },
}),
```

## Full Example: Block with Config Panel

```tsx
import React from 'react';
import { BlockModel } from '@nocobase/client-v2';
import { tExpr } from '../locale';

export class ConfigurableBlockModel extends BlockModel {
  renderComponent() {
    const { title, bgColor, showBorder } = this.props;
    return (
      <div style={{
        backgroundColor: bgColor || '#fff',
        border: showBorder ? '1px solid #ddd' : 'none',
        padding: 16,
      }}>
        <h3>{title || 'Untitled'}</h3>
      </div>
    );
  }
}

ConfigurableBlockModel.define({
  label: tExpr('Configurable block'),
});

ConfigurableBlockModel.registerFlow({
  key: 'blockSettings',
  title: tExpr('Block settings'),
  on: 'beforeRender',
  steps: {
    appearance: {
      title: tExpr('Appearance'),
      uiSchema: {
        title: {
          type: 'string',
          title: tExpr('Title'),
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        bgColor: {
          type: 'string',
          title: tExpr('Background color'),
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        showBorder: {
          type: 'boolean',
          title: tExpr('Show border'),
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
      },
      defaultParams: {
        title: 'My Block',
        bgColor: '#ffffff',
        showBorder: true,
      },
      handler(ctx, params) {
        ctx.model.props.title = params.title;
        ctx.model.props.bgColor = params.bgColor;
        ctx.model.props.showBorder = params.showBorder;
      },
    },
  },
});
```

## Key Points

- `key` must be unique within a model class.
- `on: 'beforeRender'` for initialization/config flows. `on: 'click'` for action flows.
- `handler(ctx, params)` -- `params` contains merged values from uiSchema config panel + defaultParams.
- `ctx.model.props.xxx = value` sets reactive props that trigger re-render.
- uiSchema is for FlowModel config panels only. For runtime forms (dialogs, pages), use plain React + Antd components.
- Use `ctx.exit()` in handler to stop remaining steps. Use `ctx.exitAll()` to stop all remaining flows.
- Naming convention: key as `xxxSettings`, title as `'Xxx settings'`.

## Deep Reference

- https://docs.nocobase.com/cn/flow-engine/definitions/flow-definition.md
- https://docs.nocobase.com/cn/flow-engine/definitions/step-definition.md

## Related

- [./block.md](./block.md) -- block models that use registerFlow
- [./action.md](./action.md) -- action models with on:'click' flows
- [./ctx.md](./ctx.md) -- ctx properties available in handlers
- [./resource.md](./resource.md) -- resource operations in handlers
- [./i18n.md](./i18n.md) -- tExpr for flow/step titles
