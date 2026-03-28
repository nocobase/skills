"""Tree-based page tools — compose pages from free-form block definitions.

These tools complement the tree_builder module by exposing tree operations
as MCP tools for AI agents.
"""

import json
import os
from typing import Optional

from mcp.server.fastmcp import FastMCP

from ..client import get_nb_client
from ..tree_builder import TreeBuilder
from ..markup_parser import PageMarkupParser
from ..utils import safe_json, resolve_file


def register_tools(mcp: FastMCP):
    """Register tree-based page tools on the MCP server."""

    @mcp.tool()
    def nb_compose_page(tab_uid: str, blocks_json: str,
                        layout_json: Optional[list] = None) -> str:
        """Build a page from free-form block definitions — any blocks, any layout.

        LAYOUT RULE: Always provide layout_json for non-reference pages.
        Table left (16 cols) + chart sidebar right (8 cols) is the standard pattern.
        Without layout_json, all blocks stack full-width (plain CRUD list look).

        Unlike nb_crud_page which forces a KPI+Filter+Table+Form pattern,
        compose_page lets you freely combine any blocks in any layout.

        Args:
            tab_uid: Tab UID (from nb_create_page or nb_create_menu)
            blocks_json: JSON array of block definitions. Each block:
                - id:   label for layout reference (default "block_0", etc.)
                - type: "table" | "filter" | "form" | "detail" | "js" | "kpi" | "outline"
                Block-specific fields:
                  table:   collection, fields (list), title?, first_click? (default true),
                           addnew_fields? (DSL str), edit_fields? (DSL str),
                           detail_tabs? (list of tab defs),
                           js_columns? — DSL format (preferred):
                             [{"type":"composite","title":"Customer","field":"name","subs":["city","source"]},
                              {"type":"currency","title":"Amount","field":"amount","threshold":100000},
                              {"type":"countdown","title":"Deadline","field":"end_date"},
                              {"type":"progress","title":"Probability","field":"probability"},
                              {"type":"relative_time","title":"Recent","field":"createdAt"},
                              {"type":"stars","title":"Rating","field":"satisfaction"},
                              {"type":"comparison","title":"Achievement","target":"target_amount","actual":"actual_amount"}]
                             Legacy format also supported: {"title":"...","code":"raw JS","width":120}
                  filter:  collection, fields (list), target (block id to filter)
                  form:    collection, fields (DSL str), mode ("create"|"edit"),
                           title?, required? (list)
                  detail:  collection, fields (DSL str), title?
                  js:      title, code
                  kpi:     title, collection, filter?, color?
                  outline: title, ctx_info (dict)
            layout_json: Optional JSON layout — rows of [ref, span] pairs.
                ref = block_id (str) or [id_a, id_b, ...] (stacked column).
                Span uses Ant 24-grid. Omit for auto-stack full-width.
                Column stacking example: [["tbl",16],[["sidebar_a","sidebar_b"],8]]
                puts tbl left (16 wide) and sidebar_a/b stacked right (8 wide).

        Returns:
            JSON with block UIDs, form UIDs, node count, and any warnings.

        Example — dashboard + table with sidebar:
            blocks = [
                {"id":"chart","type":"js","title":"Industry Distribution","code":"..."},
                {"id":"search","type":"filter","collection":"nb_crm_customers",
                 "fields":["name","status"],"target":"tbl"},
                {"id":"tbl","type":"table","collection":"nb_crm_customers",
                 "fields":["name","status","phone","createdAt"],
                 "addnew_fields":"name*|code\\nstatus|industry",
                 "detail_tabs":[{"title":"Info","fields":"name|code\\nstatus"}]}
            ]
            layout = [[["search",24]],[["chart",8],["tbl",16]]]

        Example — simple form page:
            blocks = [
                {"id":"form","type":"form","collection":"nb_crm_feedback",
                 "fields":"--- Customer\\ncustomer*\\n--- Feedback\\ncontent*\\nrating",
                 "mode":"create","title":"Submit Feedback","required":["customer","content"]}
            ]
        """
        nb = get_nb_client()
        blocks = safe_json(blocks_json)
        if not isinstance(blocks, list):
            return json.dumps({"error": "blocks_json must be a JSON array"})
        if not blocks:
            return json.dumps({"error": "blocks list is empty"})

        layout = None
        if layout_json:
            layout = layout_json if isinstance(layout_json, list) else safe_json(layout_json)
            if not isinstance(layout, list):
                return json.dumps({"error": "layout_json must be a JSON array of rows"})

        # Clean existing content
        nb.clean_tab(tab_uid)

        # Build tree in memory
        tb = TreeBuilder(nb)
        try:
            root, meta = tb.compose_page(tab_uid, blocks, layout)
        except Exception as e:
            return json.dumps({"error": str(e)})

        # Save all nodes (try nested first, fallback to flat)
        filter_manager = meta.pop("_filter_manager", None)
        save_result = nb.save_nested(root, tab_uid, filter_manager=filter_manager)

        # Build result
        result = {k: v for k, v in meta.items() if not k.startswith("_")}
        result["save_method"] = save_result.get("method", "flat")
        if nb.warnings:
            result.setdefault("warnings", []).extend(nb.warnings)
        return json.dumps(result, ensure_ascii=False)

    @mcp.tool()
    def nb_compose_page_file(file_path: str) -> str:
        """Build multiple pages from a JSON file using free-form block composition.

        Write a JSON file with an array of page definitions, then call this tool.
        Each page uses the same format as nb_compose_page.

        Args:
            file_path: Path to a JSON file containing an array of page definitions.
                Each item: {
                    "tab_uid": "...",
                    "blocks": [...],     // same as nb_compose_page blocks_json
                    "layout": [...]      // optional, same as nb_compose_page layout_json
                }

        Returns:
            JSON with results for each page.

        Example file content:
            [
              {
                "tab_uid": "abc123",
                "blocks": [
                  {"id":"tbl","type":"table","collection":"customers",
                   "fields":["name","status"],"addnew_fields":"name*\\nstatus"},
                  {"id":"search","type":"filter","collection":"customers",
                   "fields":["name"],"target":"tbl"}
                ],
                "layout": [[["search",24]],[["tbl",24]]]
              }
            ]
        """
        try:
            file_path = resolve_file(file_path)
        except FileNotFoundError as e:
            return json.dumps({"error": str(e)})

        with open(file_path, "r", encoding="utf-8") as f:
            try:
                pages = json.load(f)
            except json.JSONDecodeError as e:
                return json.dumps({"error": f"Invalid JSON: {e}"})

        if not isinstance(pages, list):
            return json.dumps({"error": "File must contain a JSON array"})

        results = []
        for i, page in enumerate(pages):
            try:
                tab = page.get("tab_uid", "")
                blocks = page.get("blocks", [])
                if not tab or not blocks:
                    results.append({"index": i, "error": "Missing tab_uid or blocks"})
                    continue

                layout_val = page.get("layout")
                r = nb_compose_page(
                    tab_uid=tab,
                    blocks_json=json.dumps(blocks),
                    layout_json=layout_val,
                )
                parsed = json.loads(r)
                parsed["index"] = i
                results.append(parsed)
            except Exception as e:
                results.append({"index": i, "error": str(e)})

        built = len([r for r in results if "error" not in r])
        failed = len([r for r in results if "error" in r])
        return json.dumps({
            "pages_built": built,
            "pages_failed": failed,
            "results": results,
        })

    # ── Page Markup tools ─────────────────────────────────────

    @mcp.tool()
    def nb_page(tab_uid: str, markup: str) -> str:
        """Build a page from HTML-like markup. JS nodes are description-only placeholders.

        Alias: nb_page_markup (deprecated, use nb_page instead).

        LAYOUT RULE: Every non-reference page MUST use <row> with span for
        side-by-side layout. Table left (span=14-18) + sidebar right (span=6-10).
        KPI strip is the ONLY thing above the table row. Do NOT stack everything
        full-width — that makes pages look like a plain CRUD list.

        Two-phase workflow:
          Phase 1: Write XML markup → nb_page() → page with JS placeholders
          Phase 2: nb_find_placeholders() → nb_inject_js() per placeholder

        Args:
            tab_uid: Tab UID (from nb_create_page or nb_create_menu)
            markup: XML string defining page structure. Example:

                <page collection="nb_crm_customers">
                  <row>
                    <kpi title="Total" />
                    <kpi title="Active" filter="status=active" color="blue" />
                  </row>
                  <filter fields="name,status" target="tbl" />
                  <row>
                    <table id="tbl" span="16" fields="name,status,phone,createdAt">
                      <js-col type="composite" field="name" title="Customer">
                        Bold name, gray city and source below
                      </js-col>
                      <addnew fields="name*|code\\nstatus|industry" />
                      <edit fields="name*|code\\nstatus|industry" />
                      <detail>
                        <tab title="Info" fields="name|code\\nstatus|industry" />
                        <tab title="Contacts">
                          <subtable collection="nb_crm_contacts" assoc="contacts"
                                    fields="name,phone,position" />
                        </tab>
                      </detail>
                    </table>
                    <stack span="8">
                      <js-block title="Industry Chart">
                        Horizontal bar chart by industry field
                      </js-block>
                    </stack>
                  </row>
                </page>

            Supported tags:
              <page collection="...">  Root (sets default collection)
              <row>                    Horizontal row (children split by span)
              <stack span="N">         Vertical stack in one column
              <kpi title="..." filter="field=val" color="..."/>
              <filter fields="a,b" target="block_id"/>
              <table id="..." fields="a,b,c" title="...">
                <js-col type="..." field="..." title="...">desc</js-col>
                <addnew fields="DSL">
                  <event on="formValuesChange">desc</event>
                </addnew>
                <edit fields="DSL"/>
                <detail>
                  <tab title="..." fields="DSL">
                    <js-item title="...">desc</js-item>
                    <subtable collection="..." assoc="..." fields="a,b"/>
                  </tab>
                </detail>
              </table>
              <js-block title="...">description</js-block>
              <form collection="..." fields="DSL" mode="create|edit"/>
              <detail-block collection="..." fields="DSL"/>

        Returns:
            JSON with grid_uid, node_count, block UIDs, and any warnings.
        """
        nb = get_nb_client()

        # Clean existing content
        nb.clean_tab(tab_uid)

        parser = PageMarkupParser(nb)
        try:
            root, meta = parser.parse(tab_uid, markup)
        except Exception as e:
            return json.dumps({"error": str(e)}, ensure_ascii=False)

        # Save tree
        filter_manager = meta.pop("_filter_manager", None)
        save_result = nb.save_nested(root, tab_uid, filter_manager=filter_manager)

        result = {k: v for k, v in meta.items() if not k.startswith("_")}
        result["save_method"] = save_result.get("method", "flat")
        if save_result.get("errors"):
            result["save_errors"] = save_result["errors"]
        if nb.warnings:
            result.setdefault("warnings", []).extend(nb.warnings)
        return json.dumps(result, ensure_ascii=False)

    @mcp.tool()
    def nb_page_markup_file(file_path: str) -> str:
        """Build multiple pages from XML markup definitions in a JSON file.

        Args:
            file_path: Path to JSON file with array of page defs:
                [
                  {"tab_uid": "...", "markup": "<page>...</page>"},
                  ...
                ]

        Returns:
            JSON with results for each page.
        """
        try:
            file_path = resolve_file(file_path)
        except FileNotFoundError as e:
            return json.dumps({"error": str(e)})

        with open(file_path, "r", encoding="utf-8") as f:
            try:
                pages = json.load(f)
            except json.JSONDecodeError as e:
                return json.dumps({"error": f"Invalid JSON: {e}"})

        if not isinstance(pages, list):
            return json.dumps({"error": "File must contain a JSON array"})

        results = []
        for i, page in enumerate(pages):
            try:
                tab = page.get("tab_uid", "")
                markup = page.get("markup", "")
                if not tab or not markup:
                    results.append({"index": i, "error": "Missing tab_uid or markup"})
                    continue

                r = nb_page(tab_uid=tab, markup=markup)
                parsed = json.loads(r)
                parsed["index"] = i
                results.append(parsed)
            except Exception as e:
                results.append({"index": i, "error": str(e)})

        built = len([r for r in results if "error" not in r])
        failed = len([r for r in results if "error" in r])
        return json.dumps({
            "pages_built": built,
            "pages_failed": failed,
            "results": results,
        })

    # ── Placeholder discovery & injection ─────────────────────

    @mcp.tool()
    def nb_find_placeholders(scope: str) -> str:
        """Find all JS description placeholders under a scope.

        Use after nb_page_markup to discover all JS nodes that need implementation.
        Each placeholder has a kind (column/block/item/event), title, and description.

        Args:
            scope: Tab UID or title prefix (e.g. "CRM" to find all CRM pages).

        Returns:
            JSON array of placeholder info:
            [
              {
                "uid": "abc123",
                "kind": "column",
                "title": "Customer",
                "desc": "Bold name, gray city and source below",
                "field": "name",
                "collection": "nb_crm_customers",
                "parent_uid": "xyz789"
              },
              ...
            ]

        Example workflow:
            # Phase 1: Build page with placeholders
            nb_page(tab_uid, "<page>...</page>")

            # Phase 2: Find and implement each JS
            placeholders = nb_find_placeholders("CRM")
            for p in placeholders:
                code = "..."  # write real JS
                nb_inject_js(p["uid"], code)
        """
        nb = get_nb_client()
        try:
            results = nb.find_placeholders(scope)
            return json.dumps(results, ensure_ascii=False, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})

    @mcp.tool()
    def nb_inject_js(uid: str, code: str, event_name: Optional[str] = None) -> str:
        """Replace a JS placeholder with real implementation.

        Auto-detects node type (JSColumnModel/JSBlockModel/JSItemModel).
        Preserves title, width, and other settings — only replaces the JS code.

        For event placeholders, pass event_name to target the specific event flow.

        Args:
            uid: UID of the placeholder node (from nb_find_placeholders result)
            code: Real JS code to inject
            event_name: For event placeholders only — the event name
                        (e.g. "formValuesChange"). If omitted, replaces JS code directly.

        Returns:
            JSON with success status.

        Example:
            nb_inject_js("abc123",
                "const r=ctx.record||{};const h=ctx.React.createElement;"
                "ctx.render(h('div',null,"
                "h('div',{style:{fontWeight:500,color:'#1890ff'}},r.name||'-'),"
                "h('div',{style:{color:'#8c8c8c',fontSize:12}},"
                "[r.city,r.source].filter(Boolean).join(' · '))));"
            )
        """
        nb = get_nb_client()
        try:
            if event_name:
                ok = nb.inject_event(uid, event_name, code)
            else:
                ok = nb.inject_js(uid, code)

            if ok:
                return json.dumps({"status": "ok", "uid": uid})
            else:
                return json.dumps({"error": f"Failed to inject JS into {uid}"})
        except Exception as e:
            return json.dumps({"error": str(e)})

    @mcp.tool()
    def nb_inject_js_dir(dir_path: str) -> str:
        """Batch-inject JS from files named by placeholder UID.

        Scans a directory for .js files and injects each into the matching
        placeholder node. Supports retry: fix failed files and re-run.

        File naming convention:
          - {uid}.js              → inject as JS code (column/block/item)
          - {uid}__evt__{name}.js → inject as event flow (e.g. formValuesChange)

        Typical workflow:
          1. nb_find_placeholders("CRM") → get placeholder list with UIDs
          2. Write JS code to {uid}.js files in a directory
          3. nb_inject_js_dir("js/") → batch inject all files
          4. Fix any failed files and re-run

        Args:
            dir_path: Directory containing {uid}.js files.
                      Relative paths resolved from NB_WORKDIR.

        Returns:
            JSON with injected/failed/skipped counts and per-file details.
        """
        try:
            dir_path = resolve_file(dir_path, allow_dir=True)
        except FileNotFoundError as e:
            return json.dumps({"error": str(e)})

        if not os.path.isdir(dir_path):
            return json.dumps({"error": f"Not a directory: {dir_path}"})

        nb = get_nb_client()
        results = []
        injected, failed, skipped = 0, 0, 0

        for fname in sorted(os.listdir(dir_path)):
            if not fname.endswith(".js"):
                continue

            fpath = os.path.join(dir_path, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    code = f.read().strip()
            except Exception as e:
                results.append({"file": fname, "error": f"read error: {e}"})
                failed += 1
                continue

            if not code:
                results.append({"file": fname, "status": "skipped (empty)"})
                skipped += 1
                continue

            base = fname[:-3]  # strip .js

            # Check for event pattern: {uid}__evt__{event_name}
            if "__evt__" in base:
                parts = base.split("__evt__", 1)
                uid_val, event_name = parts[0], parts[1]
                try:
                    ok = nb.inject_event(uid_val, event_name, code)
                    if ok:
                        results.append({"file": fname, "status": "ok", "uid": uid_val, "event": event_name})
                        injected += 1
                    else:
                        results.append({"file": fname, "error": f"inject_event failed for {uid_val}"})
                        failed += 1
                except Exception as e:
                    results.append({"file": fname, "error": str(e)})
                    failed += 1
            else:
                # Normal JS injection: {uid}.js
                uid_val = base
                try:
                    ok = nb.inject_js(uid_val, code)
                    if ok:
                        results.append({"file": fname, "status": "ok", "uid": uid_val})
                        injected += 1
                    else:
                        results.append({"file": fname, "error": f"inject_js failed for {uid_val}"})
                        failed += 1
                except Exception as e:
                    results.append({"file": fname, "error": str(e)})
                    failed += 1

        return json.dumps({
            "injected": injected,
            "failed": failed,
            "skipped": skipped,
            "total_files": injected + failed + skipped,
            "details": results,
        }, ensure_ascii=False)

    # ── Auto JS ───────────────────────────────────────────────

    @mcp.tool()
    def nb_auto_js(
        scope: str,
        output_dir: str = "js/",
        templates_dir: str = "skills/templates/js/",
    ) -> str:
        """Auto-generate JS files from page placeholders + templates.

        Reads all JS placeholders in scope, matches column placeholders to
        templates, auto-fills them with metadata (field, subs, threshold),
        and writes ready-to-inject files. Blocks/items/events get stub files.

        Workflow:
          1. nb_page(...) → build pages with placeholders
          2. nb_auto_js("CRM") → auto-generate JS files
          3. Implement remaining [todo] files manually
          4. nb_inject_js_dir("js/") → deploy all JS files

        Args:
            scope: Tab UID or title prefix (e.g. "CRM")
            output_dir: Directory for JS files (default: js/)
            templates_dir: Directory with col-*.js templates
                           (default: skills/templates/js/)

        Returns:
            Task table with [auto] and [todo] markers.
            [auto] files are ready to inject. [todo] files need manual coding.
        """
        nb = get_nb_client()
        tpl_dir = None
        try:
            tpl_dir = resolve_file(templates_dir, allow_dir=True)
        except FileNotFoundError:
            pass

        # Fallback: search for bundled templates relative to this package
        if not tpl_dir or not os.path.isdir(tpl_dir):
            workdir = os.environ.get("NB_WORKDIR", "")
            # Walk up from workdir looking for skills/templates/js/
            if workdir:
                d = workdir
                for _ in range(5):
                    candidate = os.path.join(d, "skills", "templates", "js")
                    if os.path.isdir(candidate):
                        tpl_dir = candidate
                        break
                    parent = os.path.dirname(d)
                    if parent == d:
                        break
                    d = parent
            if not tpl_dir or not os.path.isdir(tpl_dir):
                tpl_dir = templates_dir  # last resort, let auto_js handle missing

        workdir = os.environ.get("NB_WORKDIR", "")
        if not os.path.isabs(output_dir):
            out_dir = os.path.join(workdir, output_dir) if workdir else output_dir
        else:
            out_dir = output_dir

        result = nb.auto_js(scope, out_dir, tpl_dir)

        summary = (
            f"Generated {result['auto_count']} auto JS files, "
            f"{result['manual_count']} need manual implementation.\n\n"
            f"Output directory: {out_dir}\n\n"
        )

        return summary + result["task_table"] + (
            f"\n\nNext steps:\n"
            f"1. Implement [todo] files in {out_dir}\n"
            f"2. nb_inject_js_dir(\"{output_dir}\") to deploy all\n"
            f"3. Check results and fix any failures"
        )

    # ── Page Map ──────────────────────────────────────────────

    @mcp.tool()
    def nb_page_map(scope: str, output_file: Optional[str] = None) -> str:
        """Generate an HTML map of page structure with UIDs for visual lookup.

        Shows every FlowModel node under a scope with its UID, type, title,
        collection, and placeholder status. Useful for:
          - Looking up UIDs to modify specific nodes
          - Debugging page structure
          - Understanding the FlowModel tree hierarchy

        Click any UID in the generated HTML to copy it to clipboard.

        Args:
            scope: Title prefix to match route groups (e.g. "CRM").
            output_file: Optional file path to write the HTML to.
                         If omitted, returns a summary (HTML too large for tool output).

        Returns:
            If output_file: JSON with file path and page count.
            If no output_file: JSON with file path (auto-saved to {scope}-page-map.html).
        """
        nb = get_nb_client()
        html_content = nb.page_map(scope)

        # Always write to file (HTML is too large for tool output)
        if output_file:
            try:
                fpath = resolve_file(output_file, allow_dir=False)
            except FileNotFoundError:
                # File doesn't exist yet — use the path directly
                workdir = os.environ.get("NB_WORKDIR", "")
                fpath = os.path.join(workdir, output_file) if workdir and not os.path.isabs(output_file) else output_file
        else:
            workdir = os.environ.get("NB_WORKDIR", "")
            fname = f"{scope.lower()}-page-map.html"
            fpath = os.path.join(workdir, fname) if workdir else fname

        os.makedirs(os.path.dirname(fpath) or ".", exist_ok=True)
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(html_content)

        # Count pages in output
        page_count = html_content.count('<div class="page">')

        return json.dumps({
            "status": "ok",
            "file": fpath,
            "pages": page_count,
            "message": f"Page map with {page_count} pages written to {fpath}. Open in browser to view."
        }, ensure_ascii=False)

    # ── Form refinement tools ────────────────────────────────

    @mcp.tool()
    def nb_auto_forms(scope: str) -> str:
        """Scan all table forms/popups and generate refinement task list.

        Compares each form's field count to collection total.
        Returns task table with [ok] (>=70% coverage) and [todo] (<70%) markers.
        Each [todo] task includes: table UID, form type, collection, current fields,
        missing fields, and section tip.

        Use after nb_page_markup to identify forms that need refinement.

        Args:
            scope: Title prefix to match route groups (e.g. "CRM").

        Returns:
            Markdown task table with coverage analysis.
        """
        nb = get_nb_client()
        try:
            result = nb.auto_forms(scope)
            fix_count = result.get('fix', 0)
            fix_msg = f", {fix_count} need tab merge" if fix_count else ""
            summary = (
                f"Scanned {result['total']} forms: "
                f"{result['ok']} ok, {result['todo']} need refinement{fix_msg}.\n\n"
            )
            return summary + result["task_table"]
        except Exception as e:
            return json.dumps({"error": str(e)})

    @mcp.tool()
    def nb_set_form(table_uid: str, form_type: str, markup: str,
                    events_json: Optional[list] = None) -> str:
        """Replace a table's addnew or edit form with new field layout.

        Uses HTML markup to define form structure with grid layout.

        GRID LAYOUT IS MANDATORY — forms with >3 fields MUST use <row>.

        Format:
            <form>
              <section title="Basic Info">
                <row><field name="name" required /><field name="code" required /></row>
                <row><field name="status" /><field name="industry" /></row>
              </section>
              <section title="Contact Info">
                <row><field name="phone" /><field name="email" /></row>
              </section>
            </form>

        Rules:
          - <form> root wrapper (required)
          - <section title="X"> visual divider/group header
          - <row> wraps fields that should be side-by-side (grid columns)
          - <field> outside <row> = full-width row
          - <field ... required /> marks field as mandatory

        Args:
            table_uid: TableBlockModel UID (from nb_auto_forms or nb_inspect_all)
            form_type: "addnew" or "edit"
            markup: HTML markup string
            events_json: Optional event placeholder definitions:
                [{"on": "formValuesChange", "desc": "Auto-map probability when stage changes"}]

        Returns:
            JSON with form_uid, type, node_count.
        """
        nb = get_nb_client()
        try:
            events = None
            if events_json:
                if isinstance(events_json, str):
                    events = safe_json(events_json)
                else:
                    events = events_json

            result = nb.set_form(table_uid, form_type, markup, events)
            if nb.warnings:
                result["warnings"] = nb.warnings
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)})

    @mcp.tool()
    def nb_set_detail(table_uid: str, markup: str) -> str:
        """Replace a table's detail popup with new tab structure.

        Uses HTML markup to define detail popup with tabs and grid layout.

        GRID LAYOUT IS MANDATORY — field tabs with >3 fields MUST use <row>.

        Format:
            <detail>
              <tab title="Overview">
                <section title="Basic Info">
                  <row><field name="name" /><field name="code" /></row>
                  <row><field name="status" /><field name="industry" /></row>
                </section>
                <section title="Contact Info">
                  <row><field name="phone" /><field name="email" /></row>
                </section>
                <js-item title="Profile">Level tags + status + source</js-item>
              </tab>
              <tab title="Contacts" assoc="contacts"
                   collection="nb_crm_contacts" fields="name,phone,position" />
            </detail>

        Rules:
          - <detail> root wrapper (required)
          - Tab 1 = ALL main-table fields (use <section> for grouping) + js_items
          - Tab 2+ = ONLY association subtables via assoc attribute
          - NEVER split same-table fields into multiple tabs
          - <row> wraps fields that should be side-by-side
          - <field> outside <row> = full-width row
          - <js-item> becomes a JS placeholder (implement via nb_inject_js later)
          - Self-closing <tab .../> for subtable tabs (assoc + collection + fields)

        Args:
            table_uid: TableBlockModel UID
            markup: HTML markup string

        Returns:
            JSON with tab count, type, node_count.
        """
        nb = get_nb_client()
        try:
            # Auto-detect format
            if isinstance(markup, str) and ('<detail' in markup or '<tab' in markup):
                from ..markup_parser import parse_detail_html
                detail_json = parse_detail_html(markup)
            elif isinstance(markup, list):
                detail_json = markup
            elif isinstance(markup, str):
                detail_json = safe_json(markup)
            else:
                return json.dumps({"error": "markup must be HTML string or JSON array"})

            if not isinstance(detail_json, list):
                return json.dumps({"error": "Parsed result must be a list of tab definitions"})

            # Validate tab structure: warn if multiple tabs all lack assoc (same-table split)
            field_only_tabs = [t for t in detail_json
                               if not t.get("assoc") and not t.get("coll")]
            if len(field_only_tabs) > 1:
                tab_titles = [t.get("title", "?") for t in field_only_tabs]
                return json.dumps({
                    "error": (
                        f"Bad tab structure: {len(field_only_tabs)} tabs without subtable "
                        f"association ({', '.join(tab_titles)}). "
                        f"Same-table fields must be in ONE tab using <section> to group. "
                        f"Only o2m/m2m subtables get their own tabs."
                    )
                })

            result = nb.set_detail(table_uid, detail_json)
            if nb.warnings:
                result["warnings"] = nb.warnings
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"error": str(e)})
