# System Claims Matrix: Permitted vs Forbidden

This document delineates strictly permitted technical claims substantiated by empirical evidence within the TwinEdge repository versus forbidden marketing or unsubstantiated claims.

---

## 1. Permitted Claims

| Claim | Precise Scope & Description | Supporting Evidence & Verification |
|---|---|---|
| **C-MAPSS FD001 Benchmark Performance** | Test RMSE of `16.197` on NASA C-MAPSS sub-dataset FD001 under the **capped ground truth convention** ($RUL \le 125$). Uncapped test RMSE is `17.335`. Test MAE is `12.473`. | `reports/model/MODEL_AUDIT.md`, `reports/model/audit_metrics.json`, verified in `backend/app/test_main.py`. |
| **Model Architecture & Complexity** | 1D-CNN regression architecture with input sliding window $N=30$, 14 active sensor features, 16,805 parameters, 378.56 kMACs (757.12 kFLOPs), outputting point estimate RUL. | Model architecture in `backend/model/train.py`, graph in `twinedge_rul.onnx`, audited in `reports/model/benchmark_results.json`. |
| **Model Classification Status** | Authentically trained (monotonicity median Spearman $\rho = -0.943$, passed noise/shuffled controls, zero data leakage), but classified as **WEAK** as it does not outperform standard classical Ridge (15.893 RMSE) or HistGBM (14.274 RMSE) baselines on the same features. | Empirically verified in `scripts/audit_model.py` and documented in `reports/model/MODEL_AUDIT.md`. |
| **Edge Preprocessing Parity** | The inference preprocessing pipeline (`StandardScaler` + early-cycle repeat padding + float64 scaling) achieves exact bit-level parity ($0.0$ max absolute difference) across training, inference, and offline export pipelines. | Verified in `scripts/verify_wiring.py` and `backend/app/test_main.py::test_preprocessing_parity`. |
| **Isolated Engine Inference Latency** | Direct ONNX Runtime CPU execution executes in **0.042 ms (p50)** (batch 1, default threads) and **0.027 ms (p50)** (1 thread pinned). TFLite executes in **0.012 ms (p50)**. | Benchmarked via `scripts/benchmark_model.py`, output in `reports/model/benchmark_results.json`. |
| **End-to-End API Service Latency** | Full HTTP POST `/predict` round-trip executes with p50 of **8.444 ms** (p95 ~18.1 ms) including JSON body parsing, scaling, ONNX inference, and SQLite telemetry/streak persistence. | Empirically profiled in `scripts/benchmark_model.py` and recorded in `reports/model/MODEL_AUDIT.md`. |
| **Bandwidth Reduction Ratio** | Edge feature extraction and inference reduces edge-to-cloud telemetry transmission from 1,680 raw float bytes per 30-cycle window to an 8-byte prediction payload (210:1 ratio, >99% reduction). Real serialized HTTP payload tracking is measured via `GET /edge/stats`. | Empirically verified via `GET /edge/stats`, recorded in `.sprint/evidence/T11.txt`, and tested in `test_edge_stats`. |
| **Cryptographic Audit Log Integrity** | All human sign-offs, alert creations, and updates are chained in an immutable SQLite append-only log with SHA-256 hash pointers (`row_hash = SHA256(prev_hash \| alert_id \| engine_id \| cycle \| action \| reviewer_id \| rul \| notes \| timestamp)`). | Empirically verified via tamper injection test in `test_audit_trail_and_endpoints` and endpoints `GET /audit`, `GET /audit/verify`. Evidence in `.sprint/evidence/T4.txt` and `T10.txt`. |
| **False Positive Alert Mitigation** | Alert triggering requires $K$ consecutive cycles (default $K=3$) with predicted RUL below threshold (default 60 cycles) to prevent transient dips from raising false alarms. | Empirically verified via `test_k_cycle_alert_gating` in `test_main.py` and `.sprint/evidence/T6.txt`. |
| **Human-in-the-Loop Sign-off Contract** | Alert sign-off strictly requires non-empty reviewer identity and explicit decision (`approve` or `reject`). Double sign-offs are rejected with HTTP 409 Conflict. | Verified via `test_alerts_signoff` in `test_main.py` and `.sprint/evidence/T5.txt`. |
| **Simulated Engine Stream (NASA C-MAPSS)** | All live streams originate from deterministic replay generators iterating over NASA C-MAPSS FD001 run-to-failure cycles (`data_origin: "replay_cmapss_fd001"`). Time compression is explicitly declared (e.g. 1 cycle = 0.2 s at 5 Hz). | Implemented in `edge_sim/replay_generator.py` and displayed on all live UI stream views. |
| **Inference Site Attribution (EDGE vs CLOUD)** | Every prediction frame and health metric explicitly carries its `inference_site` tag (`EDGE` or `CLOUD`). The system supports automatic link failover (`--inference auto`) switching sites with hysteresis. | Empirically verified in `tests/test_stream_system.py` and `scripts/chaos.py` Scenario 2. |
| **Data-Loss Policy & Buffer Eviction** | In disconnected states, telemetry is prioritized in local SQLite outbox queues: events and predictions have highest priority; when storage caps are exceeded, oldest raw sensor telemetry is evicted first while lifecycle events are guaranteed zero loss. | Empirically verified in `scripts/chaos.py` Scenario 5 and `tests/test_stream_system.py::test_outbox_priority_and_drop_policy`. |

