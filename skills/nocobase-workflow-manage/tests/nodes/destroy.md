# Destroy Node Tests

## Overview
Tests for the `destroy` node type which deletes records from collections.

## Test Cases

### Creation Scenarios

#### TC-NODE-DESTROY-001: Add node to delete canceled orders
- **Description**: Add node to delete canceled order records
- **Prompt**: "增加删除节点，删除状态为'canceled'的订单"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "params": {
    "filter": {
      "status": { "$eq": "canceled" }
    }
  }
}
```
- **Validation Points**:
  - Node type should be `destroy`
  - Collection should be `orders`
  - Filter should match status = "canceled"
- **Test Steps**:
  1. Create workflow (e.g., scheduled trigger)
  2. Execute skill with the prompt
  3. Verify delete configuration
  4. Test workflow deletes canceled orders

#### TC-NODE-DESTROY-002: Add node to delete old logs
- **Description**: Add node to delete log records older than 30 days
- **Prompt**: "增加删除节点，删除30天前的日志记录"
- **Expected Configuration**:
```json
{
  "collection": "logs",
  "params": {
    "filter": {
      "createdAt": { "$lt": "{{$context.date - 30*86400000}}" }
    }
  }
}
```
- **Validation Points**:
  - Collection should be `logs`
  - Filter should check createdAt < (current date - 30 days)
  - Uses date calculation in filter
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify filter with date calculation
  3. Test deletes old logs

#### TC-NODE-DESTROY-003: Add node to delete specific record
- **Description**: Add node to delete specific order by ID
- **Prompt**: "增加删除节点，删除指定的订单"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "params": {
    "filter": {
      "id": { "$eq": "{{$context.data.id}}" }
    }
  }
}
```
- **Validation Points**:
  - Filter should match ID from trigger data
  - Single record deletion
- **Test Steps**:
  1. Create workflow with order trigger
  2. Execute skill with the prompt
  3. Verify filter references trigger ID
  4. Test deletes specific order

### Editing Scenarios

#### TC-NODE-DESTROY-004: Change delete criteria
- **Description**: Modify filter to delete different status
- **Prompt**: "将删除节点改为删除状态为'expired'的记录"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "params": {
    "filter": {
      "status": { "$eq": "expired" }
    }
  }
}
```
- **Validation Points**:
  - Filter should change from "canceled" to "expired"
- **Test Steps**:
  1. Create workflow with delete canceled orders
  2. Execute skill with edit prompt
  3. Verify filter updated
  4. Test deletes expired orders instead

#### TC-NODE-DESTROY-005: Add additional filter condition
- **Description**: Add date condition to existing delete filter
- **Prompt**: "在删除节点中增加条件，只删除30天前的取消订单"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "params": {
    "filter": {
      "$and": [
        { "status": { "$eq": "canceled" } },
        { "createdAt": { "$lt": "{{$context.date - 30*86400000}}" } }
      ]
    }
  }
}
```
- **Validation Points**:
  - Filter should have AND with two conditions
  - Adds date condition
- **Test Steps**:
  1. Create workflow with status-only delete
  2. Execute skill with edit prompt
  3. Verify AND condition added
  4. Test only deletes old canceled orders

#### TC-NODE-DESTROY-006: Change target collection
- **Description**: Change delete from orders to archivedOrders
- **Prompt**: "将删除节点改为针对归档订单表"
- **Expected Configuration** (updated):
```json
{
  "collection": "archivedOrders",
  "params": {
    "filter": {
      "status": { "$eq": "canceled" }
    }
  }
}
```
- **Validation Points**:
  - Collection should change from `orders` to `archivedOrders`
  - Filter preserved
- **Test Steps**:
  1. Create workflow deleting from orders
  2. Execute skill with edit prompt
  3. Verify collection updated
  4. Test deletes from archivedOrders

## Test Data Requirements
- Collections: `orders`, `logs`, `archivedOrders`
- Fields: `status`, `createdAt`, `id`
- Date calculation support in filters