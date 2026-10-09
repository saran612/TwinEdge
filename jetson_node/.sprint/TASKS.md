# Sprint Tasks (J1 - J15)

| ID | Task | Status | Verification | Evidence |
|---|---|---|---|---|
| J1 | Contracts + docs + schema tests | VERIFIED | Schema validation & golden tests passed | jetson_node/.sprint/evidence/j1_contracts.txt |
| J2 | Edge model export + pure NumPy interpreter + parity >= 1000 windows | VERIFIED | Max diff 3.05e-5 < 1e-3 cycles vs ORT on 1200 windows | jetson_node/.sprint/evidence/j2_parity.txt |
| J3 | Runtime ladder + canary + startup self-check | VERIFIED | Canary passes across all runtimes | jetson_node/.sprint/evidence/j3_canary.txt |
| J4 | Replay pack builder (val & test engines, augmentations, EOL rollover) | VERIFIED | Multi-engine replay pack generated with checksums and rollover | jetson_node/.sprint/evidence/j4_replay.txt |
| J5 | Node core (scheduler, monotonic drift correction, windowing, OOD, K-gate) | VERIFIED | Unit tests verify padding, OOD band, K-cycle alert streak | jetson_node/.sprint/evidence/j5_core.txt |
| J6 | Storage (SQLite WAL, durable outbox, 200MB cap, drop priority policy, SD wear) | VERIFIED | Outbox prioritization and drop tests, MB/hr calculation | jetson_node/.sprint/evidence/j6_storage.txt |
| J7 | Uplink (backoff jitter, HTTPS enforce, HMAC-SHA256, per-item acks, quarantine) | VERIFIED | Ingest roundtrip, signature checks, poison quarantine | jetson_node/.sprint/evidence/j7_uplink.txt |
| J8 | Device health thread (sysfs, thermals, cpufreq, meminfo, NTP, throttling) | VERIFIED | Heartbeat events emitted, sysfs graceful fallbacks | jetson_node/.sprint/evidence/j8_health.txt |
| J9 | Local HTTP API (/health, /state, /metrics, /events?since=) | VERIFIED | stdlib HTTP server read-only endpoints respond | jetson_node/.sprint/evidence/j9_local_api.txt |
| J10 | Packaging (install.sh, requirements py36/py38, service unit, bundle tarball) | VERIFIED | Python 3.6 syntax check, install script test, bundle build | jetson_node/.sprint/evidence/j10_packaging.txt |
| J11 | Cloud side compatibility (contracts against /ingest + additive cloud_receiver) | VERIFIED | Standalone cloud_receiver tests, schema validation | jetson_node/.sprint/evidence/j11_cloud.txt |
| J12 | Fault proxy & chaos scenarios (blackout, latency, drops, bad key, restart, cap) | VERIFIED | All chaos scenarios pass with recorded metrics | jetson_node/.sprint/evidence/j12_chaos.txt |
| J13 | Verification harness (py3.6 container soak, CPU 1-core 1GB, p50/p95/p99) | VERIFIED | Python 3.6 Docker soak run, zero seq gaps, bounded RSS | jetson_node/.sprint/evidence/j13_soak.txt |
| J14 | On-device tools (probe.sh, selftest.sh, benchmark.py, soak.sh) | UNVERIFIED-DEVICE | Scripts tested locally, ready for device execution | jetson_node/tools/ |
| J15 | jetson_node/README.md, RUNBOOK.md, and REPORT.md | VERIFIED | Complete operational guides and exit criteria summary | jetson_node/README.md |
