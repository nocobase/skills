#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_LATEST_RUN_PATH,
  resolveLatestRunPath,
} from './tool_journal.mjs';

export const DEFAULT_REPORT_DIR = path.join(
  os.homedir(),
  '.codex',
  'state',
  'nocobase-ui-builder',
  'reports',
);

export const DEFAULT_IMPROVEMENT_LOG_PATH = path.join(
  os.homedir(),
  '.codex',
  'state',
  'nocobase-ui-builder',
  'improvement-log.jsonl',
);

const WRITE_TOOL_NAMES = new Set([
  'PostDesktoproutes_createv2',
  'PostDesktoproutes_destroyv2',
  'PostFlowmodels_save',
  'PostFlowmodels_ensure',
  'PostFlowmodels_mutate',
  'PostFlowmodels_move',
  'PostFlowmodels_destroy',
  'PostFlowmodels_attach',
  'PostFlowmodels_duplicate',
]);

const DISCOVERY_TOOL_NAMES = new Set([
  'PostFlowmodels_schemabundle',
  'PostFlowmodels_schemas',
  'GetFlowmodels_schema',
  'GetFlowmodels_findone',
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/tool_review_report.mjs render [--log-path <path>] [--latest-run-path <path>] [--out-dir <path>] [--basename <name>] [--formats <md|html|both>] [--improvement-log-path <path>]',
  ].join('\n');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeNonEmpty(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeTextFile(filePath, content) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
}

function appendJsonLine(filePath, value) {
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function resolveReportDir(explicitPath) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_REPORT_DIR;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return DEFAULT_REPORT_DIR;
}

function resolveImprovementLogPath(explicitPath) {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  const fromEnv = process.env.NOCOBASE_UI_BUILDER_IMPROVEMENT_LOG_PATH;
  if (fromEnv && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return DEFAULT_IMPROVEMENT_LOG_PATH;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadJsonLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function resolveRunLogPath({ logPath, latestRunPath }) {
  if (logPath) {
    return path.resolve(logPath);
  }
  const resolvedLatestRunPath = resolveLatestRunPath(latestRunPath);
  if (!fs.existsSync(resolvedLatestRunPath)) {
    throw new Error(
      `Latest run manifest was not found at "${resolvedLatestRunPath}"; provide --log-path explicitly`,
    );
  }
  const manifest = readJsonFile(resolvedLatestRunPath);
  if (!manifest.logPath) {
    throw new Error(`Latest run manifest "${resolvedLatestRunPath}" does not contain logPath`);
  }
  return path.resolve(manifest.logPath);
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatDuration(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms < 0) {
    return '未知';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds} s`;
  }
  return `${minutes}m ${seconds}s`;
}

function truncateText(value, limit = 280) {
  if (typeof value !== 'string') {
    return '';
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function compactJson(value, limit = 400) {
  if (value === undefined) {
    return '';
  }
  const text = JSON.stringify(value, null, 2);
  return truncateText(text, limit);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function buildCountsByTool(toolCalls) {
  const counts = new Map();
  for (const call of toolCalls) {
    const current = counts.get(call.tool) ?? { total: 0, ok: 0, error: 0, skipped: 0 };
    current.total += 1;
    if (call.status === 'error') {
      current.error += 1;
    } else if (call.status === 'skipped') {
      current.skipped += 1;
    } else {
      current.ok += 1;
    }
    counts.set(call.tool, current);
  }
  return [...counts.entries()]
    .map(([tool, count]) => ({ tool, ...count }))
    .sort((left, right) => right.total - left.total || left.tool.localeCompare(right.tool));
}

function getFindoneTargetSignature(call) {
  if (call.tool !== 'GetFlowmodels_findone') {
    return null;
  }
  const parentId = call.args?.parentId ?? 'unknown-parent';
  const subKey = call.args?.subKey ?? 'unknown-subKey';
  return `${parentId}::${subKey}`;
}

function detectRepeatedRuns(toolCalls) {
  const repeated = [];
  let currentKey = null;
  let currentLabel = null;
  let currentCount = 0;
  for (const call of toolCalls) {
    const signature = getFindoneTargetSignature(call);
    const key = signature ? `${call.tool}::${signature}` : call.tool;
    const label = signature ? `${call.tool} (${signature})` : call.tool;
    if (key === currentKey) {
      currentCount += 1;
      continue;
    }
    if (currentLabel && currentCount >= 3) {
      repeated.push({ tool: currentLabel, count: currentCount });
    }
    currentKey = key;
    currentLabel = label;
    currentCount = 1;
  }
  if (currentLabel && currentCount >= 3) {
    repeated.push({ tool: currentLabel, count: currentCount });
  }
  return repeated;
}

function countTool(toolCalls, toolName) {
  return toolCalls.filter((record) => record.tool === toolName).length;
}

function buildFindoneTargetCounts(toolCalls) {
  const counts = new Map();
  for (const call of toolCalls) {
    const signature = getFindoneTargetSignature(call);
    if (!signature) {
      continue;
    }
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return [...counts.entries()].map(([target, count]) => ({ target, count }));
}

function buildOptimizationItems({
  toolCalls,
  hasWrites,
  hasSchemaBundle,
  hasSchemas,
  hasFindone,
  firstWriteIndex,
  firstDiscoveryIndex,
  errors,
  repeatedRuns,
  missingSummaryCount,
}) {
  const items = [];
  const schemaReadCount = countTool(toolCalls, 'GetFlowmodels_schema');
  const repeatedFindoneTargets = buildFindoneTargetCounts(toolCalls).filter((item) => item.count >= 3);

  if (hasWrites && (!hasSchemaBundle || !hasSchemas || (firstDiscoveryIndex > firstWriteIndex && firstDiscoveryIndex !== -1))) {
    items.push({
      priority: 'high',
      title: '把探测步骤前置并批量化',
      reason: '写入发生前未完成完整探测，或者探测顺序晚于第一次写入，会增加试错和返工。',
      fasterPath: '在第一次写入前先执行一次 `PostFlowmodels_schemabundle` + 一次 `PostFlowmodels_schemas`；只有目标模型仍有歧义时，再补 `GetFlowmodels_schema`。',
      evidence: [
        !hasSchemaBundle ? '缺少 `PostFlowmodels_schemabundle`' : null,
        !hasSchemas ? '缺少 `PostFlowmodels_schemas`' : null,
        firstDiscoveryIndex > firstWriteIndex && firstDiscoveryIndex !== -1 ? '首次探测晚于首次写入' : null,
      ].filter(Boolean),
    });
  }

  if (schemaReadCount >= 3) {
    items.push({
      priority: 'high',
      title: '减少多次单模型 schema 读取',
      reason: `本次出现 ${schemaReadCount} 次 \`GetFlowmodels_schema\`，通常说明单模型深挖过多。`,
      fasterPath: '优先一次性拉取 `PostFlowmodels_schemas`，只对最后仍不清楚的模型再补单独 `GetFlowmodels_schema`。',
      evidence: [`GetFlowmodels_schema x${schemaReadCount}`],
    });
  }

  if (repeatedFindoneTargets.length > 0) {
    items.push({
      priority: 'medium',
      title: '压缩重复的 live snapshot 读取',
      reason: '同一个 live target 被读取了 3 次或更多次，通常意味着中间有可合并的重复探测。',
      fasterPath: '默认保持“目标页面写前一次、写后一次”的读取节奏；样板页只在 schema-first 无法消歧时再作为 fallback。',
      evidence: repeatedFindoneTargets.map((item) => `${item.target} x${item.count}`),
    });
  }

  if (repeatedRuns.length > 0) {
    items.push({
      priority: 'medium',
      title: '合并连续重复调用',
      reason: '连续重复读取通常意味着流程可以更直接，或某些结果没有被复用。',
      fasterPath: '对连续重复工具调用优先缓存结果、合并成一次调用，或把多个相邻操作合并进一次事务写入。',
      evidence: repeatedRuns.map((item) => `${item.tool} x${item.count}`),
    });
  }

  if (errors.length > 0) {
    items.push({
      priority: 'high',
      title: '把失败前的最小成功模板固化下来',
      reason: `本次有 ${errors.length} 次失败调用，重复试错会直接拉长完成时间。`,
      fasterPath: '把失败调用前最近一次成功的 schema/请求体整理成模板，下次优先从模板改最少字段，而不是从空 payload 开始猜。',
      evidence: errors.slice(0, 3).map((item) => `${item.tool}: ${item.error ?? item.status ?? 'error'}`),
    });
  }

  if (hasWrites && !hasFindone) {
    items.push({
      priority: 'medium',
      title: '补上写前 live 读取，减少无效回滚',
      reason: '写入前没有记录 live snapshot 读取，容易对现状判断错误。',
      fasterPath: '每轮改动前先读一次目标页面 / grid，再决定 patch 还是 append，能减少写后修补。',
      evidence: ['缺少 `GetFlowmodels_findone`'],
    });
  }

  if (missingSummaryCount > 0) {
    items.push({
      priority: 'low',
      title: '为每条工具调用补上简短 summary',
      reason: '虽然这不会直接减少调用次数，但能更快识别哪些步骤可以删减。',
      fasterPath: '每次 `tool_call` 都写一个一句话 summary，复盘时能更快定位冗余步骤。',
      evidence: [`缺少 summary 的记录数：${missingSummaryCount}`],
    });
  }

  if (items.length === 0) {
    items.push({
      priority: 'low',
      title: '维持当前流程，继续关注事务合并机会',
      reason: '本次没有明显的流程绕路迹象。',
      fasterPath: '后续优先观察是否能把相邻的新增/更新步骤继续压缩到一次 `PostFlowmodels_mutate` 中。',
      evidence: ['未发现明显绕路模式'],
    });
  }

  return items;
}

