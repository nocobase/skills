# Verification

Validate behavior and product quality, not only compilation.

## Static checks

- Run the project's TypeScript check and production build.
- Run focused existing tests for changed authentication, ACL, i18n, data, or extension integration.
- Check the diff for accidental changes to `src/extensions`, `src/components/ui`, lockfiles, generated files, environment files, and unrelated user work.
- Do not add low-value tests that only assert component existence or duplicate implementation details.

## Browser checks

- Open the application under the real Portal basename.
- Inspect the console and failed network requests.
- Navigate through every new menu entry.
- Open each new route directly and refresh it.
- Exercise browser Back and Forward through dialogs, drawers, and nested subpages.
- Verify close behavior with and without an originating route.
- Check loading, empty, populated, validation, error, unauthorized, and success states that can be exercised safely.
- Confirm representative demo records make the primary pages, relationships, filters, dashboards, and contextual AI interaction meaningfully testable.
- Check allowed and denied roles, route guards, regions, actions, and record controls.
- Check session expiry and the intended login return path when authentication changed.
- Check representative desktop and narrow viewports.
- Check theme contrast, typography, density, overflow, focus visibility, and light/dark behavior when supported.

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
