#!/usr/bin/env bash
# End-to-end smoke test for nocobase-dsl-reconciler.
#
# Exercises the full happy path in one run so future refactors can't silently
# break the pipeline:
#
#   Stage 1  pull crm (fresh from NB)      — exporter works
#   Stage 2  duplicate crm → crm-copy      — duplicate-project works + UID
#                                              isolation + .duplicate-source marker
#   Stage 3  clean NB + push crm-copy --copy — deployer + --copy gating work
#   Stage 4  copy row data source → copy   — data copy + type coercion work
#   Stage 5  re-pull crm-copy + diff        — round-trip works
#
# Requires:
#   - NB reachable at $NB_URL with $NB_USER / $NB_PASSWORD credentials
#   - PostgreSQL reachable at $PG_DSN (default: local compose)
#   - workspaces/crm already present (source-of-truth project)
#
# Usage: scripts/e2e.sh [--offline]
#   --offline  only run stage 2 (duplicate) — pure disk ops, no NB/DB.
#              Useful for CI pre-check when a live NB isn't available.
#
# Exit 0 on all-pass; 1 on any stage failure. Stage logs land in
# /tmp/e2e-reconciler-<pid>/.

set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$SKILL_ROOT/src"
WORKSPACES_DIR="$SKILL_ROOT/workspaces"
SCRIPTS_DIR="$SKILL_ROOT/scripts"
CRM_SRC_NAME="crm"
CRM_COPY_NAME="crm-copy"
CRM_SRC="$WORKSPACES_DIR/$CRM_SRC_NAME"
CRM_COPY="$WORKSPACES_DIR/$CRM_COPY_NAME"
E2E_DIR="/tmp/e2e-reconciler-$$"
mkdir -p "$E2E_DIR"

export NB_URL="${NB_URL:-http://localhost:14000}"
export NB_USER="${NB_USER:-admin@nocobase.com}"
export NB_PASSWORD="${NB_PASSWORD:-admin123}"
export PG_DSN="${PG_DSN:-dbname=nocobase user=nocobase password=nocobase host=localhost port=5435}"

OFFLINE=0
for a in "$@"; do
  [ "$a" = "--offline" ] && OFFLINE=1
done

# pretty
RED='\033[31m'; GRN='\033[32m'; YLW='\033[33m'; DIM='\033[2m'; RST='\033[0m'
stage() { echo -e "\n${DIM}─────${RST} ${GRN}$*${RST} ${DIM}─────${RST}"; }
ok()    { echo -e "  ${GRN}✓${RST} $*"; }
warn()  { echo -e "  ${YLW}⚠${RST} $*"; }
die()   { echo -e "  ${RED}✗${RST} $*"; exit 1; }
info()  { echo -e "    $*"; }

cli() { ( cd "$SRC_DIR" && npx tsx cli/cli.ts "$@" ); }

# Some stages need to write into /tmp (fresh pull + re-pull); the CLI
# normally pins paths to workspaces/. Override per-invocation.
cli_freeroot() { ( cd "$SRC_DIR" && NB_WORKSPACE_ROOT=/ npx tsx cli/cli.ts "$@" ); }

FAILED_STAGES=()
run_stage() {
  local name="$1"; shift
  if "$@"; then
    return 0
  fi
  FAILED_STAGES+=("$name")
  return 0  # don't abort script — let later stages attempt, fail at summary
}

# ───── Stage 0: Preflight ─────
stage "Stage 0: Preflight"
[ -d "$CRM_SRC" ] || die "source project missing: $CRM_SRC"
[ -f "$CRM_SRC/routes.yaml" ] || die "crm/routes.yaml missing — not a valid project"
ok "source project: $CRM_SRC"

if [ "$OFFLINE" = "0" ]; then
  if ! curl -sf -o /dev/null "$NB_URL/api/app:getInfo"; then
    die "NB not reachable at $NB_URL (use --offline to skip NB/DB stages)"
  fi
  ok "NB reachable at $NB_URL"
fi

# ───── Stage 1: pull crm ─────
stage_1_pull() {
  stage "Stage 1: pull crm → /tmp/e2e/pulled"
  local PULL_DIR="$E2E_DIR/pulled"
  mkdir -p "$PULL_DIR"
  # Pull everything NB knows about — live state is the superset (pre-existing
  # Copy + other projects also land here, which is fine; we only check that
  # pull works end-to-end and produces non-zero output.
  if ! cli_freeroot pull "$PULL_DIR" > "$E2E_DIR/pull.log" 2>&1; then
    warn "see $E2E_DIR/pull.log"
    die "pull failed"
  fi

  local pulled_pages pulled_colls pulled_wf
  pulled_pages=$(find "$PULL_DIR/pages" -maxdepth 5 -name 'page.yaml' 2>/dev/null | wc -l | tr -d ' ')
  pulled_colls=$(find "$PULL_DIR/collections" -maxdepth 1 -name '*.yaml' 2>/dev/null | wc -l | tr -d ' ')
  pulled_wf=$(find "$PULL_DIR/workflows" -maxdepth 1 -name '*.yaml' 2>/dev/null | wc -l | tr -d ' ')

  info "pulled pages=$pulled_pages  collections=$pulled_colls  workflows=$pulled_wf"
  [ "$pulled_pages" -gt 0 ] || die "pull returned 0 pages — exporter broken or NB empty"
  [ "$pulled_colls" -gt 0 ] || die "pull returned 0 collections — exporter broken"
  ok "pull produced pages + collections + workflows"
}

