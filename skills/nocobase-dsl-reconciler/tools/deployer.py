"""Deployer v3 — compose skeleton + fill content one by one.

No mixed API modes. Clean separation:
  1. validate → check all specs before any API calls
  2. compose → create empty block shells
  3. addField/addAction → fill content (compose-supported types)
  4. save_model → fill content (legacy types: JSItem, Divider, Comments, etc.)
  5. setLayout → arrange everything
  6. state.yaml → track all UIDs

Usage:
    python deployer.py orders/               # deploy module
    python deployer.py orders/ --force       # force update
    python deployer.py orders/ --plan        # validate + preview only, no deploy
"""

from __future__ import annotations

import json
import random
import string
import sys
from pathlib import Path
from typing import Any

import yaml
from nb import NocoBase, dump_yaml, slugify
from layout import build_grid, apply_layout, parse_layout_spec, describe_layout


def uid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=11))


# ══════════════════════════════════════════════════════════════════
#  Validate + Plan (runs before any API calls)
# ══════════════════════════════════════════════════════════════════

def validate(mod_dir: str, nb: NocoBase = None) -> dict:
    """Validate all specs and return an execution plan.

    Checks:
      - structure.yaml parseable
      - Collections exist or have definitions
      - Fields exist in collections
      - titleField set on all referenced collections
      - filterForm: max 3 fields, text fields need filterPaths
      - All $refs resolvable (after simulating state)
      - Popup files parseable, targets valid
      - JS files referenced in specs exist

    Returns plan dict with summary, or raises ValueError with all errors.
    """
    mod = Path(mod_dir)
    errors: list[str] = []
    warnings: list[str] = []
    plan: dict[str, Any] = {"pages": [], "popups": [], "collections": []}

    # ── Parse specs ──
    try:
        structure = yaml.safe_load((mod / "structure.yaml").read_text())
    except Exception as e:
        raise ValueError(f"structure.yaml parse error: {e}")

    enhance = {}
    if (mod / "enhance.yaml").exists():
        try:
            enhance = yaml.safe_load((mod / "enhance.yaml").read_text()) or {}
        except Exception as e:
            errors.append(f"enhance.yaml parse error: {e}")

    popups_dir = mod / "popups"
    popup_files = []
    if popups_dir.is_dir():
        for pf in sorted(popups_dir.glob("*.yaml")):
            try:
                ps = yaml.safe_load(pf.read_text())
                if ps and ps.get("target"):
                    popup_files.append((pf.name, ps))
            except Exception as e:
                errors.append(f"popups/{pf.name} parse error: {e}")

    if not nb:
        nb = NocoBase()

    # ── Collections ──
    coll_defs = structure.get("collections", {})
    all_colls: set[str] = set()
    for ps in structure.get("pages", []):
        c = ps.get("coll", "")
        if c:
            all_colls.add(c)
        for bs in ps.get("blocks", []):
            c = bs.get("coll", "")
            if c:
                all_colls.add(c)

    for coll_name in all_colls:
        exists = nb.collection_exists(coll_name)
        has_def = coll_name in coll_defs
        if exists:
            plan["collections"].append(f"= {coll_name}")
        elif has_def:
            plan["collections"].append(f"+ {coll_name}")
        else:
            errors.append(f"Collection '{coll_name}' does not exist and no definition in collections:")

        # titleField check
        if exists:
            try:
                r = nb.s.get(f"{nb.base}/api/collections:list",
                             params={"filter": json.dumps({"name": coll_name})}, timeout=30)
                data = r.json().get("data", [])
                if data and not data[0].get("titleField"):
                    if has_def:
                        pass  # deployer will set it
                    else:
                        errors.append(
                            f"Collection '{coll_name}' has no titleField. "
                            f"Relation fields will fail to render."
                        )
            except Exception:
                pass

    # ── Validate fields exist ──
    for ps in structure.get("pages", []):
        page_coll = ps.get("coll", "")
        for bs in ps.get("blocks", []):
            btype = bs.get("type", "")
            bcoll = bs.get("coll", page_coll)
            if not bcoll or btype in ("jsBlock", "chart", "markdown", "iframe", "reference"):
                continue

            try:
                meta = nb.field_meta(bcoll)
            except Exception:
                continue

            for f in bs.get("fields", []):
                fp = f if isinstance(f, str) else f.get("field", f.get("fieldPath", ""))
                if not fp or fp.startswith("[") or fp in ("createdAt", "updatedAt", "id"):
                    continue
                if fp not in meta and bcoll not in coll_defs:
                    errors.append(f"Field '{bcoll}.{fp}' not found (page: {ps.get('page', '?')})")

    # ── filterForm validation ──
    for ps in structure.get("pages", []):
        for bs in ps.get("blocks", []):
            if bs.get("type") != "filterForm":
                continue
            fields = bs.get("fields", [])
            if len(fields) > 3:
                errors.append(
                    f"filterForm on page '{ps.get('page', '?')}' has {len(fields)} fields (max 3)"
                )
            bcoll = bs.get("coll", ps.get("coll", ""))
            if not bcoll:
                warnings.append(f"filterForm on page '{ps.get('page', '?')}' has no 'coll' (cross-collection filter?)")

            # text fields need filterPaths
            if bcoll:
                try:
                    meta = nb.field_meta(bcoll)
                except Exception:
                    meta = {}
                # Also check collections definitions for new collections
                coll_fields_def = {fd["name"]: fd.get("interface", "input")
                                   for fd in coll_defs.get(bcoll, {}).get("fields", [])
                                   if isinstance(fd, dict)}
                text_fields = []
                for f in fields:
                    fp = f if isinstance(f, str) else f.get("field", "")
                    iface = meta.get(fp, {}).get("interface") or coll_fields_def.get(fp, "input")
                    if iface in ("input", "textarea", "email", "phone", "url"):
                        has_paths = isinstance(f, dict) and f.get("filterPaths")
                        if not has_paths:
                            text_fields.append(fp)
                if len(text_fields) > 1:
                    errors.append(
                        f"filterForm on '{ps.get('page', '?')}' has {len(text_fields)} text inputs "
                        f"{text_fields}. Use ONE with filterPaths."
                    )

    # ── JS file references ──
    def _check_js_refs(blocks, page_name):
        for bs in blocks:
            for ji in bs.get("js_items", []):
                jf = ji.get("file", "")
                if jf and not (mod / jf).exists():
                    errors.append(f"JS file not found: {jf} (page: {page_name})")
            for ef in bs.get("event_flows", []):
                ef_file = ef.get("file", "")
                if ef_file and not (mod / ef_file).exists():
                    warnings.append(f"Event flow JS not found: {ef_file} (page: {page_name})")

    for ps in structure.get("pages", []):
        _check_js_refs(ps.get("blocks", []), ps.get("page", "?"))

    # ── SQL validation (charts + KPI) ──
    import re
    # Get all existing table names
    try:
        all_tables = {c["name"] for c in
                      nb.s.get(f"{nb.base}/api/collections:list",
                               params={"paginate": "false"}, timeout=30).json().get("data", [])}
        # Also include tables being created in this deploy
        all_tables.update(coll_defs.keys())
    except Exception:
        all_tables = set()

    def _validate_sql(sql: str, source: str):
        """Check SQL for references to non-existent tables."""
        if not sql or not all_tables:
            return
        # Extract table names from FROM and JOIN clauses
        table_refs = re.findall(
            r'(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)',
            sql, re.IGNORECASE)
        for tbl in table_refs:
            if tbl.lower() in ('select', 'where', 'group', 'order', 'having',
                               'limit', 'union', 'as', 'on', 'and', 'or', 'not',
                               'case', 'when', 'then', 'else', 'end', 'with',
                               'sla_check', 'true', 'false', 'null'):
                continue  # SQL keywords / CTE names
            if tbl not in all_tables:
                errors.append(f"SQL references non-existent table '{tbl}' ({source})")

    for ps in structure.get("pages", []):
        page_name = ps.get("page", "?")
        for bs in ps.get("blocks", []):
            # Chart SQL
            chart_file = bs.get("chart_config", "")
            if chart_file and (mod / chart_file).exists():
                try:
                    if chart_file.endswith((".yaml", ".yml")):
                        chart_spec = yaml.safe_load((mod / chart_file).read_text()) or {}
                        sql_file = chart_spec.get("sql_file", "")
                        if sql_file and (mod / sql_file).exists():
                            sql = (mod / sql_file).read_text()
                            _validate_sql(sql, f"chart {chart_file} → {sql_file}")
                    else:
                        config = json.loads((mod / chart_file).read_text())
                        sql = config.get("query", {}).get("sql", "")
                        _validate_sql(sql, f"chart {chart_file}")
                except Exception:
                    pass

            # KPI JS — extract SQL from CONFIG.sql in JS file
            js_file = bs.get("file", "")
            if js_file and bs.get("type") == "jsBlock" and (mod / js_file).exists():
                try:
                    js_code = (mod / js_file).read_text()
                    # Validate KPI JS has required rendering patterns
                    if "ctx.render" not in js_code and "ctx.React.createElement" not in js_code:
                        errors.append(
                            f"JS block '{js_file}' missing ctx.render(). "
                            f"FIX: cp templates/kpi_card.js {js_file} — then only edit CONFIG section"
                        )
                    if "ctx.sql" not in js_code and "ctx.request" not in js_code:
                        errors.append(
                            f"JS block '{js_file}' has no data fetch (ctx.sql/ctx.request). "
                            f"FIX: cp templates/kpi_card.js {js_file} — then only edit CONFIG.sql"
                        )
                    # Find SQL in CONFIG.sql = `...`
                    sql_match = re.search(r'sql:\s*`([^`]+)`', js_code)
                    if sql_match:
                        _validate_sql(sql_match.group(1), f"KPI {js_file}")
                except Exception:
                    pass

    # ── Build plan summary ──
    pages = structure.get("pages", [])
    for ps in pages:
        blocks = ps.get("blocks", [])
        plan["pages"].append({
            "name": ps.get("page", "?"),
            "blocks": len(blocks),
            "types": [b.get("type", "?") for b in blocks],
        })

    # Popup plan
    all_popups = list(enhance.get("popups", []))
    for fname, ps in popup_files:
        all_popups.append(ps)
    expanded = _expand_popups(all_popups)
    for p in expanded:
        target = p.get("target", "")
        blocks = p.get("blocks", [])
        auto = p.get("auto", [])
        plan["popups"].append({
            "target": target,
            "blocks": len(blocks),
            "auto": auto,
        })

    # ── Report ──
    if errors:
        msg = f"\n  Validation failed ({len(errors)} errors):\n"
        for e in errors:
            msg += f"    ✗ {e}\n"
        if warnings:
            for w in warnings:
                msg += f"    ⚠ {w}\n"
        raise ValueError(msg)

    return plan


def print_plan(plan: dict, warnings: list[str] = None):
    """Pretty-print an execution plan."""
    colls = plan.get("collections", [])
    pages = plan.get("pages", [])
    popups = plan.get("popups", [])

    print(f"\n  ── Plan ──")
    if colls:
        print(f"  Collections: {len(colls)}")
        for c in colls:
            print(f"    {c}")

    print(f"  Pages: {len(pages)}")
    for p in pages:
        types = ", ".join(p["types"])
        print(f"    {p['name']}: {p['blocks']} blocks ({types})")

    print(f"  Popups: {len(popups)}")
    for p in popups:
        target = p["target"]
        auto = p.get("auto", [])
        n = p["blocks"]
        label = f"{n} blocks"
        if auto:
            label = f"auto: {auto}"
        print(f"    {target} → {label}")

    total_blocks = sum(p["blocks"] for p in pages)
    print(f"\n  Total: {len(colls)} collections, {len(pages)} pages, "
          f"{total_blocks} blocks, {len(popups)} popups")
    print(f"  ✓ Validation passed\n")


# ══════════════════════════════════════════════════════════════════
#  Main entry
# ══════════════════════════════════════════════════════════════════

