# JSON Query (json-query) Node Tests

## Overview
Tests for the `json-query` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-JSON_QUERY-001: Add JSON Query node
- **Description**: Add JSON Query node to workflow
- **Prompt**: "增加JSON Query节点"
- **Expected Configuration**:
```json
{
  // Configuration based on json-query documentation
}
```
- **Validation Points**:
  - Node type should be `json-query`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-JSON_QUERY-002: Modify existing JSON Query node
- **Description**: Update configuration of existing JSON Query node
- **Prompt**: "修改JSON Query节点的配置"
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
  1. Create workflow with json-query node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [json-query.md](json-query.md) for detailed configuration options.
