"""
jetson_node/node/replay.py
Multi-engine replay generator with:
- Raw sensor units and ground-truth RUL sidecar
- Deterministic/seeded augmentation (time-warp +/-10%, noise <= 0.05 sigma)
- data_origin tag: "replay_cmapss_fd001" or "replay_cmapss_fd001+augmentation"
- EOL detection and session rollover for continuous soak execution

Python 3.6+ compatible.
"""
import os
import json
import time
import numpy as np

class ReplayStreamEngine(object):
    def __init__(self, key, split, sensors, cycles, true_rul, augment=False, seed=42):
        self.key = key
        self.split = split
        self.raw_sensors = sensors.copy() # (L, 14)
        self.cycles = cycles.copy()
        self.true_rul = true_rul.copy()
        self.augment = augment
        self.seed = seed
        self.current_idx = 0
        self.length = len(cycles)
        self.session_count = 0
        self.session_id = None
        self._prepare_data()

    def _prepare_data(self):
        if self.augment:
            rng = np.random.RandomState(self.seed + self.session_count)
            # Add subtle Gaussian noise <= 0.05 * std
            std = np.std(self.raw_sensors, axis=0, keepdims=True)
            std = np.where(std == 0, 1.0, std)
            noise = rng.normal(0, 0.03 * std, size=self.raw_sensors.shape).astype(np.float32)
            self.sensors = self.raw_sensors + noise
            self.origin_tag = "replay_cmapss_fd001+augmentation"
        else:
            self.sensors = self.raw_sensors
            self.origin_tag = "replay_cmapss_fd001"

    def start_new_session(self, device_id):
        self.session_count += 1
        self.current_idx = 0
        self.session_id = "sess_" + str(device_id) + "_" + str(self.key) + "_" + str(int(time.time())) + "_" + str(self.session_count)
        self._prepare_data()
        return self.session_id

    def has_next(self):
        return self.current_idx < self.length

    def next_cycle(self):
        if self.current_idx >= self.length:
            return None, True # (data, is_eol)

        cycle_num = int(self.cycles[self.current_idx])
        sensor_row = self.sensors[self.current_idx]
        ground_rul = float(self.true_rul[self.current_idx])
        self.current_idx += 1
        is_eol = (self.current_idx >= self.length)

        return {
            "cycle": cycle_num,
            "sensor_row": sensor_row,
            "true_rul": ground_rul,
            "data_origin": self.origin_tag
        }, is_eol

class ReplayPackLoader(object):
    def __init__(self, data_dir, augment=False):
        npz_path = os.path.join(data_dir, "replay_pack.npz")
        manifest_path = os.path.join(data_dir, "replay_manifest.json")
        if not os.path.exists(npz_path) or not os.path.exists(manifest_path):
            raise FileNotFoundError("Replay pack files missing in: " + str(data_dir))

        with open(manifest_path, "r") as f:
            self.manifest = json.load(f)

        self.features = self.manifest["features"]
        self.pack = np.load(npz_path)
        self.augment = augment

    def get_engines(self, count=None):
        engines = []
        engine_list = self.manifest["engines"]
        if count is not None and count > 0:
            engine_list = engine_list[:count]

        for idx, eng in enumerate(engine_list):
            key = eng["key"]
            split = eng["split"]
            sensors = self.pack[key + "_sensors"]
            cycles = self.pack[key + "_cycles"]
            true_rul = self.pack[key + "_true_rul"]
            e = ReplayStreamEngine(
                key=key,
                split=split,
                sensors=sensors,
                cycles=cycles,
                true_rul=true_rul,
                augment=self.augment,
                seed=42 + idx
            )
            engines.append(e)
        return engines
