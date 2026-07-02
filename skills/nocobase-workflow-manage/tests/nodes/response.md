# Response (for webhook) (response) Node Tests

## Overview
Tests for the `response` node type.

## Test Cases

### Creation Scenarios

#### TC-NODE-RESPONSE-001: Add Response (for webhook) node
- **Description**: Add Response (for webhook) node to workflow
- **Prompt**: "在 webhook 工作流中增加响应节点，使用 201 状态码，返回{'success': true, 'id': '{{$context.body.body_$0}}'}"
- **Expected Configuration**:
```json
{
  "statusCode": 201,
  "body": {
    "success": true,
    "id": "{{$context.body.body_$0}}"
  }
}
```
- **Validation Points**:
  - Node type should be `response`
  - Configuration should match expected structure
- **Test Steps**:
  1. Create workflow with appropriate trigger
  2. Execute skill with the prompt
  3. Verify node added with correct type
  4. Test node functionality

## Test Data Requirements
- Appropriate collections and data for testing
- Workflow context matching node requirements

## Notes
Refer to [response.md](response.md) for detailed configuration options.
