import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'calculation',
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
    'TC-NODE-CALCULATION-001: Add calculation node to compute total order amount (quantity * price)',
    suite.runCase({
      id: 'TC-NODE-CALCULATION-001',
      description: 'Add calculation node to compute total order amount (quantity * price)',
      prompt: '增加计算节点，计算订单总金额（数量乘以单价）',
      scenario: 'create',
      expectedConfig: {
        engine: 'formula.js',
        expression: '{{$context.data.quantity}} * {{$context.data.price}}',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CALCULATION-002: Add calculation using math.js engine for complex math',
    suite.runCase({
      id: 'TC-NODE-CALCULATION-002',
      description: 'Add calculation using math.js engine for complex math',
      prompt: '使用math.js引擎计算订单金额的平方根',
      scenario: 'create',
      expectedConfig: {
        engine: 'math.js',
        expression: 'sqrt({{$context.data.amount}})',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CALCULATION-003: Add calculation to concatenate strings',
    suite.runCase({
      id: 'TC-NODE-CALCULATION-003',
      description: 'Add calculation to concatenate strings',
      prompt: '增加计算节点，拼接客户姓名和订单号',
      scenario: 'create',
      expectedConfig: {
        engine: 'string',
        expression: 'Customer: {{$context.data.customerName}} - Order: {{$context.data.orderNumber}}',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CALCULATION-004: Add calculation with conditional (if-else) expression',
    suite.runCase({
      id: 'TC-NODE-CALCULATION-004',
      description: 'Add calculation with conditional (if-else) expression',
      prompt: '计算折扣后金额：如果金额大于100则打9折，否则不打折',
      scenario: 'create',
      expectedConfig: {
        engine: 'formula.js',
        expression: '{{$context.data.amount}} > 100 ? {{$context.data.amount}} * 0.9 : {{$context.data.amount}}',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CALCULATION-005: Update calculation from simple multiplication to include tax',
    suite.runCase({
      id: 'TC-NODE-CALCULATION-005',
      description: 'Update calculation from simple multiplication to include tax',
      prompt: '修改计算节点，在总金额上增加10%的税',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'calculation',
            config: {
              engine: 'formula.js',
              expression: '{{$context.data.quantity}} * {{$context.data.price}}',
            },
          },
        ],
      },
      expectedConfig: {
        engine: 'formula.js',
        expression: '{{$context.data.quantity}} * {{$context.data.price}} * 1.1',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CALCULATION-006: Switch calculation engine from formula.js to math.js',
    suite.runCase({
      id: 'TC-NODE-CALCULATION-006',
      description: 'Switch calculation engine from formula.js to math.js',
      prompt: '将计算节点改为使用math.js引擎',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'calculation',
            config: {
              engine: 'formula.js',
              expression: '{{$context.data.quantity}} * {{$context.data.price}}',
            },
          },
        ],
      },
      expectedConfig: {
        engine: 'math.js',
        expression: '{{$context.data.quantity}} * {{$context.data.price}}',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-CALCULATION-007: Add calculation that uses output from previous calculation node',
    suite.runCase({
      id: 'TC-NODE-CALCULATION-007',
      description: 'Add calculation that uses output from previous calculation node',
      prompt: '增加计算节点，基于前一个计算节点的结果计算平均值',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            key: 'previousCalculationNode',
            type: 'calculation',
            config: {
              engine: 'formula.js',
              expression: '{{$context.data.totalAmount}}',
            },
          },
        ],
      },
      resultNode: 'new',
      expectedConfig: {
        engine: 'formula.js',
        expression: '{{$jobsMapByNodeKey.previousCalculationNode.result}} / {{$context.data.itemCount}}',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
