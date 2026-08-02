# Portal Project Upgrades

The canonical base template is the `@nocobase/portal-template-default` package.
In this skill, upgrading a Portal means applying the latest base-template
changes to the user project through a recoverable source merge, including any
required `@nocobase/portal-sdk` and installed Registry migrations. Do not
reinstall a template over the project, reduce the operation to dependency or
version changes, or change compatibility metadata to silence a version check.
Treat the user's source, configuration, assets, and local customizations as
irreplaceable.

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

## Approval and recovery gate

Do not mutate the project until every item below is complete:

1. Inspect whether the project is a Git repository and whether it contains
   tracked, staged, untracked, or ignored user work.
2. For a Git project, identify a known recoverable commit and preserve all
   uncommitted work. If no safe checkpoint exists, ask the user to create one or
   obtain authorization to create it; do not stash, reset, clean, or discard
   changes automatically.
3. For a non-Git project, create a timestamped backup at an explicit path
   outside the project tree before editing. Include source, configuration,
   hidden project files, user-owned assets, and local extensions. Exclude only
   confirmed reproducible caches or build outputs. Preserve permissions, do not
   expose secrets, and verify that the backup is readable and has the expected
   files before proceeding. If a verified backup cannot be created, stop.
4. Prepare a concrete upgrade plan containing current and target Template, SDK,
   and Registry versions; files and subsystems expected to change; application
   customizations at risk; migration and conflict strategy; checks to run; and
   the exact rollback path.
5. Present the plan and recovery location or Git checkpoint to the user and
   obtain explicit confirmation. Without confirmation, make no source,
   dependency, lockfile, or compatibility-metadata changes.

## Upgrade workflow

1. Read the migration guide for every skipped Portal SDK major and identify the
   exact target SDK, Default Template, and Registry item versions.
2. Record the current `nocobase.defaultTemplateVersion`, the resolved Portal SDK
   version, installed Registry source, and application-owned customizations.
3. Obtain the exact current and target Default Template releases. Compute the
   base delta from current template to target template and apply it to the user
   project as a three-way merge.
4. Merge shared runtime and composition changes while preserving
   application-owned routes, pages, components, translations, branding,
   themes, and business behavior. Never replace the whole `src` tree.
5. Apply documented API replacements to application code and customized
   Registry source. Do not invent a migration when the required contract is
   absent; report the missing guidance.
6. Update each installed Registry item independently. Treat
   `src/extensions/<item>` as user-owned materialized source: auto-merge
   untouched files, review changed files, and never blindly overwrite local
   customizations.
7. Update `@nocobase/portal-sdk` only after the matching template host changes
   are present. Update `nocobase.defaultTemplateVersion` only after the target
   base-template source has actually been merged.
8. Install dependencies, run `pnpm sdk:check`, run the project's type check and
   production build, and run focused regressions for affected runtime areas.
9. Verify the real Portal basename in a browser: authentication and login
    return paths, SSO when relevant, navigation, direct URLs and refresh,
    drawers and dialogs, allowed and denied ACL states, localization, installed
    extensions, and representative business workflows.
10. Deploy only when requested. Keep the prior commit or verified backup and
    production artifact available for rollback.

## Safety rules

- Never update only `nocobase.defaultTemplateVersion` to satisfy
  `pnpm sdk:check`.
- Never assume updating the SDK package also updates the template's host source.
- Never overwrite application-owned code with a clean template copy.
- Never upgrade all Registry items as an undifferentiated bulk replacement.
- Never discard user changes to resolve a merge conflict.
- Never use destructive Git or filesystem operations to force an upgrade
  through. Stop on an ambiguous conflict, preserve both versions, and ask for
  direction.
- Never proceed without both a verified recovery path and explicit approval of
  the upgrade plan.
- Keep backend schema and data migrations separate; execute them only when the
  target release explicitly requires and documents them.

Report the source releases merged, migrations applied, Registry items updated,
compatibility metadata changed, checks performed, unresolved conflicts, and the
remaining deploy or rollback step.
