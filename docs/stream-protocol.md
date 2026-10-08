# TwinEdge Stream & Hybrid Uplink Protocol Specification (v1.0)

## 1. Architecture Overview
TwinEdge implements a hybrid edge-to-cloud telemetry and digital twin inference system for aircraft engine MRO.
Each virtual engine runs as an independent edge node process (`edge_sim`) executing:
- Replay generation from NASA C-MAPSS FD001 dataset
- Window preprocessing (30-cycle sliding window with front repeat padding for cycles < 30)
- Local ONNX Runtime model inference (`twinedge_rul.onnx`)
- K-cycle alert streak gating ($T=60\text{ cycles}, K=3$)
- SQLite WAL priority Outbox queue
- Uplink transport (HTTP batch `/ingest` or local MQTT QoS 1)

```
[edge_sim fleet node]
  Replay Generator -> Window(30) -> StandardScaler -> ONNX Runtime
       |                                                    |
       v                                                    v
  Local SQLite (WAL) <------------- Twin State & Alerts <---+
       |
       v (Priority: Events > Predictions > Telemetry)
  Outbox Queue --(HTTP POST /ingest / MQTT QoS 1)--> [Cloud Backend]
                                                            |
                                                    SQLite (WAL) Source of Truth
                                                            |
                                                    SSE (/stream/fleet, /stream/{id})
                                                            v
                                                    [React Frontend Store]
```

---

## 2. Frame Schema v1 (JSON)
Each stream telemetry frame conforms to the following schema:
```json
{
  "v": 1,
  "device_id": "DEV-001",
  "session_id": "sess_DEV-001_1728400000",
  "engine_key": "VAL-001",
  "split": "VAL",
  "seq": 104,
  "cycle": 45,
  "edge_ts": 1728400010.512,
  "data_origin": "replay_cmapss_fd001",
  "sensors": {
    "s_2": 642.15,
    "s_3": 1588.42,
    "s_4": 1400.12,
    "s_7": 553.85,
    "s_8": 2388.08,
    "s_9": 9052.11,
    "s_11": 47.35,
    "s_12": 521.68,
    "s_13": 2388.05,
    "s_14": 8132.88,
    "s_15": 8.419,
    "s_17": 392.0,
    "s_20": 38.85,
    "s_21": 23.35
  },
  "ground_truth": {
    "true_rul": 147.0,
    "tag": "REPLAY-GROUND-TRUTH"
  },
  "inference": {
    "site": "EDGE",
    "rul": 125.0,
    "latency_ms": 7.82,
    "model_sha": "a2b8...01f",
    "warmup": false,
    "ood_flags": []
  },
  "twin": {
    "health_index": 100,
    "band": "HEALTHY"
  },
  "alert": {
    "state": "NONE",
    "k_count": 0
  }
}
```

---

## 3. Idempotency & Ingest Semantics
- **Endpoint**: `POST /ingest`
- **Authentication**: `X-Device-Key` header
- **Idempotency Key**: Unique compound key `(device_id, seq, kind)`.
- **Duplicate Handling**: Ingest operations use SQLite `INSERT OR IGNORE`. Repeated transmissions of already received frames are silently ignored and do not duplicate database rows or cause state corruption.
- **Sequence Gap Detection**: The cloud backend tracks `max(seq)` per `device_id`. When received `seq > last_seq + 1`, a gap event is automatically logged into `stream_events`.

---

## 4. Priority Queue & Size Cap Drop Policy
Edge nodes buffer outbound messages into a local SQLite table (`outbox`):
1. **Priority 1 (Events)**: Critical operational notifications (`alert_raised`, `eol`, `site_switch`). **NEVER DROPPED**.
2. **Priority 2 (Predictions)**: Edge-computed RUL and twin health states.
3. **Priority 3 (Raw Telemetry)**: Sensor channel frames.

When outbox size exceeds the configured cap (`--outbox-cap-mb`, default 10MB):
- Oldest raw telemetry records are evicted first.
- Every eviction increments `outbox_drop_stats`.
- Critical lifecycle events and alert records are preserved unconditionally.

---

## 5. Failover & Hybrid Connectivity
Each node supports three inference policies:
- `--inference edge`: Edge node runs local ONNX Runtime regression and transmits predictions upstream.
- `--inference cloud`: Edge node streams raw sensors; cloud backend calculates RUL and tags `inference_site: CLOUD`.
- `--inference auto`: Uses cloud inference when the uplink is healthy. If the link goes down or experiences 3 consecutive timeouts, the node switches seamlessly to `EDGE` inference. Upon connection restoration, it resumes cloud offload with hysteresis.
- **Standalone Offline**: When no backend is available, the node runs completely detached, logging locally to SQLite WAL. The React frontend can connect directly to the edge node's local HTTP API (`http://localhost:8100/stream`).
