# Workflow Output (output) Node Tests

## Overview
Tests for the `output` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-OUTPUT-001: Add output node returning calculation result
- **Description**: Add output node to return total amount from workflow
- **Prompt**: "增加工作流输出节点，返回计算的总金额"
- **Expected Configuration**:
```json
{
  "value": {
    "total": "{{ $context.data.total }}",
    "count": "{{ $context.data.count }}"
  }
}
```
- **Validation Points**:
  - Node type should be `output`
  - value should contain total and count from context
- **Test Steps**:
  1. Create workflow with calculation node producing total and count
  2. Execute skill with the prompt
  3. Verify output node added with correct configuration
  4. Test workflow returns correct output values

### Editing Scenarios

#### TC-NODE-OUTPUT-002: Change output to single status value
- **Description**: Update output node to return only status instead of multiple values
- **Prompt**: "将工作流输出节点改为只返回状态值"
- **Expected Configuration** (updated):
```json
{
  "value": "{{ $context.data.status }}"
}
```
- **Validation Points**:
  - value should change from object to simple string reference
  - Should reference status instead of total and count
- **Test Steps**:
  1. Create workflow with output node returning multiple values
  2. Execute skill with edit prompt
  3. Verify output simplified to single status value
  4. Test workflow returns status only

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [output.md](../../references/nodes/output.md) for detailed configuration options.
