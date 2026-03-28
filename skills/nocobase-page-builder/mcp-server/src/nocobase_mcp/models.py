"""FlowModel type registry — Single Source of Truth for model types, field mappings, and stepParams templates.

All model type names, default stepParams, parent-child relationships, and field interface
mappings are centralized here. Both client.py and tree_builder.py import from this module.
"""

from __future__ import annotations

from typing import Any

# ── Interface -> Display Model mappings ──────────────────────────────────

DISPLAY_MAP: dict[str, str] = {
    "input": "DisplayTextFieldModel",
    "textarea": "DisplayTextFieldModel",
    "email": "DisplayTextFieldModel",
    "phone": "DisplayTextFieldModel",
    "sequence": "DisplayTextFieldModel",
    "markdown": "DisplayTextFieldModel",
    "select": "DisplayEnumFieldModel",
    "radioGroup": "DisplayEnumFieldModel",
    "multipleSelect": "DisplayEnumFieldModel",
    "checkboxGroup": "DisplayEnumFieldModel",
    "checkbox": "DisplayCheckboxFieldModel",
    "integer": "DisplayNumberFieldModel",
    "number": "DisplayNumberFieldModel",
    "percent": "DisplayPercentFieldModel",
    "sort": "DisplayNumberFieldModel",
    "date": "DisplayDateTimeFieldModel",
    "dateOnly": "DisplayDateTimeFieldModel",
    "datetime": "DisplayDateTimeFieldModel",
    "datetimeNoTz": "DisplayDateTimeFieldModel",
    "createdAt": "DisplayDateTimeFieldModel",
    "updatedAt": "DisplayDateTimeFieldModel",
    "time": "DisplayTimeFieldModel",
    "color": "DisplayColorFieldModel",
    "icon": "DisplayIconFieldModel",
    "url": "DisplayURLFieldModel",
    "richText": "DisplayHtmlFieldModel",
    "json": "DisplayJSONFieldModel",
    "password": "DisplayPasswordFieldModel",
    "m2o": "DisplayTextFieldModel",
    "o2m": "DisplayNumberFieldModel",
    "createdBy": "DisplaySubItemFieldModel",
    "updatedBy": "DisplaySubItemFieldModel",
    "m2m": "DisplaySubTableFieldModel",
}

# ── Interface -> Edit Model mappings ─────────────────────────────────────

EDIT_MAP: dict[str, str] = {
    "input": "InputFieldModel",
    "textarea": "TextareaFieldModel",
    "email": "InputFieldModel",
    "phone": "InputFieldModel",
    "markdown": "TextareaFieldModel",
    "select": "SelectFieldModel",
    "radioGroup": "RadioGroupFieldModel",
    "multipleSelect": "MultipleSelectFieldModel",
    "checkboxGroup": "CheckboxGroupFieldModel",
    "checkbox": "CheckboxFieldModel",
    "integer": "NumberFieldModel",
    "number": "NumberFieldModel",
    "percent": "NumberFieldModel",
    "date": "DateOnlyFieldModel",
    "dateOnly": "DateOnlyFieldModel",
    "datetime": "DateTimeTzFieldModel",
    "datetimeNoTz": "DateTimeNoTzFieldModel",
    "time": "TimeFieldModel",
    "color": "InputFieldModel",
    "icon": "InputFieldModel",
    "url": "InputFieldModel",
    "richText": "InputFieldModel",
    "json": "InputFieldModel",
    "m2o": "RecordSelectFieldModel",
}


# ── Model definitions registry ──────────────────────────────────────────

