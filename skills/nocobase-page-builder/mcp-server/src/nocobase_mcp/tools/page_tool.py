"""Page maintenance tools — show, locate, patch, add/remove fields and columns.

Extracted from nb_page_tool.py (PageTool class).
"""

import json
from typing import Optional

from mcp.server.fastmcp import FastMCP

from ..client import get_nb_client, NB
from ..models import DISPLAY_MAP, EDIT_MAP
from ..utils import uid, deep_merge, safe_json


class PageTool:
    """FlowModel page CRUD operations."""

    def __init__(self, nb: NB):
        self.nb = nb
        self._models = None
        self._routes = None

    def _load_models(self, force=False):
        if self._models and not force:
            return self._models
        self._models = self.nb._get_json("api/flowModels:list?paginate=false") or []
        return self._models

    def _load_routes(self, force=False):
        if self._routes and not force:
            return self._routes
        self._routes = self.nb._get_json("api/desktopRoutes:list?paginate=false&tree=true") or []
        return self._routes

    def _children_map(self):
        models = self._load_models()
        cm = {}
        for m in models:
            pid = m.get("parentId")
            if pid:
                cm.setdefault(pid, []).append(m)
        return cm

    def _model_by_uid(self, uid_):
        for m in self._load_models():
            if m["uid"] == uid_:
                return m
        return None

    def _find_tab_uid(self, page_title):
        routes = self._load_routes()
        for rt in routes:
            found = self._search_route(rt, page_title)
            if found:
                return found
        return None

    def _search_route(self, route, title):
        t = route.get("title") or ""
        if t == title and route.get("type") == "flowPage":
            children = route.get("children", [])
            for c in children:
                if c.get("type") == "tabs" and c.get("schemaUid"):
                    return c["schemaUid"]
            for c in children:
                if c.get("schemaUid"):
                    return c["schemaUid"]
        for child in route.get("children", []):
            found = self._search_route(child, title)
            if found:
                return found
        return None

    def _build_tree(self, root_uid, cm=None):
        if cm is None:
            cm = self._children_map()
        node = self._model_by_uid(root_uid) or {"uid": root_uid, "use": "?"}
        children = sorted(cm.get(root_uid, []), key=lambda m: m.get("sortIndex", 0))
        return {
            "uid": node["uid"],
            "use": node.get("use", "?"),
            "subKey": node.get("subKey", ""),
            "sortIndex": node.get("sortIndex", 0),
            "stepParams": node.get("stepParams", {}),
            "children": [self._build_tree(c["uid"], cm) for c in children],
        }

    def _format_tree(self, node, depth, lines):
        indent = "  " * depth
        use = node["use"]
        u = node["uid"]
        sp = node.get("stepParams", {})
        info = []
        fs = sp.get("fieldSettings", {}).get("init", {})
        if fs.get("fieldPath"):
            info.append(f"field={fs['fieldPath']}")
        if fs.get("collectionName"):
            info.append(f"coll={fs['collectionName']}")
        rs = sp.get("resourceSettings", {}).get("init", {})
        if rs.get("collectionName"):
            info.append(f"coll={rs['collectionName']}")
        cs = sp.get("cardSettings", {}).get("titleDescription", {})
        if cs.get("title"):
            info.append(f"title={cs['title']}")
        ts = sp.get("tableColumnSettings", {})
        if ts.get("title", {}).get("title"):
            info.append(f"title={ts['title']['title']}")
        detail = f" ({', '.join(info)})" if info else ""
        lines.append(f"{indent}{use} [{u}]{detail}")
        for child in node.get("children", []):
            self._format_tree(child, depth + 1, lines)

    def _find_in_tree(self, node, block, field):
        use = node["use"]
        sp = node.get("stepParams", {})
        if block and not field:
            block_map = {
                "table": "TableBlockModel", "addnew": "AddNewActionModel",
                "edit": "EditActionModel", "filter": "FilterFormModel",
                "details": "DetailsBlockModel", "form_create": "CreateFormModel",
                "form_edit": "EditFormModel",
            }
            target_use = block_map.get(block, block)
            if use == target_use:
                return node["uid"]
        if field:
            fp = sp.get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp == field:
                return node["uid"]
        for child in node.get("children", []):
            found = self._find_in_tree(child, block, field)
            if found:
                return found
        return None

    def show(self, page_title):
        tab_uid = self._find_tab_uid(page_title)
        if not tab_uid:
            return None, f"Page '{page_title}' not found"
        cm = self._children_map()
        tree = self._build_tree(tab_uid, cm)
        lines = []
        self._format_tree(tree, 0, lines)
        return tree, "\n".join(lines)

    def locate(self, page_title, block=None, field=None):
        tab_uid = self._find_tab_uid(page_title)
        if not tab_uid:
            return None
        cm = self._children_map()
        tree = self._build_tree(tab_uid, cm)
        return self._find_in_tree(tree, block, field)

    def pages(self):
        routes = self._load_routes()
        result = []
        self._collect_pages(routes, result, "")
        return result

    def _collect_pages(self, routes, result, prefix):
        for rt in routes:
            title = rt.get("title") or ""
            rtype = rt.get("type") or ""
            path = f"{prefix}/{title}" if prefix else title
            if rtype == "flowPage":
                children = rt.get("children", [])
                tab_uid = None
                for c in children:
                    if c.get("type") == "tabs" and c.get("schemaUid"):
                        tab_uid = c["schemaUid"]
                        break
                result.append({"title": title, "path": path, "tab_uid": tab_uid,
                               "route_id": rt.get("id")})
            for child in rt.get("children", []):
                self._collect_pages([child], result, path)

    # ── Page Inspect ──────────────────────────────────────────────

    def inspect(self, page_title):
        """Generate a DSL-style visual representation of a page's structure.

        Output mirrors nb_crud_page input format for easy comparison.
        Resolves ReferenceBlockModel and popupTemplate references one level
        deep, using a visited set to prevent cycles (graph nodes).
        """
        tab_uid = self._find_tab_uid(page_title)
        if not tab_uid:
            return f"Page '{page_title}' not found"
        cm = self._children_map()
        tree = self._build_tree(tab_uid, cm)
        visited = set()  # cycle detection for graph references
        lines = [f"# {page_title}  (tab={tab_uid})"]
        self._inspect_grid(tree, cm, lines, visited)
        return "\n".join(lines)

    # ── Grid layout (pseudo-HTML) ─────────────────────────────────

    def _grid_layout(self, grid, block_map, cm):
        """Generate pseudo-HTML layout overview from gridSettings.

        Uses ``<row>`` / ``<col span=N>`` / block tags to express the
        page grid structure.  Stacked blocks become sibling children
        inside a single ``<col>``.
        """
        gs = grid.get("stepParams", {}).get("gridSettings", {}).get("grid", {})
        rows = gs.get("rows", {})
        sizes = gs.get("sizes", {})
        if not rows:
            return []

        lines = ["", "<grid>"]
        for rid, cols in rows.items():
            row_sizes = sizes.get(rid, [24] * len(cols))
            lines.append("  <row>")
            for ci, col_uids in enumerate(cols):
                span = row_sizes[ci] if ci < len(row_sizes) else 24
                tags = [self._block_tag(buid, block_map, cm) for buid in col_uids]
                if len(tags) == 1:
                    lines.append(f"    <col span={span}>{tags[0]}</col>")
                else:
                    lines.append(f"    <col span={span}>")
                    for t in tags:
                        lines.append(f"      {t}")
                    lines.append(f"    </col>")
            lines.append("  </row>")
        lines.append("</grid>")
        return lines

    def _block_tag(self, uid_, block_map, cm):
        """Generate a pseudo-HTML tag for a single block, with uid for drill-down."""
        node = block_map.get(uid_) or self._model_by_uid(uid_)
        if not node:
            return f'<unknown uid="{uid_}" />'
        use = node.get("use", "")
        sp = node.get("stepParams", {})
        u = f' uid="{uid_}"'

        if "JSBlock" in use:
            title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
            code_len = len((sp.get("jsSettings") or {}).get("runJs", {}).get("code", ""))
            t = title or "untitled"
            if code_len <= 1000:
                return f"<kpi{u}>{t}</kpi>"
            return f'<js code={code_len}{u}>{t}</js>'

        if "FilterForm" in use:
            fields = self._extract_filter_fields(node, cm)
            return f'<filter{u} fields="{", ".join(fields)}" />'

        if "TableBlock" in use:
            coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "?")
            title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
            cols = sorted(cm.get(node["uid"], []), key=lambda m: m.get("sortIndex", 0))
            plain = sum(1 for c in cols if "TableColumn" in c.get("use", "") and "Actions" not in c.get("use", ""))
            js = sum(1 for c in cols if "JSColumn" in c.get("use", ""))
            actions = []
            for c in cols:
                cu = c.get("use", "")
                if "AddNew" in cu:
                    actions.append("AddNew")
                elif "ActionsColumn" in cu or "TableActions" in cu:
                    for act in cm.get(c["uid"], []):
                        au = act.get("use", "")
                        if "Edit" in au:
                            actions.append("Edit")
                        elif "Detail" in au or "View" in au:
                            actions.append("Detail")
            detail_info = self._find_detail_popup(cols, cm, set())
            if detail_info and "Detail" not in actions:
                tab_count = detail_info.count('Tab "')
                actions.append(f"Detail:{tab_count}tabs" if tab_count else "Detail")
            js_attr = f' js={js}' if js else ""
            act_attr = f' actions="{",".join(actions)}"' if actions else ""
            title_attr = f' title="{title}"' if title else ""
            return f'<table{u} collection="{coll}" columns={plain}{js_attr}{act_attr}{title_attr} />'

        if "Reference" in use:
            tpl = sp.get("referenceSettings", {}).get("useTemplate", {}).get("templateName", "")
            return f'<ref{u} template="{tpl}" />'

        if "Details" in use and "Item" not in use:
            coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "")
            col_attr = f' collection="{coll}"' if coll else ""
            return f'<details{u}{col_attr} />'

        if "ActionPanel" in use:
            acts = sorted(cm.get(node["uid"], []), key=lambda m: m.get("sortIndex", 0))
            names = []
            for act in acts:
                au = act.get("use", "")
                if "Popup" in au:
                    names.append("Popup")
                elif "Link" in au:
                    lt = act.get("stepParams", {}).get("linkActionSettings", {}).get("general", {}).get("title", "")
                    names.append(lt or "Link")
                else:
                    names.append(au.replace("Model", ""))
            return f'<actions{u}>{", ".join(names)}</actions>'

        if "Chart" in use:
            return f"<chart{u} />"

        if "AIEmployee" in use:
            return f"<ai-shortcuts{u} />"

        if "List" in use:
            coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "")
            col_attr = f' collection="{coll}"' if coll else ""
            return f'<list{u}{col_attr} />'

        if "Form" in use and "Filter" not in use:
            coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "")
            col_attr = f' collection="{coll}"' if coll else ""
            return f'<form{u}{col_attr} />'

        tag = use.replace("Model", "").replace("Block", "").lower()
        return f'<{tag}{u} />'

    # ── Grid inspection ────────────────────────────────────────

    def _inspect_grid(self, tree, cm, lines, visited):
        """Inspect a BlockGridModel within a tree node."""
        grids = [c for c in tree.get("children", []) if "BlockGrid" in c.get("use", "")]
        if not grids:
            lines.append("(empty page)")
            return
        grid = grids[0]
        gs = grid.get("stepParams", {}).get("gridSettings", {}).get("grid", {})
        rows = gs.get("rows", {})
        sizes = gs.get("sizes", {})
        block_map = {c["uid"]: c for c in grid.get("children", [])}

        # Grid layout overview (pseudo-HTML)
        layout_lines = self._grid_layout(grid, block_map, cm)
        lines.extend(layout_lines)

        # Classify blocks
        kpi_blocks = []
        js_chart_blocks = []
        filter_block = None
        table_blocks = []
        other_blocks = []
        JS_KPI_THRESHOLD = 1000  # chars: below = KPI card, above = chart/dashboard
        for row_id, cols in rows.items():
            row_sizes = sizes.get(row_id, [24] * len(cols))
            for ci, col_uids in enumerate(cols):
                for buid in col_uids:
                    node = block_map.get(buid)
                    if not node:
                        continue
                    use = node.get("use", "")
                    sz = row_sizes[ci] if ci < len(row_sizes) else 24
                    if "JSBlock" in use:
                        sp = node.get("stepParams", {})
                        title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
                        code = (sp.get("jsSettings") or {}).get("runJs", {}).get("code", "")
                        info = {"title": title, "row_id": row_id, "size": sz, "code_len": len(code)}
                        if len(code) > JS_KPI_THRESHOLD:
                            js_chart_blocks.append(info)
                        else:
                            kpi_blocks.append(info)
                    elif "FilterForm" in use:
                        filter_block = node
                    elif "TableBlock" in use:
                        table_blocks.append(node)
                    elif "Reference" in use:
                        other_blocks.append(node)
                    elif "ActionPanel" in use:
                        other_blocks.append(node)
                    elif "Chart" in use:
                        other_blocks.append(node)
                    elif "Details" in use and "Item" not in use:
                        other_blocks.append(node)

        # 1. KPI section (small JS blocks, typically <1000c)
        if kpi_blocks:
            kpi_rows = set(k["row_id"] for k in kpi_blocks)
            if len(kpi_rows) == 1:
                layout = "inline"
                size_str = "|".join(str(k["size"]) for k in kpi_blocks)
            else:
                layout = "stacked"
                size_str = "24 each"
            titles = [f'"{k["title"] or "(untitled)"}" [JS {k["code_len"]}c]' for k in kpi_blocks]
            lines.append("")
            lines.append(f"## KPIs ({len(kpi_blocks)}x, {layout}, {size_str})")
            lines.append(f"   {' | '.join(titles)}")
            if layout == "stacked" and len(kpi_blocks) > 1:
                lines.append("   !! LAYOUT BUG: KPIs in separate rows (should be inline)")

        # 1b. JS chart/dashboard blocks (large JS blocks, >1000c)
        if js_chart_blocks:
            for jc in js_chart_blocks:
                lines.append("")
                t = jc["title"] or "(untitled)"
                lines.append(f'## JSBlock "{t}" [JS {jc["code_len"]}c] (size={jc["size"]})')

        # 2. Filter section
        if filter_block:
            field_names = self._extract_filter_fields(filter_block, cm)
            lines.append("")
            lines.append("## Filter")
            lines.append(f'   filter_fields: {json.dumps(field_names)}')

        # 3. Table section(s)
        for table_block in table_blocks:
            self._inspect_table(table_block, cm, lines, visited)

        # 4. Other blocks (Reference, ActionPanel, Chart, standalone Details)
        for ob in other_blocks:
            self._inspect_other_block(ob, cm, lines, visited)

        # 5. AI shortcuts
        shortcuts = [c for c in tree.get("children", [])
                     if "AIEmployeeShortcut" in c.get("use", "")]
        if shortcuts:
            names = []
            for sc in shortcuts:
                for ch in sc.get("children", []):
                    sp = ch.get("stepParams", {})
                    ss = sp.get("aiEmployeeShortcutSettings", {}).get("init", {})
                    un = ss.get("aiEmployee", "")
                    label = ss.get("label", "")
                    if un:
                        names.append(f"{un}:{label}" if label else un)
            if names:
                lines.append("")
                lines.append(f"## AI Shortcuts: {', '.join(names)}")

    def _count_events(self, node, cm):
        """Count event flows on a form node (recursive: walks to find the form)."""
        fr = node.get("stepParams", {}).get("flowRegistry") or node.get("flowRegistry") or {}
        # flowRegistry is stored at model level, need to fetch if not in stepParams
        count = sum(1 for v in fr.values() if v)
        # Also check children recursively for forms with events
        for ch in cm.get(node["uid"], []):
            count += self._count_events(ch, cm)
        return count

    def _count_linkage(self, node, cm):
        """Count linkage rules on action/button nodes (recursive)."""
        sp = node.get("stepParams", {})
        lr = sp.get("buttonSettings", {}).get("linkageRules", {}).get("value", [])
        count = len(lr) if lr else 0
        for ch in cm.get(node["uid"], []):
            count += self._count_linkage(ch, cm)
        return count

    def _get_popup_mode(self, action_node, cm):
        """Extract popup mode+size from an action node (AddNew or Edit)."""
        for ch in cm.get(action_node["uid"], []):
            ch_use = ch.get("use", "")
            if "ChildPage" in ch_use:
                ps = ch.get("stepParams", {}).get("popupSettings", {}).get("openView", {})
                mode = ps.get("mode", "")
                size = ps.get("size", "")
                if mode:
                    return f"({mode},{size})" if size else f"({mode})"
        return ""

    def _count_form_events(self, action_node, cm):
        """Count event flows inside an action's form tree by fetching each form node."""
        nb = self.nb
        count = 0
        for desc in self._all_descendants(action_node["uid"], cm):
            use = desc.get("use", "")
            if "Form" in use and "Grid" not in use and "Item" not in use and "Filter" not in use:
                try:
                    data = nb._get_json(f"api/flowModels:get?filterByTk={desc['uid']}")
                    if data:
                        fr = data.get("flowRegistry") or {}
                        count += sum(1 for v in fr.values() if v)
                except Exception:
                    pass
        return count

    def _count_form_linkage(self, action_node, cm):
        """Count linkage rules inside an action's descendant buttons."""
        count = 0
        for desc in self._all_descendants(action_node["uid"], cm):
            sp = desc.get("stepParams", {})
            lr = sp.get("buttonSettings", {}).get("linkageRules", {}).get("value", [])
            if lr:
                count += len(lr)
        return count

    def _inspect_table(self, table_block, cm, lines, visited):
        """Inspect a TableBlockModel and its children."""
        sp = table_block.get("stepParams", {})
        coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "?")
        title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
        # Extract sort settings
        ts = sp.get("tableSettings", {})
        sort_info = ""
        default_sorting = ts.get("defaultSorting", {}).get("sort", [])
        if default_sorting:
            sort_parts = []
            for s in default_sorting:
                if isinstance(s, str):
                    sort_parts.append(s)
                elif isinstance(s, list) and len(s) == 2:
                    sort_parts.append(f"{s[0]} {s[1]}")
            sort_info = ", ".join(sort_parts)

        col_children = sorted(cm.get(table_block["uid"], []), key=lambda m: m.get("sortIndex", 0))
        col_names = []
        js_cols = []
        addnew_node = edit_node = None
        other_actions = []
        for ch in col_children:
            ch_use = ch.get("use", "")
            if "JSColumn" in ch_use:
                ct = ch.get("stepParams", {}).get("tableColumnSettings", {}).get("title", {}).get("title", "")
                code = (ch.get("stepParams", {}).get("jsSettings") or {}).get("runJs", {}).get("code", "")
                js_cols.append(f'"{ct}" [JS {len(code)}c]')
                col_names.append(f"[JS:{ct}]")
            elif "TableColumn" in ch_use and "Actions" not in ch_use:
                fp = ch.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                if fp:
                    col_names.append(fp)
                else:
                    ct = ch.get("stepParams", {}).get("tableColumnSettings", {}).get("title", {}).get("title", "")
                    col_names.append(ct or "?")
            elif "AddNew" in ch_use:
                addnew_node = ch
            elif "ActionsColumn" in ch_use or "TableActions" in ch_use:
                for act in sorted(cm.get(ch["uid"], []), key=lambda m: m.get("sortIndex", 0)):
                    act_use = act.get("use", "")
                    if "Edit" in act_use:
                        edit_node = act
                    elif "Link" in act_use:
                        asp = act.get("stepParams", {})
                        lt = asp.get("linkActionSettings", {}).get("general", {}).get("title", "")
                        act_type = asp.get("linkActionSettings", {}).get("general", {}).get("type", "default")
                        other_actions.append(f'LinkAction "{lt}" ({act_type})')
        lines.append("")
        title_str = f' "{title}"' if title else ""
        sort_str = f"  sort: {sort_info}" if sort_info else ""
        lines.append(f"## Table{title_str}  ({coll}){sort_str}")
        plain_cols = [c for c in col_names if not c.startswith("[JS:")]
        lines.append(f'   table_fields: {json.dumps(plain_cols)}')
        if js_cols:
            lines.append(f'   js_columns: [{", ".join(js_cols)}]')
        if other_actions:
            for oa in other_actions:
                lines.append(f"   {oa}")

        # AddNew form
        if addnew_node:
            popup_mode = self._get_popup_mode(addnew_node, cm)
            event_count = self._count_form_events(addnew_node, cm)
            linkage_count = self._count_form_linkage(addnew_node, cm)
            annotations = []
            if event_count:
                annotations.append(f"[{event_count} events]")
            if linkage_count:
                annotations.append(f"[{linkage_count} linkage]")
            ann_str = "  " + " ".join(annotations) if annotations else ""
            dsl = self._extract_form_dsl(addnew_node, cm)
            lines.append("")
            lines.append(f"   ### AddNew {popup_mode}{ann_str}")
            for dl in dsl.split("\n"):
                lines.append(f"       {dl}")

        # Edit form
        if edit_node:
            popup_mode = self._get_popup_mode(edit_node, cm)
            event_count = self._count_form_events(edit_node, cm)
            linkage_count = self._count_form_linkage(edit_node, cm)
            annotations = []
            if event_count:
                annotations.append(f"[{event_count} events]")
            if linkage_count:
                annotations.append(f"[{linkage_count} linkage]")
            ann_str = "  " + " ".join(annotations) if annotations else ""
            dsl = self._extract_form_dsl(edit_node, cm)
            lines.append("")
            lines.append(f"   ### Edit {popup_mode}{ann_str}")
            for dl in dsl.split("\n"):
                lines.append(f"       {dl}")

        # Detail popup
        detail_info = self._find_detail_popup(col_children, cm, visited)
        if detail_info:
            lines.append("")
            lines.append("   ### Detail Popup")
            for dl in detail_info.split("\n"):
                lines.append(f"       {dl}")

        # AI button on table
        ai_button = [ch for ch in col_children if "AIEmployee" in ch.get("use", "")]
        if ai_button:
            for ab in ai_button:
                absp = ab.get("stepParams", {})
                abis = absp.get("aiEmployeeButtonSettings", {}).get("init", {})
                ai_user = abis.get("aiEmployee", "?")
                lines.append(f"   AI Button: {ai_user}")

    def _inspect_other_block(self, node, cm, lines, visited):
        """Inspect a non-table top-level block (Reference, ActionPanel, Chart, Details)."""
        use = node.get("use", "")
        uid_ = node["uid"]
        sp = node.get("stepParams", {})

        if "Reference" in use:
            rs = sp.get("referenceSettings", {})
            tpl_name = rs.get("useTemplate", {}).get("templateName", "")
            target_uid = rs.get("target", {}).get("targetUid", "") or rs.get("useTemplate", {}).get("targetUid", "")
            lines.append("")
            lines.append(f'## Reference: "{tpl_name}"')
            # Resolve one level deep with cycle detection
            if target_uid and target_uid not in visited:
                visited.add(target_uid)
                self._inspect_resolved_ref(target_uid, cm, lines, visited, indent=3)
            elif target_uid:
                lines.append(f"   (cycle: {target_uid} already visited)")

        elif "ActionPanel" in use:
            actions = sorted(cm.get(uid_, []), key=lambda m: m.get("sortIndex", 0))
            action_names = []
            for act in actions:
                au = act.get("use", "")
                asp = act.get("stepParams", {})
                if "Popup" in au:
                    ps = asp.get("popupSettings", {}).get("openView", {})
                    mode = ps.get("mode", "")
                    coll = ps.get("collectionName", "")
                    action_names.append(f"Popup({mode},{coll})")
                elif "Link" in au:
                    lt = asp.get("linkActionSettings", {}).get("general", {}).get("title", "")
                    action_names.append(f'Link("{lt}")' if lt else "Link")
                else:
                    action_names.append(au.replace("Model", ""))
            lines.append("")
            lines.append(f"## ActionPanel: [{', '.join(action_names)}]")

        elif "Chart" in use:
            lines.append("")
            lines.append("## ChartBlock")

        elif "Details" in use:
            dsl = self._form_to_dsl(node, cm)
            lines.append("")
            lines.append("## Details")
            for dl in dsl.split("\n"):
                lines.append(f"   {dl}")

    def _inspect_resolved_ref(self, target_uid, cm, lines, visited, indent=3):
        """Resolve a reference target and describe its content."""
        prefix = " " * indent
        # The target could be a TableBlockModel, EditFormModel, etc.
        model = self._model_by_uid(target_uid)
        if not model:
            lines.append(f"{prefix}(target {target_uid} not found)")
            return
        use = model.get("use", "")
        sp = model.get("stepParams", {})

        if "TableBlock" in use:
            coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "?")
            title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
            cols = sorted(cm.get(target_uid, []), key=lambda m: m.get("sortIndex", 0))
            col_names = []
            js_col_names = []
            for ch in cols:
                cu = ch.get("use", "")
                if "JSColumn" in cu:
                    ct = ch.get("stepParams", {}).get("tableColumnSettings", {}).get("title", {}).get("title", "")
                    js_col_names.append(ct)
                elif "TableColumn" in cu and "Actions" not in cu:
                    fp = ch.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                    if fp:
                        col_names.append(fp)
            t = f' "{title}"' if title else ""
            lines.append(f"{prefix}Table{t} ({coll}): {json.dumps(col_names)}")
            if js_col_names:
                lines.append(f"{prefix}js_columns: {json.dumps(js_col_names)}")
            # Also show detail popup if columns have clickToOpen
            detail_info = self._find_detail_popup(cols, cm, visited)
            if detail_info:
                lines.append(f"{prefix}Detail Popup:")
                for dl in detail_info.split("\n"):
                    lines.append(f"{prefix}  {dl}")

        elif "Form" in use and "Filter" not in use:
            coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "?")
            dsl = self._form_to_dsl(model, cm)
            lines.append(f"{prefix}Form ({coll}):")
            for dl in dsl.split("\n"):
                lines.append(f"{prefix}  {dl}")

        elif "Details" in use and "Item" not in use:
            dsl = self._form_to_dsl(model, cm)
            lines.append(f"{prefix}Details:")
            for dl in dsl.split("\n"):
                lines.append(f"{prefix}  {dl}")

        else:
            lines.append(f"{prefix}{use} (uid={target_uid})")

    def _extract_filter_fields(self, filter_node, cm):
        """Extract filter field names from a FilterFormModel."""
        filter_children = sorted(cm.get(filter_node["uid"], []), key=lambda m: m.get("sortIndex", 0))
        field_names = []
        for fc in filter_children:
            for ffc in sorted(cm.get(fc["uid"], []), key=lambda m: m.get("sortIndex", 0)):
                fsp = ffc.get("stepParams", {})
                ffis = fsp.get("filterFormItemSettings", {}).get("init", {})
                fn = ffis.get("filterField", {}).get("name", "")
                if fn:
                    field_names.append(fn)
        return field_names

    def _extract_form_dsl(self, action_node, cm):
        """Extract form structure as DSL string (mirrors nb_crud_page form_fields format)."""
        children = cm.get(action_node["uid"], [])
        for ch in children:
            if "ChildPage" in ch.get("use", ""):
                return self._walk_form_dsl(ch, cm)
        return "(no form found)"

    def _walk_form_dsl(self, node, cm):
        """Walk tree to find form and return DSL."""
        children = cm.get(node["uid"], [])
        for ch in children:
            use = ch.get("use", "")
            if "Form" in use and "Grid" not in use and "Item" not in use and "Filter" not in use:
                return self._form_to_dsl(ch, cm)
            result = self._walk_form_dsl(ch, cm)
            if result != "(no form found)":
                return result
        return "(no form found)"

    def _form_to_dsl(self, form_node, cm):
        """Convert a form's FormGrid items to DSL string."""
        children = cm.get(form_node["uid"], [])
        for ch in children:
            if "FormGrid" in ch.get("use", "") or "DetailsGrid" in ch.get("use", ""):
                return self._grid_to_dsl(ch, cm)
        return "(empty form)"

    def _grid_to_dsl(self, grid_node, cm):
        """Convert FormGridModel items to DSL lines."""
        items = sorted(cm.get(grid_node["uid"], []), key=lambda m: m.get("sortIndex", 0))
        gs = grid_node.get("stepParams", {}).get("gridSettings", {}).get("grid", {})
        grid_rows = gs.get("rows", {})
        grid_sizes = gs.get("sizes", {})
        # Build uid → item map
        uid_map = {i["uid"]: i for i in items}
        # Rebuild rows from gridSettings
        dsl_lines = []
        for row_id, cols in grid_rows.items():
            row_sizes = grid_sizes.get(row_id, [24] * len(cols))
            row_parts = []
            for ci, col_uids in enumerate(cols):
                col_size = row_sizes[ci] if ci < len(row_sizes) else 24
                for field_uid in col_uids:
                    item = uid_map.get(field_uid)
                    if not item:
                        continue
                    use = item.get("use", "")
                    sp = item.get("stepParams", {})
                    if "Divider" in use:
                        label = sp.get("dividerItemSettings", {}).get("init", {}).get("title", "")
                        dsl_lines.append(f"--- {label}" if label else "---")
                        continue
                    fp = sp.get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                    if not fp:
                        continue
                    # Check required
                    eis = sp.get("editItemSettings", {})
                    req = eis.get("required", {}).get("required", False)
                    name = f"{fp}*" if req else fp
                    # Add size if not default
                    if len(cols) > 1 and col_size != 24 // len(cols):
                        name = f"{name}:{col_size}"
                    row_parts.append(name)
            if row_parts:
                dsl_lines.append(" | ".join(row_parts))
        if not dsl_lines:
            return "(empty form)"
        return "\n".join(dsl_lines)

    def _resolve_template_target(self, tpl_uid):
        """Resolve a popupTemplateUid to its targetUid via flowModelTemplates API."""
        try:
            templates = self.nb._get_json("api/flowModelTemplates:list?paginate=false") or []
            for t in templates:
                if t.get("uid") == tpl_uid:
                    return t.get("targetUid")
        except Exception:
            pass
        return None

    def _find_detail_popup(self, col_children, cm, visited=None):
        """Find detail popup attached to click-to-open column.

        Resolves popupTemplateUid references one level deep via
        flowModelTemplates API. Uses visited set for cycle detection.
        """
        if visited is None:
            visited = set()
        for col in col_children:
            if "TableColumn" not in col.get("use", "") or "Actions" in col.get("use", ""):
                continue
            # Check clickToOpen on column itself or on child display field
            col_sp = col.get("stepParams", {})
            dfs = col_sp.get("displayFieldSettings", {})
            click_enabled = dfs.get("clickToOpen", {}).get("clickToOpen", False)
            if not click_enabled:
                # Also check child field nodes
                for dch in cm.get(col["uid"], []):
                    dch_sp = dch.get("stepParams", {})
                    dch_dfs = dch_sp.get("displayFieldSettings", {})
                    if dch_dfs.get("clickToOpen", {}).get("clickToOpen", False):
                        click_enabled = True
                        break
            if not click_enabled:
                continue
            for dch in cm.get(col["uid"], []):
                popup_sp = dch.get("stepParams", {}).get("popupSettings", {}).get("openView", {})
                popup_uid = popup_sp.get("uid")
                mode = popup_sp.get("mode", "drawer")
                size = popup_sp.get("size", "?")
                tpl_uid = popup_sp.get("popupTemplateUid", "")
                if popup_uid:
                    if popup_uid in visited:
                        return f"(cycle: {popup_uid} already visited)"
                    visited.add(popup_uid)
                    # If popup uses a template, resolve the template target
                    if tpl_uid:
                        target_uid = self._resolve_template_target(tpl_uid)
                        if target_uid and target_uid not in visited:
                            visited.add(target_uid)
                            return self._describe_popup(target_uid, cm, mode, size, visited)
                    # Normal popup (content is direct children)
                    return self._describe_popup(popup_uid, cm, mode, size, visited)
        return None

    def _describe_popup(self, popup_uid, cm, mode, size, visited=None):
        """Describe a detail popup's tab structure as DSL.

        Resolves references and templates one level deep.
        Uses visited set for cycle detection (graph nodes).
        The popup_uid may point to a ChildPageModel directly, or to a
        DisplayTextFieldModel (template target) which wraps a ChildPageModel.
        """
        if visited is None:
            visited = set()
        children = cm.get(popup_uid, [])
        tabs = [c for c in children if "ChildPageTab" in c.get("use", "")]
        if not tabs:
            # Template targets may be DisplayTextFieldModel → ChildPageModel → tabs
            for ch in children:
                if "ChildPage" in ch.get("use", "") and "Tab" not in ch.get("use", ""):
                    tabs = [t for t in cm.get(ch["uid"], []) if "ChildPageTab" in t.get("use", "")]
                    if tabs:
                        break
        if not tabs:
            return f"({mode},{size}) empty"
        lines = [f"mode={mode}, size={size}"]
        for tab in sorted(tabs, key=lambda t: t.get("sortIndex", 0)):
            tab_title = tab.get("stepParams", {}).get("pageTabSettings", {}).get("tab", {}).get("title", "?")
            tab_children = cm.get(tab["uid"], [])
            tab_blocks = []
            for tc in tab_children:
                if "BlockGrid" in tc.get("use", ""):
                    gs = tc.get("stepParams", {}).get("gridSettings", {}).get("grid", {})
                    grid_rows = gs.get("rows", {})
                    grid_sizes = gs.get("sizes", {})
                    # Show layout if multi-column
                    if grid_rows:
                        for rid, cols in grid_rows.items():
                            sz = grid_sizes.get(rid, [24] * len(cols))
                            if len(cols) > 1 or (len(sz) > 1 and any(s != 24 for s in sz)):
                                tab_blocks.append(f"Layout: {sz}")
                                break
                    for bc in sorted(cm.get(tc["uid"], []), key=lambda m: m.get("sortIndex", 0)):
                        self._describe_block(bc, cm, tab_blocks, visited)
            content = "\n".join(tab_blocks) if tab_blocks else "(empty)"
            lines.append(f'Tab "{tab_title}":')
            for cl in content.split("\n"):
                lines.append(f"  {cl}")
        return "\n".join(lines)

    def _describe_block(self, bc, cm, tab_blocks, visited):
        """Describe a single block within a popup tab. Handles all block types."""
        bu = bc.get("use", "")
        sp = bc.get("stepParams", {})
        uid_ = bc["uid"]

        if "Details" in bu and "Item" not in bu:
            dsl = self._form_to_dsl(bc, cm)
            # Count JSItem children for richer output
            js_items = [c for c in self._all_descendants(uid_, cm) if "JSItem" in c.get("use", "")]
            # Count action buttons
            actions = [c for c in cm.get(uid_, []) if "Action" in c.get("use", "")]
            extras = []
            if js_items:
                extras.append(f"{len(js_items)} JSItem")
            if actions:
                act_names = [a.get("use", "").replace("Model", "").replace("Action", "") for a in actions]
                extras.append(f"actions=[{','.join(act_names)}]")
            suffix = f"  ({', '.join(extras)})" if extras else ""
            tab_blocks.append(f"Details:{suffix}\n{dsl}")

        elif "Table" in bu and "Column" not in bu and "Actions" not in bu:
            coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "?")
            sub_cols = []
            js_sub_cols = []
            for sc in sorted(cm.get(uid_, []), key=lambda m: m.get("sortIndex", 0)):
                scu = sc.get("use", "")
                if "JSColumn" in scu:
                    ct = sc.get("stepParams", {}).get("tableColumnSettings", {}).get("title", {}).get("title", "")
                    js_sub_cols.append(ct)
                elif "TableColumn" in scu and "Actions" not in scu:
                    fp = sc.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                    if fp:
                        sub_cols.append(fp)
            line = f"SubTable {coll}: {json.dumps(sub_cols)}"
            if js_sub_cols:
                line += f" js={json.dumps(js_sub_cols)}"
            tab_blocks.append(line)

        elif "JSBlock" in bu:
            title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
            code = (sp.get("jsSettings") or {}).get("runJs", {}).get("code", "")
            t = f'"{title}"' if title else "(untitled)"
            tab_blocks.append(f"JSBlock {t} [JS {len(code)}c]")

        elif "ActionPanel" in bu:
            actions = sorted(cm.get(uid_, []), key=lambda m: m.get("sortIndex", 0))
            act_descs = []
            for act in actions:
                au = act.get("use", "")
                asp = act.get("stepParams", {})
                if "Popup" in au:
                    ps = asp.get("popupSettings", {}).get("openView", {})
                    act_descs.append(f"Popup({ps.get('mode', '')},{ps.get('collectionName', '')})")
                elif "Link" in au:
                    lt = asp.get("linkActionSettings", {}).get("general", {}).get("title", "")
                    act_descs.append(f'Link("{lt}")' if lt else "Link")
                else:
                    act_descs.append(au.replace("Model", ""))
            tab_blocks.append(f"ActionPanel: [{', '.join(act_descs)}]")

        elif "Reference" in bu:
            rs = sp.get("referenceSettings", {})
            tpl_name = rs.get("useTemplate", {}).get("templateName", "")
            target_uid = rs.get("target", {}).get("targetUid", "") or rs.get("useTemplate", {}).get("targetUid", "")
            if target_uid and target_uid not in visited:
                visited.add(target_uid)
                tab_blocks.append(f'Reference: "{tpl_name}"')
                # Resolve one level
                ref_lines = []
                self._inspect_resolved_ref(target_uid, cm, ref_lines, visited, indent=2)
                tab_blocks.extend(ref_lines)
            elif target_uid:
                tab_blocks.append(f'Reference: "{tpl_name}" (cycle, skip)')
            else:
                tab_blocks.append(f'Reference: "{tpl_name}"')

        elif "Form" in bu and "Filter" not in bu:
            coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "?")
            dsl = self._form_to_dsl(bc, cm)
            tab_blocks.append(f"Form ({coll}):\n{dsl}")

    def _all_descendants(self, uid_, cm):
        """Get all descendant models (flat list) for counting."""
        result = []
        stack = list(cm.get(uid_, []))
        while stack:
            m = stack.pop()
            result.append(m)
            stack.extend(cm.get(m["uid"], []))
        return result

    def inspect_compact(self, page_title):
        """Generate a one-line summary of a page's structure."""
        tab_uid = self._find_tab_uid(page_title)
        if not tab_uid:
            return f"{page_title}  (not found)"
        cm = self._children_map()
        tree = self._build_tree(tab_uid, cm)
        return self._compact_summary(page_title, tree, cm)

    def _compact_summary(self, page_title, tree, cm):
        """Generate one-line compact summary: KPI:N Filter:Nf Table(coll):Nc+Njs AddNew:Nf Edit:Nf Detail:Ntabs"""
        grids = [c for c in tree.get("children", []) if "BlockGrid" in c.get("use", "")]
        if not grids:
            return f"{page_title}  (empty)"
        grid = grids[0]
        gs = grid.get("stepParams", {}).get("gridSettings", {}).get("grid", {})
        rows = gs.get("rows", {})
        block_map = {c["uid"]: c for c in grid.get("children", [])}

        JS_KPI_THRESHOLD = 1000
        kpi_count = 0
        chart_count = 0
        filter_fields = 0
        tables = []  # list of table summary strings
        ai_shortcuts = False

        for row_id, cols in rows.items():
            for col_uids in cols:
                for buid in col_uids:
                    node = block_map.get(buid)
                    if not node:
                        continue
                    use = node.get("use", "")
                    if "JSBlock" in use:
                        sp = node.get("stepParams", {})
                        code = (sp.get("jsSettings") or {}).get("runJs", {}).get("code", "")
                        if len(code) > JS_KPI_THRESHOLD:
                            chart_count += 1
                        else:
                            kpi_count += 1
                    elif "FilterForm" in use:
                        ff_children = self._extract_filter_fields(node, cm)
                        filter_fields = len(ff_children)
                    elif "TableBlock" in use:
                        tables.append(self._compact_table(node, cm))

        # AI shortcuts
        shortcuts = [c for c in tree.get("children", []) if "AIEmployeeShortcut" in c.get("use", "")]
        if shortcuts:
            ai_shortcuts = True

        parts = [page_title]
        if kpi_count:
            parts.append(f"KPI:{kpi_count}")
        if chart_count:
            parts.append(f"Chart:{chart_count}")
        if filter_fields:
            parts.append(f"Filter:{filter_fields}f")
        for t in tables:
            parts.append(t)
        if ai_shortcuts:
            parts.append("AI")
        return "  ".join(parts)

    def _compact_table(self, table_block, cm):
        """Generate compact table summary: Table(coll):Nc+Njs AddNew:Nf Edit:Nf Detail:Ntabs"""
        sp = table_block.get("stepParams", {})
        coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "?")
        col_children = sorted(cm.get(table_block["uid"], []), key=lambda m: m.get("sortIndex", 0))

        plain_count = 0
        js_count = 0
        addnew_fields = 0
        edit_fields = 0
        detail_tabs = 0

        for ch in col_children:
            ch_use = ch.get("use", "")
            if "JSColumn" in ch_use:
                js_count += 1
            elif "TableColumn" in ch_use and "Actions" not in ch_use:
                plain_count += 1
            elif "AddNew" in ch_use:
                addnew_fields = self._count_form_fields(ch, cm)
            elif "ActionsColumn" in ch_use or "TableActions" in ch_use:
                for act in cm.get(ch["uid"], []):
                    if "Edit" in act.get("use", ""):
                        edit_fields = self._count_form_fields(act, cm)

        # Count detail popup tabs
        detail_info = self._find_detail_popup(col_children, cm, set())
        if detail_info:
            detail_tabs = detail_info.count('Tab "')

        parts = []
        col_str = f"{plain_count}c"
        if js_count:
            col_str += f"+{js_count}js"
        parts.append(f"Table({coll}):{col_str}")
        if addnew_fields:
            parts.append(f"AddNew:{addnew_fields}f")
        if edit_fields:
            parts.append(f"Edit:{edit_fields}f")
        if detail_tabs:
            parts.append(f"Detail:{detail_tabs}tabs")
        return " ".join(parts)

    def _count_form_fields(self, action_node, cm):
        """Count form fields inside an action node."""
        count = 0
        for desc in self._all_descendants(action_node["uid"], cm):
            use = desc.get("use", "")
            sp = desc.get("stepParams", {})
            if "FormItem" in use or "EditItem" in use:
                fp = sp.get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                if fp:
                    count += 1
        return count


