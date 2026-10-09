# TwinEdge Jetson Edge Uplink Protocol Specification (v1.0)

## 1. Scope & System Topology
This document specifies the communication contract between a field-deployed NVIDIA Jetson edge node (`jetson_node`) and the TwinEdge cloud ingestion service.

```
+-------------------------------------------------------------+
|                     NVIDIA Jetson Node                      |
|  Replay Stream -> Window(30) -> Preprocess -> Runtime Ladder|
|       |                                            |        |
|       v                                            v        |
|  Local SQLite WAL Store <--- Twin State / Alerts <-+        |
|       |                                                     |
|       v                                                     |
|  Durable Outbox Queue (Priority: Event > Pred > Telem)      |
+------------------------------+------------------------------+
                               | Gzip compressed JSON
                               | X-Device-Id: <DEVICE_ID>
                               | X-Signature: HMAC-SHA256(secret, raw_body)
                               v
+-------------------------------------------------------------+
|                  TwinEdge Cloud Ingest / EC2                |
|           POST /ingest (or additive cloud_receiver)         |
|  - Idempotent deduplication on (device_id, seq, kind)       |
|  - Returns per-item disposition: accepted/duplicate/retry/..|
+-------------------------------------------------------------+
```

## 2. Authentication & Security
- **HMAC Authentication**: Each batch payload is hashed using `HMAC-SHA256(device_secret, raw_compressed_body)`.
- **Headers**:
  - `Content-Type: application/json`
  - `Content-Encoding: gzip`
  - `X-Device-Id: <string>`
  - `X-Signature: <64-char-hex>`
- **No Signature Timestamp**: Jetson Nano devices lack a hardware real-time clock (RTC). Signature computation does NOT bind wall-clock time; idempotency on `(device_id, seq, kind)` prevents replay vulnerabilities.
- **HTTPS Enforcement**: HMAC authenticates origin and integrity but does **not** encrypt telemetry payload. Ingest nodes MUST connect via HTTPS (`https://`). Plain HTTP is strictly rejected by `jetson_node` unless explicitly overridden via `--allow-insecure` for isolated loopback testing.

## 3. Wire Formats & Schemas
- Telemetry & prediction frames conform to `contracts/frame_v1.schema.json`.
- Discrete operational events conform to `contracts/event_v1.schema.json`.
- Batches conform to `contracts/batch_v1.schema.json`.

### Ingest Response Format
The cloud responds with `200 OK` and a structured response:
```json
{
  "status": "ok",
  "batch_id": "batch_DEV-001_1728400000",
  "ack_seq": 105,
  "results": [
    {"seq": 103, "kind": "prediction", "status": "accepted"},
    {"seq": 104, "kind": "prediction", "status": "duplicate"},
    {"seq": 105, "kind": "event", "status": "rejected", "reason": "invalid_schema"}
  ]
}
```
- **accepted / duplicate**: Node permanently deletes rows from the outbox.
- **retry**: Node keeps rows and backs off.
- **rejected**: Node moves items to a poison-pill quarantine table (never retried infinitely) and increments the drop/quarantine counter.

## 4. Priority Queue & SD Wear Policy
- Jetson nodes use micro-SD cards which are wear-sensitive.
- Disk cap default: 200 MB.
- Outbox write commits are batched (every 2 seconds or 100 rows) with SQLite WAL and `synchronous=NORMAL`.
- Drop policy under capacity pressure:
  1. Raw telemetry discarded first.
  2. Oldest predictions discarded second.
  3. Events (`kind=event`) are **NEVER DROPPED**. Every drop generates an `outbox_drop` event.
