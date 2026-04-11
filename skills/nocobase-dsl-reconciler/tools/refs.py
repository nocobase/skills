"""Variable reference resolver — semantic paths → UIDs.

state.yaml is the UID registry. refs.py resolves $-prefixed paths:

  $产品管理.filter.uid              → block UID
  $产品管理.table.fields.sku        → {wrapper: xxx, field: yyy}
  $产品管理.table.fields.sku.field  → field UID (string)
  $产品管理.table.actions.addNew    → {uid: xxx, popup_grid: yyy}
  $产品管理.table.actions.addNew.popup_grid → popup grid UID (string)

Usage:
    from refs import RefResolver
    resolver = RefResolver(state)

    # Resolve a single ref
    uid = resolver.resolve("$产品管理.table.actions.addNew.popup_grid")

    # Resolve all $refs in a dict/list (recursive)
    resolved = resolver.resolve_all(enhance_spec)

    # List all available paths (for AI to discover)
    paths = resolver.list_paths()
"""

from __future__ import annotations

from typing import Any


class RefResolver:
    """Resolve $-prefixed semantic paths against state.yaml."""

    def __init__(self, state: dict):
        self.state = state
        self._index: dict[str, Any] = {}
        self._build_index()

    def _build_index(self):
        """Build flat path→value index from state."""
        pages = self.state.get("pages", {})
        for page_key, page_val in pages.items():
            self._walk(page_val, page_key)

    def _walk(self, obj: Any, prefix: str):
        if isinstance(obj, dict):
            # Index the dict itself (for partial lookups)
            self._index[prefix] = obj
            for k, v in obj.items():
                self._walk(v, f"{prefix}.{k}")
        elif isinstance(obj, str):
            self._index[prefix] = obj
        elif isinstance(obj, (int, float)):
            self._index[prefix] = obj

    def resolve(self, ref: str) -> Any:
        """Resolve a $path to its value.

        Supports shorthand paths — auto-inserts 'blocks.' if needed:
          $订单列表.table.actions.addNew
            → tries: 订单列表.table.actions.addNew
            → tries: 订单列表.blocks.table.actions.addNew  ← match
        """
        path = ref.lstrip("$").strip()

        # Direct match
        if path in self._index:
            return self._index[path]

        # Auto-insert "blocks." after page name
        # e.g., "订单列表.table.xxx" → "订单列表.blocks.table.xxx"
        parts = path.split(".", 1)
        if len(parts) == 2 and parts[1] and not parts[1].startswith("blocks."):
            with_blocks = f"{parts[0]}.blocks.{parts[1]}"
            if with_blocks in self._index:
                return self._index[with_blocks]

            # Fuzzy match: "table" matches "table_0", "table_1", etc.
            block_and_rest = parts[1].split(".", 1)
            if len(block_and_rest) == 2:
                block_prefix = block_and_rest[0]  # e.g., "table"
                rest = block_and_rest[1]           # e.g., "fields.name"
                for idx_key in self._index:
                    if idx_key.startswith(f"{parts[0]}.blocks.{block_prefix}_") or \
                       idx_key.startswith(f"{parts[0]}.blocks.{block_prefix}."):
                        # Found a match like "page.blocks.table_0"
                        actual_block = idx_key.split(".")[2]  # "table_0"
                        fuzzy_path = f"{parts[0]}.blocks.{actual_block}.{rest}"
                        if fuzzy_path in self._index:
                            return self._index[fuzzy_path]

        raise KeyError(f"Ref not found: {ref}\n  Available: {self.suggest(path)}")

    def resolve_uid(self, ref: str) -> str:
        """Resolve a $path to a single UID string.

        If path points to a dict, looks for 'uid', 'popup_grid', 'popup_page',
        'field', 'wrapper' in that priority order.
        """
        val = self.resolve(ref)

        if isinstance(val, str):
            return val
        if isinstance(val, dict):
            for key in ("popup_grid", "uid", "field", "wrapper", "popup_page", "popup_tab"):
                if val.get(key):
                    return val[key]
            raise KeyError(f"Ref '{ref}' resolved to dict but no UID key found: {list(val.keys())}")

        return str(val)

    def resolve_all(self, obj: Any) -> Any:
        """Recursively resolve all $-prefixed strings in a dict/list."""
        if isinstance(obj, str) and obj.startswith("$"):
            return self.resolve_uid(obj)
        if isinstance(obj, dict):
            return {k: self.resolve_all(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self.resolve_all(item) for item in obj]
        return obj

    def suggest(self, partial: str) -> str:
        """Suggest matching paths for a partial path."""
        matches = [p for p in self._index if partial in p][:5]
        return ", ".join(matches) if matches else "(no matches)"

    def list_paths(self, page: str = None) -> list[str]:
        """List all available paths (for AI discovery).

        Returns only leaf paths (strings/ints), not intermediate dicts.
        """
        paths = []
        for p, v in sorted(self._index.items()):
            if page and not p.startswith(page) and not p.startswith(f"pages.{page}"):
                continue
            if isinstance(v, (str, int, float)):
                paths.append(f"${p}")
        return paths


def print_refs(state: dict, page: str = None):
    """Print all available variable references (for AI context)."""
    resolver = RefResolver(state)
    paths = resolver.list_paths(page)

    current_block = ""
    for p in paths:
        # Group by block
        parts = p.split(".")
        if len(parts) >= 4 and parts[2] == "blocks":
            block = f"{parts[1]}.{parts[3]}"
            if block != current_block:
                current_block = block
                print(f"\n  {block}:")
        val = resolver.resolve(p)
        short_val = str(val)[:16]
        print(f"    {p:55s} = {short_val}")


# ── CLI ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import yaml
    from pathlib import Path

    if len(sys.argv) < 2:
        print("Usage: python refs.py <state.yaml> [page_name]")
        print("  Lists all available $variable references")
        sys.exit(1)

    state = yaml.safe_load(Path(sys.argv[1]).read_text())
    page = sys.argv[2] if len(sys.argv) > 2 else None
    print_refs(state, page)
