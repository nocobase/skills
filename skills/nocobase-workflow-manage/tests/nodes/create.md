# Create Node Tests

## Overview
Tests for the `create` node type which creates new records in collections.

## Test Cases

### Creation Scenarios

#### TC-NODE-CREATE-001: Add node to create order log
- **Description**: Add node to create log entry for order events
- **Prompt**: "增加创建节点，为订单事件创建日志记录"
- **Expected Configuration**:
```json
{
  "collection": "orderLogs",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "values": {
      "orderId": "{{$context.data.id}}",
      "eventType": "{{$context.data.status}}",
      "timestamp": "{{$context.date}}"
    },
    "appends": []
  }
}
```
- **Validation Points**:
  - Node type should be `create`
  - Collection should be `orderLogs`
  - Values should reference trigger data and context
  - Includes timestamp from context
- **Test Steps**:
  1. Create workflow with order trigger
  2. Execute skill with the prompt
  3. Verify create configuration
  4. Test workflow creates log record

#### TC-NODE-CREATE-002: Add node to create notification record
- **Description**: Add node to create notification for order approval
- **Prompt**: "增加创建节点，为订单审批创建通知记录"
- **Expected Configuration**:
```json
{
  "collection": "notifications",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "values": {
      "userId": "{{$context.data.userId}}",
      "message": "订单 {{$context.data.orderNumber}} 需要审批",
      "type": "approval",
      "createdAt": "{{$context.date}}"
    },
    "appends": []
  }
}
```
- **Validation Points**:
  - Collection should be `notifications`
  - Values should include message with order number reference
  - Type should be "approval"
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Test workflow creates notification

#### TC-NODE-CREATE-003: Add node with constant values
- **Description**: Add node to create record with mixed constant and variable values
- **Prompt**: "增加创建节点，创建状态为'pending'的审核记录"
- **Expected Configuration**:
```json
{
  "collection": "reviews",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "values": {
      "targetId": "{{$context.data.id}}",
      "targetType": "order",
      "status": "pending",
      "assignedTo": "{{$context.data.assignedUserId}}"
    },
    "appends": []
  }
}
```
- **Validation Points**:
  - status should be constant "pending"
  - targetType should be constant "order"
  - Other values reference variables
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify mixed constant/variable values
  3. Test creates review with pending status

### Editing Scenarios

#### TC-NODE-CREATE-004: Modify values in existing create node
- **Description**: Update field values in existing create node
- **Prompt**: "在创建节点中，将通知类型从'approval'改为'reminder'"
- **Expected Configuration** (updated):
```json
{
  "collection": "notifications",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "values": {
      "userId": "{{$context.data.userId}}",
      "message": "订单 {{$context.data.orderNumber}} 需要审批",
      "type": "reminder",
      "createdAt": "{{$context.date}}"
    },
    "appends": []
  }
}
```
- **Validation Points**:
  - type should change from "approval" to "reminder"
  - Other values preserved
- **Test Steps**:
  1. Create workflow with notification create node
  2. Execute skill with edit prompt
  3. Verify type updated
  4. Test creates reminder notification

#### TC-NODE-CREATE-005: Add new field to create node
- **Description**: Add additional field to existing create node
- **Prompt**: "在创建节点中增加优先级字段，值为'high'"
- **Expected Configuration** (updated):
```json
{
  "collection": "notifications",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "values": {
      "userId": "{{$context.data.userId}}",
      "message": "订单 {{$context.data.orderNumber}} 需要审批",
      "type": "approval",
      "priority": "high",
      "createdAt": "{{$context.date}}"
    },
    "appends": []
  }
}
```
- **Validation Points**:
  - priority field should be added with value "high"
- **Test Steps**:
  1. Create workflow with notification create node
  2. Execute skill with edit prompt
  3. Verify priority field added
  4. Test creates notification with priority

#### TC-NODE-CREATE-006: Change target collection
- **Description**: Change collection for create node
- **Prompt**: "将创建节点改为在'auditLogs'表中创建记录"
- **Expected Configuration** (updated):
```json
{
  "collection": "auditLogs",
  "usingAssignFormSchema": true,
  "assignFormSchema": {},
  "params": {
    "values": {
      "orderId": "{{$context.data.id}}",
      "eventType": "{{$context.data.status}}",
      "timestamp": "{{$context.date}}"
    },
    "appends": []
  }
}
```
- **Validation Points**:
  - Collection should change from `orderLogs` to `auditLogs`
  - Values should adapt (field names may need adjustment)
- **Test Steps**:
  1. Create workflow with orderLogs create node
  2. Execute skill with edit prompt
  3. Verify collection updated
  4. Test creates audit log instead

## Test Data Requirements
- Collections: `orderLogs`, `notifications`, `reviews`, `auditLogs`
- Fields appropriate for each collection
- Workflow with order trigger context