"""NocoBase API client — login, session management, base request helpers.

Extracted from nb_page_builder.py NB class. Provides two client variants:

- NB: requests-based client with session management (for page building tools)
- NocoBaseClient: stdlib-only client (for data modeling tools)

Both auto-login on construction and provide the same base URL + auth token.
"""

import json
import os
import time
import urllib.request
import urllib.error
from typing import Any, Optional

import requests

from .utils import uid, deep_merge
from .models import DISPLAY_MAP, EDIT_MAP


# ── Interface -> uiSchema templates (for data modeling) ────────────────

INTERFACE_TEMPLATES = {
    "input": {
        "type": "string",
        "uiSchema": {"type": "string", "x-component": "Input"},
    },
    "textarea": {
        "type": "text",
        "uiSchema": {"type": "string", "x-component": "Input.TextArea"},
    },
    "email": {
        "type": "string",
        "uiSchema": {"type": "string", "x-component": "Input", "x-validator": "email"},
    },
    "phone": {
        "type": "string",
        "uiSchema": {"type": "string", "x-component": "Input", "x-component-props": {"type": "tel"}},
    },
    "url": {
        "type": "text",
        "uiSchema": {"type": "string", "x-component": "Input.URL"},
    },
    "password": {
        "type": "password",
        "hidden": True,
        "uiSchema": {"type": "string", "x-component": "Password"},
    },
    "color": {
        "type": "string",
        "uiSchema": {"type": "string", "x-component": "ColorPicker"},
    },
    "icon": {
        "type": "string",
        "uiSchema": {"type": "string", "x-component": "IconPicker"},
    },
    "markdown": {
        "type": "text",
        "uiSchema": {"type": "string", "x-component": "Markdown"},
    },
    "richText": {
        "type": "text",
        "uiSchema": {"type": "string", "x-component": "RichText"},
    },
    "select": {
        "type": "string",
        "uiSchema": {"type": "string", "x-component": "Select", "enum": []},
    },
    "multipleSelect": {
        "type": "array",
        "defaultValue": [],
        "uiSchema": {"type": "array", "x-component": "Select", "x-component-props": {"mode": "multiple"}, "enum": []},
    },
    "radioGroup": {
        "type": "string",
        "uiSchema": {"type": "string", "x-component": "Radio.Group"},
    },
    "checkboxGroup": {
        "type": "array",
        "defaultValue": [],
        "uiSchema": {"type": "string", "x-component": "Checkbox.Group"},
    },
    "checkbox": {
        "type": "boolean",
        "uiSchema": {"type": "boolean", "x-component": "Checkbox"},
    },
    "number": {
        "type": "double",
        "uiSchema": {"type": "number", "x-component": "InputNumber", "x-component-props": {"stringMode": True, "step": "1"}},
    },
    "integer": {
        "type": "bigInt",
        "uiSchema": {"type": "number", "x-component": "InputNumber", "x-component-props": {"stringMode": True, "step": "1"}, "x-validator": "integer"},
    },
    "percent": {
        "type": "float",
        "uiSchema": {"type": "string", "x-component": "Percent", "x-component-props": {"stringMode": True, "step": "1", "addonAfter": "%"}},
    },
    "sort": {
        "type": "sort",
        "uiSchema": {"type": "number", "x-component": "InputNumber", "x-component-props": {"stringMode": True, "step": "1"}, "x-validator": "integer"},
    },
    "datetime": {
        "type": "date",
        "uiSchema": {"type": "string", "x-component": "DatePicker", "x-component-props": {"showTime": False, "utc": True}},
    },
    "date": {
        "type": "dateOnly",
        "uiSchema": {"type": "string", "x-component": "DatePicker", "x-component-props": {"dateOnly": True, "showTime": False}},
    },
    "datetimeNoTz": {
        "type": "datetimeNoTz",
        "uiSchema": {"type": "string", "x-component": "DatePicker", "x-component-props": {"showTime": False, "utc": False}},
    },
    "time": {
        "type": "time",
        "uiSchema": {"type": "string", "x-component": "TimePicker"},
    },
    "id": {
        "type": "bigInt",
        "autoIncrement": True,
        "primaryKey": True,
        "allowNull": False,
        "uiSchema": {"type": "number", "x-component": "InputNumber", "x-read-pretty": True},
    },
    "createdAt": {
        "type": "date",
        "field": "createdAt",
        "uiSchema": {"type": "datetime", "x-component": "DatePicker", "x-component-props": {}, "x-read-pretty": True},
    },
    "updatedAt": {
        "type": "date",
        "field": "updatedAt",
        "uiSchema": {"type": "datetime", "x-component": "DatePicker", "x-component-props": {}, "x-read-pretty": True},
    },
    "createdBy": {
        "type": "belongsTo",
        "target": "users",
        "foreignKey": "createdById",
        "uiSchema": {"type": "object", "x-component": "AssociationField", "x-component-props": {"fieldNames": {"label": "nickname", "value": "id"}}, "x-read-pretty": True},
    },
    "updatedBy": {
        "type": "belongsTo",
        "target": "users",
        "foreignKey": "updatedById",
        "uiSchema": {"type": "object", "x-component": "AssociationField", "x-component-props": {"fieldNames": {"label": "nickname", "value": "id"}}, "x-read-pretty": True},
    },
    "json": {
        "type": "json",
        "default": None,
        "uiSchema": {"type": "object", "x-component": "Input.JSON", "x-component-props": {"autoSize": {"minRows": 5}}},
    },
}

# System fields that must be created via API (not SQL)
SYSTEM_FIELD_PAYLOADS = [
    {
        "name": "createdAt", "interface": "createdAt", "type": "date", "field": "createdAt",
        "uiSchema": {
            "type": "datetime", "title": "Created at", "x-component": "DatePicker",
            "x-component-props": {}, "x-read-pretty": True,
        },
    },
    {
        "name": "updatedAt", "interface": "updatedAt", "type": "date", "field": "updatedAt",
        "uiSchema": {
            "type": "datetime", "title": "Updated at", "x-component": "DatePicker",
            "x-component-props": {}, "x-read-pretty": True,
        },
    },
    {
        "name": "createdBy", "interface": "createdBy", "type": "belongsTo", "target": "users",
        "foreignKey": "createdById",
        "uiSchema": {
            "type": "object", "title": "Created by", "x-component": "AssociationField",
            "x-component-props": {"fieldNames": {"label": "nickname", "value": "id"}},
            "x-read-pretty": True,
        },
    },
    {
        "name": "updatedBy", "interface": "updatedBy", "type": "belongsTo", "target": "users",
        "foreignKey": "updatedById",
        "uiSchema": {
            "type": "object", "title": "Updated by", "x-component": "AssociationField",
            "x-component-props": {"fieldNames": {"label": "nickname", "value": "id"}},
            "x-read-pretty": True,
        },
    },
]

SYSTEM_FIELD_MAP = {"id": "id", "sort": "sort"}


# ── Fields format parsing (multi-column + sections) ─────────────────────

def _parse_field_name(name):
    """Parse 'name*' or 'name:16' or 'name*:16' → (clean_name, width_or_None, is_required)."""
    required = False
    width = None
    if ":" in name:
        name, w = name.rsplit(":", 1)
        width = int(w.strip())
    name = name.strip()
    if name.endswith("*"):
        name = name[:-1].strip()
        required = True
    return name, width, required


def _normalize_fields(fields):
    """Normalize fields parameter to internal representation. Returns (items, auto_required).

    Supports:
        1. Multi-line string (pipe syntax): "name* | code\\nstatus"
        2. List (legacy): ["name", "code", [("name",12),("code",12)], "---"]
        3. Mixed: list items also support pipe syntax
    """
    if isinstance(fields, str):
        # MCP JSON transport may deliver literal \n (two chars) instead of real newlines
        fields = fields.replace("\\n", "\n")
        # Validate grid layout: reject single-column forms with >3 fields
        from .markup_parser import validate_grid_layout
        validate_grid_layout(fields, context="fields")
        fields = [l.strip() for l in fields.strip().split("\n") if l.strip()]

    result = []
    auto_required = set()

    for item in fields:
        if isinstance(item, str) and item.strip().startswith("---"):
            title = item.strip()[3:].strip()
            result.append({"type": "divider", "label": title or ""})
        elif isinstance(item, str) and item.strip().startswith("#"):
            result.append({"type": "markdown", "content": item.strip()})
        elif isinstance(item, str) and "|" in item:
            parts = [p.strip() for p in item.split("|")]
            auto_width = 24 // len(parts)
            cols = []
            for part in parts:
                name, width, req = _parse_field_name(part)
                if req:
                    auto_required.add(name)
                cols.append((name, width or auto_width))
            result.append({"type": "row", "cols": cols})
        elif isinstance(item, str):
            name, width, req = _parse_field_name(item)
            if req:
                auto_required.add(name)
            result.append({"type": "row", "cols": [(name, width or 24)]})
        elif isinstance(item, list):
            cols = []
            for col in item:
                if isinstance(col, tuple):
                    name, _, req = _parse_field_name(col[0]) if isinstance(col[0], str) else (col[0], None, False)
                    if req:
                        auto_required.add(name)
                    cols.append((name, col[1]))
                else:
                    name, width, req = _parse_field_name(col) if isinstance(col, str) else (col, None, False)
                    if req:
                        auto_required.add(name)
                    cols.append((name, width or 24))
            result.append({"type": "row", "cols": cols})
        elif isinstance(item, tuple):
            name, _, req = _parse_field_name(item[0]) if isinstance(item[0], str) else (item[0], None, False)
            if req:
                auto_required.add(name)
            result.append({"type": "row", "cols": [(name, item[1] if len(item) > 1 else 24)]})

    return result, auto_required


class APIError(Exception):
    """Raised on HTTP errors from NocoBase API."""
    def __init__(self, code: int, body: str, url: str):
        self.code = code
        self.body = body
        self.url = url
        super().__init__(f"HTTP {code}: {url}\n{body[:500]}")


