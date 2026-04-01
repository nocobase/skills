# Manual Process (manual) Node Tests

## Overview
Tests for the `manual` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-MANUAL-001: Add Manual Process node
- **Description**: Add Manual Process node to workflow
- **Prompt**: "增加Manual Process节点"
- **Expected Configuration**:
```json
{
  // Configuration based on manual documentation
}
```
- **Validation Points**:
  - Node type should be `manual`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-MANUAL-002: Modify existing Manual Process node
- **Description**: Update configuration of existing Manual Process node
- **Prompt**: "修改Manual Process节点的配置"
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
  1. Create workflow with manual node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [manual.md](manual.md) for detailed configuration options.
