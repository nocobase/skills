# JavaScript (script) Node Tests

## Overview
Tests for the `script` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-SCRIPT-001: Add JavaScript node
- **Description**: Add JavaScript node to workflow
- **Prompt**: "增加JavaScript节点"
- **Expected Configuration**:
```json
{
  // Configuration based on script documentation
}
```
- **Validation Points**:
  - Node type should be `script`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-SCRIPT-002: Modify existing JavaScript node
- **Description**: Update configuration of existing JavaScript node
- **Prompt**: "修改JavaScript节点的配置"
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
  1. Create workflow with script node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [script.md](script.md) for detailed configuration options.
