---
name: nocobase-ai-builder
description: >-
  Design, build, and verify source-code applications in NocoBase AI Portals
  based on @nocobase/portal-template-default. This skill is mandatory whenever
  the selected Portal has portalType "ai". Use it for complete systems, pages,
  navigation, CRUD, dashboards, forms, dialogs, drawers, URL-addressable
  subpages, authentication UI, frontend access control, localization, themes,
  NocoBase API integration, responsive design, and browser verification.
---

# Goal

Turn a user's business request into a coherent, production-shaped AI Portal application. Own both product design and source implementation: do not stop at a mechanical CRUD example when the user has not supplied detailed information architecture, page composition, copy, or visual direction.

# Entry Contract

- Use this skill for every development request after a Portal record has been resolved with `portalType === "ai"`.
- Consume the resolved Portal name, environment, and local source path from `nocobase-portal-manage` when available. Do not resolve a different Portal inside this skill.
- When the user is already working in a recognizable AI Portal source project, use that project directly unless the request identifies another Portal.
- Treat the original build request as authorization to edit and verify that Portal source. Do not ask for a second code-edit confirmation.
- Read the project's `AGENTS.md` and applicable local instructions before changing files.
- Preserve unrelated worktree changes. Do not push or deploy unless the user requests it.

# Required Workflow

## 1. Inspect the current application

Before designing or writing code:

1. Inspect the project structure, package scripts, runtime configuration, routes, resources, providers, pages, components, and installed extensions.
2. Inspect existing examples and reusable components before creating equivalents.
3. Identify existing branding, navigation, theme tokens, authentication, ACL, i18n, API, and asset URL conventions.
4. Confirm collections, fields, associations, and actions from real NocoBase metadata, Swagger documents, responses, or existing code. When API integration is in scope, use `nb api swagger list/get` to read the narrowest relevant document namespace. Never invent backend contracts.
5. Identify template demo menus, pages, copy, and branding that should be replaced for the requested system.

When a requested server-backed capability has no reliable existing example, reading Swagger is required before claiming it can be implemented. Locate and fetch the relevant collection or plugin namespace, then confirm the endpoint, method, parameters, request body, response, and documented permission expectations. If the required capability is absent from the available documents, do not guess an API or present the feature as supported; report the missing contract and determine whether a backend or plugin change is required.

Read [Project Conventions](references/project-conventions.md) before editing application structure or UI foundations. Read [NocoBase Runtime](references/nocobase-runtime.md) before implementing data, authentication, i18n, runtime configuration, or assets.

## 2. Design the system before coding

Create a compact internal product brief from the user's request:

- system purpose and working title;
- primary user roles and their frequent tasks;
- information architecture and menu hierarchy;
- page inventory and the responsibility of each page;
- core page content, actions, and states;
- route, dialog, drawer, and subpage model;
- frontend access-control model;
- visual direction, density, theme, and responsive behavior.

Make reasonable product decisions when details are missing. Ask only when a missing choice materially changes business behavior, data, security, or an irreversible action.

Do not derive the whole product from a Users or CRUD example. Adapt page composition to the business: a workspace should surface work, an overview should surface actionable signals, a detail page should organize related context, and a form should follow the real workflow.

Treat the starter sidebar as a preset reference rather than a fixed application shell. As a product-design optimization, consider the navigation structure that best fits the system—such as top navigation, sidebar navigation, secondary menus, contextual tabs, or a restrained combination. This is guidance, not a requirement to replace the sidebar. Whichever pattern is chosen, keep navigation understandable and ensure its routes, direct access, responsive layout, and interaction remain usable across supported device sizes.

## 3. Design and configure roles and permissions

For a complete system, include a dedicated role-and-permission task in the Todo list or implementation plan. Do not bury it under project inspection, routing, or page implementation.

