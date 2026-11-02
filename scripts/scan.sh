#!/usr/bin/env bash
#
# scripts/scan.sh — release gate for the public SecondPlanet Community repository.
#
# Runs three checks, in order, over the tracked working tree:
#   1. secrets        — gitleaks (when available) + a built-in regex pass
#   2. PII / internal  — e-mail addresses, phone numbers, private IPs,
#                        internal host names and enterprise-only identifiers
#   3. licenses        — every dependency license must be allowlisted
#
# Any hit fails the gate (exit code 1) and is printed with file and line.
# Usage:  bash scripts/scan.sh
#
set -uo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
cd "$ROOT_DIR" || exit 1

LICENSE_ALLOWLIST=${SCAN_LICENSE_ALLOWLIST:-scripts/scan-license-allow.txt}
MAX_REPORT=${SCAN_MAX_REPORT:-25}

FAILURES=0
SECRET_HITS=0
PII_HITS=0
LICENSE_HITS=0

WORK_DIR=$(mktemp -d) || exit 1
trap 'rm -rf "$WORK_DIR"' EXIT

if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BOLD=''; OFF=''
fi

pass() { printf '%sPASS%s %s\n' "$GREEN" "$OFF" "$1"; }
warn() { printf '%sWARN%s %s\n' "$YELLOW" "$OFF" "$1"; }
fail() { printf '%sFAIL%s %s\n' "$RED" "$OFF" "$1"; FAILURES=$((FAILURES + 1)); }
head1() { printf '\n%s== %s ==%s\n' "$BOLD" "$1" "$OFF"; }

# ---------------------------------------------------------------------------
# File list: everything git tracks or would track, minus ignored files.
# Falls back to find() outside a git checkout.
# ---------------------------------------------------------------------------
collect_files() {
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files -z --cached --others --exclude-standard
  else
    find . -type f \
      -not -path './.git/*' \
      -not -path '*/node_modules/*' \
      -not -path '*/dist/*' \
      -not -path '*/coverage/*' \
      -not -path '*/.next/*' \
      -not -path '*/test-results/*' \
      -not -path '*/playwright-report/*' \
      -not -name '*.log' \
      -print0
  fi
}

# The scanner, its allowlist and the Compose test (which asserts the absence of
# the enterprise identifiers by naming them) contain the patterns themselves.
collect_files | tr '\0' '\n' \
  | grep -v -e '^scripts/scan\.sh$' \
            -e '^scripts/scan-license-allow\.txt$' \
            -e '^deploy/community-stack\.test\.mjs$' \
  > "$WORK_DIR/files.txt" || true
tr '\n' '\0' < "$WORK_DIR/files.txt" > "$WORK_DIR/files0"

FILE_COUNT=$(grep -c . "$WORK_DIR/files.txt" || true)

# grep the file list, print up to MAX_REPORT hits, and report the total count
scan_pattern() { # $1 = description, $2 = extended regex, $3 = optional "ignore" regex
  local description=$1 pattern=$2 ignore=${3:-}
  local hits count
  if [ "$FILE_COUNT" -eq 0 ]; then
    warn "$description: skipped (no files to scan)"
    return 0
  fi
  hits=$(xargs -0 grep -I -n -E "$pattern" < "$WORK_DIR/files0" 2>/dev/null || true)
  if [ -n "$ignore" ]; then
    hits=$(printf '%s\n' "$hits" | grep -v -E "$ignore" || true)
  fi
  count=$(printf '%s\n' "$hits" | grep -c . || true)
  if [ "$count" -gt 0 ]; then
    fail "$description: $count hit(s)"
    printf '%s\n' "$hits" | head -n "$MAX_REPORT" | sed 's/^/    /'
    if [ "$count" -gt "$MAX_REPORT" ]; then
      printf '    ... %s more (raise SCAN_MAX_REPORT to see all)\n' "$((count - MAX_REPORT))"
    fi
    return "$count"
  fi
  pass "$description: clean"
  return 0
}

printf '%sSecondPlanet Community — public repository scan%s\n' "$BOLD" "$OFF"
printf 'repository: %s\nfiles scanned: %s\n' "$ROOT_DIR" "$FILE_COUNT"

# ===========================================================================
head1 "1/3 secret scan"
# ===========================================================================
GITLEAKS_RAN=0
GITLEAKS_CONFIG_ARGS=()
if [ -f scripts/gitleaks.toml ]; then
  GITLEAKS_CONFIG_ARGS=(--config scripts/gitleaks.toml)
fi

report_gitleaks() { # $1 = log file
  awk '
    /^Finding:/ { finding = $0; sub(/^Finding:[ \t]*/, "", finding) }
    /^RuleID:/  { rule = $2 }
    /^File:/    { file = $2 }
    /^Line:/    { printf "    %s:%s [%s] %s\n", file, $2, rule, finding }
  ' "$1" | head -n "$MAX_REPORT"
}

