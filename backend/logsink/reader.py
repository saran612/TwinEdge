import os
import sys
import time
import json
from typing import Optional, Dict, Any, List, Tuple
import psycopg
from psycopg_pool import ConnectionPool

from logsink.pipeline import name_to_level, level_to_name

class PostgresLogReader:
    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 5432,
        dbname: str = "twinedge",
        user: str = "twinedge_ro",
        password: str = "twinedge_ro_secret"
    ):
        self.host = host
        self.port = port
        self.dbname = dbname
        self.user = user
        self.password = password
        self._pool: Optional[ConnectionPool] = None
        self._init_pool()

    def _init_pool(self):
        try:
            conn_info = f"host={self.host} port={self.port} dbname={self.dbname} user={self.user} password={self.password} connect_timeout=2"
            self._pool = ConnectionPool(conn_info, min_size=1, max_size=4, timeout=2.0, open=True)
        except Exception:
            self._pool = None

    def is_healthy(self) -> bool:
        if not self._pool:
            self._init_pool()
        if not self._pool:
            return False
        try:
            with self._pool.connection(timeout=1.0) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
            return True
        except Exception:
            return False

    def query_logs(
        self,
        level: Optional[str] = None,
        source: Optional[str] = None,
        device: Optional[str] = None,
        engine: Optional[str] = None,
        q: Optional[str] = None,
        cursor_id: Optional[int] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Query app_logs using parameterized keyset pagination on (ts DESC, id DESC).
        No string concatenation used for queries.
        """
        if not self._pool:
            raise RuntimeError("Postgres connection pool not available")

        # Build parameterized query safely
        where_clauses = ["1=1"]
        params: List[Any] = []

        if level:
            lvl_num = name_to_level(level)
            where_clauses.append("level = %s")
            params.append(lvl_num)

        if source:
            where_clauses.append("source = %s")
            params.append(source)

        if device:
            where_clauses.append("device_id = %s")
            params.append(device)

        if engine:
            where_clauses.append("engine_key = %s")
            params.append(engine)

        if q:
            # Parameterized ILIKE
            where_clauses.append("(message ILIKE %s OR event ILIKE %s)")
            params.extend([f"%{q}%", f"%{q}%"])

        if cursor_id:
            where_clauses.append("id < %s")
            params.append(cursor_id)

        query = f"""
            SELECT id, ts, level, source, device_id, engine_key, session_id, event, message, data, trace_id, seq
            FROM app_logs
            WHERE {" AND ".join(where_clauses)}
            ORDER BY ts DESC, id DESC
            LIMIT %s;
        """
        params.append(limit)

        with self._pool.connection(timeout=2.0) as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                cols = [desc[0] for desc in cur.description]
                rows = cur.fetchall()

        results = []
        for r in rows:
            item = dict(zip(cols, r))
            # Format to contract compatible with frontend
            ts_val = item["ts"].timestamp() if hasattr(item["ts"], "timestamp") else time.time()
            results.append({
                "id": item["id"],
                "ts": ts_val,
                "level": level_to_name(item["level"]),
                "source": item["source"],
                "device_id": item["device_id"],
                "engine_key": item["engine_key"],
                "session_id": item["session_id"],
                "kind": item["event"],
                "event": item["event"],
                "message": item["message"],
                "data": item["data"],
                "trace_id": item["trace_id"],
                "seq": item["seq"],
                "store": "postgres"
            })
        return results

    def get_stats(self) -> Dict[str, Any]:
        """
        Returns counts by level and source in the last 1 hour.
        """
        if not self._pool:
            raise RuntimeError("Postgres connection pool not available")

        with self._pool.connection(timeout=2.0) as conn:
            with conn.cursor() as cur:
                # Level counts
                cur.execute("""
                    SELECT level, count(*)
                    FROM app_logs
                    WHERE ts >= clock_timestamp() - interval '1 hour'
                    GROUP BY level;
                """)
                by_level = {level_to_name(r[0]): r[1] for r in cur.fetchall()}

                # Source counts
                cur.execute("""
                    SELECT source, count(*)
                    FROM app_logs
                    WHERE ts >= clock_timestamp() - interval '1 hour'
                    GROUP BY source;
                """)
                by_source = {r[0]: r[1] for r in cur.fetchall()}

        return {
            "window": "1h",
            "by_level": by_level,
            "by_source": by_source
        }
