# AI Employee Knowledge Base Binding

Use this workflow only when the employee already exists and the requested change is specifically to bind or unbind knowledge bases. Broader employee lifecycle work belongs to `nocobase-ai-employee-manager`.

## Preconditions

1. Resolve the exact employee username with `employees get`.
2. Verify every knowledge base key exists and is enabled.
3. Confirm retrieval values:
   - `topK`: positive integer;
   - `score`: string in the employee write schema, for example `"0.5"`;
   - `knowledgeBaseKeys`: non-empty array of exact keys when enabling.
4. Reject any payload that also contains forbidden/internal employee fields.

## Bind

Target fields:

```json
{
  "enableKnowledgeBase": true,
  "knowledgeBase": {
    "topK": 5,
    "score": "0.5",
    "knowledgeBaseKeys": ["product-docs"]
  }
}
```

Execution pattern:

```bash
nb api ai employees update \
  --filter-by-tk <username> \
  --enable-knowledge-base \
  --knowledge-base '{"topK":5,"score":"0.5","knowledgeBaseKeys":["product-docs"]}' \
  --no-json-output \
  --env <env> --yes
```

Prefer a protected body file when combining this change with other structured employee settings.

## Verify

Read back with:

```bash
nb api ai employees get --filter-by-tk <username> --env <env> --yes
```

Verify:

- `enableKnowledgeBase=true`;
- `topK` and `score` match;
- every intended key appears exactly once;
- no non-requested writable field changed.

## Unbind

1. Show the employee answer-source impact.
2. Obtain secondary confirmation.
3. Set `enableKnowledgeBase=false` and clear or preserve settings according to explicit user intent.
4. Read back and verify retrieval is disabled.

## Safety

- Do not create missing knowledge bases implicitly.
- Do not bind disabled or ambiguous keys.
- Do not write `builtIn`, `category`, `deprecated`, `chatSettings`, `dataSourceSettings`, or `skillSettings`.
- If employee update fails or reads back differently, restore the previous writable binding fields and report partial success.
