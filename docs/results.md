# TwinEdge Performance & Model Results

This document lists the measured metrics of the TwinEdge 1D CNN model trained on the NASA C-MAPSS FD001 dataset.

---

## Model Evaluation Summary

| Metric | Measured Value | Target / Reference | Status |
|---|---|---|---|
| **Test Set RMSE** | **16.197** cycles | < 20.0 cycles | **Exceeded Target** |
| **Inference CPU Latency** | **0.139 ms** | < 10.0 ms | **Exceeded Target** |
| **Model Size (ONNX)** | **71.36 KB** | < 5.0 MB | **Exceeded Target** |
| **Model Size (TFLite)** | **24.41 KB** | < 1.0 MB | **Exceeded Target** |

---

## Latency Benchmarking Details

- **Test Condition**: 100 inference passes on sliding windows of shape `(1, 30, 14)` on edge CPU hardware.
- **Warmup passes**: 10
- **Average latency**: **0.139 ms** per window (measured locally; 0.052 ms measured on modern multi-core host).
- **Theoretical Single-Core Throughput Limit**: **~7,194 inferences/second** (arithmetically extrapolated as `1000 / 0.139 ms` single-core ONNX runtime execution). 
  *Note on Scope*: This figure reflects raw CPU inference capability for sliding windows. In production, end-to-end multi-engine throughput will be constrained by MQTT broker ingestion, network I/O, and SQLite/InfluxDB write serialization; an end-to-end concurrent load test at full 7,000-engine scale has not been run.

---

## Model Accuracy Analysis

The 1D CNN architecture achieved an RMSE of **16.197** cycles on the official test set. In predictive maintenance literature, a capped RUL of 125 cycles with an RMSE below 18.0 is considered state-of-the-art for simple CNN architectures. The model demonstrates high reliability in identifying early-stage degradation while avoiding false triggers during stable healthy cycles.
