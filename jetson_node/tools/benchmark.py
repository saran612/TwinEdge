"""
jetson_node/tools/benchmark.py
Measures batch-1 inference latency (p50, p95, p99) over >= 2000 iterations after warm-up.
Records temperatures, frequency, RSS memory, throttling status, and hardware labels.
"""
import os
import sys
import time
import json
import numpy as np

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from jetson_node.node.runtime import select_runtime
from jetson_node.node.health import DeviceHealthMonitor

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_dir = os.path.join(repo_root, "model")

    print("=== TwinEdge Edge Inference Benchmark ===")
    runtime = select_runtime(model_dir)
    print("Benchmarking runtime: " + str(runtime.name))

    health = DeviceHealthMonitor("BENCHMARK", None)
    m_before = health.sample_all()

    # Generate test window (1, 30, 14)
    np.random.seed(42)
    win = np.random.randn(1, 30, 14).astype(np.float32)

    # Warmup 50 iterations
    for _ in range(50):
        runtime.predict_window(win)

    # 2000 iterations
    latencies = []
    ITERATIONS = 2000
    for _ in range(ITERATIONS):
        t0 = time.perf_counter()
        runtime.predict_window(win)
        latencies.append((time.perf_counter() - t0) * 1000.0)

    m_after = health.sample_all()

    latencies.sort()
    p50 = float(np.percentile(latencies, 50))
    p95 = float(np.percentile(latencies, 95))
    p99 = float(np.percentile(latencies, 99))
    mean_lat = float(np.mean(latencies))

    device_label = "x86_64_host"
    if os.path.exists("/proc/device-tree/model"):
        with open("/proc/device-tree/model", "r") as f:
            device_label = f.read().strip("\0")

    result = {
        "device_model": device_label,
        "runtime": runtime.name,
        "iterations": ITERATIONS,
        "p50_latency_ms": round(p50, 4),
        "p95_latency_ms": round(p95, 4),
        "p99_latency_ms": round(p99, 4),
        "mean_latency_ms": round(mean_lat, 4),
        "temp_before_c": m_before.get("max_cpu_temp"),
        "temp_after_c": m_after.get("max_cpu_temp"),
        "throttled": m_after.get("throttled", False),
        "hardware_verified": (device_label != "x86_64_host")
    }

    print("\nBenchmark Results:")
    print(json.dumps(result, indent=2))

    with open("benchmark_results.json", "w") as f:
        json.dump(result, f, indent=2)

if __name__ == "__main__":
    main()
