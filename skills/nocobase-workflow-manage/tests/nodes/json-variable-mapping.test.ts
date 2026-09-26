import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'json-variable-mapping',
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
    'TC-NODE-JSON_VARIABLE_MAPPING-001: Add JSON Variable Mapping node to workflow',
    suite.runCase({
      id: 'TC-NODE-JSON_VARIABLE_MAPPING-001',
      description: 'Add JSON Variable Mapping node to workflow',
      prompt: '增加JSON Variable Mapping节点',
      scenario: 'create',
      expectedConfig: {},
      placeholderExpected: true,
    }),
    suite.timeout,
  );

  it.skip(
    'TC-NODE-JSON_VARIABLE_MAPPING-002: Update configuration of existing JSON Variable Mapping node',
    suite.runCase({
      id: 'TC-NODE-JSON_VARIABLE_MAPPING-002',
      description: 'Update configuration of existing JSON Variable Mapping node',
      prompt: '修改JSON Variable Mapping节点的配置',
      scenario: 'edit',
      expectedConfig: {},
      placeholderExpected: true,
      skip: 'placeholder expected config in markdown',
    }),
    suite.timeout,
  );
});
