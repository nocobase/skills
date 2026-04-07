# SQL Collection

Use when the collection is intentionally defined by a SQL query rather than by ordinary field-by-field table modeling.

Key rules:

- Do not use `sql` just because the user wants a report. Use it when SQL is the intended source of truth for the collection shape.
- Confirm the SQL collection capability is installed and exposed by the current app before creation.
- Only `SELECT` statements or `WITH` clauses should be used. Do not use `INSERT`, `UPDATE`, `DELETE`, DDL, or dangerous functions.
- Do not guess the field list. The selected columns and aliases must match the declared fields.
- If the SQL changes, re-check the projected fields and update the field metadata to match.

Good fits for `sql`:

- read-only reporting projections
- curated joins across multiple tables
- derived datasets that are easier to maintain as SQL than as normal relations
- analytical datasets exposed as collections

Bad fits for `sql`:

- ordinary transactional tables
- write-heavy business tables
- cases where `view` is more appropriate because the database view already exists

Capability gate before creation:

1. confirm the SQL collection plugin is enabled;
2. confirm the SQL is read-only and safe;
3. confirm the projected columns and aliases;
4. confirm the collection should be modeled from SQL instead of from an existing database view.

Minimal create pattern:

```json
{
  "name": "sales_summary",
  "title": "Sales summary",
  "template": "sql",
  "sql": "select customer_id as customerId, sum(amount) as totalAmount from orders group by customer_id",
  "fields": [
    {
      "name": "customerId",
      "type": "bigInt",
      "interface": "integer",
      "uiSchema": {
        "type": "number",
        "title": "Customer ID",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "step": "1"
        },
        "x-validator": "integer"
      }
    },
    {
      "name": "totalAmount",
      "type": "double",
      "interface": "number",
      "uiSchema": {
        "type": "number",
        "title": "Total amount",
        "x-component": "InputNumber",
        "x-component-props": {
          "stringMode": true,
          "step": "1"
        }
      }
    }
  ]
}
```

Modeling process for `sql`:

1. validate the SQL first;
2. identify the exact selected columns and aliases;
3. map each projected column to a declared field payload;
4. create the collection with `template: "sql"` and `sql`;
5. verify the collection metadata and projected field list;
6. if the query changes, update both `sql` and the field declarations.

Verification focus for `sql` collections:

- the collection really uses `template: "sql"`;
- the SQL is read-only and accepted by the server;
- every declared field matches an actual selected column or alias;
- field count and field names still match after update;
- the collection is treated as a derived dataset, not as a normal mutable business table.
