import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'update',
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
    'TC-NODE-UPDATE-001: Add node to update order status to "paid"',
    suite.runCase({
      id: 'TC-NODE-UPDATE-001',
      description: 'Add node to update order status to "paid"',
      prompt: '在订单创建后执行的工作流中增加一个更新节点，将订单状态更新为已支付',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          individualHooks: false,
          filter: {
            id: {
              $eq: '{{$context.data.id}}',
            },
          },
          values: {
            status: 'paid',
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    "TC-NODE-UPDATE-002: Add node to batch update user's orders with individual hooks",
    suite.runCase({
      id: 'TC-NODE-UPDATE-002',
      description: "Add node to batch update user's orders with individual hooks",
      prompt: '增加更新节点，批量更新当前用户的所有订单为已完成，并触发个体钩子',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          individualHooks: true,
          filter: {
            userId: {
              $eq: '{{$context.user.id}}',
            },
          },
          values: {
            status: 'completed',
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-UPDATE-003: Add node to update both status and completion time',
    suite.runCase({
      id: 'TC-NODE-UPDATE-003',
      description: 'Add node to update both status and completion time',
      prompt: "增加更新节点，更新订单状态为'shipped'并设置发货时间",
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          individualHooks: false,
          filter: {
            id: {
              $eq: '{{$context.data.id}}',
            },
          },
          values: {
            status: 'shipped',
            shippedAt: '{{$context.date}}',
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-UPDATE-004: Modify status value in existing update node',
    suite.runCase({
      id: 'TC-NODE-UPDATE-004',
      description: 'Modify status value in existing update node',
      prompt: "在更新节点中，将状态从'approved'改为'rejected'",
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'update',
            config: {
              collection: 'orders',
              usingAssignFormSchema: true,
              assignFormSchema: {},
              params: {
                individualHooks: false,
                filter: {
                  id: {
                    $eq: '{{$context.data.id}}',
                  },
                },
                values: {
                  status: 'approved',
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'orders',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          individualHooks: false,
          filter: {
            id: {
              $eq: '{{$context.data.id}}',
            },
          },
          values: {
            status: 'rejected',
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-UPDATE-005: Add timestamp field to existing update',
    suite.runCase({
      id: 'TC-NODE-UPDATE-005',
      description: 'Add timestamp field to existing update',
      prompt: '在更新节点中增加更新时间字段',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'update',
            config: {
              collection: 'orders',
              usingAssignFormSchema: true,
              assignFormSchema: {},
              params: {
                individualHooks: false,
                filter: {
                  id: {
                    $eq: '{{$context.data.id}}',
                  },
                },
                values: {
                  status: 'approved',
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'orders',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          individualHooks: false,
          filter: {
            id: {
              $eq: '{{$context.data.id}}',
            },
          },
          values: {
            status: 'approved',
            updatedAt: '{{$context.date}}',
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-UPDATE-006: Change update mode from batch to individual hooks',
    suite.runCase({
      id: 'TC-NODE-UPDATE-006',
      description: 'Change update mode from batch to individual hooks',
      prompt: '将更新节点改为触发个体钩子模式',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'update',
            config: {
              collection: 'orders',
              usingAssignFormSchema: true,
              assignFormSchema: {},
              params: {
                individualHooks: false,
                filter: {
                  id: {
                    $eq: '{{$context.data.id}}',
                  },
                },
                values: {
                  status: 'approved',
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'orders',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          individualHooks: true,
          filter: {
            id: {
              $eq: '{{$context.data.id}}',
            },
          },
          values: {
            status: 'approved',
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
