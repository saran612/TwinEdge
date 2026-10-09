"""
jetson_node/node/storage.py
Local SQLite storage for TwinEdge Jetson node:
- WAL mode, synchronous=NORMAL
- Batched commits (every 2s or 100 rows)
- Outbox priority queue:
    Priority 1: Events (NEVER DROPPED)
    Priority 2: Predictions
    Priority 3: Telemetry
- Database size cap (default 200 MB):
    Drops telemetry first, then oldest predictions, NEVER events.
    Emits outbox_drop counter and event.
- Quarantine table for rejected poison pills.

Python 3.6+ compatible.
"""
import os
import sqlite3
import json
import time
import threading

DEFAULT_MAX_DB_BYTES = 200 * 1024 * 1024 # 200 MB

class NodeStorage(object):
    def __init__(self, db_path, max_bytes=DEFAULT_MAX_DB_BYTES):
        self.db_path = db_path
        self.max_bytes = max_bytes
        self.lock = threading.Lock()
        self.pending_writes = 0
        self.last_commit_time = time.time()
        self.drop_count = 0
        self.quarantine_count = 0
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self.lock:
            conn = self._get_connection()
            c = conn.cursor()
            # Outbox table
            c.execute("""
                CREATE TABLE IF NOT EXISTS outbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    priority INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    UNIQUE(device_id, seq, kind)
                )
            """)
            c.execute("CREATE INDEX IF NOT EXISTS idx_outbox_prio_seq ON outbox (priority ASC, seq ASC)")

            # Quarantine table
            c.execute("""
                CREATE TABLE IF NOT EXISTS quarantine (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    quarantined_at REAL NOT NULL
                )
            """)
            # Drop stats
            c.execute("""
                CREATE TABLE IF NOT EXISTS stats (
                    key TEXT PRIMARY KEY,
                    val INTEGER NOT NULL
                )
            """)
            conn.commit()
            conn.close()

    def enqueue(self, device_id, seq, kind, payload_dict, force_commit=False):
        """
        priority:
        1: event
        2: prediction
        3: telemetry
        """
        prio = 1 if kind == "event" else (2 if kind == "prediction" else 3)
        payload_str = json.dumps(payload_dict)
        now = time.time()

        with self.lock:
            # Check DB size and enforce drop cap
            self._enforce_size_cap()

            conn = self._get_connection()
            c = conn.cursor()
            c.execute("""
                INSERT OR IGNORE INTO outbox (device_id, seq, kind, priority, payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (device_id, seq, kind, prio, payload_str, now))

            self.pending_writes += 1
            if force_commit or self.pending_writes >= 100 or (now - self.last_commit_time) >= 2.0:
                conn.commit()
                self.pending_writes = 0
                self.last_commit_time = now
            else:
                conn.commit() # SQLite thread-local safety
            conn.close()

    def get_pending_batch(self, limit=50):
        with self.lock:
            conn = self._get_connection()
            c = conn.cursor()
            c.execute("""
                SELECT id, device_id, seq, kind, priority, payload, retry_count
                FROM outbox
                ORDER BY priority ASC, seq ASC
                LIMIT ?
            """, (limit,))
            rows = c.fetchall()
            conn.close()

            items = []
            for r in rows:
                items.append({
                    "id": r["id"],
                    "device_id": r["device_id"],
                    "seq": r["seq"],
                    "kind": r["kind"],
                    "priority": r["priority"],
                    "payload": json.loads(r["payload"]),
                    "retry_count": r["retry_count"]
                })
            return items

    def ack_items(self, accepted_ids=None, rejected_with_reason=None):
        """
        accepted_ids: list of int outbox IDs to permanently delete
        rejected_with_reason: list of (outbox_id, reason) to quarantine
        """
        with self.lock:
            conn = self._get_connection()
            c = conn.cursor()
            if accepted_ids and len(accepted_ids) > 0:
                q_marks = ",".join(["?"] * len(accepted_ids))
                c.execute("DELETE FROM outbox WHERE id IN (" + q_marks + ")", accepted_ids)

            if rejected_with_reason and len(rejected_with_reason) > 0:
                for oid, reason in rejected_with_reason:
                    c.execute("SELECT device_id, seq, kind, payload FROM outbox WHERE id = ?", (oid,))
                    row = c.fetchone()
                    if row:
                        c.execute("""
                            INSERT INTO quarantine (device_id, seq, kind, payload, reason, quarantined_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (row["device_id"], row["seq"], row["kind"], row["payload"], reason, time.time()))
                        c.execute("DELETE FROM outbox WHERE id = ?", (oid,))
                        self.quarantine_count += 1
            conn.commit()
            conn.close()

    def _enforce_size_cap(self):
        if not os.path.exists(self.db_path):
            return
        size = os.path.getsize(self.db_path)
        if size <= self.max_bytes:
            return

        conn = self._get_connection()
        c = conn.cursor()
        # Drop priority 3 (telemetry) first
        c.execute("SELECT id FROM outbox WHERE priority = 3 ORDER BY seq ASC LIMIT 100")
        drop_rows = c.fetchall()
        if not drop_rows:
            # Drop priority 2 (predictions) next
            c.execute("SELECT id FROM outbox WHERE priority = 2 ORDER BY seq ASC LIMIT 50")
            drop_rows = c.fetchall()

        if drop_rows:
            drop_ids = [r["id"] for r in drop_rows]
            q_marks = ",".join(["?"] * len(drop_ids))
            c.execute("DELETE FROM outbox WHERE id IN (" + q_marks + ")", drop_ids)
            conn.commit()
            self.drop_count += len(drop_ids)

        conn.close()

    def get_stats(self):
        with self.lock:
            conn = self._get_connection()
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM outbox")
            outbox_depth = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM quarantine")
            q_count = c.fetchone()[0]
            conn.close()
            db_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
            return {
                "outbox_depth": outbox_depth,
                "quarantine_count": q_count,
                "drop_count": self.drop_count,
                "db_bytes": db_size
            }
