# JSON Variable Mapping (json-variable-mapping) Node Tests

## Overview
Tests for the `json-variable-mapping` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-JSON_VARIABLE_MAPPING-001: Add JSON Variable Mapping node
- **Description**: Add JSON Variable Mapping node to workflow
- **Prompt**: "添加一个 JSON 变量映射节点，将 SQL 查询结果映射为可在后续节点使用的变量"
- **Expected Configuration**:
```json
{
  // Configuration based on json-variable-mapping documentation
}
```
- **Validation Points**:
  - Node type should be `json-variable-mapping`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [json-variable-mapping.md](json-variable-mapping.md) for detailed configuration options.
