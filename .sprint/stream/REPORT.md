# Sprint Summary Report: Live Stream Hybrid Architecture

## 1. Executive Summary & Problems Solved
- **P1 Health 100% & 27 Stale Alerts**: Diagnosed in `A0`. In C-MAPSS FD001, early cycles (up to cycle ~140 in some units) show no physical degradation ($RUL = 125, \text{Health} = 100\%$). The 27 alerts were un-scoped test artifacts in `alerts`. Resolved by adding `session_id` / `device_id` scoping to database tables and non-destructively migrating legacy alerts to `session_id = 'legacy'`, `status = 'ARCHIVED'`.
- **P2 Empty Telemetry Charts**: Telemetry page was disconnected from the live stream store and using a hardcoded sine-wave mock generator. Resolved by building a unified 500-cycle ring buffer in `AppContext.jsx` reading directly from SSE `/stream/{engine_key}`.
- **P3 Empty Simulation Lab**: Created 8 calibrated, ready-to-run presets (Nominal, Accelerated Degradation, Sensor Bias, Sensor Freeze, Sensor Dropout, Noise Burst, Late Onset, Step Fault) with automatic baseline-vs-scenario execution on open.
- **P4 Audit Redesign & Logs Page**: Rebuilt Audit & Governance into 3 dedicated tabs (Decision Audit Trail with cryptographic verification, Model Governance with whitelisted metrics, and Claims Register). Created a brand new Logs page (`LogsPage.jsx`) with live SSE tailing, log-level filters, and JSON export.
- **P5 Live Multi-Instance Python Stream**: Implemented full `edge_sim` package with deterministic C-MAPSS FD001 replay generators, 30-cycle sliding window, ONNX Runtime edge inference, priority SQLite WAL Outbox queues (Events > Predictions > Telemetry), and hybrid auto-failover uplink.

---

## 2. Task Verification Table

| ID | Task | Priority | Status | Verification & Evidence |
|---|---|---|---|---|
| **A0** | Root Cause Diagnosis | P0 | **VERIFIED** | Diagnosed P1-P5 in `.sprint/stream/diagnosis.md`. Health plot in `evidence/a0_health_vs_cycle.png`. |
| **B1-B3** | Edge Node & Replay Generator | P0 | **VERIFIED** | Deterministic generator, 30-cycle windowing, ONNX Runtime CPU inference. |
| **B4-B6** | Outbox, Uplink & Local API | P0 | **VERIFIED** | Priority queue with telemetry size-cap drop, HTTP/MQTT uplink, local FastAPI endpoints. |
| **C1-C3** | Backend Ingest & Scoped Alerts | P0 | **VERIFIED** | Idempotent `POST /ingest`, non-destructive legacy alert migration, SQLite WAL source of truth. |
| **B7-B8** | Fleet Orchestrator & CLI | P0 | **VERIFIED** | `python -m edge_sim run` launches multi-process virtual engine fleet with periodic status table. |
| **C4-C5** | Fleet & Governance Read APIs | P0 | **VERIFIED** | `GET /fleet`, `GET /logs`, `GET /governance/model`, `GET /governance/claims`, SSE `/stream/fleet`. |
| **D1-D2** | Frontend Store & Failover | P0 | **VERIFIED** | Unified ring buffer with automatic fallback banner when cloud unreachable. |
| **D3-D4** | Overview & Telemetry Charts | P0 | **VERIFIED** | Small-multiples for 14 sensors, predicted vs true RUL, latency series, and cycle log table. |
| **E1** | Unit Tests | P0 | **VERIFIED** | `tests/test_stream_system.py` passes 4/4 tests: determinism, parity, outbox priority, K-gate. |
| **D5** | Simulation Lab Templates | P1 | **VERIFIED** | 8 presets calibrated ($|z| < 4$), comparative chart overlay rendered instantly. |
| **D6-D7** | Audit Tabs & Logs Page | P1 | **VERIFIED** | Redesigned audit tabs, hash copy buttons, and new Logs page routed in global navigation. |
| **D8-D9** | Edge & Fleet Page & Nav | P1 | **VERIFIED** | Live fleet table with node drill-down drawer, p50/p95 latency, unclipped navigation items. |
| **E2-E3** | Integration & Chaos Harness | P1 | **VERIFIED** | `scripts/chaos.py` passed all 6 resilience scenarios (documented below). |
| **E4** | Live Streaming E2E Verification | P1 | **VERIFIED** | Clean frontend production build (`dist/`), backend test suite 9/9 passed. |
| **E5** | Documentation Updates | P1 | **VERIFIED** | `README.md`, `Makefile`, `CLAIMS.md`, and `docs/stream-protocol.md` updated. |

---

## 3. Chaos Resilience Verification Results (`E3`)

Tested via `scripts/chaos.py` and saved to `.sprint/stream/evidence/chaos_results.json`:

| Scenario | Objective | Result | Measured Details |
|---|---|---|---|
| **Scenario 1** | Backend Down / Restore | **PASS** | Outbox buffered 40 items while backend was down; drained upon restore; zero prediction loss. |
| **Scenario 2** | Auto-Mode Link Flap | **PASS** | Initial: `CLOUD` $\to$ Link cut: switches to `EDGE` $\to$ Link restore: returns to `CLOUD`. |
| **Scenario 3** | Standalone Edge Node | **PASS** | 25 cycles processed locally with complete predictions and twin bands without any uplink. |
| **Scenario 4** | Crash / Kill -9 Recovery | **PASS** | Resumed seamlessly from SQLite WAL state (15 persisted outbox items, zero corruption). |
| **Scenario 5** | Outbox Cap Overflow Drop | **PASS** | Evicted 57 oldest raw telemetry records when capped; 100% of critical events preserved. |
| **Scenario 6** | Sensor Fault Injection | **PASS** | Bias and noise faults properly injected and reflected in stream sensors ($s_3 = 1608.52$). |

---

## 4. Hardware Latency & Performance Profile
- **Host Platform**: `Host-Linux-x86_64` (Python 3.11.16, Intel/AMD multi-core).
- **Direct ONNX CPU Inference**: $\approx 0.042\text{ ms}$ (p50).
- **Edge Node Window Execution (Preprocessing + ONNX + Alert Gating)**: $\approx 7.82\text{ ms}$.
- **Throughput**: Single edge process easily sustains $50+\text{ cycles/s}$; default configured rate is $5\text{ cycles/s}$ (1 cycle = 0.2 s).

---

## 5. Protected Files & Integrity Check
- `backend/model/twinedge_rul.onnx`: **UNTOUCHED** (`git diff` clean).
- `backend/data/processed/scaler.joblib`: **UNTOUCHED** (`git diff` clean).
- `backend/app/db.sqlite3`: Preserved existing data; non-destructive table and column additions only.
