# Sprint Decisions and Assumptions Log

## Architecture & Design
- **Autonomous Mode**: Self-contained edge project `jetson_node/` with `scripts/export_edge_model.py` and `contracts/` following all hard limits. No modifications to `frontend/`, `backend/`, `models/`, `datasets/`, `CLAIMS.md`, or databases.
- **Python Compatibility**: Target lowest common denominator Python 3.6+ on JetPack 4.6 (original Jetson Nano aarch64) as well as Orin Nano (Python 3.10). No dataclasses, no walrus operator `:=`, no asyncio, no positional-only arguments, no f-string `=`, no `from __future__ import annotations`. Pure stdlib + numpy for inference.
- **Runtime Ladder**:
  1. `onnxruntime` (CPUExecutionProvider) if importable and passes canary.
  2. `numpy` pure interpreter generated from `edge_model.json` + `edge_model.npz`.
  3. `tflite_runtime` if importable and passes canary.
  Canary verifies golden windows within 1e-3 cycles of reference outputs. No GPU usage.
- **Honest Telemetry Labels**:
  - `data_origin`: `"replay_cmapss_fd001"` (or `"replay_cmapss_fd001+augmentation"`)
  - `inference.site`: `"EDGE"`
  - Ground truth RUL is sidecar evaluation only, never model input.
  - Device facts are marked `UNVERIFIED` until device execution occurs.
- **Transport & Security**:
  - HMAC-SHA256 signature over raw gzipped POST body using secret from env file (`0600`).
  - No signature timestamp (tolerates unsynced edge RTC).
  - Enforce HTTPS unless `--allow-insecure` is explicitly passed.
  - Outbox with SQLite WAL, priority drops (telemetry first, oldest predictions next, NEVER events).
  - Additive `cloud_receiver/` service provided for standalone/EC2 ingest and contract validation without mutating `backend/`.
