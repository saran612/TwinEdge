# Assumptions & Decisions for feat/postgres-logs

## Architecture Decisions
1. **Source of Truth**: SQLite remains authoritative for telemetry, alerts, predictions, and the cryptographic hash-chained audit trail (`audit_trail` table). PostgreSQL is strictly an additive system-log and device-event store (`app_logs`, `device_heartbeats`).
2. **Failure Isolation**: Logging and event persistence into PostgreSQL is asynchronous via an in-memory bounded queue (`QueueHandler`, max 10,000 items) and a dedicated writer worker. If PostgreSQL is unreachable or degraded, entries spool to a size-capped JSONL file (50 MB) and replay on reconnection. Application requests never block or fail due to PostgreSQL outages.
3. **Configuration**: Configured via `LOG_SINK` environment variable with values `sqlite` (default), `postgres`, or `dual`. Read queries to `/logs` default to `LOG_READ_STORE=sqlite` unless configured to `postgres`, falling back transparently if PostgreSQL is unavailable or degraded.
4. **Data Redaction & Hygiene**: Strict redaction filter strips bearer tokens, Authorization headers, passwords, secrets, and API keys. Raw cycle telemetry arrays (`[batch, 30, 14]`) are rejected from log payloads. Payload sizes are capped at 8 KB for messages and 32 KB for JSON data.
5. **Security & Roles**: PostgreSQL enforces SCRAM-SHA-256 with 3 distinct roles:
   - `twinedge_migrator`: Schema ownership & DDL migrations.
   - `twinedge_app`: DML (`SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `app_logs` for retention janitor).
   - `twinedge_ro`: Read-only `SELECT` queries.
6. **No Cloud Calls / Local Isolation**: All containers run locally via Docker Compose profile `pg`. Production overrides publish no external host ports; dev binds strictly to `127.0.0.1`.
