# PRD To Task Mapping

Map PRD sections to downstream skill task groups.

## Mapping Table

| PRD field | Task group | Downstream skill | Notes |
| --- | --- | --- | --- |
| `business_objects` | `TG-DATA-MODELING` | `nocobase-data-modeling` | Collections, fields, relations, collection type decisions. |
| `pages` | `TG-UI-BUILDER` | `nocobase-ui-builder` | Menus, pages, blocks, popups, actions, reactions. |
| `processes` | `TG-WORKFLOW` | `nocobase-workflow-manage` | Lifecycle workflows, triggers, node chains, state automation. |
| `permissions` | `TG-ACL` | `nocobase-acl-manage` | Roles, route permissions, data permissions, risk assessment. |
| `metrics` | `TG-REPORTING` | `nocobase-ui-builder` / `nocobase-data-analysis` | Dashboard pages and data checks. |
| `acceptance_tests` | `TG-ACCEPTANCE` | agent/manual acceptance | Scenario verification after execution. |
| plugin gaps | `TG-PLUGIN-*` | `nocobase-plugin-development` / `nocobase-plugin-manage` | Only when PRD needs unsupported features. |
| env/publish scope | `TG-ENV` / `TG-PUBLISH` | `nocobase-env-manage` / `nocobase-publish-manage` | Only when PRD explicitly includes runtime lifecycle or release. |

## Default Dependency Order

```yaml
execution_order:
  - TG-READINESS
  - TG-DATA-MODELING
  - TG-UI-BUILDER
  - TG-WORKFLOW
  - TG-ACL
  - TG-REPORTING
  - TG-ACCEPTANCE
```

Default dependencies:

- `TG-DATA-MODELING`: no dependency after readiness.
- `TG-UI-BUILDER`: depends on `TG-DATA-MODELING`.
- `TG-WORKFLOW`: depends on `TG-DATA-MODELING`; often also `TG-UI-BUILDER` when manual trigger buttons or page actions are involved.
- `TG-ACL`: depends on `TG-DATA-MODELING` and `TG-UI-BUILDER`.
- `TG-REPORTING`: depends on `TG-DATA-MODELING`; often `TG-UI-BUILDER`.
- `TG-ACCEPTANCE`: depends on all mutation task groups.

## Data Modeling Prompt Content

Include:

- all business objects and fields
- relation intent
- enum values
- file or special collection hints
- "inspect existing collections first"
- "do not create pages, workflows, or ACL"
- readback evidence requirements

## UI Builder Prompt Content

Include:

- page list
- roles for each page
- main objects and actions
- page purpose
- needed popups/details/forms/tables/dashboards
- "use live collection metadata"
- "do not create schema or ACL"
- readback evidence requirements

## Workflow Prompt Content

Include:

- process IDs and state transitions
- trigger intent
- actors
- default values or automation behavior
- unresolved optional transitions excluded from scope
- "use actual collection and field names from readback"
- verification requirements

## ACL Prompt Content

Include:

- roles
- permissions
- data scopes
- page/menu access intent
- high-impact confirmation requirement
- readback evidence requirements

## Reporting Prompt Content

Include:

- metrics
- dashboard pages
- dimensions/measures at business level
- whether data analysis is only for verification or dashboard authoring

## Acceptance Prompt Content

Include:

- all acceptance tests
- source PRD items covered
- expected evidence
- output path for acceptance report
