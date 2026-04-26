# Response Message (response-message) Node Tests

## Overview
Tests for the `response-message` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-RESPONSE_MESSAGE-001: Add Response Message node
- **Description**: Add Response Message node to workflow
- **Prompt**: "增加Response Message节点"
- **Expected Configuration**:
```json
{
  // Configuration based on response-message documentation
}
```
- **Validation Points**:
  - Node type should be `response-message`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-RESPONSE_MESSAGE-002: Modify existing Response Message node
- **Description**: Update configuration of existing Response Message node
- **Prompt**: "修改Response Message节点的配置"
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
  1. Create workflow with response-message node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [response-message.md](response-message.md) for detailed configuration options.
