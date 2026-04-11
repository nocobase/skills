"""NocoBase flowSurfaces client — thin wrapper over the new API.

All the model name resolution, layout generation, field type inference
is handled server-side by flowSurfaces. We just pass semantic specs.
"""

from __future__ import annotations

import json
import os
import random
import string
from typing import Any, Optional

import requests
import yaml


class NocoBase:
    """flowSurfaces API client."""

    def __init__(self, base_url: str = None):
        self.base = base_url or os.environ.get("NB_URL", "http://localhost:14000")
        self.s = requests.Session()
        self.s.trust_env = False
        self._timeout = 30
        self._login()

    def _login(self):
        account = os.environ.get("NB_USER", "admin@nocobase.com")
        password = os.environ.get("NB_PASSWORD", "admin123")
        r = self.s.post(f"{self.base}/api/auth:signIn",
                        json={"account": account, "password": password},
                        timeout=self._timeout)
        r.raise_for_status()
        self.s.headers["Authorization"] = f"Bearer {r.json()['data']['token']}"

    def _call(self, action: str, body: dict = None, method: str = "POST") -> dict:
        """Call flowSurfaces:<action>."""
        if method == "GET":
            r = self.s.get(f"{self.base}/api/flowSurfaces:{action}",
                           params=body, timeout=self._timeout)
        else:
            r = self.s.post(f"{self.base}/api/flowSurfaces:{action}",
                            json=body, timeout=self._timeout)
        data = r.json()
        if "errors" in data:
            raise RuntimeError(f"flowSurfaces:{action} → {data['errors'][0].get('message','?')}")
        return data.get("data", data)

    # ── Read ──────────────────────────────────────────────────────

    def get(self, uid: str = None, **kwargs) -> dict:
        params = {"uid": uid} if uid else kwargs
        return self._call("get", params, method="GET")

    def catalog(self, target_uid: str = None) -> dict:
        body = {}
        if target_uid:
            body["target"] = {"uid": target_uid}
        return self._call("catalog", body)

    def context(self, target_uid: str, path: str = None) -> dict:
        body: dict[str, Any] = {"target": {"uid": target_uid}}
        if path:
            body["path"] = path
        return self._call("context", body)

    # ── Menu / Page lifecycle ─────────────────────────────────────

    def create_group(self, title: str, icon: str = "appstoreoutlined",
                     parent_id: int = None) -> dict:
        body: dict[str, Any] = {"title": title, "type": "group", "icon": icon}
        if parent_id:
            body["parentMenuRouteId"] = parent_id
        return self._call("createMenu", body)

    def create_page(self, title: str, parent_route_id: int = None,
                    icon: str = "fileoutlined") -> dict:
        """Create menu item + page. Returns {routeId, pageUid, tabSchemaUid, gridUid, ...}."""
        # Step 1: create menu item (type=item → flowPage)
        menu_body: dict[str, Any] = {"title": title, "type": "item", "icon": icon}
        if parent_route_id:
            menu_body["parentMenuRouteId"] = parent_route_id
        menu = self._call("createMenu", menu_body)

        # Step 2: initialize page
        page = self._call("createPage", {"menuRouteId": menu["routeId"]})
        return page

    def destroy_page(self, page_uid: str):
        return self._call("destroyPage", {"uid": page_uid})

    # ── Compose (the big one) ─────────────────────────────────────

    def compose(self, tab_uid: str, blocks: list[dict],
                mode: str = "replace") -> dict:
        """Create multiple blocks on a page in one call.

        blocks format:
          [{"key": "filter1", "type": "filterForm",
            "fields": [{"fieldPath": "name"}]},
           {"key": "table1", "type": "table",
            "resource": {"collectionName": "xxx"},
            "fields": [{"fieldPath": "name"}],
            "actions": [{"type": "filter"}, {"type": "refresh"}]}]
        """
        return self._call("compose", {
            "target": {"uid": tab_uid},
            "mode": mode,
            "blocks": blocks,
        })

    # ── Incremental operations ────────────────────────────────────

    def add_block(self, grid_uid: str, block_type: str,
                  resource: dict = None, **kwargs) -> dict:
        body: dict[str, Any] = {"target": {"uid": grid_uid}, "type": block_type}
        if resource:
            body["resource"] = resource
        body.update(kwargs)
        return self._call("addBlock", body)

    def add_field(self, target_uid: str, field_path: str, **kwargs) -> dict:
        body: dict[str, Any] = {"target": {"uid": target_uid}, "fieldPath": field_path}
        body.update(kwargs)
        return self._call("addField", body)

    def add_action(self, target_uid: str, action_type: str) -> dict:
        return self._call("addAction", {
            "target": {"uid": target_uid},
            "type": action_type,
        })

    def add_record_action(self, target_uid: str, action_type: str) -> dict:
        return self._call("addRecordAction", {
            "target": {"uid": target_uid},
            "type": action_type,
        })

    def configure(self, target_uid: str, changes: dict) -> dict:
        return self._call("configure", {
            "target": {"uid": target_uid},
            **changes,
        })

    def update_settings(self, target_uid: str, settings: dict) -> dict:
        return self._call("updateSettings", {
            "target": {"uid": target_uid},
            **settings,
        })

    def set_layout(self, grid_uid: str, rows: dict, sizes: dict) -> dict:
        return self._call("setLayout", {
            "target": {"uid": grid_uid},
            "rows": rows,
            "sizes": sizes,
        })

    def set_event_flows(self, target_uid: str, event_flows: dict) -> dict:
        return self._call("setEventFlows", {
            "target": {"uid": target_uid},
            **event_flows,
        })

    # ── Popup / Tab ───────────────────────────────────────────────

    def add_popup_tab(self, popup_uid: str, title: str = None) -> dict:
        body: dict[str, Any] = {"target": {"uid": popup_uid}}
        if title:
            body["title"] = title
        return self._call("addPopupTab", body)

    def add_tab(self, page_uid: str, title: str = None) -> dict:
        body: dict[str, Any] = {"target": {"uid": page_uid}}
        if title:
            body["title"] = title
        return self._call("addTab", body)

    # ── Node operations ───────────────────────────────────────────

    def remove_node(self, uid: str) -> dict:
        return self._call("removeNode", {"target": {"uid": uid}})

    def move_node(self, source_uid: str, target_uid: str,
                  position: str = "after") -> dict:
        return self._call("moveNode", {
            "sourceUid": source_uid,
            "targetUid": target_uid,
            "position": position,
        })

    # ── Legacy API (flowModels:save) ─────────────────────────────
    # TODO: migrate to flowSurfaces when divider/markdown support is added

    def save_model(self, node: dict):
        """flowModels:save — upsert a single FlowModel node (legacy)."""
        r = self.s.post(f"{self.base}/api/flowModels:save",
                        json=node, timeout=self._timeout)
        if not r.ok:
            raise RuntimeError(f"flowModels:save → {r.status_code}: {r.text[:200]}")
        return r.json().get("data")

    def update_model(self, uid: str, step_params_patch: dict):
        """Safe partial stepParams update via flowSurfaces:configure.

        Falls back to flowModels:save with parentId looked up from tree.
        NEVER uses flowModels:update — it clears parentId.
        """
        # Try flowSurfaces:configure first (safest)
        try:
            return self.configure(uid, {"changes": step_params_patch})
        except Exception as e:
            pass

        # Fallback: flowModels:save with full structural fields
        # Must find parentId from the tree (flowModels:get doesn't return it)
        r = self.s.get(f"{self.base}/api/flowModels:get",
                       params={"filterByTk": uid}, timeout=self._timeout)
        if not r.ok:
            raise RuntimeError(f"flowModels:get {uid} → {r.status_code}")
        current = r.json().get("data", {})

        # Deep merge stepParams
        sp = dict(current.get("stepParams") or {})
        for k, v in step_params_patch.items():
            if isinstance(v, dict) and isinstance(sp.get(k), dict):
                sp[k] = {**sp[k], **v}
            else:
                sp[k] = v

        # Find parentId by searching all models (expensive but correct)
        parent_id = current.get("parentId")
        if not parent_id:
            parent_id = self._find_parent(uid)

        save_data: dict = {
            "uid": uid,
            "use": current.get("use", ""),
            "subKey": current.get("subKey"),
            "subType": current.get("subType"),
            "sortIndex": current.get("sortIndex", 0),
            "stepParams": sp,
            "flowRegistry": current.get("flowRegistry", {}),
        }
        if parent_id:
            save_data["parentId"] = parent_id

        r2 = self.s.post(f"{self.base}/api/flowModels:save",
                         json=save_data, timeout=self._timeout)
        if not r2.ok:
            raise RuntimeError(f"flowModels:save {uid} → {r2.status_code}: {r2.text[:200]}")
        return r2.json().get("data")

    def _find_parent(self, uid: str) -> str | None:
        """Find parentId by scanning all models. Cached per session."""
        if not hasattr(self, "_parent_cache"):
            models = self.s.get(f"{self.base}/api/flowModels:list",
                                params={"paginate": "false"},
                                timeout=self._timeout).json().get("data", [])
            self._parent_cache = {}
            for m in models:
                subs = m.get("subModels", {})
                if isinstance(subs, dict):
                    for _, v in subs.items():
                        if isinstance(v, list):
                            for child in v:
                                if isinstance(child, dict) and child.get("uid"):
                                    self._parent_cache[child["uid"]] = m["uid"]
                        elif isinstance(v, dict) and v.get("uid"):
                            self._parent_cache[v["uid"]] = m["uid"]
        return self._parent_cache.get(uid)

    def add_divider(self, grid_uid: str, label: str,
                    color: str = "#1677ff",
                    border_color: str = "rgba(5, 5, 5, 0.06)") -> str:
        """Insert a DividerItemModel into a form/detail grid.

        Uses legacy flowModels:save (flowSurfaces doesn't support divider yet).
        TODO: switch to flowSurfaces:addField when renderer='divider' is supported.

        Returns the divider UID.
        """
        import random, string
        divider_uid = ''.join(random.choices(string.ascii_lowercase + string.digits, k=11))
        self.save_model({
            "uid": divider_uid,
            "use": "DividerItemModel",
            "parentId": grid_uid,
            "subKey": "items",
            "subType": "array",
            "sortIndex": 0,
            "stepParams": {
                "markdownItemSetting": {
                    "title": {
                        "label": label,
                        "orientation": "left",
                        "color": color,
                        "borderColor": border_color,
                    }
                }
            },
            "flowRegistry": {},
        })
        return divider_uid

    # ── Collections (raw API, not flowSurfaces) ───────────────────

    def collection_exists(self, name: str) -> bool:
        r = self.s.get(f"{self.base}/api/collections:list",
                       params={"paginate": "false"}, timeout=self._timeout)
        colls = r.json().get("data", [])
        return any(c["name"] == name for c in colls)

    def create_collection(self, name: str, title: str):
        return self.s.post(f"{self.base}/api/collections:create", json={
            "name": name, "title": title, "logging": True,
            "autoGenId": True, "createdAt": True, "updatedAt": True,
            "createdBy": True, "updatedBy": True, "sortable": True,
        }, timeout=self._timeout).json().get("data")

    def create_field(self, coll: str, name: str, interface: str,
                     title: str, **opts):
        type_map = {"input": "string", "textarea": "text", "integer": "bigInt",
                    "number": "double", "select": "string", "multipleSelect": "array",
                    "checkbox": "boolean", "datetime": "date", "date": "dateOnly",
                    "time": "time", "email": "string", "phone": "string",
                    "url": "string", "percent": "float", "sequence": "string",
                    "attachment": "belongsToMany"}

        # Relation fields
        if interface == "m2o" and opts.get("target"):
            target = opts["target"]
            fk = opts.get("foreignKey", f"{name}_id")
            body: dict[str, Any] = {
                "name": name, "type": "belongsTo", "interface": "m2o",
                "target": target, "foreignKey": fk,
                "targetKey": "id", "onDelete": "SET NULL",
                "uiSchema": {"type": "object", "title": title,
                             "x-component": "AssociationField",
                             "x-component-props": {"multiple": False}},
            }
        elif interface == "o2m" and opts.get("target"):
            target = opts["target"]
            fk = opts.get("foreignKey", f"{coll.split('.')[-1]}_id")
            body = {
                "name": name, "type": "hasMany", "interface": "o2m",
                "target": target, "foreignKey": fk,
                "uiSchema": {"title": title, "x-component": "AssociationField",
                             "x-component-props": {"multiple": True}},
            }
        else:
            body = {
                "name": name, "type": type_map.get(interface, "string"),
                "interface": interface,
                "uiSchema": {"title": title, "x-component": "Input"},
            }

        if "options" in opts:
            enum = []
            for o in opts["options"]:
                if isinstance(o, dict):
                    enum.append(o)  # already {value, label} format
                else:
                    enum.append({"value": o, "label": str(o)})
            body["uiSchema"]["enum"] = enum

        return self.s.post(f"{self.base}/api/collections/{coll}/fields:create",
                           json=body, timeout=self._timeout).json().get("data")

    def field_meta(self, coll: str) -> dict[str, dict]:
        """Get field metadata for a collection (cached per session)."""
        if not hasattr(self, "_field_meta_cache"):
            self._field_meta_cache = {}
        if coll not in self._field_meta_cache:
            fields = self.s.get(f"{self.base}/api/collections/{coll}/fields:list",
                                params={"pageSize": "200"},
                                timeout=self._timeout).json().get("data", [])
            self._field_meta_cache[coll] = {
                f["name"]: {"interface": f.get("interface", "input")} for f in fields
            }
        return self._field_meta_cache[coll]

    def routes(self) -> list[dict]:
        """Get all desktop routes (cached per session)."""
        if not hasattr(self, "_routes_cache"):
            self._routes_cache = self.s.get(
                f"{self.base}/api/desktopRoutes:list",
                params={"paginate": "false", "tree": "true"},
                timeout=self._timeout).json().get("data", [])
        return self._routes_cache


# ── YAML helpers ──────────────────────────────────────────────────

class _NoAlias(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True

def dump_yaml(data: dict) -> str:
    return yaml.dump(data, Dumper=_NoAlias, allow_unicode=True,
                     default_flow_style=False, sort_keys=False)


def slugify(s: str) -> str:
    """Convert string to safe slug (lowercase, underscores)."""
    import re
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "_", s)
    return s.strip("_") or "item"
