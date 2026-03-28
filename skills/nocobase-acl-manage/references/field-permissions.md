# Field Permissions

Field permission is action-specific.

Before restricting fields:

- inspect `availableActions:list`
- use only actions where field configuration is supported

General rule:

- For realistic business roles, configure field lists wherever the business distinguishes between readable fields and editable fields.

Strong signals that field permissions should be explicit:

- sensitive identity fields
- financial fields
- approval or status fields
- file or attachment relation fields
- association fields whose mutation should be controlled

Practical questions:

- what this role may see
- what this role may edit
- what this role may export

Relation-field guidance:

- For relation fields, update permission on the field effectively controls whether the request may change that association through ordinary create/update payloads.
- Treat relation-field update permission as association-change permission, not just scalar field editing.
- If a role must only read a relation label but must not change the association, allow the relation field on view/export actions but keep it out of create/update field lists.