def register_tools(mcp: FastMCP):
    """Register page maintenance tools on the MCP server."""

    @mcp.tool()
    def nb_inspect_page(page_title: str, depth: int = 1) -> str:
        """Inspect a page and return a visual layout summary.

        Shows the actual rendered structure: KPIs, tables, filters, forms,
        detail popups, sort rules, popup modes, and hidden-point annotations
        ([JS Nc], [N events], [N linkage]).

        Args:
            page_title: Page title as shown in the sidebar menu
            depth: 0 = one-line compact summary, 1 = full structure (default)

        Returns:
            Visual layout of the page structure.

        Example:
            nb_inspect_page("Asset Ledger")          # full structure
            nb_inspect_page("Asset Ledger", depth=0)  # one-line summary
        """
        nb = get_nb_client()
        pt = PageTool(nb)
        if depth == 0:
            return pt.inspect_compact(page_title)
        return pt.inspect(page_title)

    @mcp.tool()
    def nb_inspect_all(prefix: Optional[str] = None, depth: int = 0) -> str:
        """Inspect all pages and return a summary.

        Args:
            prefix: Optional menu path prefix to filter (e.g. "CRM", "Warehouse")
            depth: 0 = one-line-per-page compact (default), 1 = full structure

        Returns:
            Compact or full inspection of all matching pages.

        Example:
            nb_inspect_all("CRM")            # compact overview (~1 line per page)
            nb_inspect_all("CRM", depth=1)   # full structure of every page
        """
        nb = get_nb_client()
        pt = PageTool(nb)
        all_pages = pt.pages()
        if prefix:
            all_pages = [p for p in all_pages if p["path"].startswith(prefix)]
        if not all_pages:
            return "No pages found"

        if depth == 0:
            # Compact: one line per page
            lines = [f"# {prefix or 'All'} ({len(all_pages)} pages)", ""]
            for page in all_pages:
                lines.append(pt.inspect_compact(page["title"]))
            return "\n".join(lines)
        else:
            # Full: complete structure per page
            results = []
            for page in all_pages:
                results.append(pt.inspect(page["title"]))
                results.append("")
            return "\n".join(results)

    @mcp.tool()
    def nb_locate_node(
        page_title: str,
        block: Optional[str] = None,
        field: Optional[str] = None,
    ) -> str:
        """Locate a specific node's UID in a page.

        Find a block or field by type and/or name, returning its UID for
        use with patch/add/remove tools.

        Args:
            page_title: Page title
            block: Block type to find: "table", "addnew", "edit", "filter",
                   "details", "form_create", "form_edit"
            field: Field name to find (e.g. "name", "status")

        Returns:
            UID of the found node, or error message.

        Example:
            nb_locate_node("Asset Ledger", block="table")
            nb_locate_node("Asset Ledger", field="status")
        """
        nb = get_nb_client()
        pt = PageTool(nb)
        uid_ = pt.locate(page_title, block=block, field=field)
        if uid_:
            return json.dumps({"uid": uid_})
        return "Not found"

    @mcp.tool()
    def nb_patch_field(uid: str, props: str) -> str:
        """Modify properties of a form field node.

        Args:
            uid: FormItemModel UID (from nb_locate_node or nb_show_page)
            props: JSON object of properties to set. Supported keys:
                - description: Help text below the field
                - defaultValue: Default value
                - placeholder: Input placeholder text
                - tooltip: Tooltip text
                - hidden: Hide field (boolean)
                - disabled: Disable field (boolean)
                - required: Required field (boolean)
                - pattern: Validation regex pattern

        Returns:
            Success or error message.

        Example:
            nb_patch_field("abc123", '{"description":"Enter full name","required":true}')
        """
        nb = get_nb_client()
        kwargs = safe_json(props)

        patch = {}
        eis = {}
        for k, v in kwargs.items():
            if k == "description":
                eis["description"] = {"description": v}
            elif k == "defaultValue":
                eis["initialValue"] = {"defaultValue": v}
            elif k == "placeholder":
                eis["placeholder"] = {"placeholder": v}
            elif k == "tooltip":
                eis["tooltip"] = {"tooltip": v}
            elif k in ("hidden", "disabled"):
                eis[k] = {k: bool(v)}
            elif k == "required":
                eis["required"] = {"required": bool(v)}
            elif k == "pattern":
                eis["pattern"] = {"pattern": v}
        if eis:
            patch["stepParams"] = {"editItemSettings": eis}
        if not patch:
            return "No valid properties to patch"

        ok = nb.update(uid, patch)
        return f"Patched {uid}: {list(kwargs.keys())}" if ok else f"Failed to patch {uid}"

    @mcp.tool()
    def nb_patch_column(uid: str, props: str) -> str:
        """Modify properties of a table column.

        Args:
            uid: TableColumnModel UID
            props: JSON object of properties. Supported keys:
                - width: Column width in pixels (int)
                - title: Column header title (str)

        Returns:
            Success or error message.

        Example:
            nb_patch_column("abc123", '{"width":120,"title":"New Title"}')
        """
        nb = get_nb_client()
        kwargs = safe_json(props)

        patch = {}
        tcs = {}
        if "width" in kwargs:
            tcs["width"] = {"width": kwargs["width"]}
        if "title" in kwargs:
            tcs["title"] = {"title": kwargs["title"]}
        if tcs:
            patch["stepParams"] = {"tableColumnSettings": tcs}
        if not patch:
            return "No valid properties to patch"

        ok = nb.update(uid, patch)
        return f"Patched column {uid}: {list(kwargs.keys())}" if ok else f"Failed to patch {uid}"

    @mcp.tool()
    def nb_add_field(form_grid_uid: str, collection: str, field: str,
                     after: Optional[str] = None, required: bool = False) -> str:
        """Add a field to an existing form.

        Args:
            form_grid_uid: FormGridModel UID (locate with nb_locate_node)
            collection: Collection name
            field: Field name to add
            after: Insert after this field name. None = append at end.
            required: Mark as required field

        Returns:
            JSON with field_uid.
        """
        nb = get_nb_client()
        pt = PageTool(nb)
        model = pt._model_by_uid(form_grid_uid)
        if not model:
            return f"FormGridModel {form_grid_uid} not found"

        cm = pt._children_map()
        children = cm.get(form_grid_uid, [])
        max_sort = max((c.get("sortIndex", 0) for c in children), default=-1) + 1

        if after:
            for c in children:
                fp = c.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                if fp == after:
                    max_sort = c.get("sortIndex", 0) + 1
                    break

        fi = nb.form_field(form_grid_uid, collection, field, max_sort, required=required)

        # Update gridSettings
        gs = model.get("stepParams", {}).get("gridSettings", {}).get("grid", {})
        rows = gs.get("rows", {})
        sizes = gs.get("sizes", {})
        new_row_id = uid()
        rows[new_row_id] = [[fi]]
        sizes[new_row_id] = [24]
        nb.update(form_grid_uid, {"stepParams": {"gridSettings": {"grid": {"rows": rows, "sizes": sizes}}}})

        return json.dumps({"field_uid": fi})

    @mcp.tool()
    def nb_remove_field(uid: str) -> str:
        """Remove a form field (FormItemModel and its children).

        Note: Does not automatically update parent FormGridModel's gridSettings.
        For a clean result, consider clean_tab + rebuild.

        Args:
            uid: FormItemModel UID to remove

        Returns:
            Success message.
        """
        nb = get_nb_client()
        count = nb.destroy_tree(uid)
        return f"Removed field {uid} ({count} nodes deleted)"

    @mcp.tool()
    def nb_add_column(table_uid: str, collection: str, field: str,
                      width: Optional[int] = None) -> str:
        """Add a column to an existing table.

        Args:
            table_uid: TableBlockModel UID
            collection: Collection name
            field: Field name for the new column
            width: Optional fixed column width in pixels

        Returns:
            JSON with column_uid.
        """
        nb = get_nb_client()
        pt = PageTool(nb)
        cm = pt._children_map()
        children = [c for c in cm.get(table_uid, []) if c.get("subKey") == "columns"]
        sort = max((c.get("sortIndex", 0) for c in children), default=-1) + 1
        cu, fu = nb.col(table_uid, collection, field, sort, width=width)
        return json.dumps({"column_uid": cu})

    @mcp.tool()
    def nb_remove_column(uid: str) -> str:
        """Remove a table column and its children.

        Args:
            uid: TableColumnModel UID to remove

        Returns:
            Success message.
        """
        nb = get_nb_client()
        count = nb.destroy_tree(uid)
        return f"Removed column {uid} ({count} nodes deleted)"

    @mcp.tool()
    def nb_read_node(uid: str, include: str = "all") -> str:
        """Read complete configuration of a FlowModel node for debugging.

        Use this after nb_inspect_page or nb_show_page to drill into a
        specific node's configuration: event flows, JS code, linkage rules,
        field settings, etc.

        Args:
            uid: FlowModel node UID (from nb_inspect_page, nb_show_page,
                 or nb_locate_node)
            include: What data to return:
                - "all" — stepParams + flowRegistry (event flows)
                - "events" — only flowRegistry with full JS code
                - "js" — only jsSettings code
                - "linkage" — only buttonSettings.linkageRules
                - "params" — only stepParams keys summary

        Returns:
            JSON with the requested configuration data.

        Example:
            nb_read_node("abc123")                    # full config
            nb_read_node("form_uid", "events")        # see event flow code
            nb_read_node("js_col_uid", "js")          # see JS column code
            nb_read_node("button_uid", "linkage")     # see linkage rules
        """
        nb = get_nb_client()
        try:
            data = nb._get_json(f"api/flowModels:get?filterByTk={uid}")
        except Exception:
            return f"Node {uid} not found"
        if not data:
            return f"Node {uid} not found"

        sp = data.get("stepParams", {}) or {}
        fr = data.get("flowRegistry", {}) or {}
        result = {"uid": uid, "use": data.get("use", "?")}

        if include == "events":
            events = []
            for k, v in fr.items():
                if not v:
                    continue
                evt = {
                    "key": k,
                    "event": v.get("on", {}).get("eventName", "?"),
                    "title": v.get("title", ""),
                }
                for sk, sv in v.get("steps", {}).items():
                    evt["code"] = sv.get("defaultParams", {}).get("code", "")
                events.append(evt)
            result["events"] = events
            if not events:
                result["note"] = "No event flows on this node"

        elif include == "js":
            js = sp.get("jsSettings", {}) or {}
            code = js.get("runJs", {}).get("code", "")
            result["code"] = code
            result["code_length"] = len(code)
            if not code:
                result["note"] = "No JS code on this node"

        elif include == "linkage":
            bs = sp.get("buttonSettings", {})
            lr = bs.get("linkageRules", {}).get("value", [])
            result["linkageRules"] = lr
            result["buttonTitle"] = bs.get("general", {}).get("title", "")
            if not lr:
                result["note"] = "No linkage rules on this node"

        elif include == "params":
            result["stepParams_keys"] = list(sp.keys())
            summary = {}
            for k, v in sp.items():
                if isinstance(v, dict) and len(json.dumps(v)) < 200:
                    summary[k] = v
                elif isinstance(v, dict):
                    summary[k] = f"({len(json.dumps(v))} chars)"
                else:
                    summary[k] = v
            result["stepParams_summary"] = summary
            has_events = any(fr.values()) if fr else False
            result["has_events"] = has_events

        else:  # "all"
            result["stepParams"] = sp
            events = []
            for k, v in fr.items():
                if not v:
                    continue
                evt = {
                    "key": k,
                    "event": v.get("on", {}).get("eventName", "?"),
                }
                for sk, sv in v.get("steps", {}).items():
                    code = sv.get("defaultParams", {}).get("code", "")
                    evt["code"] = code[:500] + "..." if len(code) > 500 else code
                events.append(evt)
            if events:
                result["events"] = events

        return json.dumps(result, ensure_ascii=False, indent=2)

    @mcp.tool()
    def nb_list_pages() -> str:
        """List all flowPage pages with their tab UIDs and paths.

        Returns:
            Formatted list of pages.
        """
        nb = get_nb_client()
        pt = PageTool(nb)
        pages = pt.pages()
        if not pages:
            return "No pages found"
        lines = [f"{'Path':<40} {'Tab UID':<15} {'Route ID'}"]
        lines.append(f"{'─'*40} {'─'*15} {'─'*10}")
        for p in pages:
            lines.append(f"{p['path']:<40} {p['tab_uid'] or 'N/A':<15} {p['route_id']}")
        return "\n".join(lines)
