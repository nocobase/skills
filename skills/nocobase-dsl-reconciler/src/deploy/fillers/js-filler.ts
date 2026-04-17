/**
 * Deploy JS items (inside detail/form grid) and JS columns (table).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BlockSpec } from '../../types/spec';
import type { BlockState } from '../../types/state';
import type { DeployContext } from './types';
import { ensureJsHeader, replaceJsUids } from '../../utils/js-utils';
import { generateUid } from '../../utils/uid';

/**
 * Deploy JS items into a form/details grid.
 */
export async function deployJsItems(
  ctx: DeployContext,
  gridUid: string,
  bs: BlockSpec,
  coll: string,
  modDir: string,
  blockState: BlockState,
  allBlocksState: Record<string, BlockState>,
): Promise<void> {
  const { nb, log } = ctx;
  const jsItems = bs.js_items || [];
  if (!jsItems.length || !gridUid) return;

  const specKeys = new Set<string>();
  for (const jsSpec of jsItems) {
    if (!jsSpec.file) continue;
    specKeys.add(jsSpec.key);
    const jsPath = path.join(modDir, jsSpec.file);
    if (!fs.existsSync(jsPath)) continue;

    let code = fs.readFileSync(jsPath, 'utf8');
    const unfilled = code.match(/\{\{(\w+)(?:\|\|[^}]*)?\}\}/g);
    if (unfilled?.length) {
      log(`      ✗ JS item ${jsSpec.file}: unfilled template params: ${unfilled.join(', ')}`);
      continue;
    }
    if (/ctx\.render\s*\(\s*null\s*\)/.test(code)) {
      log(`      ✗ JS item ${jsSpec.file}: ctx.render(null) 是空占位符，需要实现实际内容`);
      continue;
    }
    // Forbidden APIs in NocoBase JS sandbox
    // window/document ARE available (safe proxy), but only specific methods:
    //   window: setTimeout, setInterval, console, Math, Date, FormData, Blob, URL, open, location
    //   document: createElement, querySelector, querySelectorAll
    // NOT available: URLSearchParams, fetch, XMLHttpRequest, eval
    const forbidden = [
      { pattern: /\bnew\s+URLSearchParams\b/, name: 'URLSearchParams (use regex to parse URL params instead)' },
      { pattern: /\bimport\s+/, name: 'ES module import' },
      { pattern: /\bexport\s+(default\s+)?/, name: 'ES module export' },
      { pattern: /\bfetch\s*\(/, name: 'fetch() (use ctx.request instead)' },
    ];
    let hasForbidden = false;
    for (const { pattern, name } of forbidden) {
      if (pattern.test(code)) {
        log(`      ✗ JS item ${jsSpec.file}: uses ${name} — not available in NocoBase JS sandbox`);
        hasForbidden = true;
        break;
      }
    }
    if (hasForbidden) continue;
    if (/ctx\.sql\s*\(/.test(code) && !/ctx\.sql\.(save|runById)/.test(code)) {
      log(`      ✗ JS item ${jsSpec.file}: ctx.sql() 直接调用不可用，请用 ctx.sql.save() + ctx.sql.runById()`);
      continue;
    }
    code = ensureJsHeader(code, { desc: jsSpec.desc, jsType: 'JSItemModel', coll });
    code = replaceJsUids(code, allBlocksState);

    const existing = blockState.js_items?.[jsSpec.key];
    if (existing?.uid) {
      await nb.updateModel(existing.uid, {
        jsSettings: { runJs: { code, version: 'v1' } },
      });
    } else {
      const newUid = generateUid();
      await nb.models.save({
        uid: newUid, use: 'JSItemModel',
        parentId: gridUid, subKey: 'items', subType: 'array',
        sortIndex: 0, flowRegistry: {},
        stepParams: { jsSettings: { runJs: { code, version: 'v1' } } },
      });
      if (!blockState.js_items) blockState.js_items = {};
      blockState.js_items[jsSpec.key] = { uid: newUid };
    }
    log(`      ~ JS item: ${jsSpec.desc || jsSpec.key}`);
  }

  // Clean up orphaned JS items (state keys not in current spec)
  if (blockState.js_items) {
    for (const [key, entry] of Object.entries(blockState.js_items)) {
      if (specKeys.has(key)) continue;
      const uid = (entry as { uid?: string })?.uid;
      if (uid) {
        try {
          await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: uid } });
          log(`      - JS item orphan removed: ${key}`);
        } catch { /* skip */ }
      }
      delete blockState.js_items[key];
    }
  }
}

/**
 * Deploy JS columns into a table block.
 */
export async function deployJsColumns(
  ctx: DeployContext,
  blockUid: string,
  bs: BlockSpec,
  coll: string,
  modDir: string,
  blockState: BlockState,
  allBlocksState: Record<string, BlockState>,
): Promise<void> {
  const { nb, log } = ctx;
  const jsCols = bs.js_columns || [];
  if (!jsCols.length || bs.type !== 'table') return;

  for (const jsSpec of jsCols) {
    if (!jsSpec.file) continue;
    const jsPath = path.join(modDir, jsSpec.file);
    if (!fs.existsSync(jsPath)) continue;

    let code = fs.readFileSync(jsPath, 'utf8');
    code = ensureJsHeader(code, { desc: jsSpec.desc, jsType: 'JSColumnModel', coll });

    const existing = blockState.js_columns?.[jsSpec.key];
    if (existing?.uid) {
      const colUpdate: Record<string, unknown> = {
        jsSettings: { runJs: { code, version: 'v1' } },
      };
      if (jsSpec.title) colUpdate.tableColumnSettings = { title: { title: jsSpec.title } };
      await nb.updateModel(existing.uid, colUpdate);
    } else {
      const newUid = generateUid();
      const colStepParams: Record<string, unknown> = {
        jsSettings: { runJs: { code, version: 'v1' } },
        fieldSettings: { init: { fieldPath: jsSpec.field } },
      };
      if (jsSpec.title) {
        colStepParams.tableColumnSettings = { title: { title: jsSpec.title } };
      }
      await nb.models.save({
        uid: newUid, use: 'JSColumnModel',
        parentId: blockUid, subKey: 'columns', subType: 'array',
        sortIndex: 0, flowRegistry: {},
        stepParams: colStepParams,
      });
      if (!blockState.js_columns) blockState.js_columns = {};
      blockState.js_columns[jsSpec.key] = { uid: newUid };
    }
    log(`      ~ JS col: ${jsSpec.desc || jsSpec.key}`);
  }
}