export function analyzeRun(records, sourceLogPath) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('run log is empty');
  }

  const start = records.find((record) => record.type === 'run_started') ?? null;
  const finishCandidates = records.filter((record) => record.type === 'run_finished');
  const finish = finishCandidates.at(-1) ?? null;
  const toolCalls = records.filter((record) => record.type === 'tool_call');
  const notes = records.filter((record) => record.type === 'note');
  const errors = toolCalls.filter((record) => record.status === 'error' || record.error);
  const skipped = toolCalls.filter((record) => record.status === 'skipped');

  const startedAt = toDate(start?.startedAt);
  const finishedAt = toDate(finish?.timestamp);
  const lastEventAt = toDate(records.at(-1)?.timestamp ?? records.at(-1)?.startedAt);
  const durationMs = startedAt
    ? ((finishedAt ?? lastEventAt)?.getTime() ?? startedAt.getTime()) - startedAt.getTime()
    : null;

  const firstWriteIndex = toolCalls.findIndex((record) => WRITE_TOOL_NAMES.has(record.tool));
  const firstDiscoveryIndex = toolCalls.findIndex((record) => DISCOVERY_TOOL_NAMES.has(record.tool));
  const hasWrites = firstWriteIndex >= 0;
  const hasSchemaBundle = toolCalls.some((record) => record.tool === 'PostFlowmodels_schemabundle');
  const hasSchemas = toolCalls.some((record) => record.tool === 'PostFlowmodels_schemas');
  const hasFindone = toolCalls.some((record) => record.tool === 'GetFlowmodels_findone');
  const repeatedRuns = detectRepeatedRuns(toolCalls);
  const missingSummaryCount = toolCalls.filter((record) => !record.summary).length;

  const suggestions = [];
  if (!finish) {
    suggestions.push('本次日志没有 `run_finished` 记录，说明执行没有正常收尾。');
  }
  if (errors.length > 0) {
    suggestions.push(`有 ${errors.length} 次失败调用，先检查失败调用的 args、error 和前后文。`);
  }
  if (hasWrites && !hasSchemaBundle) {
    suggestions.push('存在写操作，但没有记录 `PostFlowmodels_schemabundle`，建议补齐探测冷启动。');
  }
  if (hasWrites && !hasSchemas) {
    suggestions.push('存在写操作，但没有记录 `PostFlowmodels_schemas`，建议在落盘前读取精确模型文档。');
  }
  if (hasWrites && !hasFindone) {
    suggestions.push('存在写操作，但没有记录 `GetFlowmodels_findone`，建议在每次变更前后都记录 live snapshot 读取。');
  }
  if (hasWrites && firstDiscoveryIndex > firstWriteIndex && firstDiscoveryIndex !== -1) {
    suggestions.push('首次探测发生在首次写操作之后，建议把探测顺序前置。');
  }
  if (repeatedRuns.length > 0) {
    suggestions.push(
      `发现连续重复调用：${repeatedRuns.map((item) => `${item.tool} x${item.count}`).join('，')}。可考虑合并步骤或减少重复读取。`,
    );
  }
  if (missingSummaryCount > 0) {
    suggestions.push(`有 ${missingSummaryCount} 条 tool_call 没有 ` + '`summary`' + '，复盘时可读性会变差。');
  }
  if (suggestions.length === 0) {
    suggestions.push('本次日志结构完整，可继续从失败率、重复调用和探测顺序三个角度优化。');
  }

  const optimizationItems = buildOptimizationItems({
    toolCalls,
    hasWrites,
    hasSchemaBundle,
    hasSchemas,
    hasFindone,
    firstWriteIndex,
    firstDiscoveryIndex,
    errors,
    repeatedRuns,
    missingSummaryCount,
  });

  return {
    sourceLogPath,
    generatedAt: nowIso(),
    start,
    finish,
    durationMs,
    durationLabel: formatDuration(durationMs),
    totalEvents: records.length,
    totalToolCalls: toolCalls.length,
    totalNotes: notes.length,
    errorCount: errors.length,
    skippedCount: skipped.length,
    toolCalls,
    notes,
    errors,
    countsByTool: buildCountsByTool(toolCalls),
    suggestions,
    optimizationItems,
  };
}

