import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'response-message',
  workflow: {
    type: 'request-interception',
    sync: true,
    config: {
      collection: 'orders',
      global: true,
      actions: ['create'],
    },
  },
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-NODE-RESPONSE_MESSAGE-001: Add Response Message node to workflow',
    suite.runCase({
      id: 'TC-NODE-RESPONSE_MESSAGE-001',
      description: 'Add Response Message node to workflow',
      prompt: '增加Response Message节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-RESPONSE_MESSAGE-002: Update configuration of existing Response Message node',
    suite.runCase({
      id: 'TC-NODE-RESPONSE_MESSAGE-002',
      description: 'Update configuration of existing Response Message node',
      prompt: '修改Response Message节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
