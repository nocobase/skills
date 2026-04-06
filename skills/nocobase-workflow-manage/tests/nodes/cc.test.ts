import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'cc',
  workflow: {
    type: 'approval',
    sync: false,
    config: {
      collection: 'expenses',
      mode: 0,
      centralized: false,
      audienceType: 1,
      recordShowMode: false,
      appends: [],
      withdrawable: false,
      useSameTaskTitle: false,
    },
  },
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-NODE-CC-001: Add CC Notification node to workflow',
    suite.runCase({
      id: 'TC-NODE-CC-001',
      description: 'Add CC Notification node to workflow',
      prompt: '增加CC Notification节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-CC-002: Update configuration of existing CC Notification node',
    suite.runCase({
      id: 'TC-NODE-CC-002',
      description: 'Update configuration of existing CC Notification node',
      prompt: '修改CC Notification节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
