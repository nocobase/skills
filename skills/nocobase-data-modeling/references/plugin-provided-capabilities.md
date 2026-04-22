# Plugin-Provided Capabilities

Use this file when the requested table or field is not purely a normal built-in collection-manager construct.

The main rule is simple:

- if a table, field interface, or backing resource is provided by a plugin, do not model against it until the plugin is confirmed installed and enabled
- if the plugin is installed but disabled, enable it first
- if the plugin is not enabled yet, try to enable it through the current management path before giving up
- if enablement is not possible, stop and tell the user the exact plugin package that must be enabled
- only after enablement should the skill create or mutate fields that depend on that plugin
- never guess the plugin-management identifier from the package name alone; inspect the actual plugin list and use the runtime plugin `name` returned by the instance

## Mandatory plugin gate

Before using any plugin-provided collection or field:

1. inspect plugin availability in the current app
2. capture both the runtime plugin `name` and the npm `packageName` when the instance exposes them
3. confirm the plugin is enabled, not just present in dependencies
4. confirm the expected collection, field interface, or resource is actually exposed
5. if not enabled, enable it first using the runtime plugin `name`, not a guessed package-name transform
6. if enablement cannot be completed, stop and tell the user which plugin must be enabled
7. only then create or update the schema that depends on it

Do not silently fall back to a weaker plain-text design just because the plugin is disabled.
Do not create a guessed substitute field if the real plugin-backed interface is unavailable.
Do not attempt collection or field creation just to see whether the plugin-missing error appears.

## Plugin name rule

For plugin management, distinguish these two identifiers:

- runtime plugin `name`: the identifier used by plugin-management operations such as enable or disable
- npm `packageName`: the package identifier shown in package metadata and documentation

Operational rule:

- inspect the plugin list first and use the actual runtime plugin `name` returned by the instance for enablement
- do not assume `@nocobase/plugin-foo` can be passed directly to `nb api pm enable`
- do not assume stripping `@nocobase/plugin-` is always safe unless the instance has already confirmed that exact runtime name
- before the first enable or inspect action in the current task, read `nb api pm --help` and the matching subcommand help

Recommended enablement sequence:

1. list plugins from the instance
2. locate the record by expected capability or `packageName`
3. read the actual runtime plugin `name`
4. call enable using that runtime plugin `name` via `filterByTk`
5. re-list or re-read plugin state to confirm it is enabled
6. only then inspect backing collections, resources, or field interfaces

Failure handling:

- if the plugin list does not expose a matching runtime plugin `name`, stop and report that enablement could not be resolved safely
- if enablement returns `plugin name invalid`, assume the wrong identifier was used and go back to plugin-list inspection instead of retrying schema creation
- if the enable command shape is unclear, stop and inspect the current CLI help instead of guessing flags or payload shape

## Known plugin-backed capabilities

### Comments

Typical plugin:

- `@nocobase/plugin-comments`
- runtime plugin `name`: `comments`

Typical capability:

- plugin-provided comment collection behavior and related UI blocks

Modeling rule:

- if the user wants real comment capability, do not hand-build a fake `comments` table first
- check whether the comments plugin is enabled
- if disabled, enable it first
- then inspect the resulting collection and use the plugin-provided capability

Configuration method:

- treat comments as plugin-provided app capability first, not as a normal collection-template choice
- after enablement, inspect whether the instance already exposes the plugin-provided comments collection or comment-related resource
- if the user needs comment behavior on another table, model the host business table correctly first, then attach the comment capability at the plugin or UI layer instead of inventing a substitute schema

Modeling checklist:

1. confirm comments plugin enabled
2. inspect the actual comment capability exposed by the instance
3. keep the host business table separate from the plugin comment data
4. do not replace comment capability with a plain textarea field when the user asked for actual comments

Failure pattern:

- replacing real comment capability with an ordinary text table called `comments`

### China region

Typical plugin:

- `@nocobase/plugin-field-china-region`
- runtime plugin `name`: `field-china-region`

