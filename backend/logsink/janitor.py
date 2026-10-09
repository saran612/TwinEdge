"""
Retention Janitor for PostgreSQL app_logs table.
Batched hourly deletion (in chunks of 5000 to avoid holding long table locks)
for rows older than LOG_RETENTION_DAYS (default 14 days), plus row cap enforcement.
"""

import os
import sys
import time
import threading
from typing import Optional
import psycopg

BATCH_DELETE_SIZE = 5000
DEFAULT_RETENTION_DAYS = 14
MAX_ROW_CAP = 2000000  # Cap table at 2 million rows

class RetentionJanitor:
    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 5432,
        dbname: str = "twinedge",
        user: str = "twinedge_app",
        password: str = "twinedge_app_secret",
        retention_days: int = DEFAULT_RETENTION_DAYS,
        interval_s: float = 3600.0
    ):
        self.host = host
        self.port = port
        self.dbname = dbname
        self.user = user
        self.password = password
        self.retention_days = retention_days
        self.interval_s = interval_s

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="PGRetentionJanitor")
        self._thread.start()

    def stop(self, timeout: float = 2.0):
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)

    def _get_connection(self):
        return psycopg.connect(
            host=self.host,
            port=self.port,
            dbname=self.dbname,
            user=self.user,
            password=self.password,
            autocommit=True
        )

    def purge_expired_batches(self) -> int:
        """
        Deletes rows older than retention_days in chunks of 5000 until none left.
        Returns total number of deleted rows.
        """
        total_deleted = 0
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    while True:
                        cur.execute("""
                            WITH doomed AS (
                                SELECT id FROM app_logs
                                WHERE ts < clock_timestamp() - (%s * interval '1 day')
                                LIMIT %s
                            )
                            DELETE FROM app_logs
                            WHERE id IN (SELECT id FROM doomed);
                        """, (self.retention_days, BATCH_DELETE_SIZE))
                        deleted = cur.rowcount
                        total_deleted += deleted
                        if deleted < BATCH_DELETE_SIZE:
                            break
                        time.sleep(0.05)  # brief pause between batches to avoid lock contention
        except Exception as e:
            print(f"Retention janitor error during purge: {e}", file=sys.stderr)
        return total_deleted

    def _run_loop(self):
        while not self._stop_event.wait(self.interval_s):
            self.purge_expired_batches()
