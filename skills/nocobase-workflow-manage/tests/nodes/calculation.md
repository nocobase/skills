# Calculation Node Tests

## Overview
Tests for the `calculation` node type which performs calculations using various expression engines.

## Test Cases

### Creation Scenarios

#### TC-NODE-CALCULATION-001: Add calculation for total order amount
- **Description**: Add calculation node to compute total order amount (quantity * price)
- **Prompt**: "增加计算节点，计算订单总金额（数量乘以单价）"
- **Expected Configuration**:
```json
{
  "engine": "formula.js",
  "expression": "{{$context.data.quantity}} * {{$context.data.price}}"
}
```
- **Validation Points**:
  - Node type should be `calculation`
  - Engine should be `formula.js` (default)
  - Expression should multiply quantity and price fields
  - Variables should reference trigger data
- **Test Steps**:
  1. Create workflow with collection trigger on orders
  2. Execute skill with the prompt
  3. Verify calculation node added with correct expression
  4. Test with sample data (quantity=2, price=50 → result=100)

#### TC-NODE-CALCULATION-002: Add calculation with math.js engine
- **Description**: Add calculation using math.js engine for complex math
- **Prompt**: "使用math.js引擎计算订单金额的平方根"
- **Expected Configuration**:
```json
{
  "engine": "math.js",
  "expression": "sqrt({{$context.data.amount}})"
}
```
- **Validation Points**:
  - Engine should be explicitly `math.js`
  - Expression should use sqrt function
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify engine set to math.js
  3. Test with amount=100 → result=10

#### TC-NODE-CALCULATION-003: Add string concatenation calculation
- **Description**: Add calculation to concatenate strings
- **Prompt**: "增加计算节点，拼接客户姓名和订单号"
- **Expected Configuration**:
```json
{
  "engine": "string",
  "expression": "Customer: {{$context.data.customerName}} - Order: {{$context.data.orderNumber}}"
}
```
- **Validation Points**:
  - Engine should be `string` for string templating
  - Expression should concatenate text and variables
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify string engine and concatenation expression
  3. Test with sample data

#### TC-NODE-CALCULATION-004: Add calculation with conditional logic
- **Description**: Add calculation with conditional (if-else) expression
- **Prompt**: "计算折扣后金额：如果金额大于100则打9折，否则不打折"
- **Expected Configuration**:
```json
{
  "engine": "formula.js",
  "expression": "{{$context.data.amount}} > 100 ? {{$context.data.amount}} * 0.9 : {{$context.data.amount}}"
}
```
- **Validation Points**:
  - Expression should contain ternary operator
  - Condition checks amount > 100
  - True branch applies 10% discount
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify conditional expression
  3. Test with amount=150 (result=135) and amount=80 (result=80)

### Editing Scenarios

#### TC-NODE-CALCULATION-005: Modify calculation expression
- **Description**: Update calculation from simple multiplication to include tax
- **Prompt**: "修改计算节点，在总金额上增加10%的税"
- **Expected Configuration** (updated):
```json
{
  "engine": "formula.js",
  "expression": "{{$context.data.quantity}} * {{$context.data.price}} * 1.1"
}
```
- **Validation Points**:
  - Expression should multiply by 1.1 for 10% tax
  - Engine unchanged
- **Test Steps**:
  1. Create workflow with quantity*price calculation
  2. Execute skill with edit prompt
  3. Verify expression updated to include tax
  4. Test calculation

#### TC-NODE-CALCULATION-007: Add calculation referencing previous node result
- **Description**: Add calculation that uses output from previous calculation node
- **Prompt**: "增加计算节点，基于前一个计算节点的结果计算平均值"
- **Expected Configuration**:
```json
{
  "engine": "formula.js",
  "expression": "{{$jobsMapByNodeKey.previousCalculationNode}} / {{$context.data.itemCount}}"
}
```
- **Validation Points**:
  - Expression should reference previous node's result
  - Uses `$jobsMapByNodeKey` variable syntax
- **Test Steps**:
  1. Create workflow with previous calculation node (key: previousCalculationNode)
  2. Execute skill with edit prompt
  3. Verify expression references previous node result
  4. Test calculation chain

## Test Data Requirements
- Workflow with `collection` trigger on `orders` table
- `orders` collection fields: `quantity` (number), `price` (number), `amount` (number), `customerName` (string), `orderNumber` (string)
- Previous calculation node in workflow for reference tests
