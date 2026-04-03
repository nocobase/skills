# Field Reference Index

Use this folder when the user is focused on field correctness rather than collection-type selection.

Choose the field-family file by the primary risk:

- `scalar.md`: ordinary text, numbers, booleans, and specialized scalar inputs
- `choices.md`: local enums, multi-choice fields, and china-region style selectors
- `media-and-structured.md`: markdown, rich text, attachment, and json-like structured payloads
- `datetime.md`: timezone-aware datetime, no-timezone datetime, date-only, time, unix timestamp, and preset timestamp fields
- `system-and-advanced.md`: id strategies, json, tableoid, and audit relations such as `createdBy` and `updatedBy`
- `advanced-plugin-fields.md`: capability-gated advanced and plugin-backed field interfaces
- `plugins/formula.md`: detailed formula field contract, engines, result types, and expression payload
- `plugins/sort.md`: detailed sort field contract, grouped sorting, and plugin-specific type
- `plugins/code.md`: detailed code field contract, editor component, and language options
- `plugins/sequence.md`: detailed sequence field contract, rule-item schemas, and generator payload
- `plugins/encryption.md`: detailed encryption field contract, hidden behavior, and pro-plugin gate
- `plugins/map-fields.md`: detailed map geometry field contracts for point, line, circle, and polygon
- `../relation-fields.md`: relation direction and relation payload construction

Recommended read order for a normal business table:

1. `system-and-advanced.md`
2. `scalar.md`
3. `choices.md`
4. `media-and-structured.md`
5. `datetime.md`
6. `../relation-fields.md`

Field-family decision rules:

- choose a specialized scalar interface before falling back to plain `input`
- choose local choice fields only when the option set is owned by the current collection
- choose `attachment` when the file is subordinate to the record, but choose a real `file` collection when the file is first-class
- choose one primary-key strategy only
- keep relation fields last unless the user is specifically debugging association behavior
