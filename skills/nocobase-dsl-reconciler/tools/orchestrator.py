"""Multi-round AI agent orchestrator for building NocoBase modules.

Drives kimi/claude through Round 1-6 automatically:
  1. Scaffold + deploy
  2. Test data
  3. Popups (enhance.yaml + auto detail)
  4. Validate + report

Each round: generate prompt → run agent → validate result → next round or retry.

Usage:
    python orchestrator.py <app_name> <app_description> [--agent kimi|claude]
    python orchestrator.py helpdesk "IT Helpdesk with tickets, SLA, knowledge base" --pages "Dashboard,Tickets,Users,SLA Configs,Knowledge Base"
"""

import subprocess
import sys
import json
import time
from pathlib import Path
from nb import NocoBase

SKILL_DIR = Path(__file__).parent.parent / "skills/skills/nocobase-dsl-reconciler"
if not SKILL_DIR.exists():
    SKILL_DIR = Path(__file__).parent  # fallback to current dir


def run_agent(prompt: str, workdir: str = None, agent: str = "kimi",
              max_steps: int = 80, timeout: int = 600) -> str:
    """Run an AI agent with a prompt and return output."""
    wd = workdir or str(SKILL_DIR)

    if agent == "kimi":
        cmd = ["kimi", "-w", wd, "--yolo", "--max-steps-per-turn", str(max_steps), "-p", prompt]
    else:
        cmd = ["claude", "-p", prompt, "--dangerously-skip-permissions", "--max-turns", str(max_steps)]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=wd)
        return result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return "[TIMEOUT]"
    except Exception as e:
        return f"[ERROR] {e}"


def validate_round1(app_dir: str, nb: NocoBase) -> dict:
    """Check Round 1: pages created?"""
    state_file = Path(app_dir) / "state.yaml"
    if not state_file.exists():
        return {"ok": False, "error": "No state.yaml — deploy failed"}

    import yaml
    state = yaml.safe_load(state_file.read_text())
    pages = state.get("pages", {})
    if not pages:
        return {"ok": False, "error": "No pages in state"}

    return {"ok": True, "pages": len(pages), "keys": list(pages.keys())}


def validate_round2(app_dir: str, nb: NocoBase) -> dict:
    """Check Round 2: test data inserted?"""
    import yaml
    state = yaml.safe_load((Path(app_dir) / "state.yaml").read_text())
    pages = state.get("pages", {})

    total_records = 0
    empty_tables = []
    for pk, pv in pages.items():
        blocks = pv.get("blocks", {})
        for bk, bv in blocks.items():
            if bv.get("type") != "table":
                continue
            # Try to count records
            coll = ""
            structure = yaml.safe_load((Path(app_dir) / "structure.yaml").read_text())
            for ps in structure.get("pages", []):
                for bs in ps.get("blocks", []):
                    if bs.get("key") == bk:
                        coll = bs.get("coll", ps.get("coll", ""))
                        break
            if coll:
                try:
                    r = nb.s.get(f"{nb.base}/api/{coll}:list", params={"pageSize": 1}, timeout=15)
                    count = r.json().get("meta", {}).get("count", len(r.json().get("data", [])))
                    total_records += count
                    if count == 0:
                        empty_tables.append(coll)
                except Exception:
                    pass

    if total_records == 0:
        return {"ok": False, "error": "No test data found", "empty": empty_tables}
    return {"ok": True, "records": total_records, "empty": empty_tables}


def validate_round3(app_dir: str, nb: NocoBase) -> dict:
    """Check Round 3: enhance.yaml exists and popups deployed?"""
    enhance = Path(app_dir) / "enhance.yaml"
    if not enhance.exists():
        return {"ok": False, "error": "No enhance.yaml"}
    return {"ok": True}


