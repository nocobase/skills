#!/usr/bin/env python3
"""NocoBase FlowModel v2 Page Export Tool

Exports complete page trees as JSON, including all nested popups (ChildPageModel),
event flows (flowRegistry with runjs code), and JS blocks/columns/items.

The `findOne?subKey=grid` API only returns the top-level grid and its direct subModels —
popups and their contents (forms, details, sub-tables) are loaded asynchronously and NOT
included. This script uses the flat `flowModels:list` to build full trees that include
everything.

Usage:
  python export_pages.py --base http://localhost:14000 --output ./export
  python export_pages.py --base http://localhost:14000 --output ./export --prefix "CRM"
"""
import argparse, json, os, requests


def sign_in(base_url, account="admin@nocobase.com", password="admin123"):
    r = requests.post(f"{base_url}/api/auth:signIn",
                      json={"account": account, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}


def get_routes(base_url, headers):
    r = requests.get(f"{base_url}/api/desktopRoutes:list?tree=true&paginate=false",
                     headers=headers)
    return r.json()["data"]


def get_all_models(base_url, headers):
    r = requests.get(f"{base_url}/api/flowModels:list?paginate=false",
                     headers=headers)
    return r.json()["data"]


def build_tree(root_uid, all_models):
    """Build a nested tree from flat model list, starting from root_uid.

    Returns the root node dict with recursive 'children' containing all descendants.
    Also counts nodes, JS blocks, events, and popups.
    """
    # Index: parentId → [children]
    children_map = {}
    uid_map = {}
    for m in all_models:
        uid_map[m["uid"]] = m
        pid = m.get("parentId", "")
        children_map.setdefault(pid, []).append(m)

    stats = {"nodes": 0, "js": 0, "events": 0, "popups": 0}

    def _build(uid):
        kids = children_map.get(uid, [])
        kids.sort(key=lambda m: m.get("sortIndex", 0))
        result = []
        for child in kids:
            stats["nodes"] += 1
            use = child.get("use", "")
            if use.startswith("JS"):
                stats["js"] += 1
            if use == "ChildPageModel":
                stats["popups"] += 1
            fr = child.get("flowRegistry") or {}
            if isinstance(fr, dict):
                for fv in fr.values():
                    if isinstance(fv, dict) and fv.get("steps"):
                        stats["events"] += 1

            node = {
                "uid": child["uid"],
                "use": use,
                "subKey": child.get("subKey", ""),
                "subType": child.get("subType", ""),
                "sortIndex": child.get("sortIndex", 0),
                "stepParams": child.get("stepParams") or {},
            }
            if child.get("flowRegistry"):
                node["flowRegistry"] = child["flowRegistry"]

            sub = _build(child["uid"])
            if sub:
                node["children"] = sub
            result.append(node)
        return result

    root = uid_map.get(root_uid)
    if not root:
        return None, stats

    stats["nodes"] = 1
    tree = {
        "uid": root["uid"],
        "use": root.get("use", ""),
        "subKey": root.get("subKey", ""),
        "stepParams": root.get("stepParams") or {},
    }
    if root.get("flowRegistry"):
        tree["flowRegistry"] = root["flowRegistry"]
    sub = _build(root_uid)
    if sub:
        tree["children"] = sub
    return tree, stats


def collect_pages(routes, path_parts=None):
    """Extract all flowPage entries and their tabs from the route tree."""
    if path_parts is None:
        path_parts = []
    results = []
    for rt in routes:
        title = rt.get("title") or "(untitled)"
        rtype = rt.get("type", "")
        uid = rt.get("schemaUid", "")
        current_path = path_parts + [title]

        if rtype == "flowPage":
            tabs = []
            for ch in (rt.get("children") or []):
                if ch.get("type") == "tabs":
                    tabs.append({
                        "title": ch.get("title"),
                        "uid": ch["schemaUid"],
                    })
            results.append({
                "title": title,
                "path": "_".join(current_path),
                "uid": uid,
                "tabs": tabs,
            })
        elif rtype == "group":
            results.extend(collect_pages(rt.get("children") or [], current_path))
    return results


def find_grid_uid(tab_uid, all_models):
    """Find the BlockGridModel uid under a tab."""
    for m in all_models:
        if m.get("parentId") == tab_uid and m.get("subKey") == "grid":
            return m["uid"]
    return None


def main():
    parser = argparse.ArgumentParser(description="Export NocoBase FlowModel v2 pages as JSON")
    parser.add_argument("--base", required=True, help="NocoBase base URL")
    parser.add_argument("--output", default="./export", help="Output directory")
    parser.add_argument("--prefix", default="", help="Only export pages whose path starts with this prefix")
    parser.add_argument("--account", default="admin@nocobase.com", help="Login account")
    parser.add_argument("--password", default="admin123", help="Login password")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)
    headers = sign_in(args.base, args.account, args.password)
    routes = get_routes(args.base, headers)

    # Step 0: export the route tree
    routes_file = os.path.join(args.output, "_routes.json")
    with open(routes_file, "w", encoding="utf-8") as f:
        json.dump(routes, f, ensure_ascii=False, indent=2)
    print(f"  Routes tree -> _routes.json")

    # Load ALL models once (used for full tree building)
    all_models = get_all_models(args.base, headers)
    print(f"  Loaded {len(all_models)} FlowModel nodes\n")

    pages = collect_pages(routes)
    if args.prefix:
        pages = [p for p in pages if p["path"].startswith(args.prefix)]

    print(f"Found {len(pages)} pages to export\n")

    total_nodes = 0
    for p in pages:
        result = {
            "title": p["title"],
            "path": p["path"],
            "uid": p["uid"],
            "tabs": [],
        }
        for tab in p["tabs"]:
            grid_uid = find_grid_uid(tab["uid"], all_models)
            if grid_uid:
                tree, stats = build_tree(grid_uid, all_models)
                result["tabs"].append({
                    "title": tab["title"],
                    "uid": tab["uid"],
                    "grid_uid": grid_uid,
                    "stats": stats,
                    "tree": tree,
                })
                total_nodes += stats["nodes"]
            else:
                result["tabs"].append({
                    "title": tab["title"],
                    "uid": tab["uid"],
                    "stats": {"nodes": 0},
                    "tree": None,
                })

        filename = f"{p['path']}_{p['uid']}.json"
        filepath = os.path.join(args.output, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        tab_parts = []
        for t in result["tabs"]:
            s = t["stats"]
            detail = f"{s['nodes']}n"
            extras = []
            if s.get("js"): extras.append(f"{s['js']}js")
            if s.get("events"): extras.append(f"{s['events']}evt")
            if s.get("popups"): extras.append(f"{s['popups']}pop")
            if extras: detail += "," + ",".join(extras)
            tab_parts.append(f"{t['title'] or '(default)'}({detail})")
        tab_info = " + ".join(tab_parts)
        page_nodes = sum(t["stats"]["nodes"] for t in result["tabs"])
        print(f"  {p['title']:20s}  {page_nodes:>4} nodes  [{tab_info}]")

    print(f"\nTotal: {len(pages)} pages, {total_nodes} nodes -> {args.output}/")


if __name__ == "__main__":
    main()
