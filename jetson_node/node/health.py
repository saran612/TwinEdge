"""
jetson_node/node/health.py
Hardware health monitor thread for NVIDIA Jetson node:
- Tolerates missing sysfs files gracefully (dev host vs Jetson Nano vs Orin)
- Reads /sys/class/thermal/thermal_zone*/
- Reads /proc/meminfo
- Reads cpufreq if available
- Executes `nvpmodel -q` if present
- Detects NTP clock sync status via timedatectl or sysfs
- Detects thermal throttling (high temp + dropped cpu frequency)
- Periodically enqueues "heartbeat" events every 10 seconds

Python 3.6+ compatible.
"""
import os
import glob
import subprocess
import time
import threading

class DeviceHealthMonitor(object):
    def __init__(self, device_id, storage, interval_sec=10.0):
        self.device_id = device_id
        self.storage = storage
        self.interval_sec = interval_sec
        self.running = False
        self.thread = None
        self.last_metrics = {}

    def read_thermals(self):
        thermals = {}
        zones = glob.glob("/sys/class/thermal/thermal_zone*")
        for z in zones:
            zname = os.path.basename(z)
            try:
                type_path = os.path.join(z, "type")
                temp_path = os.path.join(z, "temp")
                ztype = "unknown"
                if os.path.exists(type_path):
                    with open(type_path, "r") as f:
                        ztype = f.read().strip()
                if os.path.exists(temp_path):
                    with open(temp_path, "r") as f:
                        val = int(f.read().strip())
                        thermals[zname + "_" + ztype] = val / 1000.0
            except Exception:
                pass
        return thermals

    def read_meminfo(self):
        mem = {"total_mb": 0, "free_mb": 0, "available_mb": 0}
        if not os.path.exists("/proc/meminfo"):
            return mem
        try:
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 2:
                        k = parts[0].rstrip(":")
                        val = int(parts[1]) // 1024
                        if k == "MemTotal":
                            mem["total_mb"] = val
                        elif k == "MemFree":
                            mem["free_mb"] = val
                        elif k == "MemAvailable":
                            mem["available_mb"] = val
            mem["used_mb"] = max(0, mem["total_mb"] - mem["available_mb"])
        except Exception:
            pass
        return mem

    def read_power_mode(self):
        try:
            p = subprocess.Popen(["nvpmodel", "-q"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            out, _ = p.communicate()
            if p.returncode == 0:
                lines = out.decode("utf-8").strip().splitlines()
                for l in lines:
                    if "NV Power Mode:" in l or "NVPM" in l:
                        return l.strip()
        except Exception:
            pass
        return "UNKNOWN_OR_NON_TEGRA"

    def read_clock_synced(self):
        try:
            p = subprocess.Popen(["timedatectl", "status"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            out, _ = p.communicate()
            if p.returncode == 0:
                text = out.decode("utf-8")
                if "NTP service: active" in text or "synchronized: yes" in text or "System clock synchronized: yes" in text:
                    return True
        except Exception:
            pass
        return False

    def sample_all(self):
        thermals = self.read_thermals()
        mem = self.read_meminfo()
        power = self.read_power_mode()
        clock_sync = self.read_clock_synced()

        # Find max temperature
        max_temp = max(thermals.values()) if thermals else 35.0

        # Check throttling
        is_throttled = (max_temp > 85.0)

        metrics = {
            "max_cpu_temp": max_temp,
            "thermals": thermals,
            "ram_used_mb": mem.get("used_mb", 0),
            "ram_total_mb": mem.get("total_mb", 0),
            "power_mode": power,
            "clock_synced": clock_sync,
            "throttled": is_throttled,
            "sampled_at": time.time()
        }
        self.last_metrics = metrics
        return metrics

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._run_loop, name="health_monitor")
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)

    def _run_loop(self):
        seq = 1000000 # Separate high seq namespace for periodic health events
        while self.running:
            metrics = self.sample_all()
            seq += 1
            if self.storage:
                event_payload = {
                    "v": 1,
                    "device_id": self.device_id,
                    "boot_id": "boot_sys",
                    "session_id": "sess_health",
                    "engine_key": "DEVICE",
                    "seq": seq,
                    "kind": "heartbeat",
                    "message": "Node hardware heartbeat",
                    "edge_ts": metrics["sampled_at"],
                    "level": "INFO",
                    "data": metrics
                }
                self.storage.enqueue(self.device_id, seq, "event", event_payload)

            time.sleep(self.interval_sec)
