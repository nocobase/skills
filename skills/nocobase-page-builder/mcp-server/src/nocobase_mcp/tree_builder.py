"""Tree-based FlowModel page builder — build entire pages in memory, submit once.

Instead of 70-80 individual HTTP calls per CRUD page, TreeBuilder constructs the
complete FlowModel tree in memory, then submits it via a single flowModels:save
with nested subModels.

Key classes:
    TreeNode    — in-memory FlowModel node with recursive serialization
    TreeBuilder — pure-memory builder (0 HTTP during construction, only metadata queries)

Usage:
    tb = TreeBuilder(nb)
    root, meta = tb.crud_page(tab_uid, coll, table_fields, form_fields_dsl, ...)
    nb.save_tree(root, tab_uid)
"""

from __future__ import annotations

import json
import copy
from typing import Any, Optional, TYPE_CHECKING

from .utils import uid
from .models import DISPLAY_MAP, EDIT_MAP, STEP_PARAMS_TEMPLATES, MODEL_DEFS, validate_parent_child
from .client import (
    _normalize_fields, _parse_field_name,
)

if TYPE_CHECKING:
    from .client import NB


class TreeNode:
    """In-memory FlowModel node that serializes to nested subModels JSON."""

    def __init__(self, use: str, step_params: dict | None = None,
                 sort_index: int = 0, u: str | None = None, **extra):
        self.uid = u or uid()
        self.use = use
        self.step_params = dict(step_params) if step_params else {}
        self.sort_index = sort_index
        self.flow_registry = {}
        self._sub_models: dict[str, list[TreeNode] | TreeNode] = {}
        self._extra = extra  # filterManager, etc.

    def add_child(self, sub_key: str, sub_type: str, child: TreeNode,
                  validate: bool = False) -> TreeNode:
        """Attach a child node. sub_type='array' → list, 'object' → single.

        If validate=True, checks parent-child relationship against MODEL_DEFS.
        """
        if validate and not validate_parent_child(self.use, sub_key, child.use):
            raise ValueError(
                f"{self.use} does not accept sub_key '{sub_key}' "
                f"(child: {child.use})")
        if sub_type == "object":
            self._sub_models[sub_key] = child
        else:
            self._sub_models.setdefault(sub_key, [])
            lst = self._sub_models[sub_key]
            if not isinstance(lst, list):
                raise ValueError(f"sub_key '{sub_key}' already set as object, cannot add array child")
            lst.append(child)
        return child

    def to_dict(self, parent_id: str | None = None,
                sub_key: str | None = None,
                sub_type: str | None = None) -> dict:
        """Recursively serialize to flowModels:save API JSON format."""
        d: dict[str, Any] = {
            "uid": self.uid,
            "use": self.use,
            "stepParams": self.step_params,
            "sortIndex": self.sort_index,
            "flowRegistry": self.flow_registry,
        }
        if parent_id is not None:
            d["parentId"] = parent_id
        if sub_key is not None:
            d["subKey"] = sub_key
        if sub_type is not None:
            d["subType"] = sub_type
        d.update(self._extra)

        # Recursively serialize children — direct array/object format
        # (matches NocoBase client serialize(): Array.isArray(subItems) check)
        if self._sub_models:
            sub = {}
            for key, val in self._sub_models.items():
                if isinstance(val, list):
                    sub[key] = [
                        child.to_dict(parent_id=self.uid, sub_key=key, sub_type="array")
                        for child in val
                    ]
                else:
                    sub[key] = val.to_dict(parent_id=self.uid, sub_key=key, sub_type="object")
            d["subModels"] = sub

        return d

    def count_nodes(self) -> int:
        """DFS count of all nodes in this subtree (inclusive)."""
        total = 1
        for val in self._sub_models.values():
            if isinstance(val, list):
                for child in val:
                    total += child.count_nodes()
            else:
                total += val.count_nodes()
        return total

    def to_flat_list(self, parent_id: str | None = None,
                     sub_key: str | None = None,
                     sub_type: str | None = None) -> list[dict]:
        """Flatten tree to ordered list of individual save payloads (parent-first BFS).

        Each payload is a flat dict ready for flowModels:save — the format that
        correctly preserves subType on each record.
        """
        result = []
        d: dict[str, Any] = {
            "uid": self.uid,
            "use": self.use,
            "stepParams": self.step_params,
            "sortIndex": self.sort_index,
            "flowRegistry": self.flow_registry,
        }
        if parent_id is not None:
            d["parentId"] = parent_id
        if sub_key is not None:
            d["subKey"] = sub_key
        if sub_type is not None:
            d["subType"] = sub_type
        d.update(self._extra)
        result.append(d)

        # Recurse children in stable order
        for key, val in self._sub_models.items():
            if isinstance(val, list):
                for child in val:
                    result.extend(child.to_flat_list(
                        parent_id=self.uid, sub_key=key, sub_type="array"))
            else:
                result.extend(val.to_flat_list(
                    parent_id=self.uid, sub_key=key, sub_type="object"))

        return result


