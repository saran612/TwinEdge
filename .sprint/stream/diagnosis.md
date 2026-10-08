# Sprint Stream Diagnosis (A0)

## Overview & Evidence Summary
Comprehensive diagnostics conducted across the data pipeline, backend SQLite database, ONNX inference model, and frontend pages. Evidence captured under `.sprint/stream/evidence/`.

---

## 1. Problem P1: Health is 100% on Every Page; Inconsistencies Across Pages
- **Status**: **CONFIRMED**
- **Root Cause**:
  1. In NASA C-MAPSS FD001, turbofan engines operate in an initial undamaged healthy state for their first 40–140 cycles before degradation begins. The RUL piece-wise linear training target is capped at $R_{\text{cap}} = 125$.
  2. For instance, for `VAL-001` (192 total cycles), true RUL is at 125 from cycle 1 to cycle 67 ($192 - 125 = 67$).
  3. The frontend formula on Overview and Digital Twin pages computes `healthIndex = Math.round((rul / 125) * 100)`. Because all replay engines initialize at cycle 30 where predicted RUL is at the cap (125), `healthIndex = 100%`.
  4. As plotted in `.sprint/stream/evidence/a0_health_vs_cycle.png`, health begins declining only once the cycle passes the degradation threshold ($c > \text{total} - 125$).
  5. **Page Discrepancies**: Telemetry page was computing a synthetic sine-wave pseudo-prediction (`trueR + Math.sin(c * 0.3) * 3.5`) in memory without executing ONNX inference, while Overview and Digital Twin ran browser ONNX runtime (`runLocalInference`), producing divergent RUL, health index, and alert indicators for the exact same engine and cycle.

---

## 2. Problem P2: Static Data & Telemetry Page Charts Empty
- **Status**: **CONFIRMED**
- **Root Cause**:
  1. The Telemetry page had no live subscription or streaming data buffer. It read static `replay_engines.json` synchronously on render.
  2. The backend `/telemetry/recent` endpoint was tightly coupled to InfluxDB, which failed when InfluxDB was offline or unconfigured.
  3. No SSE (Server-Sent Events) or live telemetry streaming mechanism existed between backend and frontend.

---

## 3. Problem P3: 27 Alerts Displayed on Healthy Engines
- **Status**: **CONFIRMED**
- **Root Cause**:
  1. Direct SQL inspection of `backend/app/db.sqlite3` revealed 35 alert rows, of which exactly **27 rows** have `status = 'PENDING'`.
  2. These alerts were generated during prior simulator testing runs across various engines (e.g., engines 2, 6, 17, 18, 20, 24, 31, etc.).
  3. The backend `/alerts` table had no `session_id`, `device_id`, or `engine_key` scoping—only a raw integer `engine_id`.
  4. The frontend queried `GET /alerts` globally. The GlobalShell notification pill counted all 27 pending alerts regardless of which engine or session was active.

---

## 4. Problem P4: Simulation Lab Opens Empty
- **Status**: **CONFIRMED**
- **Root Cause**:
  1. `SimulationLabPage.jsx` initializes with `results = null`.
  2. No presets are auto-evaluated on mount; the page required the user to manually select a preset and click "Run Simulation".
  3. The available presets were limited and lacked precomputed sensitivity heatmaps or ready-to-run template comparisons.

---

## 5. Problem P5: Missing Logs Page & Broken Governance Endpoints
- **Status**: **CONFIRMED**
- **Root Cause**:
  1. Backend endpoints `/logs`, `/governance/model`, and `/governance/claims` returned HTTP 404.
  2. The frontend navigation (`GlobalShell.jsx`) had no route for a Logs page.
  3. AuditPage lacked tabs for Model Governance and Claims Register.

---

## Next Steps (Part B & C)
1. Build `edge_sim/` replay streaming package with deterministic seeds and edge ONNX runtime.
2. Upgrade backend SQLite schema with session scoping, outbox, and idempotent `/ingest`.
3. Unify the frontend store to eliminate discrepancies across all pages.