def build_module(app_name: str, description: str, pages: str,
                 agent: str = "kimi", app_dir: str = None):
    """Orchestrate full module build through multiple rounds."""
    nb = NocoBase()
    if not app_dir:
        app_dir = app_name.lower().replace(" ", "_")

    base_context = (
        f"Read SKILL.md Quick Start and examples/crm/ to learn the DSL format. "
        f"Tools in ./tools/ directory. NocoBase at {nb.base}. "
        f"Deploy command: cd tools && python deployer.py ../{app_dir}/"
    )

    print(f"\n{'='*60}")
    print(f"  Building: {app_name}")
    print(f"  Pages: {pages}")
    print(f"  Agent: {agent}")
    print(f"  Dir: {app_dir}/")
    print(f"{'='*60}")

    # ── Round 1: Scaffold + Deploy ──
    print(f"\n── Round 1: Scaffold + Deploy ──")
    prompt1 = (
        f"{base_context} "
        f"Round 1 ONLY. Build {app_name} system. Dir: {app_dir}. "
        f"Pages: {pages}. {description}. "
        f"Write structure.yaml with collections and all pages. "
        f"Each page: filterForm + table + actions. "
        f"Then deploy: cd tools && python deployer.py ../{app_dir}/"
    )
    output1 = run_agent(prompt1, agent=agent)
    r1 = validate_round1(app_dir, nb)
    if r1["ok"]:
        print(f"  ✓ Round 1: {r1['pages']} pages deployed")
    else:
        print(f"  ✗ Round 1 failed: {r1['error']}")
        print(f"  Retrying...")
        output1 = run_agent(prompt1 + " IMPORTANT: use deployer.py not curl", agent=agent)
        r1 = validate_round1(app_dir, nb)
        if not r1["ok"]:
            print(f"  ✗ Round 1 retry failed. Stopping.")
            return

    # ── Round 2: Test Data ──
    print(f"\n── Round 2: Test Data ──")
    prompt2 = (
        f"{base_context} "
        f"Round 2 ONLY. The {app_name} module is already deployed in {app_dir}/. "
        f"Insert 5-8 test records per collection using NocoBase API: "
        f"ctx.request or curl POST to {nb.base}/api/COLLECTION:create. "
        f"Make data realistic with proper relations."
    )
    output2 = run_agent(prompt2, agent=agent)
    r2 = validate_round2(app_dir, nb)
    if r2["ok"]:
        print(f"  ✓ Round 2: {r2['records']} total records")
        if r2.get("empty"):
            print(f"    ⚠ Empty tables: {r2['empty']}")
    else:
        print(f"  ⚠ Round 2: {r2['error']} — continuing anyway")

    # ── Round 3: Popups ──
    print(f"\n── Round 3: Popups (enhance.yaml) ──")
    prompt3 = (
        f"{base_context} "
        f"Round 3 ONLY. The {app_name} module is deployed in {app_dir}/. "
        f"Write enhance.yaml with addNew popup for each page. "
        f"Use auto: [edit, detail] to auto-derive edit and detail popups. "
        f"See examples/crm/enhance.yaml for format. "
        f"Then deploy: cd tools && python deployer.py ../{app_dir}/ --force"
    )
    output3 = run_agent(prompt3, agent=agent)
    r3 = validate_round3(app_dir, nb)
    if r3["ok"]:
        print(f"  ✓ Round 3: enhance.yaml created")
    else:
        print(f"  ⚠ Round 3: {r3['error']}")

    # ── Summary ──
    print(f"\n{'='*60}")
    print(f"  Build complete: {app_name}")
    print(f"  Pages: {r1.get('pages', '?')}")
    print(f"  Records: {r2.get('records', '?')}")
    print(f"  Enhance: {'✓' if r3.get('ok') else '✗'}")
    print(f"  URL: {nb.base}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    app_name = sys.argv[1]
    description = sys.argv[2]
    pages = "Dashboard,Main"
    agent = "kimi"

    if "--pages" in sys.argv:
        pi = sys.argv.index("--pages")
        pages = sys.argv[pi + 1]
    if "--agent" in sys.argv:
        ai = sys.argv.index("--agent")
        agent = sys.argv[ai + 1]

    build_module(app_name, description, pages, agent)
