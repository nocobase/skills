---
name: nocobase-data-modeling
description: Guide AI to build NocoBase data models — tables, fields, relations, and seed data
triggers:
  - modeling
  - create table
  - data table
  - field
  - relation
  - collection
  - data model
  - create table
tools:
  - nb_execute_sql
  - nb_setup_collection
  - nb_register_collection
  - nb_sync_fields
  - nb_upgrade_field
  - nb_create_relation
  - nb_list_collections
  - nb_list_fields
---

# NocoBase Data Modeling

You are guiding the user to create data models in NocoBase. Follow this exact workflow.

## Architecture: SQL + API Hybrid

NocoBase uses a **hybrid approach** — SQL for bulk column creation (fast), API for metadata management (interface/UI config).

**Why not pure API?** Creating fields one-by-one via API is slow and has quirks. SQL `CREATE TABLE` creates all columns in one shot, then `syncFields` imports them into NocoBase.

## Recommended: Fast Path (2 Steps)

For maximum efficiency, use the batch tools:

### Step 1: Create ALL tables in one SQL call
```
nb_execute_sql("CREATE TABLE IF NOT EXISTS nb_crm_customers (...); CREATE TABLE IF NOT EXISTS nb_crm_contacts (...); ...")
```
Put all tables in a single SQL statement. This is much faster than creating them one by one.

### Step 2: Setup each collection with nb_setup_collection
```
nb_setup_collection("nb_crm_customers", "Customers",
    '{"status":{"interface":"select","enum":[{"value":"prospect","label":"Prospect","color":"default"},{"value":"signed","label":"Signed","color":"green"}]},"phone":{"interface":"phone"},"email":{"interface":"email"},"description":{"interface":"textarea"}}',
    '[{"field":"contacts","type":"o2m","target":"nb_crm_contacts","foreign_key":"customer_id"},{"field":"opportunities","type":"o2m","target":"nb_crm_opportunities","foreign_key":"customer_id"}]')
```

This single call does: register → create system fields → sync → upgrade ALL field interfaces → create ALL relations. One call per table instead of 10+.

**IMPORTANT:** Process tables in dependency order — parent tables first (those referenced by FK), then child tables.

## Manual Path (7 Steps Per Collection)

Use individual tools when you need fine-grained control:

## Workflow (7 Steps Per Collection)

### Step 1: Design — Analyze Requirements
- Read the user's design docs / requirements
- Identify all entities (tables), their fields, types, and relationships
- Plan the naming convention: `nb_{module}_{entity}` (e.g. `nb_pm_projects`)

### Step 2: SQL DDL — Create Tables
Use `nb_execute_sql` to create tables with all columns:

```sql
CREATE TABLE IF NOT EXISTS nb_pm_projects (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    status VARCHAR(50) DEFAULT 'draft',
    priority VARCHAR(20) DEFAULT 'medium',
    description TEXT,
    start_date DATE,
    budget NUMERIC(12,2),
    sort INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

**Rules:**
- Always include `id BIGSERIAL PRIMARY KEY`
- Use `VARCHAR` for enum-like fields (will upgrade to select later)
- Use `NUMERIC(p,s)` for money/decimal
- Use `DATE` for date-only, `TIMESTAMPTZ` for datetime
- Use `TEXT` for long content
- Add `sort INTEGER DEFAULT 0` if ordering is needed
- DO NOT create `created_at`, `updated_at`, `created_by_id`, `updated_by_id` columns in SQL — they are created via API in Step 4
- Multiple tables can be created in one SQL call

### Step 3: Register Collection
Use `nb_register_collection` for each table:

```
nb_register_collection("nb_pm_projects", "Projects")
nb_register_collection("nb_pm_categories", "Categories", tree="adjacency-list")
```

- `tree="adjacency-list"` for parent-child hierarchies
- The table must already exist in DB

### Step 4: Sync Fields
Use `nb_sync_fields` to import DB columns + create system fields:

```
nb_sync_fields(collection="nb_pm_projects")
```

This does two things:
1. Creates system fields via API (createdAt, updatedAt, createdBy, updatedBy)
2. Runs global `syncFields` to import all DB columns

**CRITICAL:** System fields (createdBy/updatedBy) MUST be created via API because they auto-generate FK columns. Creating them via SQL breaks the config.

### Step 5: Upgrade Field Interfaces
Use `nb_upgrade_field` to change fields from default 'input' to correct types:

```
nb_upgrade_field("nb_pm_projects", "status", "select",
    enum='[{"value":"active","label":"Active"},{"value":"done","label":"Done"}]')
