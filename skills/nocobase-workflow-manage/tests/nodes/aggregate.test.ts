import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'aggregate',
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
    'TC-NODE-AGGREGATE-001: Add aggregate node to count paid orders',
    suite.runCase({
      id: 'TC-NODE-AGGREGATE-001',
      description: 'Add aggregate node to count paid orders',
      prompt: '增加聚合查询节点，统计已支付订单数量',
      scenario: 'create',
      expectedConfig: {
        aggregator: 'count',
        associated: false,
        collection: 'orders',
        params: {
          field: 'id',
          filter: {
            status: {
              $eq: 'paid',
            },
          },
          distinct: true,
        },
        precision: 2,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-AGGREGATE-002: Update aggregate node to sum order amounts instead of counting',
    suite.runCase({
      id: 'TC-NODE-AGGREGATE-002',
      description: 'Update aggregate node to sum order amounts instead of counting',
      prompt: '将聚合查询节点改为计算订单金额总和',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'aggregate',
            config: {
              aggregator: 'count',
              associated: false,
              collection: 'orders',
              params: {
                field: 'id',
                filter: {
                  status: {
                    $eq: 'paid',
                  },
                },
                distinct: true,
              },
              precision: 2,
            },
          },
        ],
      },
      expectedConfig: {
        aggregator: 'sum',
        associated: false,
        collection: 'orders',
        params: {
          field: 'amount',
          filter: {
            status: {
              $eq: 'paid',
            },
          },
          distinct: false,
        },
        precision: 2,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
