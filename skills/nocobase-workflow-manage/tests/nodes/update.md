# Update Node Tests

## Overview
Tests for the `update` node type which updates records in collections.

## Test Cases

### Creation Scenarios

#### TC-NODE-UPDATE-001: Add node to update order status
- **Description**: Add node to update order status to "paid" after order creation
- **Prompt**: "在订单创建后执行的工作流中增加一个更新节点，将订单状态更新为已支付"
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
      "status": "paid"
    }
  }
}
```
- **Validation Points**:
  - Node type should be `update`
  - Collection should be `orders`
  - Filter should match order ID from trigger
  - Values should set status to "paid"
- **Test Steps**:
  1. Create workflow with order trigger
  2. Execute skill with the prompt
  3. Verify update configuration
  4. Test workflow updates order status
