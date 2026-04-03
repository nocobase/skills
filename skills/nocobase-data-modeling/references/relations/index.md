# Relation Reference Index

Use this folder when the main risk is relation direction, ownership, or reverse-field correctness.

Choose the relation-family file by the intended ownership pattern:

- `m2o.md`: many current records belong to one target record
- `o2m.md`: one current record owns many target records
- `o2o.md`: exactly one current record corresponds to one target record
- `m2m.md`: both sides can have many records and need a through table
- `mbm.md`: plugin-provided many-to-many array field behavior

Recommended read order when debugging a relation:

1. confirm which side owns the foreign key
2. choose the relation-family file
3. confirm `target`, `foreignKey`, `sourceKey`, `targetKey`, `through`, and `otherKey` as needed
4. only then define `reverseField`

Relation-family decision rules:

- choose `m2o` when the foreign key must be stored on the current collection
- choose `o2m` when the foreign key must be stored on the target collection
- choose `o2o` only after deciding which side is the owner
- choose `m2m` only when a through collection is truly needed
- choose `mbm` only when the plugin-backed many-to-many array behavior is explicitly required