# ───── Stage 2: duplicate-project ─────
stage_2_duplicate() {
  stage "Stage 2: duplicate $CRM_SRC_NAME → $CRM_COPY_NAME"
  rm -rf "$CRM_COPY"
  if ! cli duplicate-project "$CRM_SRC_NAME" "$CRM_COPY_NAME" \
        --key-suffix _copy \
        --title-prefix "Copy - " \
        --collection-suffix _copy \
        --skip-group 项目管理 \
        --force > "$E2E_DIR/duplicate.log" 2>&1; then
    warn "see $E2E_DIR/duplicate.log"
    die "duplicate-project failed"
  fi

  [ -f "$CRM_COPY/.duplicate-source" ] || die ".duplicate-source marker missing (--copy gate will refuse this)"
  ok ".duplicate-source marker present"

  # UID isolation: pages/ is the live deployment surface. templateUid values
  # may overlap by design — a template whose UID isn't remapped but whose
  # collection/targetUid ARE remapped is a shared template library entry.
  # Guard against a rewriter regression flooding overlap; tolerate a small
  # baseline. If OVERLAP climbs far above baseline, the rewriter broke.
  local OVERLAP
  OVERLAP=$(comm -12 \
    <(grep -rhE '^\s*(uid|templateUid|targetUid):\s+[a-z0-9]{11}\s*$' "$CRM_SRC/pages" --include='*.yaml' 2>/dev/null \
        | grep -oE '[a-z0-9]{11}' | sort -u) \
    <(grep -rhE '^\s*(uid|templateUid|targetUid):\s+[a-z0-9]{11}\s*$' "$CRM_COPY/pages" --include='*.yaml' 2>/dev/null \
        | grep -oE '[a-z0-9]{11}' | sort -u) \
    | wc -l | tr -d ' ')
  info "pages/ FlowModel UID overlap: $OVERLAP (baseline ~1, threshold 10)"
  [ "$OVERLAP" -lt 10 ] || die "pages/ UID overlap $OVERLAP >> baseline — rewriter regression"
  ok "pages/ UID isolation within expected baseline"

  # Duplicate should produce at least as many non-skipped pages as source — skip_group 项目管理 is tiny
  local copy_pages
  copy_pages=$(find "$CRM_COPY/pages" -maxdepth 4 -name 'page.yaml' 2>/dev/null | wc -l | tr -d ' ')
  info "duplicate page count: $copy_pages"
  [ "$copy_pages" -gt 10 ] || die "suspiciously few pages in duplicate ($copy_pages) — skip_group too aggressive?"
  ok "duplicate has $copy_pages pages"
}

# ───── Stage 3: push crm-copy --copy ─────
stage_3_push() {
  stage "Stage 3: clean NB + push $CRM_COPY_NAME --copy"
  if ! python3 "$SCRIPTS_DIR/cleanup-copy.py" > "$E2E_DIR/cleanup.log" 2>&1; then
    warn "cleanup returned non-zero (ok if NB was empty); see $E2E_DIR/cleanup.log"
  fi
  ok "NB cleaned of prior Copy artefacts"

  if ! cli push "$CRM_COPY_NAME" --copy > "$E2E_DIR/push.log" 2>&1; then
    warn "see $E2E_DIR/push.log"
    die "push failed"
  fi
  local STATE VAL_BYPASS POST_ERRS
  STATE=$(grep -c 'State saved' "$E2E_DIR/push.log" || true)
  # Errors come in three buckets:
  #   - Spec-validator errors under "── Spec Validation ERRORS (bypassed in --copy mode) ──"
  #     → these are the whole point of --copy; don't count them.
  #   - Post-deploy errors under "── Post-deploy errors ──" (popup-ref misses etc).
  #     Some are baseline for the CRM project (exchange_rate has ~5 known).
  #   - Any other ✗ lines — genuine deploy failures.
  VAL_BYPASS=$(grep -cE '^\s+[0-9]+ errors bypassed' "$E2E_DIR/push.log" || true)
  # Count ✗ lines AFTER "State saved. Done." — excludes the bypassed validator block.
  POST_ERRS=$(awk '/State saved\. Done/{p=1} p' "$E2E_DIR/push.log" | grep -cE '^\s{2,}✗ ' || true)
  info "State saved:          $STATE"
  info "Validator bypassed:   $VAL_BYPASS lines (expected with --copy)"
  info "Post-deploy errors:   $POST_ERRS (baseline ≤8 for CRM: exchange_rate popup refs)"
  [ "$STATE" -ge 1 ] || die "'State saved' not in push log — push didn't complete"
  [ "$POST_ERRS" -le 8 ] || die "post-deploy errors $POST_ERRS > baseline 8 — regression"
  ok "push complete — State saved ×$STATE, post-deploy errors within baseline"
}

