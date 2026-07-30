# Aggregate Query (aggregate) Node Tests

## Overview
Tests for the `aggregate` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-AGGREGATE-001: Add count of paid orders
- **Description**: Add aggregate node to count paid orders
- **Prompt**: "增加聚合查询节点，统计已支付订单数量"
- **Expected Configuration**:
```json
{
  "aggregator": "count",
  "associated": false,
  "collection": "orders",
  "params": {
    "field": "id",
    "filter": {
      "status": { "$eq": "paid" }
    },
    "distinct": true
  },
  "precision": 2
}
```
- **Validation Points**:
  - Node type should be `aggregate`
  - aggregator should be "count"
  - filter should match status = "paid"
  - distinct should be true
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct configuration
  4. Test node counts paid orders correctly

### Editing Scenarios

#### TC-NODE-AGGREGATE-002: Change to sum of order amounts
- **Description**: Update aggregate node to sum order amounts instead of counting
- **Prompt**: "将聚合查询节点改为计算订单金额总和"
- **Expected Configuration** (updated):
```json
{
  "aggregator": "sum",
  "associated": false,
  "collection": "orders",
  "params": {
    "field": "amount",
    "filter": {
      "status": { "$eq": "paid" }
    },
    "distinct": false
  },
  "precision": 2
}
```
- **Validation Points**:
  - aggregator should change from "count" to "sum"
  - field should change from "id" to "amount"
  - distinct should change from true to false
- **Test Steps**:
  1. Create workflow with count aggregate node
  2. Execute skill with edit prompt
  3. Verify configuration updated to sum amounts
  4. Test node sums order amounts correctly

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [aggregate.md](../../references/nodes/aggregate.md) for detailed configuration options.
