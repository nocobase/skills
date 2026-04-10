"""Sync — pull latest state from NocoBase back to spec files.

Reads state.yaml (key→UID mapping) → fetches each block's current state
→ updates structure.yaml + enhance.yaml with latest fields, JS code, layout.

This captures user's manual changes (added fields, modified JS, reordered layout).

Usage:
    python sync.py erp/              # sync all pages
    python sync.py erp/ --page 物料管理  # sync one page
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import yaml
from nb import NocoBase, dump_yaml, slugify
from exporter import (
    export_page_surface, export_popup_surface,
    _export_block, _export_layout, _extract_js_desc,
)


def sync(mod_dir: str, page_filter: str = None):
    mod = Path(mod_dir)
    state_file = mod / "state.yaml"
    if not state_file.exists():
        print("  No state.yaml — run deployer.py first")
        return

    state = yaml.safe_load(state_file.read_text())
    structure = yaml.safe_load((mod / "structure.yaml").read_text())
    enhance = {}
    if (mod / "enhance.yaml").exists():
        enhance = yaml.safe_load((mod / "enhance.yaml").read_text()) or {}

    nb = NocoBase()
    print(f"  Connected to {nb.base}")

    js_dir = mod / "js"
    js_dir.mkdir(exist_ok=True)

    # Sync each page
    for page_spec in structure.get("pages", []):
        title = page_spec.get("page", "")
        if page_filter and page_filter not in title:
            continue

        page_key = slugify(title)
        page_state = state.get("pages", {}).get(page_key, {})
        tab_uid = page_state.get("tab_uid", "")

        if not tab_uid:
            print(f"  ! {title}: no tab_uid in state")
            continue

        # Use English-safe prefix for JS file naming
        # page_key from _slugify may contain Chinese — use index-based prefix
        safe_prefix = f"page{structure['pages'].index(page_spec)}"
        for bkey in page_state.get("blocks", {}):
            if "table" in bkey:
                safe_prefix = page_state["blocks"][bkey].get("uid", safe_prefix)[:6]
                break

        print(f"  ~ {title}")
        _sync_page(nb, tab_uid, page_spec, page_state, mod, js_dir, page_key)

    # Sync popups
    for popup_spec in enhance.get("popups", []):
        target = popup_spec.get("target", "")
        if page_filter and page_filter not in target:
            continue

        _sync_popup(nb, popup_spec, state, mod, js_dir)

    # Write back
    (mod / "structure.yaml").write_text(dump_yaml(structure))
    if enhance:
        (mod / "enhance.yaml").write_text(dump_yaml(enhance))
    state_file.write_text(dump_yaml(state))

    # Auto-split: detail popups → popups/*.yaml
    from split_popups import split_popups
    split_popups(mod_dir)

    print(f"\n  Synced. Files updated.")


def _sync_page(nb: NocoBase, tab_uid: str, page_spec: dict,
               page_state: dict, mod: Path, js_dir: Path, page_key: str):
    """Sync one page — read live blocks, update spec + state."""
    try:
        data = nb.get(tabSchemaUid=tab_uid)
    except Exception as e:
        try:
            data = nb.get(uid=tab_uid)
        except Exception as e:
            return

    tree = data.get("tree", {})
    grid = tree.get("subModels", {}).get("grid", {})
    if not isinstance(grid, dict):
        return

    grid_uid = grid.get("uid", "")
    items = grid.get("subModels", {}).get("items", [])
    if not isinstance(items, list):
        return

    page_state["grid_uid"] = grid_uid
    blocks_state = page_state.get("blocks", {})
    spec_blocks = page_spec.get("blocks", [])

    # Build UID → spec_index mapping from state
    uid_to_spec: dict[str, int] = {}
    for i, bs in enumerate(spec_blocks):
        key = bs.get("key", "")
        if key in blocks_state and blocks_state[key].get("uid"):
            uid_to_spec[blocks_state[key]["uid"]] = i

    # Sync each live block
    for item in items:
        item_uid = item.get("uid", "")
        use = item.get("use", "").replace("Model", "")

        if item_uid in uid_to_spec:
            # Known block — update spec
            spec_idx = uid_to_spec[item_uid]
            _sync_block(nb, item, spec_blocks[spec_idx], blocks_state, mod, js_dir, page_key)
        else:
            # New block (user added manually) — add to spec
            _discover_keys = set(bs.get("key", "") for bs in spec_blocks)
            new_spec, new_key, new_state = _export_block(nb, item, js_dir, page_key, len(spec_blocks), _discover_keys)
            if new_spec:
                spec_blocks.append(new_spec)
                blocks_state[new_key] = new_state
                print(f"    + discovered: {new_key} ({use})")

    # Update layout from live
    uid_to_key = {}
    for key, bstate in blocks_state.items():
        if bstate.get("uid"):
            uid_to_key[bstate["uid"]] = key
    layout = _export_layout(grid, uid_to_key)
    if layout:
        page_spec["layout"] = layout

    page_state["blocks"] = blocks_state


def _sync_block(nb: NocoBase, live_item: dict, spec: dict,
                blocks_state: dict, mod: Path, js_dir: Path, prefix: str):
    """Sync one block — update fields, JS code, actions from live state."""
    key = spec.get("key", "")
    btype = spec.get("type", "")
    item_uid = live_item.get("uid", "")
    sp = live_item.get("stepParams", {})
    subs = live_item.get("subModels", {})

    block_state = blocks_state.get(key, {})

    # Sync title
    title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
    if title:
        spec["title"] = title
    elif "title" in spec and not title:
        del spec["title"]

    # Sync fields (table columns / form items)
    if btype == "table":
        _sync_table_fields(live_item, spec, block_state, mod, js_dir, prefix, key)
    elif btype in ("filterForm", "details", "createForm", "editForm"):
        _sync_form_fields(live_item, spec, block_state, mod, js_dir, prefix, key)

        # Sync event flows + linkage rules
        if btype in ("createForm", "editForm"):
            event_settings = sp.get("eventSettings", {})
            if event_settings.get("linkageRules"):
                spec["linkage_rules"] = event_settings["linkageRules"]

            flow_registry = live_item.get("flowRegistry", {})
            if flow_registry:
                event_flows = []
                for flow_key, flow_def in flow_registry.items():
                    if not isinstance(flow_def, dict):
                        continue
                    steps = flow_def.get("steps", {})
                    for step_key, step_def in steps.items():
                        if not isinstance(step_def, dict):
                            continue
                        code = step_def.get("runJs", {}).get("code", "")
                        if code:
                            fname = f"{prefix}_{key}_event_{flow_key}_{step_key}.js"
                            (js_dir / fname).write_text(code)
                            event_flows.append({
                                "event": flow_def.get("on", "formValuesChange"),
                                "flow_key": flow_key,
                                "step_key": step_key,
                                "desc": step_def.get("title", flow_key),
                                "file": f"./js/{fname}",
                            })
                if event_flows:
                    spec["event_flows"] = event_flows

    elif btype == "jsBlock":
        code = sp.get("jsSettings", {}).get("runJs", {}).get("code", "")
        if code:
            js_file = spec.get("file", "")
            if js_file:
                (mod / js_file).write_text(code)
            desc = _extract_js_desc(code)
            if desc:
                spec["desc"] = desc


def _sync_table_fields(item: dict, spec: dict, block_state: dict,
                       mod: Path, js_dir: Path, prefix: str, block_key: str):
    """Sync table columns back to spec.

    Key rule: existing file paths in spec are preserved.
    Only generates new paths for newly discovered JS columns.
    """
    cols = item.get("subModels", {}).get("columns", [])
    if not isinstance(cols, list):
        return

    # Index existing spec JS columns by title for file path lookup
    existing_jscol_files = {jc.get("title", ""): jc.get("file", "")
                            for jc in spec.get("js_columns", [])}

    fields = []
    js_columns = []
    js_col_state = {}

    for col in cols:
        col_use = col.get("use", "")
        col_uid = col.get("uid", "")

        if col_use == "JSColumnModel":
            col_title = col.get("stepParams", {}).get("tableColumnSettings", {}).get("title", {}).get("title", "")
            code = col.get("stepParams", {}).get("jsSettings", {}).get("runJs", {}).get("code", "")
            desc = _extract_js_desc(code) if code else ""

            entry: dict[str, Any] = {}
            if col_title:
                entry["title"] = col_title
            if desc:
                entry["desc"] = desc

            # Use existing file path from spec, fallback to block_key-based name
            file_ref = existing_jscol_files.get(col_title, "")
            if not file_ref:
                safe = slugify(col_title or desc or f"col_{len(js_columns)}")
                file_ref = f"./js/{block_key}_col_{safe}.js"

            if code:
                fname = file_ref.replace("./js/", "")
                (js_dir / fname).write_text(code)
                entry["file"] = file_ref

            js_columns.append(entry)
            js_col_state[col_title] = {"uid": col_uid}

        elif col_use == "TableActionsColumnModel":
            continue
        else:
            fp = col.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp:
                fields.append(fp)

    if fields:
        spec["fields"] = fields
    if js_columns:
        spec["js_columns"] = js_columns
    block_state["js_columns"] = js_col_state


def _sync_form_fields(item: dict, spec: dict, block_state: dict,
                      mod: Path, js_dir: Path, prefix: str, block_key: str):
    """Sync form/detail/filter fields + JS items back to spec."""
    grid = item.get("subModels", {}).get("grid", {})
    if not isinstance(grid, dict):
        return

    grid_uid = grid.get("uid", "")
    block_state["grid_uid"] = grid_uid

    items = grid.get("subModels", {}).get("items", [])
    if not isinstance(items, list):
        return

    fields = []
    js_items = []
    js_item_state = {}
    uid_to_name: dict[str, str] = {}

    for di in items:
        di_use = di.get("use", "")
        di_uid = di.get("uid", "")
        di_sp = di.get("stepParams", {})

        if "JSItem" in di_use:
            code = di_sp.get("jsSettings", {}).get("runJs", {}).get("code", "")
            desc = _extract_js_desc(code) if code else ""

            entry: dict[str, Any] = {}
            if desc:
                entry["desc"] = desc

            # Use existing file path from spec (match by desc or index)
            file_ref = ""
            spec_js = spec.get("js_items", [])
            # Match by desc
            for ji in spec_js:
                if ji.get("desc") == desc and desc:
                    file_ref = ji.get("file", "")
                    break
            # Fallback: match by index
            if not file_ref and len(js_items) < len(spec_js):
                file_ref = spec_js[len(js_items)].get("file", "")

            # Generate new path only for truly new items
            if not file_ref:
                js_name = slugify(desc) if desc else f"js_{len(js_items)}"
                file_ref = f"./js/{block_key}_{js_name}.js"

            if code:
                fname = file_ref.replace("./js/", "")
                (js_dir / fname).write_text(code)
                entry["file"] = file_ref

            js_items.append(entry)
            js_key = desc or f"js_{len(js_items) - 1}"
            js_item_state[js_key] = {"uid": di_uid}
            uid_to_name[di_uid] = f"[JS:{desc}]" if desc else "[JS]"

        elif "DividerItem" in di_use or "MarkdownItem" in di_use:
            label = di_sp.get("markdownItemSetting", {}).get("title", {}).get("label", "")
            uid_to_name[di_uid] = f"--- {label} ---" if label else "---"

        elif "FilterFormItem" in di_use or "DetailsItem" in di_use or "FormItem" in di_use:
            fp = di_sp.get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp:
                # For filterForm, preserve dict format with label/filterPaths
                if spec.get("type") == "filterForm":
                    existing = next((f for f in spec.get("fields", [])
                                     if (isinstance(f, dict) and f.get("field") == fp) or f == fp), None)
                    if existing and isinstance(existing, dict):
                        fields.append(existing)  # keep existing config
                    else:
                        fields.append(fp)
                else:
                    fields.append(fp)
                uid_to_name[di_uid] = fp

    if fields and spec.get("type") != "filterForm":
        spec["fields"] = fields
    elif fields and spec.get("type") == "filterForm":
        spec["fields"] = fields

    if js_items:
        spec["js_items"] = js_items
    block_state["js_items"] = js_item_state

    # Update field_layout from live gridSettings
    from exporter import _extract_layout
    layout = _extract_layout(grid, uid_to_name)
    if layout:
        spec["field_layout"] = layout


def _sync_popup(nb: NocoBase, popup_spec: dict, state: dict,
                mod: Path, js_dir: Path):
    """Sync a popup — read live content, update spec."""
    target = popup_spec.get("target", "")

    # Resolve target to field UID via state
    from refs import RefResolver
    resolver = RefResolver(state)
    try:
        target_uid = resolver.resolve_uid(target)
    except KeyError:
        return

    # Check if popup has content
    try:
        data = nb.get(uid=target_uid)
        tree = data.get("tree", {})
        popup_page = tree.get("subModels", {}).get("page", {})
        if not popup_page:
            return
    except Exception as e:
        return

    # For tabbed popups, sync each tab
    if popup_spec.get("tabs"):
        tabs_live = popup_page.get("subModels", {}).get("tabs", [])
        if not isinstance(tabs_live, list):
            return

        for i, tab_spec in enumerate(popup_spec["tabs"]):
            if i >= len(tabs_live):
                break
            tab_live = tabs_live[i]
            tab_grid = tab_live.get("subModels", {}).get("grid", {})
            tab_items = tab_grid.get("subModels", {}).get("items", [])

            if not isinstance(tab_items, list):
                continue

            # Sync blocks in this tab
            # Sync blocks in this tab by matching type + position
            spec_blocks = tab_spec.get("blocks", [])
            for bi_idx, bi in enumerate(tab_items):
                if bi_idx < len(spec_blocks):
                    _sync_block(nb, bi, spec_blocks[bi_idx], {},
                                mod, js_dir, f"{target.split('.')[0].lstrip('$')}_popup")

            # Sync tab layout
            uid_to_key = {}
            for bi in tab_items:
                use = bi.get("use", "").replace("Model", "")
                uid = bi.get("uid", "")
                title = bi.get("stepParams", {}).get("cardSettings", {}).get("titleDescription", {}).get("title", "")
                key = slugify(title) if title else f"{use.lower()}_{uid[:6]}"
                uid_to_key[uid] = key

            layout = _export_layout(tab_grid, uid_to_key)
            if layout:
                tab_spec["layout"] = layout

    # For simple popups, sync blocks
    elif popup_spec.get("blocks"):
        tab_grid = None
        tabs = popup_page.get("subModels", {}).get("tabs", [])
        if isinstance(tabs, list) and tabs:
            tab_grid = tabs[0].get("subModels", {}).get("grid", {})
        if not tab_grid:
            return

        tab_items = tab_grid.get("subModels", {}).get("items", [])
        if not isinstance(tab_items, list):
            return

        # Sync JS items in popup blocks
        for bs in popup_spec.get("blocks", []):
            if bs.get("js_items"):
                _sync_popup_js_items(nb, tab_items, bs, mod, js_dir, target)


def _sync_popup_js_items(nb: NocoBase, live_items: list, block_spec: dict,
                         mod: Path, js_dir: Path, prefix: str):
    """Sync JS items in popup blocks — write latest code back to files."""
    for live_item in live_items:
        if live_item.get("use", "").replace("Model", "") != block_spec.get("type", ""):
            continue

        grid = live_item.get("subModels", {}).get("grid", {})
        if not isinstance(grid, dict):
            continue

        items = grid.get("subModels", {}).get("items", [])
        if not isinstance(items, list):
            continue

        live_js = [i for i in items if "JSItem" in i.get("use", "")]
        spec_js = block_spec.get("js_items", [])

        for idx, js_spec in enumerate(spec_js):
            js_file = js_spec.get("file", "")
            if not js_file or idx >= len(live_js):
                continue

            code = live_js[idx].get("stepParams", {}).get("jsSettings", {}).get("runJs", {}).get("code", "")
            if code:
                (mod / js_file).write_text(code)

        break


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    mod_dir = sys.argv[1]
    page_filter = None
    for i, arg in enumerate(sys.argv[2:], 2):
        if arg == "--page" and i + 1 < len(sys.argv):
            page_filter = sys.argv[i + 1]
        elif not arg.startswith("-"):
            page_filter = arg

    sync(mod_dir, page_filter)
