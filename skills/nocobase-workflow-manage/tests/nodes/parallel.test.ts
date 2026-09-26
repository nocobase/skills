import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'parallel',
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
    'TC-NODE-PARALLEL-001: Add Parallel Branch node to workflow',
    suite.runCase({
      id: 'TC-NODE-PARALLEL-001',
      description: 'Add Parallel Branch node to workflow',
      prompt: '增加Parallel Branch节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-PARALLEL-002: Update configuration of existing Parallel Branch node',
    suite.runCase({
      id: 'TC-NODE-PARALLEL-002',
      description: 'Update configuration of existing Parallel Branch node',
      prompt: '修改Parallel Branch节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
