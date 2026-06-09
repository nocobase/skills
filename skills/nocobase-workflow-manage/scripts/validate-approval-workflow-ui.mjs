#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const PROCESS_ACTION_USES = new Set([
  'ProcessFormApproveModel',
  'ProcessFormRejectModel',
  'ProcessFormReturnModel',
  'ProcessFormDelegateModel',
  'ProcessFormAddAssigneeModel',
]);

function printHelp() {
  console.log(`Usage:
  node skills/skills/nocobase-workflow-manage/scripts/validate-approval-workflow-ui.mjs --workflow-id <id> [options]

Options:
  --workflow-id <id>                 Approval workflow id to validate.
  --env <name>                       Optional nb environment name, passed as -e <name>.
  --nb <path>                        nb executable path. Default: nb.
  --min-initiator-fields <n>         Minimum applicant form fields. Default: 1.
  --min-information-fields <n>       Minimum read-only approval detail fields. Default: 1.
  --min-approver-fields <n>          Minimum approver process form fields. Default: 1.
  --allow-empty-approver-fields      Allow ProcessFormModel to have no editable fields when actions alone are intended.
  --expect-initiator-field <field>   Require a field on the initiator form. Repeatable.
  --expect-information-field <field> Require a field on approvalInformation. Repeatable.
  --expect-approver-field <field>    Require a field on approvalApprover. Repeatable.
  --allow-legacy-bindings            Do not fail on legacy v1 applyForm/applyDetail bindings. Use only when auditing old workflows.
  --strict-topology                  Treat direct-mode approval nodes and nested approval nodes in approval branches as failures.
  --json                             Print machine-readable JSON summary.
  -h, --help                         Show this help.

This is a read-only completion gate. It fails when approval UI roots are missing, empty, or do not contain
the expected approval models/actions/fields. It does not repair the workflow.`);
}

function parseArgs(argv) {
  const options = {
    nb: 'nb',
    workflowId: null,
    env: null,
    json: false,
    strictTopology: false,
    minInitiatorFields: 1,
    minInformationFields: 1,
    minApproverFields: 1,
    allowEmptyApproverFields: false,
    expectInitiatorFields: [],
    expectInformationFields: [],
    expectApproverFields: [],
    allowLegacyBindings: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    switch (arg) {
      case '--workflow-id':
        options.workflowId = next();
        break;
      case '--env':
      case '-e':
        options.env = next();
        break;
      case '--nb':
        options.nb = next();
        break;
      case '--min-initiator-fields':
        options.minInitiatorFields = Number(next());
        break;
      case '--min-information-fields':
        options.minInformationFields = Number(next());
        break;
      case '--min-approver-fields':
        options.minApproverFields = Number(next());
        break;
      case '--allow-empty-approver-fields':
        options.allowEmptyApproverFields = true;
        options.minApproverFields = 0;
        break;
      case '--expect-initiator-field':
        options.expectInitiatorFields.push(next());
        break;
      case '--expect-information-field':
        options.expectInformationFields.push(next());
        break;
      case '--expect-approver-field':
        options.expectApproverFields.push(next());
        break;
      case '--allow-legacy-bindings':
        options.allowLegacyBindings = true;
        break;
      case '--strict-topology':
        options.strictTopology = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.workflowId) {
    throw new Error('--workflow-id is required');
  }
  for (const [key, value] of [
    ['--min-initiator-fields', options.minInitiatorFields],
    ['--min-information-fields', options.minInformationFields],
    ['--min-approver-fields', options.minApproverFields],
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }

  return options;
}

function runNb(options, args) {
  const finalArgs = [...args];
  if (options.env) {
    finalArgs.push('-e', options.env);
  }
  finalArgs.push('-j');

  const result = spawnSync(options.nb, finalArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(`Command failed: ${options.nb} ${finalArgs.join(' ')}\n${stderr || stdout || `exit ${result.status}`}`);
  }
  return parseJsonOutput(result.stdout);
}

function parseJsonOutput(stdout) {
  const text = stdout.trim();
  if (!text) {
    throw new Error('Command returned empty output');
  }
  try {
    return JSON.parse(text);
  } catch {
    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
      return JSON.parse(text.slice(objectStart, objectEnd + 1));
    }
    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
    }
    throw new Error(`Unable to parse JSON output:\n${stdout}`);
  }
}

function unwrapData(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) {
    return value.data;
  }
  return value;
}

