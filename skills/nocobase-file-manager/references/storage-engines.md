# Storage Engines

## Contents

- [Common settings](#common-settings)
- [Local](#local)
- [Built-in Amazon S3](#built-in-amazon-s3)
- [Aliyun OSS](#aliyun-oss)
- [Tencent COS](#tencent-cos)
- [S3 Pro](#s3-pro)
- [Selection guide](#selection-guide)

## Common settings

All storage records use these top-level fields:

| Field | Meaning |
|---|---|
| `title` | Human-readable name. |
| `name` | Unique system name used by file collections and APIs. |
| `type` | Registered engine type. |
| `path` | Relative object/directory prefix without leading or trailing slash. |
| `baseUrl` | Access base URL for local and built-in cloud engines. S3 Pro uses `options.baseUrl`. |
| `renameMode` | `appendRandomID` (safe default), `random`, or `none` (may overwrite). |
| `rules.size` | Maximum upload size in bytes; default is 20 MiB (`20971520`). |
| `rules.mimetype` | MIME patterns such as `image/*,application/pdf`. |
| `default` | Fallback engine for file collections without an explicit storage. |
| `paranoid` | When true, deleting a file record keeps the physical object. |
| `options.useOriginalUrl` | False returns a NocoBase stable URL; true returns the storage address. |
| `options.public` | Skips NocoBase file-record permission for a NocoBase URL. It does not make a bucket public. |

Safe defaults:

- `renameMode: "appendRandomID"`
- `default: false` until the user explicitly selects a default
- `paranoid: false` only when record deletion should also delete the object
- `options.useOriginalUrl: false`
- `options.public: false`

## Local

Type: `local`

Typical payload:

```json
{
  "title": "Local assets",
  "name": "local_assets",
  "type": "local",
  "baseUrl": "/storage/uploads",
  "path": "assets",
  "options": {
    "documentRoot": "storage/uploads",
    "useOriginalUrl": false,
    "public": false
  },
  "rules": {
    "size": 20971520,
    "mimetype": "image/*,application/pdf"
  },
  "renameMode": "appendRandomID",
  "default": false,
  "paranoid": false
}
```

Submitted `documentRoot` must be inside a trusted server root. `path` traversal is rejected. Local storage is suitable for small/test deployments and shared persistent volumes; it is not private object storage.

## Built-in Amazon S3

Type: `s3`

Required type-specific options are `region`, `accessKeyId`, `secretAccessKey`, and `bucket`; `endpoint` is optional. Use an environment placeholder for both credential values. Set `baseUrl` to the actual public/CDN address used for normal access.

This built-in engine uploads through the NocoBase server and is not the recommended choice for private object access. Choose S3 Pro when temporary signed access and direct browser upload are required.

## Aliyun OSS

Type: `ali-oss`

Options are `region`, `accessKeyId`, `accessKeySecret`, `bucket`, optional `timeout` in milliseconds, and optional `thumbnailRule`. Note the credential property is `accessKeySecret`, not `secretAccessKey`.

The built-in OSS engine uploads through the NocoBase server. Use S3 Pro against the provider's S3-compatible endpoint when private signed access or direct upload is required.

## Tencent COS

Type: `tx-cos`

Option names are case-sensitive: `Region`, `SecretId`, `SecretKey`, and `Bucket`. An optional `thumbnailRule` can be provided. Do not lowercase these four names.

The built-in COS engine uploads through the NocoBase server. Use S3 Pro against an S3-compatible endpoint when private signed access or direct upload is required.

## S3 Pro

Type: `s3-compatible`; the commercial S3 Pro plugin must be enabled.

Required options:

- `region`
- `accessKeyId`
- `secretAccessKey`
- `bucket`
- `endpoint` (upload endpoint)

Important optional settings:

| Field | Meaning |
|---|---|
| `options.forcePathStyle` | Upload URL format: `virtual`, `path`, or `ignore`. |
| `options.baseUrl` | Separate access/CDN endpoint; empty reuses upload endpoint. |
| `options.forcePathStyleForAccess` | Access URL format. |
| `options.disableSignedUrl` | False by default. True requires public-read bucket/objects. |
| `options.signedUrlExpires` | Signed access URL lifetime in seconds. |
| `options.presignedPostExpires` | Presigned PUT upload URL lifetime in seconds. |
| `options.thumbnailRule` | Query parameters for provider image processing. |

Recommended private configuration:

- NocoBase URL: `useOriginalUrl: false`
- NocoBase permission enforced: `public: false`
- signed storage URLs: `disableSignedUrl: false`
- bucket remains private
- CORS allows the NocoBase site to `PUT` objects

Setting `public: true` makes the NocoBase stable URL public but can still retain signed storage URLs. Setting `disableSignedUrl: true` is different: it makes generated storage URLs unsigned and therefore requires public-read object access.

## Selection guide

| Need | Choose |
|---|---|
| Small/test deployment or server disk | Local |
| Existing public AWS workflow through server | Built-in S3 |
| Existing public Aliyun workflow through server | Aliyun OSS |
| Existing public Tencent workflow through server | Tencent COS |
| Private object access, signed URLs, or direct upload | S3 Pro |

Changing the storage configured on a file collection changes later uploads. Existing file rows retain `storageId` and are not migrated automatically.
