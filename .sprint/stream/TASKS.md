# Sprint Stream Tasks

| ID | Task | Priority | Status | Verification | Evidence |
|---|---|---|---|---|---|
| A0 | Diagnosis of P1-P4 (Health 100%, 27 alerts, empty telemetry, page mismatches, endpoints) | P0 | DOING | Diagnosis report + verified traces | `.sprint/stream/diagnosis.md`, `.sprint/stream/evidence/` |
| B1 | Replay generator (deterministic seed, rate, scenario, noise/faults) | P0 | TODO | Unit test replay determinism | `tests/test_stream_replay.py` |
| B2 | Edge node (window(30), ONNX Runtime, latency, K-gate, SQLite WAL, outbox) | P0 | TODO | Edge node execution test | `.sprint/stream/evidence/edge_node.txt` |
| B3 | Frame schema v1 (telemetry, predictions, events) | P0 | TODO | Schema validation test | `.sprint/stream/evidence/schema_validation.txt` |
| B4 | Outbox engine (priority, backoff, drop policy, idempotency) | P0 | TODO | Outbox test suite | `tests/test_outbox.py` |
| B5 | Uplink transport (HTTP batch POST /ingest, MQTT fallback, link state) | P0 | TODO | Uplink test suite | `tests/test_uplink.py` |
| B6 | Edge local API (FastAPI: /health, /state, /telemetry, /alerts, /stream SSE, /control/*) | P0 | TODO | Local API endpoints test | `.sprint/stream/evidence/edge_api.txt` |
| B7 | Orchestrator CLI (`python -m edge_sim run`) & Makefile targets | P0 | TODO | Multi-node spawn test | `.sprint/stream/evidence/orchestrator.txt` |
| B8 | Structured logging (JSON lines) per node | P0 | TODO | Log output verification | `data/edge/*/logs/` |
| C1 | Telemetry/prediction store in SQLite WAL (source of truth) | P0 | TODO | DB schema & index verification | `.sprint/stream/evidence/backend_db.txt` |
| C2 | POST /ingest endpoint & MQTT ingest (idempotent, gap detection, cloud inference/parity) | P0 | TODO | Ingest endpoint tests | `tests/test_ingest.py` |
| C3 | Alerts and audit scoping (session_id, non-destructive migration, supersede on EOL) | P0 | TODO | Alert migration & scoping tests | `.sprint/stream/evidence/alerts_scoping.txt` |
| C4 | Read APIs (/fleet, /telemetry, /stream/fleet, /stream/{id}, /logs, /governance/*) | P0 | TODO | Endpoint API tests | `.sprint/stream/evidence/read_apis.txt` |
| C5 | Maintain existing endpoints with real per-device stats | P0 | TODO | Stats endpoints test | `.sprint/stream/evidence/stats.txt` |
| D1 | Unified Frontend Store (ring buffer 500 cycles, SSE reconnect, Last-Event-ID) | P0 | TODO | Store contract test | `frontend/src/tests/contract.test.js` |
| D2 | Source handling (Live Cloud, Live Local Edge, Replay, Simulation, failover banner) | P0 | TODO | UI source switch test | `.sprint/stream/evidence/source_switch.png` |
| D3 | Overview Page (fleet table, health, RUL sparkline, session-scoped alerts) | P0 | TODO | Page render & consistency | `.sprint/stream/evidence/overview.png` |
| D4 | Telemetry & Health Page (14 sensor charts raw/z, RUL pred vs true, latency, gaps) | P0 | TODO | Telemetry animation & chart test | `.sprint/stream/evidence/telemetry.png` |
| E1 | Unit Test Suite (determinism, parity, outbox, idempotency, K-gate) | P0 | TODO | pytest unit test pass | `.sprint/stream/evidence/unit_tests.txt` |
| E2 | Integration Suite (3 nodes @ 5 cycles/s for 3 min, zero gaps) | P0 | TODO | Multi-node live run | `.sprint/stream/evidence/integration.txt` |
| D5 | Simulation Lab templates (8 calibrated presets, sensitivity heatmap) | P1 | TODO | Simulation preset tests | `.sprint/stream/evidence/simulation_lab.png` |
| D6 | Audit & Governance Page (Decision audit chain, Model governance, Claims) | P1 | TODO | Governance render & verify test | `.sprint/stream/evidence/audit_page.png` |
| D7 | Logs Page (virtualized table, SSE live-tail, filter permalinks) | P1 | TODO | Logs page test | `.sprint/stream/evidence/logs_page.png` |
| D8 | Edge & Fleet Page (fleet table, node drill-down, charts, real counters) | P1 | TODO | Fleet page verification | `.sprint/stream/evidence/fleet_page.png` |
| D9 | Nav labels & Responsive design system audit | P1 | TODO | UI audit | `.sprint/stream/evidence/nav_audit.png` |
| E3 | Chaos Scenarios (backend downtime, link flap, kill -9, outbox overflow) | P1 | TODO | Chaos script execution | `.sprint/stream/evidence/chaos_results.json` |
| E4 | Playwright E2E verification suite | P1 | TODO | Playwright automated run | `.sprint/stream/evidence/playwright_e2e.txt` |
| E5 | Documentation updates (README, docs/stream-protocol.md, CLAIMS.md) | P1 | TODO | Doc verification | `docs/stream-protocol.md` |
