# Condition Node Tests

## Overview
Tests for the `condition` node type which provides conditional branching in workflows.

## Test Cases

### Creation Scenarios

#### TC-NODE-CONDITION-001: Add condition check for order amount
- **Description**: Add condition node checking if order amount > 100
- **Prompt**: "在工作流开头增加一个条件判断，检查订单金额是否大于100"
- **Expected Configuration**:
```json
{
  "rejectOnFalse": false,
  "engine": "basic",
  "calculation": {
    "group": {
      "type": "and",
      "calculations": [
        {
          "calculator": "gt",
          "operands": ["{{$context.data.amount}}", 100]
        }
      ]
    }
  }
}
```
- **Validation Points**:
  - Node type should be `condition`
  - rejectOnFalse should be `false` (enables yes/no branching)
  - Engine should be `basic`
  - Calculation should check amount > 100 using `gt` calculator
  - Operands should reference trigger data variable
- **Test Steps**:
  1. Create or use existing workflow with collection trigger on orders
  2. Execute skill with the prompt
  3. Verify condition node added with correct configuration
  4. Test with order amount 150 (should follow true branch) and 50 (false branch)

#### TC-NODE-CONDITION-002: Add condition with multiple criteria
- **Description**: Add condition checking order status and amount
- **Prompt**: "增加条件判断，检查订单状态为'approved'且金额大于500"
- **Expected Configuration**:
```json
{
  "rejectOnFalse": false,
  "engine": "basic",
  "calculation": {
    "group": {
      "type": "and",
      "calculations": [
        {
          "calculator": "equal",
          "operands": ["{{$context.data.status}}", "approved"]
        },
        {
          "calculator": "gt",
          "operands": ["{{$context.data.amount}}", 500]
        }
      ]
    }
  }
}
```
- **Validation Points**:
  - Two calculations in AND group
  - First checks status equality, second checks amount > 500
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify both conditions are present
  3. Test with various status and amount combinations

#### TC-NODE-CONDITION-003: Add condition with OR logic
- **Description**: Add condition checking either status or amount
- **Prompt**: "增加条件判断，检查订单状态为'pending'或金额小于50"
- **Expected Configuration**:
```json
{
  "rejectOnFalse": false,
  "engine": "basic",
  "calculation": {
    "group": {
      "type": "or",
      "calculations": [
        {
          "calculator": "equal",
          "operands": ["{{$context.data.status}}", "pending"]
        },
        {
          "calculator": "lt",
          "operands": ["{{$context.data.amount}}", 50]
        }
      ]
    }
  }
}
```
- **Validation Points**:
  - Group type should be `or` not `and`
  - Two calculations with OR relationship
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify OR logic configuration
  3. Test with pending status (true), small amount (true), both false (false)

#### TC-NODE-CONDITION-004: Add condition with nested groups
- **Description**: Add complex condition with nested AND/OR logic
- **Prompt**: "增加条件判断，检查(状态为'approved'且金额>100)或状态为'priority'"
- **Expected Configuration**:
```json
{
  "rejectOnFalse": false,
  "engine": "basic",
  "calculation": {
    "group": {
      "type": "or",
      "calculations": [
        {
          "group": {
            "type": "and",
            "calculations": [
              {
                "calculator": "equal",
                "operands": ["{{$context.data.status}}", "approved"]
              },
              {
                "calculator": "gt",
                "operands": ["{{$context.data.amount}}", 100]
              }
            ]
          }
        },
        {
          "calculator": "equal",
          "operands": ["{{$context.data.status}}", "priority"]
        }
      ]
    }
  }
}
```
- **Validation Points**:
  - Outer OR group with two elements
  - First element is nested AND group
  - Second element is simple equality check
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify nested group structure
  3. Test with various combinations

### Editing Scenarios

#### TC-NODE-CONDITION-005: Modify condition to change comparison value
- **Description**: Update condition threshold from 100 to 200
- **Prompt**: "将条件判断中的金额阈值从100改为200"
- **Expected Configuration** (updated):
```json
{
  "rejectOnFalse": false,
  "engine": "basic",
  "calculation": {
    "group": {
      "type": "and",
      "calculations": [
        {
          "calculator": "gt",
          "operands": ["{{$context.data.amount}}", 200]
        }
      ]
    }
  }
}
```
- **Validation Points**:
  - Operand value changed from 100 to 200
  - Other configuration preserved
- **Test Steps**:
  1. Create workflow with condition checking amount > 100
  2. Execute skill with edit prompt
  3. Verify threshold updated
  4. Test with amount 150 (should be false now) and 250 (true)

#### TC-NODE-CONDITION-006: Change condition from branching to reject mode
- **Description**: Change condition from yes/no branching to reject-on-false mode
- **Prompt**: "将条件判断改为仅当条件为真时继续，否则结束工作流"
- **Expected Configuration** (updated):
```json
{
  "rejectOnFalse": true,
  "engine": "basic",
  "calculation": {
    "group": {
      "type": "and",
      "calculations": [
        {
          "calculator": "gt",
          "operands": ["{{$context.data.amount}}", 100]
        }
      ]
    }
  }
}
```
- **Validation Points**:
  - rejectOnFalse should change from `false` to `true`
  - Branching disabled
- **Test Steps**:
  1. Create workflow with branching condition
  2. Execute skill with edit prompt
  3. Verify rejectOnFalse updated
  4. Test with false condition (workflow should end with failed status)

#### TC-NODE-CONDITION-007: Add new condition to existing group
- **Description**: Add additional check to existing condition group
- **Prompt**: "在现有条件中增加对客户等级的判断，要求客户等级为'VIP'"
- **Expected Configuration** (updated):
```json
{
  "rejectOnFalse": false,
  "engine": "basic",
  "calculation": {
    "group": {
      "type": "and",
      "calculations": [
        {
          "calculator": "gt",
          "operands": ["{{$context.data.amount}}", 100]
        },
        {
          "calculator": "equal",
          "operands": ["{{$context.data.customer.tier}}", "VIP"]
        }
      ]
    }
  }
}
```
- **Validation Points**:
  - Second calculation added to AND group
  - References customer.tier field
- **Test Steps**:
  1. Create workflow with simple amount condition
  2. Execute skill with edit prompt
  3. Verify new condition added
  4. Test with VIP/non-VIP customers

## Test Data Requirements
- Workflow with `collection` trigger on `orders` table
- `orders` collection fields: `amount` (number), `status` (string)
- Relationship: `customer` with `tier` field (for customer tier tests)