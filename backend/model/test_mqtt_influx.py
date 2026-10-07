import os
import time
import json
import paho.mqtt.client as mqtt
from influxdb_client import InfluxDBClient

def main():
    # 1. Publish a test message to MQTT
    mqtt_client = mqtt.Client()
    try:
        mqtt_client.connect("localhost", 1883, 60)
        print("Connected to local MQTT broker for testing.")
    except Exception as e:
        print(f"Failed to connect to MQTT broker: {e}")
        return

    from datetime import datetime
    payload = {
        "engine_id": 999,
        "cycle": 1,
        "sensors": [2.5, 300.0, 1.2, 45.0, 0.0] * 3, # 15 features
        "rul_prediction": 95.5,
        "anomaly_flag": 0,
        "timestamp": datetime.utcnow().isoformat()
    }


    print("Publishing test telemetry message to 'twinedge/telemetry'...")
    mqtt_client.publish("twinedge/telemetry", json.dumps(payload))
    mqtt_client.disconnect()
    
    # Wait 2 seconds for subscriber to parse and write to InfluxDB
    print("Waiting 2 seconds for database ingestion...")
    time.sleep(2)
    
    # 2. Query InfluxDB to verify it landed
    print("Querying InfluxDB...")
    influx_url = os.getenv("INFLUXDB_URL", "http://localhost:8086")
    influx_token = os.getenv("INFLUXDB_TOKEN")
    if not influx_token:
        print("INFLUXDB_TOKEN not set; skipping Influx query verification")
        return
    
    try:
        client = InfluxDBClient(url=influx_url, token=influx_token, org="twinedge")
        query_api = client.query_api()
        
        flux_query = '''
        from(bucket: "telemetry")
          |> range(start: -1h)
          |> filter(fn: (r) => r["_measurement"] == "telemetry")
          |> filter(fn: (r) => r["engine_id"] == "999")
        '''
        
        tables = query_api.query(flux_query)
        
        records = []
        for table in tables:
            for record in table.records:
                records.append({
                    "time": record.get_time(),
                    "field": record.get_field(),
                    "value": record.get_value()
                })
                
        if records:
            print("Successfully found test record in InfluxDB!")
            for r in records[:5]: # Print first 5 fields
                print(f"Time: {r['time']}, Field: {r['field']}, Value: {r['value']}")
            print("ACCEPTANCE CHECK: PASS")
        else:
            print("Error: Test record NOT found in InfluxDB.")
            
    except Exception as e:
        print(f"InfluxDB query failed: {e}")

if __name__ == "__main__":
    main()
