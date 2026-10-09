import os
import unittest
import tempfile
import time
from jetson_node.node.storage import NodeStorage

class TestStorage(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.tmp_dir, "test_outbox.db")
        self.storage = NodeStorage(self.db_path, max_bytes=100 * 1024) # small 100 KB cap for tests

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_priority_ordering(self):
        # Enqueue telemetry (prio 3), prediction (prio 2), event (prio 1)
        self.storage.enqueue("DEV-1", 100, "telemetry", {"cyc": 1}, force_commit=True)
        self.storage.enqueue("DEV-1", 101, "prediction", {"rul": 110}, force_commit=True)
        self.storage.enqueue("DEV-1", 102, "event", {"kind": "alert_raised"}, force_commit=True)

        batch = self.storage.get_pending_batch(limit=10)
        self.assertEqual(len(batch), 3)
        # Event must be first
        self.assertEqual(batch[0]["kind"], "event")
        self.assertEqual(batch[0]["priority"], 1)
        # Prediction must be second
        self.assertEqual(batch[1]["kind"], "prediction")
        self.assertEqual(batch[1]["priority"], 2)
        # Telemetry must be third
        self.assertEqual(batch[2]["kind"], "telemetry")
        self.assertEqual(batch[2]["priority"], 3)

    def test_ack_and_quarantine(self):
        self.storage.enqueue("DEV-1", 1, "prediction", {"rul": 100}, force_commit=True)
        self.storage.enqueue("DEV-1", 2, "prediction", {"rul": 99}, force_commit=True)

        batch = self.storage.get_pending_batch(limit=10)
        p1 = batch[0]
        p2 = batch[1]

        # Ack p1 as accepted, p2 as rejected poison pill
        self.storage.ack_items(accepted_ids=[p1["id"]], rejected_with_reason=[(p2["id"], "schema_invalid")])

        stats = self.storage.get_stats()
        self.assertEqual(stats["outbox_depth"], 0)
        self.assertEqual(stats["quarantine_count"], 1)

    def test_enforce_cap_drops_telemetry_first_never_events(self):
        # Fill storage beyond cap
        for i in range(150):
            self.storage.enqueue("DEV-1", i, "telemetry", {"data": "x" * 1000}, force_commit=True)
        self.storage.enqueue("DEV-1", 999, "event", {"kind": "critical_event"}, force_commit=True)

        # Trigger cap check
        self.storage._enforce_size_cap()
        stats = self.storage.get_stats()
        self.assertGreater(stats["drop_count"], 0)

        # Event 999 must still exist
        batch = self.storage.get_pending_batch(limit=200)
        kinds = [item["kind"] for item in batch]
        self.assertIn("event", kinds)

if __name__ == "__main__":
    unittest.main()
