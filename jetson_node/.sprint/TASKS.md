# Sprint Tasks (J1 - J15)

| ID | Task | Status | Verification | Evidence |
|---|---|---|---|---|
| J1 | Contracts + docs + schema tests | TODO | Unit tests validate golden frames against contracts/frame_v1.schema.json | jetson_node/.sprint/evidence/j1_contracts.txt |
| J2 | Edge model export + pure numpy interpreter + parity >= 1000 windows | TODO | Max diff < 1e-3 cycles vs ORT, RMSE diff, parity report | jetson_node/.sprint/evidence/j2_parity.txt |
| J3 | Runtime ladder + canary + startup self-check | TODO | Canary passes across runtimes, fail-fast on mismatch | jetson_node/.sprint/evidence/j3_canary.txt |
| J4 | Replay pack builder (val & test engines, augmentations, EOL rollover) | TODO | Multi-engine replay pack generated with checksums and rollover | jetson_node/.sprint/evidence/j4_replay.txt |
| J5 | Node core (scheduler, monotonic drift correction, windowing, OOD, K-gate) | TODO | Unit tests verify padding, OOD band, K-cycle alert streak | jetson_node/.sprint/evidence/j5_core.txt |
| J6 | Storage (SQLite WAL, durable outbox, 200MB cap, drop priority policy, SD wear) | TODO | Outbox prioritization and drop tests, MB/hr calculation | jetson_node/.sprint/evidence/j6_storage.txt |
| J7 | Uplink (backoff jitter, HTTPS enforce, HMAC-SHA256, per-item acks, quarantine) | TODO | Ingest roundtrip, signature checks, poison quarantine | jetson_node/.sprint/evidence/j7_uplink.txt |
| J8 | Device health thread (sysfs, thermals, cpufreq, meminfo, NTP, throttling) | TODO | Heartbeat events emitted, sysfs graceful fallbacks | jetson_node/.sprint/evidence/j8_health.txt |
| J9 | Local HTTP API (/health, /state, /metrics, /events?since=) | TODO | stdlib HTTP server read-only endpoints respond | jetson_node/.sprint/evidence/j9_local_api.txt |
| J10 | Packaging (install.sh, requirements py36/py38, service unit, bundle tarball) | TODO | Python 3.6 syntax check, install script test, bundle build | jetson_node/.sprint/evidence/j10_packaging.txt |
| J11 | Cloud side compatibility (contracts against /ingest + additive cloud_receiver) | TODO | Standalone cloud_receiver tests, schema validation | jetson_node/.sprint/evidence/j11_cloud.txt |
| J12 | Fault proxy & chaos scenarios (blackout, latency, drops, bad key, restart, cap) | TODO | All chaos scenarios pass with recorded metrics | jetson_node/.sprint/evidence/j12_chaos.txt |
| J13 | Verification harness (py3.6 container soak, CPU 1-core 1GB, p50/p95/p99) | TODO | Python 3.6 Docker soak run, zero seq gaps, bounded RSS | jetson_node/.sprint/evidence/j13_soak.txt |
| J14 | On-device tools (probe.sh, selftest.sh, benchmark.py, soak.sh) | UNVERIFIED-DEVICE | Scripts tested locally, ready for device execution | jetson_node/tools/ |
| J15 | jetson_node/README.md, RUNBOOK.md, and REPORT.md | TODO | Complete operational guides and exit criteria summary | jetson_node/README.md |
