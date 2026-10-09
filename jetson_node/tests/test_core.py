import unittest
import numpy as np
from jetson_node.node.core import WindowProcessor, TwinHealthEngine, RUL_CAP

class TestCoreComponents(unittest.TestCase):
    def setUp(self):
        self.mean = [642.0] * 14
        self.scale = [1.0] * 14
        self.proc = WindowProcessor(self.mean, self.scale, window_size=30)
        self.twin = TwinHealthEngine(threshold_t=60.0, streak_k=3)

    def test_window_warmup_padding(self):
        # Push 5 cycles
        for i in range(5):
            self.proc.push([642.0 + i] * 14)
        win, warmup, ood = self.proc.get_window()
        self.assertEqual(win.shape, (1, 30, 14))
        self.assertTrue(warmup)
        # Verify first 26 elements are padded repeats of row 0
        self.assertEqual(win[0, 0, 0], 0.0) # (642.0 - 642.0) / 1.0

    def test_window_full_and_ood(self):
        for i in range(30):
            self.proc.push([642.0] * 14)
        win, warmup, ood = self.proc.get_window()
        self.assertFalse(warmup)
        self.assertEqual(len(ood), 0)

        # Inject extreme outlier: 642.0 + 10.0 => z = 10.0 > 4.0
        self.proc.push([652.0] * 14)
        win, warmup, ood = self.proc.get_window()
        self.assertFalse(warmup)
        self.assertGreater(len(ood), 0)

    def test_k_gate_alert_streak(self):
        # Cycle 1: rul = 70 -> NONE
        rul, hi, band, alert = self.twin.evaluate(70.0)
        self.assertEqual(alert["state"], "NONE")
        self.assertEqual(alert["k_count"], 0)
        self.assertIsNone(alert["event_to_emit"])

        # Cycle 2: rul = 55 (below 60) -> PENDING (k=1)
        rul, hi, band, alert = self.twin.evaluate(55.0)
        self.assertEqual(alert["state"], "PENDING")
        self.assertEqual(alert["k_count"], 1)
        self.assertIsNone(alert["event_to_emit"])

        # Cycle 3: noisy recovery to 65 -> Resets to NONE
        rul, hi, band, alert = self.twin.evaluate(65.0)
        self.assertEqual(alert["state"], "NONE")
        self.assertEqual(alert["k_count"], 0)

        # Cycle 4, 5, 6: streak below 60 -> PENDING(1), PENDING(2), ALERT_RAISED(3)
        rul, hi, band, alert = self.twin.evaluate(58.0)
        self.assertEqual(alert["state"], "PENDING")
        self.assertEqual(alert["k_count"], 1)

        rul, hi, band, alert = self.twin.evaluate(57.0)
        self.assertEqual(alert["state"], "PENDING")
        self.assertEqual(alert["k_count"], 2)

        rul, hi, band, alert = self.twin.evaluate(56.0)
        self.assertEqual(alert["state"], "ALERT_RAISED")
        self.assertEqual(alert["k_count"], 3)
        self.assertEqual(alert["event_to_emit"], "alert_raised")

        # Cycle 7: recovery -> alert_superseded
        rul, hi, band, alert = self.twin.evaluate(62.0)
        self.assertEqual(alert["state"], "NONE")
        self.assertEqual(alert["event_to_emit"], "alert_superseded")

if __name__ == "__main__":
    unittest.main()
