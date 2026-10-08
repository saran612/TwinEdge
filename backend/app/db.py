import os
import sqlite3
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "db.sqlite3"))
GENESIS_PREV_HASH = "0" * 64

def compute_audit_hash(prev_hash: str, alert_id: str, engine_id: int, cycle: int, action: str, reviewer_id: str, predicted_rul: float, notes: str, timestamp: str) -> str:
    canonical_str = f"{prev_hash}|{alert_id}|{engine_id}|{cycle}|{action}|{reviewer_id}|{predicted_rul:.4f}|{notes or ''}|{timestamp}"
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    cursor = conn.cursor()
    
    # 1. Existing Alerts table + non-destructive column additions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            engine_id INTEGER NOT NULL,
            cycle INTEGER NOT NULL,
            rul_prediction REAL NOT NULL,
            anomaly_flag INTEGER NOT NULL,
            status TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            notes TEXT,
            signoff_time TEXT
        )
    """)
    alert_cols = [r[1] for r in cursor.execute("PRAGMA table_info(alerts)").fetchall()]
    if "session_id" not in alert_cols:
        cursor.execute("ALTER TABLE alerts ADD COLUMN session_id TEXT DEFAULT 'legacy'")
    if "device_id" not in alert_cols:
        cursor.execute("ALTER TABLE alerts ADD COLUMN device_id TEXT DEFAULT 'legacy'")
    if "engine_key" not in alert_cols:
        cursor.execute("ALTER TABLE alerts ADD COLUMN engine_key TEXT DEFAULT 'VAL-001'")

    # Non-destructive migration of stale pre-existing alerts:
    cursor.execute("""
        UPDATE alerts 
        SET session_id = 'legacy', status = 'ARCHIVED'
        WHERE session_id = 'legacy' AND status = 'PENDING'
    """)

    # 2. Devices registry table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            device_id TEXT PRIMARY KEY,
            engine_key TEXT NOT NULL,
            session_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            inference_site TEXT NOT NULL,
            link_status TEXT NOT NULL,
            last_seen REAL NOT NULL,
            last_seq INTEGER NOT NULL,
            queue_depth INTEGER DEFAULT 0,
            model_sha TEXT,
            model_sha_match INTEGER DEFAULT 1
        )
    """)

    # 3. Stream Sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            engine_key TEXT NOT NULL,
            start_time REAL NOT NULL,
            end_time REAL,
            status TEXT NOT NULL
        )
    """)

    # 4. Canonical Ingested Telemetry table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stream_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            engine_key TEXT NOT NULL,
            seq INTEGER NOT NULL,
            cycle INTEGER NOT NULL,
            edge_ts REAL NOT NULL,
            sensors TEXT NOT NULL,
            ground_truth TEXT,
            UNIQUE(device_id, seq)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_eng_sess ON stream_telemetry(engine_key, session_id, cycle);")

    # 5. Predictions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stream_predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            engine_key TEXT NOT NULL,
            seq INTEGER NOT NULL,
            cycle INTEGER NOT NULL,
            site TEXT NOT NULL,
            rul_pred REAL NOT NULL,
            latency_ms REAL,
            health_index INTEGER,
            band TEXT,
            ts REAL NOT NULL,
            UNIQUE(device_id, session_id, cycle)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pred_eng_sess ON stream_predictions(engine_key, session_id, cycle);")

    # 6. Stream Events & Logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stream_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            engine_key TEXT NOT NULL,
            seq INTEGER,
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            data TEXT,
            level TEXT DEFAULT 'INFO',
            source TEXT DEFAULT 'edge',
            ts REAL NOT NULL
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_ts ON stream_events(ts DESC);")

    # 7. Audit trail table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_trail (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id TEXT NOT NULL,
            engine_id INTEGER NOT NULL,
            cycle INTEGER NOT NULL,
            action TEXT NOT NULL,
            reviewer_id TEXT,
            predicted_rul REAL NOT NULL,
            notes TEXT,
            timestamp TEXT NOT NULL,
            prev_hash TEXT NOT NULL,
            row_hash TEXT NOT NULL
        )
    """)

    # 8. Legacy telemetry_buffer & predictions tables for backward compatibility
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS telemetry_buffer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            engine_id INTEGER NOT NULL,
            cycle INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            payload TEXT NOT NULL,
            UNIQUE(engine_id, cycle)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            engine_id INTEGER NOT NULL,
            cycle INTEGER NOT NULL,
            rul_pred REAL NOT NULL,
            timestamp TEXT NOT NULL,
            UNIQUE(engine_id, cycle)
        )
    """)

    conn.commit()
    conn.close()
    print(f"Database initialized with streaming extensions at {DB_PATH}")

def append_audit_entry(alert_id: str, engine_id: int, cycle: int, action: str, reviewer_id: str, predicted_rul: float, notes: str, conn: sqlite3.Connection = None) -> dict:
    should_close = False
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
        should_close = True
        
    cursor = conn.cursor()
    cursor.execute("SELECT row_hash FROM audit_trail ORDER BY id DESC LIMIT 1")
    last_row = cursor.fetchone()
    prev_hash = last_row[0] if last_row else GENESIS_PREV_HASH
    
    timestamp = datetime.utcnow().isoformat()
    row_hash = compute_audit_hash(
        prev_hash=prev_hash,
        alert_id=alert_id,
        engine_id=engine_id,
        cycle=cycle,
        action=action,
        reviewer_id=reviewer_id or "",
        predicted_rul=predicted_rul,
        notes=notes or "",
        timestamp=timestamp
    )
    
    cursor.execute("""
        INSERT INTO audit_trail (alert_id, engine_id, cycle, action, reviewer_id, predicted_rul, notes, timestamp, prev_hash, row_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (alert_id, engine_id, cycle, action, reviewer_id or "", predicted_rul, notes or "", timestamp, prev_hash, row_hash))
    
    if should_close:
        conn.commit()
        conn.close()
        
    return {
        "alert_id": alert_id,
        "engine_id": engine_id,
        "cycle": cycle,
        "action": action,
        "reviewer_id": reviewer_id or "",
        "predicted_rul": predicted_rul,
        "notes": notes or "",
        "timestamp": timestamp,
        "prev_hash": prev_hash,
        "row_hash": row_hash
    }

