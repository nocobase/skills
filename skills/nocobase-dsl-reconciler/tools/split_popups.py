"""Split enhance.yaml popups into individual files.

addNew popups stay in enhance.yaml.
Detail popups (fields.xxx, tabs, mode:embed/drawer) → popups/<page>-<field>.yaml

Usage:
    python split_popups.py pm/
    python split_popups.py erp/
"""

import sys
from pathlib import Path
import yaml


def _dump(data):
    """Dump YAML without aliases."""
    class NoAlias(yaml.SafeDumper):
        def ignore_aliases(self, data):
            return True
    return yaml.dump(data, Dumper=NoAlias, default_flow_style=False,
                     allow_unicode=True, sort_keys=False)


def split_popups(mod_dir: str):
    mod = Path(mod_dir)
    enhance_file = mod / "enhance.yaml"
    if not enhance_file.exists():
        print("  No enhance.yaml")
        return

    enhance = yaml.safe_load(enhance_file.read_text()) or {}
    popups = enhance.get("popups", [])
    if not popups:
        return

    popups_dir = mod / "popups"
    popups_dir.mkdir(exist_ok=True)

    keep_in_enhance = []  # addNew popups
    split_count = 0

    for popup in popups:
        target = popup.get("target", "")

        # addNew popups stay in enhance.yaml
        if "actions.addNew" in target:
            keep_in_enhance.append(popup)
            continue

        # Everything else → separate file
        # Generate filename from target: $projects.table.fields.name → projects-name.yaml
        parts = target.lstrip("$").split(".")
        page = parts[0] if parts else "unknown"

        # Find the field or action name
        if "fields." in target:
            field = target.split("fields.")[-1]
            fname = f"{page}-{field}.yaml"
        elif "record_actions." in target:
            action = target.split("record_actions.")[-1]
            fname = f"{page}-{action}.yaml"
        else:
            fname = f"{page}-popup.yaml"

        popup_file = popups_dir / fname
        popup_file.write_text(_dump(popup))
        split_count += 1
        print(f"  → popups/{fname}")

    # Update enhance.yaml with only addNew popups
    enhance["popups"] = keep_in_enhance
    enhance_file.write_text(_dump(enhance))

    print(f"\n  Split: {split_count} detail popups → popups/")
    print(f"  Kept: {len(keep_in_enhance)} addNew popups in enhance.yaml")


def merge_popups(mod_dir: str):
    """Merge popups/*.yaml back into enhance.yaml (for export/review)."""
    mod = Path(mod_dir)
    enhance_file = mod / "enhance.yaml"
    enhance = yaml.safe_load(enhance_file.read_text()) if enhance_file.exists() else {}
    popups = list(enhance.get("popups", []))

    popups_dir = mod / "popups"
    if popups_dir.is_dir():
        for pf in sorted(popups_dir.glob("*.yaml")):
            popup_spec = yaml.safe_load(pf.read_text())
            if popup_spec and popup_spec.get("target"):
                # Check not already in enhance
                existing = {p.get("target") for p in popups}
                if popup_spec["target"] not in existing:
                    popups.append(popup_spec)

    enhance["popups"] = popups
    enhance_file.write_text(_dump(enhance))
    print(f"  Merged: {len(popups)} total popups")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    mod_dir = sys.argv[1]
    if "--merge" in sys.argv:
        merge_popups(mod_dir)
    else:
        split_popups(mod_dir)
