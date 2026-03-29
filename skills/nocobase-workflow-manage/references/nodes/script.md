---
title: "JavaScript"
description: "Run custom JavaScript code in a workflow node, could use arguments and return results, suitable for complex logic that built-in nodes cannot handle."
---

# JavaScript

## Node Type

`script`
Please use the `type` value above to create the node; do not use the documentation filename as the type.

## Node Description
Executes a piece of JavaScript code in an isolated Node.js sandbox environment (Worker Thread) and returns the result. Suitable for complex logic that cannot be handled by built-in expression engines.

## Business Scenario Example
Custom data transformation, complex conditional calculations, string processing, calling Node.js built-in modules, etc.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| arguments | array | [] | No | List of input arguments, each item `{ name, value }`. `name` is the variable name available in the script, `value` is the variable value (supports workflow variable references). Variable names must be valid JavaScript identifiers and cannot be duplicated. |
| content | string | `return "Hello world!";` | Yes | The JavaScript code to execute. Must use `return` to return a result. The code runs in an isolated Node.js Worker Thread environment. |
| timeout | number | 0 | No | Maximum execution time in milliseconds. `0` means no timeout. |
| continue | boolean | false | No | Whether to continue the workflow when the script throws an exception. If `true`, the node status is resolved even on error; if `false`, the node status is set to error. |

## Script Execution Environment
- The script runs in an isolated Node.js Worker Thread, not in the main process.
- Arguments defined in `arguments` are available as variables with the same names in the script.
- Use `return` to return results; the return value becomes the node's output.
- `console.log()` and `console.error()` output is captured in the workflow log.
- When the workflow is synchronous, the script executes synchronously within the request; when asynchronous, the script executes in the background and resumes the workflow upon completion.

## Node Output Variable
- `$jobsMapByNodeKey.<nodeKey>`: The return value of the script (i.e., the value after `return`).

## Branch Description
Does not support branches.

## Example Configuration
```json
{
  "arguments": [
    { "name": "price", "value": "{{$context.data.price}}" },
    { "name": "quantity", "value": "{{$context.data.quantity}}" }
  ],
  "content": "return price * quantity * 0.9;",
  "timeout": 5000,
  "continue": false
}
```
