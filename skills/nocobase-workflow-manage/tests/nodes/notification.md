# System Notification (notification) Node Tests

## Overview
Tests for the `notification` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-NOTIFICATION-001: Add System Notification node
- **Description**: Add System Notification node to workflow
- **Prompt**: "增加通知节点，使用测试渠道（站内信），给超级管理员发送 hi"
- **Expected Configuration**:
```json
{
  "channelName": "test",
  "receivers": [
    1
  ],
  "title": "hi",
}
```
- **Validation Points**:
  - Node type should be `notification`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

### Editing Scenarios

#### TC-NODE-NOTIFICATION-002: Modify existing System Notification node
- **Description**: Update configuration of existing System Notification node
- **Prompt**: "修改System Notification节点的配置"
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
  1. Create workflow with notification node
  2. Execute skill with edit prompt
  3. Verify configuration updated
  4. Test updated functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [notification.md](notification.md) for detailed configuration options.
