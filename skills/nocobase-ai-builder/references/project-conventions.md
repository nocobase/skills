# Project Conventions

## Application ownership

Follow the current project's structure instead of imposing a new architecture. The usual boundaries are:

```text
src/
├── pages/                  # Business pages
├── components/             # Application and business components
├── hooks/                  # Application hooks
├── lib/                    # Domain, API, and utility modules
├── extensions/             # Installed extension source
└── components/ui/          # shadcn Base UI foundation
```

- Put new business pages in `src/pages` or the project's existing page location.
- Keep page-specific components close to their page; promote them only when genuinely reused.
- Use existing `components`, `hooks`, and `lib` conventions before adding new top-level directories.
- Keep feature naming aligned with business language rather than implementation terms.

## Upgrade-safe customization

Treat `src/extensions` and `src/components/ui` as replaceable upstream-style layers.

1. Import an existing component through an application-owned module.
2. Re-export it unchanged when the goal is a stable application import boundary.
3. Wrap or compose it to add application behavior, defaults, slots, or styling.
4. Prefer providers, props, semantic tokens, and application CSS over source edits.
5. Modify the original only when the requirement cannot be met through composition.
6. If an original must change, compare upstream behavior, preserve its public contract, and keep the patch narrow.

Never introduce Ant Design. Use the Portal Template's React and shadcn Base UI stack.

## Product design responsibility

When requirements are incomplete, infer a coherent product rather than emitting generic scaffolding. Establish:

- system identity and audience;
- primary jobs and daily workflow;
- a short, task-oriented menu;
- a useful landing page;
- page-specific content hierarchy;
- consistent terminology and actions;
- appropriate information density;
- responsive behavior and accessibility.

Avoid mechanical patterns:

- identical CRUD pages for every collection;
- tables containing every available field;
- dashboards made of arbitrary metric cards;
- empty Overview pages;
- placeholder menu entries;
- fake data presented as a completed integration;
- generic template copy left in a business system.

## Starter cleanup

Once implementation of a real system begins:

- hide or unregister demo resources, menus, and routes through application-owned composition;
- replace the application name, workspace text, document title, descriptions, login copy, empty states, and help text;
- choose the first accessible route for the target user's actual work;
- retain useful infrastructure and installed extension source even when its demo entry is hidden;
- do not delete unrelated examples or capabilities unless the user asks for removal.

## Theme and visual system

Choose a theme that supports the system's work rather than decorating isolated pages. Define:

- semantic background, foreground, surface, border, primary, muted, destructive, and status colors;
- typography hierarchy and numeric readability;
- density, spacing, radius, and elevation;
- navigation and content width behavior;
- table, form, chart, empty, loading, and error presentation;
- light and dark behavior when the application exposes both.

Use application-level CSS variables and shared wrappers. Avoid per-page hard-coded palettes.

When the user wants an external theme, let them choose at `https://www.shadcn.io/theme` and provide its name, URL, or generated command. Before installation:

1. inspect the worktree and existing customizations;
2. inspect the installer's proposed changes when possible;
3. avoid accepting unrelated component overwrites;
4. integrate the resulting tokens with application branding and business status colors;
5. verify representative pages, not only the theme preview.

The installed theme is a visual baseline. Continue to design information architecture, page content, states, and interactions for the target system.
