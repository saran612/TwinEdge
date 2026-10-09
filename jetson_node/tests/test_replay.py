import os
import unittest
import numpy as np
from jetson_node.node.replay import ReplayPackLoader

class TestReplayPack(unittest.TestCase):
    def setUp(self):
        self.repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.data_dir = os.path.join(self.repo_root, "jetson_node", "data")

    def test_loader_manifest_and_engines(self):
        loader = ReplayPackLoader(self.data_dir, augment=False)
        engines = loader.get_engines()
        self.assertGreaterEqual(len(engines), 5)

        # Test first engine
        e0 = engines[0]
        sess_id = e0.start_new_session("TEST-DEV")
        self.assertTrue(sess_id.startswith("sess_TEST-DEV_"))

        cycles_read = 0
        while e0.has_next():
            data, is_eol = e0.next_cycle()
            self.assertIsNotNone(data)
            self.assertEqual(len(data["sensor_row"]), 14)
            self.assertEqual(data["data_origin"], "replay_cmapss_fd001")
            self.assertIn("true_rul", data)
            cycles_read += 1
            if is_eol:
                break
        self.assertEqual(cycles_read, e0.length)

        # Test session rollover
        sess_id_2 = e0.start_new_session("TEST-DEV")
        self.assertNotEqual(sess_id, sess_id_2)
        self.assertTrue(e0.has_next())

    def test_augmented_loader(self):
        loader = ReplayPackLoader(self.data_dir, augment=True)
        e = loader.get_engines(count=1)[0]
        e.start_new_session("TEST-DEV")
        data, _ = e.next_cycle()
        self.assertEqual(data["data_origin"], "replay_cmapss_fd001+augmentation")

if __name__ == "__main__":
    unittest.main()