function renderImprovementMarkdown(summary) {
  const lines = [
    '# NocoBase UI Builder 自动改进清单',
    '',
    `- 生成时间：${summary.generatedAt}`,
    `- 日志文件：\`${summary.sourceLogPath}\``,
    `- 任务：${summary.start?.task ?? '未知'}`,
    `- 运行 ID：\`${summary.start?.runId ?? '未知'}\``,
    '',
    '## 优先改进项',
    '',
  ];

  for (const [index, item] of summary.optimizationItems.entries()) {
    lines.push(`### ${index + 1}. [${item.priority}] ${item.title}`);
    lines.push('');
    lines.push(`- 原因：${item.reason}`);
    lines.push(`- 更快路径：${item.fasterPath}`);
    if (item.evidence?.length) {
      lines.push(`- 证据：${item.evidence.join('；')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildImprovementSnapshot(summary, improvementLogPath) {
  return {
    type: 'improvement_snapshot',
    generatedAt: summary.generatedAt,
    runId: summary.start?.runId,
    task: summary.start?.task,
    logPath: summary.sourceLogPath,
    improvementLogPath,
    optimizationItems: summary.optimizationItems.map((item) => ({
      priority: item.priority,
      title: item.title,
      reason: item.reason,
      fasterPath: item.fasterPath,
      evidence: item.evidence,
    })),
  };
}

function renderMarkdownReport(summary) {
  const header = [
    '# NocoBase UI Builder 复盘报告',
    '',
    `- 生成时间：${summary.generatedAt}`,
    `- 日志文件：\`${summary.sourceLogPath}\``,
    `- 任务：${summary.start?.task ?? '未知'}`,
    `- 运行 ID：\`${summary.start?.runId ?? '未知'}\``,
    `- 页面标题：${summary.start?.title ?? '未提供'}`,
    `- schemaUid：${summary.start?.schemaUid ?? '未提供'}`,
    `- 状态：${summary.finish?.status ?? '未完成'}`,
    `- 耗时：${summary.durationLabel}`,
    '',
  ];

  const overview = [
    '## 概览',
    '',
    `- 事件总数：${summary.totalEvents}`,
    `- 工具调用数：${summary.totalToolCalls}`,
    `- 备注数：${summary.totalNotes}`,
    `- 失败调用数：${summary.errorCount}`,
    `- 跳过调用数：${summary.skippedCount}`,
    '',
  ];

  const suggestions = [
    '## 可改进点',
    '',
    ...summary.suggestions.map((item) => `- ${item}`),
    '',
  ];

  const optimization = [
    '## 自动改进建议',
    '',
    ...summary.optimizationItems.flatMap((item, index) => [
      `### ${index + 1}. [${item.priority}] ${item.title}`,
      '',
      `- 原因：${item.reason}`,
      `- 更快路径：${item.fasterPath}`,
      ...(item.evidence?.length ? [`- 证据：${item.evidence.join('；')}`] : []),
      '',
    ]),
  ];

  const toolStats = [
    '## 工具统计',
    '',
    '| 工具 | 总次数 | 成功 | 失败 | 跳过 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...summary.countsByTool.map((item) => `| ${escapeMarkdownCell(item.tool)} | ${item.total} | ${item.ok} | ${item.error} | ${item.skipped} |`),
    '',
  ];

  const failures = ['## 失败调用', ''];
  if (summary.errors.length === 0) {
    failures.push('- 无');
    failures.push('');
  } else {
    for (const [index, item] of summary.errors.entries()) {
      failures.push(`### ${index + 1}. ${item.tool}`);
      failures.push('');
      failures.push(`- 时间：${item.timestamp ?? '未知'}`);
      failures.push(`- 类型：${item.toolType ?? '未知'}`);
      failures.push(`- 状态：${item.status ?? '未知'}`);
      if (item.summary) {
        failures.push(`- 摘要：${item.summary}`);
      }
      if (item.error) {
        failures.push(`- 错误：${item.error}`);
      }
      if (item.args !== undefined) {
        failures.push('- 参数：');
        failures.push('');
        failures.push('```json');
        failures.push(compactJson(item.args, 1200));
        failures.push('```');
      }
      failures.push('');
    }
  }

  const timeline = [
    '## 时间线',
    '',
    '| # | 时间 | 事件 | 名称/消息 | 状态 | 摘要 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...summary.toolCalls.map((item, index) => (
      `| ${index + 1} | ${escapeMarkdownCell(item.timestamp ?? '')} | tool_call | ${escapeMarkdownCell(item.tool)} | ${escapeMarkdownCell(item.status ?? '')} | ${escapeMarkdownCell(item.summary ?? '')} |`
    )),
    ...summary.notes.map((item, index) => (
      `| N${index + 1} | ${escapeMarkdownCell(item.timestamp ?? '')} | note | ${escapeMarkdownCell(item.message)} |  | ${escapeMarkdownCell(compactJson(item.data, 160))} |`
    )),
    '',
  ];

  return [
    ...header,
    ...overview,
    ...suggestions,
    ...optimization,
    ...toolStats,
    ...failures,
    ...timeline,
  ].join('\n');
}

