# Model Pack: SQL And View Analytics

Use this pack when the user needs derived read models and wants to distinguish:

- a collection defined directly from SQL
- a collection that mirrors an existing database view

This pack is not a single relational business schema. It is a comparison pack for choosing the correct derived-model approach.

## Table 1: sales_summary (`sql`)

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

## Table 2: order_report_view (`view`)

```json
{
  "name": "order_report_view",
  "title": "Order report view",
  "template": "view",
  "view": true,
  "schema": "public"
}
```

Decision rule:

- use the SQL collection when NocoBase should own the query text
- use the view collection when the database already owns the view definition

Verification focus:

- SQL collection: stored SQL and declared fields match
- view collection: `dbViews:get` still matches the synchronized collection metadata
