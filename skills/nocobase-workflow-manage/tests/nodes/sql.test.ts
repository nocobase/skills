import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'sql',
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
    'TC-NODE-SQL-001: Add SQL Operation node to workflow',
    suite.runCase({
      id: 'TC-NODE-SQL-001',
      description: 'Add SQL Operation node to workflow',
      prompt: '增加SQL Operation节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-SQL-002: Update configuration of existing SQL Operation node',
    suite.runCase({
      id: 'TC-NODE-SQL-002',
      description: 'Update configuration of existing SQL Operation node',
      prompt: '修改SQL Operation节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
