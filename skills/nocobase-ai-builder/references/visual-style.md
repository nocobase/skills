# Default Application Style

Apply this style when the user has **not** specified a theme, visual direction, or brand. It is the default target for a new AI Portal application built from a business request. An explicit user theme (SKILL.md §5, `https://www.shadcn.io/theme`) or an existing project brand always overrides this document. The goal is to raise the visual floor so a generated app reads as a finished product, not a static CRUD wireframe.

## Foundation

- **Restrained monochrome base + one accent.** Near-black ink on white / very-light-gray surfaces, hairline borders, generous whitespace, a strong type scale. Choose a single accent color suited to the domain and use it sparingly — active state, primary action, a key figure, focus ring, one chart series. Everything else stays neutral. Reference quality: Linear, Attio, Vercel.
- **Semantic tokens, not ad-hoc values.** Express palette, spacing, radius, and typography as application-level tokens and shared layout primitives so pages stay consistent.

## Make it feel alive, not static

A default build must not ship as flat tables and read-only cards. Implement real motion and interaction where it serves the data:

- animated count-up on key metrics / KPI figures;
- a live-updating activity or recent-events stream where the domain has one;
- chart entrance / transition animation; sparklines and progress rings for trend and completion;
- slide-in detail drawers and smooth tab / route transitions;
- hover elevation and clear focus affordances on interactive surfaces;
- a command palette (⌘K) for search and quick actions once there are several destinations;
- draggable affordances for board / kanban and reorderable lists where the workflow implies them.

## Match the block to the region — never table-everything

Reaching for a table in every region is the most common cause of a monotone result. Choose per region: an overview / dashboard for actionable signals, a board / kanban for status pipelines, a calendar for dated events, a card grid or list-of-cards for records with visual identity, a detail drawer for related context. Use a plain table only where dense tabular scanning is genuinely the right tool.

## AI as a first-class surface (where credible)

When the runtime supports it (SKILL.md §6), make AI visible and contextual rather than decorative: an "Ask AI" entry bar with a clear thinking state, AI-assisted triage / scoring / prioritization, per-record summaries, and insight cards that surface what needs attention. Always preserve a complete non-AI path. Do not add a chat button that is not backed by real runtime capability.

## Seed every state

Populate realistic example data that fills every status, stage, priority, and empty / edge branch, with dates spread so streams, calendars, and trends are not empty on first load. Sparse data reads as broken. Use realistic domain values, never placeholder text.

## Forbidden by default

- everything rendered as a plain table;
- a marketing / landing homepage instead of a working app surface;
- lorem ipsum or placeholder copy;
- decorative AI not backed by real runtime capability.
