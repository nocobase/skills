import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'loop',
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
    'TC-NODE-LOOP-001: Add Loop node to workflow',
    suite.runCase({
      id: 'TC-NODE-LOOP-001',
      description: 'Add Loop node to workflow',
      prompt: '增加Loop节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-LOOP-002: Update configuration of existing Loop node',
    suite.runCase({
      id: 'TC-NODE-LOOP-002',
      description: 'Update configuration of existing Loop node',
      prompt: '修改Loop节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
