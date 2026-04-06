# Scheduled Task (schedule) Trigger Tests

## Overview
Tests for the `schedule` trigger type which triggers workflows based on time rules (custom time or data table time field).

## Test Cases

### Creation Scenarios

#### TC-TRIGGER-SCHEDULE-001: Create daily scheduled workflow
- **Description**: Create a workflow triggered daily at 9 AM
- **Prompt**: "创建一个每天上午9点执行的定时工作流"
- **Expected Configuration**:
```json
{
  "mode": 0,
  "startsOn": "2026-03-31T09:00:00.000Z",  // Note: Date should be current date or future
  "repeat": "0 0 9 * * *"
}
```
- **Validation Points**:
  - Trigger type should be `schedule`
  - Mode should be `0` (custom time)
  - Repeat should be cron expression for 9 AM daily
  - StartsOn should be today's date at 9 AM (or future if current time past 9 AM)
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify cron expression matches daily 9 AM
  3. Verify startsOn is set correctly
  4. Schedule the workflow and verify it triggers at expected time

#### TC-TRIGGER-SCHEDULE-002: Create workflow triggered every 30 minutes
- **Description**: Create a workflow triggered every 30 minutes starting now
- **Prompt**: "创建一个每30分钟执行一次的工作流"
- **Expected Configuration**:
```json
{
  "mode": 0,
  "startsOn": "2026-03-31T10:30:00.000Z",  // Current time or next 30-minute interval
  "repeat": 1800000  // 30 minutes in milliseconds
}
```
- **Validation Points**:
  - Repeat should be `1800000` (30 minutes in milliseconds) or cron "0 */30 * * * *"
  - StartsOn should be current time or next 30-minute boundary
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify repeat interval is 30 minutes
  3. Schedule workflow and verify it triggers approximately every 30 minutes

#### TC-TRIGGER-SCHEDULE-003: Create workflow based on order creation time
- **Description**: Create workflow triggered 30 minutes after order creation
- **Prompt**: "创建一个工作流，在订单创建30分钟后触发"
- **Expected Configuration**:
```json
{
  "mode": 1,
  "collection": "orders",
  "startsOn": {
    "field": "createdAt",
    "offset": 30,
    "unit": 60000
  }
}
```
- **Validation Points**:
  - Mode should be `1` (data table time field)
  - Collection should be `orders`
  - StartsOn should have field `createdAt`, offset 30, unit 60000 (minutes)
- **Test Steps**:
  1. Ensure `orders` collection exists with `createdAt` field
  2. Execute skill with the prompt
  3. Verify configuration matches expected
  4. Create an order and verify workflow triggers 30 minutes later

#### TC-TRIGGER-SCHEDULE-004: Create workflow with end date and limit
- **Description**: Create hourly workflow with end date and execution limit
- **Prompt**: "创建一个每小时执行的工作流，到2026年底结束，最多执行100次"
- **Expected Configuration**:
```json
{
  "mode": 0,
  "startsOn": "2026-03-31T11:00:00.000Z",
  "repeat": "0 0 * * * *",
  "endsOn": "2026-12-31T23:59:59.999Z",
  "limit": 100
}
```
- **Validation Points**:
  - Repeat should be hourly cron
  - EndsOn should be end of 2026
  - Limit should be 100
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify endsOn and limit are set
  3. Schedule workflow and verify it respects limits

#### TC-TRIGGER-SCHEDULE-005: Change from custom time to data table time mode
- **Description**: Change trigger mode from custom time to data table time field
- **Prompt**: "创建一个基于订单创建时间触发的工作流，触发时间为订单创建30分钟后"
- **Expected Configuration** (updated):
```json
{
  "mode": 1,
  "collection": "orders",
  "startsOn": {
    "field": "createdAt",
    "offset": 30,
    "unit": 60000
  }
}
```

- **Validation Points**:
  - Mode should be `1`
  - Collection should be set to `orders`
  - StartsOn should reference `createdAt` field, and have correct offset and unit
- **Test Steps**:
  1. Create workflow with custom time schedule
  2. Verify configuration
  3. Create an order and verify trigger timing

### Editing Scenarios

#### TC-TRIGGER-SCHEDULE-006: Change schedule from daily to weekly
- **Description**: Modify existing schedule from daily to weekly execution
- **Prompt**: "将工作流的触发时间从每天改为每周一上午9点"
- **Expected Configuration** (updated):
```json
{
  "mode": 0,
  "startsOn": "2026-03-31T09:00:00.000Z",  // Adjusted to next Monday
  "repeat": "0 0 9 * * 1"  // Monday at 9 AM
}
```
- **Validation Points**:
  - Repeat should change to weekly Monday cron
  - StartsOn may adjust to next Monday
- **Test Steps**:
  1. Create workflow with daily schedule
  2. Execute skill with edit prompt
  3. Verify repeat changed to weekly
  4. Verify workflow triggers on Mondays only

#### TC-TRIGGER-SCHEDULE-007: Add preloaded relationships to data table time trigger
- **Description**: Add relationship preloading to existing data table time trigger
- **Prompt**: "在基于订单时间触发的工作流中预加载创建人信息"
- **Expected Configuration** (updated):
```json
{
  "mode": 1,
  "collection": "orders",
  "startsOn": {
    "field": "createdAt",
    "offset": 30,
    "unit": 60000
  },
  "appends": ["createdBy"]
}
```
- **Validation Points**:
  - Appends should include `createdBy` relationship
  - Other configuration preserved
- **Test Steps**:
  1. Create workflow with data table time trigger
  2. Execute skill with edit prompt
  3. Verify appends added
  4. Test trigger and verify createdBy data is loaded

## Test Data Requirements
- `orders` collection with `createdAt` timestamp field
- `createdBy` relationship on orders collection
- System clock should be accurate for time-based tests
