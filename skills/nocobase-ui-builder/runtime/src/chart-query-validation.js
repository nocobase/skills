const CHART_BUILDER_RELATION_FIELD_RULE_ID = 'chart-builder-relation-field-runtime-unsupported';
const CHART_BUILDER_RELATION_FIELD_CODE = 'CHART_BUILDER_RELATION_FIELD_RUNTIME_UNSUPPORTED';
const CHART_BUILDER_RELATION_FIELD_MESSAGE =
  'Builder chart query relation fields are not safe in the current charts:queryData runtime and may fail with Invalid SQL column or table reference. Use a SQL chart with an explicit join and stable aliases, or group by a scalar foreign-key field.';

const BUILDER_QUERY_FIELD_CONTAINERS = ['measures', 'dimensions', 'orders', 'sorting'];

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRelationFieldPath(field) {
  if (Array.isArray(field)) {
    return field.filter((item) => typeof item === 'string' && item.trim()).length > 1;
  }
  return typeof field === 'string' && field.includes('.');
}

function pushIssue(issues, path, field) {
  issues.push({
    path,
    ruleId: CHART_BUILDER_RELATION_FIELD_RULE_ID,
    code: CHART_BUILDER_RELATION_FIELD_CODE,
    message: CHART_BUILDER_RELATION_FIELD_MESSAGE,
    details: { field },
  });
}

export function collectBuilderChartRelationFieldIssues(query, path) {
  const issues = [];
  if (!isObjectRecord(query)) return issues;

  for (const containerKey of BUILDER_QUERY_FIELD_CONTAINERS) {
    const container = query[containerKey];
    if (!Array.isArray(container)) continue;
    container.forEach((item, index) => {
      const field = isObjectRecord(item) ? item.field : item;
      if (!isRelationFieldPath(field)) return;
      pushIssue(issues, `${path}.${containerKey}[${index}].field`, field);
    });
  }

  return issues;
}

export {
  CHART_BUILDER_RELATION_FIELD_CODE,
  CHART_BUILDER_RELATION_FIELD_MESSAGE,
  CHART_BUILDER_RELATION_FIELD_RULE_ID,
};
