# Multi-condition Branch (multi-condition) Node Tests

## Overview
Tests for the `multi-condition` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-MULTI_CONDITION-001: Add multi-condition for order status
- **Description**: Add multi-condition node to route based on order status
- **Prompt**: "增加多条件分支节点，根据订单状态选择不同分支"
- **Expected Configuration**:
```json
{
  "conditions": [
    {
      "uid": "c1",
      "title": "Approved",
      "engine": "basic",
      "calculation": {
        "group": {
          "type": "and",
          "calculations": [
            {
              "calculator": "equal",
              "operands": ["{{ $context.data.status }}", "approved"]
            }
          ]
        }
      }
    },
    {
      "uid": "c2",
      "title": "Rejected",
      "engine": "basic",
      "calculation": {
        "group": {
          "type": "and",
          "calculations": [
            {
              "calculator": "equal",
              "operands": ["{{ $context.data.status }}", "rejected"]
            }
          ]
        }
      }
    }
  ],
  "continueOnNoMatch": true
}
```
- **Validation Points**:
  - Node type should be `multi-condition`
  - Two conditions for "approved" and "rejected" statuses
  - continueOnNoMatch should be true (continue if no match)
- **Test Steps**:
  1. Create workflow with order trigger
  2. Execute skill with the prompt
  3. Verify node added with correct configuration
  4. Test workflow routes based on order status

### Editing Scenarios

#### TC-NODE-MULTI_CONDITION-002: Add amount condition and change to fail on no match
- **Description**: Add third condition for high amount and change to fail if no match
- **Prompt**: "在多条件分支中增加金额大于1000的条件，并改为无匹配时失败"
- **Expected Configuration** (updated):
```json
{
  "conditions": [
    {
      "uid": "c1",
      "title": "Approved",
      "engine": "basic",
      "calculation": {
        "group": {
          "type": "and",
          "calculations": [
            {
              "calculator": "equal",
              "operands": ["{{ $context.data.status }}", "approved"]
            }
          ]
        }
      }
    },
    {
      "uid": "c2",
      "title": "Rejected",
      "engine": "basic",
      "calculation": {
        "group": {
          "type": "and",
          "calculations": [
            {
              "calculator": "equal",
              "operands": ["{{ $context.data.status }}", "rejected"]
            }
          ]
        }
      }
    },
    {
      "uid": "c3",
      "title": "Amount > 1000",
      "engine": "math.js",
      "expression": "{{ $context.data.amount }} > 1000"
    }
  ],
  "continueOnNoMatch": false
}
```
- **Validation Points**:
  - Third condition added for amount > 1000
  - Engine changed to math.js for amount condition
  - continueOnNoMatch changed from true to false
- **Test Steps**:
  1. Create workflow with two-condition multi-condition node
  2. Execute skill with edit prompt
  3. Verify third condition added and continueOnNoMatch changed
  4. Test workflow fails if no condition matches

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [multi-conditions.md](../../references/nodes/multi-conditions.md) for detailed configuration options.