class TreeBuilder:
    """Pure-memory FlowModel page builder.

    Construction methods build TreeNode trees with 0 HTTP calls.
    Only metadata queries (_iface, _target, _label) go to the network.
    """

    def __init__(self, nb: NB):
        self.nb = nb

    # ── Metadata helpers (delegate to NB) ──────────────────────

    def _iface(self, coll: str, field: str) -> str:
        return self.nb._iface(coll, field)

    def _target(self, coll: str, field: str) -> str:
        return self.nb._target(coll, field)

    def _label(self, target_coll: str) -> str:
        return self.nb._label(target_coll)

    def _load_meta(self, coll: str):
        self.nb._load_meta(coll)

    def _filter_fields(self, coll: str, fields: list) -> list:
        """Filter field list to only existing fields. Appends warnings for skipped."""
        valid, _ = self.nb._filter_valid_fields(coll, fields)
        return valid

    def _valid_collection(self, coll: str) -> bool:
        """Check if collection exists and has registered fields."""
        return self.nb._valid_collection(coll)

    # ── Atomic node builders ───────────────────────────────────

    def column_node(self, coll: str, field: str, idx: int,
                    click: bool = False, width: int | None = None) -> TreeNode:
        """TableColumnModel + nested DisplayFieldModel."""
        iface = self._iface(coll, field)
        display = DISPLAY_MAP.get(iface, "DisplayTextFieldModel")

        col_sp: dict[str, Any] = {
            **STEP_PARAMS_TEMPLATES["field_init"](coll, field),
            "tableColumnSettings": {"model": {"use": display}},
        }
        if width:
            col_sp["tableColumnSettings"]["width"] = {"width": width}

        col_node = TreeNode("TableColumnModel", col_sp, idx)

        # Display field child
        fsp: dict[str, Any] = {
            "popupSettings": {"openView": {
                "collectionName": coll, "dataSourceKey": "main"}},
        }
        if iface == "m2o":
            t = self._target(coll, field)
            if t:
                fsp["displayFieldSettings"] = {"fieldNames": {"label": self._label(t)}}

        field_node = TreeNode(display, fsp, 0)

        if click:
            # Modify field_node.step_params directly (not fsp) because
            # TreeNode.__init__ shallow-copies — new keys on fsp won't propagate
            field_node.step_params["popupSettings"]["openView"].update({
                "mode": "drawer", "size": "large",
                "pageModelClass": "ChildPageModel", "uid": field_node.uid,
            })
            field_node.step_params.setdefault("displayFieldSettings", {})["clickToOpen"] = {"clickToOpen": True}

        col_node.add_child("field", "object", field_node)
        return col_node

    # ── Built-in JS column templates (DSL expansion) ──────────────────

    _JS_COL_TEMPLATES: dict[str, str] = {
        "composite": (
            "const r=ctx.record||{};const h=ctx.React.createElement;"
            "const v=function(f){var x=r[f];return typeof x==='object'&&x!==null?x.name||x.title||x.label||'':x};"
            "ctx.render(h('div',null,"
            "h('div',{style:{fontWeight:500,fontSize:13,lineHeight:'20px',color:'#1890ff'}},"
            "v('{field}')||'-'),"
            "h('div',{style:{color:'#8c8c8c',fontSize:12,marginTop:2}},"
            "[{subs_str}].map(function(f){return v(f)}).filter(Boolean).join(' \\u00b7 ')||'')));"
        ),
        "currency": (
            "const v=Number((ctx.record||{}).{field})||0;"
            "ctx.render(ctx.React.createElement('span',"
            "{style:{fontFamily:'monospace',color:v>={threshold}?'#cf1322':'#333'}},"
            "'\\u00a5'+v.toLocaleString('zh-CN',{minimumFractionDigits:2})));"
        ),
        "countdown": (
            "const d=(ctx.record||{}).{field};"
            "if(!d){ctx.render(ctx.React.createElement('span',{style:{color:'#bbb'}},'-'));return;}"
            "const diff=Math.ceil((new Date(d)-new Date())/86400000);"
            "const color=diff<0?'#cf1322':diff<7?'#fa8c16':diff<30?'#d46b08':'#52c41a';"
            "const text=diff<0?'\\u5df2\\u903e\\u671f'+(-diff)+'\\u5929':"
            "diff===0?'\\u4eca\\u5929':'\\u8fd8\\u5269'+diff+'\\u5929';"
            "ctx.render(ctx.React.createElement('span',{style:{color:color,fontWeight:500}},text));"
        ),
        "progress": (
            "const v=Math.min(100,Math.max(0,Number((ctx.record||{}).{field})||0));"
            "const h=ctx.React.createElement;const color=v>=80?'#52c41a':v>=50?'#1890ff':"
            "v>=30?'#faad14':'#ff4d4f';"
            "ctx.render(h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},"
            "h('div',{style:{flex:1,height:'6px',background:'#f0f0f0',borderRadius:'3px',overflow:'hidden'}},"
            "h('div',{style:{width:v+'%',height:'100%',background:color,borderRadius:'3px'}})),"
            "h('span',{style:{fontSize:'12px',color:color,minWidth:'36px'}},v+'%')));"
        ),
        "relative_time": (
            "const d=(ctx.record||{}).{field};"
            "if(!d){ctx.render(ctx.React.createElement('span',{style:{color:'#bbb'}},'-'));return;}"
            "const s=Math.floor((Date.now()-new Date(d))/1000);"
            "const t=s<60?s+'\\u79d2\\u524d':s<3600?Math.floor(s/60)+'\\u5206\\u949f\\u524d':"
            "s<86400?Math.floor(s/3600)+'\\u5c0f\\u65f6\\u524d':"
            "s<2592000?Math.floor(s/86400)+'\\u5929\\u524d':Math.floor(s/2592000)+'\\u6708\\u524d';"
            "ctx.render(ctx.React.createElement('span',{style:{color:'#8c8c8c',fontSize:'13px'}},t));"
        ),
        "stars": (
            "const v=Math.min(5,Math.max(0,Math.round(Number((ctx.record||{}).{field})||0)));"
            "const s='\\u2605'.repeat(v)+'\\u2606'.repeat(5-v);"
            "ctx.render(ctx.React.createElement('span',{style:{color:'#faad14',letterSpacing:'2px'}},s));"
        ),
        "comparison": (
            "const r=ctx.record||{};const h=ctx.React.createElement;"
            "const t=Number(r.{target})||1;const a=Number(r.{actual})||0;"
            "const pct=Math.min(100,Math.round(a/t*100));"
            "const color=pct>=100?'#52c41a':pct>=60?'#1890ff':'#ff4d4f';"
            "ctx.render(h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},"
            "h('div',{style:{flex:1,height:'6px',background:'#f0f0f0',borderRadius:'3px',overflow:'hidden'}},"
            "h('div',{style:{width:pct+'%',height:'100%',background:color,borderRadius:'3px'}})),"
            "h('span',{style:{fontSize:'12px',color:color,minWidth:'36px'}},pct+'%')));"
        ),
    }

    _JS_COL_DEFAULTS: dict[str, dict[str, Any]] = {
        "composite": {"width": 200},
        "currency": {"width": 120, "threshold": 100000},
        "countdown": {"width": 100},
        "progress": {"width": 120},
        "relative_time": {"width": 100},
        "stars": {"width": 100},
        "comparison": {"width": 120},
    }

    @classmethod
    def _expand_js_column(cls, spec: dict) -> tuple[str, str, int | None]:
        """Expand a DSL js_column spec into (title, code, width).

        DSL format: {"type": "composite", "title": "Customer", "field": "name",
                     "subs": ["city", "source"], "width": 200}
        Legacy format: {"title": "...", "code": "...", "width": 120}
        """
        if "code" in spec:
            return spec["title"], spec["code"], spec.get("width")

        col_type = spec.get("type", "")
        template = cls._JS_COL_TEMPLATES.get(col_type)
        if not template:
            raise ValueError(f"Unknown js_column type: {col_type!r}. "
                             f"Available: {list(cls._JS_COL_TEMPLATES.keys())}")

        defaults = cls._JS_COL_DEFAULTS.get(col_type, {})
        title = spec.get("title", spec.get("field", col_type))
        width = spec.get("width", defaults.get("width"))
        field = spec.get("field", "")

        if col_type == "composite":
            subs = spec.get("subs", [])
            subs_str = ",".join(f'"{s}"' for s in subs)
            code = template.replace("{field}", field).replace("{subs_str}", subs_str)
        elif col_type == "currency":
            threshold = spec.get("threshold", defaults.get("threshold", 100000))
            code = template.replace("{field}", field).replace("{threshold}", str(threshold))
        elif col_type == "comparison":
            code = template.replace("{target}", spec.get("target", "target")) \
                           .replace("{actual}", spec.get("actual", "actual"))
        else:
            code = template.replace("{field}", field)

        return title, code, width

    def js_column_node(self, title: str, code: str, sort: int = 50,
                       width: int | None = None) -> TreeNode:
        """JSColumnModel — custom JS-rendered column in a table."""
        sp: dict[str, Any] = {
            "jsSettings": {"runJs": {"version": "v1", "code": code}},
            "tableColumnSettings": {"title": {"title": title}},
        }
        if width:
            sp["tableColumnSettings"]["width"] = {"width": width}
        return TreeNode("JSColumnModel", sp, sort)

    def form_item_node(self, coll: str, field: str, idx: int,
                       required: bool = False, props: dict | None = None) -> TreeNode:
        """FormItemModel + nested EditFieldModel."""
        iface = self._iface(coll, field)
        edit = EDIT_MAP.get(iface, "InputFieldModel")
        props = props or {}

        sp: dict[str, Any] = STEP_PARAMS_TEMPLATES["field_init"](coll, field)
        eis: dict[str, Any] = {}
        if required:
            eis["required"] = {"required": True}
        dv = props.get("defaultValue")
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

        item_node = TreeNode("FormItemModel", sp, idx)

        # RecordSelect / SubForm / SubTable need their own fieldSettings
        # to resolve the association target on the frontend.
        edit_sp: dict[str, Any] = {}
        if edit in ("SubFormFieldModel", "SubTableFieldModel"):
            edit_sp["fieldSettings"] = STEP_PARAMS_TEMPLATES["field_init"](coll, field)["fieldSettings"]

        field_node = TreeNode(edit, edit_sp, 0)
        item_node.add_child("field", "object", field_node)
        return item_node

    def detail_item_node(self, coll: str, field: str, idx: int) -> TreeNode:
        """DetailsItemModel + nested DisplayFieldModel."""
        iface = self._iface(coll, field)
        display = DISPLAY_MAP.get(iface, "DisplayTextFieldModel")

        sp: dict[str, Any] = {
            **STEP_PARAMS_TEMPLATES["field_init"](coll, field),
            "detailItemSettings": {"model": {"use": display}},
        }
        if iface == "m2o":
            t = self._target(coll, field)
            if t:
                sp["detailItemSettings"]["fieldNames"] = {"label": self._label(t)}

        item_node = TreeNode("DetailsItemModel", sp, idx)
        field_node = TreeNode(display, {}, 0)
        item_node.add_child("field", "object", field_node)
        return item_node

    def divider_node(self, label: str, idx: int) -> TreeNode:
        """DividerItemModel for form/detail section headers."""
        sp = STEP_PARAMS_TEMPLATES["divider_label"](label) if label else {}
        return TreeNode("DividerItemModel", sp, idx)

    def markdown_item_node(self, content: str, idx: int) -> TreeNode:
        """MarkdownItemModel for inline markdown content."""
        sp = {"markdownBlockSettings": {"editMarkdown": {"content": content}}}
        return TreeNode("MarkdownItemModel", sp, idx)

    # ── Composite builders ─────────────────────────────────────

    def form_grid(self, coll: str, fields_dsl: str | list,
                  required: set | None = None, props: dict | None = None) -> TreeNode:
        """FormGridModel with form items, gridSettings computed in memory.

        Returns a FormGridModel TreeNode with all FormItemModel children attached.
        Invalid fields are silently skipped with warnings.
        """
        items, auto_req = _normalize_fields(fields_dsl)
        all_req = (required or set()) | auto_req
        props = props or {}
        rows, sizes, sort_idx = {}, {}, 0

        grid_node = TreeNode("FormGridModel", {}, 0)

        for item in items:
            row_id = uid()
            if item["type"] == "divider":
                child = self.divider_node(item.get("label", ""), sort_idx)
                grid_node.add_child("items", "array", child)
                rows[row_id] = [[child.uid]]
                sizes[row_id] = [24]
                sort_idx += 1
            elif item["type"] == "markdown":
                child = self.markdown_item_node(item["content"], sort_idx)
                grid_node.add_child("items", "array", child)
                rows[row_id] = [[child.uid]]
                sizes[row_id] = [24]
                sort_idx += 1
            elif item["type"] == "row":
                # Filter out invalid fields and non-editable interfaces
                _non_editable = {"o2m", "m2m", "o2one", "createdBy", "updatedBy",
                                 "createdAt", "updatedAt"}
                valid_cols, skipped = [], []
                for name, span in item["cols"]:
                    if not self.nb._valid_field(coll, name):
                        skipped.append(name)
                    elif self._iface(coll, name) in _non_editable:
                        skipped.append(name)
                    elif self._iface(coll, name) == "m2o":
                        # Validate m2o target collection exists
                        target = self._target(coll, name)
                        if target and not self.nb._valid_collection(target):
                            skipped.append(name)
                        else:
                            valid_cols.append((name, span))
                    else:
                        valid_cols.append((name, span))
                if skipped:
                    coll_label = self.nb._coll_title_cache.get(coll, coll)
                    self.nb.warnings.append(
                        f"form: skipped fields {skipped} in {coll_label}({coll})")
                if not valid_cols:
                    continue
                # Recalculate spans for remaining fields
                if len(valid_cols) != len(item["cols"]):
                    total = sum(s for _, s in valid_cols)
                    if total < 24:
                        auto = 24 // len(valid_cols)
                        valid_cols = [(n, auto) for n, _ in valid_cols]

                col_uids, col_sizes = [], []
                for field_name, span in valid_cols:
                    fi = self.form_item_node(
                        coll, field_name, sort_idx,
                        required=(field_name in all_req),
                        props=props.get(field_name),
                    )
                    grid_node.add_child("items", "array", fi)
                    col_uids.append(fi.uid)
                    col_sizes.append(span)
                    sort_idx += 1
                rows[row_id] = [[fi_uid] for fi_uid in col_uids]
                sizes[row_id] = col_sizes

        grid_node.step_params = {
            "gridSettings": {"grid": {"rows": rows, "sizes": sizes}}
        }
        return grid_node

    def detail_grid(self, coll: str, fields_dsl: str | list) -> TreeNode:
        """DetailsGridModel with detail items, gridSettings computed in memory.

        Invalid fields are silently skipped with warnings.
        """
        items, _ = _normalize_fields(fields_dsl)
        rows, sizes, sort_idx = {}, {}, 0

        grid_node = TreeNode("DetailsGridModel", {}, 0)

        for item in items:
            row_id = uid()
            if item["type"] == "divider":
                child = self.divider_node(item.get("label", ""), sort_idx)
                grid_node.add_child("items", "array", child)
                rows[row_id] = [[child.uid]]
                sizes[row_id] = [24]
                sort_idx += 1
            elif item["type"] == "markdown":
                child = self.markdown_item_node(item["content"], sort_idx)
                grid_node.add_child("items", "array", child)
                rows[row_id] = [[child.uid]]
                sizes[row_id] = [24]
                sort_idx += 1
            elif item["type"] == "row":
                # Filter out invalid fields + broken relation targets
                _relation_ifaces = {"m2o", "m2m", "o2m", "o2one", "obo", "oho"}
                valid_cols, skipped = [], []
                for name, span in item["cols"]:
                    if not self.nb._valid_field(coll, name):
                        skipped.append(name)
                    elif self._iface(coll, name) in _relation_ifaces:
                        target = self._target(coll, name)
                        if target and not self.nb._valid_collection(target):
                            skipped.append(name)
                        else:
                            valid_cols.append((name, span))
                    else:
                        valid_cols.append((name, span))
                if skipped:
                    coll_label = self.nb._coll_title_cache.get(coll, coll)
                    self.nb.warnings.append(
                        f"detail: skipped fields {skipped} in {coll_label}({coll})")
                if not valid_cols:
                    continue
                if len(valid_cols) != len(item["cols"]):
                    total = sum(s for _, s in valid_cols)
                    if total < 24:
                        auto = 24 // len(valid_cols)
                        valid_cols = [(n, auto) for n, _ in valid_cols]

                col_uids, col_sizes = [], []
                for field_name, span in valid_cols:
                    di = self.detail_item_node(coll, field_name, sort_idx)
                    grid_node.add_child("items", "array", di)
                    col_uids.append(di.uid)
                    col_sizes.append(span)
                    sort_idx += 1
                rows[row_id] = [[di_uid] for di_uid in col_uids]
                sizes[row_id] = col_sizes

        grid_node.step_params = {
            "gridSettings": {"grid": {"rows": rows, "sizes": sizes}}
        }
        return grid_node

    def table_block(self, coll: str, fields: list, first_click: bool = True,
                    title: str | None = None, sort: int = 0,
                    link_actions: list | None = None,
                    js_columns: list | None = None) -> TreeNode:
        """TableBlockModel with columns, actions. Returns root TreeNode.

        The addnew and actcol UIDs are accessible via node._sub_models["actions"]
        and node._sub_models["columns"] respectively.
        Fields are validated: non-existent fields are skipped with warnings.
        """
        # Filter invalid fields
        fields = self._filter_fields(coll, fields)

        sp: dict[str, Any] = {
            **STEP_PARAMS_TEMPLATES["resource_init"](coll),
            **STEP_PARAMS_TEMPLATES["table_default_sort"],
        }
        if title:
            sp.update(STEP_PARAMS_TEMPLATES["card_title"](title))

        tbl = TreeNode("TableBlockModel", sp, sort)

        # Standard actions
        tbl.add_child("actions", "array", TreeNode("FilterActionModel", {}, 1))
        tbl.add_child("actions", "array", TreeNode("RefreshActionModel", {}, 2))

        addnew = TreeNode("AddNewActionModel",
                          STEP_PARAMS_TEMPLATES["popup_drawer"](coll), 3)
        tbl.add_child("actions", "array", addnew)

        if link_actions:
            for li, la in enumerate(link_actions):
                la_sp = {"buttonSettings": {"general": {
                    "title": la["title"], "type": "default",
                    **({"icon": la.get("icon")} if la.get("icon") else {})}}}
                tbl.add_child("actions", "array", TreeNode("LinkActionModel", la_sp, 4 + li))

        # Columns
        for i, f in enumerate(fields):
            col = self.column_node(coll, f, i + 1, click=(first_click and i == 0))
            tbl.add_child("columns", "array", col)

        # JS columns — supports both DSL (type+field) and legacy (code) format
        if js_columns:
            base_sort = len(fields) + 1
            for j, jc in enumerate(js_columns):
                title, code, width = self._expand_js_column(jc)
                jc_node = self.js_column_node(
                    title, code,
                    sort=base_sort + j,
                    width=width,
                )
                tbl.add_child("columns", "array", jc_node)

        # Actions column
        actcol = TreeNode("TableActionsColumnModel",
                          STEP_PARAMS_TEMPLATES["actions_column_title"], 99)
        tbl.add_child("columns", "array", actcol)

        # Stash references for callers
        tbl._addnew = addnew
        tbl._actcol = actcol
        # Stash first click field node for detail popup attachment
        if first_click and fields:
            first_col = tbl._sub_models["columns"][0]  # first TableColumnModel
            first_field = first_col._sub_models.get("field")  # DisplayFieldModel (object)
            tbl._click_field = first_field
        else:
            tbl._click_field = None

        return tbl

    def filter_form(self, coll: str, fields: str | list,
                    target_uid: str | None = None,
                    stats_field: str | None = None,
                    sort: int = 0) -> TreeNode:
        """FilterFormBlockModel with multiple filter fields.

        Each field becomes a FilterFormItemModel with appropriate field model
        (InputFieldModel for text, SelectFieldModel for select/enum,
        DateOnlyFieldModel for date, RecordSelectFieldModel for m2o, etc.).

        If stats_field is provided, a JSItemModel with clickable stat badges
        is added as the first row in the grid. The badges show record counts
        per enum value and filter the target table on click.

        Args:
            coll: Collection name.
            fields: Single field name (str) or list of field names.
            target_uid: Target block UID for filter binding.
            stats_field: Optional field name (must be a select/enum field) to
                generate stat filter badges from.
            sort: Sort index for the block.
        """
        self._load_meta(coll)
        if isinstance(fields, str):
            fields = [fields]

        fb = TreeNode("FilterFormBlockModel",
                      STEP_PARAMS_TEMPLATES["filter_layout_horizontal"], sort)
        fg = TreeNode("FilterFormGridModel", {}, 0)
        fb.add_child("grid", "object", fg)

        filter_paths: list[str] = []
        first_item_uid: str | None = None
        item_uids: list[str] = []

        for idx, field in enumerate(fields):
            field_meta = self.nb._field_cache.get(coll, {}).get(field, {})
            iface = field_meta.get("interface", "input")
            title = field_meta.get("uiSchema", {}).get("title") or field.replace("_", " ").title()

            # Pick appropriate edit field model
            edit_model = EDIT_MAP.get(iface, "InputFieldModel")

            fi_sp: dict[str, Any] = {
                "fieldSettings": {"init": {
                    "dataSourceKey": "main", "collectionName": coll, "fieldPath": field}},
                "filterFormItemSettings": {
                    "init": {
                        "filterField": {
                            "name": field,
                            "title": title,
                            "interface": iface,
                            "type": field_meta.get("type", "string"),
                        },
                        **({"defaultTargetUid": target_uid} if target_uid else {}),
                    },
                    "showLabel": {"showLabel": True},
                    "label": {"label": title},
                },
            }
            fi = TreeNode("FilterFormItemModel", fi_sp, idx + 1)

            # Field model — RecordSelect needs fieldSettings for association
            edit_sp: dict[str, Any] = {}
            if edit_model in ("SubFormFieldModel",):
                edit_sp["fieldSettings"] = {"init": {
                    "dataSourceKey": "main", "collectionName": coll, "fieldPath": field}}
            # RecordSelectFieldModel MUST have empty stepParams in filter context too
            fi.add_child("field", "object", TreeNode(edit_model, edit_sp, 0))
            fg.add_child("items", "array", fi)

            filter_paths.append(field)
            item_uids.append(fi.uid)
            if first_item_uid is None:
                first_item_uid = fi.uid

        # Stats filter bar — JSItemModel as first row
        stats_uid = None
        if stats_field:
            # target_uid is resolved later (placeholder), use a temp value
            # The actual target UID will be patched after the table is created
            stats_code = self.nb._generate_stats_filter_code(
                coll, stats_field, target_uid="_TARGET_PLACEHOLDER_")
            stats_node = TreeNode("JSItemModel",
                                  {"jsSettings": {"runJs": {"code": stats_code}}}, 0)
            fg.add_child("items", "array", stats_node)
            stats_uid = stats_node.uid

        # Grid layout: stats row (full width) + filter items row (equal columns)
        rows = {}
        sizes = {}

        if stats_uid:
            stats_row_id = uid()
            rows[stats_row_id] = [[stats_uid]]
            sizes[stats_row_id] = [24]

        if len(item_uids) > 0:
            n = len(item_uids)
            span = max(4, 24 // n)
            items_row_id = uid()
            rows[items_row_id] = [[u] for u in item_uids]
            sizes[items_row_id] = [span] * n

        if rows:
            fg.step_params = {"gridSettings": {"grid": {
                "rows": rows,
                "sizes": sizes,
            }}}

        # Stash filter info for filterManager — one entry per filter item
        # Each filter item maps to the target block with its own field path
        fb._filter_item_configs = [
            {"uid": uid, "field": field}
            for uid, field in zip(item_uids, filter_paths)
        ]
        # Legacy: keep single uid/paths for backward compat
        fb._filter_item_uid = first_item_uid
        fb._filter_paths = filter_paths
        # Stash stats UID for target patching later
        if stats_uid:
            fb._stats_uid = stats_uid

        return fb

    def kpi_block(self, title: str, coll: str, filter_: dict | None = None,
                  color: str | None = None, sort: int = 0) -> TreeNode:
        """JSBlockModel KPI card. Uses _generate_kpi_code from NB."""
        code = self.nb._generate_kpi_code(title, coll, filter_, color)
        sp = {
            **STEP_PARAMS_TEMPLATES["js_code"](code),
            **STEP_PARAMS_TEMPLATES["card_title"](title),
        }
        return TreeNode("JSBlockModel", sp, sort)

    def js_block_node(self, title: str, code: str, sort: int = 0) -> TreeNode:
        """Generic JSBlockModel."""
        sp = {
            **STEP_PARAMS_TEMPLATES["js_code"](code),
            **STEP_PARAMS_TEMPLATES["card_title"](title),
        }
        return TreeNode("JSBlockModel", sp, sort)

    def outline_node(self, title: str, ctx_info: dict, sort: int = 0) -> TreeNode:
        """Outline placeholder JSBlockModel."""
        code = self.nb._outline_code(title, ctx_info)
        return self.js_block_node(title, code, sort)

    # ── Placeholder system ────────────────────────────────────

    @staticmethod
    def _placeholder_code(title: str, desc: str, kind: str, meta: dict | None = None) -> str:
        """Generate placeholder JS that renders a visual card with description.

        Embeds __placeholder__ marker + kind + desc for later discovery by find_placeholders().
        """
        info = {"__placeholder__": True, "kind": kind, "title": title, "desc": desc}
        if meta:
            info.update(meta)
        info_json = json.dumps(info, ensure_ascii=False, indent=2)
        icon_map = {"column": "\U0001f4ca", "block": "\U0001f4e6",
                    "item": "\U0001f4dd", "event": "\u26a1"}
        icon = icon_map.get(kind, "\U0001f527")
        # NOTE: card title is already set via cardSettings.
        # Placeholder only renders the description — no title to avoid duplication.
        return (
            "const h = ctx.React.createElement;\n"
            f"const info = {info_json};\n"
            "const tk = ctx.themeToken || {};\n"
            "ctx.render(h('div', {style: {"
            "padding: 8, borderRadius: 6, fontSize: 12, lineHeight: '18px', "
            "background: tk.colorInfoBg || '#e6f7ff', "
            "border: '1px dashed ' + (tk.colorInfoBorder || '#91caff')"
            "}},\n"
            "  h('div', {style: {color: tk.colorTextSecondary || '#666', "
            "whiteSpace: 'pre-wrap'}}, info.desc)\n"
            "));"
        )

    def placeholder_js_col(self, title: str, field: str, desc: str,
                           col_type: str | None = None,
                           meta: dict | None = None,
                           sort: int = 50, width: int = 120) -> TreeNode:
        """JSColumnModel placeholder — description only, no real JS."""
        m = {"field": field}
        if col_type:
            m["col_type"] = col_type
        if meta:
            m.update(meta)
        code = self._placeholder_code(title, desc, "column", m)
        sp: dict[str, Any] = {
            "jsSettings": {"runJs": {"version": "v1", "code": code}},
            "tableColumnSettings": {"title": {"title": title}},
        }
        if width:
            sp["tableColumnSettings"]["width"] = {"width": width}
        return TreeNode("JSColumnModel", sp, sort)

    def placeholder_js_block(self, title: str, desc: str,
                             meta: dict | None = None, sort: int = 0) -> TreeNode:
        """JSBlockModel placeholder — description only, no real JS."""
        code = self._placeholder_code(title, desc, "block", meta)
        sp = {
            **STEP_PARAMS_TEMPLATES["js_code"](code),
            **STEP_PARAMS_TEMPLATES["card_title"](title),
        }
        return TreeNode("JSBlockModel", sp, sort)

    def placeholder_js_item(self, title: str, desc: str,
                            meta: dict | None = None, sort: int = 0) -> TreeNode:
        """JSItemModel placeholder — description only, no real JS."""
        code = self._placeholder_code(title, desc, "item", meta)
        sp = {
            "jsSettings": {"runJs": {"version": "v1", "code": code}},
            "editItemSettings": {"showLabel": {"showLabel": True, "title": title}},
        }
        return TreeNode("JSItemModel", sp, sort)

    def placeholder_event(self, event_name: str, desc: str,
                          meta: dict | None = None) -> dict:
        """Build a flowRegistry entry for an event placeholder.

        Returns a dict {flow_key: flow_def} to merge into a node's flow_registry.
        The caller should do: node.flow_registry.update(result)
        """
        flow_key = uid()
        step_key = uid()
        info = {"__placeholder__": True, "kind": "event",
                "event": event_name, "desc": desc}
        if meta:
            info.update(meta)
        code = (
            f"// PLACEHOLDER: {desc}\n"
            f"// {json.dumps(info, ensure_ascii=False)}\n"
            "console.log('placeholder event — not yet implemented');"
        )
        return {flow_key: {
            "key": flow_key, "title": f"[placeholder] {event_name}",
            "on": {"eventName": event_name,
                   "defaultParams": {"condition": {"items": [], "logic": "$and"}}},
            "steps": {step_key: {
                "key": step_key, "use": "runjs", "sort": 1,
                "flowKey": flow_key, "defaultParams": {"code": code}}},
        }}

    # ── AddNew / Edit / Detail popup ───────────────────────────

    def addnew_form(self, coll: str, fields_dsl: str | list,
                    required: set | None = None, props: dict | None = None) -> TreeNode:
        """ChildPageModel tree for AddNew popup: ChildPage → Tab → Grid → CreateForm → FormGrid.

        Returns the ChildPageModel node. Caller attaches it to AddNewActionModel via
        add_child("page", "object", ...).
        """
        cp = TreeNode("ChildPageModel", STEP_PARAMS_TEMPLATES["page_no_title"])
        ct = TreeNode("ChildPageTabModel", {
            "pageTabSettings": {"tab": {"title": "New"}}}, 0)
        cp.add_child("tabs", "array", ct)

        bg = TreeNode("BlockGridModel", {}, 0)
        ct.add_child("grid", "object", bg)

        fm = TreeNode("CreateFormModel",
                      STEP_PARAMS_TEMPLATES["resource_init"](coll), 0)
        bg.add_child("items", "array", fm)

        fm.add_child("actions", "array", TreeNode("FormSubmitActionModel", {}, 0))

        fg = self.form_grid(coll, fields_dsl, required, props)
        fm.add_child("grid", "object", fg)

        # Stash create form UID
        cp._create_form_uid = fm.uid
        return cp

    def edit_action(self, coll: str, fields_dsl: str | list,
                    required: set | None = None, props: dict | None = None) -> TreeNode:
        """EditActionModel tree: EditAction → ChildPage → Tab → Grid → EditForm → FormGrid.

        Returns the EditActionModel node.
        """
        ea_sp = STEP_PARAMS_TEMPLATES["popup_drawer"](coll)
        ea_sp["popupSettings"]["openView"]["filterByTk"] = "{{ ctx.record.id }}"
        ea_sp["buttonSettings"] = {"general": {"title": "Edit", "icon": "EditOutlined", "type": "link"}}
        ea = TreeNode("EditActionModel", ea_sp, 0)

        cp = TreeNode("ChildPageModel", STEP_PARAMS_TEMPLATES["page_no_title"])
        ea.add_child("page", "object", cp)

        ct = TreeNode("ChildPageTabModel", {
            "pageTabSettings": {"tab": {"title": "Edit"}}}, 0)
        cp.add_child("tabs", "array", ct)

        bg = TreeNode("BlockGridModel", {}, 0)
        ct.add_child("grid", "object", bg)

        fm = TreeNode("EditFormModel",
                      STEP_PARAMS_TEMPLATES["resource_init_with_tk"](coll), 0)
        bg.add_child("items", "array", fm)

        fm.add_child("actions", "array", TreeNode("FormSubmitActionModel", {}, 0))

        fg = self.form_grid(coll, fields_dsl, required, props)
        fm.add_child("grid", "object", fg)

        # Stash edit form UID
        ea._edit_form_uid = fm.uid
        return ea

    def _build_tab_blocks(self, bg: TreeNode, coll: str, tab: dict) -> list[TreeNode]:
        """Build blocks inside a BlockGridModel for detail popup tab.

        Delegates to _build_block for shared block types (js, kpi, details,
        sub_table, table, filter, outline). Popup-specific form type
        (EditFormModel with resource_init_with_tk) is handled inline.

        Supports multi-row layout via _row/_span markers on block defs
        (set by markup_parser._parse_detail when parsing <row> elements).
        Falls back to single-row auto-sized layout for backward compat.
        """
        blocks = tab.get("blocks")
        if blocks is None:
            if "assoc" in tab:
                blocks = [{"type": "sub_table", "assoc": tab["assoc"],
                           "coll": tab["coll"], "fields": tab["fields"],
                           "title": tab.get("title")}]
            else:
                blocks = [{"type": "details", "fields": tab.get("fields", "")}]

        block_nodes = []
        # Track row groups: list of (node, row_idx, span)
        node_layout = []
        meta, warnings = {}, []

        for bi, blk in enumerate(blocks):
            btype = blk.get("type", "details")
            bdef = dict(blk)

            # Inject collection for collection-based types
            if "collection" not in bdef:
                bdef["collection"] = coll
            if btype == "sub_table" and "parent_coll" not in bdef:
                bdef["parent_coll"] = coll

            # Popup-specific edit form (EditFormModel + resource_init_with_tk)
            if btype == "form" and bdef.get("popup", True):
                fm = TreeNode("EditFormModel",
                              STEP_PARAMS_TEMPLATES["resource_init_with_tk"](coll), bi)
                bg.add_child("items", "array", fm)
                fm.add_child("actions", "array", TreeNode("FormSubmitActionModel", {}, 0))
                req = set(bdef.get("required", []))
                fg = self.form_grid(coll, bdef.get("fields", ""), req,
                                    props=bdef.get("props"))
                fm.add_child("grid", "object", fg)
                block_nodes.append(fm)
                node_layout.append((fm, blk.get("_row"), blk.get("_span")))
                continue

            # Delegate to shared _build_block
            node = self._build_block(btype, bdef, bi, meta, warnings)
            bg.add_child("items", "array", node)
            block_nodes.append(node)
            node_layout.append((node, blk.get("_row"), blk.get("_span")))

        # ── Layout ──
        has_row_markers = any(nl[1] is not None for nl in node_layout)
        tab_sizes = tab.get("sizes")

        if has_row_markers:
            # Multi-row layout from _row/_span markers
            row_groups: list[list[tuple[TreeNode, int | None]]] = []
            current_row_idx = None
            current_group: list[tuple[TreeNode, int | None]] = []
            for node, row_idx, span in node_layout:
                if row_idx is not None and row_idx == current_row_idx:
                    current_group.append((node, span))
                else:
                    if current_group:
                        row_groups.append(current_group)
                    current_group = [(node, span)]
                    current_row_idx = row_idx
            if current_group:
                row_groups.append(current_group)

            rows, sizes = {}, {}
            for group in row_groups:
                row_id = uid()
                row_cols = [[item[0].uid] for item in group]
                if all(item[1] for item in group):
                    row_sizes = [item[1] for item in group]
                else:
                    n = len(group)
                    row_sizes = [24 // n] * n
                    row_sizes[-1] = 24 - sum(row_sizes[:-1])
                rows[row_id] = row_cols
                sizes[row_id] = row_sizes
            bg.step_params = {"gridSettings": {"grid": {"rows": rows, "sizes": sizes}}}

        elif len(block_nodes) > 1 or tab_sizes:
            # Legacy single-row layout (backward compat)
            row_id = uid()
            row_cols = [[bn.uid] for bn in block_nodes]
            if tab_sizes:
                gs = {"gridSettings": {"grid": {
                    "rows": {row_id: row_cols},
                    "sizes": {row_id: tab_sizes}}}}
            else:
                n = len(block_nodes)
                auto = [24 // n] * n
                auto[-1] = 24 - sum(auto[:-1])
                gs = {"gridSettings": {"grid": {
                    "rows": {row_id: row_cols},
                    "sizes": {row_id: auto}}}}
            bg.step_params = gs

        return block_nodes

    def _sub_table_node(self, parent_coll: str, assoc: str, target_coll: str,
                        fields: list, title: str | None = None,
                        sort: int = 0) -> TreeNode:
        """Association sub-table TreeNode. Validates target collection and fields."""
        # Validate target collection
        if not self._valid_collection(target_coll):
            self.nb.warnings.append(
                f"sub_table: target collection '{target_coll}' has no registered fields")
        # Validate association field exists on parent
        if not self.nb._valid_field(parent_coll, assoc):
            self.nb.warnings.append(
                f"sub_table: association '{assoc}' not found on '{parent_coll}'")
        # Filter invalid fields
        fields = self._filter_fields(target_coll, fields)

        sp: dict[str, Any] = STEP_PARAMS_TEMPLATES["resource_init"](target_coll)
        sp["resourceSettings"]["init"].update({
            "association": f"{parent_coll}.{assoc}",
            "associationName": f"{parent_coll}.{assoc}",
            "sourceId": "{{ctx.view.inputArgs.filterByTk}}"})
        if title:
            sp.update(STEP_PARAMS_TEMPLATES["card_title"](title))

        tbl = TreeNode("TableBlockModel", sp, sort)
        tbl.add_child("actions", "array", TreeNode("RefreshActionModel", {}, 2))

        addnew = TreeNode("AddNewActionModel",
                          STEP_PARAMS_TEMPLATES["popup_dialog"](target_coll), 3)
        tbl.add_child("actions", "array", addnew)
        tbl._addnew = addnew

        for i, f in enumerate(fields):
            col = self.column_node(target_coll, f, i + 1)
            tbl.add_child("columns", "array", col)

        actcol = TreeNode("TableActionsColumnModel",
                          STEP_PARAMS_TEMPLATES["actions_column_title"], 99)
        tbl.add_child("columns", "array", actcol)
        tbl._actcol = actcol

        return tbl

    def detail_block(self, coll: str, fields_dsl: str | list,
                     title: str | None = None, sort: int = 0) -> TreeNode:
        """Standalone DetailsBlockModel for page-level use (not just popup)."""
        sp: dict[str, Any] = STEP_PARAMS_TEMPLATES["resource_init_with_tk"](coll)
        if title:
            sp.update(STEP_PARAMS_TEMPLATES["card_title"](title))
        det = TreeNode("DetailsBlockModel", sp, sort)
        dg = self.detail_grid(coll, fields_dsl)
        det.add_child("grid", "object", dg)
        return det

    def form_block(self, coll: str, fields_dsl: str | list,
                   mode: str = "create", title: str | None = None,
                   required: set | None = None, props: dict | None = None,
                   sort: int = 0) -> TreeNode:
        """Standalone Create/Edit form block for page-level use."""
        model = "CreateFormModel" if mode == "create" else "EditFormModel"
        tmpl = "resource_init" if mode == "create" else "resource_init_with_tk"
        sp: dict[str, Any] = STEP_PARAMS_TEMPLATES[tmpl](coll)
        if title:
            sp.update(STEP_PARAMS_TEMPLATES["card_title"](title))
        fm = TreeNode(model, sp, sort)
        fm.add_child("actions", "array", TreeNode("FormSubmitActionModel", {}, 0))
        fg = self.form_grid(coll, fields_dsl, required, props)
        fm.add_child("grid", "object", fg)
        return fm

    def detail_popup(self, coll: str, tabs: list) -> TreeNode:
        """ChildPageModel for detail popup with tabs.

        Returns ChildPageModel TreeNode. Caller attaches to click field via
        add_child("page", "object", ...).
        """
        enable_tabs = len(tabs) > 1
        page_sp = STEP_PARAMS_TEMPLATES["page_with_tabs"] if enable_tabs else STEP_PARAMS_TEMPLATES["page_no_title"]
        cp = TreeNode("ChildPageModel", page_sp)

        for ti, tab in enumerate(tabs):
            ct = TreeNode("ChildPageTabModel", {
                "pageTabSettings": {"tab": {"title": tab["title"]}}}, ti)
            cp.add_child("tabs", "array", ct)

            bg = TreeNode("BlockGridModel", {}, 0)
            ct.add_child("grid", "object", bg)
            self._build_tab_blocks(bg, coll, tab)

        return cp

    # ── Main entry point ───────────────────────────────────────

    def crud_page(self, tab_uid: str, coll: str, table_fields: list,
                  form_fields_dsl: str | list,
                  filter_fields: list | None = None,
                  kpis: list | None = None,
                  detail_tabs: list | str | None = None,
                  table_title: str | None = None,
                  sidebar_outlines: list | None = None,
                  ) -> tuple[TreeNode, dict]:
        """Build a complete CRUD page tree in memory.

        Returns:
            (root_node, meta_dict) where meta_dict contains UIDs for
            create_form, edit_form, table_uid, etc.
        """
        meta: dict[str, Any] = {}

        # Root: BlockGridModel
        root = TreeNode("BlockGridModel", {}, 0)
        meta["grid_uid"] = root.uid

        # Track all blocks for layout
        kpi_nodes = []
        sort_idx = 0

        # ── KPIs ──
        if kpis:
            for kpi in kpis:
                ktitle = kpi.get("title", "Count")
                kfilter = kpi.get("filter")
                kcolor = kpi.get("color")
                kpi_node = self.kpi_block(ktitle, coll, filter_=kfilter,
                                          color=kcolor, sort=sort_idx)
                root.add_child("items", "array", kpi_node)
                kpi_nodes.append(kpi_node)
                sort_idx += 1

        # ── Table ──
        tbl = self.table_block(coll, table_fields, first_click=True,
                               title=table_title, sort=sort_idx)
        root.add_child("items", "array", tbl)
        meta["table_uid"] = tbl.uid
        sort_idx += 1

        # ── Filter ──
        filter_node = None
        if filter_fields:
            filter_node = self.filter_form(
                coll, filter_fields,
                target_uid=tbl.uid, sort=sort_idx)
            root.add_child("items", "array", filter_node)
            sort_idx += 1

        # ── AddNew form ──
        addnew_cp = self.addnew_form(coll, form_fields_dsl)
        # Update AddNew action's popupSettings with UID
        tbl._addnew.add_child("page", "object", addnew_cp)
        meta["create_form"] = addnew_cp._create_form_uid

        # ── Edit action ──
        edit_node = self.edit_action(coll, form_fields_dsl)
        tbl._actcol.add_child("actions", "array", edit_node)
        meta["edit_form"] = edit_node._edit_form_uid

        # ── Sidebar outlines ──
        sidebar_nodes = []
        if sidebar_outlines:
            for ol in sidebar_outlines:
                ol_title = ol.get("title", "Outline")
                ol_info = ol.get("ctx_info", {})
                ol_node = self.outline_node(ol_title, ol_info, sort=sort_idx)
                root.add_child("items", "array", ol_node)
                sidebar_nodes.append(ol_node)
                sort_idx += 1
            meta["sidebar_outline_uids"] = [n.uid for n in sidebar_nodes]

        # ── Layout (gridSettings on root) ──
        rows, sizes = {}, {}

        # KPI row
        if kpi_nodes:
            row_id = uid()
            span = 24 // len(kpi_nodes)
            rows[row_id] = [[kn.uid] for kn in kpi_nodes]
            sizes[row_id] = [span] * len(kpi_nodes)

        # Filter row
        if filter_node:
            row_id = uid()
            rows[row_id] = [[filter_node.uid]]
            sizes[row_id] = [24]

        # Table row (with optional sidebar)
        row_id = uid()
        if sidebar_nodes:
            rows[row_id] = [[tbl.uid], [sidebar_nodes[0].uid] +
                            ([sn.uid for sn in sidebar_nodes[1:]] if len(sidebar_nodes) > 1 else [])]
            sizes[row_id] = [15, 9]
        else:
            rows[row_id] = [[tbl.uid]]
            sizes[row_id] = [24]

        root.step_params = {"gridSettings": {"grid": {"rows": rows, "sizes": sizes}}}

        # ── Detail popup ──
        if detail_tabs != "none":
            click_field = tbl._click_field
            if click_field:
                if detail_tabs:
                    tabs = detail_tabs
                else:
                    # Auto-generate detail tab from form fields
                    detail_fields = form_fields_dsl
                    if isinstance(detail_fields, str):
                        detail_fields = detail_fields.replace("*", "")
                    tabs = [{"title": "Details", "fields": detail_fields}]

                # Update click field popup settings
                click_field.step_params["popupSettings"]["openView"].update({
                    "collectionName": coll, "dataSourceKey": "main",
                    "mode": "drawer", "size": "large",
                    "pageModelClass": "ChildPageModel", "uid": click_field.uid,
                })

                popup_cp = self.detail_popup(coll, tabs)
                click_field.add_child("page", "object", popup_cp)
                meta["detail_popup"] = True

        # ── FilterManager ──
        if filter_node:
            meta["_filter_manager"] = [{
                "filterId": filter_node._filter_item_uid,
                "targetId": tbl.uid,
                "filterPaths": filter_node._filter_paths,
            }]

        meta["node_count"] = root.count_nodes()
        return root, meta

    # ── Free-form page composition ─────────────────────────────

    def compose_page(self, tab_uid: str, blocks: list[dict],
                     layout: list | None = None) -> tuple[TreeNode, dict]:
        """Build a page from free-form block definitions.

        Unlike crud_page which forces KPI+Filter+Table+Form, this lets you
        freely combine any blocks in any layout.

        Args:
            tab_uid: Tab UID (for filterManager binding)
            blocks: List of block defs, each with:
                - id: label for layout reference (default "block_0", etc.)
                - type: "table"|"filter"|"form"|"detail"|"js"|"kpi"|"outline"
                - ... type-specific fields
                Table blocks support js_columns: list of {title, code, width?}
            layout: Rows of [block_id, span] pairs. None = auto-stack.
                Column stacking: use [["id_a","id_b"], span] to stack
                multiple blocks vertically in one column.

        Returns:
            (root_node, meta_dict) with block UIDs and node count.
        """
        root = TreeNode("BlockGridModel", {}, 0)
        meta: dict[str, Any] = {"grid_uid": root.uid}
        warnings: list[str] = []

        block_map: dict[str, TreeNode] = {}   # id → node
        block_nodes: list[TreeNode] = []
        filter_managers: list[dict] = []

        for i, bdef in enumerate(blocks):
            bid = bdef.get("id", f"block_{i}")
            btype = bdef.get("type", "")

            try:
                node = self._build_block(btype, bdef, i, meta, warnings)
            except Exception as e:
                warnings.append(f"block '{bid}' ({btype}): {e}")
                continue

            root.add_child("items", "array", node)
            block_map[bid] = node
            block_nodes.append(node)
            meta[f"{bid}_uid"] = node.uid

        # ── Table popups (addnew / edit / detail) ──
        for i, bdef in enumerate(blocks):
            bid = bdef.get("id", f"block_{i}")
            if bdef.get("type") != "table" or bid not in block_map:
                continue
            tbl = block_map[bid]
            coll = bdef["collection"]

            addnew_fields = bdef.get("addnew_fields")
            edit_fields = bdef.get("edit_fields") or addnew_fields

            if addnew_fields and hasattr(tbl, "_addnew"):
                addnew_cp = self.addnew_form(coll, addnew_fields)
                tbl._addnew.add_child("page", "object", addnew_cp)
                meta[f"{bid}_create_form"] = addnew_cp._create_form_uid

            if edit_fields and hasattr(tbl, "_actcol"):
                edit_node = self.edit_action(coll, edit_fields)
                tbl._actcol.add_child("actions", "array", edit_node)
                meta[f"{bid}_edit_form"] = edit_node._edit_form_uid

            # Detail popup: explicit tabs > auto-generate from addnew_fields > auto from table fields
            detail_tabs = bdef.get("detail_tabs")
            if detail_tabs == "none":
                # Explicitly disabled
                pass
            elif hasattr(tbl, "_click_field") and tbl._click_field:
                cf = tbl._click_field
                if not detail_tabs:
                    # Auto-generate detail tab from addnew_fields or table fields
                    auto_fields = addnew_fields or bdef.get("fields", [])
                    if isinstance(auto_fields, str):
                        auto_fields = auto_fields.replace("*", "")
                    elif isinstance(auto_fields, list):
                        auto_fields = "\n".join(auto_fields)
                    detail_tabs = [{"title": "Details", "fields": auto_fields}]

                cf.step_params["popupSettings"]["openView"].update({
                    "collectionName": coll, "dataSourceKey": "main",
                    "mode": "drawer", "size": "large",
                    "pageModelClass": "ChildPageModel", "uid": cf.uid,
                })
                popup_cp = self.detail_popup(coll, detail_tabs)
                cf.add_child("page", "object", popup_cp)

        # ── Filter → target binding ──
        for i, bdef in enumerate(blocks):
            bid = bdef.get("id", f"block_{i}")
            if bdef.get("type") != "filter" or bid not in block_map:
                continue
            target_id = bdef.get("target")
            if not target_id or target_id not in block_map:
                if target_id:
                    warnings.append(f"filter '{bid}': target '{target_id}' not found")
                continue
            fnode = block_map[bid]
            tnode = block_map[target_id]
            if hasattr(fnode, "_filter_item_uid"):
                filter_managers.append({
                    "filterId": fnode._filter_item_uid,
                    "targetId": tnode.uid,
                    "filterPaths": fnode._filter_paths,
                })

        if filter_managers:
            meta["_filter_manager"] = filter_managers

        # ── Layout ──
        if layout:
            rows, sizes = {}, {}
            seen_refs: set[str] = set()
            for row_def in layout:
                row_id = uid()
                row_cols, row_sizes = [], []
                for item in row_def:
                    if isinstance(item, (list, tuple)):
                        ref = item[0]
                        span = item[1] if len(item) > 1 else 24
                    else:
                        ref, span = item, 24
                    # ref can be a list of block_ids → stacked column
                    if isinstance(ref, list):
                        col_uids = []
                        for r in ref:
                            node = block_map.get(r)
                            if node:
                                if r in seen_refs:
                                    warnings.append(f"layout: '{r}' duplicated, skipped")
                                    continue
                                seen_refs.add(r)
                                col_uids.append(node.uid)
                            else:
                                warnings.append(f"layout ref '{r}' not found")
                        if col_uids:
                            row_cols.append(col_uids)
                            row_sizes.append(span)
                    else:
                        # Single block reference
                        if ref in seen_refs:
                            warnings.append(f"layout: '{ref}' duplicated, skipped")
                            continue
                        seen_refs.add(ref)
                        node = block_map.get(ref)
                        if node:
                            row_cols.append([node.uid])
                            row_sizes.append(span)
                        else:
                            warnings.append(f"layout ref '{ref}' not found")
                if row_cols:
                    rows[row_id] = row_cols
                    sizes[row_id] = row_sizes
            root.step_params = {"gridSettings": {"grid": {"rows": rows, "sizes": sizes}}}
        else:
            # Auto-stack vertically
            rows, sizes = {}, {}
            for node in block_nodes:
                row_id = uid()
                rows[row_id] = [[node.uid]]
                sizes[row_id] = [24]
            root.step_params = {"gridSettings": {"grid": {"rows": rows, "sizes": sizes}}}

        if warnings:
            meta["warnings"] = warnings
        meta["node_count"] = root.count_nodes()
        return root, meta

    def _build_block(self, btype: str, bdef: dict, sort: int,
                     meta: dict, warnings: list) -> TreeNode:
        """Build a single block TreeNode from a block definition.

        Validates collection existence for collection-based blocks.
        """
        # Validate collection exists for collection-based block types
        coll_types = {"table", "filter", "form", "detail", "details", "kpi"}
        if btype in coll_types:
            coll = bdef.get("collection", "")
            if coll and not self._valid_collection(coll):
                warnings.append(f"collection '{coll}' has no registered fields")

        if btype == "table":
            coll = bdef["collection"]
            fields = bdef.get("fields", [])
            return self.table_block(
                coll, fields,
                first_click=bdef.get("first_click", True),
                title=bdef.get("title"),
                sort=sort,
                link_actions=bdef.get("link_actions"),
                js_columns=bdef.get("js_columns"),
            )

        elif btype == "filter":
            coll = bdef["collection"]
            fields = bdef.get("fields", [])
            # Filter out invalid fields
            fields = self._filter_fields(coll, fields)
            if not fields:
                fields = ["name"]
            return self.filter_form(
                coll, fields,
                target_uid=None,  # resolved later via block_map
                sort=sort,
            )

        elif btype == "form":
            coll = bdef["collection"]
            return self.form_block(
                coll, bdef.get("fields", ""),
                mode=bdef.get("mode", "create"),
                title=bdef.get("title"),
                required=set(bdef.get("required", [])),
                props=bdef.get("props"),
                sort=sort,
            )

        elif btype == "detail":
            coll = bdef["collection"]
            return self.detail_block(
                coll, bdef.get("fields", ""),
                title=bdef.get("title"),
                sort=sort,
            )

        elif btype == "js":
            return self.js_block_node(
                bdef.get("title", "JS Block"),
                bdef.get("code", ""),
                sort=sort,
            )

        elif btype == "kpi":
            return self.kpi_block(
                bdef.get("title", "Count"),
                bdef["collection"],
                filter_=bdef.get("filter"),
                color=bdef.get("color"),
                sort=sort,
            )

        elif btype == "outline":
            return self.outline_node(
                bdef.get("title", "Outline"),
                bdef.get("ctx_info", {}),
                sort=sort,
            )

        elif btype == "details":
            coll = bdef["collection"]
            det_sp: dict[str, Any] = STEP_PARAMS_TEMPLATES["resource_init_with_tk"](coll)
            if bdef.get("title"):
                det_sp.update(STEP_PARAMS_TEMPLATES["card_title"](bdef["title"]))
            det = TreeNode("DetailsBlockModel", det_sp, sort)
            dg = self.detail_grid(coll, bdef.get("fields", ""))
            det.add_child("grid", "object", dg)
            return det

        elif btype == "sub_table":
            parent_coll = bdef.get("parent_coll", bdef.get("collection", ""))
            node = self._sub_table_node(
                parent_coll, bdef["assoc"], bdef["coll"], bdef["fields"],
                bdef.get("title"), sort)
            af = bdef.get("addnew_fields") or bdef["fields"]
            if af and hasattr(node, "_addnew"):
                addnew_cp = self.addnew_form(bdef["coll"], af,
                                              required={af[0]} if af else set())
                node._addnew.add_child("page", "object", addnew_cp)
            return node

        else:
            raise ValueError(f"unknown block type: '{btype}'")

