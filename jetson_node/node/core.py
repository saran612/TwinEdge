"""
jetson_node/node/core.py
Preprocessing, window buffering, OOD detection, health index, and K-cycle alert gating.

Python 3.6+ compatible.
"""
import time
import numpy as np

RUL_CAP = 125.0
ALERT_THRESHOLD_T = 60.0
ALERT_STREAK_K = 3

class WindowProcessor(object):
    """
    Maintains a 30-cycle sliding window for an engine stream.
    Applies StandardScaler: (x - mean) / scale.
    Front-pads with first cycle repeat when cycles < 30 (flagged WARMUP).
    """
    def __init__(self, scaler_mean, scaler_scale, window_size=30):
        self.scaler_mean = np.array(scaler_mean, dtype=np.float32)
        self.scaler_scale = np.array(scaler_scale, dtype=np.float32)
        self.window_size = window_size
        self.history = [] # list of 14-element float32 raw sensor arrays

    def reset(self):
        self.history = []

    def push(self, sensor_row):
        self.history.append(np.array(sensor_row, dtype=np.float32))
        if len(self.history) > self.window_size:
            self.history.pop(0)

    def get_window(self):
        """
        Returns:
            scaled_window: (1, 30, 14) np.float32
            warmup: bool
            ood_flags: list of strings
        """
        count = len(self.history)
        if count == 0:
            return None, True, []

        warmup = (count < self.window_size)
        if warmup:
            pad_len = self.window_size - count
            # Repeat first observed cycle
            pad = [self.history[0]] * pad_len
            raw_win = np.array(pad + self.history, dtype=np.float32)
        else:
            raw_win = np.array(self.history, dtype=np.float32)

        # Compute z-scores for OOD detection: |z| > 4.0
        z_scores = (raw_win[-1] - self.scaler_mean) / self.scaler_scale
        ood_flags = []
        for i, z in enumerate(z_scores):
            if abs(z) > 4.0:
                ood_flags.append("sensor_" + str(i) + "_z_" + str(round(float(z), 2)))

        # Standardize entire window
        scaled_win = (raw_win - self.scaler_mean) / self.scaler_scale
        return np.expand_dims(scaled_win, axis=0), warmup, ood_flags

class TwinHealthEngine(object):
    """
    Computes Health Index (0-100), operational band, and K-cycle alert streaks.
    T = 60.0, K = 3
    """
    def __init__(self, threshold_t=ALERT_THRESHOLD_T, streak_k=ALERT_STREAK_K):
        self.threshold_t = threshold_t
        self.streak_k = streak_k
        self.recent_ruls = [] # tracks up to streak_k recent predictions
        self.alert_state = "NONE" # NONE, PENDING, ALERT_RAISED
        self.k_count = 0
        self.pending_alert_emitted = False

    def reset(self):
        self.recent_ruls = []
        self.alert_state = "NONE"
        self.k_count = 0
        self.pending_alert_emitted = False

    def evaluate(self, raw_rul, warmup=False, ood_flags=None):
        """
        Returns:
            capped_rul: float
            health_index: int (0-100)
            band: str ("HEALTHY", "WARNING", "CRITICAL", "WARMUP", "unreliable_input")
            alert_dict: {"state": str, "k_count": int, "event_to_emit": str or None}
        """
        # Capping at 125.0
        rul = min(float(raw_rul), RUL_CAP)
        rul = max(rul, 0.0)

        # Health index linear mapping: 125 cycles -> 100%, 0 cycles -> 0%
        health_index = int(round((rul / RUL_CAP) * 100.0))
        health_index = max(0, min(100, health_index))

        # Band determination
        if ood_flags and len(ood_flags) > 0:
            band = "unreliable_input"
        elif warmup:
            band = "WARMUP"
        elif rul > self.threshold_t:
            band = "HEALTHY"
        elif rul > 25.0:
            band = "WARNING"
        else:
            band = "CRITICAL"

        # K-gate streak evaluation
        event_to_emit = None
        if not warmup:
            if rul <= self.threshold_t:
                self.k_count += 1
            else:
                self.k_count = 0

            if self.k_count == 0:
                if self.alert_state == "ALERT_RAISED":
                    # RUL recovered above T, alert superseded
                    self.alert_state = "NONE"
                    event_to_emit = "alert_superseded"
                else:
                    self.alert_state = "NONE"
            elif self.k_count < self.streak_k:
                self.alert_state = "PENDING"
            else: # self.k_count >= self.streak_k
                if self.alert_state != "ALERT_RAISED":
                    self.alert_state = "ALERT_RAISED"
                    event_to_emit = "alert_raised"

        return rul, health_index, band, {
            "state": self.alert_state,
            "k_count": self.k_count,
            "event_to_emit": event_to_emit
        }
