import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'mailer',
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
    'TC-NODE-MAILER-001: Add Send Email node to workflow',
    suite.runCase({
      id: 'TC-NODE-MAILER-001',
      description: 'Add Send Email node to workflow',
      prompt: '增加Send Email节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-MAILER-002: Update configuration of existing Send Email node',
    suite.runCase({
      id: 'TC-NODE-MAILER-002',
      description: 'Update configuration of existing Send Email node',
      prompt: '修改Send Email节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
