"""
Replay stream generator for NASA C-MAPSS FD001 dataset engines.
Produces deterministic sequence of frames with seed, rate, and fault scenarios.
"""
import json
import os
import random
import time
from typing import Dict, List, Optional, Any, Generator

# 14 active sensor feature names
SENSOR_NAMES = [
    "s_2", "s_3", "s_4", "s_7", "s_8", "s_9", "s_11",
    "s_12", "s_13", "s_14", "s_15", "s_17", "s_20", "s_21"
]

DATA_ORIGIN = "replay_cmapss_fd001"

class ReplayGenerator:
    def __init__(
        self,
        engine_key: str = "VAL-001",
        seed: int = 42,
        rate: float = 1.0, # cycles / second
        start_cycle: int = 30,
        on_end: str = "restart", # restart | stop | next
        scenario: str = "lifecycle", # lifecycle | degraded-start | steady
        fault_config: Optional[Dict[str, Any]] = None,
        dataset_path: Optional[str] = None
    ):
        self.engine_key = engine_key
        self.seed = seed
        self.rate = rate
        self.start_cycle = start_cycle
        self.on_end = on_end
        self.scenario = scenario
        self.fault_config = fault_config or {}
        
        # Seed PRNG for determinism
        random.seed(self.seed)
        
        # Load engine data
        if dataset_path is None:
            # Try repo relative path
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            dataset_path = os.path.join(base_dir, "frontend", "src", "offline", "replay_engines.json")
            
        with open(dataset_path, "r") as f:
            self.engines_data = json.load(f)
            
        self.active_engine = self._find_engine(self.engine_key)
        self.current_cycle = self.start_cycle
        self._init_scenario()

    def _find_engine(self, key: str) -> Dict[str, Any]:
        parts = key.split("-")
        prefix = parts[0]
        eid = int(parts[1]) if len(parts) > 1 else 1
        is_val = (prefix == "VAL")
        
        for eng in self.engines_data:
            eng_is_val = ("VALIDATION" in eng.get("split", ""))
            if eng["engine_id"] == eid and eng_is_val == is_val:
                return eng
        # Fallback to first engine
        return self.engines_data[0]

    def _init_scenario(self):
        total = self.active_engine["total_cycles"]
        if self.scenario == "degraded-start":
            # Start near true RUL ~ 70: cycle = total - 70
            self.current_cycle = max(30, total - 70)
        elif self.scenario == "steady":
            # Steady nominal early state
            self.current_cycle = min(self.start_cycle, 40)
        else:
            self.current_cycle = self.start_cycle

    def next_frame(self, seq: int, session_id: str, device_id: str) -> Optional[Dict[str, Any]]:
        total = self.active_engine["total_cycles"]
        
        if self.current_cycle > total:
            if self.on_end == "stop":
                return None
            elif self.on_end == "restart":
                self.current_cycle = self.start_cycle
            elif self.on_end == "next":
                # Advance to next available engine
                curr_idx = self.engines_data.index(self.active_engine)
                next_idx = (curr_idx + 1) % len(self.engines_data)
                self.active_engine = self.engines_data[next_idx]
                split_prefix = "VAL" if "VALIDATION" in self.active_engine["split"] else "TEST"
                self.engine_key = f"{split_prefix}-{int(self.active_engine['engine_id']):03d}"
                self.current_cycle = self.start_cycle

        idx = self.current_cycle - 1
        raw_sensors = list(self.active_engine["sensors"][idx])
        true_rul = float(self.active_engine["true_rul"][idx])
        split = "VAL" if "VALIDATION" in self.active_engine.get("split", "") else "TEST"

        # Apply fault injection if configured
        ood_flags = []
        if self.fault_config:
            f_type = self.fault_config.get("type")
            f_sensor = self.fault_config.get("sensor")
            f_mag = float(self.fault_config.get("magnitude", 0.0))
            if f_sensor in SENSOR_NAMES:
                s_idx = SENSOR_NAMES.index(f_sensor)
                if f_type == "bias":
                    raw_sensors[s_idx] += f_mag
                    ood_flags.append(f"FAULT_BIAS_{f_sensor}")
                elif f_type == "noise":
                    noise = random.gauss(0, f_mag)
                    raw_sensors[s_idx] += noise
                    ood_flags.append(f"FAULT_NOISE_{f_sensor}")
                elif f_type == "dropout":
                    raw_sensors[s_idx] = 0.0
                    ood_flags.append(f"FAULT_DROPOUT_{f_sensor}")

        sensors_dict = {name: round(val, 4) for name, val in zip(SENSOR_NAMES, raw_sensors)}

        # Window of up to 30 past cycles (front padded if cycle < 30)
        start_w = max(0, idx - 29)
        window = [list(self.active_engine["sensors"][i]) for i in range(start_w, idx + 1)]
        if len(window) < 30:
            pad_count = 30 - len(window)
            first_row = window[0] if window else [0.0] * 14
            window = [first_row] * pad_count + window

        frame = {
            "v": 1,
            "device_id": device_id,
            "session_id": session_id,
            "engine_key": self.engine_key,
            "split": split,
            "seq": seq,
            "cycle": self.current_cycle,
            "edge_ts": time.time(),
            "data_origin": DATA_ORIGIN,
            "sensors": sensors_dict,
            "raw_window": window,
            "ground_truth": {
                "true_rul": true_rul,
                "note": "REPLAY-GROUND-TRUTH"
            },
            "ood_flags": ood_flags,
            "is_eol": (self.current_cycle == total)
        }

        self.current_cycle += 1
        return frame