function toArray(value) {
  const unwrapped = unwrapData(value);
  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }
  if (unwrapped && typeof unwrapped === 'object') {
    if (Array.isArray(unwrapped.data)) {
      return unwrapped.data;
    }
    if (Array.isArray(unwrapped.rows)) {
      return unwrapped.rows;
    }
  }
  return [];
}

function walk(value, visitor, parent = null, seen = new Set()) {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  visitor(value, parent);
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visitor, parent, seen);
    }
    return;
  }
  for (const child of Object.values(value)) {
    walk(child, visitor, value, seen);
  }
}

function modelUse(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  return node.use || node.model || node.modelUse || node.component || node['x-component'] || null;
}

function findFirstByUse(root, use) {
  let found = null;
  walk(root, (node) => {
    if (!found && modelUse(node) === use) {
      found = node;
    }
  });
  return found;
}

function hasUse(root, use) {
  return Boolean(findFirstByUse(root, use));
}

function countUses(root, uses) {
  let count = 0;
  walk(root, (node) => {
    if (uses.has(modelUse(node))) {
      count += 1;
    }
  });
  return count;
}

function collectFieldNames(root) {
  const names = new Set();
  const fieldishKeys = new Set([
    'field',
    'fieldPath',
    'fieldName',
    'name',
    'path',
    'dataIndex',
    'collectionField',
  ]);

  walk(root, (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && fieldishKeys.has(key)) {
        names.add(value);
      }
    }
    const stepParams = node.stepParams;
    if (stepParams && typeof stepParams === 'object') {
      for (const key of fieldishKeys) {
        if (typeof stepParams[key] === 'string') {
          names.add(stepParams[key]);
        }
      }
      const binding = stepParams.fieldBinding;
      if (binding && typeof binding === 'object') {
        for (const key of fieldishKeys) {
          if (typeof binding[key] === 'string') {
            names.add(binding[key]);
          }
        }
      }
    }
  });

  return [...names].filter((name) => !name.endsWith('Model')).sort();
}

function countFormFields(root) {
  return countUses(root, new Set(['PatternFormFieldModel', 'PatternFormItemModel']));
}

function countDetailsFields(root) {
  return countUses(root, new Set([
    'ApprovalDetailsItemModel',
    'ApplyTaskCardDetailsItemModel',
    'ApprovalTaskCardDetailsItemModel',
    'TaskCardCommonItemModel',
  ]));
}

function getWorkflowNodes(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    return [];
  }
  return toArray(workflow.nodes || workflow.flowNodes || workflow.workflowNodes);
}

function hasLegacyValue(config, field) {
  return Boolean(config && Object.prototype.hasOwnProperty.call(config, field) && config[field]);
}

function hasOwnConfigField(config, field) {
  return Boolean(config && typeof config === 'object' && Object.prototype.hasOwnProperty.call(config, field));
}

function requireConfigUid(summary, ownerLabel, config, field) {
  if (!hasOwnConfigField(config, field)) {
    summary.failures.push(`${ownerLabel} config.${field} field is missing; the approval surface root uid was not saved back to owner config`);
    return null;
  }
  const value = config[field];
  if (typeof value !== 'string' || value.trim() === '') {
    summary.failures.push(`${ownerLabel} config.${field} is empty; the approval surface root uid was not saved back to owner config`);
    return null;
  }
  return value;
}

function validateNoLegacyBindings(options, summary, ownerLabel, config, legacyFields) {
  if (options.allowLegacyBindings) {
    return;
  }
  for (const field of legacyFields) {
    if (hasLegacyValue(config, field)) {
      summary.failures.push(
        `${ownerLabel} uses legacy v1 config.${field}; approval v2 UI must be bound through approvalUid and built with flowSurfaces:applyApprovalBlueprint`,
      );
    }
  }
}

function validateExpectedFields(summary, label, availableFields, expectedFields) {
  const available = new Set(availableFields);
  for (const field of expectedFields) {
    if (!available.has(field)) {
      summary.failures.push(`${label} is missing expected field '${field}'`);
    }
  }
}

