# Phase 1: Data Modeling

## Step 1.1: Create All Tables

Generate DDL for all tables. Rules:
- `CREATE TABLE IF NOT EXISTS`
- NO system columns (created_at, updated_at, created_by_id, updated_by_id) — added automatically
- Parent tables before child tables (FK order)

Call `nb_execute_sql(ddl)` — all CREATE TABLE in one call.

## Step 1.2: Register & Setup Collections

For each table (parent-first):
```
nb_setup_collection(name, title, field_interfaces, relations)
```

**Include o2m relations on parent tables** — required for detail popup subtables later:
- e.g. customers → contacts (o2m), customers → opportunities (o2m)
- Without these, detail subtables will be empty

There is a 30-second cooldown between nb_setup_collection calls. Prepare all table definitions first, then call them one by one.

## Step 1.3: Insert Seed Data — MANDATORY, DO NOT SKIP

**An empty system is useless.** Users need to see real-looking data to evaluate the system.

- Generate INSERT statements (5-10 rows per table, realistic Chinese data)
- `nb_execute_sql(inserts)` — parent tables first (FK dependencies)
- For large data: use `nb_execute_sql_file()` with a .sql file
- Data must be realistic: real Chinese names, valid phone numbers, reasonable dates, meaningful enum values
- After inserting, verify: `nb_execute_sql("SELECT count(*) FROM table_name")` for each table

## Step 1.4: Write Notes — IMMEDIATELY after each sub-step

**Write to `notes.md` after EVERY sub-step, not at the end.**
After Step 1.1: `## Status: Phase 1 — tables created`
After Step 1.2: add collection list with ✓ marks
After Step 1.3: add row counts + `## Status: Phase 1 complete`

Final notes.md content:
- Table list + row counts
- O2M relations map (parent → child fields)
- `## Status: Phase 1 complete`

## After Phase 1

Show the user: tables created (count + names), sample data, relations.
Ask: "Tables and test data are ready. Shall we start building pages? Any tables or fields to modify?"
Wait for user response.

Next → `phases/phase-2-fields.md`
