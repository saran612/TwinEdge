# Sprint PG Task Tracker

| ID | Task | Status | Verification | Evidence |
|---|---|---|---|---|
| G0 | RECON: Current logging, events, compose, baseline benchmarks | VERIFIED | Script 200 calls p50/p95, curl logs | `.sprint/pg/evidence/g0_baseline.json`, `.sprint/pg/recon.md` |
| G1 | COMPOSE + SECURITY: pinned postgres:16, 3 roles, scram-sha-256, no prod ports | VERIFIED | `docker compose config`, roles check, no prod ports | `.sprint/pg/evidence/g1_compose_config_prod.txt` |
| G2 | MIGRATIONS: plain SQL, runner with advisory lock, app_logs, device_heartbeats | VERIFIED | scripts/migrate.py, checksum & advisory lock verified | `.sprint/pg/evidence/g2_migrations.txt` |
| G3 | LOG PIPELINE: bounded queue, worker batch, spooler, redaction, rate limiter | VERIFIED | 5 unit tests pass, drop policy, spool order | `.sprint/pg/evidence/g3_pipeline_test.txt` |
| G4 | EDGE EVENTS: /ingest edge events & heartbeats mapped to app_logs | VERIFIED | tests/test_edge_events.py, idempotency & heartbeats | `.sprint/pg/evidence/g4_edge_events.txt` |
| G5 | READ API: /logs, /logs/stats, /health keyset pagination & fallback | PENDING | Contract & fallback verification | `.sprint/pg/evidence/g5_api_verify.txt` |
| G6 | RETENTION + OPS: janitor thread, backup & restore test | PENDING | Retention purge & restore verification | `.sprint/pg/evidence/g6_ops_verify.txt` |
| G7 | FRONTEND: Logs page store chip & degraded banner, Heartbeats | PENDING | Vitest & Cypress/Playwright check | `.sprint/pg/evidence/g7_frontend_verify.txt` |
| G8 | OPTIONAL: read-only audit mirror table + drift-check | PENDING | Hash match verification | `.sprint/pg/evidence/g8_audit_mirror.txt` |
| G9 | TESTS, CHAOS, PERF: unit, integration, pause/kill/password chaos, perf | PENDING | Full chaos & benchmark suites | `.sprint/pg/evidence/g9_chaos_results.json` |
| G10 | DOCS + CLAIMS: docs/postgres.md, runbook, make demo-pg | PENDING | Docs check & demo verification | `.sprint/pg/evidence/g10_docs.txt` |