def deploy(mod_dir: str, force: bool = False, plan_only: bool = False):
    mod = Path(mod_dir)

    # Phase 0: Validate
    nb = NocoBase()
    try:
        plan = validate(mod_dir, nb)
        print_plan(plan)
        if plan_only:
            return
    except ValueError as e:
        print(str(e))
        sys.exit(1)

    structure = yaml.safe_load((mod / "structure.yaml").read_text())
    enhance = {}
    if (mod / "enhance.yaml").exists():
        enhance = yaml.safe_load((mod / "enhance.yaml").read_text()) or {}

    # Load popup detail files from popups/ directory (Phase 2+)
    popups_dir = mod / "popups"
    if popups_dir.is_dir():
        for pf in sorted(popups_dir.glob("*.yaml")):
            popup_spec = yaml.safe_load(pf.read_text())
            if popup_spec and popup_spec.get("target"):
                enhance.setdefault("popups", []).append(popup_spec)
                print(f"  + popup file: {pf.name}")
    state_file = mod / "state.yaml"
    state = yaml.safe_load(state_file.read_text()) if state_file.exists() else {}
    print(f"  Connected to {nb.base}")

    # Collections
    for name, coll_def in structure.get("collections", {}).items():
        _ensure_collection(nb, name, coll_def)

    # Validate titleField on all referenced collections
    all_colls = set()
    for ps in structure.get("pages", []):
        c = ps.get("coll", "")
        if c:
            all_colls.add(c)
        for bs in ps.get("blocks", []):
            c = bs.get("coll", "")
            if c:
                all_colls.add(c)
    for c in all_colls:
        try:
            r = nb.s.get(f"{nb.base}/api/collections:list",
                         params={"filter": json.dumps({"name": c})}, timeout=30)
            data = r.json().get("data", [])
            if data and not data[0].get("titleField"):
                raise ValueError(
                    f"Collection '{c}' has no titleField set. "
                    f"Relation fields (m2o) will fail to render.\n"
                    f"Fix: add titleField in collections definition, or run:\n"
                    f"  curl -X POST {nb.base}/api/collections:update?filterByTk={c} "
                    f"-H 'Content-Type: application/json' -d '{{\"titleField\":\"name\"}}'"
                )
        except ValueError:
            raise
        except Exception:
            pass

    # Group — supports nested groups via "Parent/Child" format
    module_name = structure.get("module", "Untitled")
    group_path = structure.get("group", module_name)
    icon = structure.get("icon", "appstoreoutlined")

    # Split group path for nested groups (e.g., "Main Copy/More Charts Copy")
    group_parts = [p.strip() for p in group_path.split("/")]
    group_id = state.get("group_id")
    if not group_id:
        parent_id = None
        for i, gname in enumerate(group_parts):
            gid = _find_group(nb, gname, parent_id)
            if not gid:
                result = nb.create_group(gname, icon=icon, parent_id=parent_id)
                gid = result["routeId"]
                print(f"  + group: {gname}")
            else:
                print(f"  = group: {gname}")
            parent_id = gid
        group_id = parent_id
    else:
        print(f"  = group: {group_path}")
    state["group_id"] = group_id
    state.setdefault("pages", {})

    # Pages
    for ps in structure.get("pages", []):
        page_title = ps["page"]
        page_key = slugify(page_title)
        page_state = state["pages"].get(page_key, {})

        if not page_state.get("tab_uid"):
            result = nb.create_page(page_title, group_id,
                                    icon=ps.get("icon", "fileoutlined"))
            page_state = {
                "route_id": result["routeId"],
                "page_uid": result["pageUid"],
                "tab_uid": result["tabSchemaUid"],
                "grid_uid": result.get("gridUid", ""),
            }
            print(f"  + page: {page_title}")
        else:
            print(f"  = page: {page_title}")

        page_tabs = ps.get("tabs", [])
        if page_tabs:
            # Multi-tab page: deploy each tab
            tab_states = page_state.get("tab_states", {})
            for ti, tab_spec in enumerate(page_tabs):
                tab_title = tab_spec.get("title", f"Tab{ti}")
                tab_key = slugify(tab_title)

                if ti == 0:
                    # First tab = default tab (already created)
                    tab_uid = page_state["tab_uid"]
                    # Rename if needed
                    if tab_title:
                        route_id = page_state.get("route_id")
                        if route_id:
                            try:
                                # Find the tabs child route and rename
                                r_data = nb.s.get(f"{nb.base}/api/desktopRoutes:list",
                                    params={"filter": json.dumps({"parentId": route_id, "type": "tabs"}),
                                            "pageSize": 10}, timeout=30)
                                tab_routes = r_data.json().get("data", [])
                                if tab_routes:
                                    nb.s.post(f"{nb.base}/api/desktopRoutes:update",
                                              params={"filterByTk": tab_routes[0]["id"]},
                                              json={"title": tab_title}, timeout=30)
                            except Exception:
                                pass
                elif tab_key in tab_states:
                    tab_uid = tab_states[tab_key].get("tab_uid", "")
                else:
                    # Create additional tab
                    try:
                        route_id = page_state.get("route_id")
                        r2 = nb.s.post(f"{nb.base}/api/desktopRoutes:create",
                                       json={"type": "tabs", "title": tab_title,
                                             "parentId": route_id}, timeout=30)
                        tab_data = r2.json().get("data", {})
                        tab_uid = tab_data.get("schemaUid", "")
                        print(f"    + tab: {tab_title}")
                    except Exception as e:
                        print(f"    ! tab {tab_title}: {e}")
                        continue

                existing_blocks = tab_states.get(tab_key, {}).get("blocks", {})
                blocks_state = deploy_surface(nb, tab_uid, tab_spec, mod, force,
                                               existing_blocks)
                tab_states[tab_key] = {"tab_uid": tab_uid, "blocks": blocks_state}

            page_state["tab_states"] = tab_states
        else:
            # Single tab page
            existing_blocks = page_state.get("blocks", {})
            blocks_state = deploy_surface(nb, page_state["tab_uid"], ps, mod, force,
                                           existing_blocks)
            page_state["blocks"] = blocks_state

        # Page-level event flows (e.g., customVariable for filterForm → chart binding)
        page_flows = ps.get("page_event_flows", [])
        if page_flows and page_state.get("page_uid"):
            flow_registry = {}
            for pf in page_flows:
                flow_key = pf.get("flow_key", "")
                if flow_key:
                    flow_registry[flow_key] = {
                        "key": flow_key,
                        "title": pf.get("title", "Event flow"),
                        "on": pf.get("event", {}),
                        "steps": pf.get("steps", {}),
                    }
            if flow_registry:
                try:
                    page_uid = page_state["page_uid"]
                    nb.save_model({"uid": page_uid, "flowRegistry": flow_registry})
                    print(f"    + page event flows: {len(flow_registry)}")
                except Exception as e:
                    print(f"    ! page event flows: {e}")

        state["pages"][page_key] = page_state

    # Popups
    from refs import RefResolver
    resolver = RefResolver(state)
    popups = _expand_popups(enhance.get("popups", []))

    for popup_spec in popups:
        target_ref = popup_spec.get("target", "")
        try:
            target_uid = resolver.resolve_uid(target_ref)
        except KeyError as e:
            print(f"  ! popup {target_ref}: {e}")
            continue

        # Extract popup_path from target ref for nested popup file resolution
        # e.g., "$page.table.fields.name" → "name"
        ref_parts = target_ref.split(".")
        pp = ref_parts[-1] if ref_parts else ""
        _deploy_popup(nb, target_uid, target_ref, popup_spec, state, mod, force,
                      popup_path=pp)

    # Save state
    state_file.write_text(dump_yaml(state))
    print(f"\n  State saved. Done.")

    # ── Post-deploy verification ──
    post_errors = []
    for ps in structure.get("pages", []):
        for tab_spec in ps.get("tabs", [ps]):
            for bs in tab_spec.get("blocks", []):
                btype = bs.get("type", "")
                key = bs.get("key", "")
                page_key = slugify(ps.get("page", ""))
                binfo = state.get("pages", {}).get(page_key, {})
                # Check in blocks or tab_states
                block_uid = binfo.get("blocks", {}).get(key, {}).get("uid", "")
                if not block_uid:
                    for tk, tv in binfo.get("tab_states", {}).items():
                        block_uid = tv.get("blocks", {}).get(key, {}).get("uid", "")
                        if block_uid:
                            break
                if not block_uid:
                    continue

                if btype == "chart":
                    try:
                        d = nb.get(uid=block_uid)
                        chart_cfg = d.get("tree", {}).get("stepParams", {}).get("chartSettings", {}).get("configure", {})
                        if not chart_cfg.get("query", {}).get("sql"):
                            post_errors.append(f"Chart '{key}' deployed but has NO SQL config — redeploy with --force")
                    except Exception:
                        pass

                if btype == "jsBlock":
                    try:
                        d = nb.get(uid=block_uid)
                        code = d.get("tree", {}).get("stepParams", {}).get("jsSettings", {}).get("runJs", {}).get("code", "")
                        if len(code) < 100:
                            post_errors.append(f"JS block '{key}' has only {len(code)} chars — likely empty or stub")
                    except Exception:
                        pass

    if post_errors:
        print(f"\n  ── Post-deploy warnings ──")
        for e in post_errors:
            print(f"  ⚠ {e}")

    # ── Next steps hint ──
    has_enhance = (mod / "enhance.yaml").exists()
    has_popups = (mod / "popups").is_dir() and any((mod / "popups").glob("*.yaml"))
    has_js = (mod / "js").is_dir() and any((mod / "js").glob("*.js"))
    pages_count = len(structure.get("pages", []))
    hints = []
    if not has_enhance:
        hints.append("Write enhance.yaml with addNew popups (auto: [edit] to derive edit popup)")
    if not has_popups:
        hints.append("Write popups/*.yaml for name-click detail popups (details + sub-tables + tabs)")
    if has_popups and not has_js:
        hints.append("Add JS files in js/ for KPI cards, custom renders, event flows")
    if not hints:
        hints.append("Run: python sync.py " + mod_dir + " to capture any manual UI adjustments")
    print(f"\n  ── Next steps ──")
    for h in hints:
        print(f"  → {h}")


# ══════════════════════════════════════════════════════════════════
#  Surface deployment (page or popup tab)
# ══════════════════════════════════════════════════════════════════

def deploy_surface(nb: NocoBase, tab_uid: str, spec: dict,
                   mod: Path, force: bool = False,
                   existing_state: dict = None) -> dict:
    """Deploy blocks into a surface (page tab or popup tab).

    Incremental: if existing_state has block UIDs, skip those blocks.
    Returns blocks state dict {key: {uid, type, ...}}.
    """
    coll = spec.get("coll", "")
    blocks_spec = spec.get("blocks", [])
    if not blocks_spec:
        return existing_state or {}

    existing = existing_state or {}
    blocks_state = dict(existing)  # preserve existing UIDs

    # Pre-process: reorder table fields — popup-enabled fields first
    popup_fields = set()
    for tab in spec.get("tabs", [spec]):
        for p in tab.get("popups", []):
            pf = p.get("field", "")
            if pf and pf not in ("addnew", "edit", "view", "delete"):
                popup_fields.add(pf)
    if mod:
        popups_dir_check = mod / "popups"
        if popups_dir_check.is_dir():
            for pf in popups_dir_check.glob("*.yaml"):
                stem = pf.stem
                if "." not in stem and stem not in ("addnew", "edit", "view"):
                    popup_fields.add(stem)
        enhance_file_check = mod / "enhance.yaml"
        if enhance_file_check.exists():
            try:
                eh = yaml.safe_load(enhance_file_check.read_text()) or {}
                for ps in eh.get("popups", []):
                    target = ps.get("target", "")
                    if ".fields." in target:
                        popup_fields.add(target.split(".fields.")[-1])
            except Exception:
                pass
    if popup_fields:
        for bs in blocks_spec:
            if bs.get("type") != "table":
                continue
            fields = bs.get("fields", [])
            if not fields:
                continue
            front = [f for f in fields if (f if isinstance(f, str) else f.get("field", f.get("fieldPath", ""))) in popup_fields]
            rest = [f for f in fields if (f if isinstance(f, str) else f.get("field", f.get("fieldPath", ""))) not in popup_fields]
            if front:
                bs["fields"] = front + rest

    # Pre-process: filterForm — put search field (with filterPaths) first
    for bs in blocks_spec:
        if bs.get("type") != "filterForm":
            continue
        key = bs.get("key", "")
        if key in existing:
            continue  # only on first create
        fields = bs.get("fields", [])
        if not fields:
            continue
        search = [f for f in fields if isinstance(f, dict) and f.get("filterPaths")]
        rest = [f for f in fields if not (isinstance(f, dict) and f.get("filterPaths"))]
        if search:
            bs["fields"] = search + rest

    # Check if all blocks already exist in state
    all_exist = all(
        bs.get("key", f"{bs.get('type','')}_{i}") in existing
        for i, bs in enumerate(blocks_spec)
    )

    # Find page-level grid_uid (needed for filterManager + layout)
    grid_uid = ""
    for getter in [lambda: nb.get(tabSchemaUid=tab_uid), lambda: nb.get(uid=tab_uid)]:
        try:
            data = getter()
            tree = data.get("tree", {})
            g = tree.get("subModels", {}).get("grid", {})
            if isinstance(g, dict) and g.get("uid"):
                grid_uid = g["uid"]
                break
            popup = tree.get("subModels", {}).get("page", {})
            if popup:
                tabs = popup.get("subModels", {}).get("tabs", [])
                if isinstance(tabs, list) and tabs:
                    pg = tabs[0].get("subModels", {}).get("grid", {})
                    if isinstance(pg, dict) and pg.get("uid"):
                        grid_uid = pg["uid"]
                        break
        except Exception as e:
            continue

    if all_exist:
        if force:
            # Force: check for missing fields, fix display models, JS, layout
            print(f"    ~ {len(existing)} blocks exist (update in-place)")
            for bs in blocks_spec:
                key = bs.get("key", "")
                if key not in blocks_state or not blocks_state[key].get("uid"):
                    continue
                block_uid = blocks_state[key]["uid"]
                block_grid = blocks_state[key].get("grid_uid", "")
                btype = bs.get("type", "")

                # Check for missing fields and add them
                if btype in ("table", "filterForm", "createForm", "editForm", "details"):
                    spec_fields = []
                    for f in bs.get("fields", []):
                        fp = f if isinstance(f, str) else f.get("field", f.get("fieldPath", ""))
                        if fp and not fp.startswith("["):
                            spec_fields.append(fp)

                    existing_fields = set(blocks_state[key].get("fields", {}).keys())
                    for fp in spec_fields:
                        if fp not in existing_fields:
                            try:
                                result = nb.add_field(block_uid, fp)
                                blocks_state[key].setdefault("fields", {})[fp] = {
                                    "wrapper": result.get("wrapperUid", result.get("uid", "")),
                                    "field": result.get("fieldUid", ""),
                                }
                                print(f"      + field: {fp}")
                            except Exception as e:
                                print(f"      ! field {fp}: {e}")

                # Reorder table columns to match spec field order
                if btype == "table" and spec_fields:
                    _reorder_table_columns(nb, block_uid, spec_fields)

                _fill_block(nb, block_uid, block_grid, bs, coll, mod, blocks_state[key], blocks_state, grid_uid)
        else:
            print(f"    = {len(existing)} blocks exist (skip)")

        # Always apply layout if spec defines it (auto-correct drift)
        layout_spec = spec.get("layout")
        if layout_spec and grid_uid:
            uid_map = {k: v["uid"] for k, v in blocks_state.items() if "uid" in v}
            layout = parse_layout_spec(layout_spec, list(uid_map.keys()))
            apply_layout(nb, grid_uid, layout, uid_map)

        return blocks_state

    # Step 1: Compose empty block shells (only new ones)
    compose_blocks = []
    for bs in blocks_spec:
        key = bs.get("key", f"{bs.get('type','')}_{len(compose_blocks)}")
        if key in existing and not force:
            continue  # skip existing
        cb = _to_compose_block(bs, coll)
        if cb:
            compose_blocks.append(cb)

    if compose_blocks:
        try:
            # Use append mode if some blocks already exist, replace if fresh
            mode = "append" if existing else "replace"
            result = nb.compose(tab_uid, compose_blocks, mode=mode)
            composed = result.get("blocks", [])
            print(f"    composed {len(composed)} block shells")

            # Map compose results to spec keys
            compose_idx = 0
            for bs in blocks_spec:
                key = bs.get("key", "")
                if key in existing and not force:
                    continue
                cb = _to_compose_block(bs, coll)
                if not cb:
                    continue
                if compose_idx < len(composed):
                    cr = composed[compose_idx]
                    bs_entry: dict[str, Any] = {
                        "uid": cr["uid"],
                        "type": cr["type"],
                        "grid_uid": cr.get("gridUid", ""),
                    }
                    # Track field UIDs from compose result
                    cr_fields = cr.get("fields", [])
                    if cr_fields:
                        bs_entry["fields"] = {
                            f.get("fieldPath", f.get("key", "")): {
                                "wrapper": f.get("wrapperUid", f.get("uid", "")),
                                "field": f.get("fieldUid", ""),
                            } for f in cr_fields
                        }
                    # Track action UIDs
                    for atype_key in ("actions", "recordActions"):
                        cr_acts = cr.get(atype_key, [])
                        if cr_acts:
                            bs_entry[atype_key.replace("A", "_a")] = {
                                a.get("key", a.get("type", "")): {"uid": a.get("uid", "")}
                                for a in cr_acts
                            }
                    blocks_state[key] = bs_entry
                    compose_idx += 1

            # Step 2: Fill each NEW block with content
            for bs in blocks_spec:
                key = bs.get("key", "")
                if key in existing and not force:
                    continue
                if key not in blocks_state:
                    continue
                block_uid = blocks_state[key]["uid"]
                block_grid = blocks_state[key].get("grid_uid", "")
                _fill_block(nb, block_uid, block_grid, bs, coll, mod, blocks_state[key], blocks_state, grid_uid)

        except Exception as e:
            print(f"    ! compose: {e}")
            return blocks_state

    # Step 3: Add legacy blocks (not compose-supported)
    # Check if there are any legacy blocks to create
    legacy_needed = any(
        bs.get("key", "") not in blocks_state
        for bs in blocks_spec
        if not _to_compose_block(bs, coll)
    )

    # Find grid_uid — try multiple paths (page tab, popup tab, or direct node)
    grid_uid = ""
    for getter in [
        lambda: nb.get(tabSchemaUid=tab_uid),
        lambda: nb.get(uid=tab_uid),
    ]:
        try:
            data = getter()
            tree = data.get("tree", {})
            # Direct grid
            grid = tree.get("subModels", {}).get("grid", {})
            if isinstance(grid, dict) and grid.get("uid"):
                grid_uid = grid["uid"]
                break
            # Popup path: field → page → tabs[0] → grid
            popup = tree.get("subModels", {}).get("page", {})
            if popup:
                tabs = popup.get("subModels", {}).get("tabs", [])
                if isinstance(tabs, list) and tabs:
                    g = tabs[0].get("subModels", {}).get("grid", {})
                    if isinstance(g, dict) and g.get("uid"):
                        grid_uid = g["uid"]
                        break
        except Exception as e:
            continue

    # If no grid_uid found but legacy blocks needed, create ChildPage via compose
    if not grid_uid and legacy_needed:
        try:
            nb.compose(tab_uid, [], mode="replace")
            # Re-read to get the newly created grid
            data = nb.get(uid=tab_uid)
            tree = data.get("tree", {})
            popup = tree.get("subModels", {}).get("page", {})
            if popup:
                tabs = popup.get("subModels", {}).get("tabs", [])
                if isinstance(tabs, list) and tabs:
                    g = tabs[0].get("subModels", {}).get("grid", {})
                    if isinstance(g, dict) and g.get("uid"):
                        grid_uid = g["uid"]
        except Exception:
            pass

    if grid_uid:
        for bs in blocks_spec:
            key = bs.get("key", "")
            if key in blocks_state:
                continue  # already created by compose
            btype = bs.get("type", "")
            block_uid = _create_legacy_block(nb, grid_uid, bs, coll, mod)
            if block_uid:
                blocks_state[key] = {"uid": block_uid, "type": btype}

    # Step 4: Layout
    layout_spec = spec.get("layout")
    if layout_spec and grid_uid:
        uid_map = {k: v["uid"] for k, v in blocks_state.items()}
        layout = parse_layout_spec(layout_spec, list(uid_map.keys()))
        apply_layout(nb, grid_uid, layout, uid_map)
        print(f"    layout: {describe_layout(layout)}")

    # Step 4.5: Reorder table columns to match spec field order
    for bs in blocks_spec:
        btype = bs.get("type", "")
        key = bs.get("key", "")
        if btype != "table" or key not in blocks_state:
            continue
        block_uid = blocks_state[key].get("uid", "")
        if not block_uid:
            continue
        spec_fields = []
        for f in bs.get("fields", []):
            fp = f if isinstance(f, str) else f.get("field", f.get("fieldPath", ""))
            if fp and not fp.startswith("["):
                spec_fields.append(fp)
        if spec_fields:
            _reorder_table_columns(nb, block_uid, spec_fields)

    # Step 5: Deploy nested popups from spec blocks + popups/ dir
    if mod:
        _deploy_nested_popups(nb, blocks_spec, blocks_state, mod, force)

    return blocks_state