function renderHtmlReport(summary) {
  const failureBlocks = summary.errors.length === 0
    ? '<p class="muted">无失败调用。</p>'
    : summary.errors.map((item, index) => `
        <section class="card">
          <h3>${index + 1}. ${escapeHtml(item.tool)}</h3>
          <p><strong>时间：</strong>${escapeHtml(item.timestamp ?? '未知')}</p>
          <p><strong>类型：</strong>${escapeHtml(item.toolType ?? '未知')}</p>
          <p><strong>状态：</strong>${escapeHtml(item.status ?? '未知')}</p>
          ${item.summary ? `<p><strong>摘要：</strong>${escapeHtml(item.summary)}</p>` : ''}
          ${item.error ? `<p><strong>错误：</strong>${escapeHtml(item.error)}</p>` : ''}
          ${item.args !== undefined ? `<pre>${escapeHtml(compactJson(item.args, 1600))}</pre>` : ''}
        </section>
      `).join('\n');

  const toolRows = summary.countsByTool.map((item) => `
      <tr>
        <td>${escapeHtml(item.tool)}</td>
        <td>${item.total}</td>
        <td>${item.ok}</td>
        <td>${item.error}</td>
        <td>${item.skipped}</td>
      </tr>
    `).join('\n');

  const timelineRows = [
    ...summary.toolCalls.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.timestamp ?? '')}</td>
        <td>tool_call</td>
        <td>${escapeHtml(item.tool)}</td>
        <td>${escapeHtml(item.status ?? '')}</td>
        <td>${escapeHtml(item.summary ?? '')}</td>
      </tr>
    `),
    ...summary.notes.map((item, index) => `
      <tr>
        <td>N${index + 1}</td>
        <td>${escapeHtml(item.timestamp ?? '')}</td>
        <td>note</td>
        <td>${escapeHtml(item.message)}</td>
        <td></td>
        <td>${escapeHtml(compactJson(item.data, 160))}</td>
      </tr>
    `),
  ].join('\n');

  const suggestionItems = summary.suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n');
  const optimizationBlocks = summary.optimizationItems.map((item, index) => `
      <section class="card">
        <h3>${index + 1}. [${escapeHtml(item.priority)}] ${escapeHtml(item.title)}</h3>
        <p><strong>原因：</strong>${escapeHtml(item.reason)}</p>
        <p><strong>更快路径：</strong>${escapeHtml(item.fasterPath)}</p>
        ${item.evidence?.length ? `<p><strong>证据：</strong>${escapeHtml(item.evidence.join('；'))}</p>` : ''}
      </section>
    `).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NocoBase UI Builder 复盘报告</title>
  <style>
    :root {
      --bg: #f5f2ea;
      --card: #fffdf8;
      --text: #1f2328;
      --muted: #6b7280;
      --line: #d8d0c2;
      --accent: #9f3a2c;
      --accent-soft: #f5ddd8;
      --ok: #276749;
      --err: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Helvetica Neue", sans-serif;
      background:
        radial-gradient(circle at top left, #f9ead7 0%, transparent 35%),
        linear-gradient(180deg, #f7f3ec 0%, var(--bg) 100%);
      color: var(--text);
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 20px 64px;
    }
    h1, h2, h3 { margin: 0 0 12px; }
    h1 { font-size: 36px; }
    h2 {
      margin-top: 32px;
      font-size: 24px;
      border-top: 1px solid var(--line);
      padding-top: 24px;
    }
    .meta, .stats {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px 18px;
      box-shadow: 0 10px 30px rgba(31, 35, 40, 0.05);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
    }
    .muted { color: var(--muted); }
    ul { margin: 0; padding-left: 20px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 12px 10px;
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }
    th {
      background: #f0e8da;
      font-weight: 700;
    }
    pre {
      overflow-x: auto;
      background: #1e1e1e;
      color: #f8f8f2;
      padding: 12px;
      border-radius: 12px;
      font-size: 12px;
      line-height: 1.5;
    }
    .ok { color: var(--ok); }
    .err { color: var(--err); }
  </style>
</head>
<body>
  <main>
    <div class="badge">NocoBase UI Builder</div>
    <h1>复盘报告</h1>
    <p class="muted">生成时间：${escapeHtml(summary.generatedAt)}</p>

    <section class="meta">
      <article class="card"><strong>任务</strong><br>${escapeHtml(summary.start?.task ?? '未知')}</article>
      <article class="card"><strong>运行 ID</strong><br><code>${escapeHtml(summary.start?.runId ?? '未知')}</code></article>
      <article class="card"><strong>状态</strong><br>${escapeHtml(summary.finish?.status ?? '未完成')}</article>
      <article class="card"><strong>耗时</strong><br>${escapeHtml(summary.durationLabel)}</article>
      <article class="card"><strong>页面标题</strong><br>${escapeHtml(summary.start?.title ?? '未提供')}</article>
      <article class="card"><strong>schemaUid</strong><br>${escapeHtml(summary.start?.schemaUid ?? '未提供')}</article>
    </section>

    <h2>概览</h2>
    <section class="stats">
      <article class="card"><strong>事件总数</strong><br>${summary.totalEvents}</article>
      <article class="card"><strong>工具调用</strong><br>${summary.totalToolCalls}</article>
      <article class="card"><strong>备注</strong><br>${summary.totalNotes}</article>
      <article class="card"><strong class="err">失败调用</strong><br>${summary.errorCount}</article>
      <article class="card"><strong>跳过调用</strong><br>${summary.skippedCount}</article>
    </section>

    <h2>可改进点</h2>
    <section class="card">
      <ul>${suggestionItems}</ul>
    </section>

    <h2>自动改进建议</h2>
    ${optimizationBlocks}

    <h2>工具统计</h2>
    <table>
      <thead>
        <tr><th>工具</th><th>总次数</th><th>成功</th><th>失败</th><th>跳过</th></tr>
      </thead>
      <tbody>${toolRows}</tbody>
    </table>

    <h2>失败调用</h2>
    ${failureBlocks}

    <h2>时间线</h2>
    <table>
      <thead>
        <tr><th>#</th><th>时间</th><th>事件</th><th>名称/消息</th><th>状态</th><th>摘要</th></tr>
      </thead>
      <tbody>${timelineRows}</tbody>
    </table>

    <h2>源日志</h2>
    <section class="card">
      <code>${escapeHtml(summary.sourceLogPath)}</code>
    </section>
  </main>
</body>
</html>`;
}

