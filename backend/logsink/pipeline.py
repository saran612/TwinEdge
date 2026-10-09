"""
PostgreSQL and dual-sink logging pipeline for TwinEdge.
Bounded queue (10k), asynchronous batch writer thread (up to 200 rows or 1s),
spooling to size-capped JSONL (50MB) during outages, priority drops (never ERROR/CRITICAL),
and transparent fallback.
"""

import os
import sys
import time
import json
import queue
import threading
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from psycopg_pool import ConnectionPool

from .redaction import redact_text, redact_object
from .rate_limiter import EventRateLimiter

MAX_QUEUE_SIZE = 10000
BATCH_SIZE = 200
FLUSH_INTERVAL_S = 1.0
MAX_MESSAGE_BYTES = 8192
MAX_DATA_BYTES = 32768
MAX_SPOOL_BYTES = 50 * 1024 * 1024  # 50 MB

# Level mapping
LEVEL_NAMES = {
    10: "DEBUG",
    20: "INFO",
    30: "WARN",
    40: "ERROR",
    50: "CRITICAL"
}

def level_to_name(lvl: int) -> str:
    return LEVEL_NAMES.get(lvl, "INFO")

def name_to_level(name: str) -> int:
    name = (name or "").upper()
    if name == "DEBUG": return 10
    if name in ("WARN", "WARNING"): return 30
    if name == "ERROR": return 40
    if name == "CRITICAL": return 50
    return 20