Typical capabilities:

- `chinaRegion` field interface
- backing `chinaRegions` collection or resource

Modeling rule:

- do not create a `chinaRegion` field unless the plugin is enabled
- confirm the `chinaRegions` resource or collection exists
- if the plugin is disabled, enable it first
- then use the real `chinaRegion` interface instead of plain text or generic json
- if `chinaRegions` is missing, treat the plugin as not ready and stop before any collection or field create call

Configuration method:

- create a `chinaRegion` field only after plugin enablement is confirmed
- use the plugin-backed association configuration, not a guessed scalar field
- the backing target is `chinaRegions`
- the field behaves as a relation-backed cascader rather than a plain local enum
- do not accept "field created but `chinaRegions` missing" as a valid intermediate state

Canonical field shape:

```json
{
  "name": "region",
  "interface": "chinaRegion",
  "type": "belongsToMany",
  "target": "chinaRegions",
  "targetKey": "code",
  "sourceKey": "id",
  "sortBy": "level",
  "through": "t_region_links",
  "foreignKey": "f_record_id",
  "otherKey": "f_region_code",
  "uiSchema": {
    "type": "array",
    "title": "Region",
    "x-component": "Cascader",
    "x-component-props": {
      "useDataSource": "{{ useChinaRegionDataSource }}",
      "useLoadData": "{{ useChinaRegionLoadData }}",
      "changeOnSelectLast": false,
      "labelInValue": true,
      "maxLevel": 3,
      "fieldNames": {
        "label": "name",
        "value": "code",
        "children": "children"
      }
    }
  }
}
```

Important details:

- `target` should point to `chinaRegions`
- `targetKey` for selection behavior is code-oriented in the plugin interface
- a through table and keys are still required because this is relation-backed
- `maxLevel` controls province, city, and area depth
- `changeOnSelectLast` controls whether selection must reach the last configured level

Failure pattern:

- a field named `region` is created as plain text because the plugin-backed interface was not checked
- a `chinaRegion` field was created while `chinaRegions` was still missing
- a response claims the field is structurally created even though the backing `chinaRegions` capability does not exist

### File and attachment-backed features

Typical plugin:

- `@nocobase/plugin-file-manager`
- runtime plugin `name`: `file-manager`

Related plugin:

- `@nocobase/plugin-field-attachment-url`
- runtime plugin `name`: `field-attachment-url`

Typical capabilities:

- `attachments` collection or upload resource
- attachment-oriented field behavior
- attachment URL interface when available

Modeling rule:

- do not assume attachment capability exists in every instance
- confirm file-manager capability before relying on attachment-backed modeling
- if attachment URL behavior is requested, confirm that plugin capability too
- if disabled, enable the required plugin first

Configuration method for `attachment`:

- use ordinary attachment field modeling only after file-manager capability is available
- the usual target is the attachment-capable collection exposed by the instance
- use the attachment field when the file is subordinate to another record

Configuration method for `attachmentURL`:

- confirm the attachment-url plugin is enabled
- use `interface: "attachmentURL"`
- choose the upload target collection explicitly
- default target is often `attachments` when that capability exists

Canonical field shape for `attachmentURL`:

```json
{
  "name": "coverUrl",
  "interface": "attachmentURL",
  "type": "string",
  "target": "attachments",
  "targetKey": "id",
  "uiSchema": {
    "type": "string",
    "title": "Cover URL",
    "x-component": "AttachmentUrl",
    "x-use-component-props": "useAttachmentUrlFieldProps"
  }
}
```

Important details:

- `target` is required
- `targetKey` defaults to `id`
- this is not the same as the ordinary `attachment` field
- if the user wants real file records, prefer a `file` collection instead of forcing everything through a URL field

Failure pattern:

- attachment-style fields are created while the backing attachment capability is unavailable

### Many-to-many array field

Typical plugin:

- `@nocobase/plugin-field-m2m-array`
- runtime plugin `name`: `field-m2m-array`

Typical capability:

- `mbm` field interface for many-to-many array style behavior