- Define the actual user roles, memberships, and role-specific responsibilities. If the system genuinely has one undifferentiated role, record that decision explicitly instead of silently omitting permission design.
- Decide and configure which roles may enter the Portal.
- When creating a role for the resolved Portal, pass that Portal's uid or exact identity to `nocobase-acl-manage` and treat its explicit Portal entry grant as part of role creation. Verify the role-to-Portal association before continuing.
- Configure and verify server resource/action/scope/field policies for each role before relying on frontend visibility.
- Design frontend menu, route, page, region, field, action, and record behavior for allowed and denied users.
- Use the installed ACL boundaries at the smallest correct scope: `AclPage` for a whole page, `AclRegion` for an independent protected panel, `AclField` for a field or field group, and `CanAccess` or ACL-aware built-in action components for controls and record operations. Do not duplicate their checks with local booleans or hard-coded role comparisons.
- Hiding a control is not sufficient security; NocoBase server ACL remains authoritative.

Use `nocobase-acl-manage` for role, membership, Portal entry, and server ACL changes. Read [Routing and Access](references/routing-and-access.md) completely before implementing frontend permissions, and verify at least one allowed and one denied role or permission state.

## 4. Establish navigation and URLs

Design navigation and URL surfaces before implementing page internals:

- Every visible leaf menu must lead to a real, accessible route.
- Every page intended to appear in the sidebar must declare both its route and a Refine `resource`; a route element alone does not create a menu item.
- Do not create placeholder menu items or empty groups.
- Dialogs, drawers, details, editors, and meaningful subpages must have independent URLs that support direct open, refresh, sharing, and browser history.
- Decide whether every create, edit, and show action is a drawer, dialog, or full page before implementing its route. Treat `resourceAction` as Refine path metadata, not as a presentation choice.

Read [Routing and Access](references/routing-and-access.md) completely whenever the task adds or changes navigation, routes, dialogs, drawers, subpages, roles, or permissions.

## 5. Implement application-owned code

- Put all application-owned business functionality—including routes, pages, components, hooks, utilities, and translations—in application-owned `src` directories, following the project's current organization. Never create `src/extensions/<business-feature>` for it.
- Reserve `src/extensions` for installed Registry extension source and treat `src/components/ui` as the shadcn foundation. Do not modify either by default.
- When reusing an extension or base component, import, re-export, wrap, or compose it from application-owned code. Modify its source only when the task explicitly requires changing that extension or foundation and composition cannot satisfy the requirement; keep the diff minimal.
- Use React, TypeScript, Refine, React Router, Tailwind, and shadcn Base UI patterns already present in the project.
- Never introduce Ant Design or Ant Design-based NocoBase client components.
- Respect Base UI rendering contracts. When a controlled `Select` stores an enum key or record ID, resolve and render its user-facing label in `SelectValue` instead of exposing the raw value.
- Reuse the Portal's API client, data provider, authentication session, ACL runtime, i18n runtime, system settings, basename, and asset URL helpers.
- Use the NocoBase `query` action for charts, KPIs, and grouped aggregation; do not fetch every list record and derive server-scale analytics in the browser.
- Cover loading, empty, error, unauthorized, success, destructive confirmation, and responsive states as appropriate.
- Use semantic tokens and shared composition. Avoid one-off colors, arbitrary dimensions, excessive `className`, and unnecessary rewrites of shadcn defaults.

When a real system is being built, remove template presentation from the application surface: hide or unregister demo navigation and routes at the application layer, replace starter branding and copy, and make the first accessible page useful for the target users. Do not delete installed extension source merely to hide a demo entry.

## 6. Populate representative demo data

For a new or substantially rebuilt system, populate coherent demo records after the data model and core workflows are working. This is part of the build deliverable, not an optional follow-up.

- Create records through real NocoBase APIs or CLI commands; do not hard-code mock business records in frontend components.
- Cover the primary collections, associations, option values, owners, statuses, and dates needed to make the landing page, lists, details, filters, dashboards, and AI context meaningful.
- Use recognizable demo identifiers and inspect existing records first so reruns do not create uncontrolled duplicates. Never overwrite or delete existing user data to make room for a demo.
- Exercise at least one realistic end-to-end workflow in the data, rather than filling every field with unrelated placeholders.
- If the target contains real business data, record creation is not authorized, or the API rejects the operation, do not silently omit this step. Report the reason and the exact remaining data setup.

## 7. Choose and apply a theme

If the user did not specify a theme, choose a restrained, coherent direction appropriate to the system and continue without blocking. Define theme behavior through application-level semantic tokens and shared layout rules.

