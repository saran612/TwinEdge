import os
import time
import json
import sqlite3
import subprocess
import paho.mqtt.client as mqtt
from influxdb_client import InfluxDBClient

def publish_msg(client, cycle):
    payload = {
        "engine_id": 777,
        "cycle": cycle,
        "sensors": [1.0, 2.0, 3.0] * 5,
        "rul_prediction": 100.0 - cycle,
        "anomaly_flag": 1 if (100.0 - cycle) < 60 else 0,
        "timestamp": datetime_str()
    }
    client.publish("twinedge/telemetry", json.dumps(payload))
    print(f"Published cycle {cycle} to MQTT.")

def datetime_str():
    from datetime import datetime
    return datetime.utcnow().isoformat()

def main():
    print("=== TwinEdge Offline Resilience Automated Demo ===")
    
    # 1. Connect to local MQTT broker
    client = mqtt.Client()
    try:
        client.connect("localhost", 1883, 60)
        print("Connected to MQTT broker.")
    except Exception as e:
        print(f"Failed to connect to MQTT broker: {e}")
        return

    # 2. Publish 3 messages (InfluxDB is currently online)
    print("\n--- PHASE 1: System Online (Normal Operation) ---")
    for c in range(1, 4):
        publish_msg(client, c)
        time.sleep(1)

    # 3. Simulate Network Failure by stopping InfluxDB container
    print("\n--- PHASE 2: Simulating InfluxDB Offline (Network Drop) ---")
    print("Stopping twinedge_influxdb container...")
    subprocess.run(["docker", "stop", "twinedge_influxdb"], check=True)
    
    # Publish 3 more messages
    for c in range(4, 7):
        publish_msg(client, c)
        time.sleep(1)

    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "db.sqlite3")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM telemetry_buffer WHERE engine_id = 777")
    count = cursor.fetchone()[0]
    conn.close()
    print(f"\nSQLite Buffer Check: Found {count} records cached in local DB.")
    assert count > 0, "Resilience failed: Telemetry was not buffered locally!"

    # 4. Simulate Reconnect by starting InfluxDB container
    print("\n--- PHASE 3: Simulating Connectivity Restore ---")
    print("Starting twinedge_influxdb container...")
    subprocess.run(["docker", "start", "twinedge_influxdb"], check=True)
    
    print("Waiting 12 seconds for subscriber to reconnect and flush buffer...")
    time.sleep(12)

    # 5. Verify InfluxDB contains all 6 messages
    print("\n--- PHASE 4: Verification ---")
    influx_url = os.getenv("INFLUXDB_URL", "http://localhost:8086")
    influx_token = os.getenv("INFLUXDB_TOKEN")
    if not influx_token:
        print("INFLUXDB_TOKEN not set; skipping Influx query verification")
        return
    
    try:
        influx = InfluxDBClient(url=influx_url, token=influx_token, org="twinedge")
        query_api = influx.query_api()
        
        flux_query = '''
        from(bucket: "telemetry")
          |> range(start: -1h)
          |> filter(fn: (r) => r["_measurement"] == "telemetry")
          |> filter(fn: (r) => r["engine_id"] == "777")
          |> filter(fn: (r) => r["_field"] == "rul_prediction")
        '''
        
        tables = query_api.query(flux_query)
        records = []
        for table in tables:
            for record in table.records:
                records.append(record.get_value())
                
        print(f"InfluxDB Query: Found {len(records)} telemetry records in InfluxDB.")
        print("Values:", records)
        
        # Verify buffer database is cleared
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM telemetry_buffer WHERE engine_id = 777")
        buffer_count = cursor.fetchone()[0]
        conn.close()
        print(f"SQLite Buffer Check: {buffer_count} records remaining in buffer.")
        
        if len(records) == 6 and buffer_count == 0:
            print("\n=== OFFLINE RESILIENCE ACCEPTANCE: PASS ===")
        else:
            print("\n=== OFFLINE RESILIENCE ACCEPTANCE: FAIL ===")
            
    except Exception as e:
        print(f"Verification failed: {e}")
        
    client.disconnect()

if __name__ == "__main__":
    main()
