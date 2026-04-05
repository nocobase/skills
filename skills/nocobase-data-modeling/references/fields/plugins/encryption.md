# Plugin Field: Encryption

Use this file when the requested field is the plugin-backed `encryption` field.

## Plugin gate

Typical plugin:

- `@nocobase/plugin-field-encryption`

License note:

- this field comes from the pro plugin set, so capability must be confirmed in the current instance before modeling against it

Before using this field:

1. confirm the plugin is installed and enabled
2. confirm the `encryption` field interface is exposed in the current instance
3. confirm the current instance allows encrypted-field operators and storage behavior

## What this field is

This is not a plain string field and not just a password widget.

It is a plugin-backed encrypted storage field with:

- `type: "encryption"`
- optional `hidden`
- encrypted comparison operators

Compact request:

```json
{
  "name": "secretValue",
  "interface": "encryption",
  "title": "Secret value",
  "hidden": true
}
```

Use this compact shape by default.

## Expanded structure

```json
{
  "name": "secretValue",
  "interface": "encryption",
  "type": "encryption",
  "hidden": true,
  "uiSchema": {
    "type": "string",
    "title": "Secret value",
    "x-component": "Input"
  }
}
```

## Important details

- `type` should be `encryption`, not plain `string`
- default UI uses `Input`, not `Password`
- `hidden` is the exposed field option that controls whether the response returns the field value
- available types exposed by the interface include `string` and `encryption`, but the encryption field should use the encrypted type when true encrypted storage is required

## Filter behavior

The field interface exposes encryption-specific operators such as:

- `$encryptionEq`
- `$encryptionNe`
- `$empty`
- `$notEmpty`

Treat this as encrypted-field capability, not ordinary plain-text filtering.

## Visibility guidance

- use `hidden: true` when the field should not be returned in ordinary response payloads
- if the user explicitly wants encrypted storage but readable response echoing is also discussed, confirm the intended behavior instead of guessing

## Verification checklist

Verify at least:

1. `interface` is `encryption`
2. `type` is `encryption`
3. `hidden` matches the intended response visibility
4. the field was not silently downgraded to plain `string`
5. the plugin capability is actually enabled in the current instance

## Anti-drift rules

- do not replace encrypted storage with plain text when the user explicitly asked for encryption
- do not choose `encryption` when the user only asked for masked display or password-style input
- do not document this field as a password input field only
- do not treat `Input` vs `Password` as the core concern; storage semantics are the real concern
- do not assume this capability exists in every instance because it is plugin-gated and pro-gated
