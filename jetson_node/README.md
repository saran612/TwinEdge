# TwinEdge Jetson Node (`jetson_node/`)

Self-contained continuous telemetry stream and edge RUL inference node for NVIDIA Jetson Nano / Orin Nano, running the NASA C-MAPSS FD001 1D-CNN digital twin directly on the device.

---

## 1. Architecture & Design Principles

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

### Truth In Advertising & Honest Labels
- **Simulated Replay Stream**: Telemetry originates from NASA C-MAPSS turbofan dataset (`replay_cmapss_fd001` or `replay_cmapss_fd001+augmentation`).
- **Ground Truth Isolation**: `ground_truth.true_rul` is a sidecar evaluation metric, never fed as a model input.
- **Hardware-Labeled Performance**: Every measured latency or thermal figure is stamped with the hardware platform (`x86_64_host` vs Jetson model). All device facts are explicitly marked **UNVERIFIED** until executed directly on NVIDIA Tegra hardware.
- **CPU Inference Only**: Inference executes strictly on CPU (`CPUExecutionProvider` or pure NumPy interpreter). No claims of GPU acceleration.

---

## 2. Python 3.6 Lowest-Common-Denominator Compatibility
To support JetPack 4.6 (Ubuntu 18.04, Python 3.6.9) on original Jetson Nano as well as JetPack 6 (Python 3.10) on Orin Nano:
- **No Python 3.7+ syntax**: No dataclasses, walrus operator `:=`, `asyncio.run()`, `from __future__ import annotations`, or f-string debug expressions `=`.
- **Pure NumPy Inference Engine**: Generated directly from ONNX graph topology, executing convolutions, ReLU, global average pooling, and dense layers with parity tolerance $< 10^{-3}$ cycles vs ONNX Runtime.

---

## 3. Quickstart & Installation

### Option A: Running Locally on Development Host
```bash
python3 -m jetson_node.node.app --allow-insecure --engines 3 --rate 1.0
```

### Option B: Deploying to NVIDIA Jetson
1. Copy bundle tarball to Jetson:
   ```bash
   scp jetson-bundle.tar.gz jetson@<jetson-ip>:/home/jetson/
   ```
2. Unpack and run probe:
   ```bash
   tar -xzf jetson-bundle.tar.gz
   cd twinedge
   ./jetson_node/tools/probe.sh
   ```
3. Install dependencies:
   ```bash
   ./jetson_node/tools/install.sh --install-service
   ```
4. Configure `/etc/twinedge/node.env` (permissions `0600`):
   ```bash
   sudo nano /etc/twinedge/node.env
   ```
5. Run self-test and benchmark:
   ```bash
   ./jetson_node/tools/selftest.sh
   python3 jetson_node/tools/benchmark.py
   ```
6. Start systemd service:
   ```bash
   sudo systemctl enable --now twinedge-jetson
   ```

---

## 4. Local Monitoring API
The node exposes a read-only HTTP interface (default `http://127.0.0.1:8088`):
- `GET /health`: Model SHA, selected runtime, storage depth, link status.
- `GET /state`: Active engines, cycles, latest RUL predictions, twin bands.
- `GET /metrics`: Plain-text Prometheus counters (outbox depth, quarantine count, bytes sent).
- `GET /events?since=<ts>`: Discrete operational events stream.
