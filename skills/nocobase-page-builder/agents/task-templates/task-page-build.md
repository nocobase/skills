# Task: Build Page "{PAGE_NAME}"

## Context
- Collection: {COLLECTION}
- Tab UID: {TAB_UID}
- Layout pattern: {PATTERN}

## Collection Fields
{FIELDS_LIST}

## Enum Values
{ENUM_VALUES}

## Page Design
- KPI: {KPI_SPEC}
- JS blocks: {JS_BLOCKS_SPEC}
- JS columns: {JS_COLS_SPEC}
- Filter fields: {FILTER_FIELDS}
- Table columns: {TABLE_COLUMNS}

## Pattern Template
{PATTERN_XML}

## Rules
- `<kpi>` = ONE number count. `<js-block>` = ANY visualization.
- NO `<addnew>/<edit>/<detail>` — forms auto-generate.
- Always include "createdAt" in table fields.
- JS nodes are description-only — NO actual JS code.
- Use asymmetric span (10+14, 8+16), not 12+12.
- **Composite column is MANDATORY** for non-reference tables: `<js-col type="composite" field="{primary}" subs="{sub1},{sub2}" title="{T}">bold title + gray subtitle</js-col>`
- **Grid height**: Don't put two JS blocks at different heights in the same `<row>`. Use `<stack>` to group small blocks on one side, matching the tall block's height on the other side.

## Steps
1. Write XML markup following the pattern and design above
2. Call `nb_page_markup("{TAB_UID}", markup)`
3. Update notes.md: mark Page Tasks row #{ROW_NUM} as `[done]` with table UID, or `[fail]` with error
