import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFilterFieldModelSpec } from './filter_form_field_resolver.mjs';

const metadata = {
  collections: {
    projects: {
      name: 'projects',
      fields: [
        { name: 'stage', interface: 'select', type: 'string' },
        { name: 'due_on', interface: 'date', type: 'date' },
        { name: 'due_at', interface: 'datetime', type: 'datetime' },
        { name: 'due_at_local', interface: 'datetimeNoTz', type: 'datetime' },
        { name: 'estimate', interface: 'number', type: 'integer' },
        { name: 'progress', interface: 'percent', type: 'percent' },
        { name: 'start_at', interface: 'time', type: 'time' },
        { name: 'manager', interface: 'm2o', type: 'belongsTo', target: 'users', foreignKey: 'manager_id', targetKey: 'id' },
      ],
    },
    users: {
      name: 'users',
      fields: [
        { name: 'id', interface: 'integer', type: 'bigInt' },
        { name: 'nickname', interface: 'input', type: 'string' },
      ],
    },
  },
};

test('resolveFilterFieldModelSpec maps top-level select fields to SelectFieldModel', () => {
  const spec = resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'stage',
  });

  assert.equal(spec.use, 'SelectFieldModel');
  assert.deepEqual(spec.descriptor, {
    name: 'stage',
    title: 'stage',
    interface: 'select',
    type: 'string',
  });
});

test('resolveFilterFieldModelSpec keeps association fields on FilterFormRecordSelectFieldModel', () => {
  const spec = resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'manager',
  });

  assert.equal(spec.use, 'FilterFormRecordSelectFieldModel');
  assert.deepEqual(spec.descriptor, {
    name: 'manager',
    title: 'manager',
    interface: 'm2o',
    type: 'belongsTo',
    target: 'users',
    foreignKey: 'manager_id',
    targetKey: 'id',
  });
});

test('resolveFilterFieldModelSpec uses leaf-field descriptor for dotted scalar paths', () => {
  const spec = resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'manager.nickname',
  });

  assert.equal(spec.use, 'InputFieldModel');
  assert.deepEqual(spec.descriptor, {
    name: 'nickname',
    title: 'nickname',
    interface: 'input',
    type: 'string',
  });
});

test('resolveFilterFieldModelSpec covers date, datetime, datetimeNoTz, number, percent and time mappings', () => {
  assert.equal(resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'due_on',
  }).use, 'DateOnlyFilterFieldModel');
  assert.equal(resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'due_at',
  }).use, 'DateTimeTzFilterFieldModel');
  assert.equal(resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'due_at_local',
  }).use, 'DateTimeNoTzFilterFieldModel');
  assert.equal(resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'estimate',
  }).use, 'NumberFieldModel');
  assert.equal(resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'progress',
  }).use, 'PercentFieldModel');
  assert.equal(resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'start_at',
  }).use, 'TimeFieldModel');
});

test('resolveFilterFieldModelSpec falls back through preferred uses when allowedUses excludes the first choice', () => {
  const spec = resolveFilterFieldModelSpec({
    metadata,
    collectionName: 'projects',
    fieldPath: 'progress',
    allowedUses: ['NumberFieldModel', 'InputFieldModel'],
  });

  assert.equal(spec.use, 'NumberFieldModel');
  assert.deepEqual(spec.preferredUses, ['PercentFieldModel', 'NumberFieldModel']);
});
