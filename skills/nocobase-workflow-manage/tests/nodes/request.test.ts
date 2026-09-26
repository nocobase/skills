import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'request',
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
    'TC-NODE-REQUEST-001: Add HTTP Request node to workflow',
    suite.runCase({
      id: 'TC-NODE-REQUEST-001',
      description: 'Add HTTP Request node to workflow',
      prompt: '增加HTTP Request节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-REQUEST-002: Update configuration of existing HTTP Request node',
    suite.runCase({
      id: 'TC-NODE-REQUEST-002',
      description: 'Update configuration of existing HTTP Request node',
      prompt: '修改HTTP Request节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
