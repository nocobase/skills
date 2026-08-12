# Build & Package

Read this when the user wants to build or distribute the plugin.

## Build

**Important:** `nb source build` must be run from the source directory (`<app-path>/source/`).

For CLI-managed source apps:

```bash
cd <app-path>/source
nb source build @my-project/plugin-hello
```

For plain source repos:

```bash
yarn build @my-project/plugin-hello
```

Compiles `src/` to JavaScript — client-v2 code via Rsbuild, server code via tsup. Output goes to `dist/`.

## Package

**Important:** Same as build — run from the source tree.

`nb source build` has no `--tar` flag; its only flags are `--cwd`, `--no-dts`, `--sourcemap`, and `--verbose`. Use the underlying `yarn` commands to package, from `<app-path>/source/` for CLI-managed apps or the repo root for plain source repos:

```bash
# Build and package in one step
yarn build @my-project/plugin-hello --tar

# Or package an existing build
yarn nocobase tar @my-project/plugin-hello
```

The tarball lands in `storage/tar/`, named `<package-name>-<version>.tgz` — for example `storage/tar/@my-project/plugin-hello-0.1.0.tgz`.

## Custom Build Config

Create `build.config.ts` in the plugin root (only if needed):

```ts
import { defineConfig } from '@nocobase/build';

export default defineConfig({
  modifyRsbuildConfig: (config) => {
    // Modify client-side Rsbuild config
    // Reference: https://rsbuild.rs/config/index
    return config;
  },
  modifyTsupConfig: (config) => {
    // Modify server-side tsup config
    // Reference: https://tsup.egoist.dev/#using-custom-configuration
    return config;
  },
});
```

## Upload to Another NocoBase Instance

Upload and extract the `.tgz` file into the target application's `./storage/plugins` directory.

If the target application is CLI-managed (`nb init`), import it directly instead of extracting by hand:

```bash
nb plugin import /your/path/plugin-hello-0.1.0.tgz
```

This also accepts a remote URL or an npm package spec. Restart the app afterwards before enabling the plugin.

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/build.md

## Related Links

- [Getting Started](./getting-started.md) — plugin scaffold and project structure
