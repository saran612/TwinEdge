# TwinEdge Live Presentation Runbook

Date: 2026-10-09  
System Status: Demo Ready / Frozen  

---

## 1. Tomorrow-Morning Checklist (Stage Prep)

### Pre-flight Commands (Execute in order)
```bash
# 1. Check ports, Docker, and environment
./run_infra.sh status

# 2. Start full local stack (Mosquitto, InfluxDB, Subscriber, FastAPI, Vite)
./run_infra.sh start

# 3. Verify backend health and model integrity
curl -s http://localhost:8000/health
curl -s http://localhost:8000/model/info | jq '{model_name, onnx_size_bytes}'
```

### Expected Endpoints
- **Frontend Dashboard**: `http://localhost:5173`
- **Backend API Docs**: `http://localhost:8000/docs`
- **InfluxDB UI**: `http://localhost:8086`

---

## 2. Failure Playbook (30-Second Stage Actions)

| Symptom | Probable Root Cause | 30-Second Stage Action |
|---|---|---|
| **Telemetry page shows empty charts** | Backend stream paused or unstarted | Click the toolbar **"Switch to Replay"** button to immediately display bundled C-MAPSS validation traces offline. |
| **3D Engine viewport glitched / low FPS** | GPU WebGL context stall on presentation display | Append `?safe3d=1` to the URL (`http://localhost:5173/#/twin?safe3d=1`) for low-overhead safe rendering. |
| **Backend down / connection refused** | Process terminated | Run `./run_infra.sh start` in terminal; the frontend auto-reconnects with backoff. |
| **Port 8000 or 5173 already occupied** | Dangling dev server from prior session | Run `./run_infra.sh stop` or inspect with `pgrep -a uvicorn`. |

---

## 3. Honest Answers to Tough Questions (Audited Q&A)

### Q1: Why does the 1D-CNN model not outperform classical tree-based models like HistGradientBoosting on FD001?
**Audited Answer**:
> In our empirical model audit (`reports/model/MODEL_AUDIT.md`), on the exact same feature splits, HistGradientBoosting achieved **14.274 RMSE** and Ridge regression achieved **15.893 RMSE**, while the 1D-CNN achieved **16.197 RMSE** (verdict: **WEAK**).  
> The 1D-CNN is authentically trained and monotonic (Spearman rank correlation $\rho = -0.943$), but on tabular temporal windows of stationary turbofan operating conditions, tree ensembles extract split thresholds more effectively without overfitting the 125-cycle upper cap. TwinEdge treats the deep model strictly as an advisory component where the human engineer in the loop and K-streak gating make the final maintenance determination.

### Q2: Why does the system require a K=3 consecutive streak gate and an AME human sign-off queue?
**Audited Answer**:
> Because the raw model error is not zero. At threshold $T=60$, the 1D-CNN model exhibits a **3.89% false alarm rate** on healthy engine cycles ($RUL \ge 80$) and a positive bias of **+1.26 cycles** (50% of predictions run late).  
> The $K=3$ streak gate ensures that transient sensor noise dips do not raise maintenance alerts (achieving 100% detection rate across 20 held-out validation engines with a mean lead time of 54.0 cycles). Crucially, **the human AME sign-off gate covers false alarms; late or missed predictions are mitigated by our conservative 60-cycle threshold and K-gate; the model is advisory, not certified**.

---

## 4. What is Simulated vs. What is Real

- **Simulated**: Engine turbofan telemetry (replayed from NASA C-MAPSS FD001 run-to-failure run benchmarks). Not real physical aircraft inflight data.
- **Real & Audited**:
  - Live ONNX Runtime inference in Python backend (`0.042 ms p50` on host CPU).
  - WebAssembly ONNX inference in browser.
  - End-to-end HTTP `/predict` latency (`8.444 ms p50`).
  - Cryptographic append-only SHA-256 audit ledger in SQLite.
  - Outbox buffer eviction and priority queueing when offline.