---

## 2. Forbidden Claims

The following claims are **STRICTLY FORBIDDEN** across all documentation, API responses, marketing, and user interfaces:

| Forbidden Claim | Reason for Prohibition | Required Correction / Grounded Reality |
|---|---|---|
| **FAA / EASA / DO-178C / DO-254 Flight Certification** | TwinEdge is a research prototype and decision-support proof-of-concept. It has not undergone DO-178C DAL certification or airworthiness approvals. | Must be labeled as: *"Decision-support prototype only. Not certified for flight or safety-critical dispatch decisions."* |
| **Physics-Based / High-Fidelity Twin** | TwinEdge does not integrate CFD, thermodynamics, or finite element modeling. | Must be labeled as: *"Data-driven empirical surrogate model trained on C-MAPSS run-to-failure run benchmarks."* |
| **Real Aircraft Live Telemetry** | Claiming telemetry originates from physical flying aircraft. Telemetry is an empirical benchmark playback. | Must state: *"Simulated engine stream (NASA C-MAPSS replay)."* |
| **LLM-Powered Root-Cause Diagnostics** | There is no large language model or generative AI agent diagnosing mechanical failures. | Must state: *"Heuristic and statistical alert triage based on thresholded 1D-CNN regression predictions."* |
| **Universal C-MAPSS Generalization (FD002–FD004)** | The model was trained and evaluated solely on FD001 (1 condition, 1 fault mode). It has not been validated on FD002 (6 operating conditions) or multi-fault sets. | Must state: *"Evaluated strictly on C-MAPSS FD001 benchmark data."* |
| **Hardcoded / Hypothetical Latency Figures** | Claiming static latencies (e.g. "always exactly 1.2 ms") without empirical runtime profiling. | Latency must be reported as dynamically measured rolling percentiles (`p50`, `p95`) or explicitly tagged with host profiling conditions. |
| **Heuristic Confidence Values (e.g. 100% confidence)** | The 1D-CNN regression model outputs point estimates of RUL without calibrated epistemic uncertainty or Bayesian posteriors. | Fake heuristic confidence metrics have been removed. Point predictions must not be presented with fabricated certainty percentages. |
| **Zero-Loss Data Claims without Buffer Verification** | Claiming edge-to-cloud resilience when disconnected without local Influx/SQLite spool verification. | Telemetry spooling is governed by SQLite buffer retention and local storage quotas. |
