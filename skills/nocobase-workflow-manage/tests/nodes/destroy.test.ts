import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'destroy',
  workflow: {
    type: 'collection',
    sync: false,
    config: {
      collection: 'orders',
      mode: 1,
      appends: [],
    },
  },
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-NODE-DESTROY-001: Add node to delete canceled order records',
    suite.runCase({
      id: 'TC-NODE-DESTROY-001',
      description: 'Add node to delete canceled order records',
      prompt: "增加删除节点，删除状态为'canceled'的订单",
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        params: {
          filter: {
            status: {
              $eq: 'canceled',
            },
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-DESTROY-002: Add node to delete log records older than 30 days',
    suite.runCase({
      id: 'TC-NODE-DESTROY-002',
      description: 'Add node to delete log records older than 30 days',
      prompt: '增加删除节点，删除30天前的日志记录',
      scenario: 'create',
      expectedConfig: {
        collection: 'logs',
        params: {
          filter: {
            createdAt: {
              $lt: '{{$context.date - 30*86400000}}',
            },
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-DESTROY-003: Add node to delete specific order by ID',
    suite.runCase({
      id: 'TC-NODE-DESTROY-003',
      description: 'Add node to delete specific order by ID',
      prompt: '增加删除节点，删除指定的订单',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        params: {
          filter: {
            id: {
              $eq: '{{$context.data.id}}',
            },
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-DESTROY-004: Modify filter to delete different status',
    suite.runCase({
      id: 'TC-NODE-DESTROY-004',
      description: 'Modify filter to delete different status',
      prompt: "将删除节点改为删除状态为'expired'的记录",
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'destroy',
            config: {
              collection: 'orders',
              params: {
                filter: {
                  status: {
                    $eq: 'canceled',
                  },
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'orders',
        params: {
          filter: {
            status: {
              $eq: 'expired',
            },
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-DESTROY-005: Add date condition to existing delete filter',
    suite.runCase({
      id: 'TC-NODE-DESTROY-005',
      description: 'Add date condition to existing delete filter',
      prompt: '在删除节点中增加条件，只删除30天前的取消订单',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'destroy',
            config: {
              collection: 'orders',
              params: {
                filter: {
                  status: {
                    $eq: 'canceled',
                  },
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'orders',
        params: {
          filter: {
            $and: [
              {
                status: {
                  $eq: 'canceled',
                },
              },
              {
                createdAt: {
                  $lt: '{{$context.date - 30*86400000}}',
                },
              },
            ],
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-DESTROY-006: Change delete from orders to archivedOrders',
    suite.runCase({
      id: 'TC-NODE-DESTROY-006',
      description: 'Change delete from orders to archivedOrders',
      prompt: '将删除节点改为针对归档订单表',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'destroy',
            config: {
              collection: 'orders',
              params: {
                filter: {
                  status: {
                    $eq: 'canceled',
                  },
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'archivedOrders',
        params: {
          filter: {
            status: {
              $eq: 'canceled',
            },
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
