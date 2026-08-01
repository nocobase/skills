# File Modeling

## Contents

- [Mandatory model](#mandatory-model)
- [Create the file collection](#create-the-file-collection)
- [Choose the relation](#choose-the-relation)
- [Relation payloads](#relation-payloads)
- [File record semantics](#file-record-semantics)

## Mandatory model

For every new model:

1. Create a collection with `template: "file"`.
2. Give it a business-specific name such as `contract_files`, `product_images`, or `inspection_evidence`.
3. Create a normal relation field from the business collection to that file collection.
4. Never create a new field with `interface: "attachment"` and never default the target to the shared `attachments` collection.

The file template owns fields including `id`, `title`, `filename`, `extname`, `size`, `mimetype`, `path`, `url`, `preview`, `storage`, `meta`, creator, and timestamps. Do not resend those fields in a compact create request.

## Create the file collection

Example:

```bash
nb api data-modeling collections apply \
  --name contract_files \
  --title "Contract files" \
  --template file \
  --settings '{"storage":"private_contracts"}' \
  --verify \
  -e <env> -j
```

The `storage` collection option stores the storage system name, not the numeric storage ID. If omitted, uploads use the current default storage.

Read back:

```bash
nb api data-modeling collections get --filter-by-tk contract_files --appends fields -e <env> -j
```

Verify `template`, `storage`, template fields, and any business-specific fields.

## Choose the relation

| Requirement | Relation on business collection | Foreign key location |
|---|---|---|
| One business row has one chosen file | `m2o` targeting file collection | Business collection |
| One business row owns many file rows | `o2m` targeting file collection | File collection |
| Files can be shared by many business rows | `m2m` targeting file collection | Through collection |

Default to owned `o2m` only when the file row belongs to exactly one business row. Use `m2m` for a reusable media library. Ask when ownership is unclear.

## Relation payloads

Owned files (`contracts.files` and reverse `contract_files.contract`):

```json
{
  "collectionName": "contracts",
  "name": "files",
  "title": "Files",
  "interface": "o2m",
  "target": "contract_files",
  "sourceKey": "id",
  "foreignKey": "contractId",
  "targetKey": "id",
  "targetTitleField": "title",
  "reverseField": {
    "name": "contract",
    "title": "Contract",
    "interface": "m2o"
  }
}
```

Single selected file:

```json
{
  "collectionName": "contracts",
  "name": "signedFile",
  "title": "Signed file",
  "interface": "m2o",
  "target": "contract_files",
  "foreignKey": "signedFileId",
  "targetKey": "id",
  "targetTitleField": "title"
}
```

Reusable shared files:

```json
{
  "collectionName": "products",
  "name": "images",
  "title": "Images",
  "interface": "m2m",
  "target": "product_images",
  "through": "products_product_images",
  "sourceKey": "id",
  "foreignKey": "productId",
  "otherKey": "fileId",
  "targetKey": "id",
  "targetTitleField": "title"
}
```

Apply one with:

```bash
nb api data-modeling fields apply --body '<relation-json>' -e <env> -j
```

Read both collections back. Confirm field `interface`, derived relation `type`, target, foreign/other keys, through collection, and reverse field.

## File record semantics

- Each file row stores the engine used for that object in `storageId`.
- Built-in engines normally store a relative `path` plus a basename in `filename`.
- S3 Pro direct-upload finalization stores the full object key in `filename`, uses `path: ""`, and normally uses `url: ""` so access URLs are generated dynamically.
- `id` and `extname` are stable URL identity inputs and are not ordinary update fields.
- A JSON create response proves only that the row was created. It does not prove that the referenced object exists.
- Deleting a business row does not inherently delete related file rows. Cascade behavior must be explicit on the relation.
- Deleting a file row triggers physical deletion when the storage has `paranoid: false`; with `paranoid: true`, the object is retained.
