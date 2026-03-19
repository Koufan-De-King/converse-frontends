#!/usr/bin/env bash
# static-analysis.sh — Run static analyzers and generate a normalized summary
# for LLM consumption.
#
# Outputs:
#   .opencode/analysis.txt  — concise, severity-grouped summary (< 150 lines)
#
# Each analyzer is run with || true so partial failures do not abort the script.

set -euo pipefail

OUTDIR=".opencode"
mkdir -p "$OUTDIR"

ANALYSIS_FILE="$OUTDIR/analysis.txt"
CHANGED_FILES_FILE="$OUTDIR/changed-files.txt"

# ── Detect changed files ──────────────────────────────────────────────────────
echo "::group::Detecting changed files"
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  git diff --name-only origin/main...HEAD > "$CHANGED_FILES_FILE" 2>/dev/null || true
else
  git diff --name-only HEAD~1 > "$CHANGED_FILES_FILE" 2>/dev/null || true
fi
CHANGED_COUNT=$(wc -l < "$CHANGED_FILES_FILE" | tr -d ' ')
echo "Found $CHANGED_COUNT changed file(s)"
echo "::endgroup::"

# ── ESLint ────────────────────────────────────────────────────────────────────
ESLINT_STATUS="skipped"
ESLINT_ERRORS=0
ESLINT_WARNINGS=0
ESLINT_RAW="$OUTDIR/eslint-raw.json"

echo "::group::Running ESLint"
if npx eslint "**/*.{js,jsx,ts,tsx}" \
     --format json \
     --output-file "$ESLINT_RAW" 2>/dev/null; then
  ESLINT_STATUS="passed"
else
  # ESLint exits non-zero when it finds issues — that's expected
  if [ -f "$ESLINT_RAW" ] && [ -s "$ESLINT_RAW" ]; then
    ESLINT_STATUS="completed"
  else
    ESLINT_STATUS="failed"
  fi
fi

if [ -f "$ESLINT_RAW" ] && [ -s "$ESLINT_RAW" ]; then
  ESLINT_ERRORS=$(jq '[.[].errorCount] | add // 0' "$ESLINT_RAW" 2>/dev/null || echo 0)
  ESLINT_WARNINGS=$(jq '[.[].warningCount] | add // 0' "$ESLINT_RAW" 2>/dev/null || echo 0)
  if [ "$ESLINT_ERRORS" -eq 0 ] && [ "$ESLINT_WARNINGS" -eq 0 ]; then
    ESLINT_STATUS="passed"
  fi
fi
echo "ESLint: $ESLINT_STATUS (errors=$ESLINT_ERRORS, warnings=$ESLINT_WARNINGS)"
echo "::endgroup::"

# ── TypeScript ────────────────────────────────────────────────────────────────
TSC_STATUS="skipped"
TSC_ERRORS=0
TSC_RAW="$OUTDIR/tsc-raw.txt"

echo "::group::Running TypeScript type-check"
if npx tsc --noEmit 2>&1 | head -200 > "$TSC_RAW"; then
  TSC_STATUS="passed"
  TSC_ERRORS=0
else
  if [ -s "$TSC_RAW" ]; then
    TSC_STATUS="completed"
    TSC_ERRORS=$(grep -c "^.*error TS" "$TSC_RAW" 2>/dev/null || echo 0)
  else
    TSC_STATUS="failed"
  fi
fi
echo "TypeScript: $TSC_STATUS (errors=$TSC_ERRORS)"
echo "::endgroup::"

# ── Semgrep ───────────────────────────────────────────────────────────────────
SEMGREP_STATUS="skipped"
SEMGREP_HIGH=0
SEMGREP_MEDIUM=0
SEMGREP_LOW=0
SEMGREP_RAW="$OUTDIR/semgrep-raw.json"

echo "::group::Running Semgrep"
if command -v docker >/dev/null 2>&1; then
  if docker run --rm -v "$PWD:/src" semgrep/semgrep \
       semgrep scan --config p/default --json --output /src/"$SEMGREP_RAW" /src 2>/dev/null; then
    SEMGREP_STATUS="passed"
  else
    if [ -f "$SEMGREP_RAW" ] && [ -s "$SEMGREP_RAW" ]; then
      SEMGREP_STATUS="completed"
    else
      SEMGREP_STATUS="failed"
    fi
  fi
