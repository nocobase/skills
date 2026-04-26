# Post-action Events (action) Trigger Tests

## Overview
Tests for the `action` trigger type which triggers workflows after user actions (create/update operations).

## Test Cases

### Creation Scenarios

#### TC-TRIGGER-ACTION-001: Create workflow for post-order-submission actions
- **Description**: Create workflow triggered after order submission
- **Prompt**: "创建一个在订单提交后执行的工作流，仅由表单提交按钮操作触发"
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
  3. Bind workflow to specific button and test

#### TC-TRIGGER-ACTION-002: Create workflow for post-update actions with preloaded data
- **Description**: Create workflow triggered after order updates with customer data preloaded
- **Prompt**: "创建一个在订单提交更新后执行的工作流，预加载客户信息"
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

### Editing Scenarios

#### TC-TRIGGER-ACTION-003: Change from global to local mode
- **Description**: Modify existing action trigger from global to local mode
- **Prompt**: "将订单提交后执行的工作流改为任何新增和更新操作都触发"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "global": true,
  "actions": ["create", "update"]
}
```
- **Validation Points**:
  - Global should change from `false` to `true`
  - Collection preserved
  - Actions should include both `create` and `update`
- **Test Steps**:
  1. Create workflow with local action trigger
  2. Execute skill with edit prompt
  3. Verify mode changed
  4. Test that global action trigger

#### TC-TRIGGER-ACTION-004: Change from global to local mode
- **Description**: Modify existing action trigger from global to local mode
- **Prompt**: "将订单提交后执行的工作流改为仅由绑定的按钮触发"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "global": false
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
- **Prompt**: "在订单提交后执行的工作流中预加载订单明细和客户信息"
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
- **Prompt**: "将订单提交后执行的工作流改为仅在订单更新时触发"
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