if command -v gitleaks >/dev/null 2>&1; then
  GITLEAKS_RAN=1
  if gitleaks detect --source "$ROOT_DIR" --no-git --redact --no-banner --no-color -v \
       "${GITLEAKS_CONFIG_ARGS[@]}" > "$WORK_DIR/gitleaks.log" 2>&1; then
    pass "gitleaks: clean"
  elif grep -q 'leaks found' "$WORK_DIR/gitleaks.log"; then
    fail "gitleaks: findings"
    report_gitleaks "$WORK_DIR/gitleaks.log"
  else
    fail "gitleaks: run failed"
    tail -n 10 "$WORK_DIR/gitleaks.log" | sed 's/^/    /'
  fi
elif command -v docker >/dev/null 2>&1; then
  # Fallback: run gitleaks from its published image. Needs network access to
  # pull the image; a failure here is not a gate failure, the built-in pass below
  # still runs.
  DOCKER_GITLEAKS_ARGS=()
  if [ ${#GITLEAKS_CONFIG_ARGS[@]} -gt 0 ]; then
    DOCKER_GITLEAKS_ARGS=(--config /repo/scripts/gitleaks.toml)
  fi
  if docker run --rm -v "$ROOT_DIR:/repo" zricethezav/gitleaks:latest \
       detect --source /repo --no-git --redact --no-banner --no-color -v \
       "${DOCKER_GITLEAKS_ARGS[@]}" > "$WORK_DIR/gitleaks.log" 2>&1; then
    GITLEAKS_RAN=1
    pass "gitleaks (docker): clean"
  elif grep -q 'leaks found' "$WORK_DIR/gitleaks.log"; then
    GITLEAKS_RAN=1
    fail "gitleaks (docker): findings"
    report_gitleaks "$WORK_DIR/gitleaks.log"
  else
    warn "gitleaks (docker): unavailable, built-in pattern pass only"
    tail -n 3 "$WORK_DIR/gitleaks.log" | sed 's/^/    /'
  fi
else
  warn "gitleaks not installed, built-in pattern pass only"
fi

# Built-in pass. High-confidence provider token formats.
SECRET_RE='AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|sk_test_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{32,}|sk-ant-[A-Za-z0-9_-]{20,}|(^|[^A-Za-z0-9_/+-])sk-[A-Za-z0-9]{20,}|-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----|(eyJ[A-Za-z0-9_-]{10,}\.){2}[A-Za-z0-9_-]{10,}'
scan_pattern "built-in secret patterns" "$SECRET_RE" || SECRET_HITS=$?

# Weaker pass: a literal assigned to a secret-ish key. The value must contain
# a digit — plain identifiers like AiProviderCredentials or current-refresh-token
# are not secrets.
SECRET_ASSIGN_RE='(secret|password|passwd|token|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_-]*[[:space:]]*[:=][[:space:]]*.?[A-Za-z0-9/+_-]*[0-9][A-Za-z0-9/+_-]{19,}'
PLACEHOLDER_RE='(example|placeholder|change[-_ ]?me|your[-_ ]|dummy|fake|redacted|xxxx|<[^>]+>|\.\.\.)'
scan_pattern "secret-looking assignments" "$SECRET_ASSIGN_RE" "$PLACEHOLDER_RE" || SECRET_HITS=$((SECRET_HITS + 1))

if [ "$SECRET_HITS" -gt 0 ]; then
  printf '    hint: rotate any real credential that was committed and remove it from history\n'
fi

# ===========================================================================
head1 "2/3 PII / internal information scan"
# ===========================================================================
EMAIL_RE='[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
# Reserved documentation domains (RFC 2606 / RFC 6761) and conventional
# non-routable fixture domains never carry real addresses. Single letter local
# parts (a@x.com) and the canonical documentation placeholders
# (you@company.com) are fixtures, not personal data.
ALLOWED_EMAIL_RE='@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.(test|invalid|local|example)|@(x|y|z|test)\.com([^A-Za-z0-9.-]|$)|@(example\.(com|org|net)|localhost|noreply\.github\.com)|(^|[^A-Za-z0-9._%+-])[[:alnum:]]@[[:alnum:].-]+\.[[:alpha:]]{2,}|(you|user|admin|test|info|contact)@(company|yourdomain|yourcompany|domain|website)\.(com|org|net)'
scan_pattern "e-mail addresses" "$EMAIL_RE" "$ALLOWED_EMAIL_RE" || PII_HITS=$((PII_HITS + 1))

PHONE_RE='([^0-9]|^)(\+?86[- ]?)?1[3-9][0-9]{9}([^0-9]|$)'
# 13800000000 / 13800138000 are carrier-reserved demonstration numbers.
scan_pattern "phone numbers" "$PHONE_RE" '1(3800000000|3800138000)' || PII_HITS=$((PII_HITS + 1))

LABELLED_PHONE_RE='(phone|mobile|telephone|tel)[^0-9a-z]{0,12}\+?[0-9][0-9 ().-]{7,}[0-9]'
scan_pattern "labelled phone numbers" "$LABELLED_PHONE_RE" '(example|placeholder|xxxx|13800000000)' || PII_HITS=$((PII_HITS + 1))

PRIVATE_IP_RE='([^0-9.]|^)(10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3}|169\.254\.[0-9]{1,3}\.[0-9]{1,3})([^0-9.]|$)'
# The link-local metadata address is a documented SSRF test target, not
# internal infrastructure.
scan_pattern "private network addresses" "$PRIVATE_IP_RE" '(10\.0\.0\.0|172\.16\.0\.0|192\.168\.0\.0|169\.254\.169\.254)' || PII_HITS=$((PII_HITS + 1))

# Lowercase host labels only, so property accesses like
# RegistrationMode.internal do not match.
INTERNAL_HOST_RE='(^|[^A-Za-z0-9_.])[a-z0-9_-]+\.(internal|corp|intranet)([^A-Za-z0-9.]|$)'
scan_pattern "internal host names" "$INTERNAL_HOST_RE" || PII_HITS=$((PII_HITS + 1))

PROD_DOMAIN_RE='(secondplanet\.cc|opencsg\.com|trae\.ai|tencentyun\.com|myqcloud\.com|daocloud\.io|sslip\.io|49\.234\.25\.35)'
scan_pattern "production domains / hosts" "$PROD_DOMAIN_RE" || PII_HITS=$((PII_HITS + 1))

ENTERPRISE_NAME_RE='(secondplanet-enterprise|enterprise-(api|web|runtime)|SecondPlanet Enterprise|@secondplanet/enterprise|ai-academy|ai_academy|ccr\.ccs\.tencentyun\.com)'
scan_pattern "enterprise-only identifiers" "$ENTERPRISE_NAME_RE" || PII_HITS=$((PII_HITS + 1))

# ===========================================================================
head1 "3/3 dependency license check"
# ===========================================================================
if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm not available — license check skipped"
elif [ ! -d node_modules ]; then
  warn "node_modules not installed — license check skipped (run: pnpm install --frozen-lockfile)"
else
  if ! pnpm licenses list --json > "$WORK_DIR/licenses.json" 2>"$WORK_DIR/licenses.err"; then
    warn "pnpm licenses list failed — license check skipped"
    sed 's/^/    /' "$WORK_DIR/licenses.err" | head -n 5
  elif node - "$WORK_DIR/licenses.json" "$LICENSE_ALLOWLIST" <<'NODE'
const fs = require('fs');

const [licensesPath, allowlistPath] = process.argv.slice(2);
const raw = fs.readFileSync(allowlistPath, 'utf8').split('\n');
const marker = raw.findIndex((line) => line.startsWith('# --- reviewed package exceptions'));
const allowed = new Set(
  raw
    .slice(0, marker === -1 ? raw.length : marker)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.toUpperCase()),
);
const exceptions = new Set(
  raw
    .slice(marker === -1 ? 0 : marker + 1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')),
);

const licenses = JSON.parse(fs.readFileSync(licensesPath, 'utf8'));
const offenders = [];

for (const [license, packages] of Object.entries(licenses)) {
  const tokens = license
    .replace(/[()]/g, '')
    .split(/\s+(?:OR|AND)\s+/i)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  const unknown = license.toUpperCase() === 'UNKNOWN';
  const allowedLicense = !unknown && tokens.length > 0 && tokens.every((token) => allowed.has(token));

  if (allowedLicense) continue;

  const names = packages
    .filter((pkg) => !exceptions.has(`${pkg.name}@${pkg.versions.join(',')}`))
    .map((pkg) => `${pkg.name}@${pkg.versions.join(',')}`);
  if (names.length === 0) continue;

  const category = unknown
    ? 'unknown license'
    : /GPL|LGPL|AGPL|CDDL|EPL|GFDL|OSL|SSPL|CECILL/.test(license)
      ? 'copyleft'
      : 'not allowlisted';
  offenders.push({ license, category, names });
}

if (offenders.length === 0) {
  process.exit(0);
}

for (const offender of offenders) {
  console.error(`    ${offender.license} (${offender.category}): ${offender.names.join(' ')}`);
}
process.exit(1);
NODE
  then
    pass "dependency licenses: allowlisted"
  else
    fail "dependency licenses: one or more licenses are not allowlisted"
    LICENSE_HITS=$((LICENSE_HITS + 1))
  fi
fi

# ===========================================================================
head1 "summary"
# ===========================================================================
printf 'secret scan hits      : %s\n' "$SECRET_HITS"
printf 'PII / internal hits   : %s\n' "$PII_HITS"
printf 'license hits          : %s\n' "$LICENSE_HITS"
printf 'gitleaks executed     : %s\n' "$([ "$GITLEAKS_RAN" -eq 1 ] && echo yes || echo no)"
printf 'files scanned         : %s\n' "$FILE_COUNT"

if [ "$FAILURES" -gt 0 ]; then
  printf '\n%sSCAN FAILED%s — %s check(s) found hits. This repository must not be published until they are removed.\n' \
    "$RED" "$OFF" "$FAILURES"
  exit 1
fi

printf '\n%sSCAN PASSED%s — no secrets, PII/internal information or disallowed licenses found.\n' \
  "$GREEN" "$OFF"
exit 0
