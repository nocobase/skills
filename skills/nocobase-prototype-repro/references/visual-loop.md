# Visual convergence loop

The lever that separates a faithful reproduction from "renders, no errors, but ugly". A text-only agent can prove a page *works*; only looking at the rendered pixels next to the prototype proves it *matches*. Make this loop mandatory for any signature region.

## The loop

1. **Build / change** the region (Phase 3).
2. **Render & shoot.** Playwright, fresh no-cache browser, inject `localStorage NOCOBASE_TOKEN`, open `/admin/<pageSchemaUid>`. Screenshot the region (and the relevant interaction states — popup open, filtered, hover if capturable). Save to `/tmp/<region>_after.png`. Keep a `_before.png` when changing an existing page.
3. **Compare with vision — image vs image, not image vs code.** Screenshot the **prototype** too (open its URL in the same headless browser and shoot it), then open both PNGs and judge them side by side. Reading the prototype as HTML *source* and only screenshotting your own build is the common half-measure — you end up comparing your pixels against your mental model of the code, and miss layout/spacing/color gaps. Render both to images and actually look. This step needs a vision-capable pass.
4. **Write a concrete gap list.** Not "looks off" — specific: "buttons three different sizes; Transfer has black title vs others white; no hover; cards too tall; calendar only 3 events/day vs prototype's full grid; status pill color wrong for `cancelled`." Each item must be actionable.
5. **Fix** the top gaps, re-shoot, repeat. Stop when the gap list is cosmetic-trivial or empty. Then report and hit the user-confirm gate.

Two passes is typical; a region that's far off may need three. Track what you changed each pass so you don't oscillate.

## Single agent vs builder + reviewer — let the model choose

There is no fixed rule; pick per situation:

- **Self-check (one agent)** when the region is small, the agent is vision-capable, and it's close — the same agent shoots and judges its own output. Cheapest, fine for tweaks.
- **Split roles** when the region is very visual, far from target, or the builder is a cheaper/text-weaker model: a **builder** (cheap, does the CLI/JS grind) produces the screenshot; a **vision reviewer** (stronger model) reads screenshot-vs-prototype and returns a punch list; builder applies it; loop. This mirrors the human reviewer in the loop — externalize it when the builder can't reliably self-judge.

Decide based on cost, how far off the first render is, and how visual the region is. Don't hard-code a second agent for trivial changes; don't trust a weak model's "looks good enough" on a hero view.

## What the reviewer checks against the prototype

- Layout: are regions in the same positions, same density (a sparse calendar/board fails here)?
- The right block type: is a card region a List of cards, not a bare table? a board a Kanban? — see `block-recipes.md`.
- Card anatomy: icon/avatar present, title weight, sub-meta line, spacing/gaps, border-radius.
- Color semantics: status/priority/channel tags match the prototype's color language; unknown enums fall back, no "Tag not found".
- States: overdue/urgent loud (red), cancelled struck-through, hover lift if applicable.
- Interactions: click opens the **native** popup (drawer/dialog), not a self-drawn modal; filters actually filter; checkboxes persist.
- Errors: zero console / pageerror; no "Collection may have been deleted"; no "Invalid SQL column".

## Compare-grid review format

A useful final review artifact for a whole module set: a **compare grid** — left = prototype, right = reproduction, one pair per module, stacked top-to-bottom into one long image. Capturing NocoBase Modern pages full-page needs one trick: the admin scrolls inside an inner container (content area is `height:100%`), so a plain `full_page` screenshot clips at viewport height — grow the viewport to the measured content height first, then shoot. Drive it with a fresh headless browser that has the token injected into `localStorage` (`NOCOBASE_TOKEN`).

## Reporting after convergence

Deliver: pages/blocks/fields touched (uids), what changed per region, the before/after screenshot paths, and an explicit **gaps / tradeoffs** list (what the native block couldn't match 1:1 and why — never hide it). Then stop at the user-confirm gate.
