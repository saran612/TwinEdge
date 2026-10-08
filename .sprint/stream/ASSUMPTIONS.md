# Sprint Stream Assumptions & Architectural Decisions

## Baseline Decisions
- **Protected Files**: Never modify model weights, scalers, datasets, or existing DB files (`backend/data/*.db`).
- **Data Scoping**: Old alerts are preserved and non-destructively partitioned with `session_id = 'legacy'`, `status = 'archived'`.
- **Honesty Rule**: Every live frame contains `data_origin: "replay_cmapss_fd001"`, `session_id`, `split`, and `inference_site` (EDGE or CLOUD).
- **Transport**: Default uplink transport uses HTTP batch `POST /ingest` with `X-Device-Key` header; MQTT is supported when broker is present.
