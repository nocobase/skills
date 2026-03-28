"""Generate a system blueprint from an existing NocoBase instance.

Produces a structured markdown document that an AI agent can use to
replicate the system in a different environment.

Usage:
    python -m nocobase_mcp.blueprint --url http://localhost:14003 --prefix CRM
    python -m nocobase_mcp.blueprint --url http://localhost:14003  # all pages
"""

import argparse
import json
import os
import re
import sys
import textwrap
from datetime import datetime
from typing import Optional

from .client import NB
from .tools.page_tool import PageTool


def _field_def(f: dict) -> str:
    """Format a field definition as a concise one-liner."""
    name = f.get("name", "")
    ftype = f.get("type", "")
    iface = f.get("interface", "")
    title = (f.get("uiSchema") or {}).get("title", "")

    parts = [name]

    # Type info
    if ftype in ("belongsTo", "hasMany", "belongsToMany", "hasOne"):
        target = f.get("target", "")
        fk = f.get("foreignKey", "")
        on_del = f.get("onDelete", "")
        rel = f"{iface}→{target}"
        if fk:
            rel += f" (fk={fk})"
        if on_del and on_del != "SET NULL":
            rel += f" onDelete={on_del}"
        parts.append(rel)
    elif iface == "select":
        enums = (f.get("uiSchema") or {}).get("enum", [])
        if enums:
            vals = [e.get("value", "") for e in enums]
            parts.append(f"select{vals}")
        else:
            parts.append("select")
    elif iface == "checkbox":
        parts.append("boolean")
    elif iface in ("number", "percent", "integer"):
        parts.append(iface)
    elif iface in ("datetime", "date"):
        parts.append(iface)
    elif iface in ("richText", "markdown", "vditor"):
        parts.append("richtext")
    elif iface == "textarea":
        parts.append("text")
    elif iface == "sequence":
        parts.append("auto-sequence")
    elif iface == "color":
        parts.append("color")
    elif iface == "json":
        parts.append("json")
    else:
        parts.append(ftype)

    # Required
    allow_null = f.get("allowNull", True)
    if allow_null is False:
        parts.append("required")

    # Unique
    if f.get("unique"):
        parts.append("unique")

    # Title
    if title and title != name:
        parts.append(f'"{title}"')

    return " | ".join(parts)


def _js_summary(code: str, max_len: int = 120) -> str:
    """Extract a human-readable summary from JS code."""
    if not code or len(code) < 20:
        return "(empty)"

    # Try to find doc comment
    m = re.search(r'/\*\*\s*\n\s*\*\s*(.+?)(?:\n|\*)', code)
    if m:
        return m.group(1).strip()[:max_len]

    # Try single-line comment at top
    for line in code.split("\n")[:5]:
        line = line.strip()
        if line.startswith("//") and len(line) > 5:
            return line[2:].strip()[:max_len]

    # Heuristic: look for what's being rendered
    patterns = [
        (r'title[=:]\s*["\']([^"\']+)', "Title"),
        (r'Statistic.*title[=:]\s*["\']([^"\']+)', "KPI"),
        (r'Progress', "Progress bar"),
        (r'Pie|pie|donut|Ring', "Pie/Ring chart"),
        (r'echarts|ECharts', "ECharts visualization"),
        (r'chart\.init|Chart\.js', "Chart.js visualization"),
        (r'Tree\b', "Tree component"),
        (r'Timeline', "Timeline"),
        (r'Table\b.*dataSource', "Data table"),
        (r'ctx\.request.*:list', "Data fetching + rendering"),
    ]
    for pat, label in patterns:
        if re.search(pat, code):
            return f"{label} [{len(code)}c]"

    return f"Custom JS [{len(code)}c]"


