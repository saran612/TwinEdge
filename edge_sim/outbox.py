"""
Edge Node SQLite Outbox queue with priority, retry backoff, size cap, and drop policies.
"""
import sqlite3
import json
import time
import os
from typing import List, Dict, Any, Optional

PRIORITY_EVENTS = 1
PRIORITY_PREDICTIONS = 2
PRIORITY_TELEMETRY = 3

class OutboxQueue:
    def __init__(self, db_path: str, max_size_mb: float = 10.0):
        self.db_path = db_path
        self.max_bytes = max_size_mb * 1024 * 1024
        self._init_db()

    def _init_db(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL;")
        cursor = conn.cursor()
        
        # Outbox table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                kind TEXT NOT NULL,
                priority INTEGER NOT NULL,
                payload TEXT NOT NULL,
                attempts INTEGER DEFAULT 0,
                created_at REAL NOT NULL,
                UNIQUE(device_id, seq, kind)
            )
        """)
        
        # Drop stats counter table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS outbox_drop_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dropped_telemetry INTEGER DEFAULT 0,
                dropped_predictions INTEGER DEFAULT 0,
                timestamp REAL NOT NULL
            )
        """)
        
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_outbox_prio ON outbox(priority, id);")
        conn.commit()
        conn.close()

    def enqueue(self, device_id: str, seq: int, kind: str, priority: int, payload: Dict[str, Any]) -> bool:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            # Check size cap and drop oldest raw telemetry if needed
            self._enforce_size_cap(conn)
            
            cursor.execute("""
                INSERT OR IGNORE INTO outbox (device_id, seq, kind, priority, payload, attempts, created_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
            """, (device_id, seq, kind, priority, json.dumps(payload), time.time()))
            conn.commit()
            return True
        except Exception as e:
            print(f"Outbox enqueue error: {e}")
            return False
        finally:
            conn.close()

    def _enforce_size_cap(self, conn: sqlite3.Connection):
        try:
            db_size = os.path.getsize(self.db_path)
            if db_size > self.max_bytes:
                # Drop oldest raw telemetry first
                cursor = conn.cursor()
                cursor.execute("""
                    DELETE FROM outbox 
                    WHERE id IN (
                        SELECT id FROM outbox WHERE priority = ? ORDER BY id ASC LIMIT 50
                    )
                """, (PRIORITY_TELEMETRY,))
                dropped = cursor.rowcount
                if dropped > 0:
                    cursor.execute("""
                        INSERT INTO outbox_drop_stats (dropped_telemetry, timestamp)
                        VALUES (?, ?)
                    """, (dropped, time.time()))
                    conn.commit()
        except Exception:
            pass

    def peek_batch(self, batch_size: int = 20) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, device_id, seq, kind, priority, payload, attempts, created_at
            FROM outbox
            ORDER BY priority ASC, id ASC
            LIMIT ?
        """, (batch_size,))
        rows = cursor.fetchall()
        conn.close()

        items = []
        for r in rows:
            items.append({
                "id": r[0],
                "device_id": r[1],
                "seq": r[2],
                "kind": r[3],
                "priority": r[4],
                "payload": json.loads(r[5]),
                "attempts": r[6],
                "created_at": r[7]
            })
        return items

    def ack_batch(self, item_ids: List[int]):
        if not item_ids:
            return
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in item_ids)
        cursor.execute(f"DELETE FROM outbox WHERE id IN ({placeholders})", item_ids)
        conn.commit()
        conn.close()

    def record_attempt(self, item_ids: List[int]):
        if not item_ids:
            return
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in item_ids)
        cursor.execute(f"UPDATE outbox SET attempts = attempts + 1 WHERE id IN ({placeholders})", item_ids)
        conn.commit()
        conn.close()

    def get_stats(self) -> Dict[str, Any]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT count(*), min(seq), max(seq) FROM outbox")
        row = cursor.fetchone()
        cursor.execute("SELECT sum(dropped_telemetry) FROM outbox_drop_stats")
        drops = cursor.fetchone()[0] or 0
        conn.close()
        return {
            "queue_depth": row[0] or 0,
            "min_seq": row[1],
            "max_seq": row[2],
            "dropped_count": drops
        }
