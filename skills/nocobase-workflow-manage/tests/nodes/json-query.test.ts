import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'json-query',
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
    'TC-NODE-JSON_QUERY-001: Add JSON Query node to workflow',
    suite.runCase({
      id: 'TC-NODE-JSON_QUERY-001',
      description: 'Add JSON Query node to workflow',
      prompt: '增加JSON Query节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-JSON_QUERY-002: Update configuration of existing JSON Query node',
    suite.runCase({
      id: 'TC-NODE-JSON_QUERY-002',
      description: 'Update configuration of existing JSON Query node',
      prompt: '修改JSON Query节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
