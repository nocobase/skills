import { afterEach, describe, it } from 'vitest';
import { createTriggerTestContext } from '../helpers/agent-test-suite';

const suite = createTriggerTestContext({
  type: 'collection',
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-TRIGGER-COLLECTION-001: Create a workflow triggered when new orders are created, preloading order details',
    suite.runCase({
      id: 'TC-TRIGGER-COLLECTION-001',
      description: 'Create a workflow triggered when new orders are created, preloading order details',
      prompt: '创建一个订单新增的工作流，预加载订单明细数据',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        mode: 1,
        appends: ['orderDetails'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-COLLECTION-002: Create a workflow triggered when orders are updated and total > 100',
    suite.runCase({
      id: 'TC-TRIGGER-COLLECTION-002',
      description: 'Create a workflow triggered when orders are updated and total > 100',
      prompt: '创建一个工作流，当订单更新且总金额大于100时触发',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        mode: 2,
        condition: {
          $and: [
            {
              total: {
                $gt: 100,
              },
            },
          ],
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-COLLECTION-003: Create a workflow triggered when orders are deleted',
    suite.runCase({
      id: 'TC-TRIGGER-COLLECTION-003',
      description: 'Create a workflow triggered when orders are deleted',
      prompt: '创建一个订单删除的工作流',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        mode: 4,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
