# Post-action Events (action) Trigger Tests

## Overview
Tests for the `action` trigger type which triggers workflows after user actions (create/update operations).

## Test Cases

### Creation Scenarios

#### TC-TRIGGER-ACTION-001: Create workflow for post-order-creation actions
- **Description**: Create workflow triggered after order creation
- **Prompt**: "创建一个在订单创建后执行的工作流"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["create"],
  "appends": []
}
```
- **Validation Points**:
  - Trigger type should be `action`
  - Collection should be `orders`
  - Global should be `true` (global mode)
  - Actions should include `"create"`
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration matches expected
  3. Create an order via UI/API and verify workflow triggers

#### TC-TRIGGER-ACTION-002: Create workflow for post-update actions with preloaded data
- **Description**: Create workflow triggered after order updates with customer data preloaded
- **Prompt**: "创建一个在订单更新后执行的工作流，预加载客户信息"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["update"],
  "appends": ["customer"]
}
```
- **Validation Points**:
  - Actions should include `"update"` only
  - Appends should include `customer`
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Update an order and verify workflow triggers with customer data

#### TC-TRIGGER-ACTION-003: Create local mode workflow for specific button
- **Description**: Create workflow triggered only by specific button/operation
- **Prompt**: "创建一个本地模式的工作流，仅由特定的按钮操作触发"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "global": false,
  "actions": ["create", "update"]
}
```
- **Validation Points**:
  - Global should be `false` (local mode)
  - Actions should include both create and update (default)
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify local mode configuration
  3. Bind workflow to specific button and test

### Editing Scenarios

#### TC-TRIGGER-ACTION-004: Change from global to local mode
- **Description**: Modify existing action trigger from global to local mode
- **Prompt**: "将工作流改为本地模式，仅由绑定的按钮触发"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "global": false,
  "actions": ["create", "update"]
}
```
- **Validation Points**:
  - Global should change from `true` to `false`
  - Collection preserved
- **Test Steps**:
  1. Create workflow with global action trigger
  2. Execute skill with edit prompt
  3. Verify mode changed
  4. Test that only bound operations trigger

#### TC-TRIGGER-ACTION-005: Add preloaded relationships
- **Description**: Add relationship preloading to existing action trigger
- **Prompt**: "在动作触发器中预加载订单明细和客户信息"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["create", "update"],
  "appends": ["orderDetails", "customer"]
}
```
- **Validation Points**:
  - Appends should include both relationships
- **Test Steps**:
  1. Create workflow with action trigger
  2. Execute skill with edit prompt
  3. Verify appends added
  4. Test trigger and verify data includes relationships

#### TC-TRIGGER-ACTION-006: Change actions from create+update to update only
- **Description**: Modify trigger to only respond to update actions
- **Prompt**: "将工作流改为仅在订单更新时触发"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["update"]
}
```
- **Validation Points**:
  - Actions array should contain only `"update"`
- **Test Steps**:
  1. Create workflow with create+update actions
  2. Execute skill with edit prompt
  3. Verify actions updated
  4. Test create (should not trigger) vs update (should trigger)

## Test Data Requirements
- `orders` collection
- Relationships: `customer` (belongsTo), `orderDetails` (hasMany)
- UI buttons/operations for local mode testing