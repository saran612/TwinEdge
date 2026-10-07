import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "db.sqlite3"))

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
    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")

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
        else:
            cursor.execute("""
                INSERT OR REPLACE INTO alerts (id, engine_id, cycle, rul_prediction, anomaly_flag, status, timestamp)
                VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
            """, (alert_id, engine_id, cycle, rul_prediction, anomaly_flag, timestamp))
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

def signoff_alert(alert_id, status, notes):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    signoff_time = datetime.utcnow().isoformat()
    cursor.execute("""
        UPDATE alerts
        SET status = ?, notes = ?, signoff_time = ?
        WHERE id = ?
    """, (status, notes, signoff_time, alert_id))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
