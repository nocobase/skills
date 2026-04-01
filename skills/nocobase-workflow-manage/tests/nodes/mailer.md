# Send Email (mailer) Node Tests

## Overview
Tests for the `mailer` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-MAILER-001: Add Send Email node
- **Description**: Add Send Email node to workflow
- **Prompt**: "增加Send Email节点"
- **Expected Configuration**:
```json
{
  // Configuration based on mailer documentation
}
```
- **Validation Points**:
  - Node type should be `mailer`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-MAILER-002: Modify existing Send Email node
- **Description**: Update configuration of existing Send Email node
- **Prompt**: "修改Send Email节点的配置"
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
  1. Create workflow with mailer node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [mailer.md](mailer.md) for detailed configuration options.
