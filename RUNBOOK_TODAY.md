# RUNBOOK TODAY: TwinEdge Presentation & Demo Runbook

**Environment**: Local Linux (x86_64), SQLite, FastAPI backend, Vite React Frontend.  
**No AWS or external cloud dependencies required.**

---

## 1. Quick Start (One Command)

To launch the complete demo stack:
```bash
make demo-live
```
Or start individual processes:
```bash
# 1. Backend (port 8000)
PYTHONPATH=backend backend/venv/bin/python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000

# 2. Virtual Fleet Simulator (3 nodes at 5 Hz: lifecycle, degraded-start, steady)
PYTHONPATH=backend:. backend/venv/bin/python -m edge_sim run --nodes 3 --engines VAL-001,VAL-005,TEST-002 --rate 5 --inference auto --cloud-url http://localhost:8000 --base-port 8100

# 3. Frontend (port 5173 production preview)
npm --prefix frontend run preview -- --host 0.0.0.0 --port 5173
```

---

## 2. Key URLs
- **Web Application Flightdeck**: [http://localhost:5173](http://localhost:5173)
- **Safe 3D Mode (Ultra-light schematic)**: [http://localhost:5173/#/twin?safe3d=1](http://localhost:5173/#/twin?safe3d=1)
- **Backend Health & OpenAPI**: [http://localhost:8000/health](http://localhost:8000/health) | [http://localhost:8000/docs](http://localhost:8000/docs)
- **Offline Model Audit Snapshot**: [http://localhost:5173/audit/MODEL_AUDIT.md](http://localhost:5173/audit/MODEL_AUDIT.md)

---

## 3. Ten-Minute Presentation Click Path

1. **Fleet Overview (`#/overview`)** [00:00 - 02:00]
   - Shows real-time fleet health across engines `VAL-001`, `VAL-005`, and `TEST-002`.
   - Point out honest provenance tags (`LIVE`, `REPLAY-GROUND-TRUTH`, `MODEL`).
   - Observe pending alert counts and healthy/degrading/critical bands.

2. **Digital Twin 3D (`#/twin`)** [02:00 - 04:30]
   - Rotate the 3D turbofan engine model; spin animations run at 60 FPS.
   - Switch to **"Active sensor channels"** tab:
     - Review the **14-sensor multi-series time-series chart** normalized by z-score ($\sigma$) relative to healthy baseline.
     - Toggle individual sensors via legend chips; observe component-specific sensors highlighted in bold when clicking components (e.g. HPC highlights $s_3, s_7, s_{11}$).
     - Verify vertical "NOW" dashed line syncs with playback cursor.
   - Verify timeline scrubber: drag from cycle 30 to cycle 192 (`VAL-001`). Confirm **TRUE RUL** drops smoothly to **0.0 cycles** at cycle 192 (never stuck at 125.0).

3. **Telemetry & Health (`#/telemetry`)** [04:30 - 06:00]
   - Top summary cards: Empirical MAE, Empirical RMSE, Model Bias, Peak Error.
   - Values reflect authentic 1D-CNN evaluated model error against ground truth (e.g. MAE ~12.5 cycles, RMSE ~16.2 cycles).
   - Small multiple charts reveal streaming cycles progressively with rolling window of 120 cycles.

4. **Alerts & MRO Sign-off (`#/alerts`)** [06:00 - 07:30]
   - Active sustained alerts tripped by K-gate rule ($T=60, K=3$).
   - Click "Sign-Off" on an active alert; enter Reviewer ID (e.g. `AME-7749`) and sign off.
   - Confirm cryptographic SHA-256 hash pointer entry appended to immutable audit chain.

5. **Model Audit & Governance (`#/audit`)** [07:30 - 08:30]
   - Verify cryptographic hash chain status: `VERIFIED`.
   - Navigate to "Model Governance" tab:
     - Model Verdict: **WEAK** (honest benchmark disclosing 1D-CNN parity with Ridge and tree gradient boosting).
     - Tables of **"Numbers You May Quote"** vs **"Numbers You May NOT Quote"**.
     - Direct link to inspect raw `MODEL_AUDIT.md`.

6. **Edge Model & Benchmark (`#/edge`)** [08:30 - 09:15]
   - Click **"Run browser benchmark (100x)"**:
     - Executes 100 real inference passes; displays empirical p50/p95 latency in ms with device user agent context.

7. **System Logs & Live Tail (`#/logs`)** [09:15 - 10:00]
   - Live-tailing system event stream.
   - Shows `backend_started`, `alert_raised`, node connections, and sign-offs in real-time.

---

## 4. Failure Playbook (30-Second Actions)

| Symptom | Cause | 30-Second Resolution |
|---|---|---|
| 3D view sluggish or WebGL crash | Heavy GPU mesh load on low-power display | Append `?safe3d=1` to the URL ([http://localhost:5173/#/twin?safe3d=1](http://localhost:5173/#/twin?safe3d=1)) to switch to schematic mode. |
| Page shows "This page encountered an error" | Handled by ErrorBoundary | Click "Retry Page" button on the error card. |
| No live streaming data in Live mode | Fleet simulator not started | Run `make fleet` or `make demo-live` in terminal. |
| Port 8000 or 5173 already in use | Stale background process | Kill existing listeners: `pkill -f uvicorn; pkill -f "vite preview"` and rerun `make demo-live`. |

---

## 5. Known Limitations
- TwinEdge is an empirical decision-support proof-of-concept trained on NASA C-MAPSS FD001; not certified for DO-178C flight decisions.
- Telemetry originates from simulated benchmark replay streams.
- SQLite WAL mode is used for local presentation resilience; PostgreSQL and InfluxDB are optional and not required.
