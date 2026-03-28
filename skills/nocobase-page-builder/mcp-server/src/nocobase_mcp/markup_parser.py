"""XML markup parser for NocoBase page building.

Parses HTML-like XML markup into TreeNode trees for NocoBase FlowModel pages.
JS nodes are created as description-only placeholders — no actual JS code.

Usage:
    parser = PageMarkupParser(nb)
    root, meta = parser.parse(tab_uid, '<page collection="users">...</page>')
    nb.save_nested(root, tab_uid, filter_manager=meta.pop("_filter_manager", None))

Supported tags:
    <page>          Root element, sets default collection
    <row>           Horizontal layout row (children split by span)
    <stack>         Vertical stack within a column
    <kpi>           KPI statistic card
    <filter>        Filter form block
    <table>         Table block with columns
    <js-col>        JS column placeholder (text = description)
    <js-block>      JS block placeholder (text = description)
    <js-item>       JS item placeholder (text = description)
    <addnew>        AddNew form popup
    <edit>          Edit form popup
    <detail>        Detail popup with tabs
    <tab>           Tab within detail popup
    <subtable>      Association sub-table
    <event>         Event flow placeholder
    <form>          Standalone form block
    <detail-block>  Standalone detail block
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any, TYPE_CHECKING

from .tree_builder import TreeNode, TreeBuilder
from .utils import uid

if TYPE_CHECKING:
    from .client import NB


def _fix_boolean_attrs(markup: str) -> str:
    """Convert HTML boolean attributes to XML-compatible form.

    XML doesn't support valueless attributes like `required` or `disabled`.
    Converts `required` → `required="true"`, etc.
    """
    # Match word-boundary boolean attrs NOT followed by = (which means they already have a value)
    bool_attrs = r'\b(required|disabled|readonly|hidden)\b(?!=)'
    return re.sub(bool_attrs, r'\1="true"', markup)


def _sanitize_markup(markup: str) -> str:
    """Escape XML-special characters in text content of JS/event tags.

    AI agents often write descriptions like "over 100k <red" or "A & B" inside
    <js-col>, <js-block>, <js-item>, <event> tags. These break XML parsing.
    This pre-processor escapes & and < in the text content of those tags.
    Also fixes HTML boolean attributes for XML compatibility.
    """
    markup = _fix_boolean_attrs(markup)

    def _escape_text(m: re.Match) -> str:
        opening = m.group(1)
        text = m.group(2)
        closing = m.group(3)
        # Escape & first (before introducing new &), then <
        text = text.replace("&", "&amp;").replace("<", "&lt;")
        return opening + text + closing

    tags = r"js-col|js-block|js-item|event"
    pattern = rf"(<(?:{tags})\b[^>]*>)(.*?)(</(?:{tags})>)"
    return re.sub(pattern, _escape_text, markup, flags=re.DOTALL)


def validate_grid_layout(dsl: str, context: str = "form") -> None:
    """Validate that fields DSL uses grid layout (pipe syntax for side-by-side).

    Raises ValueError if more than 3 field rows exist but none use pipe
    separators — this means all fields are single-column, which is bad layout.

    Args:
        dsl: Fields DSL string
        context: "form" or "detail" for error message
    """
    if not dsl or not dsl.strip():
        return

    lines = dsl.strip().split('\n')
    field_lines = [l for l in lines
                   if l.strip() and not l.strip().startswith('---')
                   and not l.strip().startswith('#')]

    if len(field_lines) <= 3:
        return  # Too few fields to enforce

    has_grid = any('|' in l for l in field_lines)
    if not has_grid:
        raise ValueError(
            f"Bad {context} layout: {len(field_lines)} fields all single-column. "
            f"MUST use <row> for grid layout.\n\n"
            f"Example:\n"
            f"  <section title=\"Basic Info\">\n"
            f"    <row><field name=\"employee_no\" required /><field name=\"name\" required /></row>\n"
            f"    <row><field name=\"gender\" /><field name=\"phone\" /></row>\n"
            f"    <field name=\"email\" />\n"
            f"  </section>\n"
            f"  <section title=\"Work Info\">\n"
            f"    <row><field name=\"department_id\" /><field name=\"position_id\" /></row>\n"
            f"    <row><field name=\"entry_date\" /><field name=\"status\" /></row>\n"
            f"  </section>\n\n"
            f"Rules: <row> wraps fields that should be side-by-side. "
            f"<field> outside <row> = full-width row."
        )


def parse_form_html(markup: str) -> str:
    """Convert <form> HTML markup to fields DSL string.

    Uses standard <row> tags for grid layout:
      - <row> wraps fields that should be side-by-side
      - <field> outside <row> = full-width row
      - <section title="X"> = visual group header

    Example input:
        <form>
          <section title="Basic Info">
            <row><field name="employee_no" required /><field name="name" required /></row>
            <row><field name="gender" /><field name="phone" /></row>
            <field name="email" />
          </section>
          <section title="Work Info">
            <row><field name="department_id" /><field name="position_id" /></row>
            <row><field name="entry_date" /><field name="status" /></row>
          </section>
        </form>

    Returns:
        "--- Basic Info\\nemployee_no* | name*\\ngender | phone\\nemail\\n--- Work Info\\n..."
    """
    markup = _fix_boolean_attrs(markup)
    root = ET.fromstring(markup)
    if root.tag != "form":
        raise ValueError(f"Root element must be <form>, got <{root.tag}>")

    lines: list[str] = []
    _process_form_children(root, lines)
    return '\n'.join(lines)


def _process_form_children(parent: ET.Element, lines: list[str]) -> None:
    """Recursively process form children into DSL lines."""
    for el in parent:
        if el.tag == "section":
            title = el.get("title", "")
            if title:
                lines.append(f"--- {title}")
            _process_form_children(el, lines)

        elif el.tag == "row":
            # All <field> children are side-by-side
            fields = []
            for child in el:
                if child.tag == "field":
                    fields.append(_field_to_dsl(child))
            if fields:
                lines.append(' | '.join(fields))

        elif el.tag == "field":
            # Single field = full-width row
            lines.append(_field_to_dsl(el))


def _field_to_dsl(el: ET.Element) -> str:
    """Convert a <field> element to DSL token: 'name' or 'name*'."""
    name = el.get("name", "")
    required = "required" in el.attrib
    return f"{name}*" if required else name


def parse_detail_html(markup: str) -> list[dict]:
    """Convert <detail> HTML markup to tab definitions list.

    Uses <row> for grid layout, same as form markup.

    Example input:
        <detail>
          <tab title="Overview">
            <section title="Basic Info">
              <row><field name="employee_no" /><field name="name" /></row>
              <row><field name="gender" /><field name="phone" /></row>
            </section>
            <js-item title="Profile">Level tags + status</js-item>
          </tab>
          <tab title="Attendance" assoc="attendance" collection="nb_hrm_attendance"
               fields="date,status,check_in" />
        </detail>

    Returns:
        [
            {"title": "Overview", "fields": "--- Basic Info\\nemployee_no | name\\ngender | phone",
             "js_items": [{"title": "Profile", "desc": "Level tags + status"}]},
            {"title": "Attendance", "assoc": "attendance", "coll": "nb_hrm_attendance",
             "fields": ["date", "status", "check_in"]}
        ]
    """
    markup = _sanitize_markup(markup)
    root = ET.fromstring(markup)
    if root.tag != "detail":
        raise ValueError(f"Root element must be <detail>, got <{root.tag}>")

    tabs: list[dict] = []
    for tab_el in root:
        if tab_el.tag != "tab":
            continue
        tabs.append(_build_tab_def_xml(tab_el))

    return tabs


def _build_tab_def_xml(tab_el: ET.Element) -> dict:
    """Build a single tab definition from a <tab> XML element."""
    tab: dict = {"title": tab_el.get("title", "Tab")}

    # Subtable tab (has assoc attribute)
    if tab_el.get("assoc"):
        tab["assoc"] = tab_el.get("assoc", "")
        tab["coll"] = tab_el.get("collection", "")
        fields_str = tab_el.get("fields", "")
        tab["fields"] = [f.strip() for f in fields_str.split(",") if f.strip()]
        return tab

    # Field-based tab: parse children into DSL lines
    field_lines: list[str] = []
    js_items: list[dict] = []

    _parse_detail_tab_children(tab_el, field_lines, js_items)

    tab["fields"] = '\n'.join(field_lines)
    if js_items:
        tab["js_items"] = js_items

    return tab


def _parse_detail_tab_children(
    parent: ET.Element, field_lines: list[str], js_items: list[dict]
) -> None:
    """Recursively parse tab/section children into DSL lines and js_items."""
    for el in parent:
        if el.tag == "section":
            title = el.get("title", "")
            if title:
                field_lines.append(f"--- {title}")
            _parse_detail_tab_children(el, field_lines, js_items)

        elif el.tag == "row":
            # All <field> children are side-by-side
            fields = [_field_to_dsl(f) for f in el if f.tag == "field"]
            if fields:
                field_lines.append(' | '.join(fields))

        elif el.tag == "field":
            # Single field = full-width row
            field_lines.append(_field_to_dsl(el))

        elif el.tag == "js-item":
            title = el.get("title", "JS Item")
            desc = (el.text or "").strip()
            js_items.append({"title": title, "desc": desc})


class PageMarkupParser:
    """Parse XML markup into TreeNode tree + metadata."""

    def __init__(self, nb: NB):
        self.nb = nb
        self.tb = TreeBuilder(nb)

    def parse(self, tab_uid: str, markup: str) -> tuple[TreeNode, dict]:
        """Parse XML markup into (TreeNode root, meta dict).

        Args:
            tab_uid: Tab UID for context (used in meta, not in tree)
            markup: XML string with <page> root element

        Returns:
            (root TreeNode, meta dict with grid_uid, node_count, _filter_manager, etc.)
        """
        markup = _sanitize_markup(markup)
        page_el = ET.fromstring(markup)
        if page_el.tag != "page":
            raise ValueError(f"Root element must be <page>, got <{page_el.tag}>")

        coll = page_el.get("collection", "")
        if coll:
            self.tb._load_meta(coll)

        root = TreeNode("BlockGridModel", {}, 0)
        meta: dict[str, Any] = {"grid_uid": root.uid}
        block_map: dict[str, TreeNode] = {}  # id → TreeNode
        filter_bindings: list[tuple[str, str]] = []  # (filter_id, target_id)

        # Parse children into rows
        all_rows: list[list[tuple[TreeNode | list[TreeNode], int]]] = []

        sort_idx = 0
        for child in page_el:
            if child.tag == "row":
                row_items = self._parse_row_children(
                    child, coll, root, block_map, filter_bindings, meta, sort_idx)
                all_rows.append(row_items)
                sort_idx += len(row_items)
            else:
                # Non-row top-level element → auto full-width row
                node, s_idx = self._parse_element(
                    child, coll, root, block_map, filter_bindings, meta, sort_idx)
                if node:
                    all_rows.append([(node, 24)])
                    sort_idx = s_idx

        # Build gridSettings
        rows_dict, sizes_dict = {}, {}
        for row_items in all_rows:
            if not row_items:
                continue
            row_id = uid()
            row_cols, row_sizes = [], []
            for item, span in row_items:
                if isinstance(item, list):
                    # Stacked column
                    row_cols.append([n.uid for n in item])
                else:
                    row_cols.append([item.uid])
                row_sizes.append(span)
            rows_dict[row_id] = row_cols
            sizes_dict[row_id] = row_sizes

        root.step_params = {"gridSettings": {"grid": {
            "rows": rows_dict, "sizes": sizes_dict}}}

        # Build filterManager + patch stats target UID
        # Each filter item gets its own filterConfigs entry (one item → one field path)
        filter_managers = []
        for filt_id, tgt_id in filter_bindings:
            fnode = block_map.get(filt_id)
            tnode = block_map.get(tgt_id)
            if not fnode or not tnode:
                continue
            if hasattr(fnode, "_filter_item_configs"):
                # New format: per-item configs
                for cfg in fnode._filter_item_configs:
                    filter_managers.append({
                        "filterId": cfg["uid"],
                        "targetId": tnode.uid,
                        "filterPaths": [cfg["field"]],
                    })
            elif hasattr(fnode, "_filter_item_uid"):
                # Legacy fallback: single entry with all paths
                filter_managers.append({
                    "filterId": fnode._filter_item_uid,
                    "targetId": tnode.uid,
                    "filterPaths": fnode._filter_paths,
                })
                # Patch stats JSItem target placeholder with real table UID
                if hasattr(fnode, "_stats_uid"):
                    self._patch_stats_target(fnode, tnode.uid)
        if filter_managers:
            meta["_filter_manager"] = filter_managers

        meta["node_count"] = root.count_nodes()

        # Validate layout quality
        self._validate_layout(page_el, coll)

        return root, meta

    @staticmethod
    def _patch_stats_target(filter_node, target_uid: str) -> None:
        """Replace _TARGET_PLACEHOLDER_ in the stats JSItem code with real table UID."""
        def walk(node):
            if node.use == "JSItemModel":
                code = node.step_params.get("jsSettings", {}).get("runJs", {}).get("code", "")
                if "_TARGET_PLACEHOLDER_" in code:
                    node.step_params["jsSettings"]["runJs"]["code"] = code.replace(
                        "_TARGET_PLACEHOLDER_", target_uid)
                    return True
            for v in node._sub_models.values():
                items = v if isinstance(v, list) else [v]
                for child in items:
                    if walk(child):
                        return True
            return False
        walk(filter_node)

    def _validate_layout(self, page_el: ET.Element, coll: str) -> None:
        """Check page structure and emit warnings for common layout issues."""
        has_table = False
        table_in_row = False
        has_js_block = False

        for child in page_el:
            if child.tag == "table":
                has_table = True
            elif child.tag == "row":
                for rc in child:
                    if rc.tag == "table":
                        has_table = True
                        table_in_row = True
                    elif rc.tag == "stack":
                        for sc in rc:
                            if sc.tag == "table":
                                has_table = True
                                table_in_row = True
                            elif sc.tag in ("js-block", "js-item"):
                                has_js_block = True
                    elif rc.tag in ("js-block", "js-item"):
                        has_js_block = True
            elif child.tag in ("js-block", "js-item"):
                has_js_block = True

        # Warn: table not in <row> (no side-by-side layout)
        if has_table and not table_in_row:
            self.nb.warnings.append(
                "LAYOUT: <table> is not inside a <row> — page has no side-by-side layout. "
                "Wrap table in <row> with span and add a <stack> sidebar with <js-block> charts. "
                "Example: <row><table span=\"16\" .../><stack span=\"8\"><js-block>chart</js-block></stack></row>"
            )

        # Warn: no js-block on a page with tables (pure CRUD)
        if has_table and not has_js_block:
            self.nb.warnings.append(
                "LAYOUT: Page has <table> but no <js-block> — this is a plain CRUD list. "
                "Add 1-2 <js-block> chart/stat placeholders in a sidebar <stack> to make "
                "the page more useful. Every non-reference page should have visualizations."
            )

    def _parse_row_children(
        self, row_el: ET.Element, coll: str, root: TreeNode,
        block_map: dict, filter_bindings: list, meta: dict, sort_idx: int
    ) -> list[tuple[TreeNode | list[TreeNode], int]]:
        """Parse children of a <row> element. Returns [(node_or_stack, span), ...]."""
        children = list(row_el)
        n = len(children)
        default_span = 24 // n if n > 0 else 24
        items = []

        for child in children:
            span = int(child.get("span", default_span))

            if child.tag == "stack":
                stack_nodes = []
                for sc in child:
                    node, sort_idx = self._parse_element(
                        sc, coll, root, block_map, filter_bindings, meta, sort_idx)
                    if node:
                        stack_nodes.append(node)
                if stack_nodes:
                    items.append((stack_nodes, span))
            else:
                node, sort_idx = self._parse_element(
                    child, coll, root, block_map, filter_bindings, meta, sort_idx)
                if node:
                    items.append((node, span))

        return items

    def _parse_element(
        self, el: ET.Element, default_coll: str, root: TreeNode,
        block_map: dict, filter_bindings: list, meta: dict, sort_idx: int
    ) -> tuple[TreeNode | None, int]:
        """Parse a single XML element into a TreeNode. Returns (node, next_sort_idx)."""
        tag = el.tag
        coll = el.get("collection", default_coll)
        el_id = el.get("id", "")

        node: TreeNode | None = None

        if tag == "kpi":
            title = el.get("title", "Count")
            # Auto-detect misuse: chart/visualization titles should be <js-block>
            _viz_keywords = ("distribution", "funnel", "statistics", "alert", "queue", "activity",
                             "progress", "ranking", "trend", "comparison", "analysis", "chart",
                             "pipeline", "funnel", "alert", "distribution")
            if any(kw in title.lower() for kw in _viz_keywords):
                # Auto-convert to js-block placeholder
                desc = (el.text or "").strip() or f"{title} (auto-converted from <kpi>)"
                m = {"collection": coll} if coll else {}
                node = self.tb.placeholder_js_block(title, desc, meta=m, sort=sort_idx)
                self.nb.warnings.append(
                    f'<kpi title="{title}"> auto-converted to <js-block>: '
                    f'title contains visualization keyword. Use <kpi> only for simple counts.'
                )
            else:
                filter_str = el.get("filter")
                filter_ = self._parse_kpi_filter(filter_str) if filter_str else None
                color = el.get("color")
                node = self.tb.kpi_block(title, coll, filter_=filter_,
                                         color=color, sort=sort_idx)

        elif tag == "filter":
            fields = self._split_fields(el.get("fields", "name"))
            target = el.get("target", "")
            stats = el.get("stats", "")
            node = self.tb.filter_form(coll, fields,
                                        stats_field=stats or None,
                                        sort=sort_idx)
            if target:
                filter_bindings.append((el_id or f"_filter_{sort_idx}", target))

        elif tag == "table":
            fields = self._split_fields(el.get("fields", ""))
            title = el.get("title")
            first_click = el.get("first_click", "true").lower() != "false"
            node = self.tb.table_block(coll, fields, first_click=first_click,
                                       title=title, sort=sort_idx)

            # Process table children: js-col, addnew, edit, detail
            js_col_sort = len(fields) + 1
            has_addnew = False
            has_edit = False
            has_detail = False
            for child in el:
                if child.tag == "js-col":
                    jc_node = self._parse_js_col(child, js_col_sort)
                    node.add_child("columns", "array", jc_node)
                    js_col_sort += 1

                elif child.tag == "addnew":
                    has_addnew = True
                    addnew_fields_dsl = child.get("fields", "") or self._form_children_to_dsl(child)
                    if addnew_fields_dsl and hasattr(node, "_addnew"):
                        addnew_cp = self.tb.addnew_form(coll, addnew_fields_dsl)
                        node._addnew.add_child("page", "object", addnew_cp)
                        meta[f"{el_id or 'table'}_create_form"] = addnew_cp._create_form_uid
                        # Events on addnew form
                        self._parse_events(child, addnew_cp)

                elif child.tag == "edit":
                    has_edit = True
                    edit_fields_dsl = child.get("fields", "") or self._form_children_to_dsl(child)
                    if edit_fields_dsl and hasattr(node, "_actcol"):
                        edit_node = self.tb.edit_action(coll, edit_fields_dsl)
                        node._actcol.add_child("actions", "array", edit_node)
                        meta[f"{el_id or 'table'}_edit_form"] = edit_node._edit_form_uid
                        # Events on edit form
                        self._parse_events(child, edit_node)

                elif child.tag == "detail":
                    has_detail = True
                    click_field = getattr(node, "_click_field", None)
                    if click_field:
                        tabs = self._parse_detail(child, coll)
                        click_field.step_params["popupSettings"]["openView"].update({
                            "collectionName": coll, "dataSourceKey": "main",
                            "mode": "drawer", "size": "large",
                            "pageModelClass": "ChildPageModel",
                            "uid": click_field.uid,
                        })
                        popup_cp = self.tb.detail_popup(coll, tabs)
                        click_field.add_child("page", "object", popup_cp)

            # Auto-generate composite column if missing
            has_composite = any(
                child.tag == "js-col" and child.get("type") == "composite"
                for child in el
            )
            if not has_composite and coll:
                auto_composite = self._auto_composite_col(coll, js_col_sort)
                if auto_composite:
                    node.add_child("columns", "array", auto_composite)
                    js_col_sort += 1

            # Auto-generate missing forms with all editable fields
            if coll and (not has_addnew or not has_edit or not has_detail):
                editable = self._get_editable_fields(coll)
                if editable:
                    auto_dsl = self._auto_form_dsl(editable)

                    if not has_addnew and hasattr(node, "_addnew"):
                        addnew_cp = self.tb.addnew_form(coll, auto_dsl)
                        node._addnew.add_child("page", "object", addnew_cp)
                        meta[f"{el_id or 'table'}_create_form"] = addnew_cp._create_form_uid

                    if not has_edit and hasattr(node, "_actcol"):
                        edit_node = self.tb.edit_action(coll, auto_dsl)
                        node._actcol.add_child("actions", "array", edit_node)
                        meta[f"{el_id or 'table'}_edit_form"] = edit_node._edit_form_uid

                    if not has_detail and getattr(node, "_click_field", None):
                        click_field = node._click_field
                        all_display = self._get_all_display_fields(coll)
                        detail_dsl = self._auto_form_dsl(all_display) if all_display else auto_dsl
                        click_field.step_params["popupSettings"]["openView"].update({
                            "collectionName": coll, "dataSourceKey": "main",
                            "mode": "drawer", "size": "large",
                            "pageModelClass": "ChildPageModel",
                            "uid": click_field.uid,
                        })
                        popup_cp = self.tb.detail_popup(coll, [{"title": "Details", "fields": detail_dsl}])
                        click_field.add_child("page", "object", popup_cp)

        elif tag == "js-block":
            title = el.get("title", "JS Block")
            desc = (el.text or "").strip()
            m = {}
            if coll:
                m["collection"] = coll
            node = self.tb.placeholder_js_block(title, desc, meta=m, sort=sort_idx)

        elif tag == "js-item":
            title = el.get("title", "JS Item")
            desc = (el.text or "").strip()
            node = self.tb.placeholder_js_item(title, desc, sort=sort_idx)

        elif tag == "chart":
            title = el.get("title", "Chart")
            sql = el.get("sql", "")
            option = el.get("option", "")
            events = el.get("events", "")
            # SQL and option can also be in child text elements
            for sub in el:
                if sub.tag == "sql":
                    sql = (sub.text or "").strip()
                elif sub.tag == "option":
                    option = (sub.text or "").strip()
                elif sub.tag == "events":
                    events = (sub.text or "").strip()
            # If no explicit sql/option, use text content as description placeholder
            if not sql and not option:
                desc = (el.text or "").strip()
                m = {"collection": coll} if coll else {}
                m["chart_title"] = title
                node = self.tb.placeholder_js_block(title, f"[chart] {desc}", meta=m, sort=sort_idx)
            else:
                # Create real ChartBlockModel via NB client
                chart_uid = self.nb.chart(
                    "__PARENT_PLACEHOLDER__", sql, option,
                    title=title, sort=sort_idx, events_js=events)
                # Create a TreeNode wrapper so it integrates with the tree
                from .tree_builder import TreeNode
                sp = {
                    "chartSettings": {
                        "configure": {
                            "query": {"mode": "sql", "sql": sql},
                            "chart": {"option": {"mode": "custom", "raw": option}},
                        }
                    }
                }
                if title:
                    sp["chartSettings"]["configure"]["title"] = title
                if events:
                    sp["chartSettings"]["configure"]["chart"]["events"] = {
                        "mode": "custom", "raw": events
                    }
                node = TreeNode("ChartBlockModel", sp, sort_idx)
                node.uid = chart_uid  # Use the UID from nb.chart()
                node._is_chart = True  # Flag for save_nested to skip (already saved)
                node._chart_sql = sql
                node._chart_data_source = el.get("data-source", "main")

        elif tag == "form":
            mode = el.get("mode", "create")
            fields_dsl = el.get("fields", "")
            title = el.get("title")
            req_str = el.get("required", "")
            required = set(req_str.split(",")) if req_str else None
            node = self.tb.form_block(coll, fields_dsl, mode=mode, title=title,
                                      required=required, sort=sort_idx)
            self._parse_events(el, node)

        elif tag == "detail-block":
            fields_dsl = el.get("fields", "")
            title = el.get("title")
            node = self.tb.detail_block(coll, fields_dsl, title=title, sort=sort_idx)

        elif tag == "subtable":
            assoc = el.get("assoc", "")
            sub_coll = el.get("collection", "")
            fields = self._split_fields(el.get("fields", ""))
            title = el.get("title")
            node = self.tb._sub_table_node(default_coll, assoc, sub_coll,
                                           fields, title, sort_idx)

        else:
            # Unknown tag — skip
            return None, sort_idx

        if node:
            root.add_child("items", "array", node)
            if el_id:
                block_map[el_id] = node
            elif tag == "filter":
                block_map[f"_filter_{sort_idx}"] = node
            meta[f"{el_id or tag}_{sort_idx}_uid"] = node.uid
            sort_idx += 1

        return node, sort_idx

    def _parse_js_col(self, el: ET.Element, sort: int) -> TreeNode:
        """Parse <js-col> → placeholder_js_col TreeNode."""
        title = el.get("title", "JS Column")
        field = el.get("field", "")
        col_type = el.get("type")
        width = int(el.get("width", "120"))
        desc = (el.text or "").strip()
        subs = el.get("subs")
        threshold = el.get("threshold")
        m: dict[str, Any] = {}
        if subs:
            m["subs"] = subs
        if threshold:
            m["threshold"] = threshold
        return self.tb.placeholder_js_col(title, field, desc, col_type=col_type,
                                          meta=m, sort=sort, width=width)

    def _parse_tab_child(self, el: ET.Element, coll: str,
                         row_idx: int | None = None) -> list[dict]:
        """Parse a single child element inside a <tab> into block def(s).

        Supports the same elements as _parse_element (kpi, filter, js-block,
        detail-block, form, subtable, js-item) plus <row> for layout grouping.

        Returns a list of block defs (usually 1, but <row> returns multiple
        with _row/_span markers for multi-row layout in _build_tab_blocks).
        """
        tag = el.tag
        el_coll = el.get("collection", coll)

        if tag == "subtable":
            sub_coll = el.get("collection", "")
            sub_fields = self._split_fields(el.get("fields", ""))
            assoc = el.get("assoc", "")
            blk: dict[str, Any] = {
                "type": "sub_table", "assoc": assoc,
                "coll": sub_coll, "fields": sub_fields,
                "title": el.get("title"),
            }
            if row_idx is not None:
                blk["_row"] = row_idx
                blk["_span"] = int(el.get("span", 0)) or None
            return [blk]

        elif tag == "js-item":
            title = el.get("title", "JS Item")
            desc = (el.text or "").strip()
            code = self.tb._placeholder_code(title, desc, "item")
            blk = {"type": "js", "title": title, "code": code,
                   "collection": el_coll}
            if row_idx is not None:
                blk["_row"] = row_idx
                blk["_span"] = int(el.get("span", 0)) or None
            return [blk]

        elif tag == "js-block":
            title = el.get("title", "JS Block")
            desc = (el.text or "").strip()
            code = self.tb._placeholder_code(title, desc, "block")
            blk = {"type": "js", "title": title, "code": code,
                   "collection": el_coll}
            if row_idx is not None:
                blk["_row"] = row_idx
                blk["_span"] = int(el.get("span", 0)) or None
            return [blk]

        elif tag == "kpi":
            title = el.get("title", "Count")
            filter_str = el.get("filter")
            filter_ = self._parse_kpi_filter(filter_str) if filter_str else None
            color = el.get("color")
            blk = {"type": "kpi", "title": title, "collection": el_coll,
                   "filter": filter_, "color": color}
            if row_idx is not None:
                blk["_row"] = row_idx
                blk["_span"] = int(el.get("span", 0)) or None
            return [blk]

        elif tag == "filter":
            fields = self._split_fields(el.get("fields", "name"))
            blk = {"type": "filter", "collection": el_coll, "fields": fields}
            if row_idx is not None:
                blk["_row"] = row_idx
                blk["_span"] = int(el.get("span", 0)) or None
            return [blk]

        elif tag == "detail-block":
            fields_dsl = el.get("fields", "")
            title = el.get("title")
            blk = {"type": "details", "fields": fields_dsl,
                   "collection": el_coll}
            if title:
                blk["title"] = title
            if row_idx is not None:
                blk["_row"] = row_idx
                blk["_span"] = int(el.get("span", 0)) or None
            return [blk]

        elif tag == "form":
            fields_dsl = el.get("fields", "")
            req_str = el.get("required", "")
            required = list(req_str.split(",")) if req_str else []
            blk = {"type": "form", "fields": fields_dsl,
                   "collection": el_coll, "required": required}
            if row_idx is not None:
                blk["_row"] = row_idx
                blk["_span"] = int(el.get("span", 0)) or None
            return [blk]

        elif tag == "row":
            # <row> groups children into a single layout row with spans
            result = []
            # Use a unique row index for grouping
            r_idx = id(el)  # unique per <row> element
            for child in el:
                child_blocks = self._parse_tab_child(child, coll,
                                                      row_idx=r_idx)
                result.extend(child_blocks)
            return result

        return []

    def _parse_detail(self, detail_el: ET.Element, coll: str) -> list[dict]:
        """Parse <detail> → list of tab defs for detail_popup().

        Supports the same block types as page-level _parse_element inside
        <tab> children: kpi, filter, js-block, detail-block, form, subtable,
        js-item, and <row> for side-by-side layout.
        """
        tabs = []
        for tab_el in detail_el:
            if tab_el.tag != "tab":
                continue
            tab_title = tab_el.get("title", "Tab")
            fields_dsl = tab_el.get("fields", "")
            tab_def: dict[str, Any] = {"title": tab_title}

            blocks: list[dict] = []
            has_fields = bool(fields_dsl)

            if has_fields:
                blocks.append({"type": "details", "fields": fields_dsl})

            for child in tab_el:
                child_blocks = self._parse_tab_child(child, coll)
                blocks.extend(child_blocks)

            if blocks:
                if len(blocks) == 1 and blocks[0]["type"] == "details":
                    tab_def["fields"] = fields_dsl
                else:
                    tab_def["blocks"] = blocks
                    if not has_fields:
                        tab_def["fields"] = ""
            else:
                tab_def["fields"] = fields_dsl

            tabs.append(tab_def)

        if not tabs:
            fields_dsl = detail_el.get("fields", "")
            tabs = [{"title": "Details", "fields": fields_dsl}]

        return tabs

    @staticmethod
    def _form_children_to_dsl(form_el: ET.Element) -> str:
        """Convert <section>/<row>/<field> XML children inside <addnew>/<edit> to pipe DSL.

        <addnew>
          <section title="Basic Info">
            <row><field name="a" required /><field name="b" /></row>
            <field name="c" />
          </section>
          <section title="Work">
            <row><field name="d" /><field name="e" /></row>
          </section>
        </addnew>
        → "a*|b\\nc\\n--- Work\\nd|e"
        """
        lines: list[str] = []
        for child in form_el:
            if child.tag == "section":
                title = child.get("title", "")
                if title:
                    lines.append(f"--- {title}")
                for sub in child:
                    if sub.tag == "row":
                        parts = []
                        for f in sub:
                            if f.tag == "field":
                                name = f.get("name", "")
                                req = f.get("required", "").lower() in ("true", "required", "1", "")
                                # Only mark required if attribute explicitly present
                                if "required" in f.attrib:
                                    parts.append(f"{name}*")
                                else:
                                    parts.append(name)
                        if parts:
                            lines.append("|".join(parts))
                    elif sub.tag == "field":
                        name = sub.get("name", "")
                        if "required" in sub.attrib:
                            lines.append(f"{name}*")
                        else:
                            lines.append(name)
            elif child.tag == "row":
                parts = []
                for f in child:
                    if f.tag == "field":
                        name = f.get("name", "")
                        if "required" in f.attrib:
                            parts.append(f"{name}*")
                        else:
                            parts.append(name)
                if parts:
                    lines.append("|".join(parts))
            elif child.tag == "field":
                name = child.get("name", "")
                if "required" in child.attrib:
                    lines.append(f"{name}*")
                else:
                    lines.append(name)
        return "\n".join(lines)

    def _parse_events(self, el: ET.Element, parent_node: TreeNode) -> None:
        """Parse <event> children and attach as placeholder flowRegistry entries."""
        for child in el:
            if child.tag != "event":
                continue
            event_name = child.get("on", "formValuesChange")
            desc = (child.text or "").strip()
            registry_entry = self.tb.placeholder_event(event_name, desc)

            # Find the form model node to attach events to
            # For addnew: parent_node is ChildPageModel → find CreateFormModel
            # For edit: parent_node is EditActionModel → find EditFormModel
            target = self._find_form_model(parent_node)
            if target:
                target.flow_registry.update(registry_entry)

    def _find_form_model(self, node: TreeNode) -> TreeNode | None:
        """Recursively find CreateFormModel or EditFormModel in tree."""
        if node.use in ("CreateFormModel", "EditFormModel"):
            return node
        for val in node._sub_models.values():
            if isinstance(val, list):
                for child in val:
                    found = self._find_form_model(child)
                    if found:
                        return found
            else:
                found = self._find_form_model(val)
                if found:
                    return found
        return None

    @staticmethod
    def _split_fields(s: str) -> list[str]:
        """Split comma-separated field string into list."""
        if not s:
            return []
        return [f.strip() for f in s.split(",") if f.strip()]

    def _get_editable_fields(self, coll: str) -> list[str]:
        """Get editable fields — exclude system fields, o2m, m2m, oho, obo."""
        SKIP = {"id", "createdAt", "updatedAt", "createdById", "updatedById",
                "createdBy", "updatedBy", "sort"}
        SKIP_IFACE = {"o2m", "m2m", "oho", "obo", "createdBy", "updatedBy",
                       "createdAt", "updatedAt"}
        self.nb._load_meta(coll)
        schema = self.nb._field_cache.get(coll, {})
        return [n for n, info in schema.items()
                if n not in SKIP
                and not n.startswith("f_")
                and not n.endswith("Id")
                and info.get("interface") not in SKIP_IFACE]

    def _get_all_display_fields(self, coll: str) -> list[str]:
        """Get all displayable fields — exclude only internal/system fields."""
        SKIP = {"id", "createdById", "updatedById", "sort"}
        SKIP_IFACE = {"createdBy", "updatedBy"}
        self.nb._load_meta(coll)
        schema = self.nb._field_cache.get(coll, {})
        return [n for n, info in schema.items()
                if n not in SKIP
                and not n.startswith("f_")
                and not n.endswith("Id")
                and info.get("interface") not in SKIP_IFACE]

    @staticmethod
    def _auto_form_dsl(fields: list[str]) -> str:
        """Auto-generate fields DSL — pair fields side by side."""
        lines = []
        for i in range(0, len(fields), 2):
            if i + 1 < len(fields):
                lines.append(f"{fields[i]} | {fields[i+1]}")
            else:
                lines.append(fields[i])
        return "\n".join(lines)

    def _auto_composite_col(self, coll: str, sort: int) -> TreeNode | None:
        """Auto-generate a composite column for the table's primary text field.

        Picks the first string/input field as title, then up to 2 short fields
        (select, string, date) as subtitles. Returns None for collections with
        fewer than 3 non-system fields (reference/config tables).
        """
        self.nb._load_meta(coll)
        schema = self.nb._field_cache.get(coll, {})
        SKIP = {"id", "createdAt", "updatedAt", "createdById", "updatedById",
                "createdBy", "updatedBy", "sort"}
        SKIP_IFACE = {"o2m", "m2m", "oho", "obo", "createdBy", "updatedBy",
                       "createdAt", "updatedAt"}

        fields = [(n, info) for n, info in schema.items()
                  if n not in SKIP and not n.startswith("f_") and not n.endswith("Id")
                  and info.get("interface") not in SKIP_IFACE]

        if len(fields) < 3:
            return None  # Too few fields — reference/config table

        # Find primary field (first string/input)
        primary = None
        for n, info in fields:
            iface = info.get("interface", "")
            if iface in ("input", "string", "") and n in ("name", "title", "subject"):
                primary = n
                break
        if not primary:
            for n, info in fields:
                iface = info.get("interface", "")
                if iface in ("input", "string", ""):
                    primary = n
                    break
        if not primary:
            return None

        # Find subtitle fields — prefer select (categorical) over plain text
        subs = []
        # Pass 1: select fields first (best for "Status · Industry" style subtitles)
        for n, info in fields:
            if n == primary:
                continue
            if info.get("interface") == "select":
                subs.append(n)
            if len(subs) >= 2:
                break
        # Pass 2: fill with short string/date if needed
        if len(subs) < 2:
            for n, info in fields:
                if n == primary or n in subs:
                    continue
                iface = info.get("interface", "")
                if iface in ("input", "string", "date", "datetime", ""):
                    subs.append(n)
                if len(subs) >= 2:
                    break

        if not subs:
            return None

        # Short name for title from collection
        short_name = coll.rsplit("_", 1)[-1] if "_" in coll else coll
        title = short_name.capitalize()

        desc = f"Bold blue {primary}, gray subtitle below showing {'·'.join(subs)}"
        return self.tb.placeholder_js_col(
            title, primary, desc, col_type="composite",
            meta={"subs": ",".join(subs)}, sort=sort, width=200)

    @staticmethod
    def _parse_kpi_filter(filter_str: str) -> dict | None:
        """Parse 'field=value' filter notation for KPI.

        Supports:
            status=following_up     → {"status": "following_up"}
            createdAt=thisMonth    → {"createdAt": "thisMonth"} (handled by kpi_block)
        """
        if not filter_str:
            return None
        result = {}
        for part in filter_str.split(","):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                result[k.strip()] = v.strip()
        return result or None