If the user wants to choose a theme, direct them to `https://www.shadcn.io/theme` and accept the selected theme name, Registry URL, or generated installation command. Review the working tree and installer diff, integrate the theme with application branding, and avoid blindly overwriting customized `src/components/ui` files. A theme supplies visual foundations; it does not replace business-specific information architecture, content, states, or interactions.

## 8. Implement meaningful AI interaction

After the system's core workflows work without AI, review the finished pages and identify interactions where AI can materially reduce effort or improve decisions. Good candidates include natural-language retrieval, summarization, extraction, classification, drafting, explanation, guided analysis, and multi-step assistance grounded in current page or record context.

For a complete AI Portal system build, implement at least one credible, contextual AI interaction. Evaluation or a list of possible ideas alone does not complete this requirement. Choose the best-supported interaction without asking for another confirmation when it does not materially change business behavior or security.

- Inspect the installed AI extensions, existing demos, hooks, components, tool-call renderers, and employee integration examples before designing a new interaction.
- Never add, bind, expose, or select developer-category employees for Portal AI interactions. Exclude known developer usernames such as `nathan`, `dara`, `lina`, and `orin` even when they are returned by discovery APIs; use a suitable business employee or create a dedicated one.
- Before implementing a page-level AI interaction, study the installed Page Context demo and its prompt-generator scenarios. Prefer an existing pattern—manual page-element selection, Shortcut task context, conversation preset context, inherited `AIPageContextScope`, Form filler, or a permission-aware custom frontend Tool—and reuse its context and task contracts.
- Prefer contextual entry points close to the relevant page, record, selection, or action. Make the context being shared and the result being produced clear to the user.
- Preserve a complete non-AI workflow. AI output must not silently bypass validation, ACL, confirmation, or server-side business rules.
- Reuse existing AI runtime and employee/tool contracts. Use `nocobase-ai-employee` when employee, model, tool, or prompt configuration is required.
- Do not satisfy the requirement with a decorative chat button or an unsupported capability. If no employee, model, tool contract, or runtime can support a credible interaction, diagnose the missing prerequisite and report the AI portion as incomplete instead of silently skipping it.

## 9. Verify the result

Run the project's relevant type check and production build. Run focused existing regression tests when the changed area has them; do not add superficial tests solely to increase test count.

Use browser verification for user-visible work. Validate the actual route under the Portal basename, console errors, navigation, direct URLs, refresh, history, dialogs and drawers, role and ACL states, populated demo data, responsive layout, theme consistency, required AI and non-AI paths, and removal of template residue. Compare the intended page inventory with the rendered sidebar, confirm that no plain resource-action page is appended below its parent list, and verify that controlled selects display labels rather than stored values.

Read [Verification](references/verification.md) before completing a substantial page or system build.

# Coordination Boundaries

- Use `nocobase-data-modeling` when the requested UI requires creating or changing backend collections or fields, then return here for source implementation.
- Use `nocobase-acl-manage` when roles, user-role membership, Portal entry access, or server-side resource policy must change; keep frontend access-control implementation in this skill.
- Use `nocobase-ai-employee` for AI employee discovery, lifecycle, models, tools, or prompt configuration.
- Use `nocobase-portal-manage` for Portal create, source sync, dev lifecycle, push, deploy, or destroy operations.
- Diagnose and report a missing runtime capability rather than replacing NocoBase infrastructure with a parallel local implementation.

# Reference Loading Map

| Reference | Read when |
|---|---|
| [Project Conventions](references/project-conventions.md) | Changing structure, branding, theme, shared UI, extension use, or starter content |
| [NocoBase Runtime](references/nocobase-runtime.md) | Using data, API actions, auth, i18n, system settings, basename, or assets |
| [Routing and Access](references/routing-and-access.md) | Adding navigation, URL surfaces, roles, ACL, or protected controls |
| [Verification](references/verification.md) | Validating a page, feature, theme, or complete system |

# Completion Output

Report:

- the system or feature designed;
- important product and technical decisions;
- changed files and integration points;
- data, route, and access-control assumptions confirmed from real evidence;
- representative demo data created, or the explicit reason it could not be created;
- the contextual AI interaction delivered, or the exact missing runtime prerequisite blocking it;
- checks and browser scenarios run;
- anything incomplete or requiring server configuration;
- optional next steps, without automatically pushing or deploying.
