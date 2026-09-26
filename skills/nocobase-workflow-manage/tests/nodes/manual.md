# Manual Process (manual) Node Tests

## Overview
Tests for the `manual` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-MANUAL-001: Add Manual Process node
- **Description**: Add Manual Process node to workflow
- **Prompt**: "增加人工处理节点，指定管理员处理"
- **Expected Configuration**:
```json
{
  // Configuration based on manual documentation
}
```
- **Validation Points**:
  - Node type should be `manual`
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
Refer to [manual.md](manual.md) for detailed configuration options.
