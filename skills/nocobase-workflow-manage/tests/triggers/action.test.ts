import { afterEach, describe, it } from 'vitest';
import { createTriggerTestContext } from '../helpers/agent-test-suite';

const suite = createTriggerTestContext({
  type: 'action',
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-TRIGGER-ACTION-001: Create workflow triggered after order creation',
    suite.runCase({
      id: 'TC-TRIGGER-ACTION-001',
      description: 'Create workflow triggered after order creation',
      prompt: '创建一个在创建订单提交后执行的工作流',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        global: true,
        actions: ['create'],
        appends: [],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-ACTION-002: Create workflow triggered after order updates with customer data preloaded',
    suite.runCase({
      id: 'TC-TRIGGER-ACTION-002',
      description: 'Create workflow triggered after order updates with customer data preloaded',
      prompt: '创建一个在更新订单提交后执行的工作流，预加载客户信息',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        global: true,
        actions: ['update'],
        appends: ['customer'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-ACTION-003: Create workflow triggered only by specific button/operation',
    suite.runCase({
      id: 'TC-TRIGGER-ACTION-003',
      description: 'Create workflow triggered only by specific button/operation',
      prompt: '创建一个任何新增订单表单提交后执行的工作流',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        global: false,
        actions: ['create', 'update'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-ACTION-004: Modify existing action trigger from global to local mode',
    suite.runCase({
      id: 'TC-TRIGGER-ACTION-004',
      description: 'Modify existing action trigger from global to local mode',
      prompt: '将工作流改为本地模式，仅由绑定的按钮触发',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'action',
          sync: false,
          config: {
            collection: 'orders',
            global: true,
            actions: ['create', 'update'],
            appends: [],
          },
        },
      },
      expectedConfig: {
        collection: 'orders',
        global: false,
        actions: ['create', 'update'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-ACTION-005: Add relationship preloading to existing action trigger',
    suite.runCase({
      id: 'TC-TRIGGER-ACTION-005',
      description: 'Add relationship preloading to existing action trigger',
      prompt: '在动作触发器中预加载订单明细和客户信息',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'action',
          sync: false,
          config: {
            collection: 'orders',
            global: true,
            actions: ['create', 'update'],
            appends: [],
          },
        },
      },
      expectedConfig: {
        collection: 'orders',
        global: true,
        actions: ['create', 'update'],
        appends: ['orderDetails', 'customer'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-ACTION-006: Modify trigger to only respond to update actions',
    suite.runCase({
      id: 'TC-TRIGGER-ACTION-006',
      description: 'Modify trigger to only respond to update actions',
      prompt: '将工作流改为仅在订单更新时触发',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'action',
          sync: false,
          config: {
            collection: 'orders',
            global: true,
            actions: ['create', 'update'],
            appends: [],
          },
        },
      },
      expectedConfig: {
        collection: 'orders',
        global: true,
        actions: ['update'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
