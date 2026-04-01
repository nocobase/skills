# JSON Variable Mapping (json-variable-mapping) Node Tests

## Overview
Tests for the `json-variable-mapping` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-JSON_VARIABLE_MAPPING-001: Add JSON Variable Mapping node
- **Description**: Add JSON Variable Mapping node to workflow
- **Prompt**: "增加JSON Variable Mapping节点"
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

### Editing Scenarios

#### TC-NODE-JSON_VARIABLE_MAPPING-002: Modify existing JSON Variable Mapping node
- **Description**: Update configuration of existing JSON Variable Mapping node
- **Prompt**: "修改JSON Variable Mapping节点的配置"
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
  1. Create workflow with json-variable-mapping node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [json-variable-mapping.md](json-variable-mapping.md) for detailed configuration options.
