# HTTP Request (request) Node Tests

## Overview
Tests for the `request` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-REQUEST-001: Add HTTP Request node
- **Description**: Add HTTP Request node to workflow
- **Prompt**: "增加HTTP Request节点"
- **Expected Configuration**:
```json
{
  // Configuration based on request documentation
}
```
- **Validation Points**:
  - Node type should be `request`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-REQUEST-002: Modify existing HTTP Request node
- **Description**: Update configuration of existing HTTP Request node
- **Prompt**: "修改HTTP Request节点的配置"
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
  1. Create workflow with request node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [request.md](request.md) for detailed configuration options.
