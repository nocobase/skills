# Comment Collection

Use when the record is a plugin-backed comment table and the template baseline is expected to own a markdown-capable `content` field.

Key rules:

- Use this only after the comments plugin gate is satisfied.
- In compact flow, `template: "comment"` is the baseline.
- Do not manually send the template-owned `content` field in the create payload unless you are explicitly updating an existing comment collection.
- The server baseline should create the comment content field and the preset audit fields.
- If the user only needs comments attached to another business table, model the host table first and keep the comment capability separate unless the task explicitly asks for the comment table itself.

Preferred compact request:

```json
{
  "name": "ticket_comments",
  "title": "Ticket Comments",
  "template": "comment"
}
```

Baseline behavior to expect after create:

- `content`
  - `interface: "vditor"`
  - `type: "text"`
  - `length: "long"`
  - `deletable: false`
- preset fields:
  - `id`
  - `createdAt`
  - `createdBy`
  - `updatedAt`
  - `updatedBy`

Good fits for `comment`:

- comment plugin tables
- standalone comment collections
- 评论表

Bad fits for `comment`:

- ordinary business tables that merely need a remark field
- tables where comments are only an attached UI feature, not the record itself

Verification focus for `comment` collections:

- the collection uses `template: "comment"`
- the `content` field exists after apply
- `content` is markdown-capable through `vditor`
- the template-owned preset fields exist
- a missing `content` field after apply is a baseline regression, not an expected outcome