Modeling rule:

- do not confuse `mbm` with the core `m2m` relation
- if the user explicitly wants the plugin-backed many-to-many array field, confirm the plugin is enabled first
- if disabled, enable it first
- only then create fields using the `mbm` interface

Configuration method:

- use `interface: "mbm"`
- the plugin-backed relation type is `belongsToArray`
- choose `target`, `foreignKey`, and `targetKey` explicitly
- configure the association field for multiple selection and readable labels

Canonical field shape:

```json
{
  "name": "members",
  "interface": "mbm",
  "type": "belongsToArray",
  "target": "users",
  "foreignKey": "f_members",
  "targetKey": "id",
  "uiSchema": {
    "title": "Members",
    "x-component": "AssociationField",
    "x-component-props": {
      "multiple": true,
      "fieldNames": {
        "value": "id",
        "label": "nickname"
      }
    }
  }
}
```

Important details:

- this is not a through-table `belongsToMany`
- do not reuse `through` and `otherKey` rules from core `m2m`
- readable labels should come from the target collection title field or another unique readable field

Failure pattern:

- user asked for many-to-many array behavior, but the skill created a normal `m2m` relation without checking plugin capability

### Markdown Vditor

Typical plugin:

- `@nocobase/plugin-field-markdown-vditor`
- runtime plugin `name`: `field-markdown-vditor`

Typical capability:

- `vditor` field interface

Modeling rule:

- do not use `vditor` unless the plugin is enabled
- if disabled, enable it first
- if the plugin is unavailable, fall back only when the user accepts ordinary `markdown`

### Formula, sort, code, and sequence fields

Typical plugins:

- `@nocobase/plugin-field-formula`
- runtime plugin `name`: `field-formula`
- `@nocobase/plugin-field-sort`
- runtime plugin `name`: `field-sort`
- `@nocobase/plugin-field-code`
- runtime plugin `name`: `field-code`
- `@nocobase/plugin-field-sequence`
- runtime plugin `name`: `field-sequence`

Modeling rule:

- treat these as capability-gated advanced fields
- confirm the specific field plugin is enabled before use
- do not invent plugin-specific config when the field capability is unavailable
- `sort` should use `type: "sort"`, not a guessed plain integer type
- `code` should use the `CodeEditor` component rather than ordinary textarea rendering

### Encryption field

Typical plugin:

- `@nocobase/plugin-field-encryption`
- runtime plugin `name`: `field-encryption`

Modeling rule:

- treat encryption as a plugin-backed advanced field
- confirm capability and enablement before using the `encryption` interface
- do not silently replace encryption with plain text when the user explicitly requested encrypted storage

### Space field

Typical plugin:

- multi-space capability in the current instance
- common runtime plugin `name`: `multi-space`

Modeling rule:

- confirm multi-space capability and `spaces` relation support before using the `space` field

### Map-based geometry

Typical plugin:

- `@nocobase/plugin-map`
- runtime plugin `name`: `map`

Modeling rule:

- treat map-based geometry as plugin-backed
- confirm map capability is enabled before modeling geometry-oriented fields
- the plugin typically exposes `point`, `lineString`, `circle`, and `polygon`
- use the geometry-specific interface instead of degrading to plain `json` when the user explicitly asked for map fields
- do not claim a stable geometry payload unless the current instance exposes it

## What to verify after enablement

After enabling a plugin, verify the capability is actually exposed:

- plugin-backed collection exists when one is expected
- plugin-backed field interface appears in available interfaces or collection metadata flows
- backing resource exists when the interface depends on one

Examples:

- `comments` behavior for comments plugin
- `chinaRegions` resource for china-region plugin
- `attachments` capability for file-manager plugin
- `mbm` interface for many-to-many array plugin

## Modeling priority with plugins

When plugin-backed features are requested, use this order:

1. plugin gate
2. collection type decision
3. field family or relation family decision
4. mutation sequence
5. verification playbook

If step 1 fails, do not proceed as if the requested capability already exists.
