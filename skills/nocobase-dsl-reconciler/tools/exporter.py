"""Page exporter — extract complete page structure from live NocoBase.

Treats pages and popups identically (both are "surfaces" with tabs + blocks).
Exports everything needed for 1:1 replication:
  - Block structure (type, collection, title)
  - Fields with layout (row/col positions)
  - JS code → external files with desc from comments
  - Actions + recordActions
  - Popup references (uid-based, not inlined)
  - Resource bindings (filterByTk, association, etc.)

Usage:
    from exporter import export_page_surface
    spec = export_page_surface(nb, tab_uid, js_dir=Path("./js"))
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from nb import NocoBase, slugify, dump_yaml


_exported_popup_uids: set[str] = set()  # track exported popups to avoid circular refs


def export_page_surface(nb: NocoBase, tab_uid: str,
                        js_dir: Path = None,
                        page_key: str = "page") -> dict:
    """Export a complete page/popup surface.

    Returns a spec dict matching enhance.yaml popup format:
      {blocks: [...], layout: [...]}
    """
    data = nb.get(tabSchemaUid=tab_uid)
    tree = data.get("tree", {})
    grid = tree.get("subModels", {}).get("grid", {})

    return _export_grid(nb, grid, js_dir, page_key, reset_keys=True)


def export_all_popups(nb: NocoBase, popup_refs: list[dict],
                      js_dir: Path = None, popups_dir: Path = None,
                      prefix: str = "popup", depth: int = 0,
                      parent_path: str = "",
                      max_depth: int = 8) -> list[dict]:
    """Recursively export all popups to individual files.

    Traverses popup tree: page → detail popup → nested table → addNew popup → ...
    Stops when hitting an already-exported UID (prevents circular refs).

    File naming uses dot-separated paths:
      popups/name.yaml                      # L0
      popups/name.quotation_no.yaml         # L1
      popups/name.quotation_no.addnew.yaml  # L2

    Returns list of all exported popup specs.
    """
    global _exported_popup_uids
    if depth == 0:
        _exported_popup_uids = set()

    all_exported = []

    for p in popup_refs:
        field_uid = p.get("field_uid", "")
        field_name = p.get("field", "")

        # Skip already exported (prevents circular refs)
        if field_uid in _exported_popup_uids:
            continue
        _exported_popup_uids.add(field_uid)

        if depth >= max_depth:
            print(f"    ! max depth {max_depth} reached for {field_name}")
            continue

        # Export this popup
        popup_data = export_popup_surface(nb, field_uid, js_dir,
                                          f"{prefix}_{field_name}")
        if not popup_data:
            continue

        popup_data.pop("_state", None)
        for tab in popup_data.get("tabs", []):
            tab.pop("_state", None)

        popup_spec = {}
        # Preserve target if present (for top-level popups loaded by deploy)
        if p.get("target"):
            popup_spec["target"] = p["target"]
        popup_spec["field"] = field_name
        popup_spec["field_uid"] = field_uid
        if p.get("block_key"):
            popup_spec["block_key"] = p["block_key"]
        popup_spec.update(popup_data)
        all_exported.append(popup_spec)

        # Save to file — dot-separated path for nested popups
        # Include block_key to disambiguate (e.g., name.details_0.edit vs name.attachments.edit)
        if popups_dir:
            popups_dir.mkdir(parents=True, exist_ok=True)
            block_key = p.get("block_key", "")
            name_part = f"{block_key}.{field_name}" if block_key else field_name
            dot_path = f"{parent_path}.{name_part}" if parent_path else name_part
            fname = f"{dot_path}.yaml"
            from nb import dump_yaml
            (popups_dir / fname).write_text(dump_yaml(popup_spec))

        # Recursively find popups INSIDE this popup's blocks + tabs
        nested_refs = []
        # From block-level _popups
        for tab in popup_data.get("tabs", []):
            for block in tab.get("blocks", []):
                nested_refs.extend(block.pop("_popups", []))
            # Also from tab-level popups (column click + action popups)
            nested_refs.extend(tab.get("popups", []))
        if not popup_data.get("tabs"):
            for block in popup_data.get("blocks", []):
                nested_refs.extend(block.pop("_popups", []))
            nested_refs.extend(popup_data.get("popups", []))

        if nested_refs:
            child_path = f"{parent_path}.{field_name}" if parent_path else field_name
            nested = export_all_popups(
                nb, nested_refs, js_dir, popups_dir,
                prefix=f"{prefix}_{field_name}", depth=depth + 1,
                parent_path=child_path, max_depth=max_depth)
            all_exported.extend(nested)

    return all_exported


def export_popup_surface(nb: NocoBase, field_uid: str,
                         js_dir: Path = None,
                         popup_key: str = "popup") -> dict | None:
    """Export a popup surface from a field/action that has a ChildPageModel."""
    data = nb.get(uid=field_uid)
    tree = data.get("tree", {})
    popup = tree.get("subModels", {}).get("page", {})
    if not popup:
        return None

    # Popup mode
    mode = tree.get("stepParams", {}).get("popupSettings", {}).get("openView", {}).get("mode", "drawer")

    tabs = popup.get("subModels", {}).get("tabs", [])
    if not isinstance(tabs, list):
        tabs = [tabs] if tabs else []

    if len(tabs) <= 1:
        # Single tab — export as flat blocks
        if tabs:
            grid = tabs[0].get("subModels", {}).get("grid", {})
            result = _export_grid(nb, grid, js_dir, popup_key)
        else:
            result = {"blocks": []}
        result["mode"] = mode
        return result

    # Multi-tab
    result: dict[str, Any] = {"mode": mode, "tabs": []}
    for i, tab in enumerate(tabs):
        tab_title = (tab.get("props", {}).get("title")
                     or tab.get("stepParams", {}).get("pageTabSettings", {}).get("title", {}).get("title")
                     or f"Tab{i}")
        grid = tab.get("subModels", {}).get("grid", {})
        tab_spec = _export_grid(nb, grid, js_dir, f"{popup_key}_tab{i}")
        tab_spec["title"] = tab_title
        result["tabs"].append(tab_spec)

    return result


def _export_grid(nb: NocoBase, grid: dict, js_dir: Path = None,
                 prefix: str = "", reset_keys: bool = False,
                 used_keys: set = None) -> dict:
    """Export a BlockGridModel and its contents."""
    if not isinstance(grid, dict):
        return {"blocks": [], "layout": []}

    if used_keys is not None:
        _keys = used_keys
    elif reset_keys:
        _keys = set()
    else:
        _keys = set()

    grid_uid = grid.get("uid", "")
    items = grid.get("subModels", {}).get("items", [])
    if not isinstance(items, list):
        items = [items] if items else []

    blocks = []
    block_uid_to_key: dict[str, str] = {}
    popup_refs: list[dict] = []
    state_blocks: dict[str, Any] = {}

    for i, item in enumerate(items):
        block_spec, block_key, block_state = _export_block(nb, item, js_dir, prefix, i, _keys)
        if block_spec:
            blocks.append(block_spec)
            block_uid_to_key[item.get("uid", "")] = block_key
            state_blocks[block_key] = block_state

            # Collect popup references from fields
            popups = block_spec.pop("_popups", [])
            popup_refs.extend(popups)

    # Extract page-level layout
    layout = _export_layout(grid, block_uid_to_key)

    result: dict[str, Any] = {"blocks": blocks}
    if layout:
        result["layout"] = layout
    if popup_refs:
        result["popups"] = popup_refs
    # State: UID registry (separate from spec)
    result["_state"] = {"grid_uid": grid_uid, "blocks": state_blocks}

    return result


def _export_block(nb: NocoBase, item: dict, js_dir: Path = None,
                  prefix: str = "", index: int = 0,
                  used_keys: set = None) -> tuple[dict | None, str, dict]:
    """Export a single block node."""
    use = item.get("use", "")
    uid = item.get("uid", "")
    sp = item.get("stepParams", {})
    subs = item.get("subModels", {})

    type_map = {
        "TableBlockModel": "table",
        "FilterFormBlockModel": "filterForm",
        "CreateFormModel": "createForm",
        "EditFormModel": "editForm",
        "DetailsBlockModel": "details",
        "ListBlockModel": "list",
        "JSBlockModel": "jsBlock",
        "GridCardBlockModel": "gridCard",
        "ChartBlockModel": "chart",
        "MarkdownBlockModel": "markdown",
        "CommentsBlockModel": "comments",
        "RecordHistoryBlockModel": "recordHistory",
        "IframeBlockModel": "iframe",
        "ReferenceBlockModel": "reference",
    }

    btype = type_map.get(use)
    if not btype:
        return None, "", {}

    # Block title
    title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")

    # Generate semantic key: title > JS desc > type (no index for first of each type)
    if title:
        key = slugify(title)
    elif btype == "jsBlock":
        code = sp.get("jsSettings", {}).get("runJs", {}).get("code", "")
        desc = _extract_js_desc(code)
        key = slugify(desc) if desc else btype
    else:
        key = btype  # no _0 suffix — cleaner variable names

    # Deduplicate: first=table, second=table_2, third=table_3
    _keys = used_keys if used_keys is not None else set()
    if key in _keys:
        counter = 2
        while f"{key}_{counter}" in _keys:
            counter += 1
        key = f"{key}_{counter}"
    _keys.add(key)

    spec: dict[str, Any] = {"key": key, "type": btype}
    if title:
        spec["title"] = title

    # Collection + resource binding
    res = sp.get("resourceSettings", {}).get("init", {})
    coll = res.get("collectionName", "")
    if coll:
        spec["coll"] = coll
    # Full resource binding (for popup blocks)
    binding = {}
    if res.get("filterByTk"):
        binding["filterByTk"] = res["filterByTk"]
    if res.get("associationName"):
        binding["associationName"] = res["associationName"]
    if res.get("sourceId"):
        binding["sourceId"] = res["sourceId"]
    if binding:
        spec["resource_binding"] = binding

    # tableSettings: dataScope + pageSize (NocoBase stores these here, not resourceSettings)
    table_settings = sp.get("tableSettings", {})
    data_scope = table_settings.get("dataScope", {})
    if data_scope.get("filter"):
        spec["dataScope"] = data_scope["filter"]

    page_size_obj = table_settings.get("pageSize", {})
    page_size = page_size_obj.get("pageSize") if isinstance(page_size_obj, dict) else page_size_obj
    if page_size and page_size != 20:
        spec["pageSize"] = page_size

    # Default sort (can be in resourceSettings or tableSettings)
    data_sort = res.get("sort", []) or table_settings.get("sort", [])
    if data_sort:
        spec["sort"] = data_sort

    # ── Type-specific extraction ──
    popup_refs = []

    if btype == "jsBlock":
        code = sp.get("jsSettings", {}).get("runJs", {}).get("code", "")
        if code:
            desc = _extract_js_desc(code)
            if desc:
                spec["desc"] = desc
            if js_dir:
                fname = f"{prefix}_{key}.js" if prefix else f"{key}.js"
                (js_dir / fname).write_text(code)
                spec["file"] = f"./js/{fname}"

    elif btype == "chart":
        config = sp.get("chartSettings", {}).get("configure", {})
        if config and js_dir:
            chart_dir = js_dir.parent / "charts"
            chart_dir.mkdir(exist_ok=True)
            base = f"{prefix}_{key}" if prefix else key

            # Extract SQL and render JS into separate files
            sql = config.get("query", {}).get("sql", "")
            render_js = config.get("chart", {}).get("option", {}).get("raw", "")

            chart_spec: dict[str, Any] = {}
            if sql:
                sql_fname = f"{base}.sql"
                (chart_dir / sql_fname).write_text(sql)
                chart_spec["sql_file"] = f"./charts/{sql_fname}"
            if render_js:
                render_fname = f"{base}_render.js"
                (chart_dir / render_fname).write_text(render_js)
                chart_spec["render_file"] = f"./charts/{render_fname}"

            yaml_fname = f"{base}.yaml"
            (chart_dir / yaml_fname).write_text(dump_yaml(chart_spec))
            spec["chart_config"] = f"./charts/{yaml_fname}"

    elif btype == "table":
        fields, js_cols, field_popups = _export_table_contents(item, js_dir, prefix, key)
        if fields:
            spec["fields"] = fields
        if js_cols:
            spec["js_columns"] = js_cols
        popup_refs.extend(field_popups)

        # Actions
        actions = _export_actions(subs.get("actions", []), js_dir)
        if actions:
            spec["actions"] = actions
        rec_actions = _export_record_actions(subs)
        if rec_actions:
            spec["recordActions"] = rec_actions

        # Collect popups from actions (addNew, edit, record actions)
        _collect_action_popups(subs.get("actions", []), popup_refs, key)
        for col in subs.get("columns", []):
            if "TableActionsColumn" in col.get("use", ""):
                _collect_action_popups(col.get("subModels", {}).get("actions", []), popup_refs, key)

    elif btype in ("filterForm", "createForm", "editForm", "details"):
        grid = subs.get("grid", {})
        if isinstance(grid, dict):
            # Check for ReferenceFormGridModel (引用字段模式)
            if "ReferenceFormGrid" in grid.get("use", ""):
                grid_ref = grid.get("stepParams", {}).get("referenceSettings", {}).get("useTemplate", {})
                if grid_ref:
                    spec["field_template"] = {
                        "templateUid": grid_ref.get("templateUid", ""),
                        "templateName": grid_ref.get("templateName", ""),
                        "targetUid": grid_ref.get("targetUid", ""),
                        "mode": grid_ref.get("mode", "reference"),
                    }
                    # ReferenceFormGrid has no local fields — skip field extraction

            fields, js_items, layout, field_popups = _export_form_contents(
                grid, js_dir, prefix, key)

            # For filterForm: enrich fields with filterManager data (filterPaths, label)
            if btype == "filterForm" and fields:
                # Read filterManager from grid (top-level field, not stepParams)
                grid_uid_val = grid.get("uid", "")
                if grid_uid_val:
                    try:
                        from nb import NocoBase as _NB2
                        _nb2 = _NB2()
                        r = _nb2.s.get(f"{_nb2.base}/api/flowModels:get",
                                       params={"filterByTk": grid_uid_val}, timeout=30)
                        fm = r.json().get("data", {}).get("filterManager", [])

                        # Build filterId → paths map
                        filter_paths_map = {}
                        for entry in fm:
                            fid = entry.get("filterId", "")
                            paths = entry.get("filterPaths", [])
                            if fid and paths:
                                filter_paths_map[fid] = paths

                        # Match fields to filterManager entries
                        grid_items = grid.get("subModels", {}).get("items", [])
                        enriched = []
                        for fp in fields:
                            fp_name = fp if isinstance(fp, str) else fp
                            # Find FilterFormItem UID for this field
                            for gi in (grid_items if isinstance(grid_items, list) else []):
                                gi_fp = gi.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                                if gi_fp == fp_name:
                                    paths = filter_paths_map.get(gi.get("uid", ""), [])
                                    label = gi.get("stepParams", {}).get("filterFormItemSettings", {}).get("label", {}).get("label", "")
                                    if paths or label:
                                        entry = {"field": fp_name}
                                        if label:
                                            entry["label"] = label
                                        if paths:
                                            entry["filterPaths"] = paths
                                        enriched.append(entry)
                                    else:
                                        enriched.append(fp_name)
                                    break
                            else:
                                enriched.append(fp_name)
                        fields = enriched
                    except Exception:
                        pass

            if fields:
                spec["fields"] = fields
            if js_items:
                spec["js_items"] = js_items
            if layout:
                spec["field_layout"] = layout
            popup_refs.extend(field_popups)

        # Actions
        actions = _export_actions(subs.get("actions", []), js_dir)
        if actions:
            spec["actions"] = actions
        rec_actions = _export_actions(subs.get("recordActions", []), js_dir)
        if rec_actions:
            spec["recordActions"] = rec_actions

        # Collect popups from actions (edit actions may have custom popup)
        _collect_action_popups(subs.get("actions", []), popup_refs, key)
        _collect_action_popups(subs.get("recordActions", []), popup_refs, key)

    # ── Event Flows + Linkage Rules (all block types) ──
    if btype in ("createForm", "editForm", "details", "table", "list", "gridCard", "filterForm"):
        # Check block-level eventSettings
        event_settings = sp.get("eventSettings", {})

        # Also check grid-level eventSettings (linkageRules stored on FormGridModel)
        grid_sp = subs.get("grid", {}).get("stepParams", {}) if isinstance(subs.get("grid"), dict) else {}
        grid_es = grid_sp.get("eventSettings", {})
        if grid_es:
            event_settings = {**event_settings, **grid_es}

        if event_settings:
            linkage = event_settings.get("linkageRules", {})
            if linkage:
                spec["linkage_rules"] = linkage

        # Extract custom event flow JS from flowRegistry (on block or grid)
        flow_registry = item.get("flowRegistry", {}) or {}
        grid_fr = subs.get("grid", {}).get("flowRegistry", {}) if isinstance(subs.get("grid"), dict) else {}
        if grid_fr:
            flow_registry = {**flow_registry, **grid_fr}
        if flow_registry:
            for flow_key, flow_def in flow_registry.items():
                if not isinstance(flow_def, dict):
                    continue
                steps = flow_def.get("steps", {})
                for step_key, step_def in steps.items():
                    if not isinstance(step_def, dict):
                        continue
                    code = step_def.get("runJs", {}).get("code", "") or step_def.get("defaultParams", {}).get("code", "")
                    if code and js_dir:
                        fname = f"{prefix}_{key}_event_{flow_key}_{step_key}.js"
                        (js_dir / fname).write_text(code)
                        ef_entry: dict = {
                            "event": flow_def.get("on", "formValuesChange"),
                            "flow_key": flow_key,
                            "step_key": step_key,
                            "desc": step_def.get("title", flow_key),
                            "file": f"./js/{fname}",
                        }
                        spec.setdefault("event_flows", []).append(ef_entry)

    elif btype == "list":
        # List block — extract ListItem children (fields, JS items, actions)
        list_item = subs.get("item", {})
        if isinstance(list_item, dict) and list_item.get("use"):
            li_grid = list_item.get("subModels", {}).get("grid", {})
            if isinstance(li_grid, dict):
                li_fields, li_js, li_layout, li_popups = _export_form_contents(
                    li_grid, js_dir, prefix, key)
                if li_fields:
                    spec["item_fields"] = li_fields
                if li_js:
                    spec["item_js"] = li_js
                if li_layout:
                    spec["item_layout"] = li_layout
                popup_refs.extend(li_popups)

            # ListItem actions (e.g., EditAction with popup)
            li_actions = _export_actions(list_item.get("subModels", {}).get("actions", []), js_dir)
            if li_actions:
                spec["item_actions"] = li_actions
            # Collect popup refs from list item actions
            _collect_action_popups(list_item.get("subModels", {}).get("actions", []), popup_refs, key)

        # Block-level actions
        actions = _export_actions(subs.get("actions", []), js_dir)
        if actions:
            spec["actions"] = actions

    elif btype == "reference":
        # ReferenceBlock — references a template
        # Export: template reference (for systems that have it)
        #       + template content fallback (for systems that don't)
        ref_settings = sp.get("referenceSettings", {})
        use_template = ref_settings.get("useTemplate", {})
        if use_template:
            template_uid = use_template.get("templateUid", "")
            template_name = use_template.get("templateName", "")
            target_uid = use_template.get("targetUid", ref_settings.get("target", {}).get("targetUid", ""))
            spec["template_uid"] = template_uid
            spec["template_name"] = template_name
            spec["reference_mode"] = use_template.get("mode", "reference")

            # Export template content as fallback
            if target_uid and js_dir:
                try:
                    from nb import NocoBase as _NB
                    _nb = _NB()
                    target_data = _nb.get(uid=target_uid)
                    target_tree = target_data.get("tree", {})
                    # Recursively export the template's block content
                    tpl_spec, tpl_key, _ = _export_block(
                        _nb, target_tree, js_dir, f"{prefix}_tpl", 0, used_keys or set())
                    if tpl_spec:
                        spec["template_content"] = tpl_spec
                except Exception:
                    pass  # template content export best-effort

    elif btype == "comments":
        # Comments block — preserve association binding
        # Actions
        actions = _export_actions(subs.get("actions", []), js_dir)
        if actions:
            spec["actions"] = actions

    elif btype == "recordHistory":
        # RecordHistory block — export actions (filter, refresh, expand, collapse)
        actions = _export_actions(subs.get("actions", []), js_dir)
        if actions:
            spec["actions"] = actions

    if popup_refs:
        spec["_popups"] = popup_refs

    # Build state for this block
    block_state: dict[str, Any] = {"uid": uid, "type": btype}
    if title:
        block_state["title"] = title

    return spec, key, block_state


# ── Table contents ────────────────────────────────────────────────

def _export_table_contents(item: dict, js_dir: Path = None,
                            prefix: str = "", block_key: str = ""
                            ) -> tuple[list, list, list]:
    """Extract fields, JS columns, and popup refs from table."""
    fields = []
    js_cols = []
    popup_refs = []

    columns = item.get("subModels", {}).get("columns", [])
    if not isinstance(columns, list):
        return fields, js_cols, popup_refs

    for col in columns:
        col_use = col.get("use", "")

        if col_use == "JSColumnModel":
            code = col.get("stepParams", {}).get("jsSettings", {}).get("runJs", {}).get("code", "")
            col_title = col.get("stepParams", {}).get("tableColumnSettings", {}).get("title", {}).get("title", "")
            desc = _extract_js_desc(code) if code else ""
            entry: dict[str, Any] = {}
            if col_title:
                entry["title"] = col_title
            if desc:
                entry["desc"] = desc
            if code and js_dir:
                safe = slugify(col_title or desc or f"col_{len(js_cols)}")
                fname = f"{prefix}_{block_key}_col_{safe}.js"
                (js_dir / fname).write_text(code)
                entry["file"] = f"./js/{fname}"
            js_cols.append(entry)

        elif col_use == "TableActionsColumnModel":
            continue  # handled by _export_record_actions

        else:
            fp = col.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp:
                fields.append(fp)

            # Check for popup on this column's display field
            field = col.get("subModels", {}).get("field", {})
            if isinstance(field, dict):
                popup_page = field.get("subModels", {}).get("page", {})
                if popup_page and popup_page.get("uid"):
                    ov = field.get("stepParams", {}).get("popupSettings", {}).get("openView", {})
                    popup_refs.append({
                        "field": fp,
                        "field_uid": field.get("uid", ""),
                        "mode": ov.get("mode", "drawer"),
                        "popup_page_uid": popup_page.get("uid", ""),
                    })

    return fields, js_cols, popup_refs


# ── Form/Detail/Filter contents ──────────────────────────────────

def _export_form_contents(grid: dict, js_dir: Path = None,
                           prefix: str = "", block_key: str = ""
                           ) -> tuple[list, list, list | None, list]:
    """Extract fields, JS items, layout, and popup refs from a form/detail grid."""
    fields = []
    js_items = []
    popup_refs = []

    grid_uid = grid.get("uid", "")
    items = grid.get("subModels", {}).get("items", [])
    if not isinstance(items, list):
        return fields, js_items, None, popup_refs

    # Build uid → name map for layout
    uid_to_name: dict[str, str] = {}

    for di in items:
        di_use = di.get("use", "")
        di_uid = di.get("uid", "")

        if "JSItem" in di_use:
            code = di.get("stepParams", {}).get("jsSettings", {}).get("runJs", {}).get("code", "")
            desc = _extract_js_desc(code) if code else ""
            entry: dict[str, Any] = {}
            if desc:
                entry["desc"] = desc
            js_name = slugify(desc) if desc else f"js_{len(js_items)}"
            if code and js_dir:
                fname = f"{prefix}_{block_key}_{js_name}.js"
                (js_dir / fname).write_text(code)
                entry["file"] = f"./js/{fname}"
            js_items.append(entry)
            # Full desc in layout reference (not truncated)
            uid_to_name[di_uid] = f"[JS:{desc}]" if desc else "[JS]"

        elif "DividerItem" in di_use or "MarkdownItem" in di_use:
            label = di.get("stepParams", {}).get("markdownItemSetting", {}).get("title", {}).get("label", "")
            uid_to_name[di_uid] = f"--- {label} ---" if label else "---"

        else:
            fp = di.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp:
                fields.append(fp)
                uid_to_name[di_uid] = fp

                # Check if this field item has a click-to-open popup
                field_sub = di.get("subModels", {}).get("field", {})
                if isinstance(field_sub, dict):
                    popup_page = field_sub.get("subModels", {}).get("page", {})
                    if popup_page and popup_page.get("uid"):
                        popup_refs.append({
                            "field": fp,
                            "field_uid": field_sub.get("uid", di_uid),
                            "popup_page_uid": popup_page.get("uid", ""),
                        })

    # Extract layout from gridSettings
    layout = _extract_layout(grid, uid_to_name)

    return fields, js_items, layout, popup_refs


# ── Layout extraction ─────────────────────────────────────────────

def _extract_layout(grid: dict, uid_to_name: dict[str, str]) -> list | None:
    """Convert gridSettings.rows back to layout DSL."""
    gs = grid.get("stepParams", {}).get("gridSettings", {}).get("grid", {})
    rows = gs.get("rows", {})
    sizes = gs.get("sizes", {})
    row_order = gs.get("rowOrder", list(rows.keys()))

    if not rows:
        return None

    layout = []
    for rk in row_order:
        cols = rows.get(rk, [])
        sz = sizes.get(rk, [])
        n_cols = len(cols)

        # Check if all cols are single item and equal size → simple row
        all_single = all(len(col) == 1 for col in cols)
        equal_size = len(set(sz)) <= 1 if sz else True
        default_size = 24 // n_cols if n_cols else 24

        if n_cols == 1 and len(cols[0]) == 1:
            # Single item row
            name = uid_to_name.get(cols[0][0], cols[0][0][:8])
            if name.startswith("--- "):
                layout.append(name)  # divider
            else:
                layout.append([name])

        elif all_single and equal_size and all(s == default_size for s in sz):
            # Simple equal-width row
            names = [uid_to_name.get(col[0], col[0][:8]) for col in cols]
            layout.append(names)

        else:
            # Complex row (different sizes or stacked items)
            row_items = []
            for j, col in enumerate(cols):
                s = sz[j] if j < len(sz) else default_size
                names = [uid_to_name.get(u, u[:8]) for u in col]

                if len(names) == 1:
                    if s == default_size and equal_size:
                        row_items.append(names[0])
                    else:
                        row_items.append({names[0]: s})
                else:
                    # Stacked column
                    row_items.append({"col": names, "size": s})

            layout.append(row_items)

    return layout if layout else None


def _export_layout(grid: dict, uid_to_key: dict[str, str]) -> list | None:
    """Export page-level block layout."""
    return _extract_layout(grid, uid_to_key)


# ── Actions ───────────────────────────────────────────────────────

ACTION_MAP = {
    "FilterActionModel": "filter",
    "RefreshActionModel": "refresh",
    "AddNewActionModel": "addNew",
    "EditActionModel": "edit",
    "ViewActionModel": "view",
    "DeleteActionModel": "delete",
    "BulkDeleteActionModel": "bulkDelete",
    "ExportActionModel": "export",
    "ImportActionModel": "import",
    "LinkActionModel": "link",
    "FormSubmitActionModel": "submit",
    "FilterFormCollapseActionModel": "collapse",
    "FilterFormSubmitActionModel": "submit",
    "FilterFormResetActionModel": "reset",
    "PopupCollectionActionModel": "popup",
    "ExpandCollapseActionModel": "expandCollapse",
    "UpdateRecordActionModel": "updateRecord",
    "DuplicateActionModel": "duplicate",
    "CollectionTriggerWorkflowActionModel": "workflowTrigger",
    "AIEmployeeButtonModel": "ai",
    "RecordHistoryExpandActionModel": "historyExpand",
    "RecordHistoryCollapseActionModel": "historyCollapse",
}


def _collect_action_popups(actions, popup_refs: list, block_key: str = ""):
    """Scan actions for ChildPage popups (addNew, edit, view, etc.)."""
    if not isinstance(actions, list):
        return
    for act in actions:
        popup_page = act.get("subModels", {}).get("page", {})
        if popup_page and popup_page.get("uid"):
            act_use = act.get("use", "").replace("Model", "")
            ref: dict = {
                "field": act_use.lower().replace("action", ""),
                "field_uid": act.get("uid", ""),
                "popup_page_uid": popup_page.get("uid", ""),
            }
            if block_key:
                ref["block_key"] = block_key
            popup_refs.append(ref)


def _export_actions(actions, js_dir: Path = None) -> list:
    """Export actions. Simple actions → string, complex (with config) → dict."""
    if not isinstance(actions, list):
        return []
    # Actions that need stepParams preserved
    _COMPLEX_ACTIONS = {"AIEmployeeButtonModel", "CollectionTriggerWorkflowActionModel",
                        "PopupCollectionActionModel", "UpdateRecordActionModel"}
    result = []
    for act in actions:
        use = act.get("use", "")
        if "TableActionsColumn" in use:
            continue
        semantic = ACTION_MAP.get(use, use.replace("Model", ""))
        if use in _COMPLEX_ACTIONS:
            sp = act.get("stepParams", {})
            props = act.get("props", {})
            if use == "AIEmployeeButtonModel" and props.get("aiEmployee") and js_dir:
                # AI button → export as shorthand + tasks file
                employee = props.get("aiEmployee", {}).get("username", "")
                tasks = sp.get("shortcutSettings", {}).get("editTasks", {}).get("tasks", [])
                if tasks:
                    ai_dir = js_dir.parent / "ai"
                    ai_dir.mkdir(exist_ok=True)
                    # Write tasks file
                    block_key_slug = act.get("parentId", "table")[-8:]
                    tasks_fname = f"{block_key_slug}_tasks.yaml"
                    export_tasks = []
                    for ti, t in enumerate(tasks):
                        msg = t.get("message", {})
                        system_text = msg.get("system", "")
                        task_entry: dict = {
                            "title": t.get("title", f"Task {ti}"),
                            "user": msg.get("user", ""),
                            "autoSend": t.get("autoSend", True),
                        }
                        if system_text:
                            prompt_fname = f"{block_key_slug}_task{ti}.md"
                            (ai_dir / prompt_fname).write_text(system_text)
                            task_entry["system_file"] = f"./ai/{prompt_fname}"
                        export_tasks.append(task_entry)
                    from nb import dump_yaml
                    (ai_dir / tasks_fname).write_text(dump_yaml({"tasks": export_tasks}))
                    result.append({
                        "type": "ai",
                        "employee": employee,
                        "tasks_file": f"./ai/{tasks_fname}",
                    })
                else:
                    result.append({"type": semantic, "employee": employee})
            elif sp or props:
                entry = {"type": semantic}
                if sp:
                    entry["stepParams"] = sp
                if props:
                    entry["props"] = props
                result.append(entry)
            else:
                result.append(semantic)
        else:
            result.append(semantic)
    return result


def _export_record_actions(subs: dict) -> list[str]:
    for col in subs.get("columns", []):
        if "TableActionsColumn" in col.get("use", ""):
            acts = col.get("subModels", {}).get("actions", [])
            return _export_actions(acts)
    return []


# ── Helpers ───────────────────────────────────────────────────────

def _extract_js_desc(code: str) -> str:
    """Extract description from JS code comment header."""
    for line in code.split("\n"):
        line = line.strip()
        if line.startswith("*") and len(line) > 3 and not line.startswith("*/"):
            desc = line.lstrip("* ").strip()
            if desc and not desc.startswith("@") and not desc.startswith("Table:"):
                return desc
    return ""




# ══════════════════════════════════════════════════════════════════
#  CLI
# ══════════════════════════════════════════════════════════════════

def _export_tab_surface(nb, tab_uid, js_dir, prefix, page_key, coll):
    """Export one tab surface and return (result, popup_refs, coll)."""
    result = export_page_surface(nb, tab_uid, js_dir, prefix)
    if not result:
        return None, [], coll

    popup_refs = list(result.get("popups", []))
    for b in result.get("blocks", []):
        popup_refs.extend(b.pop("_popups", []))
        tpl = b.get("template_content", {})
        if isinstance(tpl, dict):
            popup_refs.extend(tpl.pop("_popups", []))
        if b.get("type") == "reference" and b.get("template_content"):
            idx = result["blocks"].index(b)
            tpl = b["template_content"]
            tpl["key"] = tpl.get("key", "table")
            result["blocks"][idx] = tpl
        if b.get("type") == "filterForm" and not b.get("coll") and coll:
            b["coll"] = coll

    for p in popup_refs:
        field = p.get("field", "")
        bk = p.get("block_key", "")
        block_ref = bk or "table"
        if field == "addnew":
            p["target"] = f"${page_key}.{block_ref}.actions.addNew"
        elif field:
            p["target"] = f"${page_key}.{block_ref}.fields.{field}"

    if not coll:
        for b in result.get("blocks", []):
            if b.get("type") == "table" and b.get("coll"):
                coll = b["coll"]
                break

    # Fix layout
    layout = result.get("layout", [])
    def fix_layout(item):
        if isinstance(item, str) and "reference" in item:
            return "table"
        elif isinstance(item, list):
            return [fix_layout(i) for i in item]
        elif isinstance(item, dict):
            return {k: fix_layout(v) for k, v in item.items()}
        return item
    result["layout"] = fix_layout(layout)

    return result, popup_refs, coll


def export_module(page_title: str, out_dir: str, group_name: str = None,
                  tab_index: int = 0, coll: str = ""):
    """Export a page (all tabs) as a deployable module."""
    nb = NocoBase()
    mod = Path(out_dir)
    mod.mkdir(parents=True, exist_ok=True)
    js_dir = mod / "js"; js_dir.mkdir(exist_ok=True)
    popups_dir = mod / "popups"; popups_dir.mkdir(exist_ok=True)

    # Find page in routes
    page_route = None
    for r in nb.routes():
        for c in r.get("children", []):
            if c.get("title") == page_title:
                page_route = c
                break
            # Also check sub-groups
            if c.get("type") == "group":
                for sc in c.get("children", []):
                    if sc.get("title") == page_title:
                        page_route = sc
                        break
        if page_route:
            break

    if not page_route:
        print(f"  Page '{page_title}' not found")
        return

    page_key = slugify(page_title) + "_copy"
    tabs = page_route.get("children", [])
    all_popup_refs = []

    if len(tabs) <= 1:
        # Single tab — flat page
        tab_uid = tabs[0].get("schemaUid") if tabs else page_route.get("schemaUid")
        if not tab_uid:
            return
        result, popup_refs, coll = _export_tab_surface(
            nb, tab_uid, js_dir, slugify(page_title), page_key, coll)
        if not result:
            return
        all_popup_refs = popup_refs
        page_spec = {k: v for k, v in result.items() if k not in ("_state", "popups")}
    else:
        # Multi-tab — export each tab
        tab_specs = []
        for i, tab in enumerate(tabs):
            tab_uid = tab.get("schemaUid", "")
            tab_title = tab.get("title", f"Tab{i}")
            if not tab_uid:
                continue
            result, popup_refs, coll = _export_tab_surface(
                nb, tab_uid, js_dir, f"{slugify(page_title)}_{slugify(tab_title)}",
                page_key, coll)
            if not result:
                tab_specs.append({"title": tab_title, "blocks": []})
                continue
            all_popup_refs.extend(popup_refs)
            tab_spec = {"title": tab_title}
            tab_spec.update({k: v for k, v in result.items() if k not in ("_state", "popups")})
            tab_specs.append(tab_spec)

        page_spec = {"tabs": tab_specs}

    # Save structure.yaml
    spec = {"module": page_title + " Copy", "icon": "fundoutlined"}
    if group_name:
        spec["group"] = group_name
    spec["pages"] = [{
        "page": page_title + " Copy", "coll": coll, "icon": "fundoutlined",
        **page_spec,
    }]
    (mod / "structure.yaml").write_text(dump_yaml(spec))

    # Export popups
    n_popups = 0
    if all_popup_refs:
        exported = export_all_popups(nb, all_popup_refs, js_dir, popups_dir,
                                      prefix=f"popup_{slugify(page_title)}")
        n_popups = len(exported)

    n_tabs = len(tabs) if len(tabs) > 1 else 0
    blocks_count = sum(len(t.get("blocks", [])) for t in page_spec.get("tabs", [page_spec]))
    tab_info = f" ({n_tabs} tabs)" if n_tabs else ""
    print(f"  Exported: {page_title} → {out_dir}/")
    print(f"    {blocks_count} blocks, {n_popups} popups{tab_info}")


def export_all_pages(out_dir: str, group_filter: str = None):
    """Export ALL pages from the system, including sub-groups."""
    nb = NocoBase()
    routes = nb.routes()

    for r in routes:
        group_title = r.get("title", "")
        if group_filter and group_title != group_filter:
            continue
        children = r.get("children", [])
        if not children:
            continue

        group_copy = group_title + " Copy"
        print(f"\n{group_title}:")

        for c in children:
            c_title = c.get("title", "")
            if not c_title:
                continue

            if c.get("type") == "group":
                # Sub-group: export each child page with sub-group name
                sub_group_copy = c_title + " Copy"
                print(f"  {c_title} (sub-group):")
                for sc in c.get("children", []):
                    sc_title = sc.get("title", "")
                    if not sc_title:
                        continue
                    mod_dir = f"{out_dir}/{slugify(c_title)}/{slugify(sc_title)}"
                    export_module(sc_title, mod_dir,
                                  group_name=f"{group_copy}/{sub_group_copy}")
            else:
                mod_dir = f"{out_dir}/{slugify(c_title)}"
                export_module(c_title, mod_dir, group_name=group_copy)


if __name__ == "__main__":
    import sys

    usage = """Usage:
    python exporter.py <page_title> <out_dir>              # export one page
    python exporter.py <page_title> <out_dir> --group "Main Copy"  # with group
    python exporter.py --all <out_dir>                     # export all pages
    python exporter.py --all <out_dir> --group "Main"      # export one group
"""
    if len(sys.argv) < 3:
        print(usage)
        sys.exit(1)

    if sys.argv[1] == "--all":
        out_dir = sys.argv[2]
        group = None
        if "--group" in sys.argv:
            gi = sys.argv.index("--group")
            group = sys.argv[gi + 1]
        export_all_pages(out_dir, group)
    else:
        page_title = sys.argv[1]
        out_dir = sys.argv[2]
        group = None
        tab = 0
        if "--group" in sys.argv:
            gi = sys.argv.index("--group")
            group = sys.argv[gi + 1]
        if "--tab" in sys.argv:
            ti = sys.argv.index("--tab")
            tab = int(sys.argv[ti + 1])
        export_module(page_title, out_dir, group_name=group, tab_index=tab)
