# Custom Action Event (custom-action) Trigger Tests

## Overview
Tests for the `custom-action` trigger type which allows manual triggering via "Trigger Workflow" buttons with three context types.

## Test Cases

### Creation Scenarios

#### TC-TRIGGER-CUSTOM-ACTION-001: Create global custom data workflow
- **Description**: Create workflow with global custom data context
- **Prompt**: "创建一个全局自定义数据的工作流，通过按钮手动触发"
- **Expected Configuration**:
```json
{
  "type": 0
}
```
- **Validation Points**:
  - Trigger type should be `custom-action`
  - Type should be `0` (global custom data)
  - No collection required
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Add "Trigger Workflow" button and bind this workflow
  4. Test manual triggering with custom data

#### TC-TRIGGER-CUSTOM-ACTION-002: Create single record workflow for orders
- **Description**: Create workflow bound to single order record
- **Prompt**: "创建一个针对单个订单记录的工作流，预加载客户信息"
- **Expected Configuration**:
```json
{
  "type": 1,
  "collection": "orders",
  "appends": ["customer"]
}
```
- **Validation Points**:
  - Type should be `1` (single record)
  - Collection should be `orders`
  - Appends should include `customer`
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Bind to order detail page button
  4. Test triggering with order record

#### TC-TRIGGER-CUSTOM-ACTION-003: Create multiple records workflow
- **Description**: Create workflow for batch operations on multiple orders
- **Prompt**: "创建一个针对多个订单记录的工作流"
- **Expected Configuration**:
```json
{
  "type": 2,
  "collection": "orders"
}
```
- **Validation Points**:
  - Type should be `2` (multiple records)
  - Collection should be `orders`
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Bind to table batch action button
  4. Test with multiple selected orders

### Editing Scenarios

#### TC-TRIGGER-CUSTOM-ACTION-004: Change from global to single record mode
- **Description**: Modify trigger from global to single record context
- **Prompt**: "将工作流改为针对单个订单记录触发"
- **Expected Configuration** (updated):
```json
{
  "type": 1,
  "collection": "orders"
}
```
- **Validation Points**:
  - Type should change from `0` to `1`
  - Collection should be added
- **Test Steps**:
  1. Create workflow with global custom action
  2. Execute skill with edit prompt
  3. Verify type and collection updated
  4. Rebind to order detail button

#### TC-TRIGGER-CUSTOM-ACTION-005: Add preloaded relationships to single record trigger
- **Description**: Add relationship preloading to existing single record trigger
- **Prompt**: "在单个订单记录触发器中预加载订单明细和客户信息"
- **Expected Configuration** (updated):
```json
{
  "type": 1,
  "collection": "orders",
  "appends": ["orderDetails", "customer"]
}
```
- **Validation Points**:
  - Appends should include both relationships
- **Test Steps**:
  1. Create workflow with single record trigger
  2. Execute skill with edit prompt
  3. Verify appends added
  4. Test trigger and verify data includes relationships

#### TC-TRIGGER-CUSTOM-ACTION-006: Change from single to multiple records mode
- **Description**: Modify trigger from single to multiple records context
- **Prompt**: "将工作流改为针对多个订单记录批量触发"
- **Expected Configuration** (updated):
```json
{
  "type": 2,
  "collection": "orders"
}
```
- **Validation Points**:
  - Type should change from `1` to `2`
  - Collection preserved
- **Test Steps**:
  1. Create workflow with single record trigger
  2. Execute skill with edit prompt
  3. Verify type updated
  4. Rebind to table batch action button

## Test Data Requirements
- `orders` collection
- Relationships: `customer` (belongsTo), `orderDetails` (hasMany)
- UI buttons: "Trigger Workflow" button in various contexts