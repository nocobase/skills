# MCP Mutation Sequences

Use this file when the user needs a reliable operational pattern for applying data-model changes through MCP.

This file is about mutation flow, not schema design. Use the collection, field, relation, and model-pack references to design the payload first. Then use this file to execute the change safely.

## Core principle

Do not treat a successful mutation response as proof that the model is correct.

Always use this sequence:

1. inspect current metadata
2. build the exact payload
3. mutate the smallest safe unit
4. read back the result
5. compare the actual metadata to the intended model

## Sequence 0: Gate plugin-provided capability

Use this before any mutation that depends on plugin-provided tables, resources, or field interfaces.

Examples:

- comments capability
- china-region field capability
- attachment-adjacent plugin capability
- many-to-many array field capability

### Step 1: inspect plugin capability

Confirm:

- the plugin is installed in the app
- the runtime plugin `name` used by plugin management
- the npm `packageName` when available
- the plugin is enabled in the current instance
- the expected collection, interface, or resource is exposed

Recommended inspection order:

1. list plugins first
2. identify the plugin record that matches the requested capability
3. capture the runtime plugin `name`
4. only then decide whether an enable action is needed

### Step 2: enable if disabled

If the plugin is installed but disabled:

- enable it first through the plugin-management capability exposed by the instance
- use the runtime plugin `name` returned by plugin inspection, not a guessed package-name transform
- for plugin-manager MCP actions, pass that plugin name in `filterByTk`
- if enablement returns `plugin name invalid`, treat that as a name-resolution failure and go back to plugin inspection instead of retrying with schema mutation

Malformed-call rule:

- if the enable call used `requestBody.name` instead of `filterByTk`, fix the MCP parameter shape first
- do not interpret that request-shape error as proof that the plugin itself is missing

If the instance does not expose plugin enablement through the current MCP surface:

- stop schema mutation and tell the user the exact plugin that must be enabled
- ask the user to enable that plugin or provide the correct management path

Do not create a weaker substitute field while this gate is unresolved.
Do not attempt a collection or field create call just to probe whether the plugin is missing.

### Step 3: verify capability exposure

Examples:

- `comments` behavior exists
- `chinaRegions` resource exists
- attachment capability exists
- `mbm` interface exists

Only after this step should schema mutation proceed.

## Sequence 1: Create a new ordinary collection

Use this when creating a new `general`, `tree`, `file`, or `calendar` collection.

### Step 1: inspect

Read:

- `collections:listMeta` when available
- or `collections:list`

Goal:

- confirm the collection name is unused
- confirm related collections already exist when relations will be added
- confirm the chosen template is appropriate

### Step 2: prepare payload

Build:

- collection payload from `references/collection-types/*.md`
- field payloads from `references/fields/*.md`
- relation payloads from `references/relations/*.md` if needed

### Step 3: create collection

Use:

- `collections:create`

Rules:

- send a direct request body, not a redundant `values` wrapper when the MCP endpoint expects direct body shape
- do not send partial field payloads

### Step 4: read back

Read:

- `collections:get`
- `collections/{collectionName}/fields:list`

### Step 5: verify

Use:

- `references/verification-playbook.md`

Focus:

- correct template
- correct primary key
- correct preset fields
- correct high-risk business fields

## Sequence 2: Add fields to an existing collection

Use this when the collection exists and only fields must be added or corrected.

### Step 1: inspect

Read:

- `collections:get`
- `collections/{collectionName}/fields:list`

Goal:

- confirm the collection already uses the intended template
- detect existing field names to avoid collisions
- confirm whether a field should be created or updated

### Step 2: prepare the smallest change

Choose one:

- create one field
- update one field
- batch-add a small set of related fields

Do not jump to full replacement unless patching is genuinely insufficient.

### Step 3: mutate

Use:

- `collections/{collectionName}/fields:create`
- or `collections/{collectionName}/fields:update`

### Step 4: read back

