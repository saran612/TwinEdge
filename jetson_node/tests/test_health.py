import unittest
import tempfile
from jetson_node.node.storage import NodeStorage
from jetson_node.node.health import DeviceHealthMonitor

class TestDeviceHealth(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.storage = NodeStorage(self.tmp_dir + "/health_test.db")
        self.monitor = DeviceHealthMonitor("JETSON-TEST", self.storage, interval_sec=0.1)

    def test_sample_all_does_not_crash(self):
        metrics = self.monitor.sample_all()
        self.assertIn("max_cpu_temp", metrics)
        self.assertIn("ram_used_mb", metrics)
        self.assertIn("clock_synced", metrics)
        self.assertIn("throttled", metrics)
        self.assertIsInstance(metrics["clock_synced"], bool)

    def test_health_heartbeat_enqueue(self):
        self.monitor.start()
        import time
        time.sleep(0.3)
        self.monitor.stop()

        stats = self.storage.get_stats()
        self.assertGreater(stats["outbox_depth"], 0)
        batch = self.storage.get_pending_batch(limit=10)
        self.assertEqual(batch[0]["kind"], "event")
        self.assertEqual(batch[0]["payload"]["kind"], "heartbeat")

if __name__ == "__main__":
    unittest.main()
