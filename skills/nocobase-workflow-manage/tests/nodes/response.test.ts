import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'response',
  workflow: {
    type: 'webhook',
    sync: true,
    config: {
      basicAuthentication: false,
      request: {},
      response: {
        statusCode: 200,
      },
    },
  },
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-NODE-RESPONSE-001: Add Response (for webhook) node to workflow',
    suite.runCase({
      id: 'TC-NODE-RESPONSE-001',
      description: 'Add Response (for webhook) node to workflow',
      prompt: '增加Response (for webhook)节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-RESPONSE-002: Update configuration of existing Response (for webhook) node',
    suite.runCase({
      id: 'TC-NODE-RESPONSE-002',
      description: 'Update configuration of existing Response (for webhook) node',
      prompt: '修改Response (for webhook)节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
