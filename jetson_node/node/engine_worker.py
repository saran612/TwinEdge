"""
jetson_node/node/engine_worker.py
Per-engine worker thread:
- Reads cycle from ReplayStreamEngine
- Sliding window (30) + front-padding (flagged WARMUP)
- Scale features with scaler.mean / scaler.scale
- Runtime inference ladder (predict_window)
- Measures latency with time.perf_counter()
- Twin health index (0-100) and operational band
- K-cycle alert streak gate (T=60, K=3)
- Emits late_cycle event if step duration exceeds cycle interval
- Enqueues telemetry, prediction, and event into NodeStorage
- EOL handling -> rolls over to a new engine session

Python 3.6+ compatible.
"""
import time
import threading
import uuid

from jetson_node.node.core import WindowProcessor, TwinHealthEngine

class EngineWorker(object):
    def __init__(self, device_id, boot_id, engine_stream, runtime, storage,
                 scaler_mean, scaler_scale, rate_hz=1.0, seq_generator=None):
        self.device_id = device_id
        self.boot_id = boot_id
        self.engine_stream = engine_stream
        self.runtime = runtime
        self.storage = storage
        self.rate_hz = rate_hz
        self.interval_sec = 1.0 / rate_hz if rate_hz > 0 else 1.0
        self.seq_generator = seq_generator

        self.window_proc = WindowProcessor(scaler_mean, scaler_scale, window_size=30)
        self.twin_engine = TwinHealthEngine(threshold_t=60.0, streak_k=3)

        self.running = False
        self.thread = None
        self.last_state = {
            "cycle": 0,
            "rul": 125.0,
            "latency_ms": 0.0,
            "band": "WARMUP",
            "alert_state": "NONE"
        }
        self.recent_events = []

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._run_loop, name="worker_" + str(self.engine_stream.key))
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)

    def _get_next_seq(self):
        if self.seq_generator:
            return self.seq_generator()
        return int(time.time() * 1000)

    def _record_event(self, event_dict):
        self.recent_events.append(event_dict)
        if len(self.recent_events) > 50:
            self.recent_events.pop(0)

    def _run_loop(self):
        sess_id = self.engine_stream.start_new_session(self.device_id)

        # Emit session_start event
        seq = self._get_next_seq()
        start_ev = {
            "v": 1,
            "device_id": self.device_id,
            "boot_id": self.boot_id,
            "session_id": sess_id,
            "engine_key": self.engine_stream.key,
            "seq": seq,
            "kind": "session_start",
            "message": "Replay stream session started",
            "edge_ts": time.time(),
            "level": "INFO",
            "data": {"engine": self.engine_stream.key, "split": self.engine_stream.split}
        }
        self.storage.enqueue(self.device_id, seq, "event", start_ev)
        self._record_event(start_ev)

        # Monotonic time scheduling to prevent drift
        next_deadline = time.monotonic()

        while self.running:
            step_start = time.perf_counter()
            data, is_eol = self.engine_stream.next_cycle()
            if data is None:
                # EOL reached -> emit EOL and rollover
                seq = self._get_next_seq()
                eol_ev = {
                    "v": 1,
                    "device_id": self.device_id,
                    "boot_id": self.boot_id,
                    "session_id": sess_id,
                    "engine_key": self.engine_stream.key,
                    "seq": seq,
                    "kind": "eol",
                    "message": "Engine run-to-failure cycle completed",
                    "edge_ts": time.time(),
                    "level": "INFO",
                    "data": {"engine": self.engine_stream.key}
                }
                self.storage.enqueue(self.device_id, seq, "event", eol_ev)
                self._record_event(eol_ev)

                # Reset state for next session
                self.window_proc.reset()
                self.twin_engine.reset()
                sess_id = self.engine_stream.start_new_session(self.device_id)
                continue

            cycle_num = data["cycle"]
            sensor_row = data["sensor_row"]
            true_rul = data["true_rul"]
            origin = data["data_origin"]

            # Push to window processor
            self.window_proc.push(sensor_row)
            scaled_win, is_warmup, ood_flags = self.window_proc.get_window()

            # Model inference
            t_inf_start = time.perf_counter()
            raw_rul = self.runtime.predict_window(scaled_win)
            inf_latency_ms = (time.perf_counter() - t_inf_start) * 1000.0

            # Twin state & K-gate evaluation
            rul, health_index, band, alert_info = self.twin_engine.evaluate(raw_rul, warmup=is_warmup, ood_flags=ood_flags)

            # Update worker state
            self.last_state = {
                "cycle": cycle_num,
                "rul": rul,
                "latency_ms": inf_latency_ms,
                "band": band,
                "alert_state": alert_info["state"]
            }

            now_ts = time.time()
            # 1. Telemetry row
            seq_telem = self._get_next_seq()
            sensors_dict = {
                "s_2": float(sensor_row[0]), "s_3": float(sensor_row[1]), "s_4": float(sensor_row[2]),
                "s_7": float(sensor_row[3]), "s_8": float(sensor_row[4]), "s_9": float(sensor_row[5]),
                "s_11": float(sensor_row[6]), "s_12": float(sensor_row[7]), "s_13": float(sensor_row[8]),
                "s_14": float(sensor_row[9]), "s_15": float(sensor_row[10]), "s_17": float(sensor_row[11]),
                "s_20": float(sensor_row[12]), "s_21": float(sensor_row[13])
            }
            frame_dict = {
                "v": 1,
                "device_id": self.device_id,
                "boot_id": self.boot_id,
                "session_id": sess_id,
                "engine_key": self.engine_stream.key,
                "split": self.engine_stream.split,
                "seq": seq_telem,
                "cycle": cycle_num,
                "edge_ts": now_ts,
                "clock_synced": True,
                "data_origin": origin,
                "sensors": sensors_dict,
                "ground_truth": {
                    "true_rul": true_rul,
                    "tag": "REPLAY-GROUND-TRUTH"
                },
                "inference": {
                    "site": "EDGE",
                    "runtime": self.runtime.name,
                    "rul": rul,
                    "latency_ms": round(inf_latency_ms, 3),
                    "model_sha": self.runtime.model_sha,
                    "warmup": is_warmup,
                    "ood_flags": ood_flags
                },
                "twin": {
                    "health_index": health_index,
                    "band": band
                },
                "alert": {
                    "state": alert_info["state"],
                    "k_count": alert_info["k_count"]
                }
            }
            self.storage.enqueue(self.device_id, seq_telem, "telemetry", frame_dict)

            # 2. Prediction row
            seq_pred = self._get_next_seq()
            self.storage.enqueue(self.device_id, seq_pred, "prediction", frame_dict)

            # 3. Alert event if triggered
            if alert_info["event_to_emit"]:
                seq_ev = self._get_next_seq()
                ev_kind = alert_info["event_to_emit"]
                msg = "Operational alert raised: RUL <= 60 for 3 cycles" if ev_kind == "alert_raised" else "Operational alert superseded: RUL recovered"
                al_ev = {
                    "v": 1,
                    "device_id": self.device_id,
                    "boot_id": self.boot_id,
                    "session_id": sess_id,
                    "engine_key": self.engine_stream.key,
                    "seq": seq_ev,
                    "kind": ev_kind,
                    "message": msg,
                    "edge_ts": now_ts,
                    "level": "WARN" if ev_kind == "alert_raised" else "INFO",
                    "data": {"rul": rul, "k_count": alert_info["k_count"]}
                }
                self.storage.enqueue(self.device_id, seq_ev, "event", al_ev)
                self._record_event(al_ev)

            # Check late cycle
            step_duration = time.perf_counter() - step_start
            if step_duration > self.interval_sec:
                seq_late = self._get_next_seq()
                late_ev = {
                    "v": 1,
                    "device_id": self.device_id,
                    "boot_id": self.boot_id,
                    "session_id": sess_id,
                    "engine_key": self.engine_stream.key,
                    "seq": seq_late,
                    "kind": "late_cycle",
                    "message": "Inference and processing exceeded interval",
                    "edge_ts": now_ts,
                    "level": "WARN",
                    "data": {"duration_sec": step_duration, "interval_sec": self.interval_sec}
                }
                self.storage.enqueue(self.device_id, seq_late, "event", late_ev)

            # Monotonic drift correction sleep
            next_deadline += self.interval_sec
            sleep_time = next_deadline - time.monotonic()
            if sleep_time > 0:
                time.sleep(sleep_time)
            else:
                # Drifted behind schedule, catch up deadline without accumulating past lag
                next_deadline = time.monotonic()
