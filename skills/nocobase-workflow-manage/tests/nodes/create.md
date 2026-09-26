# Create Node Tests

## Overview
Tests for the `create` node type which creates new records in collections.

## Test Cases

### Creation Scenarios

#### TC-NODE-CREATE-001: Add node to create shipping record for order events
- **Description**: Add node to create `shippingRecords` entry for order events
- **Prompt**: "在订单提交后执行的工作流 中，创建一个新增数据节点，用于记录发货信息"
- **Expected Configuration**:
```json
{
  "collection": "shippingRecords",
  "usingAssignFormSchema": true,
  "assignFormSchema": {

  },
  "params": {
    "values": {
      "orderNo": "{{$context.data.id}}",
      "timestamp": "{{$context.date}}"
    },
    "appends": []
  }
}
```
- **Validation Points**:
  - Node type should be `create`
  - Collection should be `shippingRecords`
  - Values should reference trigger data and context
  - Includes timestamp from context
- **Test Steps**:
  1. Create workflow with order trigger
  2. Execute skill with the prompt
  3. Verify create configuration
  4. Test workflow creates log record
