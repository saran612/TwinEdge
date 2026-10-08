"""
config/paths.py
Single Source of Truth for TwinEdge filesystem paths.
Environment-overridable with robust fallbacks.
"""

import os
from pathlib import Path

# Compute Repository Root Directory
# config/paths.py is at <ROOT>/config/paths.py
ROOT_DIR = Path(os.environ.get("TWINEDGE_ROOT", Path(__file__).resolve().parent.parent)).resolve()

# Models Directory
MODEL_DIR = Path(os.environ.get("TWINEDGE_MODEL_DIR", ROOT_DIR / "backend" / "model")).resolve()
ONNX_MODEL_PATH = Path(os.environ.get("TWINEDGE_ONNX_PATH", MODEL_DIR / "twinedge_rul.onnx")).resolve()
TFLITE_MODEL_PATH = Path(os.environ.get("TWINEDGE_TFLITE_PATH", MODEL_DIR / "twinedge_rul.tflite")).resolve()
RESULTS_PATH = Path(os.environ.get("TWINEDGE_RESULTS_PATH", MODEL_DIR / "results.json")).resolve()

# Registry and Golden Fixtures
REGISTRY_PATH = Path(os.environ.get("TWINEDGE_REGISTRY_PATH", ROOT_DIR / "models" / "registry.json")).resolve()
GOLDEN_FIXTURES_DIR = Path(os.environ.get("TWINEDGE_GOLDEN_DIR", ROOT_DIR / "models" / "golden")).resolve()
GOLDEN_FIXTURES_PATH = GOLDEN_FIXTURES_DIR / "golden_fixtures.json"

# Data Directories
DATA_DIR = Path(os.environ.get("TWINEDGE_DATA_DIR", ROOT_DIR / "backend" / "data")).resolve()
RAW_DATA_DIR = Path(os.environ.get("TWINEDGE_RAW_DATA_DIR", DATA_DIR / "raw")).resolve()
PROCESSED_DATA_DIR = Path(os.environ.get("TWINEDGE_PROCESSED_DATA_DIR", DATA_DIR / "processed")).resolve()

# Scaler Path (Default to backend/data/processed/scaler.joblib, fallback to backend/model/scaler.joblib if configured)
_default_scaler = PROCESSED_DATA_DIR / "scaler.joblib"
if not _default_scaler.exists() and (MODEL_DIR / "scaler.joblib").exists():
    _default_scaler = MODEL_DIR / "scaler.joblib"
SCALER_PATH = Path(os.environ.get("TWINEDGE_SCALER_PATH", _default_scaler)).resolve()

# Features Path
_default_features = PROCESSED_DATA_DIR / "active_features.txt"
if not _default_features.exists() and (MODEL_DIR / "active_features.txt").exists():
    _default_features = MODEL_DIR / "active_features.txt"
FEATURES_PATH = Path(os.environ.get("TWINEDGE_FEATURES_PATH", _default_features)).resolve()

# Metadata Path
METADATA_PATH = Path(os.environ.get("TWINEDGE_METADATA_PATH", PROCESSED_DATA_DIR / "metadata.json")).resolve()

# Offline Assets Export Directory
OFFLINE_ASSETS_DIR = Path(os.environ.get("TWINEDGE_OFFLINE_DIR", ROOT_DIR / "frontend" / "public" / "offline")).resolve()

# Reports & Temp Audit Directories
REPORTS_DIR = Path(os.environ.get("TWINEDGE_REPORTS_DIR", ROOT_DIR / "reports" / "model")).resolve()
TMP_AUDIT_DIR = Path(os.environ.get("TWINEDGE_TMP_AUDIT_DIR", ROOT_DIR / ".tmp_audit")).resolve()

def get_paths_dict():
    """Returns all paths as strings for JSON/logging."""
    return {
        "ROOT_DIR": str(ROOT_DIR),
        "MODEL_DIR": str(MODEL_DIR),
        "ONNX_MODEL_PATH": str(ONNX_MODEL_PATH),
        "TFLITE_MODEL_PATH": str(TFLITE_MODEL_PATH),
        "RESULTS_PATH": str(RESULTS_PATH),
        "REGISTRY_PATH": str(REGISTRY_PATH),
        "GOLDEN_FIXTURES_PATH": str(GOLDEN_FIXTURES_PATH),
        "DATA_DIR": str(DATA_DIR),
        "RAW_DATA_DIR": str(RAW_DATA_DIR),
        "PROCESSED_DATA_DIR": str(PROCESSED_DATA_DIR),
        "SCALER_PATH": str(SCALER_PATH),
        "FEATURES_PATH": str(FEATURES_PATH),
        "METADATA_PATH": str(METADATA_PATH),
        "OFFLINE_ASSETS_DIR": str(OFFLINE_ASSETS_DIR),
        "REPORTS_DIR": str(REPORTS_DIR),
        "TMP_AUDIT_DIR": str(TMP_AUDIT_DIR),
    }

if __name__ == "__main__":
    import json
    print(json.dumps(get_paths_dict(), indent=2))
