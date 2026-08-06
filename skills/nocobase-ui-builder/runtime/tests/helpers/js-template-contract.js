import assert from 'node:assert/strict';

export const JS_TEMPLATE_CONTRACT_MARKER = 'JS_TEMPLATE_CONTRACT_V1=';

export const JS_TEMPLATE_OPERATION_OUTCOMES = {
  saveAs: 'compile+valid|headNew|template+runtime|binding4|hostRead|idem',
  sharedEdit: 'checkOk|deltaReview|headNew+compiled+runtime|usageDelta|bindsSame|settingsOwn',
  detach: 'request5+headCAS|repo+commit+owner+hash+source|bindingGone+usageGone|othersSame',
  stop: {
    capability: 'incomplete+noFallback',
    unsaved: 'saveOrDiscard+commitOnly',
  },
};

const CORPUS_FIELDS = [
  'Prompt',
  'Expected route',
  'Key reason',
  'Completion evidence',
  'Forbidden behavior',
];

function sortedKeys(value) {
  return Object.keys(value).sort();
}

export function parseJsonFences(markdown) {
  const blocks = [];
  for (const match of markdown.matchAll(/^```json\s*\r?\n([\s\S]*?)^```\s*$/gm)) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks;
}

export function findJsonObjectByExactKeys(markdown, expectedKeys, label, predicate = () => true) {
  const normalizedKeys = [...expectedKeys].sort();
  const matches = parseJsonFences(markdown).filter(
    (value) =>
      value &&
      !Array.isArray(value) &&
      typeof value === 'object' &&
      predicate(value) &&
      JSON.stringify(sortedKeys(value)) === JSON.stringify(normalizedKeys),
  );

  assert.equal(matches.length, 1, `${label} should have one JSON object with the exact documented keys`);
  return matches[0];
}

export function parseMarkedJson(text, marker = JS_TEMPLATE_CONTRACT_MARKER) {
  const lines = text.split(/\r?\n/).filter((candidate) => candidate.trimStart().startsWith(marker));
  assert.equal(lines.length, 1, `expected exactly one structured marker ${marker}`);
  return JSON.parse(lines[0].trimStart().slice(marker.length));
}

export function parseRoutingCorpus(markdown) {
  const headings = [...markdown.matchAll(/^###\s+Case\b[^\n]*$/gm)];
  const cases = headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const fields = {};
    let activeField = null;

    for (const line of markdown.slice(start, end).split(/\r?\n/)) {
      const field = line.match(/^- ([^:\n]+):\s*(.*)$/);
      if (field) {
        activeField = field[1];
        fields[activeField] = field[2].trim();
        continue;
      }
      if (activeField && line.trim()) {
        fields[activeField] = `${fields[activeField]} ${line.trim()}`;
      }
    }

    assert.deepEqual(
      sortedKeys(fields),
      [...CORPUS_FIELDS].sort(),
      `${heading[0]} should keep the five-field corpus shape`,
    );
    const route = fields['Expected route'].match(/^`([^`]+)`$/)?.[1];
    assert.ok(route, `${heading[0]} should use a backtick-delimited Expected route`);
    return {
      heading: heading[0],
      route,
      fields,
      kind: route.startsWith('stop-') ? 'failure' : 'normal',
    };
  });

  assert.equal(cases.length, headings.length, 'every case heading should be parsed exactly once');
  return cases;
}

export function productRouteFor(caseRoute) {
  if (caseRoute.startsWith('js-template-')) {
    return 'js-template';
  }
  if (caseRoute === 'inline-runjs' || caseRoute === 'ui-template' || caseRoute === 'nocobase-plugin') {
    return caseRoute;
  }
  return null;
}
