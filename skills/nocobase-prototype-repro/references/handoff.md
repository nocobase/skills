# The "short prompt + one link" handoff

How to let another agent reproduce a module end-to-end from a one-line user prompt.

## The pattern

The prompt stays short for the user but carries **one link**; the receiving agent curls it to load everything it needs:

1. the **prototype HTML** — the visual target ("what it looks like"),
2. the **block recipes** — runnable JSON per native block ("how to call the CLI"),
3. the **gotcha registry** + the container/content hard rule ("what not to grind on").

Prototype solves *what it looks like*, recipes solve *how to call the CLI*, gotchas stop the agent grinding on known traps, and the visual loop lets it notice when it's ugly.

Local link form: `http://localhost:4321/prototypes/app-library/NN-*.html`; swap to an OSS/public URL later (`https://static-docs.nocobase.com/solution/templates/NN-*.html`) — the prompt shape is unchanged.

## Best practice: embed the spec in the prototype

A prototype shows "what it looks like" but not "what it *is*" — the data model, which region is which block, the non-visual interactions (e.g. a live preview binding). That inference gap is where one-pass builds degrade (missing a live phone preview, a queue feed, a facet rail).

So author each prototype with an embedded, page-invisible spec:

```html
<script type="application/nb-spec+json">
{
  "collections": [ /* tables + fields + relations */ ],
  "regions": [ { "name": "...", "block": "list+jsItem", "notes": "..." } ],
  "interactions": [ "faceted filter with counts", "click row -> drawer", ... ],
  "jsKernels": [ "live device-frame preview bound to form values", ... ],
  "notes": "preview MUST be a device-frame live preview, not a static card"
}
</script>
```

Then the single prototype link carries **both the pixels and the spec** — the receiving agent reads the spec, builds, and confirms, instead of guessing. This is the highest-leverage fix for one-pass fidelity, and it is **authored content, not a brittle parser**: the author (who knows the intent) writes the spec once; the builder honors it.

When a prototype has an embedded `nb-spec`, Phase 1 starts from it (validate/confirm) rather than inferring the SPEC from pixels alone.

## Related

- Authoring a prototype (incl. the embedded spec) when none exists: [prototype-authoring.md](prototype-authoring.md)
- The SPEC the receiving agent produces/confirms: [spec-template.md](spec-template.md)
