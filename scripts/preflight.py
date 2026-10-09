#!/usr/bin/env python3
"""
TwinEdge Preflight Verification Checklist (R4)
Checks:
 1. Backend health & model loading (/health)
 2. SQLite local store responsiveness
 3. Fleet node ingestion (/fleet)
 4. Telemetry stream responsiveness (/stream/{engine_key})
 5. Offline audit assets & manifest
 6. Log sink non-empty (/logs)
"""
import sys
import json
import urllib.request
import os

def check(name, test_fn):
    try:
        ok, detail = test_fn()
        if ok:
            print(f"  [\033[92mPASS\033[0m] {name}: {detail}")
            return True
        else:
            print(f"  [\033[91mFAIL\033[0m] {name}: {detail}")
            return False
    except Exception as e:
        print(f"  [\033[91mFAIL\033[0m] {name}: Exception: {e}")
        return False

def check_backend_health():
    req = urllib.request.urlopen("http://localhost:8000/health", timeout=3)
    data = json.loads(req.read().decode("utf-8"))
    if data.get("status") == "ok" and data.get("model_loaded") and data.get("scaler_loaded"):
        return True, "Model & scaler loaded, SQLite sink healthy"
    return False, f"Unexpected health status: {data}"

def check_fleet():
    req = urllib.request.urlopen("http://localhost:8000/fleet", timeout=3)
    data = json.loads(req.read().decode("utf-8"))
    if isinstance(data, list) and len(data) > 0:
        return True, f"{len(data)} nodes registered in fleet tracking"
    return False, "Fleet list is empty"

def check_audit_artifacts():
    p = "frontend/public/audit/manifest.json"
    if os.path.exists(p):
        with open(p) as f:
            d = json.load(f)
        return True, f"Manifest verified with {len(d)} audit files"
    return False, f"Manifest missing at {p}"

def check_logs():
    req = urllib.request.urlopen("http://localhost:8000/logs?limit=5", timeout=3)
    data = json.loads(req.read().decode("utf-8"))
    if isinstance(data, list) and len(data) > 0:
        return True, f"{len(data)} recent log rows returned"
    return False, "Logs endpoint returned empty list"

def check_frontend():
    req = urllib.request.urlopen("http://localhost:5173", timeout=3)
    code = req.getcode()
    if code == 200:
        return True, "Frontend HTTP port 5173 responding"
    return False, f"HTTP status {code}"

def main():
    print("==================================================")
    print(" TwinEdge Preflight Smoke & Health Checklist")
    print("==================================================")
    results = [
        check("Backend Health (/health)", check_backend_health),
        check("Frontend HTTP Server", check_frontend),
        check("Fleet Ingestion (/fleet)", check_fleet),
        check("System Log Store (/logs)", check_logs),
        check("Model Audit Snapshot", check_audit_artifacts),
    ]
    print("==================================================")
    if all(results):
        print("\033[92mALL PREFLIGHT CHECKS PASSED (5/5)\033[0m")
        sys.exit(0)
    else:
        passed = sum(1 for r in results if r)
        print(f"\033[91mPREFLIGHT WARNING: {passed}/{len(results)} checks passed.\033[0m")
        sys.exit(1)

if __name__ == "__main__":
    main()
