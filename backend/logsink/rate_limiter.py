import time
from typing import Dict, Tuple

class EventRateLimiter:
    """
    Per-(source, event) rate limiter.
    Limits to max_per_sec events per second per key.
    Counts suppressed occurrences and reports them.
    """
    def __init__(self, max_per_sec: int = 100, window_s: float = 1.0):
        self.max_per_sec = max_per_sec
        self.window_s = window_s
        # (source, event) -> [window_start, count, suppressed]
        self._state: Dict[Tuple[str, str], Tuple[float, int, int]] = {}

    def check(self, source: str, event: str) -> Tuple[bool, int]:
        """
        Returns (allow: bool, suppressed_count: int).
        If returning allow=True and suppressed_count > 0, callers can append
        'suppressed N similar' notice.
        """
        now = time.time()
        key = (source, event)
        record = self._state.get(key)

        if not record or (now - record[0]) >= self.window_s:
            prev_suppressed = record[2] if record else 0
            self._state[key] = (now, 1, 0)
            return True, prev_suppressed

        win_start, count, suppressed = record
        if count < self.max_per_sec:
            self._state[key] = (win_start, count + 1, suppressed)
            return True, 0
        else:
            self._state[key] = (win_start, count, suppressed + 1)
            return False, suppressed + 1
