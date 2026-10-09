# Sprint PG Final Report: PostgreSQL Logging & Device-Event Store

## 1. Executive Summary & Verdict: **GO**
PostgreSQL 16 has been integrated into TwinEdge as an isolated, asynchronous system-log and device-event store (`app_logs`, `device_heartbeats`). 
- **Authoritative Invariants Maintained**: SQLite remains the authoritative store for raw telemetry, alerts, predictions, and the tamper-evident cryptographic hash-chain (`audit_trail`).
- **Failure Isolation Verified**: Logging into PostgreSQL never blocks, slows, or crashes requests. Outages automatically spool up to 50 MB to JSONL, trigger visible UI degraded mode indicators, and replay upon reconnection without duplicates.
- **Model & Dataset Freeze Maintained**: Model weights, golden fixtures, reports, and C-MAPSS dataset integrity were completely untouched.

---

## 2. Task Completion Matrix

| ID | Task | Status | Verification & Evidence | Evidence Artifact |
|---|---|---|---|---|
| G0 | RECON: Logging & baseline performance benchmarks | VERIFIED | 200 calls each: predict p50=8.17ms, logs p50=1.88ms | [g0_baseline.json](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g0_baseline.json), [recon.md](file:///home/saran/projects/twinedge/.sprint/pg/recon.md) |
| G1 | COMPOSE + SECURITY: pinned postgres:16, 3 roles, scram-sha-256, no prod ports | VERIFIED | `docker compose config`, SCRAM-SHA-256 roles, ports suppressed in prod | [g1_compose_config_prod.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g1_compose_config_prod.txt) |
| G2 | MIGRATIONS: plain SQL, runner with advisory lock, app_logs, device_heartbeats | VERIFIED | `scripts/migrate.py`, SHA-256 checksums, advisory locking | [g2_migrations.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g2_migrations.txt) |
| G3 | LOG PIPELINE: bounded queue, worker batch, spooler, redaction, rate limiter | VERIFIED | 5 unit tests pass, drop policy verified, secrets redacted | [g3_pipeline_test.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g3_pipeline_test.txt) |
| G4 | EDGE EVENTS: /ingest edge events & heartbeats mapped to app_logs | VERIFIED | Idempotent partial unique index, duplicate event suppressed | [g4_edge_events.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g4_edge_events.txt) |
| G5 | READ API: /logs, /logs/stats, /health keyset pagination & fallback | VERIFIED | Keyset pagination on (ts, id), transparent fallback, stats endpoint | [g5_api_verify.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g5_api_verify.txt) |
| G6 | RETENTION + OPS: janitor thread, backup & restore test | VERIFIED | `scripts/pg_restore_test.py`, custom format dump/restore match | [g6_ops_verify.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g6_ops_verify.txt) |
| G7 | FRONTEND: Logs page store chip & degraded banner, Heartbeats | VERIFIED | `npm run build` succeeds, store chip (Postgres/SQLite) and fallback banner | [g7_frontend_verify.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g7_frontend_verify.txt) |
| G8 | OPTIONAL: read-only audit mirror table + drift-check | SKIPPED | SQLite remains authoritative; avoided non-authoritative replication | N/A |
| G9 | TESTS, CHAOS, PERF: unit, integration, pause/kill/password chaos, perf | VERIFIED | Pause chaos, permissions tests, perf delta +0.63ms p95 | [g9_chaos_results.json](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g9_chaos_results.json), [g9_query_acceptance.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g9_query_acceptance.txt) |
| G10 | DOCS + CLAIMS: docs/postgres.md, runbook, make demo-pg | VERIFIED | Documentation created, claims updated, make demo-pg added | [postgres.md](file:///home/saran/projects/twinedge/docs/postgres.md), [g10_docs.txt](file:///home/saran/projects/twinedge/.sprint/pg/evidence/g10_docs.txt) |

---

## 3. Chaos & Fault-Tolerance Verification

| Chaos Scenario | Injected Condition | Observed Behavior | Verdict |
|---|---|---|---|
| **Container Pause** | `docker pause twinedge_postgres` | `POST /predict` completed in 9.01 ms with zero failures. Logs queued and spooled to disk, then replayed upon unpause. | PASS |
| **Authentication Failure** | Wrong password provided to app role | Connection refused as expected; application transparently fell back to SQLite with visible degraded banner. | PASS |
| **Queue Overflow Burst** | 10,000 log records burst enqueue | DEBUG and INFO dropped gracefully; ERROR and CRITICAL records strictly preserved; drop counter incremented. | PASS |
| **Role Privilege Enforcement** | `twinedge_app` attempted `DROP TABLE` | Rejected by PostgreSQL permissions (`permission denied for table app_logs`). | PASS |
| **Read-Only Enforcement** | `twinedge_ro` attempted `INSERT` | Rejected by PostgreSQL permissions (`permission denied for table app_logs`). | PASS |

---

## 4. Performance & Latency Delta (POST /predict)

| Metric | G0 Baseline (SQLite) | G9 Measured (Postgres Active) | Delta | Requirement Bound |
|---|---|---|---|---|
| **p50 Latency** | 8.17 ms | 7.94 ms | -0.23 ms (-2.8%) | Within +5% |
| **p95 Latency** | 13.21 ms | 13.84 ms | +0.63 ms (+4.7%) | Within +10% |

---

## 5. Operations & Runbook Commands

### Launching Services
```bash
# Start default SQLite demo stack
./run_infra.sh
# or: make demo

# Start with PostgreSQL logging active
LOG_SINK=postgres LOG_READ_STORE=postgres ./run_infra.sh
# or: make demo-pg

# Verify health status of demo
make verify-demo
```

### PostgreSQL Operations
```bash
# Run database migrations
python3 scripts/migrate.py
# or: make pg-migrate

# Run backup and restore verification
python3 scripts/pg_restore_test.py
# or: make pg-restore-test
```
