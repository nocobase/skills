# NocoBase Workflow Manage Skill Test Plan

This document outlines the test plan for validating the `nocobase-workflow-manage` skill. The tests are designed to verify that the skill correctly interprets natural language prompts and generates appropriate workflow configurations for various trigger and node types.

## Test Scope

- **Trigger Types**: All workflow triggers supported by the skill (built-in and plugin extensions)
- **Node Types**: All workflow nodes supported by the skill (built-in and plugin extensions)
- **Scenarios**: 
  - Creation: Creating new workflows with specific triggers and nodes
  - Editing: Modifying existing workflows (adding/updating nodes, changing configurations)
- **Configuration Validation**: Ensure generated JSON configurations match expected schema and values

## Test Structure

Tests are organized into two main categories:

1. **Trigger Tests** (`/tests/triggers/`): Test cases for each trigger type
2. **Node Tests** (`/tests/nodes/`): Test cases for each node type

Each test case follows this format:
- **Test ID**: Unique identifier (e.g., `TC-TRIGGER-COLLECTION-001`)
- **Description**: Brief description of what's being tested
- **Prompt**: Natural language input to the skill
- **Expected Configuration**: JSON configuration that should be generated
- **Validation Points**: Specific aspects to verify
- **Test Steps**: Step-by-step instructions for manual or automated testing

## Test Execution

Tests can be executed manually by following the test steps, or potentially automated using the skill's MCP tools. Each test assumes a clean NocoBase environment with necessary collections and plugins installed.

## Trigger Test Cases

| Trigger Type | Test File | Description |
|--------------|-----------|-------------|
| `collection` | [collection.md](triggers/collection.md) | Data table events (create/update/delete) |
| `schedule` | [schedule.md](triggers/schedule.md) | Scheduled/cron-based triggers |
| `action` | [action.md](triggers/action.md) | Post-action events |
| `custom-action` | [custom-action.md](triggers/custom-action.md) | Custom action events |
| `request-interception` | [request-interception.md](triggers/request-interception.md) | Pre-action event interception |
| `webhook` | [webhook.md](triggers/webhook.md) | Webhook triggers |
| `approval` | [approval.md](triggers/approval.md) | Approval triggers |

## Node Test Cases

| Node Type | Test File | Description |
|-----------|-----------|-------------|
| `calculation` | [calculation.md](nodes/calculation.md) | Calculation/computation nodes |
| `condition` | [condition.md](nodes/condition.md) | Conditional branching |
| `query` | [query.md](nodes/query.md) | Query records from collections |
| `create` | [create.md](nodes/create.md) | Create new records |
| `update` | [update.md](nodes/update.md) | Update existing records |
| `destroy` | [destroy.md](nodes/destroy.md) | Delete records |
| `end` | [end.md](nodes/end.md) | End workflow node |
| `output` | [output.md](nodes/output.md) | Workflow output node |
| `multi-condition` | [multi-condition.md](nodes/multi-condition.md) | Multi-condition branching |
| `loop` | [loop.md](nodes/loop.md) | Loop/iteration nodes |
| `parallel` | [parallel.md](nodes/parallel.md) | Parallel branching |
| `request` | [request.md](nodes/request.md) | HTTP request nodes |
| `mailer` | [mailer.md](nodes/mailer.md) | Email sending nodes |
| `delay` | [delay.md](nodes/delay.md) | Delay/timer nodes |
| `notification` | [notification.md](nodes/notification.md) | System notification nodes |
| `aggregate` | [aggregate.md](nodes/aggregate.md) | Aggregate query nodes |
| `sql` | [sql.md](nodes/sql.md) | SQL operation nodes |
| `cc` | [cc.md](nodes/cc.md) | CC notification nodes |
| `json-query` | [json-query.md](nodes/json-query.md) | JSON query nodes |
| `json-variable-mapping` | [json-variable-mapping.md](nodes/json-variable-mapping.md) | JSON variable mapping nodes |
| `script` | [script.md](nodes/script.md) | JavaScript execution nodes |
| `manual` | [manual.md](nodes/manual.md) | Manual process nodes |
| `response-message` | [response-message.md](nodes/response-message.md) | Response message nodes |
| `subflow` | [subflow.md](nodes/subflow.md) | Subflow/call workflow nodes |
| `response` | [response.md](nodes/response.md) | Response nodes (for webhooks) |
| `approval` | [approval.md](nodes/approval.md) | Approval nodes |

## Test Environment Setup

1. Ensure NocoBase MCP server is running and authenticated
2. Verify all required plugins are installed and enabled
3. Create necessary collections (e.g., `orders`, `orderDetails`) for test data
4. Reset test environment before each test session

## Success Criteria

- Skill correctly interprets natural language prompts
- Generated configurations match expected JSON structure
- Workflows can be successfully created/updated via MCP tools
- Workflows execute as expected when triggered

## Test Generation

Test files for all trigger and node types have been created. For triggers, detailed test cases with example configurations are provided. For nodes, basic templates exist with placeholders.

To update node test files with specific configurations:

1. **Review node documentation**: Check `/references/nodes/[node-type].md` for configuration options
2. **Update test cases**: Replace placeholder JSON configurations with actual examples
3. **Add realistic prompts**: Create natural language prompts that users might use
4. **Define validation points**: Specify what to verify in each test

A generation script is available to create template files for missing node types:
```bash
python3 tests/generate_node_tests.py
```

## Next Steps

1. **Populate node test configurations**: Fill in the placeholder JSON configurations based on actual node documentation
2. **Review trigger tests**: Ensure all trigger test cases are accurate and complete
3. **Test execution**: Run manual tests using the skill with NocoBase MCP server
4. **Automation**: Consider automating test execution using the skill's MCP tools
5. **Expand coverage**: Add edge cases and error scenarios for each trigger/node type