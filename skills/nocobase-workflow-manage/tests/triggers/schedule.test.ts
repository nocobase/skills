import { afterEach, describe, expect, it } from 'vitest';
import { createTriggerTestContext, expectSubset, type AgentCase, type TestReport } from '../helpers/agent-test-suite';

const suite = createTriggerTestContext({
  type: 'schedule',
});

function assertScheduleCase(report: TestReport, testCase: AgentCase) {
  const detail = `Artifact: ${report.artifactPath}\nlookup: ${report.lookupDetail}\n\nstdout:\n${report.stdout}\n\nstderr:\n${report.stderr}`;
  const config = (report.workflow?.config as Record<string, unknown> | null | undefined) ?? {};

  expect(config.mode, detail).toBe(testCase.expectedConfig.mode);

  if (typeof config.startsOn === 'string') {
    expect(Number.isNaN(Date.parse(config.startsOn)), detail).toBe(false);
  } else {
    expectSubset(config.startsOn, testCase.expectedConfig.startsOn, detail);
  }

  switch (testCase.id) {
    case 'TC-TRIGGER-SCHEDULE-001':
      expect(config.repeat, detail).toBe('0 0 9 * * *');
      break;
    case 'TC-TRIGGER-SCHEDULE-002':
      expect(['0 */30 * * * *', 1_800_000], detail).toContain(config.repeat as never);
      break;
    case 'TC-TRIGGER-SCHEDULE-004':
      expect(config.repeat, detail).toBe('0 0 * * * *');
      expect(config.limit, detail).toBe(100);
      expect(typeof config.endsOn, detail).toBe('string');
      break;
    case 'TC-TRIGGER-SCHEDULE-006':
      expect(config.repeat, detail).toBe('0 0 9 * * 1');
      break;
    default:
      if (testCase.expectedConfig.repeat !== undefined) {
        expectSubset(config.repeat, testCase.expectedConfig.repeat, detail);
      }
      if (testCase.expectedConfig.endsOn !== undefined) {
        expect(typeof config.endsOn, detail).toBe('string');
      }
      if (testCase.expectedConfig.limit !== undefined) {
        expect(config.limit, detail).toBe(testCase.expectedConfig.limit);
      }
  }

  if (testCase.expectedConfig.collection !== undefined) {
    expectSubset(config.collection, testCase.expectedConfig.collection, detail);
  }

  if (testCase.expectedConfig.appends !== undefined) {
    expectSubset(config.appends, testCase.expectedConfig.appends, detail);
  }
}

function withScheduleAssert(testCase: AgentCase): AgentCase {
  return {
    ...testCase,
    assert: (report) => assertScheduleCase(report, testCase),
  };
}

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-TRIGGER-SCHEDULE-001: Create a workflow triggered daily at 9 AM',
    suite.runCase(
      withScheduleAssert({
        id: 'TC-TRIGGER-SCHEDULE-001',
        description: 'Create a workflow triggered daily at 9 AM',
        prompt: '创建一个每天上午9点执行的定时任务',
        scenario: 'create',
        expectedConfig: {
          mode: 0,
          startsOn: '2026-03-31T09:00:00.000Z',
          repeat: '0 0 9 * * *',
        },
        placeholderExpected: false,
      }),
    ),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-SCHEDULE-002: Create a workflow triggered every 30 minutes starting now',
    suite.runCase(
      withScheduleAssert({
        id: 'TC-TRIGGER-SCHEDULE-002',
        description: 'Create a workflow triggered every 30 minutes starting now',
        prompt: '创建一个每30分钟执行一次的工作流',
        scenario: 'create',
        expectedConfig: {
          mode: 0,
          startsOn: '2026-03-31T10:30:00.000Z',
          repeat: 1800000,
        },
        placeholderExpected: false,
      }),
    ),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-SCHEDULE-003: Create workflow triggered 30 minutes after order creation',
    suite.runCase(
      withScheduleAssert({
        id: 'TC-TRIGGER-SCHEDULE-003',
        description: 'Create workflow triggered 30 minutes after order creation',
        prompt: '创建一个工作流，在订单创建30分钟后触发',
        scenario: 'create',
        expectedConfig: {
          mode: 1,
          collection: 'orders',
          startsOn: {
            field: 'createdAt',
            offset: 30,
            unit: 60000,
          },
        },
        placeholderExpected: false,
      }),
    ),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-SCHEDULE-004: Create hourly workflow with end date and execution limit',
    suite.runCase(
      withScheduleAssert({
        id: 'TC-TRIGGER-SCHEDULE-004',
        description: 'Create hourly workflow with end date and execution limit',
        prompt: '创建一个每小时执行的工作流，到2026年底结束，最多执行100次',
        scenario: 'create',
        expectedConfig: {
          mode: 0,
          startsOn: '2026-03-31T11:00:00.000Z',
          repeat: '0 0 * * * *',
          endsOn: '2026-12-31T23:59:59.999Z',
          limit: 100,
        },
        placeholderExpected: false,
      }),
    ),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-SCHEDULE-006: Modify existing schedule from daily to weekly execution',
    suite.runCase(
      withScheduleAssert({
        id: 'TC-TRIGGER-SCHEDULE-006',
        description: 'Modify existing schedule from daily to weekly execution',
        prompt: '将每天上午9点执行的工作流的触发时间从每天改为每周一上午9点',
        scenario: 'edit',
        environment: {
          workflow: {
            type: 'schedule',
            sync: false,
            config: {
              mode: 0,
              startsOn: '2026-03-31T09:00:00.000Z',
              repeat: '0 0 9 * * *',
            },
          },
        },
        expectedConfig: {
          mode: 0,
          startsOn: '2026-03-31T09:00:00.000Z',
          repeat: '0 0 9 * * 1',
        },
        placeholderExpected: false,
      }),
    ),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-SCHEDULE-007: Add relationship preloading to existing data table time trigger',
    suite.runCase(
      withScheduleAssert({
        id: 'TC-TRIGGER-SCHEDULE-007',
        description: 'Add relationship preloading to existing data table time trigger',
        prompt: '在基于订单时间的触发器中预加载客户信息',
        scenario: 'edit',
        environment: {
          workflow: {
            type: 'schedule',
            sync: false,
            config: {
              mode: 1,
              collection: 'orders',
              startsOn: {
                field: 'createdAt',
                offset: 30,
                unit: 60000,
              },
            },
          },
        },
        expectedConfig: {
          mode: 1,
          collection: 'orders',
          startsOn: {
            field: 'createdAt',
            offset: 30,
            unit: 60000,
          },
          appends: ['customer'],
        },
        placeholderExpected: false,
      }),
    ),
    suite.timeout,
  );
});