def record_prediction_and_check_alert(engine_id: int, cycle: int, rul_pred: float, threshold: float = 60.0, k: int = 3, session_id: str = "default", engine_key: str = "VAL-001", device_id: str = "edge-01") -> tuple:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    now_ts = datetime.utcnow().isoformat()
    
    cursor.execute("""
        INSERT OR IGNORE INTO predictions (engine_id, cycle, rul_pred, timestamp)
        VALUES (?, ?, ?, ?)
    """, (engine_id, cycle, rul_pred, now_ts))
    
    cursor.execute("""
        SELECT cycle, rul_pred FROM predictions
        WHERE engine_id = ? AND cycle <= ?
        ORDER BY cycle DESC
        LIMIT ?
    """, (engine_id, cycle, k))
    last_k_rows = cursor.fetchall()
    
    sustained_k = (len(last_k_rows) == k) and all(r["rul_pred"] < threshold for r in last_k_rows)
    alert_created = False
    alert_id = None
    
    if sustained_k:
        cursor.execute("SELECT id, cycle FROM alerts WHERE session_id = ? AND engine_key = ? AND status = 'PENDING'", (session_id, engine_key))
        existing_pending = cursor.fetchone()
        
        if existing_pending:
            alert_id = existing_pending["id"]
            cursor.execute("""
                UPDATE alerts
                SET cycle = ?, rul_prediction = ?, anomaly_flag = 1, timestamp = ?
                WHERE id = ?
            """, (cycle, rul_pred, now_ts, alert_id))
            append_audit_entry(
                alert_id=alert_id,
                engine_id=engine_id,
                cycle=cycle,
                action="ALERT_UPDATED",
                reviewer_id="",
                predicted_rul=rul_pred,
                notes=f"Sustained alert updated at cycle {cycle}",
                conn=conn
            )
            alert_created = True
        else:
            alert_id = f"alert_{device_id}_{cycle}"
            cursor.execute("""
                INSERT INTO alerts (id, engine_id, cycle, rul_prediction, anomaly_flag, status, timestamp, session_id, device_id, engine_key)
                VALUES (?, ?, ?, ?, 1, 'PENDING', ?, ?, ?, ?)
            """, (alert_id, engine_id, cycle, rul_pred, now_ts, session_id, device_id, engine_key))
            append_audit_entry(
                alert_id=alert_id,
                engine_id=engine_id,
                cycle=cycle,
                action="ALERT_RAISED",
                reviewer_id="",
                predicted_rul=rul_pred,
                notes=f"Alert raised: sustained {k} cycles with RUL < {threshold}",
                conn=conn
            )
            alert_created = True
    
    conn.commit()
    conn.close()
    return alert_created, 1 if sustained_k else 0, alert_id

