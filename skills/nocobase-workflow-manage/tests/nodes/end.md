# End Workflow (end) Node Tests

## Overview
Tests for the `end` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-END-001: Add end node with failure status
- **Description**: Add end node to terminate workflow with failure
- **Prompt**: "增加结束工作流节点，以失败状态结束"
- **Expected Configuration**:
```json
{
  "endStatus": -1
}
```
- **Validation Points**:
  - Node type should be `end`
  - endStatus should be -1 (failure)
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct configuration
  4. Test workflow terminates with failure status

### Editing Scenarios

#### TC-NODE-END-002: Change end status from failure to success
- **Description**: Update end node to terminate with success instead of failure
- **Prompt**: "将结束工作流节点改为以成功状态结束"
- **Expected Configuration** (updated):
```json
{
  "endStatus": 1
}
```
- **Validation Points**:
  - endStatus should change from -1 to 1 (success)
- **Test Steps**:
  1. Create workflow with end node configured for failure
  2. Execute skill with edit prompt
  3. Verify endStatus updated to success
  4. Test workflow terminates with success status

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [end.md](../../references/nodes/end.md) for detailed configuration options.
