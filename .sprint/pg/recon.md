# G0 RECON REPORT: Logging, Events & Baseline Performance

## 1. Current State of Logging and Events
- **Database Architecture**:
  - SQLite (`backend/data/twinedge.db`) is the local operational store.
  - Telemetry is routed via MQTT broker (Mosquitto on port 1883) and stored in InfluxDB (port 8086) via `app/influx_writer.py`.
  - SQLite holds: `devices`, `stream_telemetry`, `stream_predictions`, `stream_events`, `audit_trail`, and `predictions`.
  - `stream_events` table schema:
    ```sql
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    engine_key TEXT NOT NULL,
    seq INTEGER,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,
    level TEXT DEFAULT 'INFO',
    source TEXT DEFAULT 'edge',
    ts REAL NOT NULL
    ```
- **Endpoints**:
  - `GET /logs`: Queries `stream_events` with filters `level`, `source`, `device`, `engine`, `q` (`LIKE %q%` on message/kind), `limit` (default 100), ordered by `id DESC`. Returns raw JSON array.
  - `GET /stream/fleet`: SSE endpoint streaming live events from `stream_events WHERE id > ?`.
  - `POST /ingest`: Batch endpoint accepting `List[IngestBatchItem]`. Processes `kind.startswith("event_")` by writing into `stream_events`.
- **Frontend Usage**:
  - `LogsPage.jsx` fetches `/logs` and connects to `/stream/fleet` for live tail. Renders columns: Timestamp, Level, Source (`${source} (${device_id})`), Event Kind, Message / Payload.
  - `GovernancePage.jsx` and `AuditLedgerPage.jsx` inspect `audit_trail` (SHA-256 hash-chained immutable ledger).

## 2. Docker Compose & Services
- Current `docker-compose.yml`:
  - `mosquitto`: Port `1883:1883`
  - `influxdb`: Port `8086:8086`
  - `backend`: Port `8000:8000`
  - `subscriber`: Background daemon running `python3 app/influx_writer.py`
- DB Drivers in use:
  - Python standard library `sqlite3`
  - `influxdb-client`
  - `paho-mqtt`
  - PostgreSQL driver: Currently none (`psycopg` or `psycopg-binary` needed for G1-G3).

## 3. Git Tags & Freeze Check
- Verified: No `demo-freeze` tag exists, nor is touched. Current working branch is `feat/postgres-logs`.

## 4. G0 Baseline Performance Benchmarks (200 calls each)
Recorded on host system with live FastAPI server:
- **`POST /predict`** (30x14 tensor window inference with ONNX Runtime):
  - Throughput: 110.6 req/s
  - p50 Latency: 8.17 ms
  - p95 Latency: 13.21 ms
  - p99 Latency: 27.78 ms
- **`GET /logs`** (SQLite query over `stream_events`):
  - Throughput: 484.0 req/s
  - p50 Latency: 1.88 ms
  - p95 Latency: 2.81 ms
  - p99 Latency: 4.75 ms
- **`POST /ingest`** (Batch write with SQLite transaction):
  - Throughput: 234.7 req/s
  - p50 Latency: 3.92 ms
  - p95 Latency: 6.15 ms
  - p99 Latency: 10.14 ms

Saved to `.sprint/pg/evidence/g0_baseline.json`.