Read:

- `collections/{collectionName}/fields:list`
- optionally `collections:listMeta`

### Step 5: verify

Focus:

- exact `interface`
- exact `type`
- `uiSchema.title`
- `uiSchema.x-component`
- defaults, enums, and validators

## Sequence 3: Replace a whole field set

Use this only when the user explicitly wants replacement or when the existing field set is too drifted for targeted patching.

### Step 1: inspect

Read the full current collection and field metadata first.

### Step 2: decide whether replacement is justified

Good reasons:

- user explicitly asked for full replacement
- model is in a broken prototype state
- the target shape is clearer than patching many individual drifts

Bad reasons:

- convenience
- minor enum change
- one or two missing fields

### Step 3: replace

Use:

- `collections:setFields`

Rule:

- treat this as replacement, not patching

### Step 4: read back

Read all field metadata again.

### Step 5: verify

Confirm that required existing fields were not accidentally dropped, especially:

- id strategy
- audit fields
- structural template fields
- relation reverse fields

## Sequence 4: Add or update a relation field

Use this when association correctness is the main risk.

### Step 1: inspect both sides

Read:

- source collection
- source fields
- target collection
- target fields

Goal:

- confirm target exists
- confirm readable label field exists on the target
- confirm relation does not already exist under another name

### Step 2: choose relation family

Use:

- `references/relation-fields.md`
- then `references/relations/*.md`

### Step 3: mutate

Use the appropriate field create or update operation on the source collection.

### Step 4: read back both sides

Read:

- source fields
- target fields

### Step 5: verify

Confirm:

- direction is correct
- foreign key is on the correct side
- reverse field exists when requested
- labels are readable

## Sequence 5: Create a special collection

Use this for `sql`, `view`, or `inherit`.

### Step 1: capability gate

Before mutation, confirm:

- the instance supports the chosen type
- any required plugin behavior is available
- upstream dependencies exist

Examples:

- `sql`: query must be valid and safe
- `view`: database view must already exist
- `inherit`: parent collection must already exist

Hard rule for `view`:

- if `dbViews:list` or `dbViews:get` does not find the upstream database view, stop this sequence;
- do not create a placeholder `view` collection;
- do not downgrade to `general` unless the user explicitly changes the modeling intent.

### Step 2: inspect the upstream source

Examples:

- `sql`: inspect the projected columns and aliases
- `view`: inspect `dbViews:get`
- `inherit`: inspect parent collection fields

For `view`:

- if upstream inspection fails, treat that as a blocker, not as a reason to continue with guessed fields.

### Step 3: create collection

Use:

- `collections:create`

For `view`:

- only create after upstream view existence, schema, and columns were confirmed.

### Step 4: read back

Read:

- `collections:get`
- `collections/{collectionName}/fields:list`
- upstream metadata again if needed

### Step 5: verify

Confirm:

- special template is correct
- upstream source and collection metadata still match
- inherited or derived fields did not drift

## Sequence 6: Fix a drifted model

Use this when the current collection exists but its actual metadata is no longer what the user intended.

### Step 1: inspect current metadata

Do not trust prior requests or memory. Read the actual metadata first.

### Step 2: classify the drift

Common drift types:

- wrong collection template
- wrong primary key
- wrong field interface
- missing enum
- missing preset-field parameters
- wrong relation direction

### Step 3: fix the highest-risk drift first

Priority:

1. collection template
2. primary key
3. structural template fields
4. business fields
5. relations

### Step 4: read back after each fix

Do not stack multiple risky corrections without verification between them.

### Step 5: re-run the verification playbook

Use:

- `references/verification-playbook.md`

## Minimal safe mutation checklist

Before any mutation:

1. know the target collection type
2. know the exact field family
3. know whether the change is create, patch, or replacement
4. know what read-back will prove success

After any mutation:

1. read metadata back immediately
2. verify the high-risk fields first
3. treat unresolved drift as incomplete work