else
  # Try direct semgrep if available (e.g., pip-installed)
  if command -v semgrep >/dev/null 2>&1; then
    if semgrep scan --config p/default --json --output "$SEMGREP_RAW" . 2>/dev/null; then
      SEMGREP_STATUS="passed"
    else
      if [ -f "$SEMGREP_RAW" ] && [ -s "$SEMGREP_RAW" ]; then
        SEMGREP_STATUS="completed"
      else
        SEMGREP_STATUS="failed"
      fi
    fi
  else
    echo "Neither docker nor semgrep found, skipping Semgrep"
    SEMGREP_STATUS="unavailable"
  fi
fi

if [ -f "$SEMGREP_RAW" ] && [ -s "$SEMGREP_RAW" ]; then
  SEMGREP_HIGH=$(jq '[.results[] | select(.extra.severity == "ERROR")] | length' "$SEMGREP_RAW" 2>/dev/null || echo 0)
  SEMGREP_MEDIUM=$(jq '[.results[] | select(.extra.severity == "WARNING")] | length' "$SEMGREP_RAW" 2>/dev/null || echo 0)
  SEMGREP_LOW=$(jq '[.results[] | select(.extra.severity == "INFO")] | length' "$SEMGREP_RAW" 2>/dev/null || echo 0)
  if [ "$SEMGREP_HIGH" -eq 0 ] && [ "$SEMGREP_MEDIUM" -eq 0 ] && [ "$SEMGREP_LOW" -eq 0 ]; then
    SEMGREP_STATUS="passed"
  fi
fi
echo "Semgrep: $SEMGREP_STATUS (high=$SEMGREP_HIGH, medium=$SEMGREP_MEDIUM, low=$SEMGREP_LOW)"
echo "::endgroup::"