# ───── Stage 4: data copy ─────
stage_4_data() {
  stage "Stage 4: copy row data (source → copy)"
  if ! python3 "$SCRIPTS_DIR/copy-data.py" > "$E2E_DIR/copy-data.log" 2>&1; then
    # copy-data.py exits 1 on any row mismatch — still show log
    warn "copy-data exited non-zero (mismatches); see $E2E_DIR/copy-data.log"
  fi
  local COPIED MISMATCH
  COPIED=$(awk -F': copied ' '/copied/ {split($2,a," "); sum+=a[1]} END{print sum+0}' "$E2E_DIR/copy-data.log")
  MISMATCH=$(grep -c '⚠' "$E2E_DIR/copy-data.log" || true)
  info "rows copied:       $COPIED"
  info "row-count mismatches: $MISMATCH (baseline 3 for CRM: m2m through-tables missing id column)"
  [ "$COPIED" -gt 0 ] || die "copy-data produced 0 copied rows — did duplicate omit *_copy tables?"
  [ "$MISMATCH" -le 5 ] || die "$MISMATCH table mismatches > baseline 5 — regression"
  ok "data copy complete — $COPIED row(s) across 25+ tables, $MISMATCH tolerated mismatch(es)"
}

# ───── Stage 5: re-pull + coarse diff ─────
stage_5_repull() {
  stage "Stage 5: re-pull $CRM_COPY_NAME and compare counts"
  local REPULL="$E2E_DIR/repull"
  mkdir -p "$REPULL"
  # Seed repull with pushed routes.yaml so the exporter can reuse the DSL
  # keys when naming dirs (otherwise top-group dirs come back as the
  # title-slug `copy_main` instead of the key `main_copy` — equivalent
  # content, just cosmetic rename).
  cp "$CRM_COPY/routes.yaml" "$REPULL/routes.yaml" 2>/dev/null || true

  if ! cli_freeroot pull "$REPULL" > "$E2E_DIR/repull.log" 2>&1; then
    warn "see $E2E_DIR/repull.log"
    die "re-pull failed"
  fi

  # Whole-project page count — robust to dir-naming (main_copy vs copy_main
  # depending on which side names by DSL key vs title-slug). We only want
  # to detect data loss, so totals + collections on both sides is enough.
  local pushed repulled pushed_colls repulled_colls
  pushed=$(find "$CRM_COPY/pages" -maxdepth 5 -name 'page.yaml' 2>/dev/null | wc -l | tr -d ' ')
  repulled=$(find "$REPULL/pages" -maxdepth 5 -name 'page.yaml' 2>/dev/null | wc -l | tr -d ' ')
  pushed_colls=$(find "$CRM_COPY/collections" -maxdepth 1 -name '*_copy.yaml' 2>/dev/null | wc -l | tr -d ' ')
  repulled_colls=$(find "$REPULL/collections" -maxdepth 1 -name '*_copy.yaml' 2>/dev/null | wc -l | tr -d ' ')
  info "total pages:   pushed=$pushed  repulled=$repulled"
  info "_copy colls:   pushed=$pushed_colls  repulled=$repulled_colls"
  # repull includes source-crm pages too (live NB has both); just check
  # repull isn't LOSING Copy pages.
  [ "$repulled" -ge "$pushed" ] || die "re-pull total pages ($repulled) < pushed ($pushed) — round-trip lost data"
  [ "$repulled_colls" -ge "$pushed_colls" ] || die "re-pull _copy collections ($repulled_colls) < pushed ($pushed_colls)"
  ok "round-trip page + collection counts intact"
}

# ───── Run ─────
if [ "$OFFLINE" = "0" ]; then
  run_stage "pull"       stage_1_pull
  run_stage "duplicate"  stage_2_duplicate
  run_stage "push"       stage_3_push
  run_stage "data"       stage_4_data
  run_stage "repull"     stage_5_repull
else
  run_stage "duplicate"  stage_2_duplicate
  info "--offline: ran stage 2 only (pure disk)"
fi

# ───── Summary ─────
echo
echo "=== e2e summary ==="
echo "logs: $E2E_DIR"
if [ "${#FAILED_STAGES[@]}" -eq 0 ]; then
  echo -e "${GRN}all stages passed${RST}"
  exit 0
else
  echo -e "${RED}failed stages: ${FAILED_STAGES[*]}${RST}"
  exit 1
fi
