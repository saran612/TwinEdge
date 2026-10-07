#!/usr/bin/env bash
set -euo pipefail

# TwinEdge Production Smoke Test Script
# Validates running services and core HTTP API contracts

HOST="${1:-http://localhost:8000}"
echo "================================================="
echo " Running TwinEdge Smoke Tests against: $HOST"
echo "================================================="

# Portability helper: use curl, wget, or python3 urllib
http_get() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -s -f "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
  else
    python3 -c "import urllib.request; print(urllib.request.urlopen('$url').read().decode('utf-8'))"
  fi
}

http_post() {
  local url="$1"
  local data="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -s -f -X POST "$url" -H "Content-Type: application/json" -d "$data"
  else
    python3 -c "
import urllib.request, sys
req = urllib.request.Request('$url', data='''$data'''.encode('utf-8'), headers={'Content-Type': 'application/json'})
print(urllib.request.urlopen(req).read().decode('utf-8'))"
  fi
}

# 1. Check Health
echo -n "[1/6] Checking /health endpoint... "
HEALTH_RES=$(http_get "$HOST/health")
echo "OK"

# 2. Check Model Info
echo -n "[2/6] Checking /model/info endpoint... "
MODEL_RES=$(http_get "$HOST/model/info")
echo "OK"

# 3. Check Edge Stats
echo -n "[3/6] Checking /edge/stats endpoint... "
EDGE_RES=$(http_get "$HOST/edge/stats")
echo "OK"

# 4. Check POST /predict with early-cycle padding
echo -n "[4/6] Checking POST /predict (window=1 cycle)... "
PRED_PAYLOAD='{"engine_id": 999, "cycle": 1, "window": [[1,2,3,4,5,6,7,8,9,10,11,12,13,14]]}'
PRED_RES=$(http_post "$HOST/predict" "$PRED_PAYLOAD")
echo "OK"

# 5. Check Immutable Audit Chain
echo -n "[5/6] Checking GET /audit endpoint... "
AUDIT_RES=$(http_get "$HOST/audit")
echo "OK"

# 6. Check Cryptographic Audit Verification
echo -n "[6/6] Checking GET /audit/verify endpoint... "
VERIFY_RES=$(http_get "$HOST/audit/verify")
if echo "$VERIFY_RES" | grep -q '"ok":true'; then
  echo "OK (Integrity verified)"
else
  echo "FAILED"
  exit 1
fi

echo "================================================="
echo " ALL SMOKE TESTS PASSED SUCCESSFULLY! "
echo "================================================="
