import { afterEach, describe, it } from 'vitest';
import { createTriggerTestContext } from '../helpers/agent-test-suite';

const suite = createTriggerTestContext({
  type: 'webhook',
});

describe.sequential(suite.describeTitle, () => {
  afterEach(suite.cleanup);

  it(
    'TC-TRIGGER-WEBHOOK-001: Create simple webhook trigger without authentication',
    suite.runCase({
      id: 'TC-TRIGGER-WEBHOOK-001',
      description: 'Create simple webhook trigger without authentication',
      prompt: '创建一个基本的webhook工作流',
      scenario: 'create',
      expectedConfig: {
        basicAuthentication: false,
        request: {},
        response: {
          statusCode: 200,
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-WEBHOOK-002: Create webhook with HTTP Basic Authentication',
    suite.runCase({
      id: 'TC-TRIGGER-WEBHOOK-002',
      description: 'Create webhook with HTTP Basic Authentication',
      prompt: '创建一个带基本认证的webhook工作流，用户名为webhook，密码为secret',
      scenario: 'create',
      expectedConfig: {
        basicAuthentication: {
          username: 'webhook',
          password: 'secret',
        },
        request: {},
        response: {
          statusCode: 200,
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-WEBHOOK-003: Create webhook that parses query parameters and JSON body',
    suite.runCase({
      id: 'TC-TRIGGER-WEBHOOK-003',
      description: 'Create webhook that parses query parameters and JSON body',
      prompt: '创建一个webhook工作流，解析查询参数中的event字段和JSON体中的data.id字段',
      scenario: 'create',
      expectedConfig: {
        basicAuthentication: false,
        request: {
          query: [
            {
              key: 'event',
              alias: 'Event',
              _var: 'query_$0',
            },
          ],
          body: [
            {
              key: 'data.id',
              alias: 'Order ID',
              _var: 'body_$0',
            },
          ],
        },
        response: {
          statusCode: 200,
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-WEBHOOK-004: Create webhook with custom JSON response',
    suite.runCase({
      id: 'TC-TRIGGER-WEBHOOK-004',
      description: 'Create webhook with custom JSON response',
      prompt: "创建一个webhook工作流，返回JSON响应：{'ok': true, 'message': 'received'}",
      scenario: 'create',
      expectedConfig: {
        basicAuthentication: false,
        request: {},
        response: {
          statusCode: 200,
          body: {
            ok: true,
            message: 'received',
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-WEBHOOK-005: Add basic authentication to existing webhook',
    suite.runCase({
      id: 'TC-TRIGGER-WEBHOOK-005',
      description: 'Add basic authentication to existing webhook',
      prompt: '在现有webhook工作流中添加基本认证，用户名为admin，密码为pass123',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'webhook',
          sync: false,
          config: {
            basicAuthentication: false,
            request: {},
            response: {
              statusCode: 200,
            },
          },
        },
      },
      expectedConfig: {
        basicAuthentication: {
          username: 'admin',
          password: 'pass123',
        },
        request: {},
        response: {
          statusCode: 200,
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-WEBHOOK-006: Add header parsing to existing webhook',
    suite.runCase({
      id: 'TC-TRIGGER-WEBHOOK-006',
      description: 'Add header parsing to existing webhook',
      prompt: '在webhook中增加对x-signature请求头的解析',
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'webhook',
          sync: false,
          config: {
            basicAuthentication: false,
            request: {},
            response: {
              statusCode: 200,
            },
          },
        },
      },
      expectedConfig: {
        basicAuthentication: false,
        request: {
          headers: [
            {
              key: 'x-signature',
            },
          ],
        },
        response: {
          statusCode: 200,
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );

  it(
    'TC-TRIGGER-WEBHOOK-007: Change webhook response to 201 with different body',
    suite.runCase({
      id: 'TC-TRIGGER-WEBHOOK-007',
      description: 'Change webhook response to 201 with different body',
      prompt: "将webhook响应改为201状态码，返回{'success': true, 'id': '{{$context.body.body_$0}}'}",
      scenario: 'edit',
      environment: {
        workflow: {
          type: 'webhook',
          sync: false,
          config: {
            basicAuthentication: false,
            request: {
              body: [
                {
                  key: 'data.id',
                  alias: 'Order ID',
                  _var: 'body_$0',
                },
              ],
            },
            response: {
              statusCode: 200,
            },
          },
        },
      },
      expectedConfig: {
        basicAuthentication: false,
        request: {
          body: [
            {
              key: 'data.id',
              alias: 'Order ID',
              _var: 'body_$0',
            },
          ],
        },
        response: {
          statusCode: 201,
          body: {
            success: true,
            id: '{{$context.body.body_$0}}',
          },
        },
      },
      placeholderExpected: false,
    }),
    suite.timeout,
  );
});
