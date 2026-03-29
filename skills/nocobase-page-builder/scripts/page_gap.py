#!/usr/bin/env python3
"""Page Gap Analysis — compare a page with CRM reference to show what's missing.

Outputs a layered TODO list that guides multi-round building.

Usage:
    python page_gap.py --base http://localhost:14206 --page "客户" --ref examples/exported-json/Customers_c137kk6hghm.json
    python page_gap.py --base http://localhost:14206 --page "商机" --ref examples/exported-json/Opportunities_vga8g2pgnnu.json
"""
import argparse, json, os, sys

def analyze_tree(obj, stats=None, depth=0):
    """Recursively analyze a page tree, collecting stats by depth/type."""
    if stats is None:
        stats = {"nodes": 0, "by_use": {}, "by_depth": {}, "js_blocks": [],
                 "popups": [], "events": [], "forms": [], "tabs": [], "subtables": []}
    if not isinstance(obj, dict):
        return stats

    use = obj.get("use", "")
    uid = obj.get("uid", "")
    sp = obj.get("stepParams", {})
    stats["nodes"] += 1
    stats["by_use"][use] = stats["by_use"].get(use, 0) + 1
    stats["by_depth"][depth] = stats["by_depth"].get(depth, 0) + 1

    if use.startswith("JS"):
        title = sp.get("title", "") or (sp.get("tableColumnSettings") or {}).get("title", {}).get("title", "")
        code_len = len((sp.get("jsSettings") or {}).get("runJs", {}).get("code", ""))
        stats["js_blocks"].append({"use": use, "uid": uid, "title": title, "code_len": code_len, "depth": depth})

    if use == "ChildPageModel":
        stats["popups"].append({"uid": uid, "depth": depth})

    if use in ("CreateFormModel", "EditFormModel"):
        coll = sp.get("resourceSettings", {}).get("init", {}).get("collectionName", "")
        stats["forms"].append({"use": use, "uid": uid, "collection": coll, "depth": depth})

    if use == "ChildPageTabModel":
        title = sp.get("pageTabSettings", {}).get("tab", {}).get("title", "")
        stats["tabs"].append({"uid": uid, "title": title, "depth": depth})

    # Events
    fr = obj.get("flowRegistry") or sp.get("flowRegistry") or {}
    if isinstance(fr, dict):
        for fk, fv in fr.items():
            if isinstance(fv, dict) and fv.get("steps"):
                on = fv.get("on", {})
                event = on.get("eventName", "") if isinstance(on, dict) else str(on)
                has_code = any(
                    (sv.get("defaultParams") or {}).get("code", "")
                    for sv in (fv.get("steps") or {}).values()
                    if isinstance(sv, dict)
                )
                stats["events"].append({"use": use, "event": event, "has_code": has_code, "depth": depth})

    for ch in (obj.get("children") or []):
        analyze_tree(ch, stats, depth + 1)
    for sub in (obj.get("subModels") or {}).values():
        if isinstance(sub, list):
            for item in sub:
                analyze_tree(item, stats, depth + 1)
        elif isinstance(sub, dict):
            analyze_tree(sub, stats, depth + 1)

    return stats


