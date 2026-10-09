# TwinEdge Jetson Node Sprint Report

## Executive Summary
This sprint implemented `jetson_node/`: a self-contained, continuous simulated turbofan engine streaming and edge digital twin inference node for NVIDIA Jetson hardware (Jetson Nano / Orin Nano).

All requirements across tasks J1–J13 are verified on the development host and within a resource-constrained Python 3.6 Docker container (1 CPU core, 1 GB RAM). Task J14 diagnostic and benchmarking tools are built, tested, and staged for execution on Jetson hardware.

---

## 1. Task Verification Matrix

| ID | Task | Status | Verification & Evidence |
|---|---|---|---|
| **J1** | Contracts + docs + schema tests | **VERIFIED** | `jetson_node/.sprint/evidence/j1_contracts.txt` (contracts/frame_v1.schema.json, event_v1.schema.json, batch_v1.schema.json) |
| **J2** | Edge model export + pure NumPy interpreter | **VERIFIED** | `jetson_node/.sprint/evidence/j2_parity.txt` (1200 windows parity vs ORT, max diff $3.05 \times 10^{-5} < 10^{-3}$, RMSE diff $8.94 \times 10^{-6}$) |
| **J3** | Runtime ladder + canary self-verification | **VERIFIED** | `jetson_node/.sprint/evidence/j3_canary.txt` (Level 1: ORT CPU, Level 2: NumPy pure, Level 3: TFLite) |
| **J4** | Replay pack builder (val & test engines, augmentations, rollover) | **VERIFIED** | `jetson_node/.sprint/evidence/j4_replay.txt` (Units 5, 11, 23, 77 run-to-failure; Units 1, 2, 3 test cutoff; manifest + checksums) |
| **J5** | Node core (scheduler, monotonic drift correction, OOD, K-gate) | **VERIFIED** | `jetson_node/.sprint/evidence/j5_core.txt` (Padding warmup, OOD `unreliable_input`, K-gate streak T=60, K=3) |
| **J6** | SQLite WAL storage (outbox priority, 200MB cap, drop policy) | **VERIFIED** | `jetson_node/.sprint/evidence/j6_storage.txt` (Priority: Event > Prediction > Telemetry; telemetry dropped first, events NEVER dropped) |
| **J7** | Uplink (backoff jitter, HTTPS enforce, HMAC-SHA256, acks, quarantine) | **VERIFIED** | `jetson_node/.sprint/evidence/j7_uplink.txt` (Gzip compression, signature verification, poison pill quarantine table) |
| **J8** | Device health monitor (sysfs thermals, meminfo, NTP, throttling) | **VERIFIED** | `jetson_node/.sprint/evidence/j8_health.txt` (Periodic 10s heartbeat events, thermal zone reading, graceful fallback) |
| **J9** | Local read-only HTTP API (/health, /state, /metrics, /events) | **VERIFIED** | `jetson_node/.sprint/evidence/j9_local_api.txt` (stdlib HTTP server, Prometheus metrics, state inspection) |
| **J10** | Packaging (install.sh, py36/py38 reqs, systemd unit, checklist) | **VERIFIED** | `jetson_node/.sprint/evidence/j10_packaging.txt` (Service unit, env file template 0600, bundle tarball) |
| **J11** | Cloud compatibility (FastAPI cloud_receiver standalone service) | **VERIFIED** | `jetson_node/.sprint/evidence/j11_cloud.txt` (HMAC verify, sequence gap tracker, GET /devices, GET /latest) |
| **J12** | Chaos fault injection proxy & scenarios | **VERIFIED** | `jetson_node/.sprint/evidence/j12_chaos.txt` (Blackout drain, 200ms latency, 100% drops, 401 bad key, disk cap drop) |
| **J13** | Integration soak harness (py3.6 container soak, 1 core, 1 GB RAM) | **VERIFIED** | `jetson_node/.sprint/evidence/j13_soak.txt` (Zero sequence gaps, bounded RSS, stable multi-engine streaming) |
| **J14** | On-device diagnostics & benchmarking tools | **UNVERIFIED-DEVICE** | Staged in `jetson_node/tools/` (probe.sh, selftest.sh, benchmark.py, soak.sh) |
| **J15** | Documentation & runbooks (README.md, RUNBOOK.md, REPORT.md) | **VERIFIED** | Complete guides, honest wording, architecture diagrams |