def _deploy_nested_popups(nb: NocoBase, blocks_spec: list, blocks_state: dict,
                          mod: Path, force: bool):
    """Deploy popups defined inside block specs (e.g., table actions, field clicks).

    Scans blocks for popup definitions and deploys them recursively.
    Also loads matching popup files from popups/ dir.
    """
    popups_dir = mod / "popups"

    for bs in blocks_spec:
        key = bs.get("key", "")
        binfo = blocks_state.get(key, {})
        block_uid = binfo.get("uid", "")
        if not block_uid:
            continue

        # Collect popup specs from block spec
        block_popups = bs.get("popups", [])

        # Also check popups/ dir for files matching this block's nested refs
        if popups_dir.is_dir():
            for pf in sorted(popups_dir.glob("*.yaml")):
                try:
                    popup_spec = yaml.safe_load(pf.read_text())
                    if not popup_spec or not popup_spec.get("target"):
                        # Check if this popup belongs to a nested table in current block
                        # e.g., popups/opp_copy_name_quotation_no.yaml
                        pass
                except Exception:
                    continue

        # Deploy popups referenced in the block's tab specs
        for tab_spec in bs.get("tabs", []) if bs.get("tabs") else [bs]:
            tab_blocks = tab_spec.get("blocks", [])
            for tb in tab_blocks:
                tb_popups = tb.pop("popups", [])
                if not tb_popups:
                    continue

                # Find this block's UID in the live system
                tb_key = tb.get("key", "")
                # Look for the actual block in the popup's live tree
                try:
                    data = nb.get(uid=block_uid)
                    tree = data.get("tree", {})
                    popup_page = tree.get("subModels", {}).get("page", {})
                    if not popup_page:
                        continue

                    tabs = popup_page.get("subModels", {}).get("tabs", [])
                    if not isinstance(tabs, list) or not tabs:
                        continue

                    for live_tab in tabs:
                        live_grid = live_tab.get("subModels", {}).get("grid", {})
                        live_items = live_grid.get("subModels", {}).get("items", [])

                        for live_item in (live_items if isinstance(live_items, list) else []):
                            live_title = live_item.get("stepParams", {}).get("cardSettings", {}).get("titleDescription", {}).get("title", "")

                            if live_title == tb.get("title", "") or live_item.get("use", "").replace("Model", "").lower() == tb_key:
                                # Found matching block — deploy its nested popups
                                for nested_popup in tb_popups:
                                    field_name = nested_popup.get("field", "")
                                    if not field_name:
                                        continue

                                    # Find the field/action UID in this live block
                                    target_uid = _find_nested_popup_target(live_item, field_name)
                                    if target_uid:
                                        _deploy_popup(nb, target_uid, f"nested.{field_name}",
                                                      nested_popup, {}, mod, force)
                except Exception:
                    pass


def _reorder_table_columns(nb: NocoBase, block_uid: str, spec_fields: list[str]):
    """Reorder table columns to match spec field order via moveNode.

    Popup-enabled fields come first (after the actions column).
    Uses flowSurfaces:moveNode for reliable reordering.
    """
    try:
        data = nb.get(uid=block_uid)
        tree = data.get("tree", {})
        cols = tree.get("subModels", {}).get("columns", [])
        if not isinstance(cols, list) or len(cols) < 2:
            return

        # Build fieldPath → uid map + find actions column
        col_uid_map: dict[str, str] = {}
        actions_uid = ""
        for c in cols:
            fp = c.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp:
                col_uid_map[fp] = c.get("uid", "")
            elif "TableActionsColumn" in c.get("use", ""):
                actions_uid = c.get("uid", "")

        # Current order (from live system)
        current_order = [
            c.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            for c in cols if c.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath")
        ]

        # Desired order from spec
        desired = [fp for fp in spec_fields if fp in col_uid_map]
        if desired == current_order:
            return  # already correct

        # Move columns into desired order using moveNode
        # Strategy: move each column after the previous one (or after actions column for first)
        prev_uid = actions_uid  # anchor: first field goes after actions column
        for fp in desired:
            col_uid = col_uid_map[fp]
            if prev_uid:
                nb.move_node(col_uid, prev_uid, "after")
            prev_uid = col_uid
    except Exception:
        pass


def _find_nested_popup_target(block: dict, field_name: str) -> str | None:
    """Find the UID of a field or action that should have a popup."""
    fn_lower = field_name.lower()

    # Check columns for field name
    for col in block.get("subModels", {}).get("columns", []):
        fp = col.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
        if fp.lower() == fn_lower:
            field = col.get("subModels", {}).get("field", {})
            return field.get("uid", col.get("uid", "")) if isinstance(field, dict) else col.get("uid", "")

    # Check actions + recordActions (details blocks use recordActions for edit/view)
    for akey in ("actions", "recordActions"):
        for act in (block.get("subModels", {}).get(akey, [])
                     if isinstance(block.get("subModels", {}).get(akey), list) else []):
            act_type = act.get("use", "").replace("Model", "").replace("Action", "").lower()
            if act_type == fn_lower or fn_lower in act_type:
                return act.get("uid", "")

    # Check record actions (inside TableActionsColumn)
    for col in block.get("subModels", {}).get("columns", []):
        if "TableActionsColumn" in col.get("use", ""):
            for act in col.get("subModels", {}).get("actions", []):
                act_type = act.get("use", "").replace("Model", "").replace("Action", "").lower()
                if act_type == fn_lower or fn_lower in act_type:
                    return act.get("uid", "")

    return None


# ══════════════════════════════════════════════════════════════════
#  Compose block shell (no fields/actions — just the container)
# ══════════════════════════════════════════════════════════════════

# Types that compose can create (even as empty shells)
COMPOSE_TYPES = {
    "table", "filterForm", "createForm", "editForm", "details",
    "list", "gridCard", "jsBlock", "chart", "markdown", "iframe",
}

# Types that need legacy API
LEGACY_TYPES = {"comments", "recordHistory", "reference"}


def _to_compose_block(bs: dict, default_coll: str) -> dict | None:
    """Convert block spec to compose block WITH fields (for auto type inference).

    compose with fields auto-infers display/edit models from collection interface.
    Without fields, all columns render as plain text.
    """
    btype = bs.get("type", "")
    key = bs.get("key", btype)

    if btype not in COMPOSE_TYPES:
        return None

    res_binding = bs.get("resource_binding", {})
    block: dict[str, Any] = {"key": key, "type": btype}

    # Resource
    resource = bs.get("resource")
    block_coll = bs.get("coll", default_coll)
    if resource:
        block["resource"] = resource
    elif res_binding.get("associationName"):
        block["resource"] = {
            "collectionName": block_coll,
            "dataSourceKey": "main",
            "associationName": res_binding["associationName"],
        }
        if res_binding.get("sourceId"):
            block["resource"]["sourceId"] = res_binding["sourceId"]
    elif res_binding.get("filterByTk"):
        block["resource"] = {"binding": "currentRecord"}
    elif block_coll and btype not in ("filterForm", "jsBlock", "chart", "markdown"):
        block["resource"] = {"collectionName": block_coll, "dataSourceKey": "main"}

    # Include fields — compose auto-infers display/edit model from interface
    # filterForm: only include fields if collection is known (otherwise addField fails)
    fields = bs.get("fields", [])
    include_fields = btype in ("table", "createForm", "editForm", "details")
    if btype == "filterForm" and block_coll:
        include_fields = True  # filterForm with known collection can use compose fields

    # Also extract fields from field_layout (may reference fields not in fields list)
    # Skip layout directives: col (vertical group), size (width), [JS:xxx] (JS items), --- (divider)
    _LAYOUT_KEYS = {"col", "size"}
    field_layout = bs.get("field_layout", [])
    layout_fields = set()
    for row in field_layout:
        if isinstance(row, list):
            for item in row:
                if isinstance(item, str) and not item.startswith("[") and not item.startswith("---"):
                    layout_fields.add(item)
                elif isinstance(item, dict):
                    for k in item.keys():
                        if k in _LAYOUT_KEYS or k.startswith("[") or k.startswith("---"):
                            continue
                        layout_fields.add(k)

    _SYSTEM_FIELDS = {"id", "createdAt", "updatedAt", "createdBy", "updatedBy", "createdById", "updatedById"}
    all_fields = set()
    for f in fields:
        fp = f if isinstance(f, str) else f.get("field", f.get("fieldPath", ""))
        if fp and not fp.startswith("[") and fp not in _SYSTEM_FIELDS:
            all_fields.add(fp)
    all_fields.update(layout_fields - _SYSTEM_FIELDS)

    if all_fields and include_fields:
        compose_fields = [{"fieldPath": fp} for fp in all_fields]
        block["fields"] = compose_fields

    # Include actions — compose handles standard action types
    # Exclude edit/view — compose auto-creates empty popup stubs for these.
    # Only pass compose-supported actions. Others created via save_model in _fill_block.
    _COMPOSE_ACTIONS = {"filter", "refresh", "addNew", "delete", "bulkDelete", "submit", "reset"}
    actions = list(bs.get("actions", []))
    record_actions = list(bs.get("recordActions", []))

    compose_actions = [a for a in actions if (a if isinstance(a, str) else a.get("type", "")) in _COMPOSE_ACTIONS]
    compose_rec_actions = [a for a in record_actions if (a if isinstance(a, str) else a.get("type", "")) in _COMPOSE_ACTIONS]

    if compose_actions:
        block["actions"] = [{"type": a} if isinstance(a, str) else a for a in compose_actions]
    if compose_rec_actions:
        block["recordActions"] = [{"type": a} if isinstance(a, str) else a for a in compose_rec_actions]

    return block


# ══════════════════════════════════════════════════════════════════
#  Fill block content
# ══════════════════════════════════════════════════════════════════