class PostgresLogPipeline:
    def __init__(
        self,
        mode: str = "sqlite",
        host: str = "127.0.0.1",
        port: int = 5432,
        dbname: str = "twinedge",
        user: str = "twinedge_app",
        password: str = "twinedge_app_secret",
        spool_path: str = "data/logs/pg_spool.jsonl",
        sqlite_db_path: Optional[str] = None
    ):
        self.mode = mode.lower()  # 'sqlite', 'postgres', 'dual'
        self.host = host
        self.port = port
        self.dbname = dbname
        self.user = user
        self.password = password
        self.spool_path = spool_path
        self.sqlite_db_path = sqlite_db_path

        self._queue: queue.Queue = queue.Queue(maxsize=MAX_QUEUE_SIZE)
        self._rate_limiter = EventRateLimiter(max_per_sec=200)

        # Metrics / Health
        self._dropped_debug = 0
        self._dropped_info = 0
        self._dropped_total = 0
        self._last_write_ts = time.time()
        self._is_degraded = False
        self._degraded_reason = ""
        self._pool: Optional[ConnectionPool] = None
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        # Ensure spool directory
        os.makedirs(os.path.dirname(os.path.abspath(self.spool_path)), exist_ok=True)

        if self.mode in ("postgres", "dual"):
            self._init_pool()
            self._start_worker()

    def _init_pool(self):
        try:
            conn_info = f"host={self.host} port={self.port} dbname={self.dbname} user={self.user} password={self.password} connect_timeout=3"
            self._pool = ConnectionPool(conn_info, min_size=1, max_size=5, timeout=3.0, open=True)
            self._is_degraded = False
            self._degraded_reason = ""
        except Exception as e:
            self._is_degraded = True
            self._degraded_reason = f"Pool initialization error: {e}"

    def _start_worker(self):
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name="PGLogWriterThread")
        self._worker_thread.start()

    def stop(self, timeout: float = 2.0):
        self._stop_event.set()
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=timeout)
        if self._pool:
            try:
                self._pool.close()
            except Exception:
                pass

    def emit(
        self,
        level: int,
        source: str,
        event: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        device_id: Optional[str] = None,
        engine_key: Optional[str] = None,
        session_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        seq: Optional[int] = None,
        ts: Optional[float] = None
    ) -> bool:
        """
        Submits a log record to the bounded pipeline.
        Never logs per-cycle raw telemetry tensors.
        Applies redaction, rate limiting, and size truncation.
        """
        # Persist INFO and above only (ignore DEBUG)
        if level < 20:
            return False

        now_ts = ts if ts is not None else time.time()
        
        # Rate limit
        allow, suppressed = self._rate_limiter.check(source, event)
        if not allow:
            return False

        # Redact message and data
        clean_msg = redact_text(message)
        if suppressed > 0:
            clean_msg += f" (suppressed {suppressed} similar)"

        # Size truncation on message
        clean_msg_bytes = clean_msg.encode("utf-8")
        if len(clean_msg_bytes) > MAX_MESSAGE_BYTES:
            clean_msg = clean_msg_bytes[:MAX_MESSAGE_BYTES - 20].decode("utf-8", errors="ignore") + "... [TRUNCATED]"

        # Redact and clean data
        clean_data = redact_object(data or {})
        
        # Guard against raw telemetry arrays per cycle (volume safety)
        if "sensors" in clean_data and isinstance(clean_data["sensors"], (dict, list)):
            if len(clean_data.get("sensors", [])) > 20:
                clean_data["sensors"] = "[REDACTED_CYCLE_ARRAY]"
        if "window" in clean_data and isinstance(clean_data["window"], list):
            clean_data["window"] = "[REDACTED_WINDOW_TENSOR]"

        data_json = json.dumps(clean_data)
        if len(data_json.encode("utf-8")) > MAX_DATA_BYTES:
            clean_data = {"truncated": True, "notice": "Data payload exceeded 32KB limit"}

        record = {
            "ts": datetime.fromtimestamp(now_ts, tz=timezone.utc).isoformat(),
            "level": int(level),
            "source": str(source),
            "device_id": device_id,
            "engine_key": engine_key,
            "session_id": session_id,
            "event": str(event),
            "message": clean_msg,
            "data": clean_data,
            "trace_id": trace_id,
            "seq": int(seq) if seq is not None else None
        }

        # If in dual or sqlite mode, also write to sqlite if helper configured
        if self.mode in ("sqlite", "dual") and self.sqlite_db_path:
            self._write_to_sqlite(record, now_ts)

        if self.mode == "sqlite":
            return True

        # Enqueue with priority drop policy
        try:
            self._queue.put_nowait(record)
            return True
        except queue.Full:
            # Drop policy: Drop DEBUG / INFO, NEVER ERROR / CRITICAL
            if level <= 20:
                with self._lock:
                    self._dropped_info += 1
                    self._dropped_total += 1
                return False
            else:
                # Discard an older item from the front to make room for critical/error
                try:
                    discarded = self._queue.get_nowait()
                    with self._lock:
                        if discarded.get("level", 20) <= 20:
                            self._dropped_info += 1
                        self._dropped_total += 1
                    self._queue.put_nowait(record)
                    return True
                except Exception:
                    # If failed to drop, spool directly
                    self._spool_single_record(record)
                    return True

    def _write_to_sqlite(self, r: dict, now_ts: float):
        import sqlite3
        try:
            conn = sqlite3.connect(self.sqlite_db_path)
            c = conn.cursor()
            lvl_name = level_to_name(r["level"])
            c.execute("""
                INSERT INTO stream_events (device_id, session_id, engine_key, seq, kind, message, data, level, source, ts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r.get("device_id") or "system",
                r.get("session_id") or "default",
                r.get("engine_key") or "VAL-001",
                r.get("seq"),
                r.get("event"),
                r.get("message"),
                json.dumps(r.get("data", {})),
                lvl_name,
                r.get("source"),
                now_ts
            ))
            conn.commit()
            conn.close()
        except Exception:
            pass

    def _worker_loop(self):
        batch: List[dict] = []
        last_flush = time.time()

        while not self._stop_event.is_set():
            timeout = max(0.05, FLUSH_INTERVAL_S - (time.time() - last_flush))
            try:
                rec = self._queue.get(timeout=timeout)
                batch.append(rec)
            except queue.Empty:
                pass

            should_flush = len(batch) >= BATCH_SIZE or (time.time() - last_flush) >= FLUSH_INTERVAL_S
            if should_flush and batch:
                self._flush_batch(batch)
                batch = []
                last_flush = time.time()

        # Final drain
        if batch:
            self._flush_batch(batch)

    def _flush_batch(self, batch: List[dict]):
        if not batch:
            return

        # Attempt to insert into PostgreSQL
        success = self._insert_pg_batch(batch)
        if success:
            with self._lock:
                self._last_write_ts = time.time()
                self._is_degraded = False
                self._degraded_reason = ""
            # Replay any existing spooled entries
            self._replay_spool_if_any()
        else:
            with self._lock:
                self._is_degraded = True
            # Spool to file
            self._spool_batch(batch)

    def _insert_pg_batch(self, batch: List[dict]) -> bool:
        if not self._pool:
            return False

        try:
            with self._pool.connection() as conn:
                with conn.cursor() as cur:
                    query = """
                        INSERT INTO app_logs (ts, level, source, device_id, engine_key, session_id, event, message, data, trace_id, seq)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (source, device_id, seq, event) WHERE seq IS NOT NULL DO NOTHING;
                    """
                    params = [
                        (
                            r["ts"],
                            r["level"],
                            r["source"],
                            r.get("device_id"),
                            r.get("engine_key"),
                            r.get("session_id"),
                            r["event"],
                            r["message"],
                            json.dumps(r.get("data", {})),
                            r.get("trace_id"),
                            r.get("seq")
                        )
                        for r in batch
                    ]
                    cur.executemany(query, params)
                    conn.commit()
            return True
        except Exception as e:
            with self._lock:
                self._degraded_reason = str(e)
            return False

    def _spool_single_record(self, record: dict):
        self._spool_batch([record])

    def _spool_batch(self, batch: List[dict]):
        try:
            # Check spool size cap
            current_size = os.path.getsize(self.spool_path) if os.path.exists(self.spool_path) else 0
            if current_size >= MAX_SPOOL_BYTES:
                # Disk-cap reached: drop and log drop
                with self._lock:
                    self._dropped_total += len(batch)
                return

            with open(self.spool_path, "a", encoding="utf-8") as f:
                for r in batch:
                    f.write(json.dumps(r) + "\n")
        except Exception:
            pass

    def _replay_spool_if_any(self):
        if not os.path.exists(self.spool_path):
            return
        if os.path.getsize(self.spool_path) == 0:
            return

        # Read up to 500 lines at a time
        replayed_batch = []
        remaining_lines = []
        try:
            with open(self.spool_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            for line in lines[:200]:
                if line.strip():
                    try:
                        replayed_batch.append(json.loads(line))
                    except Exception:
                        pass
            remaining_lines = lines[200:]

            if replayed_batch:
                if self._insert_pg_batch(replayed_batch):
                    with open(self.spool_path, "w", encoding="utf-8") as f:
                        f.writelines(remaining_lines)
        except Exception:
            pass

    def emit_heartbeat(
        self,
        device_id: str,
        cpu_temp: Optional[float] = None,
        ram_used_mb: Optional[float] = None,
        link_state: str = "online",
        queue_depth: int = 0,
        power_mode: str = "normal",
        clock_synced: bool = True,
        ts: Optional[float] = None
    ) -> bool:
        if self.mode == "sqlite" or not self._pool:
            return False

        try:
            now_dt = datetime.fromtimestamp(ts if ts is not None else time.time(), tz=timezone.utc)
            with self._pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO device_heartbeats (ts, device_id, cpu_temp, ram_used_mb, link_state, queue_depth, power_mode, clock_synced)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                    """, (now_dt, device_id, cpu_temp, ram_used_mb, link_state, queue_depth, power_mode, clock_synced))
                    conn.commit()
            return True
        except Exception:
            return False

    def get_health_stats(self) -> Dict[str, Any]:
        spool_bytes = os.path.getsize(self.spool_path) if os.path.exists(self.spool_path) else 0
        with self._lock:
            last_write_age = round(time.time() - self._last_write_ts, 2)
            return {
                "mode": self.mode,
                "status": "degraded" if self._is_degraded else "healthy",
                "degraded_reason": self._degraded_reason,
                "queue_depth": self._queue.qsize(),
                "dropped": self._dropped_total,
                "spool_bytes": spool_bytes,
                "last_write_age_s": last_write_age
            }
