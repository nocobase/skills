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
    'TC-NODE-CONDITION-001: Add condition node checking if order amount > 100',
    suite.runCase({
      id: 'TC-NODE-CONDITION-001',
      description: 'Add condition node checking if order amount > 100',
      prompt: '在工作流开头增加一个条件判断，检查订单金额是否大于100',
      scenario: 'create',
      expectedConfig: {
        rejectOnFalse: false,
        engine: 'basic',
        calculation: {
          group: {
            type: 'and',
            calculations: [
              {
                calculator: 'gt',
                operands: ['{{$context.data.amount}}', 100],
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
    'TC-NODE-CONDITION-002: Add condition checking order status and amount',
    suite.runCase({
      id: 'TC-NODE-CONDITION-002',
      description: 'Add condition checking order status and amount',
      prompt: "增加条件判断，检查订单状态为'approved'且金额大于500",
      scenario: 'create',
      expectedConfig: {
        rejectOnFalse: false,
        engine: 'basic',
        calculation: {
          group: {
            type: 'and',
            calculations: [
              {
                calculator: 'equal',
                operands: ['{{$context.data.status}}', 'approved'],
              },
              {
                calculator: 'gt',
                operands: ['{{$context.data.amount}}', 500],
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
    'TC-NODE-CONDITION-003: Add condition checking either status or amount',
    suite.runCase({
      id: 'TC-NODE-CONDITION-003',
      description: 'Add condition checking either status or amount',
      prompt: "增加条件判断，检查订单状态为'pending'或金额小于50",
      scenario: 'create',
      expectedConfig: {
        rejectOnFalse: false,
        engine: 'basic',
        calculation: {
          group: {
            type: 'or',
            calculations: [
              {
                calculator: 'equal',
                operands: ['{{$context.data.status}}', 'pending'],
              },
              {
                calculator: 'lt',
                operands: ['{{$context.data.amount}}', 50],
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
    'TC-NODE-CONDITION-004: Add complex condition with nested AND/OR logic',
    suite.runCase({
      id: 'TC-NODE-CONDITION-004',
      description: 'Add complex condition with nested AND/OR logic',
      prompt: "增加条件判断，检查(状态为'approved'且金额>100)或状态为'priority'",
      scenario: 'create',
      expectedConfig: {
        rejectOnFalse: false,
        engine: 'basic',
        calculation: {
          group: {
            type: 'or',
            calculations: [
              {
                group: {
                  type: 'and',
                  calculations: [
                    {
                      calculator: 'equal',
                      operands: ['{{$context.data.status}}', 'approved'],
                    },
                    {
                      calculator: 'gt',
                      operands: ['{{$context.data.amount}}', 100],
                    },
                  ],
                },
              },
              {
                calculator: 'equal',
                operands: ['{{$context.data.status}}', 'priority'],
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
    'TC-NODE-CONDITION-005: Update condition threshold from 100 to 200',
    suite.runCase({
      id: 'TC-NODE-CONDITION-005',
      description: 'Update condition threshold from 100 to 200',
      prompt: '将条件判断中的金额阈值从100改为200',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'condition',
            config: {
              rejectOnFalse: false,
              engine: 'basic',
              calculation: {
                group: {
                  type: 'and',
                  calculations: [
                    {
                      calculator: 'gt',
                      operands: ['{{$context.data.amount}}', 100],
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        rejectOnFalse: false,
        engine: 'basic',
        calculation: {
          group: {
            type: 'and',
            calculations: [
              {
                calculator: 'gt',
                operands: ['{{$context.data.amount}}', 200],
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
    'TC-NODE-CONDITION-006: Change condition from yes/no branching to reject-on-false mode',
    suite.runCase({
      id: 'TC-NODE-CONDITION-006',
      description: 'Change condition from yes/no branching to reject-on-false mode',
      prompt: '将条件判断改为仅当条件为真时继续，否则结束工作流',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'condition',
            config: {
              rejectOnFalse: false,
              engine: 'basic',
              calculation: {
                group: {
                  type: 'and',
                  calculations: [
                    {
                      calculator: 'gt',
                      operands: ['{{$context.data.amount}}', 100],
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        rejectOnFalse: true,
        engine: 'basic',
        calculation: {
          group: {
            type: 'and',
            calculations: [
              {
                calculator: 'gt',
                operands: ['{{$context.data.amount}}', 100],
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
    'TC-NODE-CONDITION-007: Add additional check to existing condition group',
    suite.runCase({
      id: 'TC-NODE-CONDITION-007',
      description: 'Add additional check to existing condition group',
      prompt: "在现有条件中增加对客户等级的判断，要求客户等级为'VIP'",
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'condition',
            config: {
              rejectOnFalse: false,
              engine: 'basic',
              calculation: {
                group: {
                  type: 'and',
                  calculations: [
                    {
                      calculator: 'gt',
                      operands: ['{{$context.data.amount}}', 100],
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      expectedConfig: {
        rejectOnFalse: false,
        engine: 'basic',
        calculation: {
          group: {
            type: 'and',
            calculations: [
              {
                calculator: 'gt',
                operands: ['{{$context.data.amount}}', 100],
              },
              {
                calculator: 'equal',
                operands: ['{{$context.data.customer.tier}}', 'VIP'],
              },
            ],
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
