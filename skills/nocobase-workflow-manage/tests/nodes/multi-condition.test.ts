import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'and',
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
    'TC-NODE-MULTI_CONDITION-001: Add multi-condition node to route based on order status',
    suite.runCase({
      id: 'TC-NODE-MULTI_CONDITION-001',
      description: 'Add multi-condition node to route based on order status',
      prompt: '增加多条件分支节点，根据订单状态选择不同分支',
      scenario: 'create',
      expectedConfig: {
        conditions: [
          {
            uid: 'c1',
            title: 'Approved',
            engine: 'basic',
            calculation: {
              group: {
                type: 'and',
                calculations: [
                  {
                    calculator: 'equal',
                    operands: ['{{ $context.data.status }}', 'approved'],
                  },
                ],
              },
            },
          },
          {
            uid: 'c2',
            title: 'Rejected',
            engine: 'basic',
            calculation: {
              group: {
                type: 'and',
                calculations: [
                  {
                    calculator: 'equal',
                    operands: ['{{ $context.data.status }}', 'rejected'],
                  },
                ],
              },
            },
          },
        ],
        continueOnNoMatch: true,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-MULTI_CONDITION-002: Add third condition for high amount and change to fail if no match',
    suite.runCase({
      id: 'TC-NODE-MULTI_CONDITION-002',
      description: 'Add third condition for high amount and change to fail if no match',
      prompt: '在多条件分支中增加金额大于1000的条件，并改为无匹配时失败',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'multi-condition',
            config: {
              conditions: [
                {
                  uid: 'c1',
                  title: 'Approved',
                  engine: 'basic',
                  calculation: {
                    group: {
                      type: 'and',
                      calculations: [
                        {
                          calculator: 'equal',
                          operands: ['{{ $context.data.status }}', 'approved'],
                        },
                      ],
                    },
                  },
                },
                {
                  uid: 'c2',
                  title: 'Rejected',
                  engine: 'basic',
                  calculation: {
                    group: {
                      type: 'and',
                      calculations: [
                        {
                          calculator: 'equal',
                          operands: ['{{ $context.data.status }}', 'rejected'],
                        },
                      ],
                    },
                  },
                },
              ],
              continueOnNoMatch: true,
            },
          },
        ],
      },
      expectedConfig: {
        conditions: [
          {
            uid: 'c1',
            title: 'Approved',
            engine: 'basic',
            calculation: {
              group: {
                type: 'and',
                calculations: [
                  {
                    calculator: 'equal',
                    operands: ['{{ $context.data.status }}', 'approved'],
                  },
                ],
              },
            },
          },
          {
            uid: 'c2',
            title: 'Rejected',
            engine: 'basic',
            calculation: {
              group: {
                type: 'and',
                calculations: [
                  {
                    calculator: 'equal',
                    operands: ['{{ $context.data.status }}', 'rejected'],
                  },
                ],
              },
            },
          },
          {
            uid: 'c3',
            title: 'Amount > 1000',
            engine: 'math.js',
            expression: '{{ $context.data.amount }} > 1000',
          },
        ],
        continueOnNoMatch: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
