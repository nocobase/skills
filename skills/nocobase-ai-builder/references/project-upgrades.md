# Portal Project Upgrades

Upgrade an existing user-owned Portal through a recoverable source merge. Do
not reinstall a template over the project or change compatibility metadata to
silence a version check.

## Classify the upgrade

| Change | Required treatment |
|---|---|
| Compatible Portal SDK patch or minor | Update the dependency, install, check compatibility, and verify. |
| Template source release | Merge the old-to-new base-template source delta into the user project. |
| Coordinated SDK and template major | Merge the required template release, apply its migration guide, then update the SDK major. |
| Installed Registry item | Update that item separately and review conflicts with its materialized source under `src/extensions`. |

The user application's package version and
`nocobase.defaultTemplateVersion` are different values. The latter records the
exact Default Template release whose source has been incorporated.

## Upgrade workflow

1. Inspect the working tree and preserve unrelated changes. Establish a
   recoverable Git state, but do not commit, push, pull, or deploy unless the
   user requested it.
2. Read the migration guide for every skipped Portal SDK major and identify the
   exact target SDK, Default Template, and Registry item versions.
3. Record the current `nocobase.defaultTemplateVersion`, the resolved Portal SDK
   version, installed Registry source, and application-owned customizations.
4. Obtain the exact current and target Default Template releases. Compute the
   base delta from current template to target template and apply it to the user
   project as a three-way merge.
5. Merge shared runtime and composition changes while preserving
   application-owned routes, pages, components, translations, branding,
   themes, and business behavior. Never replace the whole `src` tree.
6. Apply documented API replacements to application code and customized
   Registry source. Do not invent a migration when the required contract is
   absent; report the missing guidance.
7. Update each installed Registry item independently. Treat
   `src/extensions/<item>` as user-owned materialized source: auto-merge
   untouched files, review changed files, and never blindly overwrite local
   customizations.
8. Update `@nocobase/portal-sdk` only after the matching template host changes
   are present. Update `nocobase.defaultTemplateVersion` only after the target
   base-template source has actually been merged.
9. Install dependencies, run `pnpm sdk:check`, run the project's type check and
   production build, and run focused regressions for affected runtime areas.
10. Verify the real Portal basename in a browser: authentication and login
    return paths, SSO when relevant, navigation, direct URLs and refresh,
    drawers and dialogs, allowed and denied ACL states, localization, installed
    extensions, and representative business workflows.
11. Deploy only when requested. Keep the prior commit and production artifact
    available for rollback.

## Safety rules

- Never update only `nocobase.defaultTemplateVersion` to satisfy
  `pnpm sdk:check`.
- Never assume updating the SDK package also updates the template's host source.
- Never overwrite application-owned code with a clean template copy.
- Never upgrade all Registry items as an undifferentiated bulk replacement.
- Never discard user changes to resolve a merge conflict.
- Keep backend schema and data migrations separate; execute them only when the
  target release explicitly requires and documents them.

Report the source releases merged, migrations applied, Registry items updated,
compatibility metadata changed, checks performed, unresolved conflicts, and the
remaining deploy or rollback step.