class BlueprintGenerator:
    """Generate a full system blueprint from a NocoBase instance."""

    def __init__(self, nb: NB):
        self.nb = nb
        self.pt = PageTool(nb)

    def generate(self, prefix: Optional[str] = None,
                 include_js: bool = True,
                 include_workflows: bool = True,
                 include_data_stats: bool = True) -> str:
        """Generate the full blueprint markdown."""
        lines = []
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        title = f"{prefix} System" if prefix else "System"
        lines.append(f"# {title} Blueprint")
        lines.append(f"> Generated: {ts} from {self.nb.base}")
        lines.append("")

        # Phase 1: Collections (schema)
        colls = self._get_collections(prefix)
        if colls:
            lines.append("---")
            lines.append("## 1. Data Model")
            lines.append("")
            for coll in colls:
                self._format_collection(coll, lines, include_data_stats)
            lines.append("")

        # Phase 2: Menu structure
        lines.append("---")
        lines.append("## 2. Menu Structure")
        lines.append("")
        self._format_routes(prefix, lines)
        lines.append("")

        # Phase 3: Pages (full depth)
        pages = self.pt.pages()
        if prefix:
            pages = [p for p in pages if p["path"].startswith(prefix)]
        if pages:
            lines.append("---")
            lines.append("## 3. Pages")
            lines.append("")
            for page in pages:
                self._format_page(page, lines, include_js)
                lines.append("")

        # Phase 4: Workflows
        if include_workflows:
            wf_lines = self._format_workflows(prefix)
            if wf_lines:
                lines.append("---")
                lines.append("## 4. Workflows")
                lines.append("")
                lines.extend(wf_lines)
                lines.append("")

        # Phase 5: AI Employees
        ai_lines = self._format_ai_employees(prefix)
        if ai_lines:
            lines.append("---")
            lines.append("## 5. AI Employees")
            lines.append("")
            lines.extend(ai_lines)

        return "\n".join(lines)

    # ── Collections ──────────────────────────────────────────

    def _get_collections(self, prefix: Optional[str]) -> list:
        """Get collections with their fields."""
        all_colls = self.nb._get_json("api/collections:list?paginate=false") or []
        result = []
        for c in all_colls:
            name = c.get("name", "")
            # Skip system collections
            if name.startswith("_") or name in (
                "users", "roles", "attachments", "systemSettings",
                "authenticators", "tokenBlacklist",
            ):
                continue
            # Filter by prefix if given
            if prefix:
                p = prefix.lower().replace(" ", "_").replace("-", "_")
                title = (c.get("title") or "").lower()
                if not (p in name.lower() or p in title):
                    continue
            result.append(c)
        return sorted(result, key=lambda c: c.get("name", ""))

    def _format_collection(self, coll: dict, lines: list,
                           include_stats: bool = True):
        """Format a single collection's schema."""
        name = coll.get("name", "")
        title = coll.get("title", "")
        tree = " (tree)" if coll.get("tree") else ""

        # Get fields
        fields = self.nb._get_json(
            f"api/collections/{name}/fields:list?paginate=false"
        ) or []

        # Separate fields by type
        system_fields = {"id", "createdAt", "updatedAt", "createdById",
                         "updatedById", "createdBy", "updatedBy"}
        user_fields = [f for f in fields if f.get("name") not in system_fields]
        relations = [f for f in user_fields
                     if f.get("type") in ("belongsTo", "hasMany",
                                          "belongsToMany", "hasOne")]
        data_fields = [f for f in user_fields if f not in relations]

        # Row count
        count_str = ""
        if include_stats:
            try:
                r = self.nb._get(f"api/{name}:list?pageSize=1")
                if r.ok:
                    meta = r.json().get("data", {})
                    if isinstance(meta, dict):
                        cnt = meta.get("meta", {}).get("count", 0)
                        count_str = f" ({cnt} rows)"
            except Exception:
                pass

        lines.append(f"### {title} (`{name}`){tree}{count_str}")
        lines.append("")

        if data_fields:
            lines.append("Fields:")
            for f in data_fields:
                lines.append(f"- {_field_def(f)}")
            lines.append("")

        if relations:
            lines.append("Relations:")
            for f in relations:
                lines.append(f"- {_field_def(f)}")
            lines.append("")

    # ── Routes ───────────────────────────────────────────────

    def _format_routes(self, prefix: Optional[str], lines: list):
        """Format menu/route structure as a tree."""
        routes = self.nb._get_json(
            "api/desktopRoutes:list?tree=true&paginate=false"
        ) or []

        def walk(nodes, indent=0):
            for r in sorted(nodes, key=lambda x: x.get("sort", 0)):
                rtype = r.get("type", "")
                title = r.get("title", "")
                icon = r.get("icon", "")
                hidden = r.get("hideInMenu", False)

                if prefix and indent == 0:
                    # Filter top-level by prefix
                    if prefix.lower() not in (title or "").lower():
                        # Check children
                        children = r.get("children") or []
                        if children:
                            walk(children, indent)
                        continue

                if hidden:
                    continue

                prefix_str = "  " * indent
                icon_str = f" ({icon})" if icon else ""
                type_str = "📁" if rtype == "group" else "📄"

                lines.append(f"{prefix_str}{type_str} {title}{icon_str}")

                children = r.get("children") or []
                if children:
                    walk(children, indent + 1)

        walk(routes)

    # ── Pages ────────────────────────────────────────────────

    def _format_page(self, page: dict, lines: list,
                     include_js: bool = True):
        """Format a single page with full depth inspection."""
        title = page["title"]
        tab_uid = page.get("tab_uid", "")

        lines.append(f"### Page: {title}")
        lines.append(f"tab_uid: `{tab_uid}`")
        lines.append("")

        # Use PageTool's full inspect
        try:
            result = self.pt.inspect(title)
            lines.append(result)
        except Exception as e:
            lines.append(f"(inspect failed: {e})")
            return

        # Extract and describe JS blocks in detail
        if include_js:
            self._describe_js_blocks(tab_uid, lines)

    def _describe_js_blocks(self, tab_uid: str, lines: list):
        """Find all JS blocks under a tab and describe their functionality."""
        all_models = self.nb._get_json("api/flowModels:list?paginate=false") or []
        uid_map = {m["uid"]: m for m in all_models}

        # Collect all descendants of tab_uid
        descendants = set()
        queue = [tab_uid]
        while queue:
            current = queue.pop(0)
            for m in all_models:
                if m.get("parentId") == current and m["uid"] not in descendants:
                    descendants.add(m["uid"])
                    queue.append(m["uid"])

        # Find JS blocks/columns/items
        js_nodes = []
        for uid_ in descendants:
            m = uid_map.get(uid_)
            if not m:
                continue
            use = m.get("use", "")
            if "JS" not in use:
                continue

            sp = m.get("stepParams", {})
            code = (sp.get("jsSettings") or {}).get("runJs", {}).get("code", "")
            if not code or len(code) < 30:
                continue

            # Get title
            if "Block" in use:
                t = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
            elif "Column" in use:
                t = sp.get("tableColumnSettings", {}).get("title", {}).get("title", "")
            elif "Item" in use:
                t = sp.get("editItemSettings", {}).get("showLabel", {}).get("title", "")
            else:
                t = ""

            # Determine context (page-level or popup)
            in_popup = False
            p = m.get("parentId", "")
            visited = set()
            while p and p not in visited:
                visited.add(p)
                pm = uid_map.get(p)
                if not pm:
                    break
                if pm.get("use") == "ChildPageModel":
                    in_popup = True
                    break
                p = pm.get("parentId", "")

            js_nodes.append({
                "uid": m["uid"],
                "use": use,
                "title": t,
                "code_len": len(code),
                "summary": _js_summary(code),
                "in_popup": in_popup,
            })

        if js_nodes:
            lines.append("")
            lines.append("**JS Blocks Detail:**")
            for js in js_nodes:
                ctx = "popup" if js["in_popup"] else "page"
                use_short = js["use"].replace("Model", "")
                lines.append(
                    f'- `{js["uid"]}` {use_short} '
                    f'"{js["title"]}" [{ctx}] — {js["summary"]}'
                )

    # ── Workflows ────────────────────────────────────────────

    def _format_workflows(self, prefix: Optional[str]) -> list:
        """Format workflow definitions."""
        wfs = self.nb._get_json("api/workflows:list?paginate=false") or []
        lines = []

        for wf in wfs:
            title = wf.get("title", "")
            if prefix and prefix.lower() not in title.lower():
                # Also check collection name
                cfg = wf.get("config", {}) or {}
                coll = cfg.get("collection", "")
                if prefix.lower().replace(" ", "_") not in coll.lower():
                    continue

            enabled = wf.get("enabled", False)
            wtype = wf.get("type", "")
            cfg = wf.get("config", {}) or {}

            status = "✅" if enabled else "⏸️"
            lines.append(f"### {status} {title}")
            lines.append(f"Type: {wtype}")

            # Trigger config
            if wtype == "collection":
                coll = cfg.get("collection", "")
                mode = cfg.get("mode", 0)
                mode_map = {1: "create", 2: "update", 3: "create+update",
                            4: "delete", 7: "all"}
                lines.append(f"Trigger: {coll} on {mode_map.get(mode, mode)}")
            elif wtype == "schedule":
                cron = cfg.get("cron", "")
                lines.append(f"Schedule: {cron}")
            elif wtype == "action":
                coll = cfg.get("collection", "")
                lines.append(f"Manual action on: {coll}")

            # Workflow nodes
            try:
                wf_detail = self.nb._get_json(
                    f"api/workflows/{wf['id']}?appends=nodes"
                )
                nodes = (wf_detail or {}).get("nodes", [])
                if nodes:
                    lines.append(f"Nodes ({len(nodes)}):")
                    for n in sorted(nodes, key=lambda x: x.get("id", 0)):
                        ntype = n.get("type", "")
                        ntitle = n.get("title", "")
                        branch = n.get("branchIndex")
                        branch_str = f" [branch={branch}]" if branch is not None else ""
                        lines.append(f"  - {ntype}: {ntitle}{branch_str}")
            except Exception:
                pass

            lines.append("")

        return lines

    # ── AI Employees ─────────────────────────────────────────

    def _format_ai_employees(self, prefix: Optional[str]) -> list:
        """Format AI employee definitions."""
        try:
            employees = self.nb._get_json(
                "api/aiEmployees:list?paginate=false"
            ) or []
        except Exception:
            return []

        if not employees:
            return []

        lines = []
        for emp in employees:
            nickname = emp.get("nickname", "")
            username = emp.get("username", "")
            bio = emp.get("bio", "")
            model = emp.get("modelSettings", {}).get("llmService", "")

            lines.append(f"### {nickname} (`{username}`)")
            if bio:
                lines.append(f"Bio: {bio}")
            if model:
                lines.append(f"Model: {model}")

            # Skills/tasks
            skills = emp.get("skills", [])
            if skills:
                lines.append(f"Skills: {json.dumps(skills, ensure_ascii=False)}")

            lines.append("")

        return lines


