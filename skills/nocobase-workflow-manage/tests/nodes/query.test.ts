import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'query',
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
    "TC-NODE-QUERY-001: Add query node to fetch current user's orders",
    suite.runCase({
      id: 'TC-NODE-QUERY-001',
      description: "Add query node to fetch current user's orders",
      prompt: '增加查询节点，获取当前用户的订单列表',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        multiple: true,
        params: {
          filter: {
            userId: '{{$context.user.id}}',
          },
          sort: [
            {
              field: 'createdAt',
              direction: 'desc',
            },
          ],
          page: 1,
          pageSize: 20,
          appends: [],
        },
        failOnEmpty: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-QUERY-002: Add query to fetch single order with preloaded details',
    suite.runCase({
      id: 'TC-NODE-QUERY-002',
      description: 'Add query to fetch single order with preloaded details',
      prompt: '增加查询节点，获取单个订单及其明细',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        multiple: false,
        params: {
          filter: {
            id: '{{$context.data.id}}',
          },
          appends: ['orderDetails'],
        },
        failOnEmpty: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-QUERY-003: Add query with multiple filter conditions',
    suite.runCase({
      id: 'TC-NODE-QUERY-003',
      description: 'Add query with multiple filter conditions',
      prompt: "增加查询节点，查找状态为'pending'且金额大于100的订单",
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        multiple: true,
        params: {
          filter: {
            $and: [
              {
                status: {
                  $eq: 'pending',
                },
              },
              {
                amount: {
                  $gt: 100,
                },
              },
            ],
          },
        },
        failOnEmpty: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-QUERY-004: Add query that fails workflow if no records found',
    suite.runCase({
      id: 'TC-NODE-QUERY-004',
      description: 'Add query that fails workflow if no records found',
      prompt: '增加查询节点，如果找不到记录则使工作流失败',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        multiple: false,
        params: {
          filter: {
            id: '{{$context.data.id}}',
          },
        },
        failOnEmpty: true,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-QUERY-005: Add sorting and pagination to existing query',
    suite.runCase({
      id: 'TC-NODE-QUERY-005',
      description: 'Add sorting and pagination to existing query',
      prompt: '在查询节点中增加按金额降序排序，每页显示10条',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'query',
            config: {
              collection: 'orders',
              multiple: true,
              params: {
                filter: {
                  userId: '{{$context.user.id}}',
                },
                sort: [
                  {
                    field: 'createdAt',
                    direction: 'desc',
                  },
                ],
                page: 1,
                pageSize: 20,
                appends: [],
              },
              failOnEmpty: false,
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'orders',
        multiple: true,
        params: {
          filter: {
            userId: '{{$context.user.id}}',
          },
          sort: [
            {
              field: 'amount',
              direction: 'desc',
            },
          ],
          page: 1,
          pageSize: 10,
          appends: [],
        },
        failOnEmpty: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-QUERY-006: Change query from returning array to single record',
    suite.runCase({
      id: 'TC-NODE-QUERY-006',
      description: 'Change query from returning array to single record',
      prompt: '将查询节点改为只返回单个订单',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'query',
            config: {
              collection: 'orders',
              multiple: true,
              params: {
                filter: {
                  userId: '{{$context.user.id}}',
                },
                sort: [
                  {
                    field: 'createdAt',
                    direction: 'desc',
                  },
                ],
                page: 1,
                pageSize: 20,
                appends: [],
              },
              failOnEmpty: false,
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'orders',
        multiple: false,
        params: {
          filter: {
            userId: '{{$context.user.id}}',
          },
          sort: [
            {
              field: 'createdAt',
              direction: 'desc',
            },
          ],
        },
        failOnEmpty: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-QUERY-007: Add relationship preloading to existing query',
    suite.runCase({
      id: 'TC-NODE-QUERY-007',
      description: 'Add relationship preloading to existing query',
      prompt: '在查询节点中预加载客户和产品信息',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'query',
            config: {
              collection: 'orders',
              multiple: true,
              params: {
                filter: {
                  userId: '{{$context.user.id}}',
                },
                sort: [
                  {
                    field: 'createdAt',
                    direction: 'desc',
                  },
                ],
                page: 1,
                pageSize: 20,
                appends: [],
              },
              failOnEmpty: false,
            },
          },
        ],
      },
      expectedConfig: {
        collection: 'orders',
        multiple: true,
        params: {
          filter: {
            userId: '{{$context.user.id}}',
          },
          sort: [
            {
              field: 'createdAt',
              direction: 'desc',
            },
          ],
          page: 1,
          pageSize: 20,
          appends: ['customer', 'product'],
        },
        failOnEmpty: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
