---
title: Quick Start — Build a CRUD Page in 5 Minutes
description: The shortest path from zero to a working page
---

# Quick Start

## Prerequisites

- NocoBase is running (default http://localhost:14000)
- MCP Server is installed (`pip install -e mcp-server/`)
- A collection already exists (e.g. `my_tasks`, with fields like name, status, priority, owner)

## Step 1: Create Menu and Page

```
nb_create_menu("Tasks", null, [["Task List", "UnorderedListOutlined"]])
```

Returns `{group_id: 1, "Task List": "tu_xxxxxx"}` — note the tab_uid.

## Step 2: Build the Page with XML Markup

```xml
<page collection="my_tasks">
  <filter fields="name,status,priority" target="tbl" />
  <table id="tbl" fields="name,status,priority,owner,createdAt">
    <addnew fields="name\nstatus\npriority\nowner\ndescription" />
    <edit fields="name\nstatus\npriority\nowner\ndescription" />
    <detail>
      <tab title="Overview" fields="name\nstatus\npriority\nowner\ndescription\ncreatedAt" />
    </detail>
  </table>
</page>
```

Call: `nb_page(tab_uid="tu_xxxxxx", markup=<the XML above>)`

## Step 3: Auto-generate JS (Optional)

```
nb_auto_js("Tasks", "/tmp/tasks-js/", "templates/js/")
```

Check the files under `/tmp/tasks-js/`, fill in anything marked with `[todo]`, then:

```
nb_inject_js_dir("/tmp/tasks-js/")
```

## Done

Refresh the browser to see the complete CRUD page: filters, table, add/edit forms, and detail popup.

## Going Further

- Add sidebar charts: use `<row>` + `<stack>` layout, see [crm-customers.xml](crm-customers.xml)
- Add KPI cards: use `<kpi title="Total" filter="thisMonth" />`
- Add workflows: see [references/phases/phase-5-workflows.md](../references/phases/phase-5-workflows.md)
- Add AI employees: see [references/phases/phase-6-ai.md](../references/phases/phase-6-ai.md)