def main():
    parser = argparse.ArgumentParser(description="Generate NocoBase system blueprint")
    parser.add_argument("--url", default=os.environ.get("NB_URL", "http://localhost:14000"),
                        help="NocoBase base URL")
    parser.add_argument("--user", default=os.environ.get("NB_USER", "admin@nocobase.com"))
    parser.add_argument("--password", default=os.environ.get("NB_PASSWORD", "admin123"))
    parser.add_argument("--prefix", default=None,
                        help="Filter by menu prefix (e.g. 'CRM', 'HRM')")
    parser.add_argument("--output", "-o", default=None,
                        help="Output file path (default: stdout)")
    parser.add_argument("--no-js", action="store_true",
                        help="Skip JS block details")
    parser.add_argument("--no-workflows", action="store_true",
                        help="Skip workflow details")
    parser.add_argument("--no-stats", action="store_true",
                        help="Skip data row counts")
    args = parser.parse_args()

    nb = NB(base_url=args.url, account=args.user, password=args.password)
    gen = BlueprintGenerator(nb)
    result = gen.generate(
        prefix=args.prefix,
        include_js=not args.no_js,
        include_workflows=not args.no_workflows,
        include_data_stats=not args.no_stats,
    )

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result)
        print(f"Blueprint saved to {args.output}", file=sys.stderr)
    else:
        print(result)


if __name__ == "__main__":
    main()
