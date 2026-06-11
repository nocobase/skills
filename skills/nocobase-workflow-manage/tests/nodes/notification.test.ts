import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'notification',
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
    'TC-NODE-NOTIFICATION-001: Add System Notification node to workflow',
    suite.runCase({
      id: 'TC-NODE-NOTIFICATION-001',
      description: 'Add System Notification node to workflow',
      prompt: '增加System Notification节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-NOTIFICATION-002: Update configuration of existing System Notification node',
    suite.runCase({
      id: 'TC-NODE-NOTIFICATION-002',
      description: 'Update configuration of existing System Notification node',
      prompt: '修改System Notification节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
