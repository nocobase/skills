# Git Source Storage

## Storage Path Is Not Development Path

`--git-path` / `git_path` is the Portal source's repository-relative storage path for `nb portal pull`, `nb portal push`, and `nb portal deploy` workflows. It is not the local development directory.

For AI Portal source edits, first resolve the selected Portal's `developmentPath` / `localPath` from `nb portal list -j` or `nb portal info <portal> -j`. If that path is empty, run `nb portal pull <portal>`, read the Portal info/list again, and edit only in the returned local development directory. Do not `cd` into a configured storage path such as `portals/customer` unless the pull readback explicitly reports that same path as the local development directory.

## Recommended Default

For one Portal per Git repository, use the repository root:

```bash
nb portal config <portal> --source-storage git --git-repo <repo> --git-branch main --git-path .
```

When creating a Portal with Git source storage:

```bash
nb portal create <portal> --source-storage git --git-repo <repo> --git-branch main --git-path .
```

## Multiple Portals In One Repository

Use subdirectories only when the repository intentionally stores multiple Portals or other source trees:

```bash
nb portal config customer --git-path portals/customer
nb portal config partner --git-path portals/partner
```

## Existing Config Does Not Change Automatically

Changing the CLI default does not rewrite existing local or remote configuration. If `portal.config.json` or the remote Portal record already stores a path such as `customer`, explicitly update it:

```bash
nb portal config <portal> --git-path .
```

Then inspect:

```bash
nb portal info <portal>
```

## Empty Git Repositories

An empty GitHub repository has no real `main` branch until the first commit exists.

Newer CLI behavior should allow `nb portal push` to create the configured branch during the first push. If the installed CLI does not support that behavior, the failure commonly looks like:

```text
fatal: Remote branch main not found in upstream origin
```

Recovery options:

1. Hand off to `nocobase-env-manage` to update to a CLI version that supports branch creation during Portal Git push.
2. Initialize the remote branch manually with a first commit.
3. Configure a branch that already exists:

```bash
nb portal config <portal> --git-branch <existing-branch>
```

## Missing Git Path

If `pull` reports that the configured Git path does not exist, inspect the configured path:

```bash
nb portal info <portal>
```

Then either:

- push local source first with `nb portal push <portal> -m "Initial portal source"`
- change the configured path with `nb portal config <portal> --git-path .`
- create the expected subdirectory in the repository

## Authentication And Remote URL

Use a full Git remote URL:

```text
git@github.com:org/repo.git
https://github.com/org/repo.git
ssh://git@host/org/repo.git
file:///absolute/path/to/repo.git
```

If Git authentication fails, report the Git error directly. Do not switch remote URLs, generate tokens, or modify SSH config unless the user asks for that recovery path.
