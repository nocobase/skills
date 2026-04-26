# Delay (delay) Node Tests

## Overview
Tests for the `delay` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-DELAY-001: Add Delay node for 5-minute timeout
- **Description**: Add Delay node to wait 5 minutes before continuing
- **Prompt**: "增加延迟节点，等待5分钟后继续"
- **Expected Configuration**:
```json
{
  "unit": 60000,
  "duration": 5,
  "endStatus": 1
}
```
- **Validation Points**:
  - Node type should be `delay`
  - unit should be 60000 (minutes)
  - duration should be 5
  - endStatus should be 1 (continue after delay)
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct configuration
  4. Test workflow waits 5 minutes before continuing

### Editing Scenarios

#### TC-NODE-DELAY-002: Change delay to 1 hour with failure exit
- **Description**: Update delay configuration to wait 1 hour then fail
- **Prompt**: "将延迟节点改为等待1小时后失败退出"
- **Expected Configuration** (updated):
```json
{
  "unit": 3600000,
  "duration": 1,
  "endStatus": -1
}
```
- **Validation Points**:
  - unit should change from 60000 to 3600000 (hours)
  - duration should be 1
  - endStatus should change from 1 to -1 (fail after delay)
- **Test Steps**:
  1. Create workflow with 5-minute delay node
  2. Execute skill with edit prompt
  3. Verify configuration updated to 1-hour timeout with failure
  4. Test workflow fails after 1 hour delay

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [delay.md](../../references/nodes/delay.md) for detailed configuration options.
