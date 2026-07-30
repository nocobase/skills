# SQL Operation (sql) Node Tests

## Overview
Tests for the `sql` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-SQL-001: Add SQL Operation node
- **Description**: Add SQL Operation node to workflow
- **Prompt**: "增加 SQL 节点，查询最新发表的一篇文章"
- **Expected Configuration**:
```json
{
  // Configuration based on sql documentation
}
```
- **Validation Points**:
  - Node type should be `sql`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

#### TC-NODE-SQL-002: Modify existing SQL Operation node
- **Description**: Update configuration of existing SQL Operation node
- **Prompt**: "使用 SQL 节点将订单中涉及商品的库存扣减"
- **Expected Configuration** (updated):
```json
{
  // Updated configuration
}
```
- **Validation Points**:
  - Configuration should be updated
  - Node type unchanged
- **Test Steps**:
  1. Create workflow with sql node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [sql.md](sql.md) for detailed configuration options.
