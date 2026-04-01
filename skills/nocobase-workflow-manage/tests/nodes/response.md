# Response (for webhook) (response) Node Tests

## Overview
Tests for the `response` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-RESPONSE-001: Add Response (for webhook) node
- **Description**: Add Response (for webhook) node to workflow
- **Prompt**: "增加Response (for webhook)节点"
- **Expected Configuration**:
```json
{
  // Configuration based on response documentation
}
```
- **Validation Points**:
  - Node type should be `response`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-RESPONSE-002: Modify existing Response (for webhook) node
- **Description**: Update configuration of existing Response (for webhook) node
- **Prompt**: "修改Response (for webhook)节点的配置"
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
  1. Create workflow with response node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [response.md](response.md) for detailed configuration options.