export function renderReport({
  logPath,
  latestRunPath = DEFAULT_LATEST_RUN_PATH,
  outDir = DEFAULT_REPORT_DIR,
  basename,
  formats = 'both',
  improvementLogPath,
}) {
  const resolvedLogPath = resolveRunLogPath({ logPath, latestRunPath });
  const records = loadJsonLines(resolvedLogPath);
  const summary = analyzeRun(records, resolvedLogPath);
  const resolvedOutDir = resolveReportDir(outDir);
  const base = basename?.trim() || path.basename(resolvedLogPath, path.extname(resolvedLogPath));
  const requestedFormats = normalizeNonEmpty(formats, 'formats');
  const writeMarkdown = requestedFormats === 'md' || requestedFormats === 'both';
  const writeHtml = requestedFormats === 'html' || requestedFormats === 'both';
  if (!writeMarkdown && !writeHtml) {
    throw new Error(`Unsupported formats "${requestedFormats}"`);
  }

  const output = {
    logPath: resolvedLogPath,
    outDir: resolvedOutDir,
    generatedAt: summary.generatedAt,
  };

  if (writeMarkdown) {
    const markdownPath = path.join(resolvedOutDir, `${base}.review.md`);
    writeTextFile(markdownPath, `${renderMarkdownReport(summary)}\n`);
    output.markdownPath = markdownPath;
  }
  if (writeHtml) {
    const htmlPath = path.join(resolvedOutDir, `${base}.review.html`);
    writeTextFile(htmlPath, renderHtmlReport(summary));
    output.htmlPath = htmlPath;
  }

  const improvementMarkdownPath = path.join(resolvedOutDir, `${base}.improve.md`);
  const improvementJsonPath = path.join(resolvedOutDir, `${base}.improve.json`);
  const resolvedImprovementLogPath = resolveImprovementLogPath(improvementLogPath);
  const improvementSnapshot = buildImprovementSnapshot(summary, resolvedImprovementLogPath);
  writeTextFile(improvementMarkdownPath, `${renderImprovementMarkdown(summary)}\n`);
  writeTextFile(improvementJsonPath, `${JSON.stringify(improvementSnapshot, null, 2)}\n`);
  appendJsonLine(resolvedImprovementLogPath, improvementSnapshot);
  output.improvementMarkdownPath = improvementMarkdownPath;
  output.improvementJsonPath = improvementJsonPath;
  output.improvementLogPath = resolvedImprovementLogPath;

  return output;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === 'help') {
    return { command: 'help', flags: {} };
  }

  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
    }
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for "--${key}"`);
    }
    flags[key] = value;
    index += 1;
  }
  return { command, flags };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  if (command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command !== 'render') {
    throw new Error(`Unknown command "${command}"`);
  }

  const result = renderReport({
    logPath: flags['log-path'],
    latestRunPath: flags['latest-run-path'],
    outDir: flags['out-dir'],
    basename: flags.basename,
    formats: flags.formats ?? 'both',
    improvementLogPath: flags['improvement-log-path'],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  });
}
