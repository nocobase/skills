import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'end',
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
    'TC-NODE-END-001: Add end node to terminate workflow with failure',
    suite.runCase({
      id: 'TC-NODE-END-001',
      description: 'Add end node to terminate workflow with failure',
      prompt: '增加结束工作流节点，以失败状态结束',
      scenario: 'create',
      expectedConfig: {
        endStatus: -1,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-END-002: Update end node to terminate with success instead of failure',
    suite.runCase({
      id: 'TC-NODE-END-002',
      description: 'Update end node to terminate with success instead of failure',
      prompt: '将结束工作流节点改为以成功状态结束',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'end',
            config: {
              endStatus: -1,
            },
          },
        ],
      },
      expectedConfig: {
        endStatus: 1,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
