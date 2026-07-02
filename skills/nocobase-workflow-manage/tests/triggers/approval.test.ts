import { afterEach, describe, it } from 'vitest';
import { createTriggerTestContext } from '../helpers/agent-test-suite';

const suite = createTriggerTestContext({
  type: 'approval',
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-TRIGGER-APPROVAL-001: Create approval workflow for expenses with preloaded details',
    suite.runCase({
      id: 'TC-TRIGGER-APPROVAL-001',
      description: 'Create approval workflow for expenses with preloaded details',
      prompt: '创建一个费用报销的审批工作流，预加载明细和部门信息',
      scenario: 'create',
      expectedConfig: {
        collection: 'expenses',
        mode: 0,
        centralized: false,
        audienceType: 1,
        recordShowMode: false,
        appends: ['details', 'department'],
        withdrawable: false,
        useSameTaskTitle: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-APPROVAL-002: Create workflow where approval occurs before data is saved',
    suite.runCase({
      id: 'TC-TRIGGER-APPROVAL-002',
      description: 'Create workflow where approval occurs before data is saved',
      prompt: '创建一个审批前保存的工作流（数据在审批通过后才写入）',
      scenario: 'create',
      expectedConfig: {
        collection: 'expenses',
        mode: 1,
        centralized: false,
        audienceType: 1,
        recordShowMode: false,
        appends: [],
        withdrawable: false,
        useSameTaskTitle: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-APPROVAL-003: Create approval workflow with centralized initiation and notifications',
    suite.runCase({
      id: 'TC-TRIGGER-APPROVAL-003',
      description: 'Create approval workflow with centralized initiation and notifications',
      prompt: '创建一个集中式审批工作流，允许从待办中心发起，并发送应用内通知',
      scenario: 'create',
      expectedConfig: {
        collection: 'expenses',
        mode: 0,
        centralized: true,
        audienceType: 1,
        recordShowMode: false,
        appends: [],
        withdrawable: false,
        useSameTaskTitle: false,
        notifications: [
          {
            channel: 'in-app',
            templateType: 'template',
            template: 1,
          },
        ],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-APPROVAL-004: Modify approval trigger mode',
    suite.runCase({
      id: 'TC-TRIGGER-APPROVAL-004',
      description: 'Modify approval trigger mode',
      prompt: '将审批工作流改为审批前保存模式',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'approval',
          sync: false,
          config: {
            collection: 'expenses',
            mode: 0,
            centralized: false,
            audienceType: 1,
            recordShowMode: false,
            appends: ['details', 'department'],
            withdrawable: false,
            useSameTaskTitle: false,
          },
        },
      },
      expectedConfig: {
        collection: 'expenses',
        mode: 1,
        centralized: false,
        audienceType: 1,
        recordShowMode: false,
        appends: ['details', 'department'],
        withdrawable: false,
        useSameTaskTitle: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-APPROVAL-005: Add relationship preloading to existing approval trigger',
    suite.runCase({
      id: 'TC-TRIGGER-APPROVAL-005',
      description: 'Add relationship preloading to existing approval trigger',
      prompt: '在审批触发器中预加载相关项目和审批历史',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'approval',
          sync: false,
          config: {
            collection: 'expenses',
            mode: 0,
            centralized: false,
            audienceType: 1,
            recordShowMode: false,
            appends: ['details', 'department'],
            withdrawable: false,
            useSameTaskTitle: false,
          },
        },
      },
      expectedConfig: {
        collection: 'expenses',
        mode: 0,
        centralized: false,
        audienceType: 1,
        recordShowMode: false,
        appends: ['project', 'approvalHistory'],
        withdrawable: false,
        useSameTaskTitle: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-APPROVAL-006: Enable withdrawal and unified task title features',
    suite.runCase({
      id: 'TC-TRIGGER-APPROVAL-006',
      description: 'Enable withdrawal and unified task title features',
      prompt: "允许申请人撤回审批，并使用统一的任务标题'费用审批：{{$context.data.title}}'",
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'approval',
          sync: false,
          config: {
            collection: 'expenses',
            mode: 0,
            centralized: false,
            audienceType: 1,
            recordShowMode: false,
            appends: ['details', 'department'],
            withdrawable: false,
            useSameTaskTitle: false,
          },
        },
      },
      expectedConfig: {
        collection: 'expenses',
        mode: 0,
        centralized: false,
        audienceType: 1,
        recordShowMode: false,
        appends: ['details', 'department'],
        withdrawable: true,
        useSameTaskTitle: true,
        taskTitle: '费用审批：{{$context.data.title}}',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
