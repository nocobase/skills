# Update Node Tests

## Overview
Tests for the `update` node type which updates records in collections.

## Test Cases

### Creation Scenarios

#### TC-NODE-UPDATE-001: Add node to update order status
- **Description**: Add node to update order status to "approved"
- **Prompt**: "增加更新节点，将订单状态改为'approved'"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "individualHooks": false,
    "filter": {
      "id": { "$eq": "{{$context.data.id}}" }
    },
    "values": {
      "status": "approved"
    }
  }
}
```
- **Validation Points**:
  - Node type should be `update`
  - Collection should be `orders`
  - Filter should match order ID from trigger
  - Values should set status to "approved"
- **Test Steps**:
  1. Create workflow with order trigger
  2. Execute skill with the prompt
  3. Verify update configuration
  4. Test workflow updates order status

#### TC-NODE-UPDATE-002: Add node for batch update with individual hooks
- **Description**: Add node to batch update user's orders with individual hooks
- **Prompt**: "增加更新节点，批量更新当前用户的所有订单为已完成，并触发个体钩子"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "individualHooks": true,
    "filter": {
      "userId": { "$eq": "{{$context.user.id}}" }
    },
    "values": {
      "status": "completed"
    }
  }
}
```
- **Validation Points**:
  - individualHooks should be `true`
  - Filter should match current user ID
  - Values should set status to "completed"
- **Test Steps**:
  1. Create workflow with user context
  2. Execute skill with the prompt
  3. Verify batch update configuration
  4. Test updates all user's orders

#### TC-NODE-UPDATE-003: Add node to update multiple fields
- **Description**: Add node to update both status and completion time
- **Prompt**: "增加更新节点，更新订单状态为'shipped'并设置发货时间"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "individualHooks": false,
    "filter": {
      "id": { "$eq": "{{$context.data.id}}" }
    },
    "values": {
      "status": "shipped",
      "shippedAt": "{{$context.date}}"
    }
  }
}
```
- **Validation Points**:
  - Values should include both status and shippedAt
  - shippedAt should reference context date
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify multiple field updates
  3. Test updates both fields

### Editing Scenarios

#### TC-NODE-UPDATE-004: Change update values
- **Description**: Modify status value in existing update node
- **Prompt**: "在更新节点中，将状态从'approved'改为'rejected'"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "individualHooks": false,
    "filter": {
      "id": { "$eq": "{{$context.data.id}}" }
    },
    "values": {
      "status": "rejected"
    }
  }
}
```
- **Validation Points**:
  - status value should change from "approved" to "rejected"
  - Other configuration preserved
- **Test Steps**:
  1. Create workflow with status update to "approved"
  2. Execute skill with edit prompt
  3. Verify status updated
  4. Test updates order to rejected

#### TC-NODE-UPDATE-005: Add additional field to update
- **Description**: Add timestamp field to existing update
- **Prompt**: "在更新节点中增加更新时间字段"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "individualHooks": false,
    "filter": {
      "id": { "$eq": "{{$context.data.id}}" }
    },
    "values": {
      "status": "approved",
      "updatedAt": "{{$context.date}}"
    }
  }
}
```
- **Validation Points**:
  - updatedAt field should be added
  - References context date
- **Test Steps**:
  1. Create workflow with status update only
  2. Execute skill with edit prompt
  3. Verify updatedAt added
  4. Test updates both fields

#### TC-NODE-UPDATE-006: Change from batch to individual update mode
- **Description**: Change update mode from batch to individual hooks
- **Prompt**: "将更新节点改为触发个体钩子模式"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "individualHooks": true,
    "filter": {
      "id": { "$eq": "{{$context.data.id}}" }
    },
    "values": {
      "status": "approved"
    }
  }
}
```
- **Validation Points**:
  - individualHooks should change from `false` to `true`
- **Test Steps**:
  1. Create workflow with batch update (individualHooks: false)
  2. Execute skill with edit prompt
  3. Verify mode changed
  4. Test update triggers individual hooks

## Test Data Requirements
- `orders` collection with fields: `id`, `userId`, `status`, `shippedAt`, `updatedAt`
- User context for user-based updates
- Workflow with order trigger context