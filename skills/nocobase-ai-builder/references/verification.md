# Verification

Validate behavior and product quality, not only compilation. Plan verification while implementing instead of adding tests after the feature is finished.

## Test strategy

- Add or update the smallest set of tests that protects meaningful user behavior, public contracts, important regressions, and high-risk failure modes.
- Cover the system's primary workflows. Prefer a few complete E2E journeys plus focused frontend tests over many fragmented cases.
- Do not duplicate the same assertion in frontend and E2E tests unless each layer protects a different contract.
- If a change does not justify a new test, run the relevant existing tests and explain why no new test was needed.
- Remove stale or low-value tests when they obscure the useful suite.

## Frontend tests

Use frontend tests for pure logic and local component behavior that does not need a running NocoBase backend.

- Exercise behavior through ordinary props, rendered output, user events, local UI state, and stable public contracts.
- Test reusable business logic, validation, formatting, state transitions, and component interaction when these can be isolated naturally.
- Do not mock NocoBase APIs, authentication, ACL, data providers, or server data to force an integration scenario into a frontend test. Put that scenario in E2E.
- Do not assert source strings, regex-match JSX, depend on internal component structure, or use broad snapshots as a substitute for behavior assertions.

## E2E tests

Use E2E tests with a real NocoBase backend and browser for authentication, data, permissions, routing integration, files, AI, and other server-backed behavior. Use the project's configured E2E runner to start the Portal frontend when supported.

Select scenarios according to the feature rather than mechanically testing every control. A substantial system should cover its primary journey and the relevant items below:

- sign-in and session persistence;
- the main list, create, edit, detail, or business workflow using real records;
- the real Portal basename, visible menu inventory, direct route access, and refresh;
- Back and Forward through route dialogs, drawers, and subpages, including restoration of the originating URL with its query and hash;
- direct entry to a contextual child route and its safe close fallback;
- representative allowed and denied role or ACL states for permission-sensitive behavior;
- controlled Select labels before and after persistence when stored values differ from display labels;
- loading, validation, empty, error, unauthorized, recovery, or session-expiry behavior when it presents a material risk;
- error-boundary containment, recovery, copyable diagnostics, and sensitive-data redaction when high-risk renderers change;
- representative desktop and narrow viewport behavior for important responsive flows;
- contextual AI behavior and its complete non-AI path when AI interaction is implemented;
- file workflows only when they are material to the requested system.

Use representative demo data so relationships, filters, dashboards, permissions, and AI context exercise realistic behavior. Do not make the test suite depend on unrelated pre-existing records when controlled test setup is practical.

## Test-value rules

Do not add tests merely to increase coverage or test count. Avoid:

- placeholder or component-exists tests;
- tests that only assert an export is a function or a file contains text;
- source-code regex tests and implementation-detail assertions;
- snapshot-heavy coverage with no meaningful behavioral assertion;
- duplicated cases that protect no additional workflow or risk;
- broad mocks that make a server-backed flow pass without validating the real integration.

Every retained test should have a clear regression it would catch. When one E2E workflow already proves several connected steps, do not split it into many superficial tests solely for reporting.

## Static and build checks

- Run the project's TypeScript check and production build.
- Run the relevant frontend and E2E tests for the changed area.
- Check the diff for accidental changes to `src/extensions`, `src/components/ui`, lockfiles, generated files, environment files, and unrelated user work.

## Focused browser inspection

Use manual browser inspection only as a supplement for visual, responsive, accessibility, or exploratory product-quality concerns that automated assertions do not reasonably express. Inspect the console and failed requests while doing so. If inspection exposes a durable regression risk, convert it into an automated test when practical. Do not report browser inspection as equivalent to repeatable acceptance tests.

## Product-quality review

Before reporting completion, ask:

- Does the application look and read like the requested system rather than a starter demo?
- Is the landing page useful for the primary user's work?
- Is the menu concise and task-oriented?
- Does each page contain information and actions appropriate to its business purpose?
- Are forms grouped by workflow rather than database order?
- Are tables limited to useful comparison fields?
- Are copy, empty states, confirmations, and errors specific and actionable?
- Is the theme coherent across navigation, data, forms, overlays, and feedback states?
- Are template names, sample descriptions, placeholder menus, and irrelevant demo routes gone from the application surface?
- Does a complete AI Portal include a useful contextual AI interaction with a working non-AI path, rather than only an AI idea or decorative entry point?

If a check cannot be performed, report it explicitly with the reason and the concrete remaining verification step.
