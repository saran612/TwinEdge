| ID | Task | Priority | Status | Verification | Evidence |
|---|---|---|---|---|---|
| A0 | Root cause diagnose P1-P5 | P0 | VERIFIED | Reproduce health 100%, 27 alerts, empty telemetry charts | `.sprint/stream/diagnosis.md`, `.sprint/stream/evidence/a0_health_vs_cycle.png` |
| B1-B3 | Python replay generator, edge node & frame schema v1 | P0 | VERIFIED | Seeded deterministic replay, 30-cycle windowing, ONNX execution | `edge_sim/replay_generator.py`, `edge_sim/edge_node.py` |
| B4-B6 | SQLite Outbox, HTTP/MQTT uplink & Edge local API | P0 | VERIFIED | Priority queue (Events > Preds > Telem), size cap drop, local FastAPI | `edge_sim/outbox.py`, `edge_sim/uplink.py`, `edge_sim/local_api.py` |
| C1-C3 | Backend store, idempotent /ingest, session alert migration | P0 | VERIFIED | SQLite WAL tables, compound key idempotency, legacy alert archive | `backend/app/db.py`, `backend/app/main.py` |
| B7-B8 | Orchestrator CLI & structured logging | P0 | VERIFIED | Multi-node process launcher, JSON lines logging, status table | `edge_sim/__main__.py` |
| C4-C5 | Read APIs (/fleet, /telemetry, /logs, /governance) | P0 | VERIFIED | Fleet monitoring, SSE streaming, audit/claims endpoints | `backend/app/main.py`, curl verified |
| D1-D2 | Frontend store & source failover handling | P0 | VERIFIED | 500-cycle ring buffer, SSE subscription, offline auto-failover | `frontend/src/context/AppContext.jsx`, `frontend/src/services/api.js` |
| D3-D4 | Overview & Telemetry live charts | P0 | VERIFIED | Fleet cards, 14 sensor charts, predicted vs true RUL, latency | `frontend/src/pages/TelemetryPage.jsx`, `frontend/src/pages/OverviewPage.jsx` |
| E1 | Unit tests (determinism, parity, outbox, K-gate) | P0 | VERIFIED | Pytest 4 passed in 1.32s, bitwise preprocessing & ONNX parity | `tests/test_stream_system.py` |
| D5 | Simulation Lab ready-to-run templates | P1 | VERIFIED | 8 calibrated presets, instant baseline-vs-scenario chart overlay | `frontend/src/pages/SimulationLabPage.jsx` |
| D6-D7 | Audit & Governance tabs and new Logs page | P1 | VERIFIED | Decision audit verify, Model Governance, Claims Matrix, Logs SSE | `frontend/src/pages/AuditPage.jsx`, `frontend/src/pages/LogsPage.jsx` |
| D8-D9 | Edge & Fleet page & nav labels | P1 | VERIFIED | Live fleet node table, inspection drawer, unclipped nav bar | `frontend/src/pages/EdgeModelPage.jsx`, `GlobalShell.jsx` |
| E2-E3 | Fleet integration & Chaos test suite | P1 | VERIFIED | 6 automated chaos scenarios passed (outbox drain, flap, crash) | `scripts/chaos.py`, `.sprint/stream/evidence/chaos_results.json` |
| E4 | End-to-end live streaming verification | P1 | VERIFIED | Frontend build verified (0 errors), endpoints verified via curl | `frontend/dist/`, curl logs |
| E5 | Documentation updates | P1 | VERIFIED | Stream protocol, fleet commands in README, claims matrix | `docs/stream-protocol.md`, `README.md`, `CLAIMS.md` |