def compare(current, reference):
    """Compare current page stats with reference, output layered TODO."""

    print("=" * 60)
    print("PAGE GAP ANALYSIS")
    print("=" * 60)

    # Layer 1: Page skeleton
    print("\n## Layer 1: Page Skeleton")
    c_top = {k: v for k, v in current["by_use"].items()
             if k in ("FilterFormBlockModel", "TableBlockModel", "BlockGridModel")}
    r_top = {k: v for k, v in reference["by_use"].items()
             if k in ("FilterFormBlockModel", "TableBlockModel", "BlockGridModel")}
    print(f"  Current: {c_top}")
    print(f"  Reference: {r_top}")
    if c_top.get("FilterFormBlockModel") and c_top.get("TableBlockModel"):
        print("  ✅ Skeleton complete")
    else:
        print("  ❌ Missing skeleton blocks")

    # Layer 2: Popups & Detail tabs
    print(f"\n## Layer 2: Popups & Detail Tabs")
    print(f"  Current:   {len(current['popups'])} popups, {len(current['tabs'])} tabs")
    print(f"  Reference: {len(reference['popups'])} popups, {len(reference['tabs'])} tabs")
    popup_gap = len(reference["popups"]) - len(current["popups"])
    tab_gap = len(reference["tabs"]) - len(current["tabs"])
    if popup_gap > 0:
        print(f"  ❌ Missing {popup_gap} popups (relation field click popups, nested detail popups)")
    if tab_gap > 0:
        print(f"  ❌ Missing {tab_gap} detail tabs (subtable tabs, overview variants)")

    # Layer 3: Forms
    print(f"\n## Layer 3: Forms (inside popups)")
    print(f"  Current:   {len(current['forms'])} forms")
    print(f"  Reference: {len(reference['forms'])} forms")
    form_gap = len(reference["forms"]) - len(current["forms"])
    if form_gap > 0:
        print(f"  ❌ Missing {form_gap} forms (popup-internal create/edit forms)")

    # Layer 4: JS blocks/columns
    print(f"\n## Layer 4: JS Blocks & Columns")
    print(f"  Current:   {len(current['js_blocks'])} JS nodes")
    print(f"  Reference: {len(reference['js_blocks'])} JS nodes")
    # Group by type
    c_js_types = {}
    for j in current["js_blocks"]:
        c_js_types[j["use"]] = c_js_types.get(j["use"], 0) + 1
    r_js_types = {}
    for j in reference["js_blocks"]:
        r_js_types[j["use"]] = r_js_types.get(j["use"], 0) + 1
    for jtype in sorted(set(list(c_js_types.keys()) + list(r_js_types.keys()))):
        c = c_js_types.get(jtype, 0)
        r = r_js_types.get(jtype, 0)
        status = "✅" if c >= r else f"❌ need +{r-c}"
        print(f"    {jtype:25s} current={c} ref={r} {status}")

    # Layer 5: Events
    print(f"\n## Layer 5: Event Flows")
    print(f"  Current:   {len(current['events'])} events")
    print(f"  Reference: {len(reference['events'])} events")
    if reference["events"]:
        event_types = {}
        for e in reference["events"]:
            k = f"{e['use']}→{e['event']}"
            event_types[k] = event_types.get(k, 0) + 1
        print(f"  Reference event types:")
        for k, v in sorted(event_types.items(), key=lambda x: -x[1]):
            print(f"    {v}x {k}")

    # Summary
    print(f"\n## Summary")
    print(f"  Nodes: {current['nodes']} / {reference['nodes']} ({current['nodes']/max(reference['nodes'],1)*100:.0f}%)")
    print(f"  Biggest gaps:")
    gaps = [
        (popup_gap, "popups (Layer 2)"),
        (tab_gap, "detail tabs (Layer 2)"),
        (form_gap, "forms (Layer 3)"),
        (len(reference["js_blocks"]) - len(current["js_blocks"]), "JS blocks (Layer 4)"),
        (len(reference["events"]) - len(current["events"]), "events (Layer 5)"),
    ]
    for gap, label in sorted(gaps, key=lambda x: -x[0]):
        if gap > 0:
            print(f"    +{gap} {label}")


def main():
    parser = argparse.ArgumentParser(description="Page gap analysis")
    parser.add_argument("--base", required=True, help="NocoBase URL")
    parser.add_argument("--page", required=True, help="Page title to analyze")
    parser.add_argument("--ref", required=True, help="Reference JSON export file")
    parser.add_argument("--account", default="admin@nocobase.com")
    parser.add_argument("--password", default="admin123")
    args = parser.parse_args()

    import requests
    r = requests.post(f"{args.base}/api/auth:signIn",
                      json={"account": args.account, "password": args.password})
    h = {"Authorization": f"Bearer {r.json()['data']['token']}"}

    # Get all models and build tree for the target page
    all_models = requests.get(f"{args.base}/api/flowModels:list?paginate=false", headers=h).json()["data"]
    routes = requests.get(f"{args.base}/api/desktopRoutes:list?tree=true&paginate=false", headers=h).json()["data"]

    # Find the page's tab UID
    def find_tab(routes, title):
        for rt in routes:
            if rt.get("title") == title and rt.get("type") == "flowPage":
                for ch in (rt.get("children") or []):
                    if ch.get("type") == "tabs":
                        return ch["schemaUid"]
            result = find_tab(rt.get("children") or [], title)
            if result:
                return result
        return None

    tab_uid = find_tab(routes, args.page)
    if not tab_uid:
        print(f"Page not found: {args.page}")
        sys.exit(1)

    # Build tree from flat list
    children_map = {}
    uid_map = {}
    for m in all_models:
        uid_map[m["uid"]] = m
        children_map.setdefault(m.get("parentId", ""), []).append(m)

    def build_tree(uid):
        node = uid_map.get(uid, {})
        result = dict(node)
        kids = sorted(children_map.get(uid, []), key=lambda m: m.get("sortIndex", 0))
        if kids:
            result["children"] = [build_tree(k["uid"]) for k in kids]
        return result

    # Find grid under tab
    grid_uid = next((m["uid"] for m in all_models
                     if m.get("parentId") == tab_uid and m.get("subKey") == "grid"), None)
    if not grid_uid:
        print(f"No grid found under tab {tab_uid}")
        sys.exit(1)

    current_tree = build_tree(grid_uid)
    current_stats = analyze_tree(current_tree)

    # Load reference
    ref_data = json.load(open(args.ref))
    ref_stats = {"nodes": 0, "by_use": {}, "by_depth": {}, "js_blocks": [],
                 "popups": [], "events": [], "forms": [], "tabs": [], "subtables": []}
    for t in ref_data.get("tabs", []):
        if t.get("tree"):
            analyze_tree(t["tree"], ref_stats)

    compare(current_stats, ref_stats)


if __name__ == "__main__":
    main()
