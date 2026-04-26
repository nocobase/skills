import { afterEach, describe, it } from 'vitest';
import { createTriggerTestContext } from '../helpers/agent-test-suite';

const suite = createTriggerTestContext({
  type: 'request-interception',
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-TRIGGER-REQUEST-INTERCEPTION-001: Create workflow to validate order creation requests',
    suite.runCase({
      id: 'TC-TRIGGER-REQUEST-INTERCEPTION-001',
      description: 'Create workflow to validate order creation requests',
      prompt: '创建一个在订单创建请求前进行验证的工作流',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        global: true,
        actions: ['create'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-REQUEST-INTERCEPTION-002: Create workflow bound to specific action button',
    suite.runCase({
      id: 'TC-TRIGGER-REQUEST-INTERCEPTION-002',
      description: 'Create workflow bound to specific action button',
      prompt: '创建一个本地模式的工作流，绑定到特定按钮进行请求拦截',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        global: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-REQUEST-INTERCEPTION-003: Create workflow to validate update and delete operations',
    suite.runCase({
      id: 'TC-TRIGGER-REQUEST-INTERCEPTION-003',
      description: 'Create workflow to validate update and delete operations',
      prompt: '创建一个在订单更新和删除前进行验证的工作流',
      scenario: 'create',
      expectedConfig: {
        collection: 'orders',
        global: true,
        actions: ['update', 'destroy'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-REQUEST-INTERCEPTION-004: Modify trigger from global to local mode',
    suite.runCase({
      id: 'TC-TRIGGER-REQUEST-INTERCEPTION-004',
      description: 'Modify trigger from global to local mode',
      prompt: '将工作流改为本地模式，仅绑定到特定按钮',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'request-interception',
          sync: true,
          config: {
            collection: 'orders',
            global: true,
            actions: ['create'],
          },
        },
      },
      expectedConfig: {
        collection: 'orders',
        global: false,
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-REQUEST-INTERCEPTION-005: Add destroy action to existing create+update validation',
    suite.runCase({
      id: 'TC-TRIGGER-REQUEST-INTERCEPTION-005',
      description: 'Add destroy action to existing create+update validation',
      prompt: '在现有请求拦截工作流中增加删除操作的验证',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'request-interception',
          sync: true,
          config: {
            collection: 'orders',
            global: true,
            actions: ['create', 'update'],
          },
        },
      },
      expectedConfig: {
        collection: 'orders',
        global: true,
        actions: ['create', 'update', 'destroy'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-REQUEST-INTERCEPTION-006: Change validation from orders to products collection',
    suite.runCase({
      id: 'TC-TRIGGER-REQUEST-INTERCEPTION-006',
      description: 'Change validation from orders to products collection',
      prompt: '将请求拦截工作流改为针对产品表进行验证',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'request-interception',
          sync: true,
          config: {
            collection: 'orders',
            global: true,
            actions: ['create', 'update'],
          },
        },
      },
      expectedConfig: {
        collection: 'products',
        global: true,
        actions: ['create', 'update'],
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
