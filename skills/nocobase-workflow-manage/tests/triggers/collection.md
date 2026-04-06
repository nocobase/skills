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

## Test Data Requirements
- `orders` collection with fields: `amount` (number), `status` (string), `title` (string)
- Relationships: `orderDetails` (hasMany), `user` (belongsTo), `category` (belongsTo)
