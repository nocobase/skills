# View Collection

Use when the collection should mirror an existing database view.

Key rules:

- Do not use `view` unless the database view already exists or will be created outside the ordinary collection create flow.
- Inspect `dbViews:list` or `dbViews:get` before creating or syncing the collection.
- If `dbViews:list` or `dbViews:get` does not find the upstream view, stop.
- Do not create a fake `view` collection when the upstream database view is missing.
- Do not silently downgrade the plan to `general`.
- Do not invent fields before checking the actual view columns.
- Treat the database view as the structural source of truth and the collection metadata as the application-side mapping.
- If the view changes upstream, re-sync and re-verify the field metadata.

Good fits for `view`:

- existing reporting views in the database
- read models already materialized as database views
- cross-schema or cross-table projections managed at the database layer

Bad fits for `view`:

- new ad hoc derived datasets that should be modeled as `sql`
- ordinary business tables
- schemas where no underlying database view exists

Capability gate before creation:

1. verify the database view exists with `dbViews:list` or `dbViews:get`;
2. verify the schema name when the database uses schemas;
3. inspect the actual fields exposed by the view;
4. only then create or sync the NocoBase collection metadata.

If capability gate step 1 fails:

- stop the `view` flow;
- ask for the upstream database view to be created first;
- or explicitly switch to `sql` or ordinary modeling only when that is the real target.

Modeling process for `view`:

1. inspect the view via `dbViews:get`;
2. confirm the collection name, schema, and visible fields;
3. create the collection as a view-backed collection if it is not already present and the upstream view was positively confirmed;
4. sync or update the collection metadata from the view definition;
5. verify fields, `filterTargetKey`, and relation behavior after synchronization.

Minimal create pattern:

```json
{
  "name": "order_report_view",
  "title": "Order report view",
  "template": "view",
  "view": true,
  "schema": "public"
}
```

Field handling rules for `view` collections:

- start from the fields reported by `dbViews:get`;
- only override UI-facing metadata such as `uiSchema` when needed;
- do not force a made-up field type if the upstream view metadata says otherwise;
- if a field type is ambiguous, re-inspect the view instead of guessing.

Verification focus for `view` collections:

- the collection is bound to a real database view;
- the schema and view name are correct;
- the synchronized fields match `dbViews:get`;
- `filterTargetKey` is still usable after synchronization;
- application-facing UI metadata does not drift away from the actual view columns.

Failure pattern:

- a collection was created with `template = "view"` even though no upstream database view was found.
