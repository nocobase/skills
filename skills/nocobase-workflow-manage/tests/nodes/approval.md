# Approval (approval) Node Tests

## Overview
Tests for the `approval` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-APPROVAL-001: Add Approval node
- **Description**: Add Approval node to workflow
- **Prompt**: "增加Approval节点"
- **Expected Configuration**:
```json
{
  // Configuration based on approval documentation
}
```
- **Validation Points**:
  - Node type should be `approval`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-APPROVAL-002: Modify existing Approval node
- **Description**: Update configuration of existing Approval node
- **Prompt**: "修改Approval节点的配置"
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
  1. Create workflow with approval node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [approval.md](approval.md) for detailed configuration options.
