# TwinEdge Wiring Map (Discovery Task A0)

Date: 2026-10-08  
Branch: `model/audit-and-wiring`  
Status: VERIFIED

## Executive Summary
This document maps every reference to model artifacts, scalers, feature column lists, datasets, and configurations across the TwinEdge repository.
It identifies consumer locations, legacy paths, and establishes the wiring requirements for centralized path management.

---

## 1. Primary Model and Data Artifacts

| Logical Component | Physical Path | SHA256 Hash | Bytes | Role |
| :--- | :--- | :--- | :--- | :--- |
| **ONNX Model** | `backend/model/twinedge_rul.onnx` | `032c3efa3156470e5ef7a3f31eb574d2830d4ff473625b6be814a05c0f1a1b7b` | 71,355 | Production 1D-CNN ONNX model |
| **TFLite Model** | `backend/model/twinedge_rul.tflite` | `fee78b64b6d573777002b235f7712d92310a425b52623e3c1e0de76bbf2832ee` | 24,408 | Quantized edge TFLite model |
| **StandardScaler** | `backend/data/processed/scaler.joblib` | `12b873826b644eb88a28bae4f78d43f74a609ee0803f5ab2c506ef6e691aa667` | 1,255 | Fitted StandardScaler (14 features) |
| **Active Features** | `backend/data/processed/active_features.txt` | `575c09b00e604eaf3fe6ac264b713aedcc16ac96a42f16add9f91a363faab0b6` | 63 | List of 14 sensor column names |
| **Feature Metadata** | `backend/data/processed/metadata.json` | `597dc830cba332b0c3065e182ea7c55e96841b8aa40d16ce9c4e6ce971164998` | 283 | Window size (30) & feature names |
| **Results Metadata** | `backend/model/results.json` | `6166441f71171ea9e23fe687afbc9847a0c416048bfaa709d9e9204cb96cdb2f` | 147 | Test RMSE (16.197) and mean CPU latency |
| **Processed Arrays** | `backend/data/processed/{x,y}_{train,val,test}.npy` | *Varied* | ~58 MB | Preprocessed train, val, and test arrays |
| **Raw Dataset** | `backend/data/raw/{train,test,RUL}_FD001.txt` | *Varied* | ~3.5 MB | C-MAPSS FD001 dataset files |

---

## 2. Consumers and Call Sites

### A. Backend Services
1. **`backend/app/main.py`**:
   - `MODEL_PATH`: `os.path.join(BASE_DIR, "model", "twinedge_rul.onnx")`
   - `TFLITE_PATH`: `os.path.join(BASE_DIR, "model", "twinedge_rul.tflite")`
   - `SCALER_PATH`: `os.path.join(BASE_DIR, "data", "processed", "scaler.joblib")`
   - `RESULTS_PATH`: `os.path.join(BASE_DIR, "model", "results.json")`
   - `FEATURES_PATH`: `os.path.join(BASE_DIR, "data", "processed", "active_features.txt")`
   - Startup event loads ONNX session and Scaler.
   - Endpoints:
     - `POST /predict`: Preprocesses input window, validates shape, scales via `scaler.transform`, runs `ort_session.run()`.
     - `GET /model/info`: Exposes file sizes, shapes, feature list, and test RMSE.

2. **`backend/simulate.py`**:
   - `load_pipeline_artifacts()`: Loads `metadata.json` and `scaler.joblib` from `backend/data/processed/`.
   - `load_raw_train()`: Loads `train_FD001.txt` from `backend/data/raw/`.
   - Replays engine sensor streams to `POST /predict`.

3. **`backend/app/test_main.py`**:
   - Unit tests checking shape validation, padding parity, `GET /model/info`, `GET /edge/stats`.

### B. Offline Assets Exporter
1. **`scripts/export_offline_assets.py`**:
   - Copies `backend/model/twinedge_rul.onnx` -> `frontend/public/offline/model.onnx`.
   - Exports `backend/data/processed/scaler.joblib` -> `frontend/public/offline/scaler.json` (`mean` and `std` arrays).
   - Generates `manifest.json`, `features.json`, `training_stats.json`, `replay_engines.json`, and `fixtures/parity_windows.json`.

### C. Frontend Offline Consumer
1. **`frontend/src/services/inferenceEngine.js`**:
   - Loads `/offline/model.onnx` and `/offline/scaler.json`.
   - Uses `onnxruntime-web` for in-browser client-side edge inference.

### D. Docker and Deployment
1. **`docker-compose.yml` & `docker-compose.prod.yml`**:
   - Mounts `./backend:/app` in container.
   - The backend runs `uvicorn app.main:app`.

---

## 3. Discrepancies and Clarifications

1. **Scaler Location**:
   - The prompt mentioned `scaler.joblib` with default under `backend/model` or root. In the codebase, the verified production file is located at `backend/data/processed/scaler.joblib` (1,255 bytes).
   - To adhere to both prompt requirements and backwards compatibility, `config/paths.py` will define `SCALER_PATH` defaulting to `backend/data/processed/scaler.joblib`, while also checking `backend/model/scaler.joblib` as fallback if specified.
2. **Features List**:
   - The 14 features are `[s_2, s_3, s_4, s_7, s_8, s_9, s_11, s_12, s_13, s_14, s_15, s_17, s_20, s_21]`.
   - Active features are listed in `backend/data/processed/active_features.txt` and `backend/data/processed/metadata.json`.

---

## 4. Next Step: Task A1 Implementation
- Implement `config/paths.py` and `config/settings.env.example` as the single source of truth.
- Generate `models/registry.json` capturing provenance, hashes, and signatures.
- Create `models/golden/golden_fixtures.json` for canary validation.
- Provide root `Makefile`, `.env.example`, and `.gitignore` updates.
