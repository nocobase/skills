# Build & Package

Read this when the user wants to build or distribute the plugin.

## Build

```bash
yarn build @my-project/plugin-hello
```

Compiles `src/` to JavaScript — client-v2 code via Rsbuild, server code via tsup. Output goes to `dist/`.

## Package

```bash
yarn nocobase tar @my-project/plugin-hello
```

Creates `storage/tar/@my-project/plugin-hello.tar.gz`.

## Build + Package in One Step

```bash
yarn build @my-project/plugin-hello --tar
```

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

Upload the `.tar.gz` file to the target application's `./storage/plugins` directory.

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/build.md

## Related Links

- [Getting Started](./getting-started.md) — plugin scaffold and project structure
