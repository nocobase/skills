import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'subflow',
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
    'TC-NODE-SUBFLOW-001: Add Call Workflow node to workflow',
    suite.runCase({
      id: 'TC-NODE-SUBFLOW-001',
      description: 'Add Call Workflow node to workflow',
      prompt: '增加Call Workflow节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-SUBFLOW-002: Update configuration of existing Call Workflow node',
    suite.runCase({
      id: 'TC-NODE-SUBFLOW-002',
      description: 'Update configuration of existing Call Workflow node',
      prompt: '修改Call Workflow节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
