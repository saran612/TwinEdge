# TwinEdge Performance & Model Results

This document lists the measured metrics of the TwinEdge 1D CNN model trained on the NASA C-MAPSS FD001 dataset.

---

## Model Evaluation Summary

| Metric | Measured Value | Target / Reference | Status |
|---|---|---|---|
| **Test Set RMSE (Capped)** | **16.1972** cycles | < 20.0 cycles | **Audited (Host CPU)** |
| **Test Set RMSE (Uncapped)** | **17.3354** cycles | — | **Audited (Host CPU)** |
| **Isolated ONNX Latency (p50)** | **0.0420 ms** | < 1.0 ms | **Audited (Host CPU)** |
| **HTTP `/predict` Latency (p50)** | **8.444 ms** | < 20.0 ms | **Audited (FastAPI/SQLite)** |
| **Model Size (ONNX)** | **71.36 KB** (71,355 B) | < 5.0 MB | **Verified** |
| **Model Size (TFLite)** | **24.41 KB** (24,408 B) | < 1.0 MB | **Verified** |

---

## Latency Benchmarking Details

- **Isolated ONNX Inference**: Direct ONNX Runtime CPU provider execution executes at **0.042 ms (p50)** (batch 1, default threads) and **0.027 ms (p50)** (1 thread pinned).
- **End-to-End HTTP API Latency**: The full `/predict` endpoint round-trip takes **8.444 ms (p50)** and ~18.1 ms (p95) on localhost, comprising request parsing (~1.2 ms), feature scaling (0.117 ms), ONNX inference (0.042 ms), and SQLite transaction writes (~5.5–6.5 ms).
- **Historical Note**: Prior references to "0.139 ms" measured only a raw isolated Python loop over a single pre-scaled tensor, ignoring network, JSON parsing, and database transactions.

---

## Model Accuracy & Baseline Analysis

The 1D-CNN achieves an RMSE of **16.1972** cycles on the C-MAPSS FD001 test set (with ground truth capped at 125 cycles). However, classical baselines evaluated on identical splits achieve equal or superior accuracy:
- **Ridge Regression**: **15.8930 RMSE**
- **HistGradientBoostingRegressor**: **14.2740 RMSE**

Consequently, the model audit classifies the 1D-CNN as **WEAK** (authentically trained, but does not beat classical linear/tree baselines). The model acts as an advisory decision-support tool where the human engineer sign-off gate covers false alarms, and late predictions are mitigated by a conservative threshold ($T=60$) and K-streak gating ($K=3$).
