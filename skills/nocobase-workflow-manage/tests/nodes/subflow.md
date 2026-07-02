# Call Workflow (subflow) Node Tests

## Overview
Tests for the `subflow` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-SUBFLOW-001: Add Call Workflow node
- **Description**: Add Call Workflow node to workflow
- **Prompt**: "增加调用工作流的节点，调用 c-test 工作流"
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

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [subflow.md](subflow.md) for detailed configuration options.
