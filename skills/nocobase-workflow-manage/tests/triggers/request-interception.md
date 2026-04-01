# Pre-action Event (request-interception) Trigger Tests

## Overview
Tests for the `request-interception` trigger type which intercepts requests before data operations for validation/preprocessing.

## Test Cases

### Creation Scenarios

#### TC-TRIGGER-REQUEST-INTERCEPTION-001: Create global validation workflow for order creation
- **Description**: Create workflow to validate order creation requests
- **Prompt**: "创建一个在订单创建请求前进行验证的工作流"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["create"]
}
```
- **Validation Points**:
  - Trigger type should be `request-interception`
  - Collection should be `orders`
  - Global should be `true`
  - Actions should include `"create"`
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Attempt to create order and verify validation triggers

#### TC-TRIGGER-REQUEST-INTERCEPTION-002: Create local mode workflow for specific button
- **Description**: Create workflow bound to specific action button
- **Prompt**: "创建一个本地模式的工作流，绑定到特定按钮进行请求拦截"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "global": false
}
```
- **Validation Points**:
  - Global should be `false` (local mode)
  - No actions field (not required for local mode)
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify local mode configuration
  3. Bind to specific button and test interception

#### TC-TRIGGER-REQUEST-INTERCEPTION-003: Create workflow for update and delete validation
- **Description**: Create workflow to validate update and delete operations
- **Prompt**: "创建一个在订单更新和删除前进行验证的工作流"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["update", "destroy"]
}
```
- **Validation Points**:
  - Actions should include both `"update"` and `"destroy"`
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Test update and delete operations trigger validation

### Editing Scenarios

#### TC-TRIGGER-REQUEST-INTERCEPTION-004: Change from global to local mode
- **Description**: Modify trigger from global to local mode
- **Prompt**: "将工作流改为本地模式，仅绑定到特定按钮"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "global": false
}
```
- **Validation Points**:
  - Global should change from `true` to `false`
  - Actions field should be removed
- **Test Steps**:
  1. Create workflow with global request interception
  2. Execute skill with edit prompt
  3. Verify mode changed
  4. Bind to button and test

#### TC-TRIGGER-REQUEST-INTERCEPTION-005: Add additional action type
- **Description**: Add destroy action to existing create+update validation
- **Prompt**: "在现有请求拦截工作流中增加删除操作的验证"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["create", "update", "destroy"]
}
```
- **Validation Points**:
  - Actions should include all three action types
- **Test Steps**:
  1. Create workflow with create+update validation
  2. Execute skill with edit prompt
  3. Verify destroy action added
  4. Test delete operation triggers validation

#### TC-TRIGGER-REQUEST-INTERCEPTION-006: Change collection for validation
- **Description**: Change validation from orders to products collection
- **Prompt**: "将请求拦截工作流改为针对产品表进行验证"
- **Expected Configuration** (updated):
```json
{
  "collection": "products",
  "global": true,
  "actions": ["create", "update"]
}
```
- **Validation Points**:
  - Collection should change from `orders` to `products`
  - Other settings preserved
- **Test Steps**:
  1. Create workflow for orders validation
  2. Execute skill with edit prompt
  3. Verify collection updated
  4. Test with products operations

## Test Data Requirements
- `orders` and `products` collections
- Action buttons for local mode binding
- API endpoints for create/update/delete operations