# Call Workflow (subflow) Node Tests

## Overview
Tests for the `subflow` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-SUBFLOW-001: Add Call Workflow node
- **Description**: Add Call Workflow node to workflow
- **Prompt**: "增加Call Workflow节点"
- **Expected Configuration**:
```json
{
  // Configuration based on subflow documentation
}
```
- **Validation Points**:
  - Node type should be `subflow`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-SUBFLOW-002: Modify existing Call Workflow node
- **Description**: Update configuration of existing Call Workflow node
- **Prompt**: "修改Call Workflow节点的配置"
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
  1. Create workflow with subflow node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [subflow.md](subflow.md) for detailed configuration options.
