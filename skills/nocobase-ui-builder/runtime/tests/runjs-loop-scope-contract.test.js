import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(skillRoot, relativePath), 'utf8');
}

test('classifies complete workspaces before routing embedded and compatibility RunJS', () => {
  const js = read('references/js.md');
  const loop = read('references/runjs-authoring-loop.md');

  for (const label of ['complete-workspace', 'embedded/single-surface', 'compatibility-single-file']) {
    assert.match(js, new RegExp(label.replace('/', '\\/'), 'i'));
    assert.match(loop, new RegExp(label.replace('/', '\\/'), 'i'));
  }

  assert.match(js, /complete-workspace[\s\S]{0,220}new complete JS Page[\s\S]{0,120}new complete JS Block/i);
  assert.match(js, /embedded\/single-surface[\s\S]{0,260}event-flow[\s\S]{0,180}linkage[\s\S]{0,180}value-return/i);
  assert.match(js, /compatibility-single-file[\s\S]{0,120}compatibility gate/i);
  assert.match(js, /compatibility gate[\s\S]{0,120}public single-file path/i);

  for (const text of [js, loop]) {
    assert.doesNotMatch(text, /Use this for every JS|Every JS request|Any JS write goes through/i);
  }
});

test('keeps the five-step safe snippet loop scoped to embedded and compatibility owners', () => {
  const loop = read('references/runjs-authoring-loop.md');

  assert.match(loop, /Embedded \/ Single-Surface Five Steps/i);
  assert.match(loop, /Lock the surface[\s\S]{0,180}scenario card[\s\S]{0,220}exactly one `safe` snippet/i);
  assert.match(loop, /Edit only the documented slots[\s\S]{0,180}nb api flow-surfaces/i);
  assert.match(loop, /errors\[\][\s\S]{0,180}details\.repairClass[\s\S]{0,100}retry/i);
  assert.match(loop, /five restrictions[\s\S]{0,120}compatibility-single-file[\s\S]{0,120}do not constrain a complete Workspace/i);
});

test('routes complete surfaces through a multi-file Workspace with snippets as scaffolds', () => {
  const documents = [
    read('references/js.md'),
    read('references/runjs-authoring-loop.md'),
    read('references/js-surfaces/index.md'),
    read('references/js-reference-index.md'),
  ];

  for (const text of documents) {
    assert.match(text, /complete-workspace|complete Workspace/i);
    assert.match(text, /snippet[\s\S]{0,100}scaffold/i);
    assert.match(text, /Settings Pass[\s\S]{0,100}(?:before implementation|before writing implementation|先于实现)/i);
    assert.match(text, /components[\s\S]{0,100}hooks[\s\S]{0,100}services[\s\S]{0,100}utils/i);
    assert.match(text, /run-js-sources|runJSSources/i);
    assert.match(text, /(?:never|not|do not|不能)[\s\S]{0,100}`settings\.code`[\s\S]{0,80}`assets\.scripts`/i);
  }
});

test('retains strict render, ctx, effect style, and popup target safety on both paths', () => {
  const loop = read('references/runjs-authoring-loop.md');
  const jsBlock = read('references/js-models/js-block.md');

  assert.match(loop, /both the embedded loop and complete Workspace[\s\S]{0,180}Strict render[\s\S]{0,140}`ctx\.\*`[\s\S]{0,120}`ctx\.render/i);
  assert.match(loop, /Popup Safety[\s\S]{0,220}popup-capable FlowModel[\s\S]{0,180}ChildPageModel/i);
  assert.match(jsBlock, /两条路径共同的运行时安全[\s\S]{0,260}strict render model[\s\S]{0,180}`ctx\.\*`/i);
  assert.match(jsBlock, /effect style[\s\S]{0,100}`render`/i);
  assert.match(jsBlock, /popup-capable FlowModel[\s\S]{0,160}ctx\.openView[\s\S]{0,180}transient uid/i);
});

test('documents separate JSBlock Workspace and public single-file authoring shapes', () => {
  const index = read('references/js-models/index.md');
  const block = read('references/js-models/js-block.md');

  assert.match(index, /新完整 `JSBlockModel`[\s\S]{0,220}Inline Workspace[\s\S]{0,220}run-js-sources/i);
  assert.match(index, /旧\/兼容\/嵌入式单文件 JSBlock[\s\S]{0,220}settings\.code\/settings\.version[\s\S]{0,220}changes\.code\/changes\.version/i);

  assert.match(block, /新完整 JS Block：Workspace 默认路径/i);
  assert.match(block, /旧\/兼容\/嵌入式单文件：公开形状/i);
  assert.match(block, /"settings"[\s\S]{0,100}"version"[\s\S]{0,100}"code"/i);
  assert.match(block, /"changes"[\s\S]{0,100}"version"[\s\S]{0,100}"code"/i);
  assert.match(block, /不能混用两条路径|不要混用两条路径/i);
  assert.ok(block.split('\n').length - 1 <= 220, 'js-models/js-block.md must stay within 220 lines');
});
