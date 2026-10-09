import time
import json
import statistics
import urllib.request

def bench_endpoint(url, method="GET", body=None, count=200):
    latencies = []
    headers = {"Content-Type": "application/json"} if body else {}
    data = json.dumps(body).encode("utf-8") if body else None
    
    start_all = time.perf_counter()
    for _ in range(count):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        t0 = time.perf_counter()
        with urllib.request.urlopen(req) as resp:
            resp.read()
        latencies.append((time.perf_counter() - t0) * 1000.0) # in ms
    total_time = time.perf_counter() - start_all
    throughput = count / total_time
    
    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = latencies[int(0.95 * len(latencies))]
    p99 = latencies[int(0.99 * len(latencies))]
    mean_lat = statistics.mean(latencies)
    
    return {
        "count": count,
        "total_time_s": total_time,
        "throughput_req_per_s": throughput,
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "mean_ms": mean_lat
    }

# Synthetic frame for predict: 30 cycles of 14 active sensor values
predict_body = {
    "engine_id": 1,
    "cycle": 100,
    "window": [[642.0, 1589.0, 1405.0, 553.5, 2388.0, 9050.0, 47.3, 521.8, 2388.0, 8130.0, 8.4, 0.03, 392.0, 38.8] for _ in range(30)]
}

# Synthetic payload for ingest (List[IngestBatchItem])
ingest_body = [
    {
        "device_id": "bench-dev-01",
        "seq": 100001,
        "kind": "telemetry",
        "data": {
            "session_id": "bench-sess-01",
            "cycle": 50,
            "sensors": {"s_2": 642.0, "s_3": 1589.0}
        }
    }
]

print("Running baseline benchmark (200 calls each)...")
res_predict = bench_endpoint("http://localhost:8000/predict", method="POST", body=predict_body, count=200)
print(f"POST /predict: p50={res_predict['p50_ms']:.2f}ms, p95={res_predict['p95_ms']:.2f}ms, rps={res_predict['throughput_req_per_s']:.1f}")

res_logs = bench_endpoint("http://localhost:8000/logs", method="GET", count=200)
print(f"GET /logs: p50={res_logs['p50_ms']:.2f}ms, p95={res_logs['p95_ms']:.2f}ms, rps={res_logs['throughput_req_per_s']:.1f}")

res_ingest = bench_endpoint("http://localhost:8000/ingest", method="POST", body=ingest_body, count=200)
print(f"POST /ingest: p50={res_ingest['p50_ms']:.2f}ms, p95={res_ingest['p95_ms']:.2f}ms, rps={res_ingest['throughput_req_per_s']:.1f}")

summary = {
    "predict": res_predict,
    "logs": res_logs,
    "ingest": res_ingest,
    "timestamp": time.time()
}

with open(".sprint/pg/evidence/g0_baseline.json", "w") as f:
    json.dump(summary, f, indent=2)

print("Saved baseline to .sprint/pg/evidence/g0_baseline.json")