# ── Generate analysis.txt ────────────────────────────────────────────────────
echo "::group::Generating analysis summary"
{
  echo "# Static analysis summary"
  echo ""
  echo "## Changed files ($CHANGED_COUNT)"
  if [ -f "$CHANGED_FILES_FILE" ] && [ "$CHANGED_COUNT" -gt 0 ]; then
    head -20 "$CHANGED_FILES_FILE" | sed 's/^/- /'
    if [ "$CHANGED_COUNT" -gt 20 ]; then
      echo "- ... and $((CHANGED_COUNT - 20)) more"
    fi
  fi
  echo ""

  # ── High severity ──
  echo "## High severity"
  HAS_HIGH=false

  # ESLint errors (high)
  if [ -f "$ESLINT_RAW" ] && [ -s "$ESLINT_RAW" ] && [ "$ESLINT_ERRORS" -gt 0 ]; then
    HAS_HIGH=true
    # Show up to 15 errors, prioritizing changed files
    jq -r --slurpfile changed <(if [ -f "$CHANGED_FILES_FILE" ]; then jq -R -s 'split("\n") | map(select(. != ""))' "$CHANGED_FILES_FILE"; else echo '[]'; fi) '
      [.[] | select(.errorCount > 0) | {filePath, messages: [.messages[] | select(.severity == 2)]}]
      | sort_by(if (.filePath | IN($changed[0][])) then 0 else 1 end)
      | .[:15][]
      | .messages[] as $msg
      | "\(.filePath):\($msg.line) [ESLint] \($msg.ruleId // "unknown"): \($msg.message)"
    ' "$ESLINT_RAW" 2>/dev/null | head -15 | sed 's/^/- /' || true
  fi

  # Semgrep high severity
  if [ -f "$SEMGREP_RAW" ] && [ -s "$SEMGREP_RAW" ] && [ "$SEMGREP_HIGH" -gt 0 ]; then
    HAS_HIGH=true
    jq -r '
      [.results[] | select(.extra.severity == "ERROR")]
      | .[:10][]
      | "\(.path):\(.start.line) [Semgrep] \(.check_id): \(.extra.message)"
    ' "$SEMGREP_RAW" 2>/dev/null | head -10 | sed 's/^/- /' || true
  fi

  if [ "$HAS_HIGH" = false ]; then
    echo "- No high severity findings"
  fi
  echo ""

  # ── Medium severity ──
  echo "## Medium severity"
  HAS_MEDIUM=false

  # ESLint warnings (medium)
  if [ -f "$ESLINT_RAW" ] && [ -s "$ESLINT_RAW" ] && [ "$ESLINT_WARNINGS" -gt 0 ]; then
    HAS_MEDIUM=true
    jq -r '
      [.[] | select(.warningCount > 0) | {filePath, messages: [.messages[] | select(.severity == 1)]}]
      | .[:10][]
      | .messages[] as $msg
      | "\(.filePath):\($msg.line) [ESLint] \($msg.ruleId // "unknown"): \($msg.message)"
    ' "$ESLINT_RAW" 2>/dev/null | head -10 | sed 's/^/- /' || true
  fi

  # TypeScript errors (medium — type errors are important but not security)
  if [ -f "$TSC_RAW" ] && [ -s "$TSC_RAW" ] && [ "$TSC_ERRORS" -gt 0 ]; then
    HAS_MEDIUM=true
    grep "^.*error TS" "$TSC_RAW" 2>/dev/null | head -10 | sed 's/^/- [TypeScript] /' || true
  fi

  # Semgrep medium severity
  if [ -f "$SEMGREP_RAW" ] && [ -s "$SEMGREP_RAW" ] && [ "$SEMGREP_MEDIUM" -gt 0 ]; then
    HAS_MEDIUM=true
    jq -r '
      [.results[] | select(.extra.severity == "WARNING")]
      | .[:10][]
      | "\(.path):\(.start.line) [Semgrep] \(.check_id): \(.extra.message)"
    ' "$SEMGREP_RAW" 2>/dev/null | head -10 | sed 's/^/- /' || true
  fi

  if [ "$HAS_MEDIUM" = false ]; then
    echo "- No medium severity findings"
  fi
  echo ""

  # ── Low severity ──
  echo "## Low severity"
  if [ "$SEMGREP_LOW" -gt 0 ]; then
    echo "- $SEMGREP_LOW Semgrep informational finding(s) (see raw output for details)"
  else
    echo "- No low severity findings"
  fi
  echo ""

  # ── Quality gates ──
  echo "## Tests and quality gates"
  echo "- ESLint: $ESLINT_STATUS ($ESLINT_ERRORS error(s), $ESLINT_WARNINGS warning(s))"
  echo "- TypeScript: $TSC_STATUS ($TSC_ERRORS error(s))"
  echo "- Semgrep: $SEMGREP_STATUS ($SEMGREP_HIGH high, $SEMGREP_MEDIUM medium, $SEMGREP_LOW low)"
  echo ""

  # ── Suggested focus areas ──
  echo "## Suggested focus areas"

  # Extract unique directories from changed files for focus hints
  if [ -f "$CHANGED_FILES_FILE" ] && [ "$CHANGED_COUNT" -gt 0 ]; then
    FOCUS_DIRS=$(cat "$CHANGED_FILES_FILE" | xargs -I{} dirname {} 2>/dev/null | sort -u | head -5)
    for dir in $FOCUS_DIRS; do
      echo "- $dir"
    done
  fi

  # Add focus hints based on findings
  if [ "$SEMGREP_HIGH" -gt 0 ]; then
    echo "- Security: Semgrep found $SEMGREP_HIGH high-severity issue(s)"
  fi
  if [ "$ESLINT_ERRORS" -gt 0 ]; then
    echo "- Code quality: ESLint found $ESLINT_ERRORS error(s)"
  fi
  if [ "$TSC_ERRORS" -gt 0 ]; then
    echo "- Type safety: TypeScript found $TSC_ERRORS error(s)"
  fi

} > "$ANALYSIS_FILE"

LINE_COUNT=$(wc -l < "$ANALYSIS_FILE" | tr -d ' ')
echo "Generated $ANALYSIS_FILE ($LINE_COUNT lines)"
echo "::endgroup::"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Static Analysis Summary ==="
echo "ESLint:     $ESLINT_STATUS ($ESLINT_ERRORS errors, $ESLINT_WARNINGS warnings)"
echo "TypeScript: $TSC_STATUS ($TSC_ERRORS errors)"
echo "Semgrep:    $SEMGREP_STATUS ($SEMGREP_HIGH high, $SEMGREP_MEDIUM medium, $SEMGREP_LOW low)"
echo "Output:     $ANALYSIS_FILE ($LINE_COUNT lines)"
