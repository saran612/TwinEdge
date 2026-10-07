import os
import time
import json
import threading
import requests
import pandas as pd
import paho.mqtt.client as mqtt
from datetime import datetime

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))

# Global bypass status tracker
_mqtt_bypass_logged = False
_mqtt_lock = threading.Lock()

def create_mqtt_client():
    client = mqtt.Client()
    try:
        client.connect(MQTT_HOST, MQTT_PORT, keepalive=10)
        client.loop_start()
        print(f"[MQTT] Connected successfully to Mosquitto at {MQTT_HOST}:{MQTT_PORT}")
        return client
    except Exception as e:
        print(f"\n{'='*70}\n[PIPELINE WARNING: MQTT BYPASS ACTIVE]\n"
              f"Could not connect to Mosquitto broker at {MQTT_HOST}:{MQTT_PORT}: {e}\n"
              f"Telemetry pipeline is bypassing MQTT and publishing directly via HTTP REST.\n"
              f"{'='*70}\n")
        return None

def simulate_engine(engine_id: int, engine_df: pd.DataFrame, feature_cols: list, mqtt_client: mqtt.Client, stop_event: threading.Event):
    global _mqtt_bypass_logged
    total_cycles = len(engine_df)
    print(f"[Engine #{engine_id}] Starting concurrent telemetry stream ({total_cycles} cycles)...")

    # Engines start healthy and degrade over time
    for cycle in range(30, total_cycles + 1):
        if stop_event.is_set():
            break

        window_df = engine_df.iloc[cycle-30:cycle]
        raw_window = window_df[feature_cols].values.tolist()
        current_cycle = int(engine_df.iloc[cycle-1]['time_in_cycles'])

        # Check if MQTT is currently alive
        is_mqtt_alive = False
        if mqtt_client:
            try:
                is_mqtt_alive = mqtt_client.is_connected()
            except Exception:
                is_mqtt_alive = False

        if not is_mqtt_alive and not _mqtt_bypass_logged:
            with _mqtt_lock:
                if not _mqtt_bypass_logged:
                    print(f"\n{'!'*70}\n"
                          f"[PIPELINE WARNING: MQTT BYPASS ACTIVE]\n"
                          f"Mosquitto broker connection offline. Pipeline is running in DIRECT HTTP BYPASS mode.\n"
                          f"{'!'*70}\n")
                    _mqtt_bypass_logged = True

        # 1. Post to local edge backend for inference
        payload = {
            "engine_id": engine_id,
            "cycle": current_cycle,
            "window": raw_window,
            "mqtt_active": is_mqtt_alive
        }

        rul_prediction = None
        anomaly_flag = 0
        error_state = False

        try:
            res = requests.post(f"{BACKEND_URL}/predict", json=payload, timeout=2)
            if res.ok:
                data = res.json()
                rul_prediction = data.get("rul_prediction")
                anomaly_flag = data.get("anomaly_flag", 0)
            else:
                error_state = True
                print(f"[Engine #{engine_id} Cycle {current_cycle:3d}] Backend error: status {res.status_code} - {res.text}")
        except Exception as e:
            error_state = True
            print(f"[Engine #{engine_id} Cycle {current_cycle:3d}] Backend connection failure: {e}")

        if error_state or rul_prediction is None:
            # Explicit error state: do not generate fake synthetic values
            print(f"[Engine #{engine_id} | Cycle {current_cycle:3d}] ERROR: Backend unavailable — no prediction generated")
            time.sleep(0.5)
            continue

        # 2. Publish via MQTT if available
        published_mqtt = False
        current_sensors = window_df[feature_cols].iloc[-1].tolist()
        if mqtt_client and is_mqtt_alive:
            mqtt_payload = {
                "engine_id": engine_id,
                "cycle": current_cycle,
                "sensors": current_sensors,
                "rul_prediction": rul_prediction,
                "anomaly_flag": anomaly_flag,
                "timestamp": datetime.utcnow().isoformat()
            }
            try:
                info = mqtt_client.publish("twinedge/telemetry", json.dumps(mqtt_payload))
                if info.rc == mqtt.MQTT_ERR_SUCCESS:
                    published_mqtt = True
                if anomaly_flag:
                    alert_payload = {
                        "engine_id": engine_id,
                        "cycle": current_cycle,
                        "rul_prediction": rul_prediction,
                        "anomaly_flag": anomaly_flag,
                        "description": f"Engine #{engine_id} degradation alert at cycle {current_cycle}",
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    mqtt_client.publish("twinedge/alerts", json.dumps(alert_payload))
            except Exception as e:
                print(f"[Engine #{engine_id}] MQTT publish error: {e}")

        # Formatted console output showing pipeline mode
        mode_tag = "MQTT [LIVE]" if published_mqtt else "HTTP [BYPASS]"
        alert_tag = " [ANOMALY FLAGGED]" if anomaly_flag else ""
        print(f"[Engine #{engine_id} | Cycle {current_cycle:3d}] RUL: {rul_prediction:5.1f} cycles | Pipe: {mode_tag}{alert_tag}")

        time.sleep(0.5)

    print(f"[Engine #{engine_id}] Completed stream.")

def main():
    print("=" * 70)
    print(" TwinEdge Multi-Engine Telemetry Simulator (Engines 1, 2, 3)")
    print("=" * 70)

    # 1. Load test data
    raw_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "raw")
    test_path = os.path.join(raw_dir, 'test_FD001.txt')

    if not os.path.exists(test_path):
        print(f"Error: {test_path} not found. Please verify backend/data/raw exists.")
        return

    index_names = ['unit_number', 'time_in_cycles']
    setting_names = ['setting_1', 'setting_2', 'setting_3']
    sensor_names = [f's_{i}' for i in range(1, 22)]
    col_names = index_names + setting_names + sensor_names

    test_df = pd.read_csv(test_path, sep=r'\s+', header=None, names=col_names)
    sensors_to_drop = ['s_1', 's_5', 's_6', 's_10', 's_16', 's_18', 's_19']
    feature_cols = [s for s in sensor_names if s not in sensors_to_drop]

    # Establish MQTT connection
    mqtt_client = create_mqtt_client()

    stop_event = threading.Event()
    threads = []

    # Launch concurrent engines 1, 2, 3
    engine_ids = [1, 2, 3]
    for eid in engine_ids:
        engine_df = test_df[test_df['unit_number'] == eid].sort_values('time_in_cycles')
        t = threading.Thread(
            target=simulate_engine,
            args=(eid, engine_df, feature_cols, mqtt_client, stop_event),
            name=f"Engine-{eid}"
        )
        threads.append(t)
        t.start()
        time.sleep(0.1) # Stagger start slightly

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        print("\nStopping simulation threads...")
        stop_event.set()
        for t in threads:
            t.join()

    if mqtt_client:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
    print("Multi-engine simulation ended.")

if __name__ == "__main__":
    main()
