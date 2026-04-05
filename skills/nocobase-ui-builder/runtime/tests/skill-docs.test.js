import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractJsonBlockFromPrefix(text, prefix) {
  const pattern = new RegExp(`${escapeRegExp(prefix)}\\n([\\s\\S]*?)\\n\`\`\``);
  const match = text.match(pattern);
  assert.ok(match, `Missing JSON block after prefix: ${prefix}`);
  return JSON.parse(match[1]);
}

test('SKILL.md uses validator-compatible frontmatter and documents core invariants', () => {
  const text = readText('../../SKILL.md');
  assert.doesNotMatch(text, /^argument-hint:/m);
  assert.match(text, /## Prerequisite & Recovery/);
  assert.match(text, /## Tool Families/);
  assert.match(text, /`flow_surfaces_\*`/);
  assert.match(text, /`flow_surfaces_context`/);
  assert.match(text, /当前角色可见菜单树/);
  assert.match(text, /`inspect` 默认只读/);
  assert.match(text, /`pre-init ids`/);
  assert.match(text, /批量写不是默认首选/);
  assert.match(text, /destructive path/);
  assert.match(text, /primary intent/);
  assert.match(text, /`nocobase-acl-manage`/);
  assert.match(text, /`nocobase-data-modeling`/);
  assert.match(text, /`nocobase-workflow-manage`/);
  assert.match(text, /popup shell/);
});

test('settings reference exposes addField and addFields canonical shapes separately', () => {
  const text = readText('../../references/settings.md');
  assert.match(text, /## 目录/);
  const addField = extractJsonBlockFromPrefix(
    text,
    "### `addField`\n\n创建**绑定真实字段**时，`fieldPath` 属于创建必需参数；标签、必填等属于 `settings`：\n\n```json",
  );
  assert.equal(addField.requestBody.fieldPath, 'password');
  assert.ok(!('fields' in addField.requestBody));

  const addFields = extractJsonBlockFromPrefix(text, "`addFields` 的批量形状才使用 `fields: []`：\n\n```json");
  assert.ok(Array.isArray(addFields.requestBody.fields));
  assert.equal(addFields.requestBody.fields[0].fieldPath, 'password');
  assert.match(text, /"settings": \{\s+"props"/s);
  assert.match(text, /"settings": \{\s+"stepParams"/s);
  assert.match(text, /jsColumn.*jsItem.*允许不传真实 `fieldPath`/s);
});

test('tool-shapes keeps addField and addFields payloads schema-correct', () => {
  const text = readText('../../references/tool-shapes.md');
  assert.match(text, /`settings` 不接受 `props` \/ `decoratorProps` \/ `stepParams` \/ `flowRegistry`/);
  const addField = extractJsonBlockFromPrefix(text, "`addField`\n\n```json");
  assert.equal(addField.requestBody.fieldPath, 'password');
  assert.ok(!('fields' in addField.requestBody));
  const addFields = extractJsonBlockFromPrefix(text, "`addFields`\n\n```json");
  assert.ok(Array.isArray(addFields.requestBody.fields));
  assert.equal(addFields.requestBody.fields[0].fieldPath, 'password');
  assert.match(text, /destructive path/);
});

test('JS and runtime references align on skill mode and canonical repo-root execution', () => {
  const jsText = readText('../../references/js.md');
  const runtimeText = readText('../../references/runjs-runtime.md');
  assert.match(jsText, /## 目录/);
  assert.match(jsText, /--skill-mode/);
  assert.match(jsText, /ctx\.request\(\.\.\.\).*ctx\.api\.request\(\.\.\.\)/s);
  assert.match(jsText, /不要使用 `fetch` \/ `ctx\.fetch`/);
  assert.match(jsText, /auto-mock `200 \+ \{\}`/);
  assert.match(jsText, /不允许 live network/);
  assert.match(jsText, /ChartEventsModel[\s\S]*chart\.on\(\.\.\.\)[\s\S]*chart\.off\(\.\.\.\)/);
  assert.match(jsText, /ctx\.chart\.on\(\.\.\.\)/);
  assert.match(runtimeText, /Node 版本满足 `>=18`/);
  assert.match(runtimeText, /repo-root 的 canonical 入口/);
  assert.match(runtimeText, /ctx\.request\(\.\.\.\).*ctx\.api\.request\(\.\.\.\)/s);
  assert.match(runtimeText, /auto-mock `200 \+ \{\}`/);
  assert.doesNotMatch(runtimeText, /ctx\.fetch/);
  assert.match(runtimeText, /validate --stdin-json --skill-mode/);
  assert.match(runtimeText, /preview --stdin-json --skill-mode/);
  assert.doesNotMatch(runtimeText, /\/Users\/gchust\/auto_works\/nocobase-skills/);
});

test('chart references are split into runtime core and validation docs', () => {
  const skillText = readText('../../SKILL.md');
  const chartIndex = readText('../../references/chart.md');
  const chartCore = readText('../../references/chart-core.md');
  const chartValidation = readText('../../references/chart-validation.md');
  assert.match(skillText, /创建 chart[\s\S]*先建 block/);
  assert.match(skillText, /query[\s\S]*path="chart"/);
  assert.match(chartIndex, /chart-core\.md/);
  assert.match(chartIndex, /chart-validation\.md/);
  assert.match(chartCore, /## 目录/);
  assert.match(chartCore, /chart-validation\.md/);
  assert.doesNotMatch(chartCore, /## 推荐 contract 验证 case/);
  assert.match(chartValidation, /## 推荐 contract 验证 case/);
  assert.match(chartValidation, /builder \+ basic 基础图/);
  assert.match(chartValidation, /SQL durable/);
  assert.match(chartValidation, /`heightMode` 非法/);
  assert.match(chartCore, /新建 chart[\s\S]*先写 `query`[\s\S]*path = "chart"/);
  assert.doesNotMatch(chartCore, /在搭建前先读两次/);
  assert.match(chartCore, /ctx\.chart\.on\(\.\.\.\)/);
});

test('verification and popup docs document batch, destructive, and currentRecord guards', () => {
  const verification = readText('../../references/verification.md');
  const popup = readText('../../references/popup.md');
  assert.match(verification, /批量写不是默认首选/);
  assert.match(verification, /destructive path/);
  assert.match(verification, /会删除 \/ 替换现有 subtree 的 `mutate` 组合/);
  assert.doesNotMatch(verification, /`apply\(mode="replace"\)`、`mutate` 属于 destructive path/);
  assert.match(verification, /`currentRecord`/);
  assert.match(popup, /`currentRecord`/);
  assert.match(popup, /绑定到了 `currentRecord`/);
});

test('agent prompt reinforces read-only inspect, stop-guessing, and skill-mode JS gate', () => {
  const text = readText('../../agents/openai.yaml');
  assert.match(text, /Treat inspect as read-only by default/);
  assert.match(text, /stop instead of guessing/);
  assert.match(text, /current role's visible menu tree/);
  assert.match(text, /flow_surfaces_context/);
  assert.match(text, /get\/catalog\/context/);
  assert.match(text, /currentRecord guard/);
  assert.match(text, /pre-init ids/);
  assert.match(text, /ctx\.request\/ctx\.api\.request/);
  assert.match(text, /local Node validator in skill mode/);
});
