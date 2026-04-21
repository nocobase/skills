# JavaScript (script) Node Tests

## Overview
Tests for the `script` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-SCRIPT-001: Add JavaScript node
- **Description**: Add JavaScript node to workflow
- **Prompt**: "使用 JS 节点对请求参数进行验签处理，返回签名是否正确"
- **Expected Configuration**:
```json
{
  // Configuration based on script documentation
}
```
- **Validation Points**:
  - Node type should be `script`
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
Refer to [script.md](script.md) for detailed configuration options.
