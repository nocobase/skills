# Approval Events (approval) Trigger Tests

## Overview
Tests for the `approval` trigger type which triggers workflows for approval processes.

## Test Cases

### Creation Scenarios

#### TC-TRIGGER-APPROVAL-001: Create basic expense approval workflow
- **Description**: Create approval workflow for expenses with preloaded details
- **Prompt**: "创建一个费用报销的审批工作流，预加载明细和部门信息"
- **Expected Configuration**:
```json
{
  "collection": "expenses",
  "mode": 0,
  "centralized": false,
  "audienceType": 1,
  "recordShowMode": false,
  "appends": ["details", "department"],
  "withdrawable": false,
  "useSameTaskTitle": false
}
```
- **Validation Points**:
  - Trigger type should be `approval`
  - Collection should be `expenses`
  - Mode should be `0` (approval after saving)
  - Appends should include details and department
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Create expense record and initiate approval
  4. Verify workflow triggers

#### TC-TRIGGER-APPROVAL-002: Create approval-before-save workflow
- **Description**: Create workflow where approval occurs before data is saved
- **Prompt**: "创建一个审批前保存的工作流（数据在审批通过后才写入）"
- **Expected Configuration**:
```json
{
  "collection": "expenses",
  "mode": 1,
  "centralized": false,
  "audienceType": 1,
  "recordShowMode": false,
  "appends": [],
  "withdrawable": false,
  "useSameTaskTitle": false
}
```
- **Validation Points**:
  - Mode should be `1` (approval before saving)
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify mode is 1
  3. Test approval flow - data should not be saved until approved

#### TC-TRIGGER-APPROVAL-003: Create centralized approval with notifications
- **Description**: Create approval workflow with centralized initiation and notifications
- **Prompt**: "创建一个集中式审批工作流，允许从待办中心发起，并发送应用内通知"
- **Expected Configuration**:
```json
{
  "collection": "expenses",
  "mode": 0,
  "centralized": true,
  "audienceType": 1,
  "recordShowMode": false,
  "appends": [],
  "withdrawable": false,
  "useSameTaskTitle": false,
  "notifications": [
    {
      "channel": "in-app",
      "templateType": "template",
      "template": 1
    }
  ]
}
```
- **Validation Points**:
  - Centralized should be `true`
  - Notifications array should contain in-app notification
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify centralized and notifications settings
  3. Initiate approval from pending center
  4. Verify notification sent on completion

### Editing Scenarios

#### TC-TRIGGER-APPROVAL-004: Change approval mode from after-save to before-save
- **Description**: Modify approval trigger mode
- **Prompt**: "将审批工作流改为审批前保存模式"
- **Expected Configuration** (updated):
```json
{
  "collection": "expenses",
  "mode": 1,
  "centralized": false,
  "audienceType": 1,
  "recordShowMode": false,
  "appends": ["details", "department"],
  "withdrawable": false,
  "useSameTaskTitle": false
}
```
- **Validation Points**:
  - Mode should change from `0` to `1`
  - Other settings preserved
- **Test Steps**:
  1. Create approval workflow with mode 0
  2. Execute skill with edit prompt
  3. Verify mode updated
  4. Test approval flow behavior changed

#### TC-TRIGGER-APPROVAL-005: Add preloaded relationships
- **Description**: Add relationship preloading to existing approval trigger
- **Prompt**: "在审批触发器中预加载相关项目和审批历史"
- **Expected Configuration** (updated):
```json
{
  "collection": "expenses",
  "mode": 0,
  "centralized": false,
  "audienceType": 1,
  "recordShowMode": false,
  "appends": ["project", "approvalHistory"],
  "withdrawable": false,
  "useSameTaskTitle": false
}
```
- **Validation Points**:
  - Appends should include new relationships
- **Test Steps**:
  1. Create approval workflow without appends
  2. Execute skill with edit prompt
  3. Verify appends added
  4. Test approval and verify data includes relationships

#### TC-TRIGGER-APPROVAL-006: Enable withdrawable and unified task title
- **Description**: Enable withdrawal and unified task title features
- **Prompt**: "允许申请人撤回审批，并使用统一的任务标题'费用审批：{{$context.data.title}}'"
- **Expected Configuration** (updated):
```json
{
  "collection": "expenses",
  "mode": 0,
  "centralized": false,
  "audienceType": 1,
  "recordShowMode": false,
  "appends": ["details", "department"],
  "withdrawable": true,
  "useSameTaskTitle": true,
  "taskTitle": "费用审批：{{$context.data.title}}"
}
```
- **Validation Points**:
  - Withdrawable should change to `true`
  - useSameTaskTitle should be `true`
  - taskTitle should be set with template
- **Test Steps**:
  1. Create approval workflow without these features
  2. Execute skill with edit prompt
  3. Verify settings updated
  4. Test withdrawal functionality
  5. Verify task titles are unified

## Test Data Requirements
- `expenses` collection with fields: `title` (string)
- Relationships: `details` (hasMany), `department` (belongsTo), `project` (belongsTo), `approvalHistory` (hasMany)
- Approval center/Pending center for centralized testing
- Notification channels configured