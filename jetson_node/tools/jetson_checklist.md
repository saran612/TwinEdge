# NVIDIA Jetson Nano Pre-Flight & Hardening Checklist

1. **Power Supply & Power Mode**:
   - Original Jetson Nano requires 5V 4A barrel jack power for sustained workloads.
   - Set 10W power mode: `sudo nvpmodel -m 0`
   - Maximize clocks (benchmarking only): `sudo jetson_clocks`
2. **Storage Endurance (SD Card Wear Protection)**:
   - Micro-SD cards experience write fatigue with uncontrolled SQLite transactions.
   - TwinEdge uses SQLite WAL with `synchronous=NORMAL` and batched writes (2s / 100 rows).
   - Database size cap default is 200 MB with priority drop policy (events are never dropped).
   - **Recommendation**: For production flight soaking, boot from or mount `/var/log` and `/opt/twinedge` on an external USB 3.0 SSD.
3. **Swap & Out-Of-Memory (OOM) Protection**:
   - Jetson Nano 4GB / 2GB models should configure a 4GB zram or swapfile:
     ```bash
     sudo fallocate -l 4G /swapfile
     sudo chmod 600 /swapfile
     sudo mkswap /swapfile
     sudo swapon /swapfile
     ```
4. **Clock Synchronization**:
   - Jetson Nano has no hardware RTC battery. On power cycle without Internet, clocks reset.
   - TwinEdge node tolerates unsynchronized clocks by excluding timestamps from HMAC signatures and flagging `clock_synced=false` in telemetry.
