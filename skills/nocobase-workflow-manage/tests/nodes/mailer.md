# Send Email (mailer) Node Tests

## Overview
Tests for the `mailer` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-MAILER-001: Add Send Email node
- **Description**: Add Send Email node to workflow
- **Prompt**: "增加邮件发送节点，邮件标题是“感谢注册”"
- **Expected Configuration**:
```json
{
  "title": "感谢注册",
}
```
- **Validation Points**:
  - Node type should be `mailer`
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
Refer to [mailer.md](mailer.md) for detailed configuration options.