class NocoBaseClient:
    """Thin HTTP client for NocoBase API using only urllib (no requests dependency).

    Used by data modeling tools (collections, fields, SQL).
    """

    def __init__(self, base_url: str, user: str = "admin@nocobase.com",
                 password: str = "admin123"):
        self.base = base_url.rstrip("/")
        self.user = user
        self.password = password
        self.token = None

    def login(self):
        data = self._request("POST", "/api/auth:signIn", {
            "account": self.user, "password": self.password
        })
        self.token = data["data"]["token"]
        return self.token

    def _request(self, method, path, body=None, expect_empty=False):
        url = self.base + path
        payload = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(url, data=payload, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                if not raw or expect_empty:
                    return {}
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            body_text = ""
            try:
                body_text = e.read().decode()
            except Exception:
                pass
            raise APIError(e.code, body_text, url)

    def get(self, path):
        return self._request("GET", path)

    def post(self, path, body=None, expect_empty=False):
        return self._request("POST", path, body, expect_empty=expect_empty)

    def put(self, path, body=None):
        return self._request("PUT", path, body)

    def delete(self, path):
        return self._request("DELETE", path)


class NB:
    """NocoBase FlowPage builder — requests-based client with session management.

    Used by page building and route tools. Handles auto-login, metadata caching,
    FlowModel CRUD (save/update/destroy), and all high-level page building methods.
    """

    def __init__(self, base_url: Optional[str] = None, auto_login: bool = True,
                 account: Optional[str] = None, password: Optional[str] = None) -> None:
        self.base = base_url or os.environ.get("NB_URL", "http://localhost:14000")
        self.account = account or os.environ.get("NB_USER", "admin@nocobase.com")
        self.password = password or os.environ.get("NB_PASSWORD", "admin123")
        self.s = requests.Session()
        self.s.trust_env = False
        self.created = 0
        self.errors = []
        self.warnings = []
        self._field_cache = {}
        self._title_cache = {}
        self._coll_title_cache = {}
        self._sort_counters = {}
        self._timeout = 30
        if auto_login:
            self.login()

    def login(self, account: Optional[str] = None, password: Optional[str] = None) -> "NB":
        account = account or self.account
        password = password or self.password
        r = self.s.post(f"{self.base}/api/auth:signIn",
                        json={"account": account, "password": password},
                        timeout=self._timeout)
        self.s.headers.update({"Authorization": f"Bearer {r.json()['data']['token']}"})
        return self

    # ── HTTP helpers (with timeout + error checking) ────────────

    def _get(self, path: str, **kwargs) -> requests.Response:
        """GET with timeout. Returns response (caller checks r.ok)."""
        kwargs.setdefault("timeout", self._timeout)
        return self.s.get(f"{self.base}/{path}", **kwargs)

    def _post(self, path: str, **kwargs) -> requests.Response:
        """POST with timeout. Returns response (caller checks r.ok)."""
        kwargs.setdefault("timeout", self._timeout)
        return self.s.post(f"{self.base}/{path}", **kwargs)

    def _get_json(self, path: str, **kwargs):
        """GET → parse data. Raises APIError on HTTP failure."""
        r = self._get(path, **kwargs)
        if not r.ok:
            raise APIError(r.status_code, r.text[:500], f"{self.base}/{path}")
        return r.json().get("data")

    def _post_json(self, path: str, **kwargs):
        """POST → parse data. Raises APIError on HTTP failure."""
        r = self._post(path, **kwargs)
        if not r.ok:
            raise APIError(r.status_code, r.text[:500], f"{self.base}/{path}")
        return r.json().get("data")

    # ── Metadata ────────────────────────────────────────────────

    def _load_meta(self, coll):
        if coll in self._field_cache:
            return
        fields = self._get_json(f"api/collections/{coll}/fields:list?pageSize=200") or []
        cache = {}
        for f in fields:
            info = {
                "interface": f.get("interface", "input"),
                "type": f.get("type", "string"),
                "target": f.get("target", ""),
                "title": f.get("uiSchema", {}).get("title", f["name"]),
            }
            # Capture enum options for select fields
            enums = f.get("uiSchema", {}).get("enum", [])
            if enums:
                info["enum"] = [
                    {"value": e.get("value", ""), "label": e.get("label", "")}
                    for e in enums if isinstance(e, dict)
                ]
            cache[f["name"]] = info
        self._field_cache[coll] = cache
        if not self._title_cache:
            colls = self._get_json("api/collections:list?paginate=false") or []
            for c in colls:
                tf = c.get("titleField")
                if not tf:
                    # No titleField set — will be resolved by _label() dynamically
                    tf = "id"
                self._title_cache[c["name"]] = tf
                self._coll_title_cache[c["name"]] = c.get("title", c["name"])

    def _visible_fields(self, coll):
        """Return user-visible field names (skip internal f_xxx, *Id, sort, id)."""
        schema = self._field_cache.get(coll, {})
        skip = {"id", "sort", "createdById", "updatedById"}
        return [f for f in schema
                if f not in skip
                and not f.startswith("f_")
                and not f.endswith("Id")
                and schema[f].get("interface") not in ("createdBy", "updatedBy")]

    def _check_field(self, coll, field):
        """Soft-validate field exists. Warns if not found, suggests similar names."""
        self._load_meta(coll)
        schema = self._field_cache.get(coll, {})
        if not schema or field in schema:
            return True
        visible = self._visible_fields(coll)
        similar = [f for f in visible if field in f or f in field]
        if not similar and len(field) >= 3:
            similar = [f for f in visible
                       if f[:3] == field[:3] or f[-4:] == field[-4:]]
        coll_label = self._coll_title_cache.get(coll, coll)
        if similar:
            hint = f" maybe: {similar}"
        else:
            hint = f" ({len(visible)} fields — use nb.fields('{coll}') to list)"
        msg = f"field '{field}' not in {coll_label}({coll}).{hint}"
        self.warnings.append(msg)
        return False

    def _valid_field(self, coll, field):
        """Check if field exists in collection metadata. No warnings."""
        self._load_meta(coll)
        schema = self._field_cache.get(coll, {})
        return not schema or field in schema

    def _valid_collection(self, coll):
        """Check if collection exists and has registered fields."""
        self._load_meta(coll)
        return bool(self._field_cache.get(coll))

    def _filter_valid_fields(self, coll, fields):
        """Filter field list to only existing fields. Returns (valid, skipped).

        Also validates relationship fields: m2o/m2m/o2m fields whose target
        collection doesn't exist are skipped (prevents rendering crashes like
        'Cannot read properties of undefined (reading filterTargetKey)').
        """
        self._load_meta(coll)
        schema = self._field_cache.get(coll, {})
        if not schema:
            return fields, []  # no metadata = allow all
        valid, skipped = [], []
        _relation_ifaces = {"m2o", "m2m", "o2m", "o2one", "obo", "oho"}
        for f in fields:
            if f not in schema:
                skipped.append(f)
                continue
            # Validate relation field target exists
            info = schema[f]
            if info.get("interface") in _relation_ifaces:
                target = info.get("target", "")
                if target and not self._valid_collection(target):
                    skipped.append(f)
                    self.warnings.append(
                        f"relation field '{f}' target '{target}' not found — skipped")
                    continue
            valid.append(f)
        if skipped:
            coll_label = self._coll_title_cache.get(coll, coll)
            self.warnings.append(
                f"skipped {len(skipped)} invalid fields in {coll_label}({coll}): {skipped}")
        return valid, skipped

    def _iface(self, coll, field):
        self._load_meta(coll)
        self._check_field(coll, field)
        return self._field_cache.get(coll, {}).get(field, {}).get("interface", "input")

    def _target(self, coll, field):
        self._load_meta(coll)
        return self._field_cache.get(coll, {}).get(field, {}).get("target", "")

    def _label(self, target_coll):
        self._load_meta(target_coll)
        tf = self._title_cache.get(target_coll)
        if tf and tf != "id":
            # Verify the titleField actually exists in the collection
            schema = self._field_cache.get(target_coll, {})
            if not schema or tf in schema:
                return tf
        # titleField missing or invalid — find a readable field
        schema = self._field_cache.get(target_coll, {})
        best = None
        for candidate in ("name", "title", "label", "subject", "code"):
            if candidate in schema and schema[candidate].get("interface") in ("input", "sequence"):
                best = candidate
                break
        if not best:
            # Last resort: first input field
            for fname, fmeta in schema.items():
                if (fmeta.get("interface") in ("input", "sequence")
                        and fname not in ("id",) and not fname.endswith("Id")):
                    best = fname
                    break
        if not best:
            return "id"
        # Auto-fix: set titleField on the collection so the UI also works
        if tf != best:
            try:
                self._put(f"api/collections:update?filterByTk={target_coll}",
                          {"titleField": best})
                self._title_cache[target_coll] = best
            except Exception:
                pass  # Non-fatal
        return best

    def fields(self, coll, all_fields=False):
        """Return collection field info for agents to inspect schema.

        Returns list of visible field names. Also prints schema for debugging.
        """
        self._load_meta(coll)
        schema = self._field_cache.get(coll, {})
        visible = sorted(schema.keys()) if all_fields else self._visible_fields(coll)
        coll_label = self._coll_title_cache.get(coll, coll)
        lines = [f"{coll_label} ({coll}) — {len(visible)} fields"]
        for name in sorted(visible):
            meta = schema[name]
            iface = meta.get("interface", "?")
            title = meta.get("title", "")
            target = meta.get("target", "")
            line = f"  {name:30s}  {iface:12s}  {title}"
            if target:
                line += f"  → {target}"
            lines.append(line)
        return "\n".join(lines)

    def _next_sort(self, parent):
        self._sort_counters.setdefault(parent, 0)
        s = self._sort_counters[parent]
        self._sort_counters[parent] += 1
        return s

    # ── Low-level FlowModel API ───────────────────────────────────

    def save(self, use: str, parent: str, sub_key: str, sub_type: str,
             sp: Optional[dict] = None, sort: int = 0, u: Optional[str] = None, **kw) -> str:
        u = u or uid()
        data = {"uid": u, "use": use, "parentId": parent,
                "subKey": sub_key, "subType": sub_type,
                "stepParams": sp or {}, "sortIndex": sort, "flowRegistry": {}, **kw}
        r = self._post("api/flowModels:save", json=data)
        if r.ok and r.json().get("data"):
            self.created += 1
        else:
            self.errors.append(f"{use}({u}): {r.text[:100]}")
        return u

    def update(self, u: str, patch: dict) -> bool:
        """Update existing FlowModel via flowModels:update (GET -> merge -> PUT).

        CRITICAL: flowModels:update is FULL REPLACE. Always GET first, deep merge,
        then PUT. Never send partial options.
        """
        r = self._get(f"api/flowModels:get?filterByTk={u}")
        if not r.ok:
            return False
        data = r.json().get("data", {})
        opts = {k: v for k, v in data.items() if k not in ("uid", "name")}
        deep_merge(opts, patch)
        r2 = self._post(f"api/flowModels:update?filterByTk={u}",
                        json={"options": opts})
        return r2.ok

    def destroy(self, u: str) -> None:
        self._post(f"api/flowModels:destroy?filterByTk={u}")

    def destroy_tree(self, u: str) -> int:
        descendants = self._collect_descendants(u)
        to_delete = descendants + [u]
        for uid_ in reversed(to_delete):
            self._post(f"api/flowModels:destroy?filterByTk={uid_}")
        self._invalidate_cache()
        return len(to_delete)

    def _list_all(self):
        if not hasattr(self, '_all_models_cache'):
            self._all_models_cache = self._get_json("api/flowModels:list?paginate=false") or []
        return self._all_models_cache

    def _invalidate_cache(self):
        if hasattr(self, '_all_models_cache'):
            del self._all_models_cache

    def _collect_descendants(self, root_uid):
        all_models = self._list_all()
        children_map = {}
        for m in all_models:
            pid = m.get("parentId")
            if pid:
                children_map.setdefault(pid, []).append(m["uid"])
        result = []
        queue = list(children_map.get(root_uid, []))
        while queue:
            uid_ = queue.pop(0)
            result.append(uid_)
            queue.extend(children_map.get(uid_, []))
        return result

    def clean_tab(self, tab_uid):
        to_delete = self._collect_descendants(tab_uid)
        for uid_ in reversed(to_delete):
            self._post(f"api/flowModels:destroy?filterByTk={uid_}")
        self._sort_counters.pop(tab_uid, None)
        self._invalidate_cache()
        return len(to_delete)

    # ── Tree API (batch save / retrieve) ─────────────────────────

    def save_tree(self, root, parent_uid: str,
                  sub_key: str = "grid", sub_type: str = "object",
                  filter_manager: Optional[list] = None) -> dict:
        """Flatten a TreeNode tree and save each node individually.

        Uses individual flowModels:save calls (flat format) which correctly
        preserves subType on each record. The nested subModels format was found
        to convert subType:"array" → "object", causing frontend render failures.

        Args:
            root: TreeNode (from tree_builder) to serialize
            parent_uid: UID of the parent FlowModel (e.g. tab UID)
            sub_key: sub key for the root node (default "grid")
            sub_type: sub type for the root node (default "object")
            filter_manager: optional filterManager array for the root node

        Returns:
            dict with save summary (created count, errors)
        """
        nodes = root.to_flat_list(parent_id=parent_uid, sub_key=sub_key, sub_type=sub_type)

        # Attach filterManager to root node
        if filter_manager:
            nodes[0]["filterManager"] = filter_manager

        saved = 0
        errors = []
        for node in nodes:
            r = self._post("api/flowModels:save", json=node)
            if r.ok and r.json().get("data"):
                saved += 1
                self.created += 1
            else:
                errors.append(f"{node['use']}({node['uid']}): {r.text[:100]}")
                self.errors.append(f"{node['use']}({node['uid']}): {r.text[:100]}")

        self._invalidate_cache()
        return {"saved": saved, "total": len(nodes), "errors": errors}

    def save_nested(self, root, parent_uid: str,
                    sub_key: str = "grid", sub_type: str = "object",
                    filter_manager: Optional[list] = None) -> dict:
        """Save entire tree in one flowModels:save call (nested subModels format).

        Uses to_dict() which now outputs direct array/object subModels
        (matching NocoBase client serialize()). Falls back to save_tree()
        on failure.

        Args:
            root: TreeNode to serialize
            parent_uid: UID of the parent FlowModel (e.g. tab UID)
            sub_key: sub key for the root node (default "grid")
            sub_type: sub type for the root node (default "object")
            filter_manager: optional filterManager array for the root node

        Returns:
            dict with save summary
        """
        data = root.to_dict(parent_id=parent_uid, sub_key=sub_key, sub_type=sub_type)
        if filter_manager:
            data["filterManager"] = filter_manager

        node_count = root.count_nodes()
        r = self._post("api/flowModels:save", json=data)
        if r.ok and r.json().get("data"):
            self.created += node_count
            self._invalidate_cache()
            return {"saved": node_count, "total": node_count, "errors": [],
                    "method": "nested"}

        # Fallback to flat save
        self.warnings.append(
            f"save_nested failed ({r.status_code}), falling back to save_tree")
        return self.save_tree(root, parent_uid, sub_key, sub_type, filter_manager)

    def save_tree_dict(self, tree_data: dict, parent_uid: str,
                       sub_key: str = "grid", sub_type: str = "object") -> dict:
        """Flatten a nested tree dict (with subModels) and save each node individually.

        This is for raw tree JSON dicts with nested subModels structure.
        Uses the same flat-save approach as save_tree() to preserve subType.

        Args:
            tree_data: Nested tree dict with optional subModels
            parent_uid: UID of the parent node
            sub_key: Sub key for root
            sub_type: Sub type for root

        Returns:
            dict with save summary
        """
        flat = []

        def _flatten(node: dict, pid: str | None, sk: str | None, st: str | None):
            rec = {
                "uid": node.get("uid", uid()),
                "use": node["use"],
                "stepParams": node.get("stepParams", {}),
                "sortIndex": node.get("sortIndex", 0),
                "flowRegistry": node.get("flowRegistry", {}),
            }
            if pid:
                rec["parentId"] = pid
            if sk:
                rec["subKey"] = sk
            if st:
                rec["subType"] = st
            if "filterManager" in node:
                rec["filterManager"] = node["filterManager"]
            flat.append(rec)

            for key, sub in node.get("subModels", {}).items():
                child_st = sub.get("subType", "object")
                data = sub.get("data")
                if data is None:
                    continue
                if isinstance(data, list):
                    for child in data:
                        _flatten(child, rec["uid"], key, child_st)
                elif isinstance(data, dict):
                    _flatten(data, rec["uid"], key, child_st)

        _flatten(tree_data, parent_uid, sub_key, sub_type)

        saved, errors = 0, []
        for node in flat:
            r = self._post("api/flowModels:save", json=node)
            if r.ok and r.json().get("data"):
                saved += 1
                self.created += 1
            else:
                errors.append(f"{node['use']}({node['uid']}): {r.text[:100]}")
                self.errors.append(errors[-1])

        self._invalidate_cache()
        return {"saved": saved, "total": len(flat), "errors": errors}

    def get_tree(self, parent_uid: str, sub_key: str = "grid") -> Optional[dict]:
        """GET complete FlowModel tree with nested subModels.

        Returns:
            Full tree dict with recursive subModels, or None if not found.
        """
        r = self._get(f"api/flowModels:findOne",
                      params={"parentId": parent_uid, "subKey": sub_key})
        if r.ok:
            return r.json().get("data")
        return None

    # ── Auto-infer primitives ───────────────────────────────────

    def col(self, tbl, coll, field, idx, click=False, width=None):
        iface = self._iface(coll, field)
        display = DISPLAY_MAP.get(iface, "DisplayTextFieldModel")
        cu, fu = uid(), uid()
        col_sp = {"fieldSettings": {"init": {"dataSourceKey": "main", "collectionName": coll, "fieldPath": field}},
                  "tableColumnSettings": {"model": {"use": display}}}
        if width:
            col_sp["tableColumnSettings"]["width"] = {"width": width}
        self.save("TableColumnModel", tbl, "columns", "array", col_sp, idx, cu)
        fsp = {"popupSettings": {"openView": {"collectionName": coll, "dataSourceKey": "main"}}}
        if iface == "m2o":
            t = self._target(coll, field)
            if t:
                fsp["displayFieldSettings"] = {"fieldNames": {"label": self._label(t)}}
        if click:
            fsp["popupSettings"]["openView"].update(
                {"mode": "drawer", "size": "large", "pageModelClass": "ChildPageModel", "uid": fu})
            fsp.setdefault("displayFieldSettings", {})["clickToOpen"] = {"clickToOpen": True}
        self.save(display, cu, "field", "object", fsp, 0, fu)
        return cu, fu

    def form_field(self, grid, coll, field, idx, required=False, default=None, props=None):
        iface = self._iface(coll, field)
        edit = EDIT_MAP.get(iface, "InputFieldModel")
        fi, ff = uid(), uid()
        props = props or {}
        sp = {"fieldSettings": {"init": {"dataSourceKey": "main", "collectionName": coll, "fieldPath": field}}}
        eis = {}
        if required:
            eis["required"] = {"required": True}
        dv = default if default is not None else props.get("defaultValue")
        if dv is not None:
            eis["initialValue"] = {"defaultValue": dv}
        if props.get("description"):
            eis["description"] = {"description": props["description"]}
        if props.get("tooltip"):
            eis["tooltip"] = {"tooltip": props["tooltip"]}
        if props.get("placeholder"):
            eis["placeholder"] = {"placeholder": props["placeholder"]}
        if props.get("hidden"):
            eis["hidden"] = {"hidden": True}
        if props.get("disabled"):
            eis["disabled"] = {"disabled": True}
        if props.get("pattern"):
            eis["pattern"] = {"pattern": props["pattern"]}
        if eis:
            sp["editItemSettings"] = eis
        self.save("FormItemModel", grid, "items", "array", sp, idx, fi)
        self.save(edit, fi, "field", "object", {}, 0, ff)
        return fi

    def detail_field(self, grid, coll, field, idx):
        iface = self._iface(coll, field)
        display = DISPLAY_MAP.get(iface, "DisplayTextFieldModel")
        di, df = uid(), uid()
        sp = {"fieldSettings": {"init": {"dataSourceKey": "main", "collectionName": coll, "fieldPath": field}},
              "detailItemSettings": {"model": {"use": display}}}
        if iface == "m2o":
            t = self._target(coll, field)
            if t:
                sp["detailItemSettings"]["fieldNames"] = {"label": self._label(t)}
        self.save("DetailsItemModel", grid, "items", "array", sp, idx, di)
        self.save(display, di, "field", "object", {}, 0, df)
        return di

    # ── Internal builders ──────────────────────────────────────

    def _build_form_grid(self, fg, coll, fields, required, props=None):
        """Build form fields with gridSettings (multi-column + sections)."""
        items, auto_req = _normalize_fields(fields)
        required = required | auto_req
        props = props or {}
        rows, sizes, sort_idx = {}, {}, 0

        for item in items:
            row_id = uid()
            if item["type"] == "divider":
                div_sp = {}
                if item.get("label"):
                    div_sp = {"markdownItemSetting": {"title": {
                        "label": item["label"], "orientation": "left",
                        "color": "rgba(0, 0, 0, 0.88)",
                        "borderColor": "rgba(5, 5, 5, 0.06)"}}}
                du = self.save("DividerItemModel", fg, "items", "array", div_sp, sort_idx)
                rows[row_id] = [[du]]
                sizes[row_id] = [24]
                sort_idx += 1
            elif item["type"] == "markdown":
                mu = self.save("MarkdownItemModel", fg, "items", "array", {
                    "markdownBlockSettings": {"editMarkdown": {"content": item["content"]}}
                }, sort_idx)
                rows[row_id] = [[mu]]
                sizes[row_id] = [24]
                sort_idx += 1
            elif item["type"] == "row":
                col_uids, col_sizes = [], []
                for field_name, span in item["cols"]:
                    fi = self.form_field(fg, coll, field_name, sort_idx,
                                         required=(field_name in required),
                                         props=props.get(field_name))
                    col_uids.append(fi)
                    col_sizes.append(span)
                    sort_idx += 1
                rows[row_id] = [[fi] for fi in col_uids]
                sizes[row_id] = col_sizes

        gs = {"gridSettings": {"grid": {"rows": rows, "sizes": sizes}}}
        self.update(fg, {"stepParams": gs})

    def _build_detail_grid(self, dg, coll, fields):
        """Build detail fields with gridSettings (multi-column + sections)."""
        items, _ = _normalize_fields(fields)
        rows, sizes, sort_idx = {}, {}, 0

        for item in items:
            row_id = uid()
            if item["type"] == "divider":
                div_sp = {}
                if item.get("label"):
                    div_sp = {"markdownItemSetting": {"title": {
                        "label": item["label"], "orientation": "left",
                        "color": "rgba(0, 0, 0, 0.88)",
                        "borderColor": "rgba(5, 5, 5, 0.06)"}}}
                du = self.save("DividerItemModel", dg, "items", "array", div_sp, sort_idx)
                rows[row_id] = [[du]]
                sizes[row_id] = [24]
                sort_idx += 1
            elif item["type"] == "markdown":
                mu = self.save("MarkdownItemModel", dg, "items", "array", {
                    "markdownBlockSettings": {"editMarkdown": {"content": item["content"]}}
                }, sort_idx)
                rows[row_id] = [[mu]]
                sizes[row_id] = [24]
                sort_idx += 1
            elif item["type"] == "row":
                col_uids, col_sizes = [], []
                for field_name, span in item["cols"]:
                    di = self.detail_field(dg, coll, field_name, sort_idx)
                    col_uids.append(di)
                    col_sizes.append(span)
                    sort_idx += 1
                rows[row_id] = [[di] for di in col_uids]
                sizes[row_id] = col_sizes

        gs = {"gridSettings": {"grid": {"rows": rows, "sizes": sizes}}}
        self.update(dg, {"stepParams": gs})

    def _build_block_grid(self, rows_spec):
        """Convert declarative row specs to gridSettings JSON.

        Each element is a row:
            (block_uid,)                          → full width
            [(uid1, 16), (uid2, 8)]               → multi-column
        """
        rows, sizes = {}, {}
        for row_spec in rows_spec:
            row_id = uid()
            if isinstance(row_spec, (str, tuple)):
                bu = row_spec[0] if isinstance(row_spec, tuple) else row_spec
                rows[row_id] = [[bu]]
                sizes[row_id] = [24]
            else:
                row_cols, row_sizes = [], []
                for col_def in row_spec:
                    col_blocks = [col_def[0]]
                    if len(col_def) > 2 and col_def[2]:
                        col_blocks.extend(col_def[2])
                    row_cols.append(col_blocks)
                    row_sizes.append(col_def[1] if len(col_def) > 1 else 24)
                rows[row_id] = row_cols
                sizes[row_id] = row_sizes
        return {"grid": {"rows": rows, "sizes": sizes}}

    def _build_tab_blocks(self, bg, coll, tab):
        """Build multiple blocks inside a BlockGridModel (details/js/sub_table)."""
        blocks = tab.get("blocks")
        if blocks is None:
            if "assoc" in tab:
                blocks = [{"type": "sub_table", "assoc": tab["assoc"],
                           "coll": tab["coll"], "fields": tab["fields"],
                           "title": tab.get("title")}]
            else:
                blocks = [{"type": "details", "fields": tab["fields"]}]

        block_uids = []
        for bi, blk in enumerate(blocks):
            btype = blk.get("type", "details")

            if btype == "details":
                det = self.save("DetailsBlockModel", bg, "items", "array", {
                    "resourceSettings": {"init": {"dataSourceKey": "main",
                                                  "collectionName": coll,
                                                  "filterByTk": "{{ctx.view.inputArgs.filterByTk}}"}},
                    **({"cardSettings": {"titleDescription": {"title": blk["title"]}}}
                       if blk.get("title") else {})
                }, bi)
                dg = self.save("DetailsGridModel", det, "grid", "object")
                self._build_detail_grid(dg, coll, blk["fields"])
                block_uids.append(det)

            elif btype == "js":
                sp = {"jsSettings": {"runJs": {"version": "v1", "code": blk.get("code", "")}}}
                if blk.get("title"):
                    sp["cardSettings"] = {"titleDescription": {"title": blk["title"]}}
                js_uid = self.save("JSBlockModel", bg, "items", "array", sp, bi)
                block_uids.append(js_uid)

            elif btype == "sub_table":
                tbl, an = self.sub_table(bg, coll, blk["assoc"], blk["coll"],
                                         blk["fields"], blk.get("title"))
                af = blk.get("addnew_fields") or blk["fields"]
                if af:
                    self.addnew_form(an, blk["coll"], af,
                                     required=[af[0]] if af else [])
                block_uids.append(tbl)

            elif btype == "form":
                fm = self.save("EditFormModel", bg, "items", "array", {
                    "resourceSettings": {"init": {"dataSourceKey": "main",
                                                  "collectionName": coll,
                                                  "filterByTk": "{{ctx.view.inputArgs.filterByTk}}"}}}, bi)
                self.save("FormSubmitActionModel", fm, "actions", "array", {}, 0)
                fg = self.save("FormGridModel", fm, "grid", "object")
                req = set(blk.get("required", []))
                self._build_form_grid(fg, coll, blk["fields"], req, props=blk.get("props"))
                block_uids.append(fm)

        # Multi-block layout
        tab_sizes = tab.get("sizes")
        if len(block_uids) > 1 or tab_sizes:
            row_id = uid()
            row_cols = [[bu] for bu in block_uids]
            if tab_sizes:
                gs = {"gridSettings": {"grid": {
                    "rows": {row_id: row_cols},
                    "sizes": {row_id: tab_sizes}}}}
            else:
                n = len(block_uids)
                auto = [24 // n] * n
                auto[-1] = 24 - sum(auto[:-1])
                gs = {"gridSettings": {"grid": {
                    "rows": {row_id: row_cols},
                    "sizes": {row_id: auto}}}}
            self.update(bg, {"stepParams": gs})

        return block_uids

    # ── High-level builders ────────────────────────────────────

    def group(self, title: str, parent_id: Optional[int] = None, icon: str = "appstoreoutlined") -> Optional[int]:
        """Create menu group (folder in sidebar). Returns group route id."""
        data = {"type": "group", "title": title, "icon": icon}
        if parent_id is not None:
            data["parentId"] = parent_id
        result = self._post_json("api/desktopRoutes:create", json=data)
        return (result or {}).get("id")

    def route(self, title: str, parent_id: int, icon: str = "appstoreoutlined",
              tabs: Optional[list] = None) -> tuple:
        """Create a page (flowPage) route. Returns (route_id, page_uid, tab_uid_or_dict)."""
        pu, mu = uid(), uid()
        if tabs:
            children, tu = [], {}
            for i, t in enumerate(tabs):
                u = uid()
                tu[t] = u
                children.append({"type": "tabs", "title": t, "schemaUid": u,
                                 "tabSchemaName": uid(), "hidden": i == 0})
            data = {"type": "flowPage", "title": title, "parentId": parent_id,
                    "schemaUid": pu, "menuSchemaUid": mu, "icon": icon,
                    "enableTabs": True, "children": children}
            result = self._post_json("api/desktopRoutes:create", json=data)
            self._post("api/uiSchemas:insert",
                       json={"type": "void", "x-component": "FlowRoute", "x-uid": pu})
            rid = (result or {}).get("id")
            return rid, pu, tu
        else:
            tu = uid()
            data = {"type": "flowPage", "title": title, "parentId": parent_id,
                    "schemaUid": pu, "menuSchemaUid": mu, "icon": icon,
                    "enableTabs": False,
                    "children": [{"type": "tabs", "schemaUid": tu, "tabSchemaName": uid(), "hidden": True}]}
            result = self._post_json("api/desktopRoutes:create", json=data)
            self._post("api/uiSchemas:insert",
                       json={"type": "void", "x-component": "FlowRoute", "x-uid": pu})
            rid = (result or {}).get("id")
            return rid, pu, tu

    def menu(self, group_title: str, parent_id: int, pages: list,
             *, group_icon: str = "appstoreoutlined") -> dict:
        """Create a menu group with child pages. Returns dict {group_id, title: tab_uid}."""
        gid = self.group(group_title, parent_id, icon=group_icon)
        tabs = {"group_id": gid}
        for item in pages:
            if isinstance(item, str):
                title, icon = item, "fileoutlined"
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                title, icon = item[0], item[1]
            else:
                title, icon = str(item), "fileoutlined"
            _, _, tu = self.route(title, gid, icon=icon)
            tabs[title] = tu
        return tabs

    def table_block(self, parent: str, coll: str, fields: list, first_click: bool = True,
                    title: Optional[str] = None, sort: Optional[int] = None,
                    link_actions: Optional[list] = None) -> tuple:
        """Create standalone TableBlockModel. Returns (tbl, addnew, actcol)."""
        if sort is None:
            sort = self._next_sort(parent)
        sp = {"resourceSettings": {"init": {"dataSourceKey": "main", "collectionName": coll}},
              "tableSettings": {"defaultSorting": {"sort": [{"field": "createdAt", "direction": "desc"}]}}}
        if title:
            sp["cardSettings"] = {"titleDescription": {"title": title}}
        tbl = self.save("TableBlockModel", parent, "items", "array", sp, sort)
        self.save("FilterActionModel", tbl, "actions", "array", {}, 1)
        self.save("RefreshActionModel", tbl, "actions", "array", {}, 2)
        addnew = self.save("AddNewActionModel", tbl, "actions", "array", {
            "popupSettings": {"openView": {"collectionName": coll, "dataSourceKey": "main",
                                           "mode": "drawer", "size": "large", "pageModelClass": "ChildPageModel"}}}, 3)
        if link_actions:
            for li, la in enumerate(link_actions):
                self.save("LinkActionModel", tbl, "actions", "array", {
                    "buttonSettings": {"general": {"title": la["title"], "type": "default",
                                                    **({"icon": la.get("icon")} if la.get("icon") else {})}}
                }, 4 + li)
        for i, f in enumerate(fields):
            self.col(tbl, coll, f, i + 1, click=(first_click and i == 0))
        actcol = self.save("TableActionsColumnModel", tbl, "columns", "array", {
            "tableColumnSettings": {"title": {"title": '{{t("Actions")}}'}, "fixed": {"fixed": "left"}}}, 99)
        return tbl, addnew, actcol

    def filter_form(self, parent: str, coll: str, field: str = "name",
                    target_uid: Optional[str] = None, sort: Optional[int] = None,
                    label: str = "Search", search_fields: Optional[list] = None) -> tuple:
        """Create FilterFormBlock with single search input. Returns (filter_block_uid, filter_item_uid)."""
        if sort is None:
            sort = self._next_sort(parent)
        fb = self.save("FilterFormBlockModel", parent, "items", "array", {
            "formFilterBlockModelSettings": {"layout": {
                "layout": "horizontal", "labelAlign": "left",
                "labelWidth": 100, "labelWrap": False, "colon": True}},
        }, sort)
        fg = self.save("FilterFormGridModel", fb, "grid", "object")
        self._load_meta(coll)
        field_meta = self._field_cache.get(coll, {}).get(field, {})
        fi_sp = {
            "fieldSettings": {"init": {"dataSourceKey": "main",
                                       "collectionName": coll, "fieldPath": field}},
            "filterFormItemSettings": {
                "init": {
                    "filterField": {
                        "name": field,
                        "title": field.replace("_", " ").title(),
                        "interface": field_meta.get("interface", "input"),
                        "type": field_meta.get("type", "string"),
                    },
                    **({"defaultTargetUid": target_uid} if target_uid else {}),
                },
                "showLabel": {"showLabel": True},
                "label": {"label": label},
            },
        }
        fi = self.save("FilterFormItemModel", fg, "items", "array", fi_sp, 10)
        self.save("InputFieldModel", fi, "field", "object", {}, 0)

        if target_uid:
            paths = search_fields or [field]
            self._filter_mappings = getattr(self, '_filter_mappings', {})
            self._filter_mappings.setdefault(parent, []).append({
                "filterId": fi, "targetId": target_uid, "filterPaths": paths})

        return fb, fi

    def page_layout(self, tab_uid: str) -> str:
        """Create BlockGridModel for multi-block page. Returns grid UID."""
        self.clean_tab(tab_uid)
        return self.save("BlockGridModel", tab_uid, "grid", "object")

    def set_layout(self, grid_uid: str, rows_spec: list) -> None:
        """Set gridSettings on an existing BlockGridModel. Also writes filterManager.

        NOTE: This REPLACES gridSettings entirely (not merge) to avoid stale rows
        from deep_merge accumulating old row IDs alongside new ones.
        """
        gs = self._build_block_grid(rows_spec)
        # Full replace: GET → force-set gridSettings → PUT
        r = self._get(f"api/flowModels:get?filterByTk={grid_uid}")
        if r.ok:
            data = r.json().get("data", {})
            opts = {k: v for k, v in data.items() if k not in ("uid", "name")}
            sp = opts.get("stepParams", {})
            sp["gridSettings"] = gs  # Full replace, not merge
            opts["stepParams"] = sp
            self._post(f"api/flowModels:update?filterByTk={grid_uid}",
                       json={"options": opts})

        fm = getattr(self, '_filter_mappings', {}).get(grid_uid, [])
        if fm:
            self._post("api/flowModels:save",
                       json={"uid": grid_uid, "filterManager": fm})

    def sub_table(self, parent_grid: str, parent_coll: str, assoc: str,
                  target_coll: str, fields: list, title: Optional[str] = None) -> tuple:
        """Create association sub-table. Returns (tbl, addnew)."""
        tbl = self.save("TableBlockModel", parent_grid, "items", "array", {
            "resourceSettings": {"init": {"dataSourceKey": "main", "collectionName": target_coll,
                                          "associationName": f"{parent_coll}.{assoc}",
                                          "sourceId": "{{ctx.view.inputArgs.filterByTk}}"}},
            **({"cardSettings": {"titleDescription": {"title": title}}} if title else {})})
        self.save("RefreshActionModel", tbl, "actions", "array", {}, 2)
        addnew = self.save("AddNewActionModel", tbl, "actions", "array", {
            "popupSettings": {"openView": {"collectionName": target_coll, "dataSourceKey": "main",
                                           "mode": "dialog", "size": "small", "pageModelClass": "ChildPageModel"}}}, 3)
        for i, f in enumerate(fields):
            self.col(tbl, target_coll, f, i + 1)
        self.save("TableActionsColumnModel", tbl, "columns", "array", {
            "tableColumnSettings": {"title": {"title": '{{t("Actions")}}'}, "fixed": {"fixed": "left"}}}, 99)
        return tbl, addnew

    def addnew_form(self, addnew_uid: str, coll: str, fields, required: Optional[list] = None,
                    props: Optional[dict] = None, mode: str = "drawer", size: str = "large") -> str:
        """Create form under AddNew popup. Returns childpage UID."""
        req = set(required or [])
        self.update(addnew_uid, {"stepParams": {"popupSettings": {"openView": {
            "collectionName": coll, "dataSourceKey": "main",
            "mode": mode, "size": size, "pageModelClass": "ChildPageModel"}}}})
        cp = self.save("ChildPageModel", addnew_uid, "page", "object",
                       {"pageSettings": {"general": {"displayTitle": False, "enableTabs": False}}})
        ct = self.save("ChildPageTabModel", cp, "tabs", "array",
                       {"pageTabSettings": {"tab": {"title": "New"}}})
        bg = self.save("BlockGridModel", ct, "grid", "object")
        fm = self.save("CreateFormModel", bg, "items", "array",
                       {"resourceSettings": {"init": {"dataSourceKey": "main", "collectionName": coll}}})
        self.save("FormSubmitActionModel", fm, "actions", "array", {}, 0)
        fg = self.save("FormGridModel", fm, "grid", "object")
        self._build_form_grid(fg, coll, fields, req, props=props)
        self._last_create_form = fm
        return cp

    def edit_action(self, actcol: str, coll: str, fields, required: Optional[list] = None,
                    props: Optional[dict] = None, mode: str = "drawer", size: str = "large") -> str:
        """Create Edit action + form. Returns edit action UID."""
        req = set(required or [])
        ea = self.save("EditActionModel", actcol, "actions", "array", {
            "popupSettings": {"openView": {"collectionName": coll, "dataSourceKey": "main",
                                           "mode": mode, "size": size, "pageModelClass": "ChildPageModel",
                                           "filterByTk": "{{ ctx.record.id }}"}},
            "buttonSettings": {"general": {"title": "Edit", "icon": "EditOutlined", "type": "link"}}}, 0)
        cp = self.save("ChildPageModel", ea, "page", "object",
                       {"pageSettings": {"general": {"displayTitle": False, "enableTabs": False}}})
        ct = self.save("ChildPageTabModel", cp, "tabs", "array",
                       {"pageTabSettings": {"tab": {"title": "Edit"}}})
        bg = self.save("BlockGridModel", ct, "grid", "object")
        fm = self.save("EditFormModel", bg, "items", "array", {
            "resourceSettings": {"init": {"dataSourceKey": "main", "collectionName": coll,
                                          "filterByTk": "{{ctx.view.inputArgs.filterByTk}}"}}})
        self.save("FormSubmitActionModel", fm, "actions", "array", {}, 0)
        fg = self.save("FormGridModel", fm, "grid", "object")
        self._build_form_grid(fg, coll, fields, req, props=props)
        self._last_edit_form = fm
        return ea

    def detail_popup(self, parent_uid: str, coll: str, tabs: list,
                     mode: str = "drawer", size: str = "large") -> str:
        """Multi-tab detail popup. Returns childpage UID."""
        self.update(parent_uid, {"stepParams": {"popupSettings": {"openView": {
            "collectionName": coll, "dataSourceKey": "main",
            "mode": mode, "size": size,
            "pageModelClass": "ChildPageModel", "uid": parent_uid}}}})
        enable_tabs = len(tabs) > 1
        cp = self.save("ChildPageModel", parent_uid, "page", "object",
                       {"pageSettings": {"general": {"displayTitle": False, "enableTabs": enable_tabs}}})
        for ti, tab in enumerate(tabs):
            ct = self.save("ChildPageTabModel", cp, "tabs", "array",
                           {"pageTabSettings": {"tab": {"title": tab["title"]}}}, ti)
            bg = self.save("BlockGridModel", ct, "grid", "object")
            self._build_tab_blocks(bg, coll, tab)
        return cp

    # ── JS blocks ──────────────────────────────────────────────

    def js_block(self, parent_grid: str, title: str, code: str, sort: Optional[int] = None) -> str:
        """Create page-level JSBlockModel."""
        if sort is None:
            sort = self._next_sort(parent_grid)
        sp = {"jsSettings": {"runJs": {"version": "v1", "code": code}},
              "cardSettings": {"titleDescription": {"title": title}}}
        return self.save("JSBlockModel", parent_grid, "items", "array", sp, sort)

    def js_column(self, table_uid: str, title: str, code: str, sort: int = 50,
                  width: Optional[int] = None) -> str:
        """Create JSColumnModel in table."""
        sp = {"jsSettings": {"runJs": {"version": "v1", "code": code}},
              "tableColumnSettings": {"title": {"title": title}}}
        if width:
            sp["tableColumnSettings"]["width"] = {"width": width}
        return self.save("JSColumnModel", table_uid, "columns", "array", sp, sort)

    def js_item(self, form_grid: str, title: str, code: str, sort: int = 0) -> str:
        """Create JSItemModel in form/details."""
        sp = {"jsSettings": {"runJs": {"version": "v1", "code": code}},
              "editItemSettings": {"showLabel": {"showLabel": True, "title": title}}}
        return self.save("JSItemModel", form_grid, "items", "array", sp, sort)

    # ── KPI ────────────────────────────────────────────────────

    def _generate_kpi_code(self, title: str, coll: str,
                           filter_: Optional[dict] = None,
                           color: Optional[str] = None) -> str:
        """Generate JS code for a KPI Statistic card (no HTTP, pure string)."""
        filter_js = ""
        date_preamble = ""
        if filter_:
            processed = {}
            has_this_month = False
            for k, v in filter_.items():
                field = k.replace(".$dateOn", "")
                if v == "thisMonth" or (isinstance(v, dict) and v.get("$dateOn") == "thisMonth"):
                    has_this_month = True
                    processed[field] = {"$dateBetween": ["__MONTH_START__", "__MONTH_END__"]}
                else:
                    processed[k] = v
            if has_this_month:
                date_preamble = (
                    "    const _now = new Date();\n"
                    "    const _ms = new Date(_now.getFullYear(), _now.getMonth(), 1).toISOString();\n"
                    "    const _me = new Date(_now.getFullYear(), _now.getMonth() + 1, 0, 23, 59, 59).toISOString();\n"
                )
                raw = json.dumps(processed)
                raw = raw.replace('"__MONTH_START__"', "_ms").replace('"__MONTH_END__"', "_me")
                filter_js = f", filter: {raw}"
            else:
                filter_js = f", filter: {json.dumps(processed)}"
        color_js = f", color:'{color}'" if color else ""
        # NOTE: card title is set via cardSettings — JS only renders the value.
        # Do NOT add title to Statistic, it would duplicate the card title.
        return f"""(async () => {{
  try {{
{date_preamble}    const r = await ctx.api.request({{
      url: '{coll}:list',
      params: {{ paginate: false{filter_js} }}
    }});
    const count = Array.isArray(r?.data?.data) ? r.data.data.length
                : Array.isArray(r?.data) ? r.data.length : 0;
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {{
      value: count,
      valueStyle: {{ fontSize: 28{color_js} }}
    }}));
  }} catch(e) {{
    ctx.render(ctx.React.createElement(ctx.antd.Statistic, {{
      value: '?', valueStyle: {{ fontSize: 28 }}
    }}));
  }}
}})();"""

    def kpi(self, parent: str, title: str, coll: str, filter_: Optional[dict] = None,
            color: Optional[str] = None, sort: Optional[int] = None) -> str:
        """Create a KPI card that queries API and shows count."""
        code = self._generate_kpi_code(title, coll, filter_, color)
        return self.js_block(parent, title, code, sort)

    def _generate_stats_filter_code(self, coll: str, stats_field: str,
                                     target_uid: str) -> str:
        """Generate JS code for clickable stat filter badges inside a FilterFormBlock.

        Uses ctx.engine.getModel(targetUid).resource.addFilterGroup() to filter the table.
        Auto-generates 'All' + one button per enum value from the stats_field's enum config.
        """
        # Read enum directly from API (field cache may not include uiSchema)
        raw_fields = self._get_json(
            f"api/collections/{coll}/fields:list?paginate=false") or []
        field_meta = next((f for f in raw_fields if f.get("name") == stats_field), {})
        ui = field_meta.get("uiSchema", {})
        enum_list = ui.get("enum", [])

        # Build STATS array entries
        stats_entries = ["  { key: 'all', label: 'All', filter: null }"]
        for item in enum_list:
            val = item.get("value", "")
            label = item.get("label", val)
            if val:
                stats_entries.append(
                    "  { key: '" + val + "', label: '" + label + "', "
                    "filter: { " + stats_field + ": '" + val + "' } }"
                )

        stats_js = ",\n".join(stats_entries)

        # Build JS code via string concat to avoid f-string/JSX brace conflicts
        lines = [
            "const TARGET = '" + target_uid + "';",
            "const COLL = '" + coll + "';",
            "const { useState, useEffect } = ctx.React;",
            "const { Button, Badge, Space, Spin } = ctx.antd;",
            "const STATS = [",
            stats_js,
            "];",
            "function useStats() {",
            "  const [counts, setCounts] = useState({});",
            "  const [loading, setLoading] = useState(true);",
            "  useEffect(() => {",
            "    (async () => {",
            "      try {",
            "        const results = await Promise.all(",
            "          STATS.map(s => ctx.api.request({",
            "            url: COLL + ':list',",
            "            params: { pageSize: 1, ...(s.filter && { filter: s.filter }) },",
            "          }))",
            "        );",
            "        const c = {};",
            "        STATS.forEach((s, i) => { c[s.key] = results[i]?.data?.meta?.count ?? 0; });",
            "        setCounts(c);",
            "      } catch (e) { console.error(e); }",
            "      setLoading(false);",
            "    })();",
            "  }, []);",
            "  return { counts, loading };",
            "}",
            "const StatsFilter = () => {",
            "  const { counts, loading } = useStats();",
            "  const [active, setActive] = useState('all');",
            "  const handleClick = async (stat) => {",
            "    setActive(stat.key);",
            "    try {",
            "      const target = ctx.engine?.getModel(TARGET);",
            "      if (!target) return;",
            "      const f = stat.filter || { $and: [] };",
            "      target.resource.addFilterGroup(ctx.model.uid, f);",
            "      await target.resource.refresh();",
            "    } catch (e) { console.error(e); }",
            "  };",
            "  if (loading) return <Spin size=\"small\" />;",
            "  return (",
            "    <Space wrap size={[6, 6]}>",
            "      {STATS.map(s => {",
            "        const isActive = active === s.key;",
            "        const count = counts[s.key] ?? 0;",
            "        return (",
            "          <Button key={s.key}",
            "            type={isActive ? 'primary' : 'default'}",
            "            onClick={() => handleClick(s)}>",
            "            {s.label}",
            "            <Badge count={count} showZero overflowCount={9999}",
            "              style={{ marginLeft: 6,",
            "                backgroundColor: isActive ? '#fff' : '#f0f0f0',",
            "                color: isActive ? '#1677ff' : 'rgba(0,0,0,0.65)',",
            "                boxShadow: 'none',",
            "                fontSize: 12, height: 18, lineHeight: '18px', minWidth: 18,",
            "              }} />",
            "          </Button>",
            "        );",
            "      })}",
            "    </Space>",
            "  );",
            "};",
            "ctx.render(<StatsFilter />);",
        ]
        return "\n".join(lines)

    # ── Event flows ────────────────────────────────────────────

    def event_flow(self, model_uid: str, event_name: str, code: str) -> Optional[str]:
        """Add event flow (runjs step) to an existing FlowModel node."""
        r = self._get(f"api/flowModels:get?filterByTk={model_uid}")
        if not r.ok:
            self.errors.append(f"event_flow GET {model_uid}: {r.text[:100]}")
            return None
        data = r.json().get("data", {})
        registry = data.get("flowRegistry", {}) or {}

        flow_key, step_key = uid(), uid()
        registry[flow_key] = {
            "key": flow_key, "title": "Event flow",
            "on": {"eventName": event_name,
                   "defaultParams": {"condition": {"items": [], "logic": "$and"}}},
            "steps": {step_key: {
                "key": step_key, "use": "runjs", "sort": 1,
                "flowKey": flow_key, "defaultParams": {"code": code}}},
        }
        self.update(model_uid, {"flowRegistry": registry})
        return flow_key

    def form_logic(self, form_uid: str, description: str, code: Optional[str] = None) -> Optional[str]:
        """Add formValuesChange event flow."""
        if code is None:
            code = "// Form Logic — formValuesChange\n"
            code += f"// {'=' * 50}\n"
            for line in description.strip().splitlines():
                code += f"// {line.strip()}\n"
            code += f"// {'=' * 50}\n\n"
            code += ("(async () => {\n"
                     "  const values = ctx.form?.values || {};\n"
                     "  // TODO: Implement form logic\n"
                     "  console.log('Form values changed:', Object.keys(values));\n"
                     "})();")
        return self.event_flow(form_uid, "formValuesChange", code)

    def before_render(self, model_uid: str, description: str, code: Optional[str] = None) -> Optional[str]:
        """Add beforeRender event flow."""
        if code is None:
            code = "// beforeRender\n"
            for line in description.strip().splitlines():
                code += f"// {line.strip()}\n"
            code += "\nctx.model.setFieldsValue(ctx.defaultValues);"
        return self.event_flow(model_uid, "beforeRender", code)

    # ── Outline (planning placeholders) ────────────────────────

    def _outline_code(self, title: str, ctx_info: dict) -> str:
        """Generate JS code for an outline placeholder block."""
        u = uid()
        ctx_info_with_uid = {"__outline__": True, "uid": u, **ctx_info}
        info_json = json.dumps(ctx_info_with_uid, ensure_ascii=False, indent=2)
        icon = "\U0001f4cb"
        return (
            "const h = ctx.React.createElement;\n"
            f"const info = {info_json};\n"
            "const entries = Object.entries(info);\n"
            "const tk = ctx.themeToken || {};\n"
            "ctx.render(h('div', {style: {"
            "padding: 10, borderRadius: 6, fontSize: 12, lineHeight: '20px', "
            "background: tk.colorBgLayout || '#f5f5f5', "
            "border: '1px dashed ' + (tk.colorBorder || '#d9d9d9')"
            "}},\n"
            "  h('div', {style: {fontWeight: 600, fontSize: 13, marginBottom: 4, "
            "color: tk.colorPrimary || '#1890ff'}}, "
            f"'{icon} {title}'),\n"
            "  ...entries.map(([k,v]) => h('div', {key: k, style: {"
            "color: tk.colorTextSecondary || '#888'}},\n"
            "    h('span', {style: {fontWeight: 500, color: tk.colorText || '#333', "
            "marginRight: 4}}, k + ':'),\n"
            "    h('span', null, typeof v === 'object' ? JSON.stringify(v) : String(v))\n"
            "  ))\n"
            "));"
        )

    def outline(self, parent: str, title: str, ctx_info: dict, sort: Optional[int] = None,
                kind: str = "block") -> str:
        """Create JS block/column/item that displays a planning outline on the page.

        The outline shows all context needed for later implementation by AI/human.
        The block's own UID is auto-injected into the rendered output.

        Args:
            parent:   parent UID (grid for block, table for column, form grid for item)
            title:    display title
            ctx_info: dict of context info to render
            sort:     sort index (auto-increment if None)
            kind:     "block" (JSBlockModel) | "column" (JSColumnModel) | "item" (JSItemModel)

        Returns: UID of created block
        """
        code = self._outline_code(title, ctx_info)

        if kind == "column":
            return self.js_column(parent, title, code, sort or 50, width=120)
        elif kind == "item":
            return self.js_item(parent, title, code, sort or 0)
        else:
            block_uid = self.js_block(parent, title, code, sort)
            # Auto-append to gridSettings so the block is visible in the layout.
            # Groups blocks 2 per row (span=12+12) for a Dashboard-style layout.
            self._append_to_grid(parent, block_uid)
            return block_uid

    def _append_to_grid(self, grid_uid: str, block_uid: str, span: int = 12) -> None:
        """Append a block to an existing grid's gridSettings.

        Smart grouping: tries to pair blocks into 2-column rows (span=12+12)
        instead of creating one full-width row per block. This produces a
        Dashboard-style layout instead of monotonous vertical stacking.
        """
        items = self._get_json("api/flowModels:list?paginate=false") or []
        for it in items:
            if it.get("uid") == grid_uid:
                gs = it.get("stepParams", {}).get("gridSettings", {})
                grid = gs.get("grid", {})
                rows = grid.get("rows", {})
                sizes = grid.get("sizes", {})

                # Try to find last row with exactly 1 col of span<=12 to pair with
                last_row_id = None
                if rows:
                    # Rows are ordered by insertion; find the last one
                    row_ids = list(rows.keys())
                    candidate = row_ids[-1]
                    candidate_cols = rows[candidate]
                    candidate_sizes = sizes.get(candidate, [24])
                    # Pair if: 1 column, span <= 12, and it's a single-block column
                    if (len(candidate_cols) == 1 and len(candidate_sizes) == 1
                            and candidate_sizes[0] <= 12
                            and len(candidate_cols[0]) == 1):
                        last_row_id = candidate

                if last_row_id:
                    # Add as 2nd column in existing row
                    rows[last_row_id].append([block_uid])
                    sizes[last_row_id].append(span)
                else:
                    # Create new row
                    row_id = uid()
                    rows[row_id] = [[block_uid]]
                    sizes[row_id] = [span]

                self.update(grid_uid, {"stepParams": {"gridSettings": {"grid": {"rows": rows, "sizes": sizes}}}})
                return

    def outline_row(self, parent, *specs):
        """Create multiple outline blocks. Returns list of UIDs.
        specs: (title, ctx_info_dict) tuples.
        """
        return [self.outline(parent, t, c) for t, c in specs]

    def outline_columns(self, table_uid, *specs):
        """Plan multiple JS columns for a table. Returns list of UIDs.
        specs: (title, ctx_info_dict) tuples.
        """
        return [self.outline(table_uid, t, c, kind="column") for t, c in specs]

    # ── Find helpers ───────────────────────────────────────────

    def find_click_field(self, tbl_uid: str, field_name: str = "name") -> Optional[str]:
        """Find the DisplayFieldModel UID of a click-to-open column."""
        items = self._get_json("api/flowModels:list?paginate=false") or []
        for it in items:
            if it.get("parentId") == tbl_uid and it.get("use") == "TableColumnModel":
                fp = it.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath")
                if fp == field_name:
                    for ch in items:
                        if ch.get("parentId") == it["uid"] and "Display" in (ch.get("use") or ""):
                            return ch["uid"]
        return None

    # ── JS update / outline discovery ─────────────────────────

    def update_js(self, uid_: str, code: str, title: str | None = None) -> bool:
        """Update JS code on an existing JSBlockModel/JSColumnModel/JSItemModel.

        Uses GET → merge → PUT pattern. Handles different stepParams structures
        per model type.
        """
        data = self._get_json(f"api/flowModels:get?filterByTk={uid_}")
        if not data:
            return False
        use = data.get("use", "")
        patch: dict = {"stepParams": {"jsSettings": {"runJs": {"code": code, "version": "v1"}}}}
        if title:
            if use == "JSBlockModel":
                patch["stepParams"]["cardSettings"] = {"titleDescription": {"title": title}}
            elif use == "JSColumnModel":
                patch["stepParams"]["tableColumnSettings"] = {"title": {"title": title}}
            elif use == "JSItemModel":
                patch["stepParams"]["editItemSettings"] = {"showLabel": {"showLabel": True, "title": title}}
        return self.update(uid_, patch)

    def find_outlines(self, scope: str) -> list[dict]:
        """Find outline placeholders under a tab UID or by scanning menu prefix.

        Args:
            scope: Tab UID, or a title prefix to match across all pages (e.g. "CRM")

        Returns:
            List of dicts with uid, use, title, ctx_info, parent_uid, collection info.
        """
        all_models = self._list_all()

        # Build parent→children map and uid→model lookup
        uid_map = {m["uid"]: m for m in all_models}

        # Determine target UIDs: either descendants of scope UID, or all
        target_uids = None
        if scope in uid_map:
            # scope is a specific tab UID — collect all descendants
            target_uids = set(self._collect_descendants(scope))
            target_uids.add(scope)
        else:
            # scope is a prefix — find matching routes then collect tab UIDs
            try:
                routes = self._get_json("api/desktopRoutes:list?paginate=false") or []
                tab_uids = set()
                for rt in routes:
                    if rt.get("title", "").startswith(scope):
                        su = rt.get("schemaUid")
                        if su:
                            tab_uids.add(su)
                        for child in rt.get("children", []):
                            csu = child.get("schemaUid")
                            if csu:
                                tab_uids.add(csu)
                if tab_uids:
                    target_uids = set()
                    for tu in tab_uids:
                        target_uids.add(tu)
                        target_uids.update(self._collect_descendants(tu))
            except Exception:
                pass  # Fall through to scan all

        results = []
        for m in all_models:
            if target_uids is not None and m["uid"] not in target_uids:
                continue
            sp = m.get("stepParams", {})
            code = sp.get("jsSettings", {}).get("runJs", {}).get("code", "")
            if "__outline__" not in code:
                continue

            # Extract ctx_info from the JS code (it's a JSON object in the code)
            ctx_info = {}
            try:
                # The outline code has: const info = {...};
                import re
                match = re.search(r'const info = (\{.*?\});', code, re.DOTALL)
                if match:
                    ctx_info = json.loads(match.group(1))
            except Exception:
                pass

            # Determine title from stepParams
            use = m.get("use", "")
            title = ""
            if use == "JSBlockModel":
                title = sp.get("cardSettings", {}).get("titleDescription", {}).get("title", "")
            elif use == "JSColumnModel":
                title = sp.get("tableColumnSettings", {}).get("title", {}).get("title", "")
            elif use == "JSItemModel":
                title = sp.get("editItemSettings", {}).get("showLabel", {}).get("title", "")

            # Find collection context from parent chain
            collection = ""
            parent_uid = m.get("parentId", "")
            visited = set()
            p = parent_uid
            while p and p not in visited:
                visited.add(p)
                pm = uid_map.get(p)
                if not pm:
                    break
                rs = pm.get("stepParams", {}).get("resourceSettings", {}).get("init", {})
                if rs.get("collectionName"):
                    collection = rs["collectionName"]
                    break
                p = pm.get("parentId", "")

            results.append({
                "uid": m["uid"],
                "use": use,
                "title": title,
                "ctx_info": ctx_info,
                "parent_uid": parent_uid,
                "collection": collection,
            })

        return results

    # ── Form refinement ────────────────────────────────────────

    def _find_children_by_use(self, parent_uid: str, use: str,
                               all_models: list | None = None) -> list[dict]:
        """Find direct children of parent_uid with given use."""
        if all_models is None:
            all_models = self._list_all()
        return [m for m in all_models
                if m.get("parentId") == parent_uid and m.get("use") == use]

    def _find_child_uid(self, parent_uid: str, use: str,
                         all_models: list | None = None) -> str | None:
        """Find first direct child UID with given use."""
        children = self._find_children_by_use(parent_uid, use, all_models)
        return children[0]["uid"] if children else None

    def _get_table_collection(self, table_uid: str,
                               all_models: list | None = None) -> str:
        """Get collection name from a TableBlockModel's stepParams."""
        if all_models is None:
            all_models = self._list_all()
        uid_map = {m["uid"]: m for m in all_models}
        tbl = uid_map.get(table_uid)
        if not tbl:
            raise ValueError(f"TableBlockModel {table_uid} not found")
        return tbl.get("stepParams", {}).get("resourceSettings", {}).get(
            "init", {}).get("collectionName", "")

    def _find_click_field_uid(self, table_uid: str,
                               all_models: list | None = None) -> str | None:
        """Find the first column's DisplayFieldModel that has clickToOpen."""
        if all_models is None:
            all_models = self._list_all()
        cols = [m for m in all_models
                if m.get("parentId") == table_uid
                and m.get("use") == "TableColumnModel"]
        cols.sort(key=lambda m: m.get("sortIndex", 999))
        for col in cols:
            fields = [m for m in all_models
                      if m.get("parentId") == col["uid"]
                      and "FieldModel" in m.get("use", "")
                      and "Display" in m.get("use", "")]
            for f in fields:
                sp = f.get("stepParams", {})
                cto = sp.get("displayFieldSettings", {}).get("clickToOpen", {})
                if cto.get("clickToOpen"):
                    return f["uid"]
        return None

    def _enable_first_click(self, table_uid: str, coll: str,
                             all_models: list) -> str | None:
        """Auto-enable clickToOpen on the first column's DisplayFieldModel.

        When a page is rebuilt (e.g. via nb_compose_page), JS columns may replace
        the original first column, losing the clickToOpen setting. This method
        finds the first TableColumnModel with a DisplayFieldModel child and
        enables clickToOpen + popupSettings on it.

        Returns the DisplayFieldModel UID, or None if no suitable column found.
        """
        cols = [m for m in all_models
                if m.get("parentId") == table_uid
                and m.get("use") == "TableColumnModel"]
        cols.sort(key=lambda m: m.get("sortIndex", 999))
        for col in cols:
            fields = [m for m in all_models
                      if m.get("parentId") == col["uid"]
                      and "FieldModel" in m.get("use", "")
                      and "Display" in m.get("use", "")]
            if fields:
                f = fields[0]
                # Enable clickToOpen + popupSettings
                self.update(f["uid"], {"stepParams": {
                    "displayFieldSettings": {"clickToOpen": {"clickToOpen": True}},
                    "popupSettings": {"openView": {
                        "collectionName": coll, "dataSourceKey": "main",
                        "mode": "drawer", "size": "large",
                        "pageModelClass": "ChildPageModel", "uid": f["uid"],
                    }},
                }})
                self.warnings.append(
                    f"auto-enabled clickToOpen on {f['use']} ({f['uid']}) "
                    f"for detail popup attachment")
                return f["uid"]
        return None

    def set_form(self, table_uid: str, form_type: str, markup: str,
                 events: list | None = None) -> dict:
        """Replace a table's addnew or edit form with new field layout.

        Accepts either HTML markup or legacy DSL string (auto-detected).

        HTML format:
            <form>
              <section title="Basic Info">
                <field name="employee_no" required /><field name="name" required />
                <field name="gender" /><field name="phone" />
              </section>
            </form>

        Legacy DSL format:
            "--- Basic Info\\nemployee_no*|name*\\ngender|phone"

        Args:
            table_uid: TableBlockModel UID
            form_type: "addnew" or "edit"
            markup: HTML markup or DSL string
            events: Optional event placeholder defs:
                [{"on": "formValuesChange", "desc": "..."}]

        Returns:
            dict with form_uid, type, node_count
        """
        from .tree_builder import TreeBuilder
        from .markup_parser import parse_form_html, validate_grid_layout

        # Auto-detect: HTML if contains <form> or <field, otherwise DSL
        fields_dsl = markup
        if '<form' in markup or '<field' in markup or '<section' in markup:
            fields_dsl = parse_form_html(markup)

        # Validate grid layout: reject single-column forms
        validate_grid_layout(fields_dsl, context="form")

        all_models = self._list_all()
        coll = self._get_table_collection(table_uid, all_models)
        if not coll:
            raise ValueError(f"Cannot determine collection for table {table_uid}")

        self._load_meta(coll)

        if form_type == "addnew":
            # Find AddNewActionModel under table
            addnew_uid = self._find_child_uid(table_uid, "AddNewActionModel", all_models)
            if not addnew_uid:
                raise ValueError(f"No AddNewActionModel found under {table_uid}")

            # Destroy old ChildPageModel
            old_cp = self._find_child_uid(addnew_uid, "ChildPageModel", all_models)
            if old_cp:
                self.destroy_tree(old_cp)
                self._invalidate_cache()

            # Build new form tree
            tb = TreeBuilder(self)
            new_cp = tb.addnew_form(coll, fields_dsl)

            # Attach event placeholders
            if events:
                form_node = self._find_tree_form(new_cp)
                if form_node:
                    for evt in events:
                        reg = tb.placeholder_event(evt["on"], evt.get("desc", ""))
                        form_node.flow_registry.update(reg)

            # Save
            result = self.save_tree(new_cp, addnew_uid,
                                     sub_key="page", sub_type="object")
            return {"form_uid": new_cp._create_form_uid, "type": "addnew",
                    "collection": coll, "node_count": result.get("saved", 0)}

        elif form_type == "edit":
            # Find TableActionsColumnModel under table
            actcol_uid = self._find_child_uid(table_uid, "TableActionsColumnModel", all_models)
            if not actcol_uid:
                raise ValueError(f"No TableActionsColumnModel found under {table_uid}")

            # Find and destroy old EditActionModel
            old_edit = self._find_child_uid(actcol_uid, "EditActionModel", all_models)
            if old_edit:
                self.destroy_tree(old_edit)
                self._invalidate_cache()

            # Build new edit action + form
            tb = TreeBuilder(self)
            edit_node = tb.edit_action(coll, fields_dsl)

            # Attach event placeholders
            if events:
                form_node = self._find_tree_form(edit_node)
                if form_node:
                    for evt in events:
                        reg = tb.placeholder_event(evt["on"], evt.get("desc", ""))
                        form_node.flow_registry.update(reg)

            # Save
            result = self.save_tree(edit_node, actcol_uid,
                                     sub_key="actions", sub_type="array")
            return {"form_uid": edit_node._edit_form_uid, "type": "edit",
                    "collection": coll, "node_count": result.get("saved", 0)}

        else:
            raise ValueError(f"form_type must be 'addnew' or 'edit', got '{form_type}'")

    def _find_tree_form(self, node) -> 'Any | None':
        """Recursively find CreateFormModel or EditFormModel in TreeNode tree."""
        if node.use in ("CreateFormModel", "EditFormModel"):
            return node
        for val in node._sub_models.values():
            if isinstance(val, list):
                for child in val:
                    found = self._find_tree_form(child)
                    if found:
                        return found
            else:
                found = self._find_tree_form(val)
                if found:
                    return found
        return None

    def set_detail(self, table_uid: str, markup_or_json) -> dict:
        """Replace a table's detail popup with new tab structure.

        Accepts either HTML markup string or legacy JSON tab definitions
        (auto-detected).

        HTML format:
            <detail>
              <tab title="Basic Info">
                <field name="employee_no" /><field name="name" />
                <js-item title="Profile">Level tags + status</js-item>
              </tab>
              <tab title="Attendance" assoc="attendance"
                   collection="nb_hrm_attendance" fields="date,status" />
            </detail>

        Legacy JSON format:
            [{"title": "Basic Info", "fields": "DSL"}, ...]

        Args:
            table_uid: TableBlockModel UID
            markup_or_json: HTML markup string or list of tab definitions

        Returns:
            dict with tab count, type, node_count
        """
        from .tree_builder import TreeBuilder
        from .markup_parser import parse_detail_html

        # Auto-detect: HTML string with <detail or <tab → parse as HTML
        if isinstance(markup_or_json, str) and ('<detail' in markup_or_json or '<tab' in markup_or_json):
            detail_json = parse_detail_html(markup_or_json)
        elif isinstance(markup_or_json, list):
            detail_json = markup_or_json
        elif isinstance(markup_or_json, str):
            # Try JSON parse
            import json
            detail_json = json.loads(markup_or_json)
        else:
            raise ValueError("markup_or_json must be HTML string or list of tab defs")

        all_models = self._list_all()
        coll = self._get_table_collection(table_uid, all_models)
        if not coll:
            raise ValueError(f"Cannot determine collection for table {table_uid}")

        self._load_meta(coll)

        # Find click field — or auto-enable on first column if none exists
        click_uid = self._find_click_field_uid(table_uid, all_models)
        if not click_uid:
            click_uid = self._enable_first_click(table_uid, coll, all_models)
        if not click_uid:
            raise ValueError(
                f"No column with DisplayFieldModel found under table {table_uid}. "
                f"Cannot attach detail popup.")

        # Destroy old ChildPageModel
        old_cp = self._find_child_uid(click_uid, "ChildPageModel", all_models)
        if old_cp:
            self.destroy_tree(old_cp)
            self._invalidate_cache()

        # Ensure popupSettings on click field
        uid_map = {m["uid"]: m for m in all_models}
        cf_data = uid_map.get(click_uid, {})
        popup_sp = cf_data.get("stepParams", {}).get("popupSettings", {}).get("openView", {})
        if not popup_sp.get("pageModelClass"):
            self.update(click_uid, {"stepParams": {"popupSettings": {"openView": {
                "collectionName": coll, "dataSourceKey": "main",
                "mode": "drawer", "size": "large",
                "pageModelClass": "ChildPageModel", "uid": click_uid,
            }}}})

        # Validate grid layout on field-based tabs
        from .markup_parser import validate_grid_layout
        for tab in detail_json:
            if isinstance(tab.get("fields"), str) and tab["fields"]:
                validate_grid_layout(tab["fields"], context=f"detail tab '{tab.get('title', '?')}'")

        # Convert js_items in tabs to block definitions
        tb = TreeBuilder(self)
        for tab in detail_json:
            if "js_items" in tab:
                blocks = []
                if tab.get("fields"):
                    blocks.append({"type": "details", "fields": tab["fields"]})
                for ji in tab["js_items"]:
                    code = tb._placeholder_code(ji["title"], ji.get("desc", ""), "item")
                    blocks.append({"type": "js", "title": ji["title"], "code": code})
                tab["blocks"] = blocks
                if "js_items" in tab:
                    del tab["js_items"]
                # Keep fields for fallback
                if "fields" not in tab:
                    tab["fields"] = ""

        # Build new detail popup
        popup_cp = tb.detail_popup(coll, detail_json)

        # Save
        result = self.save_tree(popup_cp, click_uid,
                                 sub_key="page", sub_type="object")
        return {"tabs": len(detail_json), "type": "detail",
                "collection": coll, "node_count": result.get("saved", 0)}

    def auto_forms(self, scope: str) -> dict:
        """Scan all table forms/popups and generate refinement task list.

        Compares each form's field count to collection total.
        Returns task table with [ok] (>=70% coverage) and [todo] (<70%) markers.

        Args:
            scope: Tab UID or title prefix (e.g. "CRM")

        Returns:
            dict with tasks list and markdown task_table
        """
        all_models = self._list_all()
        uid_map = {m["uid"]: m for m in all_models}

        # Resolve scope to tab UIDs
        target_uids = None
        if scope in uid_map:
            target_uids = set(self._collect_descendants(scope))
            target_uids.add(scope)
        else:
            try:
                routes = self._get_json(
                    "api/desktopRoutes:list?paginate=false&tree=true") or []
                tab_uids = set()

                def _collect_tab_uids(rts):
                    for rt in rts:
                        rtype = rt.get("type", "")
                        if rtype == "group":
                            _collect_tab_uids(rt.get("children", []))
                        elif rtype == "flowPage":
                            for ch in rt.get("children", []):
                                if ch.get("type") == "tabs":
                                    csu = ch.get("schemaUid")
                                    if csu:
                                        tab_uids.add(csu)

                for rt in routes:
                    if rt.get("title", "").upper().startswith(scope.upper()):
                        _collect_tab_uids(rt.get("children", []))

                if tab_uids:
                    target_uids = set()
                    for tu in tab_uids:
                        target_uids.add(tu)
                        target_uids.update(self._collect_descendants(tu))
            except Exception:
                pass

        # Find all TableBlockModels in scope
        tables = []
        for m in all_models:
            if m.get("use") != "TableBlockModel":
                continue
            if target_uids is not None and m["uid"] not in target_uids:
                continue
            # Skip sub-tables (those with association)
            rs = m.get("stepParams", {}).get("resourceSettings", {}).get("init", {})
            if rs.get("association") or rs.get("associationName"):
                continue
            tables.append(m)

        # Assess each table's forms
        results = []
        for tbl in tables:
            rs = tbl.get("stepParams", {}).get("resourceSettings", {}).get("init", {})
            coll = rs.get("collectionName", "")
            if not coll:
                continue

            self._load_meta(coll)
            schema = self._field_cache.get(coll, {})
            # Get editable field count (same logic as markup_parser)
            skip_names = {"id", "createdAt", "updatedAt", "createdById",
                          "updatedById", "createdBy", "updatedBy", "sort"}
            skip_ifaces = {"o2m", "m2m", "oho", "obo", "createdBy", "updatedBy",
                           "createdAt", "updatedAt"}
            editable = [n for n, info in schema.items()
                        if n not in skip_names
                        and not n.startswith("f_") and not n.endswith("Id")
                        and info.get("interface") not in skip_ifaces]
            total_fields = len(editable)

            # Find page title
            page_title = self._find_page_title_for(tbl["uid"], uid_map)

            # Assess AddNew
            addnew_info = self._assess_popup_form(
                tbl["uid"], "AddNewActionModel", "CreateFormModel",
                all_models, uid_map, "addnew")

            # Assess Edit
            edit_info = self._assess_edit_form(
                tbl["uid"], all_models, uid_map)

            # Assess Detail
            detail_info = self._assess_detail_popup(
                tbl["uid"], all_models, uid_map)

            for info in [addnew_info, edit_info, detail_info]:
                info["table_uid"] = tbl["uid"]
                info["collection"] = coll
                info["total_fields"] = total_fields
                info["available_fields"] = editable
                info["page"] = page_title or ""
                # Determine status
                if info.get("bad_tabs"):
                    info["status"] = "[fix: merge tabs]"
                elif total_fields and info["field_count"] / total_fields >= 0.7:
                    info["status"] = "[ok]"
                else:
                    info["status"] = "[todo]"
                results.append(info)

        # Generate markdown task table
        task_table = self._format_form_task_table(results)
        return {"tasks": results, "task_table": task_table,
                "total": len(results),
                "todo": len([r for r in results if r["status"] == "[todo]"]),
                "fix": len([r for r in results if r["status"] == "[fix: merge tabs]"]),
                "ok": len([r for r in results if r["status"] == "[ok]"])}

    def _assess_popup_form(self, table_uid: str, action_use: str,
                            form_use: str, all_models: list,
                            uid_map: dict, form_type: str) -> dict:
        """Count form fields inside action → ChildPage → Form chain."""
        action = self._find_child_uid(table_uid, action_use, all_models)
        if not action:
            return {"form_type": form_type, "field_count": 0, "form_uid": None,
                    "fields": [], "has_sections": False}

        # action → ChildPageModel → ... → CreateFormModel/EditFormModel → FormGridModel → FormItemModels
        descendants = self._collect_descendants(action)
        form_items = [uid_map[u] for u in descendants
                      if u in uid_map and uid_map[u].get("use") == "FormItemModel"]
        field_names = []
        for fi in form_items:
            fp = fi.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp:
                field_names.append(fp)

        # Check for sections (DividerItemModel)
        has_sections = any(uid_map[u].get("use") == "DividerItemModel"
                          for u in descendants if u in uid_map)

        # Find form UID
        form_uid = None
        for u in descendants:
            if u in uid_map and uid_map[u].get("use") == form_use:
                form_uid = u
                break

        return {"form_type": form_type, "field_count": len(field_names),
                "form_uid": form_uid, "fields": field_names,
                "has_sections": has_sections}

    def _assess_edit_form(self, table_uid: str, all_models: list,
                           uid_map: dict) -> dict:
        """Count edit form fields (EditActionModel under TableActionsColumnModel)."""
        actcol = self._find_child_uid(table_uid, "TableActionsColumnModel", all_models)
        if not actcol:
            return {"form_type": "edit", "field_count": 0, "form_uid": None,
                    "fields": [], "has_sections": False}

        edit_action = self._find_child_uid(actcol, "EditActionModel", all_models)
        if not edit_action:
            return {"form_type": "edit", "field_count": 0, "form_uid": None,
                    "fields": [], "has_sections": False}

        descendants = self._collect_descendants(edit_action)
        form_items = [uid_map[u] for u in descendants
                      if u in uid_map and uid_map[u].get("use") == "FormItemModel"]
        field_names = []
        for fi in form_items:
            fp = fi.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp:
                field_names.append(fp)

        has_sections = any(uid_map[u].get("use") == "DividerItemModel"
                          for u in descendants if u in uid_map)

        form_uid = None
        for u in descendants:
            if u in uid_map and uid_map[u].get("use") == "EditFormModel":
                form_uid = u
                break

        return {"form_type": "edit", "field_count": len(field_names),
                "form_uid": form_uid, "fields": field_names,
                "has_sections": has_sections}

    def _assess_detail_popup(self, table_uid: str, all_models: list,
                              uid_map: dict) -> dict:
        """Count detail popup tabs and fields."""
        click_uid = self._find_click_field_uid(table_uid, all_models)
        if not click_uid:
            return {"form_type": "detail", "field_count": 0, "form_uid": None,
                    "fields": [], "has_sections": False, "tabs": 0}

        cp_uid = self._find_child_uid(click_uid, "ChildPageModel", all_models)
        if not cp_uid:
            return {"form_type": "detail", "field_count": 0, "form_uid": None,
                    "fields": [], "has_sections": False, "tabs": 0}

        descendants = self._collect_descendants(cp_uid)
        # Count tabs
        tab_count = sum(1 for u in descendants if u in uid_map
                        and uid_map[u].get("use") == "ChildPageTabModel")
        # Count detail fields
        detail_items = [uid_map[u] for u in descendants
                        if u in uid_map and uid_map[u].get("use") == "DetailsItemModel"]
        field_names = []
        for di in detail_items:
            fp = di.get("stepParams", {}).get("fieldSettings", {}).get("init", {}).get("fieldPath", "")
            if fp:
                field_names.append(fp)

        has_sections = any(uid_map[u].get("use") == "DividerItemModel"
                          for u in descendants if u in uid_map)

        # Detect bad tab structure: multiple tabs that are all field-only (no subtables)
        # Each tab that has ONLY DetailsItemModel children (no TableBlockModel) is a "field tab"
        tab_uids = [u for u in descendants if u in uid_map
                    and uid_map[u].get("use") == "ChildPageTabModel"]
        field_only_tab_count = 0
        for tab_u in tab_uids:
            tab_desc = self._collect_descendants(tab_u)
            has_subtable = any(uid_map.get(d, {}).get("use") == "TableBlockModel"
                              for d in tab_desc if d in uid_map)
            if not has_subtable:
                field_only_tab_count += 1

        bad_tabs = field_only_tab_count > 1

        return {"form_type": "detail", "field_count": len(field_names),
                "form_uid": cp_uid, "fields": field_names,
                "has_sections": has_sections, "tabs": tab_count,
                "bad_tabs": bad_tabs, "field_only_tabs": field_only_tab_count}

    def _find_page_title_for(self, uid_: str, uid_map: dict) -> str | None:
        """Walk parent chain to find page title from route."""
        visited = set()
        p = uid_
        while p and p not in visited:
            visited.add(p)
            pm = uid_map.get(p)
            if not pm:
                break
            p = pm.get("parentId", "")

        # The topmost parent's parent should be a tab UID → find route
        try:
            routes = self._get_json(
                "api/desktopRoutes:list?paginate=false&tree=true") or []
            # Collect all route titles keyed by schemaUid
            title_map = {}

            def _walk(rts):
                for rt in rts:
                    for ch in rt.get("children", []):
                        su = ch.get("schemaUid")
                        if su:
                            title_map[su] = rt.get("title", "")
                        _walk(ch.get("children", []))
                    _walk(rt.get("children", []))
            _walk(routes)

            # Check which tab UID in our parent chain
            for v in visited:
                if v in title_map:
                    return title_map[v]
        except Exception:
            pass
        return None

    def _format_form_task_table(self, results: list) -> str:
        """Generate markdown task table from form assessment results."""
        lines = ["## Form Refinement Tasks\n",
                 "| # | Page | Type | Table UID | Collection | Fields | Coverage | Sections | Status |",
                 "|---|------|------|-----------|-----------|--------|----------|----------|--------|"]

        for i, r in enumerate(results, 1):
            total = r["total_fields"]
            count = r["field_count"]
            pct = f"{count}/{total} ({count*100//total}%)" if total else "0/0"
            sect = "yes" if r.get("has_sections") else "no"
            tuid = r["table_uid"][:8] + "..."
            lines.append(
                f"| {i} | {r['page']} | {r['form_type']} | {tuid} | "
                f"{r['collection']} | {pct} | {r['status']} | {sect} | {r['status']} |")

        # Add context for tasks needing action
        merge_tabs = [r for r in results if r["status"] == "[fix: merge tabs]"]
        if merge_tabs:
            lines.append("\n### ⚠️ Tab Structure Issues (merge required):\n")
            for r in merge_tabs:
                lines.append(f"#### {r['page']} detail ({r['table_uid'][:12]}...)")
                lines.append(f"Problem: {r.get('field_only_tabs', 0)} tabs have only "
                             f"field displays (no subtables). Same-table fields should be "
                             f"in ONE tab using --- Section headers.")
                lines.append(f"Fix: nb_set_detail(table_uid, [...]) — merge all field-only "
                             f"tabs into first 'Overview' tab with --- Section groups. "
                             f"Only o2m subtable associations get separate tabs.")
                lines.append("")

        todos = [r for r in results if r["status"] == "[todo]"]
        if todos:
            lines.append("\n### Context for [todo] tasks:\n")
            for r in todos:
                lines.append(f"#### {r['page']} {r['form_type']} ({r['table_uid'][:12]}...)")
                lines.append(f"Collection: {r['collection']}")
                avail = r.get("available_fields", [])
                current = r.get("fields", [])
                missing = [f for f in avail if f not in current]
                if current:
                    lines.append(f"Current fields: {', '.join(current)}")
                if missing:
                    lines.append(f"Missing fields: {', '.join(missing)}")

                # Smart context based on form type and collection metadata
                coll = r["collection"]
                if r["form_type"] == "detail":
                    # Find o2m relations for subtable suggestions
                    o2m_fields = self._find_o2m_relations(coll)
                    if o2m_fields:
                        lines.append(f"O2M relations (subtable candidates): {', '.join(o2m_fields)}")
                    lines.append("Action: nb_set_detail(table_uid, detail_json)")
                    lines.append("Design: Tab BasicInfo (all fields + sections) + Tab per o2m relation (subtable)")
                else:
                    # Suggest field groupings based on field names
                    groups = self._suggest_field_groups(avail)
                    if groups:
                        lines.append(f"Suggested sections: {groups}")
                    if r["form_type"] == "addnew":
                        lines.append("Action: nb_set_form(table_uid, \"addnew\", fields_dsl)")
                    else:
                        lines.append("Action: nb_set_form(table_uid, \"edit\", fields_dsl)")
                lines.append("")

        return "\n".join(lines)

    def _find_o2m_relations(self, coll: str) -> list[str]:
        """Find o2m relation fields on a collection."""
        self._load_meta(coll)
        schema = self._field_cache.get(coll, {})
        return [f"{name} → {info.get('target', '?')}"
                for name, info in schema.items()
                if info.get("interface") == "o2m"]

    def _suggest_field_groups(self, fields: list[str]) -> str:
        """Suggest logical field groupings based on field name patterns."""
        contact = [f for f in fields if f in ("phone", "email", "mobile", "fax",
                                                "address", "city", "contact")]
        money = [f for f in fields if f in ("amount", "price", "cost", "total",
                                             "discount", "budget", "payment",
                                             "target_amount", "achieved_amount")]
        date = [f for f in fields if "date" in f or "time" in f]

        groups = []
        groups.append("--- Basic Info")
        if contact:
            groups.append(f"--- Contact Info ({', '.join(contact)})")
        if money:
            groups.append(f"--- Financial Info ({', '.join(money)})")
        if date:
            groups.append(f"--- Date/Time ({', '.join(date)})")
        if any(f in fields for f in ("remarks", "description", "notes", "content")):
            groups.append("--- Remarks")
        return " / ".join(groups)

    def find_placeholders(self, scope: str) -> list[dict]:
        """Find JS placeholder nodes under a scope (tab UID or title prefix).

        Similar to find_outlines() but searches for __placeholder__ marker
        instead of __outline__. Returns richer info including kind and desc.

        Args:
            scope: Tab UID, or a title prefix to match across all pages

        Returns:
            List of dicts: {uid, kind, title, desc, field, collection, parent_uid, use}
        """
        all_models = self._list_all()
        uid_map = {m["uid"]: m for m in all_models}

        # Determine target scope
        target_uids = None
        if scope in uid_map:
            target_uids = set(self._collect_descendants(scope))
            target_uids.add(scope)
        else:
            try:
                routes = self._get_json(
                    "api/desktopRoutes:list?paginate=false&tree=true") or []
                tab_uids = set()

                def _collect_tab_uids(rts):
                    for rt in rts:
                        rtype = rt.get("type", "")
                        if rtype == "group":
                            _collect_tab_uids(rt.get("children", []))
                        elif rtype == "flowPage":
                            for ch in rt.get("children", []):
                                if ch.get("type") == "tabs":
                                    csu = ch.get("schemaUid")
                                    if csu:
                                        tab_uids.add(csu)

                for rt in routes:
                    if rt.get("title", "").upper().startswith(scope.upper()):
                        _collect_tab_uids(rt.get("children", []))

                if tab_uids:
                    target_uids = set()
                    for tu in tab_uids:
                        target_uids.add(tu)
                        target_uids.update(self._collect_descendants(tu))
            except Exception:
                pass

        results = []
        for m in all_models:
            if target_uids is not None and m["uid"] not in target_uids:
                continue

            sp = m.get("stepParams", {})
            use = m.get("use", "")
            parent_uid = m.get("parentId", "")

            # Check JS code for __placeholder__
            code = sp.get("jsSettings", {}).get("runJs", {}).get("code", "")
            is_js_placeholder = "__placeholder__" in code

            # Check flowRegistry for event placeholders
            registry = m.get("flowRegistry", {}) or {}
            event_placeholders = []
            for fk, fv in registry.items():
                steps = fv.get("steps", {})
                for sk, sv in steps.items():
                    step_code = sv.get("defaultParams", {}).get("code", "")
                    if "__placeholder__" in step_code:
                        event_placeholders.append({
                            "flow_key": fk,
                            "event": fv.get("on", {}).get("eventName", ""),
                            "code": step_code,
                        })

            if not is_js_placeholder and not event_placeholders:
                continue

            # Find collection and popup context from parent chain
            collection = ""
            in_popup = False
            visited = set()
            p = parent_uid
            while p and p not in visited:
                visited.add(p)
                pm = uid_map.get(p)
                if not pm:
                    break
                if pm.get("use") == "ChildPageModel":
                    in_popup = True
                rs = pm.get("stepParams", {}).get("resourceSettings", {}).get("init", {})
                if rs.get("collectionName"):
                    collection = rs["collectionName"]
                    break
                p = pm.get("parentId", "")

            if is_js_placeholder:
                # Extract info from JS code
                import re
                info = {}
                try:
                    match = re.search(r'const info = (\{.*?\});', code, re.DOTALL)
                    if match:
                        info = json.loads(match.group(1))
                except Exception:
                    pass

                # Separate known keys from extra metadata
                _known = {"__placeholder__", "kind", "title", "desc", "field", "col_type"}
                extra_meta = {k: v for k, v in info.items() if k not in _known}

                results.append({
                    "uid": m["uid"],
                    "use": use,
                    "kind": info.get("kind", "unknown"),
                    "title": info.get("title", ""),
                    "desc": info.get("desc", ""),
                    "field": info.get("field", ""),
                    "col_type": info.get("col_type", ""),
                    "meta": extra_meta,
                    "collection": collection,
                    "parent_uid": parent_uid,
                    "in_popup": in_popup,
                })

            for ep in event_placeholders:
                info = {}
                try:
                    import re
                    match = re.search(r'// (\{.*?"__placeholder__".*?\})', ep["code"])
                    if match:
                        info = json.loads(match.group(1))
                except Exception:
                    pass

                results.append({
                    "uid": m["uid"],
                    "use": use,
                    "kind": "event",
                    "title": f"{ep['event']} on {use}",
                    "desc": info.get("desc", ""),
                    "field": "",
                    "event": ep["event"],
                    "flow_key": ep["flow_key"],
                    "collection": collection,
                    "parent_uid": parent_uid,
                })

        return results

    def inject_js(self, uid_: str, code: str) -> bool:
        """Replace placeholder JS with real implementation.

        Auto-detects node type (JSColumnModel/JSBlockModel/JSItemModel).
        Preserves title/width and other settings.
        For event placeholders, use inject_event() instead.

        Rejects stub/empty code — must contain ctx.render() to be valid.
        Warns on common mistakes: ctx.components (use ctx.antd), bracket filters.

        Args:
            uid_: UID of the placeholder node
            code: Real JS code to inject

        Returns:
            True on success

        Raises:
            ValueError: If code is a stub (only comments, no ctx.render)
            ValueError: If code uses ctx.components (should be ctx.antd)
            ValueError: If code uses bracket filter syntax (should be JSON filter)
        """
        # Strip comments and whitespace to check if there's real code
        stripped = "\n".join(
            line for line in code.strip().splitlines()
            if line.strip() and not line.strip().startswith("//")
        )
        if not stripped or len(stripped) < 30:
            raise ValueError(
                f"Rejected stub code for {uid_}: code has no real implementation "
                f"(only {len(stripped)} chars of non-comment content). "
                f"Write real JS with ctx.render() that renders actual UI."
            )

        # Validate: ctx.components does not exist in NocoBase JS sandbox
        if "ctx.components" in code:
            raise ValueError(
                f"Rejected code for {uid_}: 'ctx.components' does not exist in NocoBase. "
                f"Use 'ctx.antd' instead. Example: const {{Tag, Progress}} = ctx.antd; "
                f"Available: ctx.React, ctx.antd (Ant Design 5), ctx.api, ctx.render(), ctx.record"
            )

        # Validate: non-existent sandbox APIs
        import re
        bad_apis = re.findall(r'ctx\.(charts|useData|echarts|g2|dataSource|store|model|service|utils)', code)
        if bad_apis:
            raise ValueError(
                f"Rejected code for {uid_}: 'ctx.{bad_apis[0]}' does not exist in NocoBase JS sandbox. "
                f"There is NO chart library (AntV/G2/ECharts) available. "
                f"Use ctx.antd Progress bars for distribution charts, "
                f"or plain div bars for trends. "
                f"Available: ctx.React, ctx.antd (Ant Design 5), ctx.api, ctx.render(), ctx.record"
            )

        # Validate: Chart library imports from ctx (e.g., const {Pie} = ctx.charts)
        # Only reject when destructured FROM ctx — local vars named Bar/Pie etc. are fine
        chart_imports = re.findall(r'(?:const|var|let)\s*\{[^}]*(?:Pie|Bar|Line|Column|Area|Scatter|Gauge|Radar|Funnel)[^}]*\}\s*=\s*ctx\.\w+', code)
        if chart_imports:
            raise ValueError(
                f"Rejected code for {uid_}: Chart components (Pie/Bar/Line/etc) are not available in ctx. "
                f"NocoBase JS sandbox has NO chart library. "
                f"Use ctx.antd.Progress for bar charts, plain divs for trends. "
                f"See js-patterns.md for correct patterns."
            )

        # Validate: api.collection().list() is NOT the correct API
        if re.search(r'api\.collection\s*\(', code):
            raise ValueError(
                f"Rejected code for {uid_}: 'api.collection().list()' is NOT NocoBase JS sandbox API. "
                f"Use: ctx.api.request({{url:'COLLECTION:list', params:{{paginate:false}}}}) "
                f"Response: r?.data?.data (array of records). "
                f"See js-patterns.md for correct data fetching patterns."
            )

        # Validate: React hooks (useState/useEffect) not available in eval context
        if re.search(r'\b(useState|useEffect|useCallback|useMemo|useRef|useContext)\b', code):
            raise ValueError(
                f"Rejected code for {uid_}: React hooks (useState/useEffect/etc) are NOT available. "
                f"NocoBase JS blocks run in eval() context, not React component lifecycle. "
                f"Use async IIFE pattern instead: (async()=>{{ const data = await ctx.api.request({{...}}); ctx.render(h(...)); }})(); "
                f"See js-patterns.md for correct async data fetching patterns."
            )

        # Validate: bracket filter syntax is not NocoBase API format
        if "filter[" in code:
            raise ValueError(
                f"Rejected code for {uid_}: 'filter[field]=value' is not NocoBase filter syntax. "
                f"Use JSON filter: params:{{filter:{{field:{{$operator:'value'}}}}}}. "
                f"Date operators: $dateAfter, $dateBefore. "
                f"Number operators: $gt, $gte, $lt, $lte. "
                f"String operators: $includes, $eq, $ne."
            )

        # Validate: innerHTML on ctx.element is deprecated — use ctx.render() instead
        # NOTE: document.createElement IS valid (used by ECharts/Chart.js pattern:
        #   container = document.createElement('div'); ctx.render(container); chart.init(container))
        if "ctx.element.innerHTML" in code or "element.innerHTML" in code:
            raise ValueError(
                f"Rejected code for {uid_}: ctx.element.innerHTML is deprecated. "
                f"Use ctx.render(content) instead. Supports JSX, DOM nodes, and HTML strings. "
                f"For ECharts: document.createElement('div') + ctx.render(container) + echarts.init(container). "
                f"See ref/js-patterns.md and ref/js-sandbox.md."
            )

        # Warn: JS block inside popup using ctx.record instead of ctx.popup
        # ctx.record is only available inside DetailsBlockModel's child tree,
        # NOT for sibling JSBlockModel in the same popup tab.
        # Correct pattern: const popup = await ctx.popup; const id = popup?.resource?.filterByTk;
        if "ctx.record" in code:
            # Check if this node is inside a popup (has ChildPageModel ancestor)
            data = self._get_json(f"api/flowModels:get?filterByTk={uid_}")
            if data:
                use = data.get("use", "")
                if use in ("JSBlockModel",):
                    # Walk parent chain to detect popup context
                    p = data.get("parentId", "")
                    all_models = self._list_all()
                    uid_map = {m["uid"]: m for m in all_models}
                    in_popup = False
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
                    if in_popup:
                        self.warnings.append(
                            f"WARNING [{uid_}]: JSBlockModel inside popup uses ctx.record, "
                            f"which may be undefined. JSBlockModel is a sibling of DetailsBlockModel, "
                            f"not its child — ctx.record delegate chain does not reach it. "
                            f"Use instead: const popup = await ctx.popup; "
                            f"const id = popup?.resource?.filterByTk; "
                            f"then ctx.request({{url:'COLLECTION:get', params:{{filterByTk:id}}}}) "
                            f"to fetch record data."
                        )

        return self.update_js(uid_, code)

    def inject_event(self, uid_: str, event_name: str, code: str) -> bool:
        """Replace placeholder event flow with real implementation.

        Finds the placeholder flow for the given event_name and replaces its code.

        Args:
            uid_: UID of the model node containing the event
            event_name: Event name (e.g. "formValuesChange")
            code: Real JS code for the event

        Returns:
            True on success
        """
        data = self._get_json(f"api/flowModels:get?filterByTk={uid_}")
        if not data:
            return False

        registry = data.get("flowRegistry", {}) or {}
        found = False
        for fk, fv in registry.items():
            if fv.get("on", {}).get("eventName") == event_name:
                for sk, sv in fv.get("steps", {}).items():
                    step_code = sv.get("defaultParams", {}).get("code", "")
                    if "__placeholder__" in step_code:
                        sv["defaultParams"]["code"] = code
                        fv["title"] = event_name
                        found = True
                        break
                if found:
                    break

        if not found:
            return False

        return self.update(uid_, {"flowRegistry": registry})

    # ── Auto JS ────────────────────────────────────────────────

    def auto_js(self, scope: str, output_dir: str = "js/",
                templates_dir: str | None = None) -> dict:
        """Auto-generate JS files from placeholders + templates.

        For columns with known type and matching template: fills template with
        metadata (field, subs, threshold, etc.) and writes ready-to-inject JS.
        For items: matches against item templates (profile/gauge/lifecycle/stats)
        using keyword heuristics on desc + collection field metadata.
        For blocks/events and unmatched items: writes stub files as [todo].

        Args:
            scope: Tab UID or title prefix (e.g. "CRM")
            output_dir: Directory to write JS files
            templates_dir: Directory containing col-*.js and item-*.js templates

        Returns:
            Dict with auto/manual lists and markdown task table.
        """
        placeholders = self.find_placeholders(scope)

        # Read templates
        templates: dict[str, str] = {}
        if templates_dir and os.path.isdir(templates_dir):
            for fname in os.listdir(templates_dir):
                if fname.endswith('.js'):
                    with open(os.path.join(templates_dir, fname)) as f:
                        templates[fname] = f.read().strip()

        os.makedirs(output_dir, exist_ok=True)

        auto: list[dict] = []
        manual: list[dict] = []

        for p in placeholders:
            uid_ = p["uid"]
            kind = p["kind"]
            title = p.get("title", "")
            desc = p.get("desc", "")
            field = p.get("field", "")
            col_type = p.get("col_type", "")
            meta = p.get("meta", {})
            collection = p.get("collection", "")

            # --- Columns: auto-fill from template ---
            if kind == "column" and col_type:
                tpl_name = f"col-{col_type}.js"
                if tpl_name in templates:
                    code = templates[tpl_name]
                    code = code.replace("{FIELD}", field)
                    if col_type == "composite":
                        code = code.replace("{TITLE}", field)
                        subs = meta.get("subs", "")
                        if subs:
                            subs_js = ",".join(
                                f'"{s.strip()}"' for s in subs.split(",")
                            )
                        else:
                            subs_js = ""
                        code = code.replace("{SUBS}", subs_js)
                    elif col_type == "currency":
                        threshold = str(meta.get("threshold", 100000))
                        code = code.replace("{THRESHOLD}", threshold)
                    elif col_type == "comparison":
                        code = code.replace("{TARGET}",
                                            meta.get("target", field))
                        code = code.replace("{ACTUAL}",
                                            meta.get("actual", field))
                    fpath = os.path.join(output_dir, f"{uid_}.js")
                    with open(fpath, "w") as f:
                        f.write(code)
                    auto.append({
                        "uid": uid_, "kind": f"column/{col_type}",
                        "title": title, "template": tpl_name,
                        "file": os.path.basename(fpath),
                        "collection": collection,
                    })
                    continue

            # --- Events: write stub with metadata ---
            if kind == "event":
                event_name = p.get("event", "formValuesChange")
                fname = f"{uid_}__evt__{event_name}.js"
                fpath = os.path.join(output_dir, fname)
                with open(fpath, "w") as f:
                    f.write(
                        f"// TODO: {title}\n"
                        f"// {desc}\n"
                        f"// Collection: {collection}\n"
                    )
                manual.append({
                    "uid": uid_, "kind": f"event/{event_name}",
                    "title": title, "desc": desc,
                    "file": os.path.basename(fpath),
                    "collection": collection,
                })
                continue

            # --- Items: try auto-fill from template ---
            if kind == "item" and collection:
                item_result = self._auto_fill_item(
                    uid_, title, desc, collection, templates, output_dir
                )
                if item_result:
                    auto.append(item_result)
                    continue

            # --- Blocks / Items (unmatched): write stub ---
            in_popup = p.get("in_popup", False)
            fpath = os.path.join(output_dir, f"{uid_}.js")
            with open(fpath, "w") as f:
                f.write(
                    f"// TODO: {title}\n"
                    f"// {desc}\n"
                    f"// Collection: {collection}\n"
                    f"// Kind: {kind}\n"
                )
                if in_popup:
                    f.write(
                        f"// Context: detail popup (record-aware)\n"
                        f"// const recordId = ctx.view?.inputArgs?.filterByTk;\n"
                    )
            manual.append({
                "uid": uid_, "kind": kind,
                "title": title, "desc": desc,
                "file": os.path.basename(fpath),
                "collection": collection,
                "in_popup": in_popup,
            })

        # Build markdown task table — items before blocks before events
        lines = [
            "### JS Tasks\n",
            "| # | UID | Kind | Title | Collection | Template | Status |",
            "|---|-----|------|-------|------------|----------|--------|",
        ]
        n = 0
        for item in auto:
            n += 1
            lines.append(
                f"| {n} | {item['uid']} | {item['kind']} | "
                f"{item['title']} | {item['collection']} | "
                f"{item['template']} | [auto] |"
            )
        for item in manual:
            n += 1
            lines.append(
                f"| {n} | {item['uid']} | {item['kind']} | "
                f"{item['title']} | {item['collection']} | "
                f"— | [todo] |"
            )

        return {
            "auto": auto,
            "manual": manual,
            "task_table": "\n".join(lines),
            "total": len(auto) + len(manual),
            "auto_count": len(auto),
            "manual_count": len(manual),
        }

    # ── Item Auto-Fill ────────────────────────────────────────

    _ITEM_GAUGE_KW = {"progress", "percent", "collection rate", "achievement rate", "completion rate"}
    _ITEM_LIFECYCLE_KW = {"stage", "pipeline", "workflow", "lifecycle", "status flow"}

    def _auto_fill_item(self, uid_: str, title: str, desc: str,
                        collection: str, templates: dict,
                        output_dir: str) -> dict | None:
        """Try to auto-fill an item JS from templates.

        Returns an auto-entry dict on success, None if no template matches.
        """
        desc_lower = desc.lower()

        # Load collection field metadata
        self._load_meta(collection)
        schema = self._field_cache.get(collection, {})

        # --- Gauge: progress/percentage items ---
        if any(kw in desc_lower for kw in self._ITEM_GAUGE_KW):
            tpl = templates.get("item-gauge.js")
            if tpl:
                filled = self._fill_gauge_item(tpl, desc, schema, title)
                if filled:
                    return self._write_item_auto(
                        uid_, filled, "item-gauge.js", title, collection,
                        output_dir)

        # --- Lifecycle: stage/pipeline items ---
        if any(kw in desc_lower for kw in self._ITEM_LIFECYCLE_KW):
            tpl = templates.get("item-lifecycle.js")
            if tpl:
                filled = self._fill_lifecycle_item(tpl, desc, schema)
                if filled:
                    return self._write_item_auto(
                        uid_, filled, "item-lifecycle.js", title, collection,
                        output_dir)

        # --- Profile (default fallback): tags + date stat ---
        tpl = templates.get("item-profile.js")
        if tpl:
            filled = self._fill_profile_item(tpl, desc, schema, title)
            if filled:
                return self._write_item_auto(
                    uid_, filled, "item-profile.js", title, collection,
                    output_dir)

        return None

    def _write_item_auto(self, uid_: str, code: str, tpl_name: str,
                         title: str, collection: str,
                         output_dir: str) -> dict:
        fpath = os.path.join(output_dir, f"{uid_}.js")
        with open(fpath, "w") as f:
            f.write(code)
        return {
            "uid": uid_, "kind": "item",
            "title": title, "template": tpl_name,
            "file": os.path.basename(fpath),
            "collection": collection,
        }

    def _fill_profile_item(self, tpl: str, desc: str,
                           schema: dict, title: str) -> str | None:
        """Fill item-profile.js: select fields as tags + date stat."""
        PALETTE = ["red", "orange", "blue", "green", "purple",
                   "cyan", "magenta", "geekblue", "lime", "gold"]
        tag_fields = []
        for name, info in schema.items():
            if info.get("interface") != "select":
                continue
            enums = info.get("enum", [])
            tf: dict = {"field": name}
            if enums:
                # Assign colors from palette based on enum order
                colors = {}
                for i, e in enumerate(enums):
                    colors[e.get("value", "")] = PALETTE[i % len(PALETTE)]
                tf["colors"] = colors
            tag_fields.append(tf)
            if len(tag_fields) >= 5:
                break

        if not tag_fields:
            return None

        code = tpl
        code = code.replace("{TAG_FIELDS}",
                            json.dumps(tag_fields, ensure_ascii=False))
        code = code.replace("{DATE_FIELD}", "createdAt")
        # Use title or fallback
        label = "Days Since Created"
        if "filed" in desc or "record" in desc:
            label = "Days Since Filed"
        elif "registered" in desc or "signup" in desc:
            label = "Days Since Registered"
        code = code.replace("{LABEL}", label)
        return code

    def _fill_gauge_item(self, tpl: str, desc: str,
                         schema: dict, title: str) -> str | None:
        """Fill item-gauge.js: find value/total fields from desc + schema."""
        import re

        # Try to find amount-like fields
        value_field = None
        total_field = None

        # Look for fields mentioned in desc
        for name, info in schema.items():
            iface = info.get("interface", "")
            if iface not in ("number", "percent", "integer"):
                continue
            name_lower = name.lower()
            title_lower = info.get("title", "").lower()
            combined = name_lower + title_lower

            if any(kw in combined for kw in
                   ("paid", "received", "collected", "settled", "actual", "realized",
                    "current", "present", "completed", "done")):
                value_field = name
            elif any(kw in combined for kw in
                     ("total", "amount", "contract", "goal", "target",
                      "budget", "planned", "scheduled")):
                total_field = name

        if not value_field:
            # Fallback: first two numeric fields
            numerics = [n for n, i in schema.items()
                        if i.get("interface") in ("number", "percent", "integer")]
            if len(numerics) >= 2:
                value_field, total_field = numerics[0], numerics[1]
            elif numerics:
                value_field = numerics[0]
                total_field = "100"

        if not value_field:
            return None

        code = tpl
        code = code.replace("{VALUE_FIELD}", value_field)
        code = code.replace("{TOTAL_FIELD}", total_field or "100")
        code = code.replace("{LABEL}", title)
        return code

    def _fill_lifecycle_item(self, tpl: str, desc: str,
                             schema: dict) -> str | None:
        """Fill item-lifecycle.js: find status/stage field with enum options."""
        STAGE_COLORS = ["#1890ff", "#52c41a", "#faad14", "#ff4d4f",
                        "#722ed1", "#13c2c2", "#eb2f96", "#999"]

        # Find the best status/stage field
        best_field = None
        best_enums: list = []

        for name, info in schema.items():
            if info.get("interface") != "select":
                continue
            enums = info.get("enum", [])
            if not enums:
                continue
            name_lower = name.lower()
            title_lower = info.get("title", "").lower()
            combined = name_lower + title_lower

            # Prefer fields named stage/status/phase
            is_stage = any(kw in combined for kw in
                          ("stage", "status", "phase", "step", "state", "workflow"))
            if is_stage and len(enums) >= 3:
                best_field = name
                best_enums = enums
                break
            # Fallback to any select with 3+ options
            if not best_field and len(enums) >= 3:
                best_field = name
                best_enums = enums

        if not best_field or not best_enums:
            return None

        stages = [e.get("value", "") for e in best_enums]
        status_colors = {}
        for i, e in enumerate(best_enums):
            status_colors[e.get("value", "")] = STAGE_COLORS[i % len(STAGE_COLORS)]

        code = tpl
        code = code.replace("{STATUS_FIELD}", best_field)
        code = code.replace("{STAGES}",
                            json.dumps(stages, ensure_ascii=False))
        code = code.replace("{STATUS_COLORS}",
                            json.dumps(status_colors, ensure_ascii=False))
        return code

    # ── Page Map ───────────────────────────────────────────────

    def page_map(self, scope: str) -> str:
        """Generate an HTML map showing page structure with UIDs.

        Traverses the FlowModel tree under a scope and generates an HTML file
        that visually shows each node with its UID, type, and key info.
        Useful for debugging and as a UID lookup reference.

        Args:
            scope: Title prefix (e.g. "CRM") to match route groups

        Returns:
            HTML string with the page map
        """
        import html as html_mod

        # Collect routes under scope
        routes = self._get_json("api/desktopRoutes:list?paginate=false&tree=true") or []
        pages = []  # [(title, tab_uid)]

        def collect_children(rts):
            """Recurse into all children once inside matched scope."""
            for rt in rts:
                title = rt.get("title") or ""
                rtype = rt.get("type") or ""
                if rtype == "group":
                    collect_children(rt.get("children", []))
                elif rtype == "flowPage":
                    # Content lives under the "tabs" child, not the flowPage itself
                    for ch in rt.get("children", []):
                        if ch.get("type") == "tabs":
                            tu = ch.get("schemaUid")
                            if tu:
                                pages.append((title, tu))
                                break
                    else:
                        su = rt.get("schemaUid")
                        if su:
                            pages.append((title, su))

        for rt in routes:
            title = rt.get("title") or ""
            if title.upper().startswith(scope.upper()):
                collect_children(rt.get("children", []))

        if not pages:
            return f"<html><body><p>No pages found for scope '{scope}'</p></body></html>"

        # Load all models once
        all_models = self._list_all()
        uid_map = {m["uid"]: m for m in all_models}
        children_map: dict[str, list] = {}
        for m in all_models:
            pid = m.get("parentId", "")
            if pid:
                children_map.setdefault(pid, []).append(m)

        # Type display info
        type_styles = {
            "TableBlockModel": ("Table", "#1890ff", "table"),
            "TableColumnModel": ("Col", "#8c8c8c", "field"),
            "TableActionsColumnModel": ("Actions", "#8c8c8c", "field"),
            "JSColumnModel": ("JS Col", "#722ed1", "js"),
            "JSBlockModel": ("JS Block", "#722ed1", "js"),
            "JSItemModel": ("JS Item", "#722ed1", "js"),
            "FilterFormModel": ("Filter", "#13c2c2", "block"),
            "CreateFormModel": ("Add Form", "#52c41a", "form"),
            "EditFormModel": ("Edit Form", "#fa8c16", "form"),
            "DetailsBlockModel": ("Details", "#2f54eb", "block"),
            "ChildPageModel": ("Popup", "#595959", "popup"),
            "ChildPageTabModel": ("Tab", "#595959", "tab"),
            "BlockGridModel": ("Grid", "#d9d9d9", "grid"),
            "KPIBlockModel": ("KPI", "#eb2f96", "block"),
            "AddNewActionModel": ("AddNew Btn", "#52c41a", "action"),
            "EditActionModel": ("Edit Btn", "#fa8c16", "action"),
        }

        def node_html(m, depth=0) -> str:
            uid_ = m["uid"]
            use = m.get("use", "")
            sp = m.get("stepParams", {})
            parts = []

            # Type label + color
            tinfo = type_styles.get(use, (use.replace("Model", ""), "#595959", "other"))
            label, color, category = tinfo

            # Skip layout/leaf nodes that add noise
            skip_prefixes = (
                "FormGrid", "DetailGrid", "DetailsGrid",
                "Display", "FormItem", "FilterFormItem",
                "DetailsItem", "FormSubmitAction", "RefreshAction",
                "RootPage", "FilterFormGrid", "FilterFormBlock",
                "FilterAction",
            )
            if use.replace("Model", "").startswith(skip_prefixes) or use.startswith(skip_prefixes):
                return ""

            # Extract useful info
            info_parts = []
            rs = sp.get("resourceSettings", {}).get("init", {})
            coll = rs.get("collectionName", "")
            assoc = rs.get("association", "")
            if coll:
                info_parts.append(f"collection={coll}")
            if assoc:
                info_parts.append(f"assoc={assoc}")

            # Field path (TableColumnModel)
            fs = sp.get("fieldSettings", {}).get("init", {})
            field_path = fs.get("fieldPath", "")
            if field_path:
                info_parts.append(f"field={field_path}")

            # Title from various sources
            title = ""
            if "cardSettings" in sp:
                title = sp["cardSettings"].get("titleDescription", {}).get("title", "")
            elif "tableColumnSettings" in sp:
                title = sp["tableColumnSettings"].get("title", {}).get("title", "")
            elif "editItemSettings" in sp:
                title = sp["editItemSettings"].get("showLabel", {}).get("title", "")
            elif "pageTabSettings" in sp:
                title = sp["pageTabSettings"].get("tab", {}).get("title", "")

            # Placeholder detection
            js_code = sp.get("jsSettings", {}).get("runJs", {}).get("code", "")
            is_placeholder = "__placeholder__" in js_code
            placeholder_cls = " placeholder" if is_placeholder else ""
            if is_placeholder:
                # Extract desc
                import re
                match = re.search(r'"desc"\s*:\s*"([^"]*)"', js_code)
                if match:
                    info_parts.append(f'desc="{match.group(1)}"')

            # Event flows
            registry = m.get("flowRegistry") or {}
            for fk, fv in registry.items():
                evt = fv.get("on", {}).get("eventName", "")
                if evt:
                    evt_code = ""
                    for sk, sv in fv.get("steps", {}).items():
                        evt_code = sv.get("defaultParams", {}).get("code", "")
                    is_evt_ph = "__placeholder__" in evt_code
                    tag = "placeholder" if is_evt_ph else "implemented"
                    info_parts.append(f'event={evt} [{tag}]')

            title_html = f" <b>{html_mod.escape(title)}</b>" if title else ""
            info_html = f' <span class="info">{html_mod.escape(", ".join(info_parts))}</span>' if info_parts else ""

            indent = depth * 20
            parts.append(
                f'<div class="node {category}{placeholder_cls}" style="margin-left:{indent}px">'
                f'<span class="type" style="background:{color}">{label}</span>'
                f'<code class="uid" title="Click to copy" onclick="navigator.clipboard.writeText(\'{uid_}\')">{uid_}</code>'
                f'{title_html}{info_html}'
                f'</div>'
            )

            # Recurse into children (sorted by sort)
            children = children_map.get(uid_, [])
            children.sort(key=lambda c: c.get("sort", 0))
            for child in children:
                child_html = node_html(child, depth + 1)
                if child_html:
                    parts.append(child_html)

            return "\n".join(parts)

        # Build page sections
        page_sections = []
        for page_title, tab_uid in pages:
            # Find the root model(s) under this tab
            tab_children = children_map.get(tab_uid, [])
            nodes_html = []
            for child in tab_children:
                h = node_html(child, 0)
                if h:
                    nodes_html.append(h)

            page_sections.append(
                f'<div class="page">'
                f'<h2>{html_mod.escape(page_title)} <code class="uid">{tab_uid}</code></h2>'
                f'{"".join(nodes_html)}'
                f'</div>'
            )

        return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{scope} Page Map</title>
<style>
body {{ font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #fafafa; }}
h1 {{ color: #1a1a1a; border-bottom: 2px solid #1890ff; padding-bottom: 8px; }}
h2 {{ color: #262626; margin-top: 24px; padding: 8px 12px; background: #fff; border-left: 4px solid #1890ff; }}
.page {{ background: #fff; padding: 16px; margin: 12px 0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }}
.node {{ padding: 3px 0; font-size: 13px; white-space: nowrap; }}
.node.js {{ background: #f9f0ff; margin: 2px 0; padding: 3px 6px; border-radius: 4px; }}
.node.placeholder {{ border-left: 3px solid #722ed1; background: #f0e6ff; }}
.type {{ color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; margin-right: 4px; }}
.uid {{ font-size: 11px; color: #1890ff; background: #e6f7ff; padding: 1px 4px; border-radius: 2px; cursor: pointer; margin-right: 4px; }}
.uid:hover {{ background: #1890ff; color: #fff; }}
.info {{ color: #8c8c8c; font-size: 11px; }}
b {{ color: #262626; }}
</style></head>
<body>
<h1>{scope} — Page Map (UID Index)</h1>
<p style="color:#8c8c8c">Click any <code class="uid">uid</code> to copy. Purple nodes = JS (placeholder/implemented).</p>
{"".join(page_sections)}
</body></html>"""

    # ── AI Employee ────────────────────────────────────────────

    def ai_employee_create(self, username: str, nickname: str, position: str, avatar: str,
                           bio: str, about: str, greeting: str, skills: list,
                           model_settings: Optional[dict] = None) -> str:
        """Create an AI employee. Returns username."""
        values = {
            "username": username,
            "nickname": nickname,
            "position": position,
            "avatar": avatar,
            "bio": bio,
            "about": about,
            "greeting": greeting,
            "enabled": True,
            "builtIn": False,
            "skillSettings": {"skills": skills},
            "modelSettings": model_settings or {
                "llmService": "gemini",
                "model": "models/gemini-2.5-flash",
                "temperature": 0.7, "topP": 1,
                "frequencyPenalty": 0, "presencePenalty": 0,
                "timeout": 60000, "maxRetries": 1,
                "responseFormat": "text",
            },
            "enableKnowledgeBase": False,
            "knowledgeBase": {"topK": 3, "score": "0.6", "knowledgeBaseIds": []},
            "knowledgeBasePrompt": "From knowledge base:\n{knowledgeBaseData}\nanswer user's question using this information.",
        }
        result = self._post_json("api/aiEmployees:create", json=values)
        return (result or {}).get("username", username)

    def ai_employee_list(self) -> list:
        """List all AI employees."""
        return self._get_json("api/aiEmployees:list?paginate=false") or []

    def ai_employee_get(self, username: str) -> dict:
        """Get AI employee by username."""
        return self._get_json(f"api/aiEmployees:get?filterByTk={username}") or {}

    def ai_employee_update(self, username: str, values: dict) -> bool:
        """Update AI employee fields."""
        # Fix: skillSettings must be {"skills": [...]} not bare [...]
        ss = values.get("skillSettings")
        if isinstance(ss, list):
            values["skillSettings"] = {"skills": ss}
        r = self._post(f"api/aiEmployees:update?filterByTk={username}", json=values)
        return r.ok

    def ai_employee_delete(self, username: str) -> bool:
        """Delete AI employee by username."""
        r = self._post(f"api/aiEmployees:destroy?filterByTk={username}")
        return r.ok

    def ai_shortcut_list(self, page_schema_uid: str, employees: list) -> str:
        """Create floating avatar shortcuts on a page.

        Args:
            page_schema_uid: Tab schemaUid of the page
            employees: list of dicts [{username, tasks: [{title, system, user}]}]
        Returns: container UID
        """
        container_uid = f"ai-shortcuts-{page_schema_uid}"
        self.save("AIEmployeeShortcutListModel", page_schema_uid,
                  "ai-shortcuts", "object", sp={}, u=container_uid)
        for i, emp in enumerate(employees):
            tasks = emp.get("tasks", [])
            sp = {"shortcutSettings": {"editTasks": {"tasks": tasks}}} if tasks else {}
            self.save("AIEmployeeShortcutModel", container_uid,
                      "shortcuts", "array",
                      sp=sp, sort=i,
                      props={"aiEmployee": {"username": emp["username"]}})
        return container_uid

    def ai_button(self, block_uid: str, username: str, tasks: Optional[list] = None) -> str:
        """Create AI employee button in a block's action bar.

        Args:
            block_uid: TableBlockModel or CreateFormModel UID
            username: AI employee username
            tasks: list of task dicts [{title, message: {system, user}, autoSend}]
        Returns: button UID
        """
        sp = {}
        if tasks:
            sp = {"shortcutSettings": {"editTasks": {"tasks": tasks}}}
        return self.save("AIEmployeeButtonModel", block_uid, "actions", "array",
                         sp=sp, sort=98,
                         props={
                             "aiEmployee": {"username": username},
                             "context": {"workContext": [
                                 {"type": "flow-model", "uid": block_uid}
                             ]},
                             "auto": False,
                         })

    # ── Workflow API ─────────────────────────────────────────────

    def workflow_list(self, enabled: Optional[bool] = None, prefix: Optional[str] = None) -> list:
        """List workflows (current versions only).

        Args:
            enabled: True/False to filter, None for all
            prefix: filter by title prefix (e.g. "AM-")
        Returns: list of workflow dicts
        """
        params = {"pageSize": 200}
        if enabled is not None:
            params["filter[enabled]"] = str(enabled).lower()
        r = self._get("api/workflows:list", params=params)
        if not r.ok:
            return []
        wfs = [w for w in r.json().get("data", []) if w.get("current", True)]
        if prefix:
            wfs = [w for w in wfs if w.get("title", "").startswith(prefix)]
        return wfs

    def workflow_get(self, wf_id: int) -> tuple:
        """Get workflow details + its nodes.

        Returns: (workflow_dict, nodes_list)
        """
        r = self._get(f"api/workflows:get?filterByTk={wf_id}")
        if not r.ok:
            return None, []
        wf = r.json().get("data")
        r2 = self._get(f"api/workflows/{wf_id}/nodes:list")
        nodes = r2.json().get("data", []) if r2.ok else []
        return wf, nodes

    def workflow_create(self, title: str, trigger_type: str, trigger_config: dict,
                        sync: bool = False) -> Optional[dict]:
        """Create a workflow.

        Args:
            title: workflow title
            trigger_type: 'collection', 'schedule', or 'action'
            trigger_config: trigger configuration dict
            sync: synchronous execution (default False)
        Returns: workflow dict or None
        """
        data = {
            "title": title,
            "type": trigger_type,
            "config": trigger_config,
            "enabled": False,
            "sync": sync,
        }
        r = self._post("api/workflows:create", json=data)
        if not r.ok:
            return None
        return r.json().get("data")

    def workflow_update(self, wf_id: int, values: dict) -> bool:
        """Update workflow fields (enabled, title, config, etc.)."""
        r = self._post(f"api/workflows:update?filterByTk={wf_id}", json=values)
        return r.ok

    def workflow_delete(self, wf_id: int) -> bool:
        """Delete a workflow (auto-disables first)."""
        self._post(f"api/workflows:update?filterByTk={wf_id}",
                   json={"enabled": False})
        r = self._post(f"api/workflows:destroy?filterByTk={wf_id}")
        return r.ok

    def workflow_node_create(self, wf_id: int, node_type: str, title: str, config: dict,
                              upstream_id: Optional[int] = None,
                              branch_index: Optional[int] = None) -> Optional[dict]:
        """Create a workflow node.

        Args:
            wf_id: workflow ID
            node_type: 'condition', 'update', 'create', 'query', 'sql',
                       'request', 'loop', 'end'
            title: node title
            config: node configuration dict
            upstream_id: ID of upstream node (for linking)
            branch_index: branch index (1=true, 0=false for conditions;
                          1=loop body for loops; None=main line)
        Returns: node dict or None
        """
        data = {"type": node_type, "title": title, "config": config}
        if upstream_id is not None:
            data["upstreamId"] = upstream_id
        if branch_index is not None:
            data["branchIndex"] = branch_index
        r = self._post(f"api/workflows/{wf_id}/nodes:create", json=data)
        if not r.ok:
            return None
        return r.json().get("data")

    def workflow_node_update(self, node_id: int, values: dict) -> bool:
        """Update a workflow node."""
        r = self._post(f"api/flow_nodes:update?filterByTk={node_id}", json=values)
        return r.ok

    def workflow_node_delete(self, node_id: int) -> bool:
        """Delete a workflow node."""
        r = self._post(f"api/flow_nodes:destroy?filterByTk={node_id}")
        return r.ok

    # ── Route helpers ─────────────────────────────────────────

    def list_routes(self) -> list:
        """List all desktop routes as a flat list."""
        return self._get_json("api/desktopRoutes:list?paginate=false&tree=true") or []

    def delete_route(self, route_id: int) -> bool:
        """Delete a route and its children."""
        r = self._post(f"api/desktopRoutes:destroy?filterByTk={route_id}")
        return r.ok

    # ── Data Modeling ──────────────────────────────────────────

    _last_global_sync = 0.0

    def execute_sql(self, sql: str, db_url: str | None = None) -> str:
        """Execute raw SQL against PostgreSQL. Auto-adds system columns for CREATE TABLE."""
        db_url = db_url or os.environ.get(
            "NB_DB_URL", "postgresql://nocobase:nocobase@localhost:5435/nocobase")
        # Auto-add system columns for CREATE TABLE
        import re
        for m in re.finditer(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["\']?(\w+)', sql, re.I):
            self._ensure_system_columns(m.group(1), db_url)
        return self._run_sql(sql, db_url)

    def _run_sql(self, sql: str, db_url: str) -> str:
        try:
            import psycopg2
            with psycopg2.connect(db_url) as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(sql)
                    if cur.description:
                        rows = cur.fetchall()
                        return "\n".join("\t".join(str(c) for c in r) for r in rows)
                    return f"OK ({cur.rowcount} rows)"
        except ImportError:
            import subprocess
            result = subprocess.run(["psql", db_url, "-c", sql],
                                    capture_output=True, text=True, timeout=30)
            return result.stdout if result.returncode == 0 else f"ERROR: {result.stderr}"

    @staticmethod
    def _ensure_system_columns(table_name: str, db_url: str):
        sql = f'''
            ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
            ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
            ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "createdById" BIGINT;
            ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS "updatedById" BIGINT;
        '''
        try:
            import psycopg2
            with psycopg2.connect(db_url) as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(sql)
        except Exception:
            import subprocess
            subprocess.run(["psql", db_url, "-c", sql],
                           capture_output=True, text=True, timeout=10)

    def register_collection(self, name: str, title: str, tree: str | None = None) -> str:
        """Register an existing DB table as a NocoBase collection."""
        payload = {"name": name, "title": title, "autoCreate": False, "timestamps": False}
        if tree:
            payload["tree"] = tree
        try:
            self._post_json("api/collections:create", json=payload)
            return f"Registered: {name}"
        except APIError as e:
            if "duplicate" in str(e.body).lower() or e.code == 500:
                return f"Already exists: {name}"
            raise

    def sync_fields(self, collection: str | None = None) -> str:
        """Sync DB columns into NocoBase field metadata."""
        db_url = os.environ.get(
            "NB_DB_URL", "postgresql://nocobase:nocobase@localhost:5435/nocobase")
        if collection:
            self._ensure_system_columns(collection, db_url)
        # Debounced global sync
        now = time.time()
        if now - NB._last_global_sync >= 30:
            self._post("api/mainDataSource:syncFields", timeout=60)
            NB._last_global_sync = time.time()
        # Create system field metadata
        if collection:
            existing = {f["name"] for f in
                        (self._get_json(f"api/collections/{collection}/fields:list?paginate=false") or [])}
            for sf in SYSTEM_FIELD_PAYLOADS:
                if sf["name"] not in existing:
                    try:
                        self._post_json(f"api/collections/{collection}/fields:create", json=sf)
                    except APIError:
                        pass
        return "OK"

    def setup_collection(self, name: str, title: str, fields: list | None = None,
                         relations: list | None = None, tree: str | None = None,
                         title_field: str | None = None) -> str:
        """All-in-one: register + sync + upgrade fields + create relations + set titleField."""
        self.register_collection(name, title, tree)
        self.sync_fields(name)
        # Set titleField
        self._auto_title_field(name, title_field)
        # Upgrade field interfaces
        if fields:
            for f in fields:
                fname = f.get("name", "")
                iface = f.get("interface", "")
                if iface and iface != "input":
                    self.upgrade_field(name, fname, iface,
                                       enum=f.get("enum"), title=f.get("title"),
                                       precision=f.get("precision"))
        # Create relations
        if relations:
            for r in relations:
                self.create_relation(name, r["field"], r["type"], r["target"],
                                     foreign_key=r.get("foreign_key"),
                                     label=r.get("label", "id"),
                                     title=r.get("title"))
        return f"Setup complete: {name} ({title})"

    def _auto_title_field(self, collection: str, explicit: str | None = None):
        """Auto-detect and set titleField on a collection."""
        if explicit:
            self._post("api/collections:update?filterByTk=" + collection,
                       json={"titleField": explicit})
            return explicit
        # Check current
        import urllib.parse as _up
        try:
            colls = self._get_json(
                "api/collections:list?paginate=false&filter="
                + _up.quote(json.dumps({"name": collection})))
            if colls and colls[0].get("titleField") and colls[0]["titleField"] != "id":
                return colls[0]["titleField"]
        except (APIError, Exception):
            pass
        # Detect from fields
        candidates = ("name", "title", "label", "subject", "code")
        try:
            flds = self._get_json(f"api/collections/{collection}/fields:list?paginate=false") or []
            inputs = [f["name"] for f in flds
                      if f.get("interface") in ("input", "sequence")
                      and f["name"] not in ("id", "createdById", "updatedById")
                      and not f["name"].endswith("Id") and not f["name"].startswith("f_")]
            best = "id"
            for c in candidates:
                if c in inputs:
                    best = c
                    break
            if best == "id" and inputs:
                best = inputs[0]
            if best != "id":
                self._post("api/collections:update?filterByTk=" + collection,
                           json={"titleField": best})
            return best
        except (APIError, Exception):
            return "id"

    def list_collections(self, prefix: str | None = None) -> list:
        """List registered collections. Optional name prefix filter."""
        colls = self._get_json("api/collections:list?paginate=false") or []
        if prefix:
            colls = [c for c in colls if c.get("name", "").startswith(prefix)]
        return [{"name": c["name"], "title": c.get("title", "")} for c in colls]

    def upgrade_field(self, collection: str, field: str, interface: str,
                      enum: list | None = None, title: str | None = None,
                      precision: int | None = None) -> str:
        """Upgrade a field's interface type (input → select/date/number/etc)."""
        flds = self._get_json(f"api/collections/{collection}/fields:list?paginate=false") or []
        target = None
        for f in flds:
            if f["name"] == field:
                target = f
                break
        if not target:
            return f"Field not found: {collection}.{field}"
        extra = {}
        if enum is not None:
            extra["enum"] = enum
        if title:
            extra["title"] = title
        if precision is not None:
            extra["precision"] = precision
        from .tools.fields import _build_field_update
        payload = _build_field_update(field, interface, extra, target.get("uiSchema", {}).get("title"))
        if not payload:
            return f"Unknown interface: {interface}"
        key = target.get("key") or f"{collection}.{field}"
        self._post("api/fields:update?filterByTk=" + str(key), json=payload)
        return f"Upgraded: {collection}.{field} → {interface}"

    def create_relation(self, collection: str, field: str, type: str, target: str,
                        foreign_key: str | None = None, label: str = "id",
                        title: str | None = None, other_key: str | None = None,
                        through: str | None = None) -> str:
        """Create a relation field (m2o/o2m/m2m/o2o)."""
        # Check if already exists
        flds = self._get_json(f"api/collections/{collection}/fields:list?paginate=false") or []
        if any(f["name"] == field for f in flds):
            return f"Already exists: {collection}.{field}"
        type_map = {"m2o": "belongsTo", "o2m": "hasMany", "m2m": "belongsToMany", "o2o": "hasOne"}
        rel_type = type_map.get(type, type)
        # Auto titleField on target
        if label == "id":
            label = self._auto_title_field(target)
        fk = foreign_key or f"{field}Id" if rel_type == "belongsTo" else foreign_key
        payload = {
            "name": field, "type": rel_type, "interface": "m2o" if rel_type == "belongsTo" else type,
            "target": target, "uiSchema": {"title": title or field.replace("_", " ").title(),
                                            "x-component": "AssociationField"},
            "fieldNames": {"label": label, "value": "id"},
        }
        if fk:
            payload["foreignKey"] = fk
        if other_key:
            payload["otherKey"] = other_key
        if through:
            payload["through"] = through
        self._post_json(f"api/collections/{collection}/fields:create", json=payload)
        self._field_cache.pop(collection, None)  # invalidate cache
        return f"Created: {collection}.{field} → {target} ({type})"

    def clean_prefix(self, prefix: str) -> str:
        """Delete all collections, DB tables, workflows, and routes matching a prefix."""
        # Delete collections via API
        colls = self.list_collections(prefix)
        for c in colls:
            try:
                self._post(f"api/collections:destroy?filterByTk={c['name']}")
            except Exception:
                pass
        # Drop DB tables
        db_url = os.environ.get(
            "NB_DB_URL", "postgresql://nocobase:nocobase@localhost:5435/nocobase")
        try:
            tables_sql = f"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '{prefix}%'"
            result = self._run_sql(tables_sql, db_url)
            for line in result.strip().split("\n"):
                tbl = line.strip()
                if tbl and tbl.startswith(prefix):
                    self._run_sql(f'DROP TABLE IF EXISTS "{tbl}" CASCADE', db_url)
        except Exception:
            pass
        # Delete workflows
        try:
            wfs = self.workflow_list(prefix=prefix)
            for wf in wfs:
                self.workflow_delete(wf["id"])
        except Exception:
            pass
        return f"Cleaned: {len(colls)} collections with prefix '{prefix}'"

    # ── Page Inspection & Mutation ─────────────────────────────

    def _get_page_tool(self):
        """Lazy-import PageTool to avoid circular imports."""
        from .tools.page_tool import PageTool
        return PageTool(self)

    def inspect_page(self, title_or_tu: str, depth: int = 1) -> str:
        """View page structure as a human-readable tree."""
        pt = self._get_page_tool()
        if depth == 0:
            return pt.inspect_compact(title_or_tu)
        return pt.inspect(title_or_tu)

    def locate_node(self, scope: str, block: str | None = None,
                    field: str | None = None) -> str | None:
        """Find a node UID by block type or field name."""
        pt = self._get_page_tool()
        return pt.locate(scope, block=block, field=field)

    def read_node(self, uid: str, include: str = "all") -> dict:
        """Read full node config: stepParams, events, JS code, linkage rules."""
        node = self._get_json(f"api/flowModels:get?filterByTk={uid}")
        if not node:
            return {"error": f"Node not found: {uid}"}
        opts = node.get("options", node)
        sp = opts.get("stepParams", {})
        fr = opts.get("flowRegistry", {})
        if include == "js":
            code = sp.get("jsSettings", {}).get("runJs", {}).get("code", "")
            return {"uid": uid, "code": code, "length": len(code)}
        if include == "events":
            events = []
            for key, flow in fr.items():
                events.append({"key": key, "event": flow.get("on", ""),
                               "title": flow.get("title", ""), "has_code": bool(flow.get("steps"))})
            return {"uid": uid, "events": events}
        return {"uid": uid, "use": opts.get("use"), "stepParams": sp,
                "flowRegistry_keys": list(fr.keys())}

    def patch_field(self, uid: str, **props) -> bool:
        """Patch form field properties (required, default, hidden, description, etc)."""
        eis = {}
        mapping = {
            "description": ("description", "description"),
            "default_value": ("initialValue", "defaultValue"),
            "placeholder": ("placeholder", "placeholder"),
            "tooltip": ("tooltip", "tooltip"),
            "hidden": ("hidden", "hidden"),
            "disabled": ("disabled", "disabled"),
            "required": ("required", "required"),
            "pattern": ("pattern", "pattern"),
        }
        for prop, val in props.items():
            if prop in mapping:
                section, key = mapping[prop]
                eis.setdefault(section, {})[key] = val
        return self.update(uid, {"stepParams": {"editItemSettings": eis}})

    def patch_column(self, uid: str, **props) -> bool:
        """Patch table column properties (width, title)."""
        tcs = {}
        if "width" in props:
            tcs.setdefault("width", {})["width"] = props["width"]
        if "title" in props:
            tcs.setdefault("title", {})["title"] = props["title"]
        return self.update(uid, {"stepParams": {"tableColumnSettings": tcs}})

    # add_field, remove_field, add_column, remove_column delegate to existing methods
    # nb.form_field(), nb.col(), nb.destroy_tree() already handle the core logic.
    # The grid update is the tricky part — handled here.

    def add_field_to_form(self, grid_uid: str, collection: str, field: str,
                          required: bool = False) -> str:
        """Add a field to an existing form grid and update gridSettings."""
        # Find max sort
        all_models = self._list_all()
        children = [m for m in all_models if m.get("parentId") == grid_uid]
        max_sort = max((m.get("sortIndex", 0) for m in children), default=0) + 1
        # Create field
        field_uid = self.form_field(grid_uid, collection, field, max_sort, required=required)
        # Update grid rows
        node = self._get_json(f"api/flowModels:get?filterByTk={grid_uid}")
        opts = node.get("options", node)
        gs = opts.get("stepParams", {}).get("gridSettings", {}).get("grid", {})
        rows = gs.get("rows", {})
        sizes = opts.get("stepParams", {}).get("gridSettings", {}).get("sizes", {})
        from .utils import uid as gen_uid
        row_id = gen_uid()
        rows[row_id] = [[field_uid]]
        sizes[row_id] = [24]
        self.update(grid_uid, {"stepParams": {"gridSettings": {"grid": {"rows": rows}, "sizes": sizes}}})
        return field_uid

    def remove_node(self, uid: str) -> int:
        """Remove a node and all its children (works for fields, columns, blocks)."""
        return self.destroy_tree(uid)

    def add_column_to_table(self, table_uid: str, collection: str, field: str,
                            width: int | None = None) -> str:
        """Add a column to an existing table."""
        all_models = self._list_all()
        cols = [m for m in all_models
                if m.get("parentId") == table_uid and m.get("subKey") == "columns"]
        max_sort = max((m.get("sortIndex", 0) for m in cols), default=0) + 1
        return self.col(table_uid, collection, field, max_sort, width=width)

    # ── Summary ────────────────────────────────────────────────

    def summary(self) -> dict:
        result = {"created": self.created, "errors": self.errors[:10]}
        if self.warnings:
            result["warnings"] = self.warnings[:10]
        return result


def get_nb_client() -> NB:
    """Get a configured NB client from environment variables."""
    return NB(
        base_url=os.environ.get("NB_URL", "http://localhost:14000"),
        account=os.environ.get("NB_USER", "admin@nocobase.com"),
        password=os.environ.get("NB_PASSWORD", "admin123"),
    )


def get_stdlib_client() -> NocoBaseClient:
    """Get a configured NocoBaseClient (stdlib) from environment variables."""
    client = NocoBaseClient(
        base_url=os.environ.get("NB_URL", "http://localhost:14000"),
        user=os.environ.get("NB_USER", "admin@nocobase.com"),
        password=os.environ.get("NB_PASSWORD", "admin123"),
    )
    client.login()
    return client
