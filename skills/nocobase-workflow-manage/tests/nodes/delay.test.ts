import { afterEach, describe, it } from 'vitest';
import { createNodeTestContext } from '../helpers/agent-test-suite';

const suite = createNodeTestContext({
  type: 'delay',
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
    'TC-NODE-DELAY-001: Add Delay node to wait 5 minutes before continuing',
    suite.runCase({
      id: 'TC-NODE-DELAY-001',
      description: 'Add Delay node to wait 5 minutes before continuing',
      prompt: '增加延迟节点，等待5分钟后继续',
      scenario: 'create',
      expectedConfig: {
        unit: 60000,
        duration: 5,
        endStatus: 1,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-NODE-DELAY-002: Update delay configuration to wait 1 hour then fail',
    suite.runCase({
      id: 'TC-NODE-DELAY-002',
      description: 'Update delay configuration to wait 1 hour then fail',
      prompt: '将延迟节点改为等待1小时后失败退出',
      scenario: 'edit',
      environment: {
        nodes: [
          {
            type: 'delay',
            config: {
              unit: 60000,
              duration: 5,
              endStatus: 1,
            },
          },
        ],
      },
      expectedConfig: {
        unit: 3600000,
        duration: 1,
        endStatus: -1,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
