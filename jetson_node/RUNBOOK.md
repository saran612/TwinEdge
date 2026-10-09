# TwinEdge Jetson Node Runbook & Operations

## 1. Cloud Connectivity (AWS / EC2)
- Node communicates with Cloud Ingest via HTTPS (`https://api.yourdomain.com/ingest` or behind Caddy).
- Ports: Only 80 / 443 public on EC2.
- Authentication: HMAC-SHA256 signature calculated over raw gzipped POST payload using shared secret.
- Plain HTTP is strictly blocked unless `--allow-insecure` is explicitly specified.

---

## 2. Troubleshooting Guide

| Issue / Symptom | Root Cause | Remediation Step |
|---|---|---|
| **Link state is offline / Backlog growing** | Cloud server unreachable or network disconnected | 1. Check local network: `ping -c 3 8.8.8.8`<br>2. Verify cloud endpoint: `curl -I https://api.yourdomain.com/health`<br>3. Inspect outbox depth via `curl http://127.0.0.1:8088/metrics` |
| **HTTP 401 Unauthorized** | Mismatched `DEVICE_SECRET` | 1. Verify `DEVICE_SECRET` in `/etc/twinedge/node.env`<br>2. Confirm corresponding secret on Cloud Receiver<br>3. Restart node service: `sudo systemctl restart twinedge-jetson` |
| **Canary failed at startup** | Corrupted model weights or precision regression | 1. Verify file hashes in `jetson_node/model/edge_model.json`<br>2. Re-run canary: `python3 -c "from jetson_node.node.runtime import select_runtime; select_runtime('jetson_node/model')"` |
| **Thermal throttling detected** | SoC temperature exceeds 85°C | 1. Check thermal zones: `./jetson_node/tools/probe.sh`<br>2. Attach 5V PWM fan to Jetson header<br>3. Switch power mode: `sudo nvpmodel -m 1` (5W mode) |
| **Clock unsynchronized** | Jetson lacks RTC battery on cold boot | Normal on cold boot without network. The node continues streaming with `clock_synced=false`. Time will sync automatically via NTP when link recovers. |
| **Storage full / SD wear alert** | High write volume or small disk partition | 1. Outbox size cap (200MB) will drop telemetry first, preserving events.<br>2. Mount `/var/log` or node working dir on external USB 3.0 SSD. |

---

## 3. Known Limitations & Constraints
1. **Replay-Based Simulation**: Uses NASA C-MAPSS FD001 engine run-to-failure cycles. Not connected to physical avionics buses.
2. **CPU Inference**: Operates on CPU Execution Provider or pure NumPy interpreter. Does not utilize Tegra GPU.
3. **JetPack 4.6 EOL**: JetPack 4.6 (Ubuntu 18.04) has reached standard support end-of-life. Python 3.6 compatibility is strictly maintained to allow continuous operation on legacy hardware.
