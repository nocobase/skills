import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'approval',
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
    'TC-NODE-CREATE-001: Add node to create log entry for order events',
    suite.runCase({
      id: 'TC-NODE-CREATE-001',
      description: 'Add node to create log entry for order events',
      prompt: '在订单创建事件中，创建一个新增数据节点，用于记录发货信息',
      scenario: 'create',
      expectedConfig: {
        collection: 'orderLogs',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          values: {
            orderId: '{{$context.data.id}}',
            eventType: '{{$context.data.status}}',
            timestamp: '{{$context.date}}',
          },
          appends: [],
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CREATE-002: Add node to create notification for order approval',
    suite.runCase({
      id: 'TC-NODE-CREATE-002',
      description: 'Add node to create notification for order approval',
      prompt: '为订单审批增加新增数据节点，创建通知记录',
      scenario: 'create',
      expectedConfig: {
        collection: 'notifications',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          values: {
            userId: '{{$context.data.userId}}',
            message: '订单 {{$context.data.orderNumber}} 需要审批',
            type: 'approval',
            createdAt: '{{$context.date}}',
          },
          appends: [],
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CREATE-003: Add node to create record with mixed constant and variable values',
    suite.runCase({
      id: 'TC-NODE-CREATE-003',
      description: 'Add node to create record with mixed constant and variable values',
      prompt: "增加新增数据节点，创建状态为'pending'的审核记录",
      scenario: 'create',
      expectedConfig: {
        collection: 'reviews',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          values: {
            targetId: '{{$context.data.id}}',
            targetType: 'order',
            status: 'pending',
            assignedTo: '{{$context.data.assignedUserId}}',
          },
          appends: [],
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CREATE-004: Update field values in existing create node',
    suite.runCase({
      id: 'TC-NODE-CREATE-004',
      description: 'Update field values in existing create node',
      prompt: "在创建节点中，将通知类型从'approval'改为'reminder'",
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'create',
            config: {
              collection: 'notifications',
              usingAssignFormSchema: true,
              assignFormSchema: {},
              params: {
                values: {
                  userId: '{{$context.data.userId}}',
                  message: '订单 {{$context.data.orderNumber}} 需要审批',
                  type: 'approval',
                  createdAt: '{{$context.date}}',
                },
                appends: [],
              },
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'notifications',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          values: {
            userId: '{{$context.data.userId}}',
            message: '订单 {{$context.data.orderNumber}} 需要审批',
            type: 'reminder',
            createdAt: '{{$context.date}}',
          },
          appends: [],
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CREATE-005: Add additional field to existing create node',
    suite.runCase({
      id: 'TC-NODE-CREATE-005',
      description: 'Add additional field to existing create node',
      prompt: "在创建节点中增加优先级字段，值为'high'",
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'create',
            config: {
              collection: 'notifications',
              usingAssignFormSchema: true,
              assignFormSchema: {},
              params: {
                values: {
                  userId: '{{$context.data.userId}}',
                  message: '订单 {{$context.data.orderNumber}} 需要审批',
                  type: 'approval',
                  createdAt: '{{$context.date}}',
                },
                appends: [],
              },
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'notifications',
        usingAssignFormSchema: true,
        assignFormSchema: {},
        params: {
          values: {
            userId: '{{$context.data.userId}}',
            message: '订单 {{$context.data.orderNumber}} 需要审批',
            type: 'approval',
            priority: 'high',
            createdAt: '{{$context.date}}',
          },
          appends: [],
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
