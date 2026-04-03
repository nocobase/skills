# Data Table Events (collection) Trigger Tests

## Overview
Tests for the `collection` trigger type which monitors data table events (create/update/delete).

## Test Cases

### Creation Scenarios

#### TC-TRIGGER-COLLECTION-001: Create workflow for new order creation with preloaded details
- **Description**: Create a workflow triggered when new orders are created, preloading order details
- **Prompt**: "创建一个订单新增的工作流，预加载订单明细数据"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "mode": 1,
  "appends": ["orderDetails"]
}
```
- **Validation Points**:
  - Trigger type should be `collection`
  - Collection should be `orders` (assuming main data source)
  - Mode should be `1` (create events only)
  - Appends should include `orderDetails` relationship
- **Test Steps**:
  1. Ensure `orders` collection exists with `orderDetails` relationship
  2. Execute skill with the prompt
  3. Verify workflow is created with correct trigger configuration
  4. Test by creating an order record and verify workflow triggers

#### TC-TRIGGER-COLLECTION-002: Create workflow for order updates with amount condition
- **Description**: Create a workflow triggered when orders are updated and amount > 100
- **Prompt**: "创建一个工作流，当订单更新且金额大于100时触发"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "mode": 2,
  "changed": ["amount"],
  "condition": {
    "$and": [
      {
        "amount": { "$gt": 100 }
      }
    ]
  }
}
```
- **Validation Points**:
  - Mode should be `2` (update events only)
  - Changed fields should include `amount`
  - Condition should check `amount > 100`
- **Test Steps**:
  1. Ensure `orders` collection has `amount` field
  2. Execute skill with the prompt
  3. Verify configuration matches expected
  4. Test by updating order amount to 150 (should trigger) and 50 (should not trigger)

#### TC-TRIGGER-COLLECTION-003: Create workflow for order deletion
- **Description**: Create a workflow triggered when orders are deleted
- **Prompt**: "创建一个订单删除的工作流"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "mode": 4
}
```
- **Validation Points**:
  - Mode should be `4` (delete events only)
  - No appends (not loaded for delete events)
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Test by deleting an order record

#### TC-TRIGGER-COLLECTION-004: Create workflow for external data source
- **Description**: Create a workflow for posts in external MySQL data source
- **Prompt**: "在MySQL数据源的posts表上创建一个新增或更新触发的工作流"
- **Expected Configuration**:
```json
{
  "collection": "mysql:posts",
  "mode": 3
}
```
- **Validation Points**:
  - Collection should include data source prefix: `mysql:posts`
  - Mode should be `3` (create or update)
- **Test Steps**:
  1. Ensure external data source `mysql` exists with `posts` collection
  2. Execute skill with the prompt
  3. Verify configuration

### Editing Scenarios

#### TC-TRIGGER-COLLECTION-005: Modify existing workflow to add field change detection
- **Description**: Update an existing collection trigger to only trigger when specific fields change
- **Prompt**: "修改工作流，使其仅在订单状态或标题字段变更时触发"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "mode": 2,
  "changed": ["status", "title"]
}
```
- **Validation Points**:
  - Changed array should include `status` and `title`
  - Original collection and mode preserved unless changed
- **Test Steps**:
  1. Create a workflow with basic collection trigger
  2. Execute skill with edit prompt
  3. Verify `changed` field is added correctly
  4. Test by updating non-listed fields (should not trigger)

#### TC-TRIGGER-COLLECTION-006: Add preloaded relationships to existing trigger
- **Description**: Add relationship preloading to an existing collection trigger
- **Prompt**: "在工作流触发器中预加载订单的用户和分类信息"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "mode": 1,
  "appends": ["user", "category"]
}
```
- **Validation Points**:
  - Appends should include `user` and `category` relationships
- **Test Steps**:
  1. Create a workflow with collection trigger
  2. Execute skill with edit prompt
  3. Verify appends are added
  4. Test trigger and verify relationships are loaded

#### TC-TRIGGER-COLLECTION-007: Change trigger mode from create to update
- **Description**: Change trigger from create events to update events
- **Prompt**: "将工作流触发时机从新增改为更新"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "mode": 2
}
```
- **Validation Points**:
  - Mode should change from `1` to `2`
  - Other configuration preserved
- **Test Steps**:
  1. Create workflow with mode `1`
  2. Execute skill with edit prompt
  3. Verify mode updated
  4. Test with update events (should trigger) and create events (should not trigger)

## Test Data Requirements
- `orders` collection with fields: `amount` (number), `status` (string), `title` (string)
- Relationships: `orderDetails` (hasMany), `user` (belongsTo), `category` (belongsTo)
- External data source `mysql` with `posts` collection (for external data source tests)
