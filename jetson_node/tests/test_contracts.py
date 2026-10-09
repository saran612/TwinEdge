import os
import json
import unittest

class TestContractsAndSchemas(unittest.TestCase):
    def setUp(self):
        self.repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.frame_schema_path = os.path.join(self.repo_root, "contracts", "frame_v1.schema.json")
        self.event_schema_path = os.path.join(self.repo_root, "contracts", "event_v1.schema.json")
        self.batch_schema_path = os.path.join(self.repo_root, "contracts", "batch_v1.schema.json")
        
        with open(self.frame_schema_path, "r") as f:
            self.frame_schema = json.load(f)
        with open(self.event_schema_path, "r") as f:
            self.event_schema = json.load(f)
        with open(self.batch_schema_path, "r") as f:
            self.batch_schema = json.load(f)

    def test_golden_frame_matches_schema(self):
        golden_frame = {
            "v": 1,
            "device_id": "JETSON-01",
            "boot_id": "boot-123456",
            "session_id": "sess-JETSON-01-001",
            "engine_key": "VAL-001",
            "split": "VAL",
            "seq": 100,
            "cycle": 45,
            "edge_ts": 1728400010.5,
            "clock_synced": True,
            "data_origin": "replay_cmapss_fd001",
            "sensors": {
                "s_2": 642.15, "s_3": 1588.42, "s_4": 1400.12, "s_7": 553.85,
                "s_8": 2388.08, "s_9": 9052.11, "s_11": 47.35, "s_12": 521.68,
                "s_13": 2388.05, "s_14": 8132.88, "s_15": 8.419, "s_17": 392.0,
                "s_20": 38.85, "s_21": 23.35
            },
            "ground_truth": {
                "true_rul": 112.0,
                "tag": "REPLAY-GROUND-TRUTH"
            },
            "inference": {
                "site": "EDGE",
                "runtime": "numpy_pure",
                "rul": 118.5,
                "latency_ms": 1.25,
                "model_sha": "032c3efa3156470e5ef7a3f31eb574d2830d4ff473625b6be814a05c0f1a1b7b",
                "warmup": False,
                "ood_flags": []
            },
            "twin": {
                "health_index": 95,
                "band": "HEALTHY"
            },
            "alert": {
                "state": "NONE",
                "k_count": 0
            }
        }
        
        # Validate required properties manually or via jsonschema if present
        try:
            import jsonschema
            jsonschema.validate(instance=golden_frame, schema=self.frame_schema)
        except ImportError:
            # Fallback manual validation for pure Python stdlib
            for req in self.frame_schema["required"]:
                self.assertIn(req, golden_frame)
            self.assertEqual(golden_frame["v"], 1)
            self.assertEqual(golden_frame["inference"]["site"], "EDGE")

    def test_golden_event_matches_schema(self):
        golden_event = {
            "v": 1,
            "device_id": "JETSON-01",
            "boot_id": "boot-123456",
            "session_id": "sess-JETSON-01-001",
            "engine_key": "VAL-001",
            "seq": 101,
            "kind": "alert_raised",
            "message": "Critical RUL threshold breached: K=3 cycles below T=60",
            "edge_ts": 1728400011.0,
            "level": "WARN",
            "data": {
                "rul": 58.2,
                "threshold": 60,
                "k_count": 3
            }
        }
        try:
            import jsonschema
            jsonschema.validate(instance=golden_event, schema=self.event_schema)
        except ImportError:
            for req in self.event_schema["required"]:
                self.assertIn(req, golden_event)
            self.assertEqual(golden_event["kind"], "alert_raised")

if __name__ == "__main__":
    unittest.main()
