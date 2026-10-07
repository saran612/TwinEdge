# System Claims Matrix: Permitted vs Forbidden

This document delineates strictly permitted technical claims substantiated by empirical evidence within the TwinEdge repository versus forbidden marketing or unsubstantiated claims.

---

## 1. Permitted Claims

| Claim | Precise Scope & Description | Supporting Evidence & Verification |
|---|---|---|
| **C-MAPSS FD001 Benchmark Performance** | Test RMSE of `16.197` on NASA C-MAPSS sub-dataset FD001 (single operating condition, single failure mode: HPC degradation). | `backend/model/results.json`, validated in unit tests `test_main.py::test_model_info_and_latency`. |
| **Model Architecture** | 1D-CNN regression architecture with input sliding window $N=30$, 14 active sensor features, outputting remaining useful life (RUL) capped at piecewise target 125 cycles. | Model architecture defined in `backend/model/train.py`, exported ONNX graph in `backend/model/twinedge_rul.onnx` (`[1, 30, 14]`). |
| **Edge Preprocessing Parity** | The inference preprocessing pipeline (`StandardScaler` + early-cycle repeat padding + float32 tensor conversion) achieves exact bit-level parity ($0.0$ max absolute difference) with the training preprocessing pipeline. | Verified in `backend/app/test_main.py::test_preprocessing_parity` with synthetic early-cycle and full windows. |
| **Deterministic Edge Inference Latency** | ONNX Runtime CPU inference achieves sub-millisecond execution (p50 ~0.50 ms, p95 ~0.60 ms on Linux benchmark host). Measured live via rolling deque of 500 requests. | Empirically verified via `POST /predict`, recorded live in `GET /model/info`, evidence in `.sprint/evidence/T9.txt`. |
| **Bandwidth Reduction Ratio** | Edge feature extraction and inference reduces edge-to-cloud telemetry transmission from 1,680 raw float bytes per 30-cycle window to an 8-byte prediction payload (210:1 ratio, >99% reduction). Real serialized HTTP payload tracking is measured via `GET /edge/stats`. | Empirically verified via `GET /edge/stats`, recorded in `.sprint/evidence/T11.txt`, and tested in `test_edge_stats`. |
| **Cryptographic Audit Log Integrity** | All human sign-offs, alert creations, and updates are chained in an immutable SQLite append-only log with SHA-256 hash pointers (`row_hash = SHA256(prev_hash \| alert_id \| engine_id \| cycle \| action \| reviewer_id \| rul \| notes \| timestamp)`). | Empirically verified via tamper injection test in `test_audit_trail_and_endpoints` and endpoints `GET /audit`, `GET /audit/verify`. Evidence in `.sprint/evidence/T4.txt` and `T10.txt`. |
| **False Positive Alert Mitigation** | Alert triggering requires $K$ consecutive cycles (default $K=3$) with predicted RUL below threshold (default 60 cycles) to prevent transient dips from raising false alarms. | Empirically verified via `test_k_cycle_alert_gating` in `test_main.py` and `.sprint/evidence/T6.txt`. |
| **Human-in-the-Loop Sign-off Contract** | Alert sign-off strictly requires non-empty reviewer identity and explicit decision (`approve` or `reject`). Double sign-offs are rejected with HTTP 409 Conflict. | Verified via `test_alerts_signoff` in `test_main.py` and `.sprint/evidence/T5.txt`. |

---

## 2. Forbidden Claims

The following claims are **STRICTLY FORBIDDEN** across all documentation, API responses, marketing, and user interfaces:

| Forbidden Claim | Reason for Prohibition | Required Correction / Grounded Reality |
|---|---|---|
| **FAA / EASA / DO-178C / DO-254 Flight Certification** | TwinEdge is a research prototype and decision-support proof-of-concept. It has not undergone DO-178C DAL certification or airworthiness approvals. | Must be labeled as: *"Decision-support prototype only. Not certified for flight or safety-critical dispatch decisions."* |
| **Physics-Based / High-Fidelity Twin** | TwinEdge does not integrate CFD, thermodynamics, or finite element modeling. | Must be labeled as: *"Data-driven empirical surrogate model trained on C-MAPSS run-to-failure run benchmarks."* |
| **LLM-Powered Root-Cause Diagnostics** | There is no large language model or generative AI agent diagnosing mechanical failures. | Must state: *"Heuristic and statistical alert triage based on thresholded 1D-CNN regression predictions."* |
| **Universal C-MAPSS Generalization (FD002–FD004)** | The model was trained and evaluated solely on FD001 (1 condition, 1 fault mode). It has not been validated on FD002 (6 operating conditions) or multi-fault sets. | Must state: *"Evaluated strictly on C-MAPSS FD001 benchmark data."* |
| **Hardcoded / Hypothetical Latency Figures** | Claiming static latencies (e.g. "always exactly 1.2 ms") without empirical runtime profiling. | Latency must be reported as dynamically measured rolling percentiles (`p50`, `p95`) or explicitly tagged with host profiling conditions. |
| **Heuristic Confidence Values (e.g. 100% confidence)** | The 1D-CNN regression model outputs point estimates of RUL without calibrated epistemic uncertainty or Bayesian posteriors. | Fake heuristic confidence metrics have been removed. Point predictions must not be presented with fabricated certainty percentages. |
| **Zero-Loss Data Claims without Buffer Verification** | Claiming edge-to-cloud resilience when disconnected without local Influx/SQLite spool verification. | Telemetry spooling is governed by SQLite buffer retention and local storage quotas. |
