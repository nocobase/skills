import { afterEach, describe, it } from 'vitest';
import { createTriggerTestContext } from '../helpers/agent-test-suite';

const suite = createTriggerTestContext({
  type: 'custom-action',
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-TRIGGER-CUSTOM-ACTION-001: Create workflow with global custom data context',
    suite.runCase({
      id: 'TC-TRIGGER-CUSTOM-ACTION-001',
      description: 'Create workflow with global custom data context',
      prompt: '创建一个全局自定义数据的工作流，通过按钮手动触发',
      scenario: 'create',
      expectedConfig: {
        type: 0,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-CUSTOM-ACTION-002: Create workflow bound to single order record',
    suite.runCase({
      id: 'TC-TRIGGER-CUSTOM-ACTION-002',
      description: 'Create workflow bound to single order record',
      prompt: '创建一个针对单个订单记录的工作流，预加载客户信息',
      scenario: 'create',
      expectedConfig: {
        type: 1,
        collection: 'orders',
        appends: ['customer'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-CUSTOM-ACTION-003: Create workflow for batch operations on multiple orders',
    suite.runCase({
      id: 'TC-TRIGGER-CUSTOM-ACTION-003',
      description: 'Create workflow for batch operations on multiple orders',
      prompt: '创建一个针对多个订单记录的工作流',
      scenario: 'create',
      expectedConfig: {
        type: 2,
        collection: 'orders',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-CUSTOM-ACTION-004: Modify trigger from global to single record context',
    suite.runCase({
      id: 'TC-TRIGGER-CUSTOM-ACTION-004',
      description: 'Modify trigger from global to single record context',
      prompt: '将工作流改为针对单个订单记录触发',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'custom-action',
          sync: false,
          config: {
            type: 0,
          },
        },
      },
      expectedConfig: {
        type: 1,
        collection: 'orders',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-CUSTOM-ACTION-005: Add relationship preloading to existing single record trigger',
    suite.runCase({
      id: 'TC-TRIGGER-CUSTOM-ACTION-005',
      description: 'Add relationship preloading to existing single record trigger',
      prompt: '在单个订单记录触发器中预加载订单明细和客户信息',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'custom-action',
          sync: false,
          config: {
            type: 1,
            collection: 'orders',
          },
        },
      },
      expectedConfig: {
        type: 1,
        collection: 'orders',
        appends: ['orderDetails', 'customer'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-CUSTOM-ACTION-006: Modify trigger from single to multiple records context',
    suite.runCase({
      id: 'TC-TRIGGER-CUSTOM-ACTION-006',
      description: 'Modify trigger from single to multiple records context',
      prompt: '将工作流改为针对多个订单记录批量触发',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'custom-action',
          sync: false,
          config: {
            type: 1,
            collection: 'orders',
            appends: ['customer'],
          },
        },
      },
      expectedConfig: {
        type: 2,
        collection: 'orders',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
