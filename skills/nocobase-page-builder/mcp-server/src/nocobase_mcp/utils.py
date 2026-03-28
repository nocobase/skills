"""Utility functions: uid generation, deep merge, etc."""

import json
import os
import random
import string


def uid() -> str:
    """Generate an 11-char random lowercase alphanumeric UID (NocoBase FlowModel format)."""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=11))


def safe_json(val):
    """Parse JSON string, or return as-is if already deserialized.

    FastMCP's pre_parse_json() auto-deserializes Optional[str] params
    that look like JSON. This helper handles both cases safely.
    """
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val  # already deserialized by FastMCP
    if isinstance(val, str):
        return json.loads(val)
    return val


def resolve_file(file_path: str, allow_dir: bool = False) -> str:
    """Resolve file path: try absolute, then NB_WORKDIR-relative, then CWD-relative.

    MCP server CWD differs from the agent's workdir. This function checks
    multiple locations so agents can pass relative filenames.

    Args:
        file_path: Path to resolve
        allow_dir: If True, also accept directories (not just files)
    """
    def _exists(p: str) -> bool:
        return os.path.isfile(p) or (allow_dir and os.path.isdir(p))

    if os.path.isabs(file_path) and _exists(file_path):
        return file_path
    workdir = os.environ.get("NB_WORKDIR", "")
    if workdir:
        candidate = os.path.join(workdir, file_path)
        if _exists(candidate):
            return candidate
    if _exists(file_path):
        return file_path
    kind = "Path" if allow_dir else "File"
    raise FileNotFoundError(
        f"{kind} not found: {file_path}"
        + (f" (also checked NB_WORKDIR={workdir})" if workdir else "")
        + ". Use absolute path or set NB_WORKDIR env var."
    )


def deep_merge(base: dict, patch: dict) -> dict:
    """Deep merge patch into base dict (in-place). Returns base for chaining."""
    for k, v in patch.items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            deep_merge(base[k], v)
        else:
            base[k] = v
    return base