# Interface → correct display model mapping (from NocoBase source)
DISPLAY_MODEL_MAP = {
    "input": "DisplayTextFieldModel",
    "textarea": "DisplayTextFieldModel",
    "email": "DisplayTextFieldModel",
    "phone": "DisplayTextFieldModel",
    "url": "DisplayURLFieldModel",
    "select": "DisplayEnumFieldModel",
    "radioGroup": "DisplayEnumFieldModel",
    "multipleSelect": "DisplayEnumFieldModel",
    "checkboxGroup": "DisplayEnumFieldModel",
    "checkbox": "DisplayCheckboxFieldModel",
    "integer": "DisplayNumberFieldModel",
    "number": "DisplayNumberFieldModel",
    "percent": "DisplayPercentFieldModel",
    "date": "DisplayDateTimeFieldModel",
    "datetime": "DisplayDateTimeFieldModel",
    "createdAt": "DisplayDateTimeFieldModel",
    "updatedAt": "DisplayDateTimeFieldModel",
    "time": "DisplayTimeFieldModel",
    "color": "DisplayColorFieldModel",
    "m2o": "DisplayTextFieldModel",
    "o2m": "DisplayNumberFieldModel",
    "createdBy": "DisplaySubItemFieldModel",
    "updatedBy": "DisplaySubItemFieldModel",
    "richText": "DisplayHtmlFieldModel",
    "json": "DisplayJSONFieldModel",
}


def _fix_display_models(nb: NocoBase, block_uid: str, coll: str, btype: str):
    """Fix display models after compose (which defaults everything to DisplayTextFieldModel).

    Reads collection metadata, then updates each field's display model to match its interface.
    """
    meta = nb.field_meta(coll)
    data = nb.get(uid=block_uid)
    tree = data.get("tree", {})

    if btype == "table":
        cols = tree.get("subModels", {}).get("columns", [])
        if not isinstance(cols, list):
            return
        for col in cols:
            fp = col.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if not fp or fp not in meta:
                continue
            iface = meta[fp].get("interface", "input")
            correct_model = DISPLAY_MODEL_MAP.get(iface, "DisplayTextFieldModel")
            if correct_model == "DisplayTextFieldModel":
                continue  # already correct

            # Update the child display field model
            field = col.get("subModels", {}).get("field", {})
            if isinstance(field, dict) and field.get("uid"):
                field_uid = field["uid"]
                current_use = field.get("use", "")
                if current_use != correct_model:
                    # Change the model use via save
                    nb.save_model({
                        "uid": field_uid,
                        "use": correct_model,
                        "parentId": col.get("uid", ""),
                        "subKey": "field",
                        "subType": "object",
                        "sortIndex": field.get("sortIndex", 0),
                        "stepParams": field.get("stepParams", {}),
                        "flowRegistry": field.get("flowRegistry", {}),
                    })
                    # Also update tableColumnSettings.model.use
                    col_uid = col.get("uid", "")
                    nb.update_model(col_uid, {
                        "tableColumnSettings": {"model": {"use": correct_model}}
                    })

    elif btype == "details":
        grid = tree.get("subModels", {}).get("grid", {})
        items = grid.get("subModels", {}).get("items", []) if isinstance(grid, dict) else []
        if not isinstance(items, list):
            return
        for item in items:
            if "DetailsItem" not in item.get("use", ""):
                continue
            fp = item.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if not fp or fp not in meta:
                continue
            iface = meta[fp].get("interface", "input")
            correct_model = DISPLAY_MODEL_MAP.get(iface, "DisplayTextFieldModel")
            if correct_model == "DisplayTextFieldModel":
                continue

            field = item.get("subModels", {}).get("field", {})
            if isinstance(field, dict) and field.get("uid"):
                field_uid = field["uid"]
                if field.get("use", "") != correct_model:
                    nb.save_model({
                        "uid": field_uid,
                        "use": correct_model,
                        "parentId": item.get("uid", ""),
                        "subKey": "field",
                        "subType": "object",
                        "sortIndex": 0,
                        "stepParams": field.get("stepParams", {}),
                        "flowRegistry": field.get("flowRegistry", {}),
                    })


def _ensure_js_header(code: str, desc: str = "", js_type: str = "",
                      coll: str = "", fields: list = None) -> str:
    """Ensure JS code has a standard header comment.

    If already has /** ... */ header, leave it.
    Otherwise prepend the standard template.
    """
    if code.strip().startswith("/**"):
        return code  # already has header

    header_lines = ["/**"]
    if desc:
        header_lines.append(f" * {desc}")
    header_lines.append(f" *")
    if js_type:
        header_lines.append(f" * @type {js_type}")
    if coll:
        header_lines.append(f" * @collection {coll}")
    if fields:
        header_lines.append(f" * @fields {', '.join(fields[:10])}")
    header_lines.append(" */")
    header_lines.append("")

    return "\n".join(header_lines) + code


def _replace_js_uids(code: str, block_state_all: dict) -> str:
    """Replace TARGET_BLOCK_UID and similar hardcoded UID references in JS code.

    Scans for const TARGET_BLOCK_UID = 'xxx' pattern and replaces
    with the actual UID from current deploy state.
    """
    import re
    # Find all table block UIDs in current state (potential targets)
    table_uids = []
    for bkey, binfo in block_state_all.items():
        if isinstance(binfo, dict) and binfo.get("type") == "table":
            table_uids.append(binfo.get("uid", ""))

    if not table_uids:
        return code

    target_uid = table_uids[0]

    # Replace TARGET_BLOCK_UID = 'old_uid'
    code = re.sub(
        r"(TARGET_BLOCK_UID\s*=\s*['\"])[a-z0-9_]{11,}(['\"])",
        rf"\g<1>{target_uid}\2",
        code
    )
    # Replace __TABLE_UID__ placeholder
    code = code.replace("__TABLE_UID__", target_uid)

    return code


