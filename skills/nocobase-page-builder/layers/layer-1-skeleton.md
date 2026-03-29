---
title: "Layer 1: Page Skeleton"
description: "Filter + table + basic addnew/edit/detail popup. The foundation every page needs."
---

# Layer 1: Page Skeleton

## What this layer builds

Every page starts here. One XML markup call creates:
- Filter bar (with optional stats badges)
- Data table (with columns matching collection fields)
- AddNew popup (with sectioned form)
- Edit popup (with sectioned form)
- Detail popup (with overview tab)
- Optional sidebar (JS blocks for charts)

## When you're done with Layer 1

Run `page_gap.py` — Layer 1 is complete when:
- ✅ FilterFormBlockModel exists
- ✅ TableBlockModel exists
- ✅ 3 popups (addnew, edit, detail)
- ✅ 2-3 forms (create, edit)
- ✅ 1+ detail tabs

## XML markup pattern

```xml
<page collection="my_collection">
  <filter fields="name,status,category" target="tbl" stats="status" />
  <row>
    <table id="tbl" span="17" fields="name,status,category,amount,owner,createdAt">
      <js-col type="composite" field="name" title="Name">Bold name, gray category</js-col>
      <js-col type="currency" field="amount" title="Amount">¥ format, red >100K</js-col>
      <addnew>
        <section title="Basic Info">
          <row><field name="name" required="true" /><field name="category" /></row>
          <row><field name="status" /><field name="amount" /></row>
        </section>
        <section title="Details">
          <row><field name="owner" /><field name="phone" /></row>
          <field name="description" />
        </section>
      </addnew>
      <edit>
        <!-- Same sections as addnew, adjust fields as needed -->
        <section title="Basic Info">
          <row><field name="name" required="true" /><field name="category" /></row>
          <row><field name="status" /><field name="amount" /></row>
        </section>
        <section title="Details">
          <row><field name="owner" /><field name="phone" /></row>
          <field name="description" />
        </section>
      </edit>
      <detail>
        <tab title="Overview" fields="name|category\\nstatus|amount\\nowner|phone\\ndescription" />
      </detail>
    </table>
    <stack span="7">
      <js-block title="By Status">Donut chart by status field</js-block>
      <js-block title="By Category">Bar chart by category</js-block>
    </stack>
  </row>
</page>
```

## Python execution

```python
from nocobase_mcp.client import NB
from nocobase_mcp.markup_parser import PageMarkupParser

nb = NB(base_url="http://localhost:14206")
parser = PageMarkupParser(nb)

nb.clean_tab(tab_uid)
root, meta = parser.parse(tab_uid, markup)
nb.save_nested(root, tab_uid, filter_manager=meta.get("_filter_manager"))
```

## After Layer 1

Run `page_gap.py` to see Layer 2+ gaps, then proceed to `layer-2-popups.md`.
