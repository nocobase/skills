# Query Node Tests

## Overview
Tests for the `query` node type which queries records from collections.

## Test Cases

### Creation Scenarios

#### TC-NODE-QUERY-001: Add query for user's orders
- **Description**: Add query node to fetch current user's orders
- **Prompt**: "在“测试工作流”中增加查询节点，获取触发数据中的单个订单"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "multiple": false,
  "params": {
    "filter": {
      "userId": "{{$context.user.id}}"
    },
    "sort": [{ "field": "createdAt", "direction": "desc" }],
    "page": 1,
    "pageSize": 20,
    "appends": []
  },
  "failOnEmpty": false
}
```
- **Validation Points**:
  - Node type should be `query`
  - Collection should be `orders`
  - Multiple should be `false` (returns single record)
  - Filter should reference user ID from context
  - Default sorting by createdAt desc
- **Test Steps**:
  1. Create workflow with user context (e.g., action trigger)
  2. Execute skill with the prompt
  3. Verify query configuration
  4. Test query returns current user's orders

#### TC-NODE-QUERY-002: Add query for single order with details
- **Description**: Add query to fetch single order with preloaded details
- **Prompt**: "在“测试工作流”中增加查询节点，获取触发数据中订单创建人创建的所有订单，并预加载订单详情"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "multiple": true,
  "params": {
    "filter": {
      "$and": [
        { "createdBy.id": { "$eq": "{{$context.data.createdById}}" } }
      ]
    },
    "appends": ["orderDetails"]
  },
  "failOnEmpty": false
}
```
- **Validation Points**:
  - Multiple should be `true` (multiple records)
  - Filter should reference createdById from trigger data
  - Appends should include orderDetails
- **Test Steps**:
  1. Create workflow with order trigger
  2. Execute skill with the prompt
  3. Verify configuration
  4. Test query returns multiple orders with details

#### TC-NODE-QUERY-003: Add query with complex filters
- **Description**: Add query with multiple filter conditions
- **Prompt**: "在“测试工作流”中增加查询节点，查找状态为已创建且金额大于100的订单"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "multiple": true,
  "params": {
    "filter": {
      "$and": [
        { "status": { "$eq": "created" } },
        { "amount": { "$gt": 100 } }
      ]
    }
  },
  "failOnEmpty": false
}
```
- **Validation Points**:
  - Filter should have AND with two conditions
  - First checks status equality
  - Second checks amount > 100
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify filter structure
  3. Test query returns matching orders

#### TC-NODE-QUERY-004: Add query that fails on empty result
- **Description**: Add query that fails workflow if no records found
- **Prompt**: "在“测试工作流”中增加查询节点，查询总额超过100的订单，如果找不到记录则使工作流失败"
- **Expected Configuration**:
```json
{
  "collection": "orders",
  "multiple": false,
  "params": {
    "filter": {
      "$and": [
        { "total": { "$gt": 100 } }
      ]
    }
  },
  "failOnEmpty": true
}
```
- **Validation Points**:
  - failOnEmpty should be `true`
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify failOnEmpty set
  3. Test with non-existent ID (workflow should fail)

### Editing Scenarios

#### TC-NODE-QUERY-005: Modify query to add sorting and pagination
- **Description**: Add sorting and pagination to existing query
- **Prompt**: "在“测试工作流”中，修改查询订单节点，增加按金额降序排序，每页显示10条"
- **Expected Configuration** (updated):
```json
{
  "collection": "orders",
  "multiple": true,
  "params": {
    "filter": {
      "$and": [
        { "total": { "$lt": 100 } }
      ]
    },
    "sort": [{ "field": "total", "direction": "desc" }],
    "page": 1,
    "pageSize": 10,
    "appends": []
  },
  "failOnEmpty": false
}
```
- **Validation Points**:
  - Sort should be by amount desc
  - PageSize should be 10
- **Test Steps**:
  1. Create workflow with user orders query
  2. Execute skill with edit prompt
  3. Verify sorting and pagination added
  4. Test query returns sorted results

## Test Data Requirements
- `orders` collection with fields: `id`, `userId`, `status`, `total`, `createdAt`
- Relationships: `orderDetails` (hasMany), `customer` (belongsTo), `product` (belongsTo)
- User context for user-based queries