def _apply_complete_layout(nb: NocoBase, grid_uid: str, field_layout: list):
    """Apply field_layout covering ALL grid children.

    Reads live children, maps them by fieldPath/label/JS,
    builds rows from field_layout, then appends any uncovered items.
    setLayout requires ALL children covered — this ensures no missing UIDs.
    """
    try:
        live = nb.get(uid=grid_uid)
    except Exception as e:
        return  # grid not accessible

    live_tree = live.get("tree", {})
    items = live_tree.get("subModels", {}).get("items", [])
    if not isinstance(items, list) or not items:
        return

    # Build uid map from live items
    uid_map: dict[str, str] = {}
    all_uids: set[str] = set()
    for d in items:
        d_uid = d["uid"]
        all_uids.add(d_uid)
        fp = d.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
        label = d.get("stepParams", {}).get("markdownItemSetting", {}).get("title", {}).get("label", "")
        if fp:
            uid_map[fp] = d_uid
        elif label:
            uid_map[label] = d_uid
        elif "JSItem" in d.get("use", ""):
            uid_map["_js_"] = d_uid

    # Build rows from field_layout
    rows: dict[str, list] = {}
    sizes: dict[str, list] = {}
    ri = 0
    covered: set[str] = set()

    for row in field_layout:
        rk = f"r{ri}"

        if isinstance(row, str):
            if row.startswith("[JS:") or row == "_js_":
                u = uid_map.get("_js_")
                if u and u not in covered:
                    rows[rk] = [[u]]; sizes[rk] = [24]
                    covered.add(u); ri += 1
            elif "---" in row:
                label = row.strip().strip("-").strip()
                u = uid_map.get(label)
                if u and u not in covered:
                    rows[rk] = [[u]]; sizes[rk] = [24]
                    covered.add(u); ri += 1

        elif isinstance(row, list):
            cols = []
            for item in row:
                name = item if isinstance(item, str) else (
                    list(item.keys())[0] if isinstance(item, dict) else None)
                if name:
                    # Handle [JS:xxx] references in list rows
                    if name.startswith("[JS:"):
                        u = uid_map.get("_js_")
                    elif name.startswith("---"):
                        label = name.strip().strip("-").strip()
                        u = uid_map.get(label)
                    else:
                        u = uid_map.get(name)
                    if u and u not in covered:
                        cols.append([u]); covered.add(u)
            if cols:
                n = len(cols)
                rows[rk] = cols; sizes[rk] = [24 // n] * n
                ri += 1

    # Append uncovered items (safety net — setLayout needs ALL children)
    for u in all_uids - covered:
        rk = f"r{ri}"
        rows[rk] = [[u]]; sizes[rk] = [24]
        ri += 1

    if rows:
        try:
            nb.set_layout(grid_uid, rows, sizes)
        except Exception as e:
            pass  # Layout best-effort


def _fill_block(nb: NocoBase, block_uid: str, grid_uid: str,
                bs: dict, default_coll: str, mod: Path,
                block_state: dict, all_blocks_state: dict = None,
                page_grid_uid: str = ""):
    """Fill a compose-created block with fields, actions, JS items, dividers."""
    btype = bs.get("type", "")
    coll = bs.get("coll", default_coll)

    # ── Table settings: dataScope + pageSize ──
    table_updates = {}
    if bs.get("dataScope"):
        table_updates["dataScope"] = {"filter": bs["dataScope"]}
    if bs.get("pageSize"):
        table_updates["pageSize"] = {"pageSize": bs["pageSize"]}
    if bs.get("sort"):
        table_updates["sort"] = bs["sort"]
    if table_updates:
        try:
            nb.update_model(block_uid, {"tableSettings": table_updates})
        except Exception:
            pass

    # ── Fields ──
    # compose includes fields but uses DisplayTextFieldModel for all.
    # Fix display model based on collection interface.
    field_states = block_state.get("fields", {})

    # If field_states is empty, read from live block (compose created them but didn't track UIDs)
    if not field_states and grid_uid and btype in ("table", "filterForm", "createForm", "editForm", "details"):
        try:
            live = nb.get(uid=block_uid)
            live_tree = live.get("tree", {})
            # For forms/details: grid → items
            live_grid = live_tree.get("subModels", {}).get("grid", {})
            if isinstance(live_grid, dict):
                for di in live_grid.get("subModels", {}).get("items", []):
                    fp = di.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                    if fp:
                        field_states[fp] = {"wrapper": di.get("uid", ""), "field": ""}
            # For tables: columns
            for col in live_tree.get("subModels", {}).get("columns", []):
                fp = col.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
                if fp:
                    field_states[fp] = {"wrapper": col.get("uid", ""), "field": ""}
        except Exception as e:
            pass  # field read best-effort

    if field_states and coll and btype in ("table", "details"):
        _fix_display_models(nb, block_uid, coll, btype)
    block_state["fields"] = field_states

    # ── Field Template (ReferenceFormGridModel) ──
    # If spec has field_template, replace the grid with ReferenceFormGridModel
    field_tpl = bs.get("field_template")
    if field_tpl and btype in ("createForm", "editForm", "details"):
        tpl_uid = field_tpl.get("templateUid", "")
        if tpl_uid:
            # Read live grid if grid_uid not available
            actual_grid_uid = grid_uid
            try:
                live = nb.get(uid=block_uid)
                live_grid = live.get("tree", {}).get("subModels", {}).get("grid", {})
                if isinstance(live_grid, dict):
                    actual_grid_uid = live_grid.get("uid", actual_grid_uid)
                if "ReferenceFormGrid" not in (live_grid.get("use", "") if isinstance(live_grid, dict) else ""):
                    # Replace grid: destroy current FormGridModel, create ReferenceFormGridModel
                    if actual_grid_uid:
                        nb.s.post(f"{nb.base}/api/flowModels:destroy",
                                  params={"filterByTk": actual_grid_uid}, timeout=30)
                    new_grid_uid = uid()
                    nb.save_model({
                        "uid": new_grid_uid, "use": "ReferenceFormGridModel",
                        "parentId": block_uid, "subKey": "grid", "subType": "object",
                        "sortIndex": 0, "flowRegistry": {},
                        "stepParams": {
                            "referenceSettings": {
                                "useTemplate": {
                                    "templateUid": tpl_uid,
                                    "templateName": field_tpl.get("templateName", ""),
                                    "targetUid": field_tpl.get("targetUid", ""),
                                    "mode": field_tpl.get("mode", "reference"),
                                }
                            }
                        },
                    })
                    block_state["grid_uid"] = new_grid_uid
                    print(f"      + field_template: \"{field_tpl.get('templateName', '')}\"")
            except Exception as e:
                print(f"      ! field_template: {e}")

    # ── Actions ──
    # compose now includes actions — UIDs already in block_state
    pass

    # ── JS Block code ──
    if btype == "jsBlock":
        js_file = bs.get("file", "")
        if js_file:
            p = mod / js_file
            if p.exists():
                code = p.read_text()
                code = _ensure_js_header(code, desc=bs.get("desc", ""),
                                         js_type="JSBlockModel", coll=coll)
                if all_blocks_state:
                    code = _replace_js_uids(code, all_blocks_state)
                nb.update_model(block_uid, {
                        "jsSettings": {"runJs": {"code": code, "version": "v1"}}
                    })
                print(f"      ~ JS: {bs.get('desc', js_file)[:40]}")

    # ── Chart config ──
    if btype == "chart":
        config_file = bs.get("chart_config", "")
        if config_file:
            p = mod / config_file
            if p.exists():
                if config_file.endswith(".yaml") or config_file.endswith(".yml"):
                    # New format: YAML with sql_file + render_file refs
                    chart_spec = yaml.safe_load(p.read_text()) or {}
                    sql = chart_spec.get("sql", "")
                    if chart_spec.get("sql_file"):
                        sf = mod / chart_spec["sql_file"]
                        if sf.exists():
                            sql = sf.read_text()
                    render_js = chart_spec.get("render", "")
                    if chart_spec.get("render_file"):
                        rf = mod / chart_spec["render_file"]
                        if rf.exists():
                            render_js = rf.read_text()
                    config = {
                        "query": {"mode": "sql", "sql": sql},
                        "chart": {"option": {"mode": "custom", "raw": render_js}},
                    }
                else:
                    # Legacy: JSON with everything inline
                    config = json.loads(p.read_text())

                nb.update_model(block_uid, {"chartSettings": {"configure": config}})
                sql = config.get("query", {}).get("sql", "")
                if sql:
                    # Save SQL template (don't run — table may not exist yet)
                    nb.s.post(f"{nb.base}/api/flowSql:save", json={
                        "type": "selectRows", "uid": block_uid,
                        "dataSourceKey": "main", "sql": sql, "bind": {},
                    }, timeout=30)
                    # Try to run (best-effort, ignore errors for missing tables)
                    try:
                        import re
                        clean = re.sub(r"\{%\s*if\s+[^%]*%\}.*?\{%\s*endif\s*%\}", "", sql, flags=re.DOTALL)
                        clean = "\n".join(l for l in clean.split("\n") if "{{" not in l and "{%" not in l)
                        nb.s.post(f"{nb.base}/api/flowSql:run", json={
                            "type": "selectRows", "uid": block_uid,
                            "dataSourceKey": "main", "sql": clean, "bind": {},
                        }, timeout=15)
                    except Exception:
                        pass  # table may not exist yet
                    print(f"      + chart: {config_file}")

    # ── Actions not created by compose ──
    # Compose only handles a whitelist. Others created here via save_model.
    _NON_COMPOSE_ACTION_MAP = {
        "edit": "EditActionModel",
        "view": "ViewActionModel",
        "duplicate": "DuplicateActionModel",
        "export": "ExportActionModel",
        "import": "ImportActionModel",
        "link": "LinkActionModel",
        "workflowTrigger": "CollectionTriggerWorkflowActionModel",
        "ai": "AIEmployeeButtonModel",
        "expandCollapse": "ExpandCollapseActionModel",
        "popup": "PopupCollectionActionModel",
        "updateRecord": "UpdateRecordActionModel",
    }
    all_actions = list(bs.get("actions", []))
    all_rec_actions = list(bs.get("recordActions", []))

    for aspec in all_actions + all_rec_actions:
        action_sp = {}
        action_props = {}
        if isinstance(aspec, dict):
            atype = aspec.get("type", "")
            action_sp = aspec.get("stepParams", {})
            action_props = aspec.get("props", {})

            # AI button shorthand: {type: ai, employee: viz, tasks_file: ./ai/tasks.yaml}
            if atype == "ai" and aspec.get("employee") and not action_sp:
                action_sp, action_props = _build_ai_button(
                    aspec, block_uid, mod)
        else:
            atype = aspec
        amodel = _NON_COMPOSE_ACTION_MAP.get(atype)
        if not amodel:
            continue
        a_key = atype
        existing_actions = block_state.get("actions", {})
        existing_rec = block_state.get("record_actions", {})
        if a_key in existing_actions or a_key in existing_rec:
            # Already tracked in state — but update stepParams if spec has config
            if action_sp or action_props:
                existing_uid = (existing_actions.get(a_key) or existing_rec.get(a_key, {})).get("uid", "")
                if existing_uid:
                    update = {"uid": existing_uid}
                    if action_sp:
                        update["stepParams"] = action_sp
                    if action_props:
                        update["props"] = action_props
                    nb.save_model(update)
            continue
        # Determine correct subKey from spec position
        desired_sub_key = "recordActions" if aspec in all_rec_actions else "actions"

        # Check live block for existing action
        try:
            live = nb.get(uid=block_uid)
            live_subs = live.get("tree", {}).get("subModels", {})
            found_uid = ""
            found_sub_key = ""
            for ak in ("actions", "recordActions"):
                for la in (live_subs.get(ak, []) if isinstance(live_subs.get(ak), list) else []):
                    if amodel.replace("Model", "") in la.get("use", ""):
                        found_uid = la.get("uid", "")
                        found_sub_key = ak
                        break
                if found_uid:
                    break
            if found_uid:
                # Fix subKey if mismatched
                if found_sub_key != desired_sub_key:
                    nb.save_model({"uid": found_uid, "subKey": desired_sub_key})
                # Update stepParams if spec has config (e.g., AI button)
                if action_sp or action_props:
                    update = {"uid": found_uid}
                    if action_sp:
                        update["stepParams"] = action_sp
                    if action_props:
                        update["props"] = action_props
                    nb.save_model(update)
                # Track in block_state so refs can resolve
                state_key = "record_actions" if desired_sub_key == "recordActions" else "actions"
                block_state.setdefault(state_key, {})[atype] = {"uid": found_uid}
                continue
        except Exception:
            pass
        # Create via save_model (no popup stub)
        new_uid = uid()
        nb.save_model({
            "uid": new_uid, "use": amodel,
            "parentId": block_uid, "subKey": desired_sub_key, "subType": "array",
            "sortIndex": 0, "stepParams": action_sp, "props": action_props, "flowRegistry": {},
        })
        # Track in block_state
        state_key = "record_actions" if desired_sub_key == "recordActions" else "actions"
        block_state.setdefault(state_key, {})[atype] = {"uid": new_uid}

    # ── JS Items (inside detail/form grid) ──
    js_items = bs.get("js_items", [])
    js_item_uids: dict[str, str] = {}  # desc → uid (for layout)
    saved_js_items = block_state.get("js_items", {})  # from state.yaml

    if js_items and grid_uid:
        for idx, js_spec in enumerate(js_items):
            js_file = js_spec.get("file", "")
            if not js_file:
                continue
            p = mod / js_file
            if not p.exists():
                continue
            code = p.read_text()
            desc = js_spec.get("desc", f"js_{idx}")

            # Ensure standard header comment
            code = _ensure_js_header(code, desc=desc, js_type="JSItemModel", coll=coll)

            # Auto-replace TARGET_BLOCK_UID references
            if all_blocks_state:
                code = _replace_js_uids(code, all_blocks_state)

            # Check state for existing UID
            js_key = desc or f"js_{idx}"
            existing_uid = saved_js_items.get(js_key, {}).get("uid", "")

            if existing_uid:
                # Update existing by UID
                nb.update_model(existing_uid, {
                    "jsSettings": {"runJs": {"code": code, "version": "v1"}}
                })
                js_item_uids[f"[JS:{desc}]"] = existing_uid
            else:
                # Create new
                js_uid_val = uid()
                nb.save_model({
                    "uid": js_uid_val, "use": "JSItemModel",
                    "parentId": grid_uid, "subKey": "items", "subType": "array",
                    "sortIndex": 0, "flowRegistry": {},
                    "stepParams": {"jsSettings": {"runJs": {"code": code, "version": "v1"}}},
                })
                js_item_uids[f"[JS:{desc}]"] = js_uid_val
                saved_js_items[js_key] = {"uid": js_uid_val}
                print(f"      + JS: {desc[:40]}")

        block_state["js_items"] = saved_js_items

    # ── JS Columns (table) ──
    js_cols = bs.get("js_columns", [])
    saved_js_cols = block_state.get("js_columns", {})  # from state.yaml

    if js_cols and btype == "table":
        for jc in js_cols:
            jc_file = jc.get("file", "")
            jc_title = jc.get("title", "")
            if not jc_file or not jc_title:
                continue
            p = mod / jc_file
            if not p.exists():
                continue
            code = p.read_text()
            code = _ensure_js_header(code, desc=jc.get("desc", jc_title),
                                     js_type="JSColumnModel", coll=coll)
            if all_blocks_state:
                code = _replace_js_uids(code, all_blocks_state)

            existing_uid = saved_js_cols.get(jc_title, {}).get("uid", "")

            if existing_uid:
                # Update by UID
                nb.update_model(existing_uid, {
                        "jsSettings": {"runJs": {"code": code, "version": "v1"}}
                    })
            else:
                # Create new
                try:
                    result = nb.add_field(block_uid, "jsColumn", type="jsColumn")
                    jc_uid = result.get("uid", "")
                    nb.configure(jc_uid, {"changes": {"code": code, "title": jc_title}})
                    saved_js_cols[jc_title] = {"uid": jc_uid}
                    print(f"      + JSCol: {jc_title}")
                except Exception as e:
                    print(f"      ! JSCol {jc_title}: {e}")

        block_state["js_columns"] = saved_js_cols

    # ── Dividers ──
    # Check field_layout for "--- label ---" entries
    field_layout = bs.get("field_layout", [])
    divider_uids = {}
    for row in field_layout:
        if isinstance(row, str) and row.strip().startswith("---"):
            label = row.strip().strip("-").strip()
            if label and grid_uid:
                div_uid = nb.add_divider(grid_uid, label)
                divider_uids[label] = div_uid

    # ── Field layout ──
    if field_layout and grid_uid:
        _apply_complete_layout(nb, grid_uid, field_layout)

    # ── FilterForm: default horizontal layout + label settings ──
    if btype == "filterForm" and grid_uid:
        # Set horizontal label layout on block
        try:
            nb.update_model(block_uid, {
                "formFilterBlockModelSettings": {
                    "layout": {
                        "layout": "horizontal",
                        "labelAlign": "left",
                        "labelWidth": 120,
                        "labelWrap": False,
                        "colon": True,
                    }
                }
            })
        except Exception as e:
            pass

        # Auto field_layout if not specified: JS items on top, fields in one row
        if not field_layout:
            all_items = []
            # JS items first
            for desc, js_uid in js_item_uids.items():
                all_items.append(("js", desc, js_uid))
            # Then fields
            for fp, finfo in field_states.items():
                all_items.append(("field", fp, finfo["wrapper"]))

            if all_items:
                from layout import apply_layout as _al
                rows = {}
                sizes = {}
                row_idx = 0
                # JS items: each on own row (full width)
                for itype, name, iuid in all_items:
                    if itype == "js":
                        rk = f"r{row_idx}"
                        rows[rk] = [[iuid]]
                        sizes[rk] = [24]
                        row_idx += 1

                # Fields: all in one row (equal split, max 4 per row)
                field_items = [(n, u) for t, n, u in all_items if t == "field"]
                max_per_row = 4
                for i in range(0, len(field_items), max_per_row):
                    chunk = field_items[i:i + max_per_row]
                    rk = f"r{row_idx}"
                    rows[rk] = [[u] for _, u in chunk]
                    sizes[rk] = [24 // len(chunk)] * len(chunk)
                    row_idx += 1

                if rows:
                    try:
                        nb.set_layout(grid_uid, rows, sizes)
                    except Exception as e:
                        pass  # filter layout best-effort

        _configure_filter(nb, bs, block_uid, field_states, default_coll, all_blocks_state, page_grid_uid)
    elif btype == "filterForm":
        _configure_filter(nb, bs, block_uid, field_states, default_coll, all_blocks_state, page_grid_uid)

    # ── Event Flows (formValuesChange JS) ──
    event_flows = bs.get("event_flows", [])
    if event_flows:
        flow_registry = {}
        for ef in event_flows:
            ef_file = ef.get("file", "")
            if not ef_file:
                continue
            p = mod / ef_file
            if not p.exists():
                continue
            code = p.read_text()
            flow_key = ef.get("flow_key", f"custom_{len(flow_registry)}")
            step_key = ef.get("step_key", "runJs")
            event_name = ef.get("event", "formValuesChange")

            # on can be string ("formValuesChange") or dict ({"eventName": "beforeRender", ...})
            on_value = event_name if isinstance(event_name, dict) else event_name
            flow_registry[flow_key] = {
                "key": flow_key,
                "on": on_value,
                "title": ef.get("desc", flow_key),
                "steps": {
                    step_key: {
                        "use": "runJs",
                        "title": ef.get("desc", ""),
                        "runJs": {"code": code},
                    }
                }
            }
            print(f"      + event: {ef.get('desc', flow_key)}")

        if flow_registry:
            try:
                nb.save_model({"uid": block_uid, "flowRegistry": flow_registry})
            except Exception as e:
                try:
                    nb.s.post(f"{nb.base}/api/flowModels:update?filterByTk={block_uid}",
                              json={"options": {"flowRegistry": flow_registry}}, timeout=30)
                except Exception:
                    pass

    # ── Linkage Rules ──
    linkage_rules = bs.get("linkage_rules")
    if linkage_rules and btype in ("createForm", "editForm"):
        try:
            nb.update_model(block_uid, {
                "eventSettings": {"linkageRules": linkage_rules}
            })
            print(f"      + linkage: {len(linkage_rules) if isinstance(linkage_rules, list) else 'set'}")
        except Exception as e:
            pass

    # ── Block title ──
    title = bs.get("title", "")
    if title:
        try:
            nb.update_model(block_uid, {
                "cardSettings": {"titleDescription": {"title": title}}
            })
        except Exception as e:
            pass  # title best-effort


def _configure_filter(nb: NocoBase, bs: dict, block_uid: str,
                      field_states: dict, coll: str,
                      all_blocks_state: dict = None,
                      page_grid_uid: str = ""):
    """Configure filter field connections via filterManager.

    CRITICAL: filterManager is stored on the PAGE-LEVEL BlockGridModel,
    NOT on the FilterFormBlock's internal FilterFormGridModel.

    Page structure:
      PageTab → BlockGridModel ← filterManager lives HERE
        ├── FilterFormBlock → FilterFormGridModel (NOT here)
        └── TableBlock / ReferenceBlock
    """
    # Validate: multiple text input fields should use filterPaths, not separate inputs
    fields_spec = bs.get("fields", [])
    text_fields = []
    for f in fields_spec:
        fp = f if isinstance(f, str) else f.get("field", f.get("name", ""))
        if not fp:
            continue
        # Check field interface from collection metadata
        meta = nb.field_meta(coll) if coll else {}
        iface = meta.get(fp, {}).get("interface", "input")
        if iface in ("input", "textarea", "email", "phone", "url"):
            has_paths = isinstance(f, dict) and f.get("filterPaths")
            if not has_paths:
                text_fields.append(fp)
    if len(text_fields) > 1:
        raise ValueError(
            f"filterForm has {len(text_fields)} text inputs: {text_fields}. "
            f"Use ONE input with filterPaths to search multiple fields:\n"
            f"  fields:\n"
            f"  - field: {text_fields[0]}\n"
            f"    label: Search\n"
            f"    filterPaths: {text_fields}"
        )

    # Max 3 filter fields total (1 search + 2 select/date)
    total = len(fields_spec)
    if total > 3:
        raise ValueError(
            f"filterForm has {total} fields (max 3: 1 search + 2 select/date).\n"
            f"  Reduce to: 1 search input with filterPaths + up to 2 select/date fields."
        )

    # Find target table/reference block UIDs
    target_uids = []
    if all_blocks_state:
        for bkey, binfo in all_blocks_state.items():
            if isinstance(binfo, dict) and binfo.get("type") in ("table", "reference"):
                target_uids.append(binfo.get("uid", ""))
    default_target = target_uids[0] if target_uids else ""

    # 1. Set label + defaultTargetUid on each FilterFormItem
    for f in bs.get("fields", []):
        if not isinstance(f, dict):
            continue
        fp = f.get("field", f.get("name", ""))
        label = f.get("label", "")
        if not fp:
            continue

        wrapper_uid = field_states.get(fp, {}).get("wrapper", "")
        if not wrapper_uid:
            continue

        settings: dict = {}
        if default_target:
            settings["init"] = {
                "filterField": {"name": fp, "title": label or fp, "interface": "input", "type": "string"},
                "defaultTargetUid": default_target,
            }
        if label:
            settings["label"] = {"label": label}
            settings["showLabel"] = {"showLabel": True}

        if settings:
            try:
                nb.update_model(wrapper_uid, {"filterFormItemSettings": settings})
                print(f"      filter {fp}: {label or fp}")
            except Exception as e:
                print(f"      ! filter {fp}: {e}")

    # 2. Set filterManager on PAGE-LEVEL BlockGridModel
    if not page_grid_uid:
        print(f"      ⚠ filterManager: no page_grid_uid — filter fields won't be connected!")
        print(f"        filterManager MUST be on page-level BlockGridModel, not FilterFormGridModel")
        return

    # Validate: page_grid_uid must be a BlockGridModel, not FilterFormGridModel
    try:
        r_check = nb.s.get(f"{nb.base}/api/flowModels:get",
                           params={"filterByTk": page_grid_uid}, timeout=30)
        pg_use = r_check.json().get("data", {}).get("use", "")
        if pg_use == "FilterFormGridModel":
            print(f"      ⚠ filterManager: page_grid_uid points to FilterFormGridModel!")
            print(f"        Must point to page-level BlockGridModel instead")
            return
    except Exception as e:
        pass

    # Read filter grid to get FilterFormItem UIDs
    try:
        data = nb.get(uid=block_uid)
        grid = data.get("tree", {}).get("subModels", {}).get("grid", {})
        grid_items = grid.get("subModels", {}).get("items", [])
    except Exception as e:
        return

    fm_entries = []
    for f in bs.get("fields", []):
        if not isinstance(f, dict):
            continue
        fp = f.get("field", "")
        filter_paths = f.get("filterPaths", [])
        if not fp or not filter_paths:
            continue

        # Find FilterFormItem UID
        for item in (grid_items if isinstance(grid_items, list) else []):
            item_fp = item.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if item_fp == fp:
                # Add entry for each target block
                for tid in target_uids:
                    fm_entries.append({
                        "filterId": item["uid"],
                        "targetId": tid,
                        "filterPaths": filter_paths,
                    })
                print(f"      filter {fp} → {filter_paths} ({len(target_uids)} targets)")
                break

    if fm_entries:
        # Save on PAGE-LEVEL grid (not filter grid)
        try:
            r = nb.s.get(f"{nb.base}/api/flowModels:get",
                         params={"filterByTk": page_grid_uid}, timeout=30)
            pg_data = r.json().get("data", {})
            nb.s.post(f"{nb.base}/api/flowModels:save", json={
                "uid": page_grid_uid,
                "use": pg_data.get("use", "BlockGridModel"),
                "parentId": pg_data.get("parentId", ""),
                "subKey": "grid",
                "subType": "object",
                "sortIndex": 0,
                "stepParams": pg_data.get("stepParams", {}),
                "flowRegistry": pg_data.get("flowRegistry", {}),
                "filterManager": fm_entries,
            }, timeout=30)
        except Exception as e:
            print(f"      ! filterManager: {e}")


# ══════════════════════════════════════════════════════════════════
#  Legacy block creation (not supported by compose)
# ══════════════════════════════════════════════════════════════════

def _create_legacy_block(nb: NocoBase, grid_uid: str, bs: dict,
                         default_coll: str, mod: Path = None) -> str | None:
    """Create a block via legacy flowModels:save. Returns UID or None."""
    btype = bs.get("type", "")
    coll = bs.get("coll", default_coll)
    title = bs.get("title", "")
    res_binding = bs.get("resource_binding", {})
    block_uid = uid()

    # Resource init
    res_init: dict = {"dataSourceKey": "main", "collectionName": coll}
    if res_binding.get("filterByTk"):
        res_init["filterByTk"] = res_binding["filterByTk"]
    if res_binding.get("associationName"):
        res_init["associationName"] = res_binding["associationName"]
        res_init["sourceId"] = res_binding.get("sourceId", "{{ctx.view.inputArgs.filterByTk}}")

    sp: dict = {"resourceSettings": {"init": res_init}}
    if title:
        sp["cardSettings"] = {"titleDescription": {"title": title}}

    # Handle ReferenceBlock specially
    if btype == "reference":
        template_uid = bs.get("template_uid", "")
        template_name = bs.get("template_name", "")
        ref_mode = bs.get("reference_mode", "reference")

        # Check if template exists in target system
        if template_uid:
            try:
                r = nb.s.get(f"{nb.base}/api/flowModelTemplates:get",
                             params={"filterByTk": template_uid}, timeout=30)
                if not r.ok or not r.json().get("data"):
                    template_uid = ""  # template not found → use fallback
            except Exception:
                template_uid = ""

        # Fallback: if template doesn't exist, create from template_content
        if not template_uid and bs.get("template_content"):
            tpl = bs["template_content"]
            print(f"    Template not found, creating from exported content...")
            # Deploy the template content as a regular block (not reference)
            tpl["key"] = bs.get("key", "tpl_block")
            block_uid = _create_legacy_block(nb, grid_uid, tpl, default_coll, mod)
            return block_uid

        if not template_uid:
            print(f"    ! reference: no template_uid and no fallback content")
            return None
        try:
            nb.save_model({
                "uid": block_uid, "use": "ReferenceBlockModel",
                "parentId": grid_uid, "subKey": "items", "subType": "array",
                "sortIndex": 99, "flowRegistry": {},
                "stepParams": {
                    "referenceSettings": {
                        "target": {"targetUid": template_uid, "mode": ref_mode},
                        "useTemplate": {
                            "templateUid": template_uid,
                            "templateName": template_name,
                            "mode": ref_mode,
                        }
                    }
                },
            })
            print(f'    + reference:"{template_name}" (legacy)')
            return block_uid
        except Exception as e:
            print(f"    ! reference: {e}")
            return None

    use_map = {
        "comments": "CommentsBlockModel",
        "recordHistory": "RecordHistoryBlockModel",
        "list": "ListBlockModel",
        "table": "TableBlockModel",
        "details": "DetailsBlockModel",
        "gridCard": "GridCardBlockModel",
        "createForm": "CreateFormModel",
        "editForm": "EditFormModel",
    }
    model_use = use_map.get(btype)
    if not model_use:
        return None

    try:
        nb.save_model({
            "uid": block_uid, "use": model_use,
            "parentId": grid_uid, "subKey": "items", "subType": "array",
            "sortIndex": 99, "flowRegistry": {},
            "stepParams": sp,
        })

        # ── Comments: add CommentItemModel child ──
        if btype == "comments":
            nb.save_model({
                "uid": uid(), "use": "CommentItemModel",
                "parentId": block_uid, "subKey": "items", "subType": "array",
                "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
            })

        # ── RecordHistory: add actions (filter, refresh, expand, collapse) ──
        if btype == "recordHistory":
            rh_action_map = {
                "filter": "FilterActionModel",
                "refresh": "RefreshActionModel",
                "historyExpand": "RecordHistoryExpandActionModel",
                "historyCollapse": "RecordHistoryCollapseActionModel",
            }
            for a in bs.get("actions", []):
                atype = a if isinstance(a, str) else a.get("type", "")
                amodel = rh_action_map.get(atype)
                if amodel:
                    nb.save_model({
                        "uid": uid(), "use": amodel,
                        "parentId": block_uid, "subKey": "actions", "subType": "array",
                        "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
                    })

        # ── List/GridCard: add ListItem + fields + JS items + actions ──
        if btype in ("list", "gridCard"):
            _fill_list_block(nb, block_uid, bs, coll, mod)

        # ── Table: add columns + actions ──
        if btype == "table":
            _fill_table_block(nb, block_uid, bs, coll, mod)

        # ── Form: add fields + actions via addField ──
        if btype in ("createForm", "editForm"):
            _fill_form_block(nb, block_uid, bs, coll, mod)

        print(f"    + {btype}:\"{title}\" (legacy)")
        return block_uid
    except Exception as e:
        print(f"    ! {btype}: {e}")
        return None


def _fill_table_block(nb: NocoBase, block_uid: str, bs: dict,
                      coll: str, mod: Path = None):
    """Fill a legacy TableBlock with columns + actions.

    Table structure:
      TableBlockModel
        ├── TableActionsColumnModel (subKey=columns)
        │   └── EditActionModel, DeleteActionModel, ... (subKey=actions)
        ├── TableColumnModel (subKey=columns, per field)
        │   └── DisplayFieldModel (subKey=field)
        ├── JSColumnModel (subKey=columns, per JS col)
        ├── FilterActionModel (subKey=actions)
        ├── RefreshActionModel
        └── AddNewActionModel
    """
    # Columns from fields
    fields = bs.get("fields", [])
    for i, fp in enumerate(fields):
        if isinstance(fp, dict):
            fp = fp.get("field", fp.get("name", ""))
        if not fp:
            continue
        col_uid_val = uid()
        field_uid_val = uid()
        nb.save_model({
            "uid": col_uid_val, "use": "TableColumnModel",
            "parentId": block_uid, "subKey": "columns", "subType": "array",
            "sortIndex": i, "flowRegistry": {},
            "stepParams": {"fieldSettings": {"init": {
                "dataSourceKey": "main", "collectionName": coll, "fieldPath": fp,
            }}},
        })
        nb.save_model({
            "uid": field_uid_val, "use": "DisplayTextFieldModel",
            "parentId": col_uid_val, "subKey": "field", "subType": "object",
            "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
        })

    # JS Columns
    js_cols = bs.get("js_columns", [])
    for jc in js_cols:
        jc_title = jc.get("title", "")
        jc_file = jc.get("file", "")
        code = ""
        if jc_file and mod:
            p = mod / jc_file
            if p.exists():
                code = p.read_text()
        jc_uid = uid()
        nb.save_model({
            "uid": jc_uid, "use": "JSColumnModel",
            "parentId": block_uid, "subKey": "columns", "subType": "array",
            "sortIndex": len(fields) + js_cols.index(jc), "flowRegistry": {},
            "stepParams": {
                "jsSettings": {"runJs": {"code": code, "version": "v1"}} if code else {},
                "tableColumnSettings": {"title": {"title": jc_title}} if jc_title else {},
            },
        })

    # Record actions column
    rec_actions = bs.get("recordActions", [])
    if rec_actions:
        rac_uid = uid()
        nb.save_model({
            "uid": rac_uid, "use": "TableActionsColumnModel",
            "parentId": block_uid, "subKey": "columns", "subType": "array",
            "sortIndex": 999, "stepParams": {}, "flowRegistry": {},
        })
        action_map = {
            "edit": "EditActionModel", "delete": "DeleteActionModel",
            "view": "ViewActionModel", "duplicate": "DuplicateActionModel",
        }
        for a in rec_actions:
            atype = a if isinstance(a, str) else a.get("type", "")
            amodel = action_map.get(atype)
            if amodel:
                nb.save_model({
                    "uid": uid(), "use": amodel,
                    "parentId": rac_uid, "subKey": "actions", "subType": "array",
                    "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
                })

    # Block-level actions
    block_actions = bs.get("actions", [])
    block_action_map = {
        "filter": "FilterActionModel", "refresh": "RefreshActionModel",
        "addNew": "AddNewActionModel", "export": "ExportActionModel",
        "import": "ImportActionModel",
    }
    for a in block_actions:
        atype = a if isinstance(a, str) else a.get("type", "")
        amodel = block_action_map.get(atype)
        if amodel:
            nb.save_model({
                "uid": uid(), "use": amodel,
                "parentId": block_uid, "subKey": "actions", "subType": "array",
                "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
            })

    if fields or js_cols:
        print(f"      table content: {len(fields)}f + {len(js_cols)}js + {len(rec_actions)}rec + {len(block_actions)}act")


def _fill_form_block(nb: NocoBase, block_uid: str, bs: dict,
                     coll: str, mod: Path = None):
    """Fill a legacy-created Form (createForm/editForm) with fields + actions.

    Uses addField API to add each field, then fills JS items, layout, and actions.
    """
    fields = bs.get("fields", [])
    blocks_state_entry: dict = {"uid": block_uid, "type": bs.get("type", ""), "fields": {}}

    # Add fields via addField
    for fp in fields:
        if isinstance(fp, dict):
            fp = fp.get("field", fp.get("name", ""))
        if not fp or fp.startswith("["):
            continue
        try:
            result = nb.add_field(block_uid, fp)
            blocks_state_entry["fields"][fp] = {
                "wrapper": result.get("wrapperUid", result.get("uid", "")),
                "field": result.get("fieldUid", ""),
            }
        except Exception as e:
            print(f"      ! field {fp}: {e}")

    # Actions (submit, etc.)
    action_map = {
        "submit": "SubmitActionModel",
        "reset": "ResetActionModel",
    }
    for a in bs.get("actions", []):
        atype = a if isinstance(a, str) else a.get("type", "")
        amodel = action_map.get(atype)
        if amodel:
            nb.save_model({
                "uid": uid(), "use": amodel,
                "parentId": block_uid, "subKey": "actions", "subType": "array",
                "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
            })

    # Fill JS items, layout, display model fixes via _fill_block
    block_grid = ""
    try:
        data = nb.get(uid=block_uid)
        tree = data.get("tree", {})
        grid = tree.get("subModels", {}).get("grid", {})
        if isinstance(grid, dict):
            block_grid = grid.get("uid", "")
    except Exception:
        pass

    if block_grid:
        _fill_block(nb, block_uid, block_grid, bs, coll, mod,
                     blocks_state_entry, {}, "")

    n_fields = len([f for f in fields if isinstance(f, str) and not f.startswith("[")])
    n_actions = len(bs.get("actions", []))
    print(f"      form content: {n_fields}f + {n_actions}act")


def _fill_list_block(nb: NocoBase, block_uid: str, bs: dict,
                     coll: str, mod: Path = None):
    """Fill a ListBlock with ListItem → DetailsGrid → fields/JS items + actions.

    List structure:
      ListBlockModel
        ├── ListItemModel (subKey=item, subType=object)
        │   ├── DetailsGridModel (subKey=grid, subType=object)
        │   │   ├── DetailsItemModel → DisplayField (fields)
        │   │   └── JSItemModel (JS items)
        │   └── EditActionModel (item actions, subKey=actions)
        ├── FilterActionModel (block actions, subKey=actions)
        ├── RefreshActionModel
        └── AddNewActionModel
    """
    # ListItem
    list_item_uid = uid()
    nb.save_model({
        "uid": list_item_uid, "use": "ListItemModel",
        "parentId": block_uid, "subKey": "item", "subType": "object",
        "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
    })

    # DetailsGrid inside ListItem
    detail_grid_uid = uid()
    nb.save_model({
        "uid": detail_grid_uid, "use": "DetailsGridModel",
        "parentId": list_item_uid, "subKey": "grid", "subType": "object",
        "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
    })

    # Item fields (DetailsItem → DisplayField)
    item_fields = bs.get("item_fields", [])
    for i, fp in enumerate(item_fields):
        if isinstance(fp, dict):
            fp = fp.get("field", fp.get("name", ""))
        if not fp:
            continue
        item_uid_val = uid()
        field_uid_val = uid()
        nb.save_model({
            "uid": item_uid_val, "use": "DetailsItemModel",
            "parentId": detail_grid_uid, "subKey": "items", "subType": "array",
            "sortIndex": i + 1, "flowRegistry": {},
            "stepParams": {"fieldSettings": {"init": {
                "dataSourceKey": "main", "collectionName": coll, "fieldPath": fp,
            }}},
        })
        nb.save_model({
            "uid": field_uid_val, "use": "DisplayTextFieldModel",
            "parentId": item_uid_val, "subKey": "field", "subType": "object",
            "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
        })

    # Item JS items
    item_js = bs.get("item_js", [])
    for js_spec in item_js:
        js_file = js_spec.get("file", "")
        if not js_file:
            continue
        code = ""
        if mod:
            p = mod / js_file
            if p.exists():
                code = p.read_text()
        if not code:
            continue
        js_uid_val = uid()
        nb.save_model({
            "uid": js_uid_val, "use": "JSItemModel",
            "parentId": detail_grid_uid, "subKey": "items", "subType": "array",
            "sortIndex": 0, "flowRegistry": {},
            "stepParams": {"jsSettings": {"runJs": {"code": code, "version": "v1"}}},
        })
        desc = js_spec.get("desc", "")
        print(f"      + list JS: {desc[:40]}")

    # Item actions (e.g., edit)
    item_actions = bs.get("item_actions", [])
    action_map = {
        "edit": "EditActionModel", "view": "ViewActionModel",
        "delete": "DeleteActionModel",
    }
    for a in item_actions:
        atype = a if isinstance(a, str) else a.get("type", "")
        model = action_map.get(atype, f"{atype.title()}ActionModel")
        nb.save_model({
            "uid": uid(), "use": model,
            "parentId": list_item_uid, "subKey": "actions", "subType": "array",
            "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
        })

    # Block-level actions (filter, refresh, addNew)
    block_actions = bs.get("actions", [])
    block_action_map = {
        "filter": "FilterActionModel", "refresh": "RefreshActionModel",
        "addNew": "AddNewActionModel", "export": "ExportActionModel",
    }
    for a in block_actions:
        atype = a if isinstance(a, str) else a.get("type", "")
        model = block_action_map.get(atype)
        if model:
            nb.save_model({
                "uid": uid(), "use": model,
                "parentId": block_uid, "subKey": "actions", "subType": "array",
                "sortIndex": 0, "stepParams": {}, "flowRegistry": {},
            })


# ══════════════════════════════════════════════════════════════════
#  Popup deployment
# ══════════════════════════════════════════════════════════════════

def _deploy_popup(nb: NocoBase, target_uid: str, target_ref: str,
                  popup_spec: dict, state: dict, mod: Path, force: bool,
                  popup_path: str = ""):
    """Deploy a popup (= sub-page with tabs)."""
    mode = popup_spec.get("mode", "drawer")
    coll = popup_spec.get("coll", "")
    tabs_spec = popup_spec.get("tabs")

    # Check if popup already has content
    try:
        data = nb.get(uid=target_uid)
        tree = data.get("tree", {})
        popup_page = tree.get("subModels", {}).get("page", {})
        if popup_page and popup_page.get("subModels", {}).get("tabs"):
            tabs_existing = popup_page["subModels"]["tabs"]
            has_content = False
            for t in (tabs_existing if isinstance(tabs_existing, list) else [tabs_existing]):
                g = t.get("subModels", {}).get("grid", {})
                items = g.get("subModels", {}).get("items", [])
                if isinstance(items, list) and items:
                    has_content = True
                    break
            if has_content:
                if force:
                    print(f"  ~ popup [{target_ref}] (update in-place)")
                    all_tabs = tabs_existing if isinstance(tabs_existing, list) else [tabs_existing]
                    all_tab_specs = tabs_spec or [popup_spec]
                    for ti, t in enumerate(all_tabs):
                        g = t.get("subModels", {}).get("grid", {})
                        live_items = g.get("subModels", {}).get("items", []) if isinstance(g, dict) else []
                        tab_bs_list = all_tab_specs[ti].get("blocks", []) if ti < len(all_tab_specs) else []
                        for item in live_items:
                            item_use = item.get("use", "")
                            item_uid = item.get("uid", "")
                            item_title = item.get("stepParams", {}).get("cardSettings", {}).get("titleDescription", {}).get("title", "")
                            item_coll = item.get("stepParams", {}).get("resourceSettings", {}).get("init", {}).get("collectionName", "") or coll

                            if "DetailsBlock" in item_use and item_uid and item_coll:
                                _fix_display_models(nb, item_uid, item_coll, "details")

                            # Match live block to spec block for updates
                            matched_bs = None
                            for tbs in tab_bs_list:
                                tbs_title = tbs.get("title", "")
                                tbs_type = tbs.get("type", "")
                                if item_use.lower().startswith(tbs_type.lower().replace("form", "")):
                                    if tbs_title == item_title or (not tbs_title and not item_title):
                                        matched_bs = tbs
                                        break
                            if not matched_bs:
                                continue

                            # Reorder table columns
                            if "TableBlock" in item_use and item_uid:
                                sf = [f if isinstance(f, str) else f.get("field", "") for f in matched_bs.get("fields", []) if (f if isinstance(f, str) else f.get("field", ""))]
                                if sf:
                                    _reorder_table_columns(nb, item_uid, sf)

                            # Deploy event flows
                            event_flows = matched_bs.get("event_flows", [])
                            if event_flows and item_uid and mod:
                                flow_registry = {}
                                for ef in event_flows:
                                    ef_file = ef.get("file", "")
                                    if not ef_file:
                                        continue
                                    p = mod / ef_file
                                    if not p.exists():
                                        continue
                                    code = p.read_text()
                                    flow_key = ef.get("flow_key", f"custom_{len(flow_registry)}")
                                    step_key = ef.get("step_key", "runJs")
                                    event_name = ef.get("event", "formValuesChange")
                                    on_value = event_name if isinstance(event_name, dict) else event_name
                                    flow_registry[flow_key] = {
                                        "key": flow_key,
                                        "on": on_value,
                                        "title": ef.get("desc", flow_key),
                                        "steps": {
                                            step_key: {
                                                "key": step_key,
                                                "use": "runjs",
                                                "sort": 1,
                                                "flowKey": flow_key,
                                                "runJs": {"code": code},
                                            }
                                        }
                                    }
                                if flow_registry:
                                    try:
                                        nb.save_model({"uid": item_uid, "flowRegistry": flow_registry})
                                    except Exception:
                                        nb.s.post(f"{nb.base}/api/flowModels:update?filterByTk={item_uid}",
                                                  json={"options": {"flowRegistry": flow_registry}}, timeout=30)
                    # Still process nested popups (may be missing)
                    if tabs_spec:
                        _deploy_nested_popups_in_tabbed(nb, target_uid, tabs_spec, mod, force, popup_path)
                else:
                    print(f"  = popup [{target_ref}] (exists, skip)")
                return
    except Exception as e:
        pass  # popup check best-effort

    # Set click-to-open
    nb.update_model(target_uid, {
        "popupSettings": {
            "openView": {
                "collectionName": coll,
                "dataSourceKey": "main",
                "mode": mode,
                "size": "large",
                "pageModelClass": "ChildPageModel",
                "uid": target_uid,
            }
        },
        "displayFieldSettings": {
            "clickToOpen": {"clickToOpen": True}
        },
    })

    if tabs_spec:
        _deploy_tabbed_popup(nb, target_uid, target_ref, tabs_spec, coll, mod, force, popup_path)
    else:
        # Simple popup (single set of blocks)
        blocks = popup_spec.get("blocks", [])
        if blocks:
            _deploy_simple_popup(nb, target_uid, target_ref, popup_spec, coll, mod)


def _deploy_simple_popup(nb: NocoBase, target_uid: str, target_ref: str,
                         popup_spec: dict, coll: str, mod: Path):
    """Deploy a simple popup (no tabs, just blocks)."""
    blocks_state = deploy_surface(nb, target_uid, popup_spec, mod)
    print(f"  + popup [{target_ref}]: {len(blocks_state)} blocks")


def _deploy_tabbed_popup(nb: NocoBase, target_uid: str, target_ref: str,
                         tabs_spec: list, coll: str, mod: Path, force: bool,
                         popup_path: str = ""):
    """Deploy a multi-tab popup."""
    print(f"  + popup [{target_ref}]: {len(tabs_spec)} tabs")

    # Tab 0: compose on target directly (creates ChildPageModel)
    first_tab = tabs_spec[0]
    first_blocks = deploy_surface(nb, target_uid, first_tab, mod)
    tab_title = first_tab.get("title", "Tab0")
    print(f"    tab '{tab_title}': {len(first_blocks)} blocks")

    # Read popup to get remaining tabs
    try:
        data = nb.get(uid=target_uid)
        popup_page = data.get("tree", {}).get("subModels", {}).get("page", {})
        existing_tabs = popup_page.get("subModels", {}).get("tabs", [])
        if not isinstance(existing_tabs, list):
            existing_tabs = [existing_tabs] if existing_tabs else []
    except Exception as e:
        existing_tabs = []

    # Remaining tabs
    for i, tab_spec in enumerate(tabs_spec[1:], start=1):
        tab_title = tab_spec.get("title", f"Tab{i}")

        if i < len(existing_tabs):
            tab_uid = existing_tabs[i].get("uid", "")
        else:
            try:
                popup_uid = popup_page.get("uid", "")
                result = nb.add_popup_tab(popup_uid, tab_title)
                tab_uid = result.get("popupTabUid", result.get("tabUid", result.get("uid", "")))
            except Exception as e:
                print(f"    ! tab '{tab_title}': {e}")
                continue

        tab_blocks = deploy_surface(nb, tab_uid, tab_spec, mod)
        print(f"    tab '{tab_title}': {len(tab_blocks)} blocks")

    # Deploy nested popups
    _deploy_nested_popups_in_tabbed(nb, target_uid, tabs_spec, mod, force, popup_path)


def _deploy_nested_popups_in_tabbed(nb: NocoBase, target_uid: str,
                                     tabs_spec: list, mod: Path, force: bool,
                                     popup_path: str = ""):
    """Deploy nested popups from tab specs into live popup blocks.

    popup_path tracks the dot-separated nesting path for loading popup files:
      "" → popups/<field>.yaml
      "name" → popups/name.<field>.yaml
      "name.quotation_no" → popups/name.quotation_no.<field>.yaml
    """
    try:
        data = nb.get(uid=target_uid)
        popup_page = data.get("tree", {}).get("subModels", {}).get("page", {})
        if not popup_page:
            return
        live_tabs = popup_page.get("subModels", {}).get("tabs", [])
        if not isinstance(live_tabs, list):
            return
    except Exception:
        return

    for tab_idx, tab_spec in enumerate(tabs_spec):
        nested_popups = tab_spec.get("popups", [])
        if not nested_popups:
            continue

        if tab_idx >= len(live_tabs):
            continue
        live_tab = live_tabs[tab_idx]
        live_grid = live_tab.get("subModels", {}).get("grid", {})
        live_items = live_grid.get("subModels", {}).get("items", [])

        for np in nested_popups:
            np_field = np.get("field", "")
            if not np_field:
                continue

            # Auto-load popup content from popups/ directory
            # Try dot-separated path first (name.quotation_no.yaml),
            # then plain field name (quotation_no.yaml)
            if not np.get("blocks") and not np.get("tabs") and mod:
                np_bk = np.get("block_key", "")
                name_part = f"{np_bk}.{np_field}" if np_bk else np_field
                dot_path = f"{popup_path}.{name_part}" if popup_path else name_part
                dot_path_no_bk = f"{popup_path}.{np_field}" if popup_path else np_field
                candidates = [
                    mod / "popups" / f"{dot_path}.yaml",
                    mod / "popups" / f"{dot_path_no_bk}.yaml",
                    mod / "popups" / f"{np_field}.yaml",
                ]
                for popup_file in candidates:
                    if popup_file.exists():
                        try:
                            pf_spec = yaml.safe_load(popup_file.read_text()) or {}
                            for k in ("blocks", "tabs", "layout"):
                                if pf_spec.get(k):
                                    np[k] = pf_spec[k]
                            for k in ("mode", "coll"):
                                if pf_spec.get(k) and not np.get(k):
                                    np[k] = pf_spec[k]
                        except Exception:
                            pass
                        break

            # Search live blocks for the field/action target
            # If block_key is specified, only search that specific block
            np_block_key = np.get("block_key", "")
            search_items = live_items if isinstance(live_items, list) else []
            if np_block_key and search_items:
                # Match by block title or type to find the right block
                matched = []
                for li in search_items:
                    li_title = li.get("stepParams", {}).get("cardSettings", {}).get("titleDescription", {}).get("title", "")
                    li_type = li.get("use", "").replace("BlockModel", "").replace("Model", "").lower()
                    li_key = slugify(li_title) if li_title else f"{li_type}_{search_items.index(li)}"
                    if li_key == np_block_key:
                        matched = [li]
                        break
                if matched:
                    search_items = matched

            for live_item in search_items:
                np_target = _find_nested_popup_target(live_item, np_field)
                if np_target:
                    child_path = f"{popup_path}.{np_field}" if popup_path else np_field
                    print(f"      nested popup: {np_field}")
                    _deploy_popup(nb, np_target, f"nested.{np_field}",
                                  np, {}, mod, force, popup_path=child_path)
                    break


# ══════════════════════════════════════════════════════════════════
#  Popup expansion (auto-derive edit from addNew)
# ══════════════════════════════════════════════════════════════════

def _expand_popups(popups: list[dict]) -> list[dict]:
    """Expand auto-derived popups from addNew form.

    auto options:
      - edit: derive editForm from addNew (same fields/layout)
      - detail: derive details popup for first table field click (name/title)

    If a popup with the same target already exists (e.g., from popups/*.yaml),
    the auto-derived one is skipped.
    """
    import copy

    # Collect existing targets to avoid duplicates
    existing_targets = {ps.get("target", "") for ps in popups if ps.get("target")}

    result = []
    for ps in popups:
        result.append(ps)
        auto = ps.get("auto", [])
        if not auto:
            continue

        target = ps.get("target", "")
        parts = target.split(".")
        base_parts = []
        for p in parts:
            if p in ("actions", "record_actions"):
                break
            base_parts.append(p)
        base_ref = ".".join(base_parts)

        src_block = ps.get("blocks", [{}])[0]
        coll = ps.get("coll", "")
        view_field = ps.get("view_field", "name")

        if "edit" in auto:
            edit_target = f"{base_ref}.record_actions.edit"
            if edit_target not in existing_targets:
                result.append({"target": edit_target, "coll": coll})

        if "detail" in auto:
            # Auto-generate detail popup from addNew form fields
            detail_block = copy.deepcopy(src_block)
            detail_block["key"] = "details_0"
            detail_block["type"] = "details"
            detail_block.pop("resource", None)
            detail_block["resource_binding"] = {
                "filterByTk": "{{ctx.view.inputArgs.filterByTk}}"
            }
            detail_block["coll"] = coll
            detail_block.pop("actions", None)
            detail_block["actions"] = ["edit"]
            # Add createdAt to fields if not present
            detail_fields = detail_block.get("fields", [])
            if "createdAt" not in detail_fields:
                detail_fields.append("createdAt")
            detail_block["fields"] = detail_fields

            detail_target = f"{base_ref}.fields.{view_field}"
            if detail_target not in existing_targets:
                result.append({
                    "target": detail_target,
                    "mode": "drawer",
                    "coll": coll,
                    "blocks": [detail_block],
                })

        # Legacy: "view" still supported
        if "view" in auto and view_field:
            view_block = copy.deepcopy(src_block)
            view_block["type"] = "details"
            view_block["resource"] = {"binding": "currentRecord"}
            view_block.pop("actions", None)
            view_block["actions"] = ["edit"]
            result.append({
                "target": f"{base_ref}.fields.{view_field}",
                "mode": "drawer",
                "coll": coll,
                "blocks": [view_block],
            })

    return result


# ══════════════════════════════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════════════════════════════

def _ensure_collection(nb: NocoBase, name: str, coll_def: dict):
    if nb.collection_exists(name):
        print(f"  = collection: {name}")
    else:
        nb.create_collection(name, coll_def.get("title", name))
        print(f"  + collection: {name}")

    # Set titleField — first 'name' or 'title' field found
    fields = coll_def.get("fields", [])
    title_field = None
    for fdef in fields:
        fn = fdef.get("name", "") if isinstance(fdef, dict) else fdef
        if fn in ("name", "title"):
            title_field = fn
            break
    if not title_field and fields:
        fn0 = fields[0].get("name", "") if isinstance(fields[0], dict) else fields[0]
        if fn0 not in ("id",):
            title_field = fn0
    if title_field:
        nb.s.post(f"{nb.base}/api/collections:update",
                  params={"filterByTk": name},
                  json={"titleField": title_field}, timeout=30)

    meta = nb.field_meta(name)
    for fdef in coll_def.get("fields", []):
        fname = fdef["name"]
        if fname in meta or fname in ("id", "createdAt", "updatedAt"):
            continue
        try:
            extra = {}
            for k in ("options", "target", "foreignKey"):
                if k in fdef:
                    extra[k] = fdef[k]
            nb.create_field(name, fname, fdef.get("interface", "input"),
                            fdef.get("title", fname), **extra)
            print(f"    + {name}.{fname}")
        except Exception as e:
            print(f"    ! {name}.{fname}: {e}")


def _build_ai_button(aspec: dict, block_uid: str, mod: Path) -> tuple[dict, dict]:
    """Build AI button stepParams + props from shorthand DSL.

    Shorthand: {type: ai, employee: viz, tasks_file: ./ai/tasks.yaml}
    Tasks file: {tasks: [{title, user, system_file, autoSend}]}

    Returns (stepParams, props).
    """
    employee = aspec.get("employee", "")
    tasks_file = aspec.get("tasks_file", "")

    # Load tasks
    tasks_spec = []
    if tasks_file and mod:
        tf = mod / tasks_file
        if tf.exists():
            td = yaml.safe_load(tf.read_text()) or {}
            tasks_spec = td.get("tasks", [])

    # Build tasks → stepParams format
    built_tasks = []
    for t in tasks_spec:
        system_text = t.get("system", "")
        if not system_text and t.get("system_file") and mod:
            sf = mod / t["system_file"]
            if sf.exists():
                system_text = sf.read_text()

        built_tasks.append({
            "title": t.get("title", ""),
            "autoSend": t.get("autoSend", True),
            "message": {
                "user": t.get("user", ""),
                "system": system_text,
                "workContext": [{"type": "flow-model", "uid": block_uid}],
                "skillSettings": {},
            },
        })

    step_params = {
        "shortcutSettings": {
            "editTasks": {"tasks": built_tasks},
        }
    }

    props = {
        "aiEmployee": {"username": employee},
        "context": {"workContext": [{"type": "flow-model", "uid": block_uid}]},
        "auto": False,
    }

    return step_params, props


def _find_group(nb: NocoBase, title: str, parent_id: int = None) -> int | None:
    """Find a menu group by title, optionally within a parent group."""
    routes = nb.routes()
    if parent_id:
        # Search within parent's children
        for r in routes:
            if r.get("id") == parent_id:
                for c in r.get("children", []):
                    if c.get("type") == "group" and c.get("title") == title:
                        return c["id"]
                return None
    # Search top-level
    for r in routes:
        if r.get("type") == "group" and r.get("title") == title:
            return r["id"]
    return None



# ══════════════════════════════════════════════════════════════════
#  CLI
# ══════════════════════════════════════════════════════════════════

def scaffold(mod_dir: str, module_name: str, pages: list[str]):
    """Generate a new module scaffold with structure.yaml + enhance.yaml."""
    mod = Path(mod_dir)
    mod.mkdir(parents=True, exist_ok=True)
    (mod / "js").mkdir(exist_ok=True)
    (mod / "charts").mkdir(exist_ok=True)
    (mod / "popups").mkdir(exist_ok=True)
    (mod / "ai").mkdir(exist_ok=True)

    page_specs = []
    enhance_popups = []
    mod_slug = slugify(module_name)

    # Find KPI card template
    template_dir = Path(__file__).parent / "templates"
    if not template_dir.exists():
        template_dir = mod.parent / "templates"  # fallback

    for page_name in pages:
        page_key = slugify(page_name)
        is_dashboard = "dashboard" in page_name.lower()

        if is_dashboard:
            # ── Dashboard: KPI cards + charts ──
            kpi_colors = [
                ("kpi_1", "#3b82f6", "#eff6ff", "#bfdbfe"),
                ("kpi_2", "#10b981", "#ecfdf5", "#6ee7b7"),
                ("kpi_3", "#f59e0b", "#fffbeb", "#fcd34d"),
                ("kpi_4", "#8b5cf6", "#f5f3ff", "#c4b5fd"),
            ]
            kpi_labels = ["Total Records", "Active Rate", "Pending Items", "Completed"]

            # Generate KPI JS files from template
            kpi_template = ""
            if (template_dir / "kpi_card.js").exists():
                kpi_template = (template_dir / "kpi_card.js").read_text()

            for i, (key, color, bg, stroke) in enumerate(kpi_colors):
                if kpi_template:
                    # Replace CONFIG in template
                    kpi_js = kpi_template.replace(
                        "label: 'Total Employees'", f"label: '{kpi_labels[i]}'"
                    ).replace(
                        "'#3b82f6'", f"'{color}'"
                    ).replace(
                        "'#eff6ff'", f"'{bg}'"
                    ).replace(
                        "'#bfdbfe'", f"'{stroke}'"
                    ).replace(
                        f"reportUid: 'hrm_kpi_employees'",
                        f"reportUid: '{mod_slug}_kpi_{i+1}'"
                    ).replace(
                        "FROM nb_hrm_employees",
                        f"FROM nb_{mod_slug}_TODO  -- ← CHANGE THIS"
                    )
                else:
                    kpi_js = f"// KPI Card {i+1}: {kpi_labels[i]}\n// TODO: copy from templates/kpi_card.js and edit CONFIG\nctx.render(ctx.React.createElement('div', null, '{kpi_labels[i]}'));"
                (mod / "js" / f"{key}.js").write_text(kpi_js)

            # Generate 5 chart files with varied types
            chart_types = [
                ("chart_1", "bar",   "Bar Chart — e.g. count by category"),
                ("chart_2", "pie",   "Pie Chart — e.g. distribution by status"),
                ("chart_3", "line",  "Line Chart — e.g. trend over time"),
                ("chart_4", "bar",   "Stacked Bar — e.g. breakdown comparison"),
                ("chart_5", "pie",   "Donut Chart — e.g. proportion overview"),
            ]
            chart_renders = {
                "bar": "var data = ctx.data.objects || [];\nreturn {\n  title: { text: 'TITLE', left: 'center', textStyle: { fontSize: 14 } },\n  tooltip: { trigger: 'axis' },\n  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }), axisLabel: { rotate: 30 } },\n  yAxis: { type: 'value' },\n  series: [{ type: 'bar', data: data.map(function(d) { return d.value; }), itemStyle: { color: '#1677ff' } }]\n};",
                "pie": "var data = ctx.data.objects || [];\nreturn {\n  title: { text: 'TITLE', left: 'center', textStyle: { fontSize: 14 } },\n  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },\n  series: [{ type: 'pie', radius: ['40%', '70%'], data: data.map(function(d) { return { name: d.label, value: d.value }; }), label: { show: true, formatter: '{b}\\n{d}%' } }]\n};",
                "line": "var data = ctx.data.objects || [];\nreturn {\n  title: { text: 'TITLE', left: 'center', textStyle: { fontSize: 14 } },\n  tooltip: { trigger: 'axis' },\n  xAxis: { type: 'category', data: data.map(function(d) { return d.label; }) },\n  yAxis: { type: 'value' },\n  series: [{ type: 'line', data: data.map(function(d) { return d.value; }), smooth: true, areaStyle: { opacity: 0.1 }, itemStyle: { color: '#1677ff' } }]\n};",
            }

            for chart_key, chart_type, chart_desc in chart_types:
                (mod / "charts" / f"{chart_key}.yaml").write_text(
                    f"sql_file: ./charts/{chart_key}.sql\nrender_file: ./charts/{chart_key}_render.js\n"
                )
                (mod / "charts" / f"{chart_key}.sql").write_text(
                    f"-- {chart_desc}\n-- TODO: edit this query for your data\n"
                    f"SELECT 'Category A' AS label, 10 AS value\n"
                    f"UNION ALL SELECT 'Category B', 20\n"
                    f"UNION ALL SELECT 'Category C', 15\n"
                    f"UNION ALL SELECT 'Category D', 8\n"
                )
                render_js = chart_renders.get(chart_type, chart_renders["bar"])
                render_js = render_js.replace("TITLE", chart_desc.split(" — ")[0])
                (mod / "charts" / f"{chart_key}_render.js").write_text(render_js)

            # Dashboard layout: CRM Analytics style
            # Row 1: 4 KPI cards
            # Row 2: chart_1 (large) + chart_2 (small)
            # Row 3: chart_3 (full width)
            # Row 4: chart_4 (large) + chart_5 (small)
            page_spec = {
                "page": page_name,
                "icon": "dashboardoutlined",
                "blocks": [
                    {"key": k, "type": "jsBlock", "desc": f"KPI Card {i+1}", "file": f"./js/{k}.js"}
                    for i, (k, _, _, _) in enumerate(kpi_colors)
                ] + [
                    {"key": ck, "type": "chart", "chart_config": f"./charts/{ck}.yaml"}
                    for ck, _, _ in chart_types
                ],
                "layout": [
                    [{"kpi_1": 6}, {"kpi_2": 6}, {"kpi_3": 6}, {"kpi_4": 6}],
                    [{"chart_1": 15}, {"chart_2": 9}],
                    ["chart_3"],
                    [{"chart_4": 14}, {"chart_5": 10}],
                ],
            }
            page_specs.append(page_spec)
            # No enhance popup for dashboard
        else:
            # ── Regular page: filterForm + table ──
            coll = f"nb_{mod_slug}_{page_key}"
            page_spec = {
                "page": page_name,
                "icon": "fileoutlined",
                "coll": coll,
                "blocks": [
                    {
                        "key": "filterForm",
                        "type": "filterForm",
                        "coll": coll,
                        "fields": [
                            {"field": "name", "filterPaths": ["name"]},
                        ],
                    },
                    {
                        "key": "table",
                        "type": "table",
                        "coll": coll,
                        "fields": ["name", "status", "createdAt"],
                        "actions": ["filter", "refresh", "addNew"],
                        "recordActions": ["edit", "delete"],
                    },
                ],
                "layout": [["filterForm"], ["table"]],
            }
            page_specs.append(page_spec)

            enhance_popups.append({
                "target": f"${page_key}.table.actions.addNew",
                "auto": ["edit", "detail"],
                "view_field": "name",
                "coll": coll,
                "blocks": [{
                    "key": "form",
                    "type": "createForm",
                    "resource": {"binding": "currentCollection"},
                    "fields": ["name", "status"],
                    "field_layout": [
                        "--- Basic Info ---",
                        ["name", "status"],
                    ],
                    "actions": ["submit"],
                }],
            })

    structure = {
        "module": module_name,
        "icon": "appstoreoutlined",
        "collections": {
            f"nb_{slugify(module_name)}_{slugify(p)}": {
                "title": p,
                "fields": [
                    {"name": "name", "interface": "input", "title": "Name"},
                    {"name": "status", "interface": "select", "title": "Status",
                     "options": ["Active", "Inactive"]},
                ],
            } for p in pages
        },
        "pages": page_specs,
    }
    enhance = {"popups": enhance_popups}

    (mod / "structure.yaml").write_text(dump_yaml(structure))
    (mod / "enhance.yaml").write_text(dump_yaml(enhance))

    print(f"\n  Scaffold created: {mod_dir}/")
    print(f"    {len(pages)} pages: {', '.join(pages)}")
    print(f"\n  Next steps:")
    print(f"    1. Edit structure.yaml — add fields to collections + blocks")
    print(f"    2. Edit enhance.yaml — customize addNew form fields + layout")
    print(f"    3. Deploy: cd tools && python deployer.py ../{mod_dir}/")
    print(f"    4. Test in browser, then iterate with --force")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "--new":
        if len(sys.argv) < 4:
            print("Usage: python deployer.py --new <dir> <module_name> --pages Page1,Page2,...")
            sys.exit(1)
        mod_dir = sys.argv[2]
        module_name = sys.argv[3]
        pages_str = ""
        if "--pages" in sys.argv:
            pi = sys.argv.index("--pages")
            pages_str = sys.argv[pi + 1]
        pages = [p.strip() for p in pages_str.split(",")] if pages_str else ["Main"]
        scaffold(mod_dir, module_name, pages)
    else:
        mod_dir = sys.argv[1]
        force = "--force" in sys.argv
        plan_only = "--plan" in sys.argv
        deploy(mod_dir, force, plan_only)
