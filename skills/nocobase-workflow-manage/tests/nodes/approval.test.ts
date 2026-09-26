import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'approval',
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
    'TC-NODE-APPROVAL-001: Add Approval node to workflow',
    suite.runCase({
      id: 'TC-NODE-APPROVAL-001',
      description: 'Add Approval node to workflow',
      prompt: '增加Approval节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-APPROVAL-002: Update configuration of existing Approval node',
    suite.runCase({
      id: 'TC-NODE-APPROVAL-002',
      description: 'Update configuration of existing Approval node',
      prompt: '修改Approval节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