---

## 2. Parity & Model Verification Table

Evaluated on 1,200 held-out windows from C-MAPSS FD001 validation set:

| Metric | Target Tolerance | Measured Result (Pure NumPy vs ORT) | Status |
|---|---|---|---|
| **Max Absolute Difference** | $< 1.0 \times 10^{-3}$ cycles | **$0.00003052$ cycles** ($3.05 \times 10^{-5}$) | **PASS** |
| **Mean Absolute Difference** | N/A | **$0.00000636$ cycles** ($6.36 \times 10^{-6}$) | **PASS** |
| **RUL RMSE Difference** | N/A | **$0.00000894$ cycles** ($8.94 \times 10^{-6}$) | **PASS** |
| **Canary Test (5 Golden Windows)** | $< 1.0 \times 10^{-3}$ cycles | **$0.00000000$ cycles** | **PASS** |

---

## 3. Chaos Injection Results

| Scenario | Condition | Observed Outcome | Status |
|---|---|---|---|
| **Cloud Blackout** | Ingest offline for duration | Outbox buffers rows without loss; drains completely upon recovery | **PASS** |
| **Injected Latency** | 200 ms network delay | Node maintains monotonic scheduling drift compensation | **PASS** |
| **Packet Drops** | 100% gateway drops | Exponential backoff with jitter engaged; zero data corruption | **PASS** |
| **Authentication Failure** | HTTP 401 (invalid secret) | Link switches to offline; backs off without tight error loops | **PASS** |
| **Storage Cap Pressure** | Capacity cap exceeded | Telemetry dropped first; discrete events **never dropped** | **PASS** |

---

## 4. Emulated Resource Performance (Development Machine Constraints)
*Note: Evaluated on dev host inside Docker container restricted to 1 CPU core and 1.0 GB RAM.*

- **Inference Latency (ORT CPU)**: p50 = 0.27 ms, p95 = 0.39 ms, p99 = 0.43 ms
- **Inference Latency (Pure NumPy)**: ~0.60 ms / window
- **Network Compression Efficiency**: ~82% reduction (gzip compressed bytes vs raw JSON bytes)
- **Memory Footprint**: < 65 MB RSS inside container

---

## 5. UNVERIFIED-DEVICE Items (Awaiting Physical Jetson Nano Run)
The following metrics and facts remain labeled **UNVERIFIED-DEVICE** until the user executes the staged tools on physical Jetson hardware:
1. Physical Jetson SoC thermals during sustained 6-hour soak (`soak_results.json`).
2. Actual Jetson Nano 128-core Maxwell CPU execution latency (`benchmark_results.json`).
3. SD card flash write endurance / write rate in physical MB/hour (`jetson_selftest.json`).
4. Physical NTP synchronization behavior without hardware RTC battery.

---

## 6. On-Device Execution Instructions (For the User)

Run the following commands on the NVIDIA Jetson device:

```bash
# 1. Hardware probe
./jetson_node/tools/probe.sh > probe_output.txt

# 2. Dependency install & canary self-test
./jetson_node/tools/install.sh
./jetson_node/tools/selftest.sh

# 3. Model micro-benchmark (2000 iterations)
python3 jetson_node/tools/benchmark.py

# 4. Long-duration soak test (e.g. 6 hours = 21600 seconds)
./jetson_node/tools/soak.sh 21600
```

**Paste back**:
- `probe_output.txt`
- `jetson_selftest.json`
- `benchmark_results.json`
- `soak_results.json`
