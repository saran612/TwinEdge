import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "db.sqlite3"))

import hashlib

GENESIS_PREV_HASH = "0" * 64

def compute_audit_hash(prev_hash: str, alert_id: str, engine_id: int, cycle: int, action: str, reviewer_id: str, predicted_rul: float, notes: str, timestamp: str) -> str:
    canonical_str = f"{prev_hash}|{alert_id}|{engine_id}|{cycle}|{action}|{reviewer_id}|{predicted_rul:.4f}|{notes or ''}|{timestamp}"
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create alerts table
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
    
    # Create local buffer table for telemetry (resilience backup)
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

    # Ensure unique index exists
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_buffer_engine_cycle 
        ON telemetry_buffer(engine_id, cycle)
    """)

    # Create immutable audit_trail table
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
    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")

def append_audit_entry(alert_id: str, engine_id: int, cycle: int, action: str, reviewer_id: str, predicted_rul: float, notes: str, conn: sqlite3.Connection = None) -> dict:
    should_close = False
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
        should_close = True
        
    cursor = conn.cursor()
    # Get last hash in the chain
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

def add_alert(alert_id, engine_id, cycle, rul_prediction, anomaly_flag):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    timestamp = datetime.utcnow().isoformat()
    try:
        # Check if there is already an active pending alert for this engine
        cursor.execute("SELECT id FROM alerts WHERE engine_id = ? AND status = 'PENDING'", (engine_id,))
        existing = cursor.fetchone()
        if existing:
            # Update the existing pending alert with latest telemetry cycle and RUL
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
                INSERT OR REPLACE INTO alerts (id, engine_id, cycle, rul_prediction, anomaly_flag, status, timestamp)
                VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
            """, (alert_id, engine_id, cycle, rul_prediction, anomaly_flag, timestamp))
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
    except sqlite3.Error as e:
        print(f"Database error: {e}")

    finally:
        conn.close()

def get_unresolved_alerts():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Guarantee exactly one latest pending ticket per engine unit
    cursor.execute("""
        SELECT * FROM alerts a1 
        WHERE a1.status = 'PENDING' 
        AND a1.cycle = (
            SELECT MAX(a2.cycle) FROM alerts a2 
            WHERE a2.engine_id = a1.engine_id AND a2.status = 'PENDING'
        )
        ORDER BY a1.timestamp DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_all_alerts():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts ORDER BY timestamp DESC")
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
