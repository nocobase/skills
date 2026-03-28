---
title: nocobase-page-builder Reference Index
description: Entry point for all reference docs. Categorized by purpose; load on demand during builds.
---

# Reference Index

## Must Read

- [gotchas.md](gotchas.md) — 12+ critical pitfalls (API full-replace, grid rendering, popup ctx, etc.)

## Build Pipeline (by Phase Order)

- [phases/phase-0-init.md](phases/phase-0-init.md) — Requirements analysis
- [phases/phase-1-data.md](phases/phase-1-data.md) — DDL → collection → relation
- [phases/phase-2-fields.md](phases/phase-2-fields.md) — Field type selection
- [phases/phase-3-pages.md](phases/phase-3-pages.md) — Page layout + XML markup
- [phases/phase-3b-forms.md](phases/phase-3b-forms.md) — Form fine-tuning
- [phases/phase-4-js.md](phases/phase-4-js.md) — JS implementation
- [phases/phase-5-workflows.md](phases/phase-5-workflows.md) — Workflows
- [phases/phase-6-ai.md](phases/phase-6-ai.md) — AI employees
- [phases/phase-7-verify.md](phases/phase-7-verify.md) — Acceptance testing

## Knowledge Base

- [knowledge/page-building.md](knowledge/page-building.md) — Core concepts of page building
- [knowledge/data-modeling.md](knowledge/data-modeling.md) — Data modeling
- [knowledge/js-sandbox.md](knowledge/js-sandbox.md) — JS sandbox API (ctx.*)
- [knowledge/workflows.md](knowledge/workflows.md) — Workflow concepts
- [knowledge/ai-employees.md](knowledge/ai-employees.md) — AI employees
- [knowledge/nocobase-concepts.md](knowledge/nocobase-concepts.md) — NocoBase terminology
- [knowledge/troubleshooting.md](knowledge/troubleshooting.md) — Common troubleshooting

## Patterns & Code

- [patterns/layout-patterns.md](patterns/layout-patterns.md) — 6 page layout patterns
- [patterns/detail-patterns.md](patterns/detail-patterns.md) — Detail popup structure
- [patterns/chart-patterns.md](patterns/chart-patterns.md) — Chart visualization
- [patterns/js-patterns.md](patterns/js-patterns.md) — JS coding patterns
- [patterns/js-sandbox.md](patterns/js-sandbox.md) — Sandbox detailed API
- [snippets/js-snippets.md](snippets/js-snippets.md) — JS code snippets (copy & paste ready)

## Deep Research Docs (API Principles & Practical Experience)

- [research/api-principles.md](research/api-principles.md) — Page building API principles (desktopRoutes, FlowModels architecture)
- [research/standard-workflow.md](research/standard-workflow.md) — Standard page building workflow (verified complete API flow)
- [research/research-api-patterns.md](research/research-api-patterns.md) — FlowModel API key findings (practical pitfalls)
- [research/research-layouts.md](research/research-layouts.md) — Grid layout & page structure (gridSettings in detail)
- [research/research-forms.md](research/research-forms.md) — Form fields, validation & linkage
- [research/research-details.md](research/research-details.md) — Detail blocks & tab structure
- [research/research-actions.md](research/research-actions.md) — Action buttons & popup mechanism
- [research/research-event-flows.md](research/research-event-flows.md) — Event flows & flowRegistry
- [research/js-blocks-reference.md](research/js-blocks-reference.md) — JS blocks complete reference (ctx API + code listing)
- [research/inspect-reference.md](research/inspect-reference.md) — Page inspection tool reference
- [research/data-modeling-api.md](research/data-modeling-api.md) — Data table modeling API principles
- [research/dashboard-build.md](research/dashboard-build.md) — Dashboard building experience
- [research/export-page-json.md](research/export-page-json.md) — Page export (JSON): three-API chain, script, analysis tips

## JS Sandbox Deep Guide

- [research/js-sandbox/pitfalls.md](research/js-sandbox/pitfalls.md) — Whitelist restrictions, common errors
- [research/js-sandbox/popup-context.md](research/js-sandbox/popup-context.md) — Retrieving records in popups (ctx.popup)
- [research/js-sandbox/open-view.md](research/js-sandbox/open-view.md) — Opening drawers/popups with parameters
- [research/js-sandbox/cross-block-filter.md](research/js-sandbox/cross-block-filter.md) — Cross-block linked filtering
- [research/js-sandbox/form-value-binding.md](research/js-sandbox/form-value-binding.md) — JS Editable Field & form value binding
- [research/js-sandbox/js-block-cookbook.md](research/js-sandbox/js-block-cookbook.md) — JS Block code quick reference
- [research/js-sandbox/popup-content-build.md](research/js-sandbox/popup-content-build.md) — Pre-creating Chart/JSBlock inside popups

## Templates

- [../templates/js/index.md](../templates/js/index.md) — 17 JS templates (column/event/item)
- [../templates/pages/index.md](../templates/pages/index.md) — 6 page layout templates
- [../templates/workflows/index.md](../templates/workflows/index.md) — 4 workflow templates
