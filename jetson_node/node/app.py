"""
jetson_node/node/app.py
Main entrypoint for TwinEdge Jetson Node:
Orchestrates:
- Node startup, self-check & runtime canary
- SQLite WAL storage initialization
- Replay pack loading and per-engine worker threads
- Health monitor thread
- Uplink worker thread
- Local HTTP API server

Python 3.6+ compatible.
"""
import os
import sys
import time
import uuid
import threading
import argparse

from jetson_node.node.storage import NodeStorage
from jetson_node.node.runtime import select_runtime
from jetson_node.node.replay import ReplayPackLoader
from jetson_node.node.engine_worker import EngineWorker
from jetson_node.node.health import DeviceHealthMonitor
from jetson_node.node.uplink import UplinkClient
from jetson_node.node.local_api import LocalApiServer

class JetsonNodeApp(object):
    def __init__(self, device_id, device_secret, cloud_url,
                 model_dir, data_dir, db_path,
                 engines_count=3, rate_hz=1.0, bind_api="127.0.0.1", port_api=8088,
                 allow_insecure=False, ca_file=None, force_runtime=None):
        self.device_id = device_id
        self.device_secret = device_secret
        self.cloud_url = cloud_url
        self.model_dir = model_dir
        self.data_dir = data_dir
        self.db_path = db_path
        self.engines_count = engines_count
        self.rate_hz = rate_hz
        self.bind_api = bind_api
        self.port_api = port_api
        self.allow_insecure = allow_insecure
        self.ca_file = ca_file
        self.force_runtime = force_runtime

        self.boot_id = "boot_" + str(uuid.uuid4())[:8]
        self.storage = None
        self.runtime = None
        self.workers = []
        self.health_monitor = None
        self.uplink = None
        self.api_server = None
        self.running = False

        self._seq_counter = 0
        self._seq_lock = threading.Lock()

    def _next_seq(self):
        with self._seq_lock:
            self._seq_counter += 1
            return self._seq_counter

    def setup(self):
        print("=== Initializing TwinEdge Jetson Node ===")
        print("Device ID: " + str(self.device_id) + " | Boot ID: " + str(self.boot_id))

        # 1. Initialize SQLite WAL storage
        self.storage = NodeStorage(self.db_path)
        print("SQLite storage initialized at: " + str(self.db_path))

        # 2. Select runtime and execute canary self-test
        print("Evaluating runtime ladder & executing canary self-test...")
        self.runtime = select_runtime(self.model_dir, force_runtime=self.force_runtime)
        print("Runtime selected: " + str(self.runtime.name) + " (SHA: " + str(self.runtime.model_sha[:16]) + "...)")

        # 3. Load Replay Pack
        loader = ReplayPackLoader(self.data_dir, augment=False)
        engines = loader.get_engines(count=self.engines_count)
        print("Loaded " + str(len(engines)) + " engine replay streams.")

        # Load scaler metadata from edge_model.npz or JSON
        npz_data = self.runtime.scaler_mean if hasattr(self.runtime, "scaler_mean") else None
        if npz_data is None:
            import numpy as np
            npz = np.load(os.path.join(self.model_dir, "edge_model.npz"))
            scaler_mean = npz["scaler_mean"]
            scaler_scale = npz["scaler_scale"]
        else:
            scaler_mean = self.runtime.scaler_mean
            scaler_scale = self.runtime.scaler_scale

        # 4. Initialize engine workers
        for eng in engines:
            worker = EngineWorker(
                device_id=self.device_id,
                boot_id=self.boot_id,
                engine_stream=eng,
                runtime=self.runtime,
                storage=self.storage,
                scaler_mean=scaler_mean,
                scaler_scale=scaler_scale,
                rate_hz=self.rate_hz,
                seq_generator=self._next_seq
            )
            self.workers.append(worker)

        # 5. Initialize device health monitor
        self.health_monitor = DeviceHealthMonitor(self.device_id, self.storage, interval_sec=10.0)

        # 6. Initialize uplink client
        if self.cloud_url:
            self.uplink = UplinkClient(
                cloud_url=self.cloud_url,
                device_id=self.device_id,
                device_secret=self.device_secret,
                storage=self.storage,
                batch_size=50,
                allow_insecure=self.allow_insecure,
                ca_file=self.ca_file
            )

        # 7. Initialize local HTTP API
        self.api_server = LocalApiServer(self, bind_addr=self.bind_api, port=self.port_api)

    def start(self):
        self.running = True
        if self.api_server:
            self.api_server.start()
            print("Local HTTP API listening on http://" + str(self.bind_api) + ":" + str(self.port_api))

        if self.health_monitor:
            self.health_monitor.start()

        if self.uplink:
            self.uplink.start()
            print("Uplink client connecting to: " + str(self.cloud_url))

        for w in self.workers:
            w.start()
        print("All " + str(len(self.workers)) + " engine worker threads running.")

    def stop(self):
        print("\nStopping Jetson Node...")
        self.running = False
        for w in self.workers:
            w.stop()
        if self.health_monitor:
            self.health_monitor.stop()
        if self.uplink:
            self.uplink.stop()
        if self.api_server:
            self.api_server.stop()
        print("Node shutdown complete.")

    def get_engines_state(self):
        states = {}
        for w in self.workers:
            states[w.engine_stream.key] = w.last_state
        return states

    def get_recent_events(self, since=0):
        evs = []
        for w in self.workers:
            for ev in w.recent_events:
                if ev.get("edge_ts", 0) >= since:
                    evs.append(ev)
        return sorted(evs, key=lambda x: x.get("edge_ts", 0))

def main():
    parser = argparse.ArgumentParser(description="TwinEdge Jetson Edge Node Runner")
    parser.add_argument("--device-id", default=os.getenv("DEVICE_ID", "JETSON-NANO-01"))
    parser.add_argument("--device-secret", default=os.getenv("DEVICE_SECRET", "jetson-edge-secret-dev"))
    parser.add_argument("--cloud-url", default=os.getenv("CLOUD_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--model-dir", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "model"))
    parser.add_argument("--data-dir", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
    parser.add_argument("--db-path", default=os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "outbox.db")))
    parser.add_argument("--engines", type=int, default=int(os.getenv("ENGINES", 3)))
    parser.add_argument("--rate", type=float, default=float(os.getenv("RATE", 1.0)))
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8088)
    parser.add_argument("--allow-insecure", action="store_true")
    parser.add_argument("--ca-file", default=None)
    parser.add_argument("--runtime", default=None, choices=["numpy_pure", "onnxruntime", "tflite"])

    args = parser.parse_args()

    app = JetsonNodeApp(
        device_id=args.device_id,
        device_secret=args.device_secret,
        cloud_url=args.cloud_url,
        model_dir=args.model_dir,
        data_dir=args.data_dir,
        db_path=args.db_path,
        engines_count=args.engines,
        rate_hz=args.rate,
        bind_api=args.bind,
        port_api=args.port,
        allow_insecure=args.allow_insecure or args.cloud_url.startswith("http://127.0.0.1"),
        ca_file=args.ca_file,
        force_runtime=args.runtime
    )
    app.setup()
    app.start()

    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        app.stop()

if __name__ == "__main__":
    main()
