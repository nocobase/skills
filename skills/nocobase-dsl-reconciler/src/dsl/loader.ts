/**
 * Load page definitions from .ts or .yaml files.
 *
 * TS is an optional override layer — not a replacement for YAML:
 * - Export always produces YAML (snapshot, copy-paste friendly)
 * - If layout.ts exists alongside layout.yaml, TS takes priority
 * - TS can import and extend YAML base specs
 * - The loader checks for .ts first, falls back to .yaml
 *
 * Requires a TS-aware runtime for .ts imports (tsx, ts-node, Bun, etc.).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PageSpec, PopupSpec, BlockSpec } from '../types/spec';
import type { PageInfo } from '../deploy/page-discovery';
import type { PageDefNode, AppDefNode } from './types';
import { compilePage, compileApp } from './compile';
import type { RouteEntry } from '../deploy/page-discovery';
import { loadYaml } from '../utils/yaml';

/**
 * Load a single .ts file that exports a PageDefNode (as default or named `page`).
 *
 * @example
 *   // overview.ts
 *   export default page('Overview', { blocks: [...] });
 *
 *   // loader
 *   const spec = await loadTsPage('./pages/overview.ts');
 */
export async function loadTsPage(filePath: string): Promise<PageSpec> {
  const abs = path.resolve(filePath);
  const mod = await import(abs);
  const pageDef: PageDefNode = mod.default ?? mod.page;

  if (!pageDef || pageDef.__kind !== 'page') {
    throw new Error(
      `${filePath}: expected default export or named export "page" of type PageDefNode, ` +
        `got ${pageDef?.__kind ?? typeof pageDef}`,
    );
  }

  return compilePage(pageDef);
}

/**
 * Load a single .ts file that exports an AppDefNode (as default or named `app`).
 *
 * @example
 *   // crm.ts
 *   export default app('CRM', { routes: [...] });
 *
 *   // loader
 *   const { routes, pages, popups } = await loadTsApp('./crm.ts');
 */
export async function loadTsApp(
  filePath: string,
): Promise<{ routes: RouteEntry[]; pages: Map<string, PageSpec>; popups: PopupSpec[] }> {
  const abs = path.resolve(filePath);
  const mod = await import(abs);
  const appDef: AppDefNode = mod.default ?? mod.app;

  if (!appDef || appDef.__kind !== 'app') {
    throw new Error(
      `${filePath}: expected default export or named export "app" of type AppDefNode, ` +
        `got ${appDef?.__kind ?? typeof appDef}`,
    );
  }

  return compileApp(appDef);
}

/**
 * Load a page layout from a directory, checking for TS override first.
 *
 * Priority: layout.ts > layout.yaml
 *
 * - layout.ts should export a PageDefNode (default or named `page`)
 * - layout.yaml is the standard YAML spec format
 *
 * Returns the PageSpec regardless of source format.
 */
export async function loadPageLayout(
  pageDir: string,
  title: string,
  icon?: string,
): Promise<PageSpec | null> {
  const tsFile = path.join(pageDir, 'layout.ts');
  const yamlFile = path.join(pageDir, 'layout.yaml');

  if (fs.existsSync(tsFile)) {
    // TS override takes priority
    const mod = await import(tsFile);
    const pageDef: PageDefNode = mod.default ?? mod.page;

    if (!pageDef || pageDef.__kind !== 'page') {
      console.warn(
        `[dsl/loader] ${tsFile}: no valid PageDefNode export, falling back to YAML`,
      );
    } else {
      return compilePage(pageDef);
    }
  }

  if (fs.existsSync(yamlFile)) {
    // Standard YAML path
    const layoutRaw = loadYaml<Record<string, unknown>>(yamlFile);
    return {
      page: title,
      icon: icon ?? 'fileoutlined',
      coll: (layoutRaw.coll as string) || undefined,
      blocks: (layoutRaw.blocks || []) as BlockSpec[],
      layout: layoutRaw.layout as PageSpec['layout'],
    };
  }

  return null;
}

/**
 * Scan a directory for .ts page files and compile each to PageInfo.
 *
 * Each .ts file should export a PageDefNode as default or named `page`.
 * The filename (without extension) is used as the slug.
 *
 * @example
 *   const pages = await loadTsPages('./pages');
 */
export async function loadTsPages(pagesDir: string): Promise<PageInfo[]> {
  const absDir = path.resolve(pagesDir);
  if (!fs.existsSync(absDir)) return [];

  const files = fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'));
  const pages: PageInfo[] = [];

  for (const file of files.sort()) {
    const filePath = path.join(absDir, file);
    try {
      const mod = await import(filePath);
      const pageDef: PageDefNode = mod.default ?? mod.page;

      if (!pageDef || pageDef.__kind !== 'page') {
        console.warn(`[dsl/loader] Skipping ${file}: no PageDefNode export found`);
        continue;
      }

      const spec = compilePage(pageDef);
      const slug = file.replace(/\.ts$/, '');

      pages.push({
        title: pageDef.title,
        icon: pageDef.icon ?? 'fileoutlined',
        slug,
        dir: absDir,
        layout: spec,
        popups: [],  // Popups are collected separately during deploy
        pageMeta: {},
      });
    } catch (err) {
      console.warn(`[dsl/loader] Failed to load ${file}:`, err);
    }
  }

  return pages;
}