MODEL_DEFS: dict[str, dict[str, Any]] = {
    # ── Page containers ──
    "BlockGridModel": {
        "category": "grid",
        "sub_models": {"items": "array"},
    },
    "ChildPageModel": {
        "category": "page",
        "sub_models": {"tabs": "array"},
        "default_step_params": {
            "pageSettings": {"general": {"displayTitle": False, "enableTabs": True}}
        },
    },
    "ChildPageTabModel": {
        "category": "page",
        "sub_models": {"grid": "object"},
    },

    # ── Table blocks ──
    "TableBlockModel": {
        "category": "block",
        "sub_models": {"columns": "array", "actions": "array"},
        "default_step_params": {
            "tableSettings": {
                "defaultSorting": {"sort": [{"field": "createdAt", "direction": "desc"}]}
            },
        },
        "flows": ["resourceSettings", "cardSettings", "tableSettings",
                  "dataLoadingModeSettings", "refreshSettings"],
    },
    "TableColumnModel": {
        "category": "column",
        "sub_models": {"field": "object"},
    },
    "TableActionsColumnModel": {
        "category": "column",
        "sub_models": {"actions": "array"},
        "default_step_params": {
            "tableColumnSettings": {"title": {"title": '{{t("Actions")}}'}}
        },
    },

    # ── Form blocks ──
    "CreateFormModel": {
        "category": "block",
        "sub_models": {"grid": "object", "actions": "array"},
        "flows": ["resourceSettings", "cardSettings", "formSettings"],
    },
    "EditFormModel": {
        "category": "block",
        "sub_models": {"grid": "object", "actions": "array"},
        "flows": ["resourceSettings", "cardSettings", "formSettings"],
    },
    "FormGridModel": {
        "category": "grid",
        "sub_models": {"items": "array"},
    },
    "FormItemModel": {
        "category": "field",
        "sub_models": {"field": "object"},
    },
    "FormSubmitActionModel": {
        "category": "action",
        "sub_models": {},
    },

    # ── Detail blocks ──
    "DetailsBlockModel": {
        "category": "block",
        "sub_models": {"grid": "object", "actions": "array"},
        "flows": ["resourceSettings", "cardSettings", "detailsSettings"],
    },
    "DetailsGridModel": {
        "category": "grid",
        "sub_models": {"items": "array"},
    },
    "DetailsItemModel": {
        "category": "field",
        "sub_models": {"field": "object"},
    },

    # ── Filter blocks ──
    "FilterFormBlockModel": {
        "category": "block",
        "sub_models": {"grid": "object"},
        "flows": ["formFilterBlockModelSettings"],
    },
    "FilterFormGridModel": {
        "category": "grid",
        "sub_models": {"items": "array", "actions": "array"},
    },
    "FilterFormItemModel": {
        "category": "field",
        "sub_models": {"field": "object"},
    },

    # ── Action buttons ──
    "AddNewActionModel":     {"category": "action", "sub_models": {"page": "object"}},
    "EditActionModel":       {"category": "action", "sub_models": {"page": "object"}},
    "ViewActionModel":       {"category": "action", "sub_models": {"page": "object"}},
    "DeleteActionModel":     {"category": "action", "sub_models": {}},
    "BulkDeleteActionModel": {"category": "action", "sub_models": {}},
    "FilterActionModel":     {"category": "action", "sub_models": {}},
    "RefreshActionModel":    {"category": "action", "sub_models": {}},
    "LinkActionModel":       {"category": "action", "sub_models": {}},

    # ── JS blocks ──
    "JSBlockModel":  {"category": "block", "sub_models": {}, "flows": ["jsSettings"]},
    "JSColumnModel": {"category": "column", "sub_models": {}},
    "JSItemModel":   {"category": "field", "sub_models": {}},

    # ── Auxiliary elements ──
    "DividerItemModel":  {"category": "field", "sub_models": {}},
    "MarkdownItemModel": {"category": "field", "sub_models": {}},

    # ── Display field models (leaf nodes) ──
    "DisplayTextFieldModel":     {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayEnumFieldModel":     {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayCheckboxFieldModel": {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayNumberFieldModel":   {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayDateTimeFieldModel": {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayColorFieldModel":    {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayIconFieldModel":     {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayURLFieldModel":      {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayHtmlFieldModel":     {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayTimeFieldModel":     {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayJSONFieldModel":     {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayPasswordFieldModel": {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplaySubItemFieldModel":  {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplaySubTableFieldModel": {"category": "display_field", "sub_models": {"page": "object"}},
    "DisplayPercentFieldModel":  {"category": "display_field", "sub_models": {"page": "object"}},

    # ── Edit field models (leaf nodes) ──
    "InputFieldModel":          {"category": "edit_field", "sub_models": {}},
    "TextareaFieldModel":       {"category": "edit_field", "sub_models": {}},
    "SelectFieldModel":         {"category": "edit_field", "sub_models": {}},
    "MultipleSelectFieldModel": {"category": "edit_field", "sub_models": {}},
    "RadioGroupFieldModel":     {"category": "edit_field", "sub_models": {}},
    "CheckboxFieldModel":       {"category": "edit_field", "sub_models": {}},
    "CheckboxGroupFieldModel":  {"category": "edit_field", "sub_models": {}},
    "NumberFieldModel":         {"category": "edit_field", "sub_models": {}},
    "DateOnlyFieldModel":       {"category": "edit_field", "sub_models": {}},
    "DateTimeTzFieldModel":     {"category": "edit_field", "sub_models": {}},
    "DateTimeNoTzFieldModel":   {"category": "edit_field", "sub_models": {}},
    "TimeFieldModel":           {"category": "edit_field", "sub_models": {}},
    "RecordSelectFieldModel":   {"category": "edit_field", "sub_models": {}},
    "SubFormFieldModel":        {"category": "edit_field", "sub_models": {}},
    "SubTableFieldModel":       {"category": "edit_field", "sub_models": {}},

    # ── AI employees ──
    "AIEmployeeShortcutListModel": {"category": "block", "sub_models": {"shortcuts": "array"}},
    "AIEmployeeShortcutModel":     {"category": "block", "sub_models": {}},
    "AIEmployeeButtonModel":       {"category": "action", "sub_models": {}},
}


# ── stepParams templates ────────────────────────────────────────────────

STEP_PARAMS_TEMPLATES: dict[str, Any] = {
    "resource_init": lambda coll: {
        "resourceSettings": {"init": {"dataSourceKey": "main", "collectionName": coll}}
    },
    "resource_init_with_tk": lambda coll: {
        "resourceSettings": {"init": {
            "dataSourceKey": "main", "collectionName": coll,
            "filterByTk": "{{ctx.view.inputArgs.filterByTk}}"}}
    },
    "card_title": lambda title: {
        "cardSettings": {"titleDescription": {"title": title}}
    },
    "table_default_sort": {
        "tableSettings": {"defaultSorting": {
            "sort": [{"field": "createdAt", "direction": "desc"}]}}
    },
    "popup_drawer": lambda coll: {
        "popupSettings": {"openView": {
            "collectionName": coll, "dataSourceKey": "main",
            "mode": "drawer", "size": "large", "pageModelClass": "ChildPageModel"}}
    },
    "popup_dialog": lambda coll: {
        "popupSettings": {"openView": {
            "collectionName": coll, "dataSourceKey": "main",
            "mode": "dialog", "size": "small", "pageModelClass": "ChildPageModel"}}
    },
    "field_init": lambda coll, field: {
        "fieldSettings": {"init": {
            "dataSourceKey": "main", "collectionName": coll, "fieldPath": field}}
    },
    "filter_layout_horizontal": {
        "formFilterBlockModelSettings": {"layout": {
            "layout": "horizontal", "labelAlign": "left",
            "labelWidth": 100, "labelWrap": False, "colon": True}}
    },
    "js_code": lambda code: {
        "jsSettings": {"runJs": {"version": "v1", "code": code}}
    },
    "divider_label": lambda label: {
        "markdownItemSetting": {"title": {
            "label": label, "orientation": "left",
            "color": "rgba(0, 0, 0, 0.88)",
            "borderColor": "rgba(5, 5, 5, 0.06)"}}
    },
    "page_no_title": {
        "pageSettings": {"general": {"displayTitle": False, "enableTabs": True}}
    },
    "page_with_tabs": {
        "pageSettings": {"general": {"displayTitle": False, "enableTabs": True}}
    },
    "actions_column_title": {
        "tableColumnSettings": {
            "title": {"title": '{{t("Actions")}}'},
            "fixed": {"fixed": "left"},
        }
    },
}


# ── Helper functions ─────────────────────────────────────────────────────

_GENERIC_DEF: dict[str, Any] = {"category": "unknown", "sub_models": {}}


def get_model_def(use: str) -> dict[str, Any]:
    """Get model definition. Returns generic definition for unknown models."""
    return MODEL_DEFS.get(use, _GENERIC_DEF)


def get_display_model(interface: str) -> str:
    """Interface -> DisplayFieldModel name. Falls back to DisplayTextFieldModel."""
    return DISPLAY_MAP.get(interface, "DisplayTextFieldModel")


def get_edit_model(interface: str) -> str:
    """Interface -> EditFieldModel name. Falls back to InputFieldModel."""
    return EDIT_MAP.get(interface, "InputFieldModel")


def get_sub_model_structure(use: str) -> dict[str, str]:
    """Return model's child node structure {sub_key: sub_type}."""
    return get_model_def(use).get("sub_models", {})


def validate_parent_child(parent_use: str, sub_key: str, child_use: str) -> bool:
    """Validate that a parent-child relationship is legal.

    Checks that:
    1. The parent model has the given sub_key in its sub_models
    2. The child model exists in MODEL_DEFS (or is unknown)

    Returns True if valid, False otherwise.
    """
    parent_def = MODEL_DEFS.get(parent_use)
    if parent_def is None:
        return True  # unknown parent — permissive

    sub_models = parent_def.get("sub_models", {})
    if sub_key not in sub_models:
        return False  # parent doesn't accept this sub_key

    return True
