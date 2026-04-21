# Workflow Output (output) Node Tests

## Overview
Tests for the `output` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-OUTPUT-001: Add output node returning calculation result
- **Description**: Add output node to return total amount from workflow
- **Prompt**: "增加流程输出节点，返回计算的总金额"
- **Expected Configuration**:
```json
{
  "value": {
    "total": "{{ $context.data.total }}"
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

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [output.md](../../references/nodes/output.md) for detailed configuration options.
