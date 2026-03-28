"""Page building tools — FlowModel page construction.

High-level page building tools:
- nb_crud_page / nb_crud_page_file — quick CRUD page builder
- nb_clean_tab — idempotent cleanup
- nb_js_enhance_file — batch JS enhancements

For free-form page composition, use tree_tools.py:
- nb_compose_page / nb_page_markup — flexible page builders
- nb_find_placeholders / nb_inject_js — Phase 2 JS workflow
"""

import json
from typing import Optional

from mcp.server.fastmcp import FastMCP

from ..client import get_nb_client, NB
from ..utils import uid, safe_json, resolve_file


def register_tools(mcp: FastMCP):
    """Register page building tools on the MCP server."""

    @mcp.tool()
    def nb_clean_tab(tab_uid: str) -> str:
        """Delete all FlowModel content under a tab (idempotent cleanup).

        Removes all blocks, fields, and actions under the tab while keeping
        the tab route itself. Use before rebuilding a page.

        Args:
            tab_uid: Tab UID to clean

        Returns:
            Number of nodes deleted.
        """
        nb = get_nb_client()
        count = nb.clean_tab(tab_uid)
        return f"Cleaned {count} nodes under tab {tab_uid}"

    @mcp.tool()
    def nb_js_enhance_file(file_path: str) -> str:
        """Batch-apply JS enhancements from a JSON file.

        The file contains an array of JS enhancement definitions.
        Each item specifies an action and the parameters for that action.

        Args:
            file_path: Path to a JSON file containing an array of actions:
                [
                    {"action": "add_column", "table_uid": "xxx", "title": "Status", "code": "...", "width": 90},
                    {"action": "add_item", "grid_uid": "xxx", "title": "Score", "code": "..."},
                    {"action": "add_block", "parent": "xxx", "title": "Overview", "code": "..."},
                    {"action": "update", "uid": "xxx", "code": "...", "title": "..."},
                    {"action": "add_event", "model_uid": "xxx", "event": "formValuesChange", "code": "..."},
                    {"action": "delete", "uid": "xxx"}
                ]

        Returns:
            JSON with summary of results per action.
        """
        try:
            file_path = resolve_file(file_path)
        except FileNotFoundError as e:
            return json.dumps({"error": str(e)})

        with open(file_path, "r", encoding="utf-8") as f:
            actions = json.load(f)

        if not isinstance(actions, list):
            return json.dumps({"error": "File must contain a JSON array of action definitions"})

        nb = get_nb_client()
        results = []

        for i, act in enumerate(actions):
            action = act.get("action", "")
            try:
                if action == "add_column":
                    col_uid = nb.js_column(
                        act["table_uid"], act["title"], act["code"],
                        width=act.get("width"))
                    results.append({"index": i, "action": action, "uid": col_uid, "success": True})

                elif action == "add_item":
                    item_uid = nb.js_item(act["grid_uid"], act["title"], act["code"])
                    results.append({"index": i, "action": action, "uid": item_uid, "success": True})

                elif action == "add_block":
                    block_uid = nb.js_block(act["parent"], act["title"], act["code"])
                    results.append({"index": i, "action": action, "uid": block_uid, "success": True})

                elif action in ("update", "update_js"):
                    ok = nb.update_js(act["uid"], act["code"], title=act.get("title"))
                    results.append({"index": i, "action": action, "uid": act["uid"], "success": ok})

                elif action == "add_event":
                    event = act.get("event") or act.get("event_name", "formValuesChange")
                    flow_key = nb.event_flow(act["model_uid"], event, act["code"])
                    results.append({"index": i, "action": action, "flow_key": flow_key, "success": bool(flow_key)})

                elif action == "delete":
                    nb.destroy(act["uid"])
                    results.append({"index": i, "action": action, "uid": act["uid"], "success": True})

                else:
                    results.append({"index": i, "action": action, "error": f"Unknown action: {action}"})

            except Exception as e:
                results.append({"index": i, "action": action, "error": str(e)})

        succeeded = len([r for r in results if r.get("success")])
        failed = len([r for r in results if "error" in r or not r.get("success")])
        return json.dumps({"total": len(actions), "succeeded": succeeded, "failed": failed, "results": results})

    # DISABLED: nb_crud_page produces overly uniform pages.
    # Use nb_page_markup (XML) or nb_compose_page (JSON blocks) instead.
    # @mcp.tool()
    def nb_crud_page(
        tab_uid: str,
        collection: str,
        table_fields: str,
        form_fields: str,
        filter_fields: Optional[list] = None,
        kpis_json: Optional[list] = None,
        detail_json: Optional[list] = None,
        table_title: Optional[str] = None,
        sidebar_outlines: Optional[list] = None,
    ) -> str:
        """Build a complete CRUD page in one call — KPIs + filter + table + forms + popup.

        Args:
            tab_uid: Tab UID from nb_create_page or nb_create_menu
            collection: Collection name for the main table
            table_fields: JSON array of field names for table columns.
                Example: '["name","code","status","createdAt"]'
            form_fields: Fields DSL string for AddNew and Edit forms.
                Syntax: "name*" (required), "name | code" (side-by-side),
                "--- Section" (divider), "name:16 | code:8" (widths)
            filter_fields: Optional JSON array of filter field names
            kpis_json: Optional JSON array of KPI defs: [{"title":"...", "filter":{}, "color":"#hex"}]
            detail_json: Optional detail popup tabs. Set to "none" to skip.
                Default: auto-generates from form_fields.
            table_title: Optional table card title
            sidebar_outlines: Optional outline defs for sidebar layout

        Returns:
            JSON with grid_uid, table_uid, create_form, edit_form, node_count.
        """
        from ..tree_builder import TreeBuilder

        nb = get_nb_client()

        cols = safe_json(table_fields)
        kpis = safe_json(kpis_json) if kpis_json else None
        ff = safe_json(filter_fields) if filter_fields else None
        detail = safe_json(detail_json) if detail_json and detail_json != "none" else detail_json
        outlines = safe_json(sidebar_outlines) if sidebar_outlines else None

        nb.clean_tab(tab_uid)

        tb = TreeBuilder(nb)
        root, meta = tb.crud_page(
            tab_uid=tab_uid,
            coll=collection,
            table_fields=cols,
            form_fields_dsl=form_fields,
            filter_fields=ff,
            kpis=kpis,
            detail_tabs=detail,
            table_title=table_title,
            sidebar_outlines=outlines,
        )

        filter_manager = meta.pop("_filter_manager", None)
        nb.save_nested(root, tab_uid, filter_manager=filter_manager)

        result = {
            "grid_uid": meta.get("grid_uid"),
            "table_uid": meta.get("table_uid"),
            "create_form": meta.get("create_form"),
            "edit_form": meta.get("edit_form"),
            "node_count": meta.get("node_count", 0),
        }
        if meta.get("detail_popup"):
            result["detail_popup"] = True
        if meta.get("sidebar_outline_uids"):
            result["sidebar_outline_uids"] = meta["sidebar_outline_uids"]
        if nb.warnings:
            result["warnings"] = nb.warnings

        return json.dumps(result)

    # DISABLED: uses nb_crud_page internally.
    # @mcp.tool()
    def nb_crud_page_file(file_path: str) -> str:
        """Build multiple CRUD pages from a JSON file.

        Args:
            file_path: Path to JSON file with array of page defs.
                Each item: {tab_uid, collection, table_fields, form_fields,
                            filter_fields?, kpis_json?, detail_json?, table_title?,
                            sidebar_outlines?}

        Returns:
            JSON with results for each page.
        """
        try:
            file_path = resolve_file(file_path)
        except FileNotFoundError as e:
            return json.dumps({"error": str(e)})

        with open(file_path, "r", encoding="utf-8") as f:
            pages = json.load(f)

        if not isinstance(pages, list):
            return json.dumps({"error": "File must contain a JSON array of page definitions"})

        results = []
        for i, page in enumerate(pages):
            coll = page.get("collection", "")
            try:
                tab = page.get("tab_uid", "")
                tf = page.get("table_fields", [])
                ff = page.get("form_fields", "")
                if not tab or not coll or not tf or not ff:
                    results.append({"index": i, "error": "Missing required fields"})
                    continue

                if isinstance(tf, list):
                    tf = json.dumps(tf)

                r = nb_crud_page(
                    tab_uid=tab,
                    collection=coll,
                    table_fields=tf,
                    form_fields=ff,
                    filter_fields=page.get("filter_fields"),
                    kpis_json=page.get("kpis_json"),
                    detail_json=page.get("detail_json"),
                    table_title=page.get("table_title"),
                    sidebar_outlines=page.get("sidebar_outlines"),
                )
                parsed = json.loads(r)
                parsed["index"] = i
                parsed["collection"] = coll
                results.append(parsed)
            except Exception as e:
                results.append({"index": i, "collection": coll, "error": str(e)})

        return json.dumps({"pages_built": len([r for r in results if "error" not in r]),
                          "pages_failed": len([r for r in results if "error" in r]),
                          "results": results})
