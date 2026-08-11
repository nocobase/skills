# Operations and Safety

## Contents

- [URL and permission modes](#url-and-permission-modes)
- [Upload and readback](#upload-and-readback)
- [Updates](#updates)
- [Deletion](#deletion)
- [Troubleshooting](#troubleshooting)

## URL and permission modes

NocoBase URL is the default. A file row returns a stable path similar to:

```text
/files/<app>/<dataSource>/<collection>/<id><extname>
```

The request enters NocoBase, checks file-record access unless the storage has `options.public: true`, and then redirects to the actual storage address. Do not persist the redirect target because signed URLs can expire.

Original URL (`options.useOriginalUrl: true`) bypasses NocoBase file-record permission. Use it only when an external renderer or service must read the storage address directly.

For S3 Pro:

- `options.public` controls permission on the NocoBase URL.
- `options.disableSignedUrl` controls whether the storage address is signed.
- These are independent. A public NocoBase URL can still redirect to a short-lived signed private object URL.

Changing URL mode applies to existing and new rows from that storage because URLs are generated when records are read. It does not move objects.

## Upload and readback

Before an upload, verify:

- the target collection exists and uses `template: "file"`;
- its storage system name resolves, or exactly one intended default exists;
- MIME and size rules accept the file;
- S3 Pro bucket CORS permits the NocoBase origin and `PUT`;
- engine endpoint, bucket, URL style, and credentials are valid.

Normal user upload is performed through a file-collection UI field/action. The generic `nb api resource create` command cannot carry a local binary file. Do not substitute a JSON row.

After upload, read the row and verify `id`, `title`, `filename`, `extname`, `size`, `mimetype`, `path`, `storageId`, `url`, and `preview`. For external/direct upload, separately verify object reachability; row creation alone is insufficient.

## Updates

Read current safe state first. Then show and confirm impact for:

- `default`: changes fallback for later uploads;
- collection `storage`: changes later uploads for that collection, not historical rows;
- `rules`: may reject later uploads but does not revalidate existing rows;
- `path`: changes where later objects are written;
- `renameMode: "none"`: may overwrite an object with the same name;
- `paranoid`: changes whether later file-row deletion removes physical objects;
- URL/public/signed settings: changes who can access existing and new rows;
- nested `options`: may replace omitted keys, so send a complete intended object.

After update, read back safe fields and exercise one intended allowed case plus one guarded case. Never print rendered credentials.

## Deletion

Storage deletion checklist:

1. Resolve the exact storage record.
2. Confirm it is not the protected built-in default local storage.
3. List file collections and find any whose `storage` option equals its system name.
4. Inspect file records in every relevant file collection for its `storageId`.
5. State that deleting the storage record does not migrate or repair those file rows or objects.
6. Obtain fresh exact-target confirmation.
7. Delete and verify absence.

The server blocks deleting a storage referenced by a file collection. Still inspect file rows because historical rows can retain a storage ID after the collection binding changes.

File-record deletion checklist:

1. Read the row and its business relations.
2. Resolve storage and `paranoid`.
3. State whether physical deletion will be attempted.
4. Obtain fresh exact-target confirmation.
5. Delete one exact record and verify absence.

Recreating a database row does not restore a deleted object. Recovery requires a storage version, snapshot, or backup.

## Troubleshooting

| Symptom | Checks |
|---|---|
| No storage found | File collection `storage`, requested storage name, then default storage. |
| Upload unsupported | Target exists and has `template: "file"`; required plugin is enabled. |
| MIME rejection | Actual content detection, filename active-content type, and `rules.mimetype`. |
| Size rejection | `rules.size` is bytes and at least 1. |
| Local path rejected | No `..`, NUL, or untrusted `documentRoot`; path stays inside allowed root. |
| S3 Pro upload fails | Endpoint style, bucket, region, presigned expiry, browser CORS, and provider clock. |
| S3 Pro access fails | Access endpoint/style, signed URL setting, bucket policy, expiry, and CDN behavior. |
| Stable URL returns 403 | Login/API credentials, file collection view permission, public flag, app/data-source identity. |
| Preview fails after redirect | Object-storage CORS, content type, preview query rule, and external preview reachability. |
| Storage delete fails | Default protection or a file collection still references the storage system name. |

Direct SQL changes bypass storage cache reload and model hooks. If legacy/manual changes already occurred, restart the application and re-read configuration before diagnosing further; do not make more direct database changes.
