# Webhook Trigger Tests

## Overview
Tests for the `webhook` trigger type which triggers workflows via external HTTP POST calls.

## Test Cases

### Creation Scenarios

#### TC-TRIGGER-WEBHOOK-001: Create basic webhook workflow
- **Description**: Create simple webhook trigger without authentication
- **Prompt**: "创建一个基本的webhook工作流"
- **Expected Configuration**:
```json
{
  "basicAuthentication": false,
  "request": {},
  "response": {
    "statusCode": 200
  }
}
```
- **Validation Points**:
  - Trigger type should be `webhook`
  - basicAuthentication should be `false`
  - Default response status 200
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify configuration
  3. Get webhook URL and test POST request
  4. Verify workflow triggers

#### TC-TRIGGER-WEBHOOK-002: Create webhook with basic authentication
- **Description**: Create webhook with HTTP Basic Authentication
- **Prompt**: "创建一个带基本认证的webhook工作流，用户名为webhook，密码为secret"
- **Expected Configuration**:
```json
{
  "basicAuthentication": {
    "username": "webhook",
    "password": "secret"
  },
  "request": {},
  "response": {
    "statusCode": 200
  }
}
```
- **Validation Points**:
  - basicAuthentication should contain username/password
  - Credentials match prompt
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify authentication configuration
  3. Test with correct credentials (should trigger) and incorrect (should reject)

#### TC-TRIGGER-WEBHOOK-003: Create webhook with request parsing
- **Description**: Create webhook that parses query parameters and JSON body
- **Prompt**: "创建一个webhook工作流，解析查询参数中的event字段和JSON体中的data.id字段"
- **Expected Configuration**:
```json
{
  "basicAuthentication": false,
  "request": {
    "query": [
      { "key": "event", "alias": "Event", "_var": "query_$0" }
    ],
    "body": [
      { "key": "data.id", "alias": "Order ID", "_var": "body_$0" }
    ]
  },
  "response": {
    "statusCode": 200
  }
}
```
- **Validation Points**:
  - Request should have query and body parsing configurations
  - Query key should be "event"
  - Body key should be "data.id"
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify request parsing configuration
  3. Test webhook with query and body data
  4. Verify variables are available in workflow

#### TC-TRIGGER-WEBHOOK-004: Create webhook with custom response
- **Description**: Create webhook with custom JSON response
- **Prompt**: "创建一个webhook工作流，返回JSON响应：{'ok': true, 'message': 'received'}"
- **Expected Configuration**:
```json
{
  "basicAuthentication": false,
  "request": {},
  "response": {
    "statusCode": 200,
    "body": {
      "ok": true,
      "message": "received"
    }
  }
}
```
- **Validation Points**:
  - Response body should match prompt
  - Status code 200
- **Test Steps**:
  1. Execute skill with the prompt
  2. Verify response configuration
  3. Test webhook and verify response matches

### Editing Scenarios

#### TC-TRIGGER-WEBHOOK-005: Add authentication to existing webhook
- **Description**: Add basic authentication to existing webhook
- **Prompt**: "在现有webhook工作流中添加基本认证，用户名为admin，密码为pass123"
- **Expected Configuration** (updated):
```json
{
  "basicAuthentication": {
    "username": "admin",
    "password": "pass123"
  },
  "request": {},
  "response": {
    "statusCode": 200
  }
}
```
- **Validation Points**:
  - basicAuthentication should change from `false` to object
  - Credentials should match prompt
- **Test Steps**:
  1. Create workflow without authentication
  2. Execute skill with edit prompt
  3. Verify authentication added
  4. Test with new credentials

#### TC-TRIGGER-WEBHOOK-006: Add request header parsing
- **Description**: Add header parsing to existing webhook
- **Prompt**: "在webhook中增加对x-signature请求头的解析"
- **Expected Configuration** (updated):
```json
{
  "basicAuthentication": false,
  "request": {
    "headers": [
      { "key": "x-signature" }
    ]
  },
  "response": {
    "statusCode": 200
  }
}
```
- **Validation Points**:
  - Headers array should include x-signature
- **Test Steps**:
  1. Create webhook without header parsing
  2. Execute skill with edit prompt
  3. Verify header parsing added
  4. Test with x-signature header

#### TC-TRIGGER-WEBHOOK-007: Update response status and body
- **Description**: Change webhook response to 201 with different body
- **Prompt**: "将webhook响应改为201状态码，返回{'success': true, 'id': '{{$context.body.body_$0}}'}"
- **Expected Configuration** (updated):
```json
{
  "basicAuthentication": false,
  "request": {
    "body": [
      { "key": "data.id", "alias": "Order ID", "_var": "body_$0" }
    ]
  },
  "response": {
    "statusCode": 201,
    "body": {
      "success": true,
      "id": "{{$context.body.body_$0}}"
    }
  }
}
```
- **Validation Points**:
  - Status code should be 201
  - Body should reference parsed variable
- **Test Steps**:
  1. Create webhook with basic response
  2. Execute skill with edit prompt
  3. Verify response updated
  4. Test webhook and verify response

## Test Data Requirements
- Webhook URL endpoint
- HTTP client for testing POST requests
- Support for Basic Authentication in test client