function nestedApprovalBranchWarnings(nodes) {
  const warnings = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (node.type !== 'approval') {
      continue;
    }
    let current = node;
    const visited = new Set();
    while (current?.upstreamId && !visited.has(current.id)) {
      visited.add(current.id);
      const upstream = byId.get(current.upstreamId);
      if (!upstream) {
        break;
      }
      if (current.branchIndex != null && upstream.type === 'approval') {
        warnings.push(
          `Approval node ${node.id} '${node.title || node.key || ''}' appears inside approval node ${upstream.id} branch ${current.branchIndex}; prefer sequential approval nodes in the main chain.`,
        );
        break;
      }
      current = upstream;
    }
  }
  return warnings;
}

function validateSurfaceRoot(summary, root, expectedUse, label) {
  if (!hasUse(root, expectedUse)) {
    summary.failures.push(`${label} root does not contain ${expectedUse}`);
  }
}

function validateInitiatorSurface(options, summary, workflow, surfaceRoot) {
  validateSurfaceRoot(summary, surfaceRoot, 'TriggerChildPageModel', 'Initiator surface');
  const applyForm = findFirstByUse(surfaceRoot, 'ApplyFormModel');
  if (!applyForm) {
    summary.failures.push('Initiator surface is missing ApplyFormModel');
    return;
  }
  if (!hasUse(applyForm, 'ApplyFormSubmitModel')) {
    summary.failures.push('Initiator ApplyFormModel is missing ApplyFormSubmitModel');
  }

  const fieldCount = countFormFields(applyForm);
  const fields = collectFieldNames(applyForm);
  summary.initiator = {
    approvalUid: workflow.config?.approvalUid,
    fieldCount,
    fields,
    hasSubmit: hasUse(applyForm, 'ApplyFormSubmitModel'),
  };

  if (fieldCount < options.minInitiatorFields) {
    summary.failures.push(
      `Initiator ApplyFormModel has ${fieldCount} field(s), expected at least ${options.minInitiatorFields}`,
    );
  }
  validateExpectedFields(summary, 'Initiator ApplyFormModel', fields, options.expectInitiatorFields);
}

