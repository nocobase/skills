import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'output',
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
    'TC-NODE-OUTPUT-001: Add output node to return total amount from workflow',
    suite.runCase({
      id: 'TC-NODE-OUTPUT-001',
      description: 'Add output node to return total amount from workflow',
      prompt: '增加工作流输出节点，返回计算的总金额',
      scenario: 'create',
      expectedConfig: {
        value: {
          total: '{{ $context.data.total }}',
          count: '{{ $context.data.count }}',
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-OUTPUT-002: Update output node to return only status instead of multiple values',
    suite.runCase({
      id: 'TC-NODE-OUTPUT-002',
      description: 'Update output node to return only status instead of multiple values',
      prompt: '将工作流输出节点改为只返回状态值',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'output',
            config: {
              value: {
                total: '{{ $context.data.total }}',
                count: '{{ $context.data.count }}',
              },
            },
          },
        ],
      },
      expectedConfig: {
        value: '{{ $context.data.status }}',
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