nb_upgrade_field("nb_pm_projects", "start_date", "date")
nb_upgrade_field("nb_pm_projects", "budget", "number", precision=2)
nb_upgrade_field("nb_pm_projects", "description", "textarea")
```

**Common interfaces:**
| Interface | Use for |
|-----------|---------|
| `input` | Short text (default) |
| `textarea` | Long text |
| `select` | Single choice (needs `enum`) |
| `multipleSelect` | Multiple choice (needs `enum`) |
| `radioGroup` | Radio buttons (needs `enum`) |
| `checkbox` | Boolean toggle |
| `number` | Decimal numbers |
| `integer` | Whole numbers |
| `percent` | Percentage |
| `date` | Date only |
| `datetime` | Date + time |
| `email` | Email with validation |
| `phone` | Phone number |
| `markdown` | Markdown editor |
| `json` | JSON editor |
| `sort` | Drag-sort field |

### Step 6: Create Relations
Use `nb_create_relation` for associations:

```
nb_create_relation("nb_pm_tasks", "project", "m2o", "nb_pm_projects", "project_id", label="name")
nb_create_relation("nb_pm_projects", "tasks", "o2m", "nb_pm_tasks", "project_id")
```

**Relation types:**
- `m2o` (belongsTo): Task belongs to a Project. FK column on the source table.
- `o2m` (hasMany): Project has many Tasks. FK column on the target table.
- `m2m` (belongsToMany): Needs `through`, `other_key` params.
- `o2o` (hasOne): One-to-one.

**Rule:** The FK column (e.g. `project_id`) must exist in the DB table. Create it in Step 2.

### Step 7: Seed Data (Optional)
Use `nb_execute_sql` to insert initial data:

```sql
INSERT INTO nb_pm_categories (name, code, sort) VALUES
('Development', 'DEV', 1),
('Design', 'DSN', 2),
('Marketing', 'MKT', 3);
```

**Seed data tips:**
- Insert parent records before children (FK constraints)
- Use explicit IDs when you need to reference them as FK values later
- For enum fields, values must exactly match the `enum` options defined in Step 5

## Verification
After completing all steps:
1. `nb_list_collections(filter="nb_pm_")` — verify all tables registered
2. `nb_list_fields("nb_pm_projects")` — verify fields have correct interfaces
3. Check NocoBase UI to confirm tables appear in admin panel

## Common Patterns

### Enum field with colors
```
nb_upgrade_field("orders", "status", "select",
    enum='[{"value":"pending","label":"Pending","color":"gold"},{"value":"completed","label":"Completed","color":"green"},{"value":"cancelled","label":"Cancelled","color":"red"}]')
```

**Enum JSON format:** Each option is `{"value":"x","label":"x","color":"colorName"}`. Color names: `red`, `green`, `blue`, `orange`, `gold`, `purple`, `cyan`, `grey`, `default`. Value and label are usually the same for localized apps.

### Multiple-select enum
```
nb_upgrade_field("products", "tags", "multipleSelect",
    enum='[{"value":"hot","label":"Hot","color":"red"},{"value":"new","label":"New","color":"blue"}]')
```

### Field upgrade — only changes metadata
`nb_upgrade_field` only updates the field's NocoBase metadata (interface, uiSchema). It does NOT alter the database column. The DB column stays VARCHAR — NocoBase handles enum display in the UI layer.

### Tree collection (categories)
```sql
CREATE TABLE nb_pm_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    parent_id BIGINT REFERENCES nb_pm_categories(id),
    sort INTEGER DEFAULT 0
);
```
```
nb_register_collection("nb_pm_categories", "Categories", tree="adjacency-list")
```

### Multiple tables in batch
Create all SQL tables first, register all, then sync once, then upgrade all. This is more efficient than processing one table at a time.

### Re-upgrading fields (idempotent)
Running `nb_upgrade_field` on an already-upgraded field is safe — it will detect the current interface matches and skip. Use this when you need to fix enum options or add colors to existing select fields.
