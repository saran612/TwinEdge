import os
import json
import time
import sqlite3
import paho.mqtt.client as mqtt
from datetime import datetime
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

# Configuration
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://localhost:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN")
if not INFLUXDB_TOKEN:
    raise RuntimeError("CRITICAL CONFIGURATION ERROR: INFLUXDB_TOKEN environment variable is required but not set.")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG", "twinedge")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "telemetry")

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "db.sqlite3"))

# Clients
influx_client = None
write_api = None
is_influx_online = False

def init_influx():
    global influx_client, write_api, is_influx_online
    try:
        influx_client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
        # Check health
        health = influx_client.health()
        if health.status == "pass":
            write_api = influx_client.write_api(write_options=SYNCHRONOUS)
            is_influx_online = True
            print("Connected to InfluxDB successfully.")
            flush_local_buffer()
        else:
            is_influx_online = False
            print(f"InfluxDB health check failed: {health.message}")
    except Exception as e:
        is_influx_online = False
        print(f"Failed to connect to InfluxDB: {e}")

# Buffer logic (SQLite fallback)
def buffer_locally(engine_id, cycle, timestamp, payload):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO telemetry_buffer (engine_id, cycle, timestamp, payload)
        VALUES (?, ?, ?, ?)
    """, (engine_id, cycle, timestamp, json.dumps(payload)))
    conn.commit()
    conn.close()
    print(f"Buffered payload locally for engine {engine_id} cycle {cycle} (InfluxDB Offline)")

def flush_local_buffer():
    global write_api, is_influx_online
    if not is_influx_online or write_api is None:
        return
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, engine_id, cycle, timestamp, payload FROM telemetry_buffer ORDER BY id ASC")
    rows = cursor.fetchall()
    
    if not rows:
        conn.close()
        return
        
    print(f"Attempting to flush {len(rows)} buffered records to InfluxDB...")
    
    points_to_write = []
    ids_to_delete = []
    
    for row in rows:
        row_id, engine_id, cycle, timestamp, payload_str = row
        try:
            payload = json.loads(payload_str)
            dt = datetime.fromisoformat(timestamp)
            
            point = Point("telemetry") \
                .tag("engine_id", str(engine_id)) \
                .tag("cycle", str(cycle)) \
                .field("rul_prediction", float(payload["rul_prediction"])) \
                .field("anomaly_flag", int(payload["anomaly_flag"])) \
                .time(dt)

                
            # Add all individual sensors to the point
            if "sensors" in payload:
                for idx, val in enumerate(payload["sensors"]):
                    point.field(f"sensor_{idx+1}", float(val))
                    
            points_to_write.append(point)
            ids_to_delete.append(row_id)
        except Exception as e:
            print(f"Failed to parse buffered row {row_id}: {e}")
            # Delete corrupted rows so we don't block the queue
            ids_to_delete.append(row_id)
            
    if points_to_write:
        try:
            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=points_to_write)
            print(f"Successfully flushed {len(points_to_write)} records.")
            
            # Remove flushed from DB
            for row_id in ids_to_delete:
                cursor.execute("DELETE FROM telemetry_buffer WHERE id = ?", (row_id,))
            conn.commit()
        except Exception as e:
            print(f"Error flushing to InfluxDB: {e}")
            is_influx_online = False
            
    conn.close()

# MQTT Callbacks
def on_connect(client, userdata, flags, rc):
    print(f"MQTT Connected with result code {rc}")
    client.subscribe("twinedge/telemetry")
    client.subscribe("twinedge/alerts")

def on_message(client, userdata, msg):
    global write_api, is_influx_online
    try:
        payload = json.loads(msg.payload.decode())
        topic = msg.topic
        
        if topic == "twinedge/telemetry":
            engine_id = payload.get("engine_id", payload.get("unit", 1))
            cycle = payload.get("cycle", 1)
            raw_ts = payload.get("timestamp")
            if isinstance(raw_ts, (int, float)):
                dt = datetime.utcfromtimestamp(raw_ts)
            elif isinstance(raw_ts, str):
                try:
                    dt = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                except Exception:
                    dt = datetime.utcnow()
            else:
                dt = datetime.utcnow()
            timestamp = dt.isoformat()

            rul_prediction = payload.get("rul_prediction", 125.0)
            anomaly_flag = payload.get("anomaly_flag", 0)
            sensors = payload.get("sensors", [])
            
            # Check InfluxDB status
            if not is_influx_online:
                # Try reconnecting
                init_influx()
                
            if is_influx_online and write_api:
                try:
                    # Write to InfluxDB
                    point = Point("telemetry") \
                        .tag("engine_id", str(engine_id)) \
                        .tag("cycle", str(cycle)) \
                        .field("rul_prediction", float(rul_prediction)) \
                        .field("anomaly_flag", int(anomaly_flag)) \
                        .time(dt)

                        
                    for idx, val in enumerate(sensors):
                        point.field(f"sensor_{idx+1}", float(val))
                        
                    write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
                    print(f"Logged cycle {cycle} for engine {engine_id} to InfluxDB.")
                except Exception as ex:
                    print(f"InfluxDB write failed: {ex}")
                    is_influx_online = False
                    buffer_locally(engine_id, cycle, timestamp, payload)
            else:
                buffer_locally(engine_id, cycle, timestamp, payload)
                
        elif topic == "twinedge/alerts":
            # Alert messages can be handled or logged to console
            print(f"ALERT EVENT RECEIVED: {payload['description']}")
            
    except Exception as e:
        print(f"Error processing MQTT message: {e}")

def main():
    # Initialize InfluxDB connection
    init_influx()
    
    # Setup MQTT subscriber
    mqtt_client = mqtt.Client()
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    
    print(f"Connecting to MQTT Broker on {MQTT_HOST}:{MQTT_PORT}...")
    while True:
        try:
            mqtt_client.connect(MQTT_HOST, MQTT_PORT, 60)
            break
        except Exception as e:
            print(f"MQTT Connection failed: {e}. Retrying in 5 seconds...")
            time.sleep(5)
            
    # Periodically try to flush local buffer if InfluxDB was offline
    mqtt_client.loop_start()
    
    try:
        while True:
            time.sleep(10)
            if not is_influx_online:
                init_influx()
            else:
                flush_local_buffer()
    except KeyboardInterrupt:
        print("Stopping subscriber...")
        mqtt_client.loop_stop()

if __name__ == "__main__":
    main()
