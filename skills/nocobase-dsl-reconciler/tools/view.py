"""Visualize page structure — tree view of exported modules.

Usage:
    python view.py exports/crm-v2/                    # full module
    python view.py exports/crm-v2/ --page Leads        # single page
    python view.py exports/crm-v2/ --popups            # show popups
    python view.py --live "Main"                       # live from NocoBase
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import yaml


def view_module(mod_dir: str, page_filter: str = None, show_popups: bool = False):
    mod = Path(mod_dir)
    structure = yaml.safe_load((mod / "structure.yaml").read_text())
    enhance = {}
    if (mod / "enhance.yaml").exists():
        enhance = yaml.safe_load((mod / "enhance.yaml").read_text()) or {}

    module_name = structure.get("module", "?")
    icon = structure.get("icon", "")
    print(f"\n  {module_name} ({icon})")
    print(f"  {'=' * 50}")

    for page in structure.get("pages", []):
        title = page.get("page", "?")
        if page_filter and page_filter.lower() not in title.lower():
            continue

        page_icon = page.get("icon", "")
        print(f"\n  {title} ({page_icon})")
        print(f"  {'-' * 40}")

        # Layout
        layout = page.get("layout")
        blocks = page.get("blocks", [])
        block_map = {b["key"]: b for b in blocks}

        if layout:
            _print_layout(layout, block_map, indent=2)
        else:
            for b in blocks:
                _print_block(b, indent=2)

    # Popups
    popups = enhance.get("popups", [])
    if popups and (show_popups or page_filter):
        print(f"\n  Popups")
        print(f"  {'=' * 50}")
        for popup in popups:
            p_page = popup.get("page", "")
            if page_filter and page_filter.lower() not in p_page.lower():
                continue
            p_field = popup.get("field", "")
            p_mode = popup.get("mode", "drawer")
            print(f"\n  {p_page}.{p_field} (mode={p_mode})")
            print(f"  {'-' * 40}")

            if popup.get("tabs"):
                for tab in popup["tabs"]:
                    tab_title = tab.get("title", "?")
                    print(f"    Tab: {tab_title}")
                    tab_layout = tab.get("layout")
                    tab_blocks = tab.get("blocks", [])
                    tab_block_map = {b["key"]: b for b in tab_blocks}
                    if tab_layout:
                        _print_layout(tab_layout, tab_block_map, indent=4)
                    else:
                        for b in tab_blocks:
                            _print_block(b, indent=4)
            else:
                for b in popup.get("blocks", []):
                    _print_block(b, indent=4)

    print()


def _print_layout(layout: list, block_map: dict, indent: int):
    """Print layout with block details inline."""
    prefix = " " * indent
    for row in layout:
        if isinstance(row, str):
            # Divider
            print(f"{prefix}{row}")
            continue
        if not isinstance(row, list):
            continue

        parts = []
        for item in row:
            if isinstance(item, str):
                b = block_map.get(item)
                parts.append(_block_summary(item, b))
            elif isinstance(item, dict):
                if "col" in item:
                    names = item["col"]
                    size = item.get("size", "?")
                    col_parts = []
                    for n in names:
                        b = block_map.get(n)
                        col_parts.append(_block_summary(n, b))
                    parts.append(f"[{' / '.join(col_parts)}]:{size}")
                else:
                    name = list(item.keys())[0]
                    size = item[name]
                    b = block_map.get(name)
                    parts.append(f"{_block_summary(name, b)}:{size}")
            elif isinstance(item, list):
                col_parts = []
                for n in item:
                    b = block_map.get(n)
                    col_parts.append(_block_summary(n, b))
                parts.append(f"[{' / '.join(col_parts)}]")

        print(f"{prefix}| {' | '.join(parts)} |")


def _block_summary(key: str, block: dict | None) -> str:
    """One-line block summary."""
    if not block:
        return key

    btype = block.get("type", "?")
    title = block.get("title", "")
    coll = block.get("coll", "")
    desc = block.get("desc", "")
    fields = block.get("fields", [])
    js_cols = block.get("js_columns", [])
    js_items = block.get("js_items", [])
    actions = block.get("actions", [])
    rec_actions = block.get("recordActions", [])

    item_fields = block.get("item_fields", [])
    item_js = block.get("item_js", [])
    item_actions = block.get("item_actions", [])

    parts = [f"{btype}"]
    if title:
        parts[0] = f'{btype}:"{title}"'
    if desc:
        parts[0] = f'{btype}:"{desc}"'

    info = []
    if coll:
        info.append(coll)
    if fields:
        info.append(f"{len(fields)}f")
    if js_cols:
        info.append(f"{len(js_cols)}js_col")
    if js_items:
        info.append(f"{len(js_items)}js")
    if item_fields or item_js:
        item_parts = []
        if item_fields: item_parts.append(f"{len(item_fields)}f")
        if item_js: item_parts.append(f"{len(item_js)}js")
        info.append(f"item:[{'+'.join(item_parts)}]")
    if actions:
        info.append(f"act:{','.join(actions[:3])}")
    if rec_actions:
        info.append(f"rec:{','.join(rec_actions[:3])}")
    if item_actions:
        info.append(f"item_act:{','.join(item_actions[:2])}")

    if info:
        return f"{parts[0]}({', '.join(info)})"
    return parts[0]


def _print_block(block: dict, indent: int):
    """Print a single block with details."""
    prefix = " " * indent
    key = block.get("key", "?")
    summary = _block_summary(key, block)
    print(f"{prefix}{summary}")

    # Field layout
    fl = block.get("field_layout")
    if fl:
        for row in fl:
            if isinstance(row, str):
                print(f"{prefix}  {row}")
            elif isinstance(row, list):
                items = []
                for item in row:
                    if isinstance(item, str):
                        items.append(item)
                    elif isinstance(item, dict):
                        n = list(item.keys())[0]
                        items.append(f"{n}:{item[n]}")
                print(f"{prefix}  [{', '.join(items)}]")


def view_live(nb, group_name: str):
    """View live page structure from NocoBase."""
    from exporter import export_page_surface, export_popup_surface
    from nb import dump_yaml

    routes = nb.routes()
    group = None
    for r in routes:
        if r.get("title") == group_name:
            group = r
            break
    if not group:
        print(f"  Group '{group_name}' not found")
        return

    print(f"\n  {group_name} ({group.get('icon', '')})")
    print(f"  {'=' * 50}")

    for child in group.get("children", []):
        if child.get("type") == "group":
            print(f"\n  [{child['title']}] (sub-group)")
            continue
        if child.get("type") != "flowPage":
            continue

        title = child.get("title", "")
        tab_uid = None
        for t in child.get("children", []):
            if t.get("type") == "tabs" and t.get("schemaUid"):
                tab_uid = t["schemaUid"]
                break
        if not tab_uid:
            continue

        spec = export_page_surface(nb, tab_uid, page_key=title.lower())
        blocks = spec.get("blocks", [])
        layout = spec.get("layout")
        popups = spec.get("popups", [])

        print(f"\n  {title} ({child.get('icon', '')})")
        print(f"  {'-' * 40}")

        block_map = {b["key"]: b for b in blocks}
        if layout:
            _print_layout(layout, block_map, indent=2)
        else:
            for b in blocks:
                _print_block(b, indent=2)

        if popups:
            for p in popups:
                print(f"    -> popup on '{p['field']}' ({p.get('mode', '?')})")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "--live":
        from nb import NocoBase
        nb = NocoBase()
        group_name = sys.argv[2] if len(sys.argv) > 2 else "Main"
        view_live(nb, group_name)
    else:
        mod_dir = sys.argv[1]
        page_filter = None
        show_popups = False
        for arg in sys.argv[2:]:
            if arg == "--popups":
                show_popups = True
            elif arg.startswith("--page"):
                page_filter = sys.argv[sys.argv.index(arg) + 1] if arg == "--page" else arg.split("=")[1]
            elif not arg.startswith("-"):
                page_filter = arg
        view_module(mod_dir, page_filter, show_popups)
