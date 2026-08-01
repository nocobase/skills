# Commercial Workflow Plugin Gate

Approval, Webhook, and Subflow are commercial workflow capabilities. They are available only when the corresponding commercial plugin is installed and activated in the target NocoBase application.

| Capability | Workflow type | Required commercial plugin |
| --- | --- | --- |
| Approval trigger, approval node, approval surfaces, and approval center behavior | `approval` | `@nocobase/plugin-workflow-approval` |
| Webhook trigger and Webhook response node | `webhook`, `response` | `@nocobase/plugin-workflow-webhook` |
| Call Workflow node | `subflow` | `@nocobase/plugin-workflow-subflow` |

## Mandatory Capability Gate

Before creating, updating, or otherwise using any capability in the table above:

1. Inspect plugin state in the target application through [`nocobase-plugin-manage`](../../nocobase-plugin-manage/SKILL.md).
2. Locate the matching plugin and confirm it is installed and `enabled=true`. Presence in source code, dependencies, documentation, or a CLI help listing does not prove runtime activation.
3. If the plugin is missing or disabled, do not create or mutate a workflow with the corresponding trigger or node type, and do not call its capability-specific surface operations.
4. Tell the user which exact commercial plugin must be installed or activated. Plugin activation belongs to `nocobase-plugin-manage`; continue workflow authoring only after that skill verifies `enabled=true` through readback.
5. After activation is confirmed, re-inspect the relevant workflow capability before relying on it.

Do not probe capability availability by attempting a workflow mutation and waiting for it to fail. Do not treat an existing workflow record that references a commercial type as proof that the plugin is currently activated.

## No Semantic Downgrades

When the user explicitly requests approval functionality, the required implementation is the Approval plugin's `approval` trigger and approval nodes. Never replace it with a `manual` node, status field, condition branch, notification, or another simplified human-review flow. Those alternatives do not provide approval submissions, approval tasks, approval center integration, approval actions, or approval audit semantics.

If `@nocobase/plugin-workflow-approval` is not activated, stop the approval authoring path and report that prerequisite. A manual node may be used only for a separately stated manual-processing requirement; it is not an approval fallback.

Likewise, do not silently replace an unavailable Webhook trigger with an action/request trigger, or an unavailable Subflow node with copied node chains. Stop and report the required plugin instead.
