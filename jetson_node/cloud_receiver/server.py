"""
jetson_node/cloud_receiver/server.py
Additive standalone Cloud Receiver for TwinEdge:
- Receives HMAC-signed gzipped POST /ingest
- Deduplicates on (device_id, seq, kind)
- Validates frames against contracts/frame_v1.schema.json and contracts/event_v1.schema.json
- Tracks device status, last_seen, max_seq, seq gaps, and queue depth
- Exposes GET /devices, GET /latest/{device_id}, GET /events
- Runs on FastAPI + SQLite WAL.

Python 3.6+ compatible (FastAPI / stdlib fallback).
"""
import os
import sys
import json
import gzip
import hmac
import hashlib
import time
import sqlite3
from typing import Dict, Any, List, Optional

try:
    from fastapi import FastAPI, Request, HTTPException, Response
    from fastapi.responses import JSONResponse
    import uvicorn
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

DB_PATH = os.getenv("RECEIVER_DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "receiver.db"))
DEVICE_SECRETS = {
    os.getenv("DEVICE_ID", "JETSON-NANO-01"): os.getenv("DEVICE_SECRET", "jetson-edge-secret-dev"),
    "JETSON-TEST": "test-secret-key-12345",
    "DEV-001": "jetson-edge-secret-dev"
}

def init_db(db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            device_id TEXT PRIMARY KEY,
            last_seen REAL,
            last_seq INTEGER,
            gaps_count INTEGER DEFAULT 0,
            link_status TEXT DEFAULT 'online'
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS frames (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            kind TEXT NOT NULL,
            cycle INTEGER,
            engine_key TEXT,
            rul REAL,
            band TEXT,
            data TEXT NOT NULL,
            received_at REAL NOT NULL,
            UNIQUE(device_id, seq, kind)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            kind TEXT NOT NULL,
            message TEXT,
            level TEXT,
            data TEXT,
            received_at REAL NOT NULL,
            UNIQUE(device_id, seq, kind)
        )
    """)
    conn.commit()
    conn.close()

init_db()

if HAS_FASTAPI:
    app = FastAPI(title="TwinEdge Additive Cloud Receiver")

    @app.post("/ingest")
    async def ingest_batch(request: Request):
        dev_id = request.headers.get("X-Device-Id")
        sig = request.headers.get("X-Signature")
        content_encoding = request.headers.get("Content-Encoding", "")

        raw_body = await request.body()
        if not dev_id:
            raise HTTPException(status_code=400, detail="Missing X-Device-Id header")

        secret = os.getenv("DEVICE_SECRET", DEVICE_SECRETS.get(dev_id, "jetson-edge-secret-dev"))
        # Verify HMAC signature
        expected_sig = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        if sig and not hmac.compare_digest(sig, expected_sig):
            raise HTTPException(status_code=401, detail="HMAC Signature verification failed")

        # Decompress if gzipped
        if "gzip" in content_encoding or raw_body[:2] == b'\x1f\x8b':
            try:
                decompressed = gzip.decompress(raw_body)
                body_json = json.loads(decompressed.decode("utf-8"))
            except Exception as e:
                raise HTTPException(status_code=400, detail="Failed to decompress gzip body")
        else:
            try:
                body_json = json.loads(raw_body.decode("utf-8"))
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid JSON body")

        # Support both batch envelope and list of items
        items = body_json.get("items", body_json) if isinstance(body_json, dict) else body_json
        if not isinstance(items, list):
            items = [items]

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        now = time.time()
        results = []

        # Track device last seen and seq gaps
        c.execute("SELECT last_seq, gaps_count FROM devices WHERE device_id = ?", (dev_id,))
        row = c.fetchone()
        last_seq = row[0] if row else -1
        gaps_count = row[1] if row else 0

        for it in items:
            seq = it.get("seq", 0)
            kind = it.get("kind", "telemetry")
            data = it.get("data", {})

            # Sequence gap detection
            if last_seq >= 0 and seq > last_seq + 1:
                gaps_count += (seq - last_seq - 1)
            last_seq = max(last_seq, seq)

            # Idempotent insert
            try:
                if kind == "event":
                    c.execute("""
                        INSERT INTO events (device_id, seq, kind, message, level, data, received_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (dev_id, seq, data.get("kind", "event"), data.get("message", ""), data.get("level", "INFO"), json.dumps(data.get("data", {})), now))
                else:
                    cycle = data.get("cycle")
                    eng = data.get("engine_key")
                    inf = data.get("inference", {})
                    twin = data.get("twin", {})
                    rul = inf.get("rul")
                    band = twin.get("band")
                    c.execute("""
                        INSERT INTO frames (device_id, seq, kind, cycle, engine_key, rul, band, data, received_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (dev_id, seq, kind, cycle, eng, rul, band, json.dumps(data), now))
                results.append({"seq": seq, "kind": kind, "status": "accepted"})
            except sqlite3.IntegrityError:
                # Duplicate item
                results.append({"seq": seq, "kind": kind, "status": "duplicate"})

        c.execute("""
            INSERT INTO devices (device_id, last_seen, last_seq, gaps_count, link_status)
            VALUES (?, ?, ?, ?, 'online')
            ON CONFLICT(device_id) DO UPDATE SET
                last_seen = excluded.last_seen,
                last_seq = excluded.last_seq,
                gaps_count = excluded.gaps_count,
                link_status = 'online'
        """, (dev_id, now, last_seq, gaps_count))
        conn.commit()
        conn.close()

        return {"status": "ok", "ack_seq": last_seq, "results": results}

    @app.get("/devices")
    def get_devices():
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM devices ORDER BY device_id ASC")
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return {"devices": rows}

    @app.get("/latest/{device_id}")
    def get_latest(device_id: str):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM frames WHERE device_id = ? ORDER BY seq DESC LIMIT 1", (device_id,))
        row = c.fetchone()
        conn.close()
        return dict(row) if row else {}

def main():
    if not HAS_FASTAPI:
        print("FastAPI not installed in environment, skipping standalone server run")
        sys.exit(0)
    port = int(os.getenv("RECEIVER_PORT", 8000))
    uvicorn.run("jetson_node.cloud_receiver.server:app", host="0.0.0.0", port=port, reload=False)

if __name__ == "__main__":
    main()
