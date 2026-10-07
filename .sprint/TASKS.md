# Sprint Tasks

| id | task | status | verification | evidence file |
|---|---|---|---|---|
| T1 | Non-destructive init: remove DELETE FROM alerts/telemetry_buffer, idempotent setup | VERIFIED | insert a row, call init_db() again, row persists; grep shows no such DELETE in app code | .sprint/evidence/T1.txt |
| T2 | Secrets out of source: Influx/MQTT tokens/passwords to .env, add .env.example, fail-fast | VERIFIED | git grep old token returns nothing in tracked files; docker compose config resolves | .sprint/evidence/T2.txt |
| T3 | Early-cycle padding in POST /predict: pad windows < 30 matching preprocess.py; >30 or bad shape -> 400 | VERIFIED | tests for lengths 1, 10, 29, 30, 31; numeric parity vs preprocess.py = 0.0 diff | .sprint/evidence/T3.txt |
| T4 | Immutable audit trail: audit_trail table with hash chaining, insert-only | VERIFIED | tests for chain verification true on clean, false on tampered; grep shows no UPDATE/DELETE on audit_trail | .sprint/evidence/T4.txt |
| T5 | Sign-off contract: POST /alerts/{id}/signoff requires decision & non-empty reviewer_id | VERIFIED | tests for missing reviewer_id, bad decision, double sign-off, valid sign-off | .sprint/evidence/T5.txt |
| T6 | K-cycle alert gating: insert-only predictions table, alert iff last K stored predictions < THRESHOLD | VERIFIED | tests: single noisy dip -> no alert; K sustained -> 1 alert; recovery/re-dip; out-of-order; idempotent | .sprint/evidence/T6.txt |
| T7 | Honest simulator: remove synthetic RUL fallback in simulator.py, log error & emit error state | VERIFIED | stop backend, run simulator briefly, confirm errors logged and no synthetic RUL produced | .sprint/evidence/T7.txt |
| T8 | Remove fake confidence: delete heuristic confidence from backend & UI placeholder tile | VERIFIED | grep finds neither; frontend builds | .sprint/evidence/T8.txt |
| T9 | Live latency + model info: timing with perf_counter, rolling p50/p95, GET /model/info | VERIFIED | 50 calls p50 <= p95 > 0; file sizes match os.path.getsize; RMSE matches results.json | .sprint/evidence/T9.txt |
| T10 | Audit endpoints: GET /audit, GET /audit/verify | VERIFIED | tests for GET endpoints, tamper test on a copy | .sprint/evidence/T10.txt |
| T11 | Edge bytes: record raw_window_bytes and upstream_payload_bytes, GET /edge/stats | VERIFIED | test that totals equal sum of real body lengths over N calls | .sprint/evidence/T11.txt |
| T12 | Frontend: live latency p50/p95, edge stats, audit log table, reviewer ID in modal, remove static 0.139 | VERIFIED | npm run build passes; grep finds no hardcoded 0.139; dashboard verified | .sprint/evidence/T12.txt |
| T13 | Deployment files: Dockerfiles, docker-compose.prod.yml with Caddy, Caddyfile, deploy/README.md, deploy/smoke_test.sh | VERIFIED | docker compose config valid; shellcheck; smoke_test.sh passes locally | .sprint/evidence/T13.txt |
| T14 | Tests and claims: pytest covers T1-T11, preprocessing parity check 0.0, CLAIMS.md | VERIFIED | full pytest suite passing, CLAIMS.md written with permitted/forbidden claims | .sprint/evidence/T14.txt |
| T15 | Final sprint report | VERIFIED | .sprint/REPORT.md complete | .sprint/evidence/T15.txt |
