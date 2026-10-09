# PostgreSQL Logging & Device-Event Store Architecture

## 1. Overview & Architecture
TwinEdge integrates PostgreSQL (version 16) as a specialized, queryable system-log and device-event store (`app_logs`, `device_heartbeats`). 

```
               +--------------------------------------+
               |         Edge Fleet Nodes             |
               +--------------------------------------+
                                   | HTTP / MQTT (Events & Heartbeats)
                                   v
+-------------------------------------------------------------------+
|                        Cloud Backend                              |
|                                                                   |
|   SQLite (Authoritative)              QueueHandler (10k bounded)  |
|   - Predictions & Stream Telemetry    Batch Writer (200 rows/1s)  |
|   - Alerts & Immutable Audit Trail                  |             |
+-----------------------------------------------------|-------------+
                                                      |
                             (Failover to Spool JSONL)|
                                                      v
                                        +---------------------------+
                                        |   PostgreSQL 16 Service   |
                                        |   - app_logs              |
                                        |   - device_heartbeats     |
                                        +---------------------------+
```

### Core Architecture Principles
1. **Authoritative Separation**: SQLite remains the authoritative store for raw sensor telemetry, alerts, and the SHA-256 hash-chained audit trail (`audit_trail`). PostgreSQL never acts as the primary database for the audit chain.
2. **Failure Isolation**: Log emission into PostgreSQL is completely asynchronous. If PostgreSQL is offline, down, or slow:
   - In-memory bounded queue (10,000 items) buffers writes.
   - Secondary spooler persists up to 50 MB in `data/logs/pg_spool.jsonl` and replays in sequence upon reconnection.
   - Priority drop policy drops `DEBUG` and `INFO` first under extreme pressure; `ERROR` and `CRITICAL` entries are never dropped.
   - The user interface renders a degraded mode indicator without disrupting inference or stream processing.
3. **No Edge Connection**: Edge nodes never connect to PostgreSQL directly; the cloud backend writes on their behalf through the `/ingest` pipeline.

---

## 2. Security & Role Architecture
PostgreSQL utilizes `scram-sha-256` password encryption and three distinct operational roles:
- `twinedge_migrator`: Schema owner; executes DDL migrations.
- `twinedge_app`: DML role; has `INSERT` and `SELECT` on log tables, `DELETE` on `app_logs` for the janitor, and no DDL privileges (cannot `DROP` or `ALTER`).
- `twinedge_ro`: Read-only role; has `SELECT` only.

In `docker-compose.prod.yml`, PostgreSQL port 5432 is never published to the host network interface.

---

## 3. Schema & Migrations
- `db/migrations/V001__app_logs.sql`:
  - `id`: BIGSERIAL Primary Key
  - `ts`: TIMESTAMPTZ (Index: `idx_app_logs_ts_desc`)
  - `level`: SMALLINT (10..50)
  - `source`: TEXT (`backend`, `edge:<device_id>`, `frontend`)
  - `event`, `message`, `data` (JSONB GIN indexed), `trace_id`, `seq`
  - Idempotency: `UNIQUE (source, device_id, seq, event) WHERE seq IS NOT NULL`
- `db/migrations/V002__device_heartbeats.sql`:
  - `ts`, `device_id`, `cpu_temp`, `ram_used_mb`, `link_state`, `queue_depth`, `power_mode`, `clock_synced`

---

## 4. Retention & Janitor
An automated hourly janitor thread executes chunked deletions (`BATCH_DELETE_SIZE = 5000`) of rows older than `LOG_RETENTION_DAYS` (default 14 days), preventing long table locks.

---

## 5. Operations & Runbook
### Starting and Stopping
```bash
# Start PostgreSQL container
make pg-up
# or: docker compose --profile pg up -d postgres

# Run migrations
make pg-migrate
# or: python3 scripts/migrate.py

# Access psql CLI
make pg-psql

# Backup database (custom format)
make pg-backup

# Test restore against scratch DB
make pg-restore-test

# Stop PostgreSQL container
make pg-down
```

### Switching Log Sinks
Configure in `.env`:
- `LOG_SINK=sqlite` (Default)
- `LOG_SINK=postgres` (Asynchronous PostgreSQL pipeline)
- `LOG_SINK=dual` (Dual write to SQLite and PostgreSQL)

Configure read store:
- `LOG_READ_STORE=sqlite`
- `LOG_READ_STORE=postgres` (falls back automatically to SQLite if degraded)