def add_alert(alert_id, engine_id, cycle, rul_prediction, anomaly_flag, session_id="default", engine_key="VAL-001", device_id="edge-01"):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    timestamp = datetime.utcnow().isoformat()
    try:
        cursor.execute("SELECT id FROM alerts WHERE session_id = ? AND engine_key = ? AND status = 'PENDING'", (session_id, engine_key))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("""
                UPDATE alerts 
                SET cycle = ?, rul_prediction = ?, anomaly_flag = ?, timestamp = ? 
                WHERE id = ?
            """, (cycle, rul_prediction, anomaly_flag, timestamp, existing[0]))
            append_audit_entry(
                alert_id=existing[0],
                engine_id=engine_id,
                cycle=cycle,
                action="ALERT_UPDATED",
                reviewer_id="",
                predicted_rul=rul_prediction,
                notes=f"Updated alert for cycle {cycle}",
                conn=conn
            )
        else:
            cursor.execute("""
                INSERT OR REPLACE INTO alerts (id, engine_id, cycle, rul_prediction, anomaly_flag, status, timestamp, session_id, device_id, engine_key)
                VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
            """, (alert_id, engine_id, cycle, rul_prediction, anomaly_flag, timestamp, session_id, device_id, engine_key))
            append_audit_entry(
                alert_id=alert_id,
                engine_id=engine_id,
                cycle=cycle,
                action="ALERT_RAISED",
                reviewer_id="",
                predicted_rul=rul_prediction,
                notes=f"Initial alert for cycle {cycle}",
                conn=conn
            )
        conn.commit()
    finally:
        conn.close()

def get_unresolved_alerts(session_id: Optional[str] = None):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    if session_id:
        cursor.execute("""
            SELECT * FROM alerts 
            WHERE status = 'PENDING' AND session_id = ?
            ORDER BY timestamp DESC
        """, (session_id,))
    else:
        cursor.execute("""
            SELECT * FROM alerts 
            WHERE status = 'PENDING' AND session_id != 'legacy'
            ORDER BY timestamp DESC
        """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_all_alerts(include_archived: bool = False):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    if include_archived:
        cursor.execute("SELECT * FROM alerts ORDER BY timestamp DESC")
    else:
        cursor.execute("SELECT * FROM alerts WHERE status != 'ARCHIVED' ORDER BY timestamp DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def signoff_alert(alert_id, status, reviewer_id, notes):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    signoff_time = datetime.utcnow().isoformat()
    cursor.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,))
    alert = cursor.fetchone()
    if not alert:
        conn.close()
        raise ValueError(f"Alert {alert_id} not found")
        
    cursor.execute("""
        UPDATE alerts
        SET status = ?, notes = ?, signoff_time = ?
        WHERE id = ?
    """, (status, notes, signoff_time, alert_id))
    
    append_audit_entry(
        alert_id=alert_id,
        engine_id=alert["engine_id"],
        cycle=alert["cycle"],
        action=f"SIGNOFF_{status}",
        reviewer_id=reviewer_id,
        predicted_rul=alert["rul_prediction"],
        notes=notes,
        conn=conn
    )
    conn.commit()
    conn.close()

def get_audit_trail():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_trail ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def verify_audit_trail(db_path: str = None):
    target_path = db_path or DB_PATH
    conn = sqlite3.connect(target_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_trail ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    
    expected_prev = GENESIS_PREV_HASH
    for r in rows:
        if r["prev_hash"] != expected_prev:
            return False, dict(r), f"Previous hash mismatch at id {r['id']}: expected {expected_prev}, got {r['prev_hash']}"
        recalculated_hash = compute_audit_hash(
            prev_hash=r["prev_hash"],
            alert_id=r["alert_id"],
            engine_id=r["engine_id"],
            cycle=r["cycle"],
            action=r["action"],
            reviewer_id=r["reviewer_id"],
            predicted_rul=r["predicted_rul"],
            notes=r["notes"],
            timestamp=r["timestamp"]
        )
        if recalculated_hash != r["row_hash"]:
            return False, dict(r), f"Row hash mismatch at id {r['id']}: recalculated {recalculated_hash}, stored {r['row_hash']}"
        expected_prev = r["row_hash"]
        
    return True, None, "Audit trail integrity verified"

if __name__ == "__main__":
    init_db()
