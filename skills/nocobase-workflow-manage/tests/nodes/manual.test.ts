import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'manual',
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
    'TC-NODE-MANUAL-001: Add Manual Process node to workflow',
    suite.runCase({
      id: 'TC-NODE-MANUAL-001',
      description: 'Add Manual Process node to workflow',
      prompt: '增加Manual Process节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-MANUAL-002: Update configuration of existing Manual Process node',
    suite.runCase({
      id: 'TC-NODE-MANUAL-002',
      description: 'Update configuration of existing Manual Process node',
      prompt: '修改Manual Process节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