function validateApproverSurface(options, summary, node, surfaceRoot) {
  validateSurfaceRoot(summary, surfaceRoot, 'ApprovalChildPageModel', `Approver surface for node ${node.id}`);
  const details = findFirstByUse(surfaceRoot, 'ApprovalDetailsModel');
  const processForm = findFirstByUse(surfaceRoot, 'ProcessFormModel');

  if (!details) {
    summary.failures.push(`Approval node ${node.id} is missing ApprovalDetailsModel`);
  }
  if (!processForm) {
    summary.failures.push(`Approval node ${node.id} is missing ProcessFormModel`);
  }

  const nodeSummary = {
    id: node.id,
    key: node.key,
    title: node.title,
    hasApprovalUidField: hasOwnConfigField(node.config, 'approvalUid'),
    approvalUid: node.config?.approvalUid,
    branchMode: node.config?.branchMode,
    informationFieldCount: 0,
    informationFields: [],
    approverFieldCount: 0,
    approverFields: [],
    processActionCount: 0,
    processActions: [],
  };

  if (details) {
    nodeSummary.informationFieldCount = countDetailsFields(details);
    nodeSummary.informationFields = collectFieldNames(details);
    if (nodeSummary.informationFieldCount < options.minInformationFields) {
      summary.failures.push(
        `Approval node ${node.id} ApprovalDetailsModel has ${nodeSummary.informationFieldCount} field(s), expected at least ${options.minInformationFields}`,
      );
    }
    validateExpectedFields(
      summary,
      `Approval node ${node.id} ApprovalDetailsModel`,
      nodeSummary.informationFields,
      options.expectInformationFields,
    );
  }

  if (processForm) {
    nodeSummary.approverFieldCount = countFormFields(processForm);
    nodeSummary.approverFields = collectFieldNames(processForm);
    const processActions = [];
    walk(processForm, (candidate) => {
      const use = modelUse(candidate);
      if (PROCESS_ACTION_USES.has(use)) {
        processActions.push(use);
      }
    });
    nodeSummary.processActions = [...new Set(processActions)].sort();
    nodeSummary.processActionCount = nodeSummary.processActions.length;
    if (nodeSummary.processActionCount < 1) {
      summary.failures.push(`Approval node ${node.id} ProcessFormModel has no approval process actions`);
    }
    if (nodeSummary.approverFieldCount < options.minApproverFields) {
      summary.failures.push(
        `Approval node ${node.id} ProcessFormModel has ${nodeSummary.approverFieldCount} field(s), expected at least ${options.minApproverFields}`,
      );
    }
    validateExpectedFields(
      summary,
      `Approval node ${node.id} ProcessFormModel`,
      nodeSummary.approverFields,
      options.expectApproverFields,
    );
  }

  summary.approverNodes.push(nodeSummary);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = {
    ok: false,
    workflowId: Number(options.workflowId),
    failures: [],
    warnings: [],
    initiator: null,
    approverNodes: [],
  };

  const workflowResponse = runNb(options, [
    'api',
    'workflow',
    'workflows',
    'get',
    '--filter-by-tk',
    String(options.workflowId),
    '--appends',
    'nodes',
  ]);
  const workflow = unwrapData(workflowResponse);
  summary.workflow = {
    id: workflow?.id,
    key: workflow?.key,
    title: workflow?.title,
    type: workflow?.type,
    collection: workflow?.config?.collection,
    hasApprovalUidField: hasOwnConfigField(workflow?.config, 'approvalUid'),
    approvalUid: workflow?.config?.approvalUid,
  };

  if (!workflow || typeof workflow !== 'object') {
    summary.failures.push(`Workflow ${options.workflowId} was not found`);
  } else if (workflow.type !== 'approval') {
    summary.failures.push(`Workflow ${options.workflowId} type is '${workflow.type}', expected 'approval'`);
  }

  if (!workflow?.config?.collection) {
    summary.failures.push('Approval workflow config.collection is missing');
  }
  validateNoLegacyBindings(options, summary, 'Approval workflow trigger', workflow?.config, [
    'applyForm',
    'applyDetail',
  ]);

  const workflowApprovalUid = requireConfigUid(summary, 'Approval workflow trigger', workflow?.config, 'approvalUid');
  if (workflowApprovalUid) {
    const surface = unwrapData(runNb(options, [
      'api',
      'flow-surfaces',
      'get',
      '--uid',
      workflowApprovalUid,
    ]));
    validateInitiatorSurface(options, summary, workflow, surface);
  }

  const nodes = getWorkflowNodes(workflow);
  const approvalNodes = nodes.filter((node) => node.type === 'approval');
  if (approvalNodes.length === 0) {
    summary.failures.push('Approval workflow has no approval nodes');
  }

  for (const node of approvalNodes) {
    validateNoLegacyBindings(options, summary, `Approval node ${node.id}`, node.config, [
      'applyDetail',
      'applyForm',
    ]);

    if (node.config?.branchMode !== true) {
      const message = `Approval node ${node.id} '${node.title || node.key || ''}' uses branchMode=${String(node.config?.branchMode)}; prefer branchMode=true unless direct mode was explicitly requested.`;
      if (options.strictTopology) {
        summary.failures.push(message);
      } else {
        summary.warnings.push(message);
      }
    }

    const nodeApprovalUid = requireConfigUid(summary, `Approval node ${node.id}`, node.config, 'approvalUid');
    if (!nodeApprovalUid) {
      continue;
    }
    const surface = unwrapData(runNb(options, [
      'api',
      'flow-surfaces',
      'get',
      '--uid',
      nodeApprovalUid,
    ]));
    validateApproverSurface(options, summary, node, surface);
  }

  const topologyWarnings = nestedApprovalBranchWarnings(nodes);
  if (options.strictTopology) {
    summary.failures.push(...topologyWarnings);
  } else {
    summary.warnings.push(...topologyWarnings);
  }

  summary.ok = summary.failures.length === 0;
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    if (summary.ok) {
      console.log(`OK approval workflow ${options.workflowId} passed UI validation.`);
    } else {
      console.error(`FAIL approval workflow ${options.workflowId} did not pass UI validation.`);
    }
    for (const failure of summary.failures) {
      console.error(`- ${failure}`);
    }
    for (const warning of summary.warnings) {
      console.error(`warning: ${warning}`);
    }
    if (summary.initiator) {
      console.log(`initiator fields(${summary.initiator.fieldCount}): ${summary.initiator.fields.join(', ') || '(none)'}`);
    }
    for (const node of summary.approverNodes) {
      console.log(
        `approval node ${node.id} details fields(${node.informationFieldCount}): ${node.informationFields.join(', ') || '(none)'}`,
      );
      console.log(
        `approval node ${node.id} process fields(${node.approverFieldCount}), actions(${node.processActionCount}): fields=${node.approverFields.join(', ') || '(none)'} actions=${node.processActions.join(', ') || '(none)'}`,
      );
    }
  }

  process.exit(summary.ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
