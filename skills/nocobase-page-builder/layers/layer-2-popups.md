---
title: "Layer 2: Popups & Detail Tabs"
description: "Enrich detail popups with multiple tabs, association subtables, and relation field click popups."
---

# Layer 2: Popups & Detail Tabs

## What this layer adds

Layer 1 gives you 3 basic popups. Layer 2 enriches them:
- Detail popup: add association subtable tabs (Contacts, Orders, Activities, etc.)
- Relation columns: clicking a customer name opens a customer detail popup
- Nested popups: subtable rows can open their own detail popups

## Typical Layer 2 gap (from page_gap.py)

```
Layer 2: Popups & Detail Tabs
  Current:   3 popups, 3 tabs
  Reference: 18 popups, 26 tabs
  ❌ Missing 15 popups
  ❌ Missing 23 detail tabs
```

## Adding association subtable tabs

After Layer 1 builds the page, add subtable tabs to the detail popup using `nb.sub_table()`:

```python
# 1. Find the detail popup's tab UIDs via inspect or export
print(nb.inspect_page("Customers"))

# 2. Find the detail popup's BlockGridModel for the Overview tab
# The detail structure is:
#   ChildPageModel → ChildPageTabModel → BlockGridModel → DetailsBlockModel

# 3. For each association, add a new tab with a subtable
# First, get the ChildPageModel uid from the click field
all_models = nb._list_all()

# Find ChildPageModel under the detail click action
detail_popups = [m for m in all_models if m.get("use") == "ChildPageModel"
                 and m.get("parentId") in [click_field_uid]]

# Add new tabs to the existing detail popup
for popup in detail_popups:
    # Find existing ChildPageTabModel
    tabs = [m for m in all_models if m.get("parentId") == popup["uid"]
            and m.get("use") == "ChildPageTabModel"]

    # Create a new tab for each association
    from nocobase_mcp.tree_builder import TreeNode
    for assoc_name, target_coll, fields in [
        ("contacts", "nb_crm_contacts", ["name", "phone", "email", "title", "is_primary"]),
        ("opportunities", "nb_crm_opportunities", ["title", "amount", "stage", "expected_close_date"]),
        ("follow_ups", "nb_crm_follow_ups", ["type", "content", "next_follow_date"]),
    ]:
        # Use nb.sub_table() to create a TableBlockModel inside a new tab
        tab_node = TreeNode("ChildPageTabModel", {
            "pageTabSettings": {"tab": {"title": assoc_name.replace("_", " ").title()}}
        }, len(tabs))

        # Save the tab under the popup
        nb.save("ChildPageTabModel", popup["uid"], "tabs", "array",
                tab_node.step_params, len(tabs))

        # Then create a BlockGridModel + TableBlockModel inside the tab
        # ... (use nb.table_block or nb.sub_table)
```

## Simpler approach: rebuild detail with more tabs

Instead of patching, rebuild the page with richer `<detail>`:

```xml
<detail>
  <tab title="Overview" fields="name|industry\\nstatus|level\\nphone|address\\ndescription" />
  <tab title="Contacts" assoc="contacts" collection="nb_crm_contacts"
       fields="name,phone,email,title,is_primary" />
  <tab title="Opportunities" assoc="opportunities" collection="nb_crm_opportunities"
       fields="title,amount,stage,expected_close_date" />
  <tab title="Follow-ups" assoc="follow_ups" collection="nb_crm_follow_ups"
       fields="type,content,createdAt" />
</detail>
```

Note: `<tab assoc="...">` currently creates a DetailsBlockModel, not a subtable. After `save_nested`, use `nb.remove_node()` to remove the empty DetailsBlockModel, then `nb.sub_table()` to create a proper TableBlockModel for each association tab.

## Adding relation column click popups

When a user clicks a relation field (e.g., "Customer" column in Opportunities table), it should open a popup showing that customer's details.

```python
# Find the relation column in the table
# Use nb.patch_column() or manually set the click behavior
col_uid = nb.locate_node("Opportunities", field="customer")

# Configure click → popup with customer detail
nb.update(col_uid, {
    "stepParams": {
        "tableColumnSettings": {
            "click": {
                "action": "popup",
                "popupSettings": {
                    "openView": {
                        "dataSourceKey": "main",
                        "collectionName": "nb_crm_customers",
                        "filterByTk": "{{ ctx.record.customer.id }}"
                    }
                }
            }
        }
    }
})
```

## When you're done with Layer 2

Run `page_gap.py` — Layer 2 is complete when:
- ✅ 10+ popups (matching reference)
- ✅ 5+ detail tabs per main entity (Overview + associations)
- ✅ Relation columns are clickable

Proceed to `layer-3-forms.md`.
