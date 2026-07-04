import argparse
import json
import os
import time

import joblib
import numpy as np
import pandas as pd
import requests

BASE_COLUMNS = ["unit", "cycle", "setting1", "setting2", "setting3"]
SENSOR_COLUMNS = [f"sensor_{i}" for i in range(1, 22)]
ALL_COLUMNS = BASE_COLUMNS + SENSOR_COLUMNS

# Display-only severity bands (does not change the backend's own anomaly
# threshold — this is purely for labeling output in this script)
def severity_band(rul: float) -> str:
    if rul >= 80:
        return "HEALTHY"
    elif rul >= 40:
        return "WATCH"
    elif rul >= 20:
        return "WARNING"
    else:
        return "CRITICAL"


def load_raw_train(data_dir: str) -> pd.DataFrame:
    path = os.path.join(data_dir, "train_FD001.txt")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Expected {path} — this script replays real C-MAPSS engine "
            f"lifetimes, so it needs the raw training file present."
        )
    return pd.read_csv(path, sep=r"\s+", header=None, names=ALL_COLUMNS)


def load_pipeline_artifacts(processed_dir: str):
    meta_path = os.path.join(processed_dir, "metadata.json")
    scaler_path = os.path.join(processed_dir, "scaler.joblib")
    if not os.path.exists(meta_path) or not os.path.exists(scaler_path):
        raise FileNotFoundError(
            "metadata.json / scaler.joblib not found. Run preprocess.py first — "
            "this script reuses the exact same scaler and feature columns "
            "the model was trained on, so predictions are meaningful."
        )
    with open(meta_path) as f:
        metadata = json.load(f)
    scaler = joblib.load(scaler_path)
    return metadata, scaler


def call_predict(api_url: str, window: np.ndarray) -> dict:
    resp = requests.post(f"{api_url}/predict", json={"window": window.tolist()}, timeout=5)
    resp.raise_for_status()
    return resp.json()


def try_publish_mqtt(client, topic: str, payload: dict):
    if client is None:
        return
    try:
        client.publish(topic, json.dumps(payload))
    except Exception as e:
        print(f"  [mqtt] publish failed (non-fatal): {e}")


def setup_mqtt(host: str, port: int):
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        print("[simulate] paho-mqtt not installed — skipping MQTT publish. "
              "Install with: pip install paho-mqtt")
        return None
    try:
        client = mqtt.Client()
        client.connect(host, port, keepalive=10)
        client.loop_start()
        print(f"[simulate] MQTT connected -> {host}:{port}")
        return client
    except Exception as e:
        print(f"[simulate] MQTT connection failed (continuing without it): {e}")
        return None


def run_trajectory(args, metadata, scaler, train_df):
    unit_df = train_df[train_df["unit"] == args.unit].sort_values("cycle")
    if unit_df.empty:
        raise ValueError(f"Unit {args.unit} not found in train_FD001. Use --mode list to see options.")

    feature_cols = metadata["feature_columns"]
    window = metadata["window_size"]
    max_cycle = unit_df["cycle"].max()

    values = unit_df[feature_cols].values
    if len(values) < window:
        pad_len = window - len(values)
        values = np.vstack([np.repeat(values[0:1], pad_len, axis=0), values])

    mqtt_client = setup_mqtt(args.mqtt_host, args.mqtt_port) if args.publish_mqtt else None

    print(f"\n[simulate] Streaming engine unit {args.unit} — full lifetime "
          f"({max_cycle} cycles) at {args.delay}s/cycle\n")
    print(f"{'CYCLE':>6} {'TRUE RUL':>9} {'PRED RUL':>9} {'BAND':>10} {'ANOMALY':>8} {'LATENCY(ms)':>12}")
    print("-" * 62)

    for end in range(window, len(values) + 1):
        cycle_num = end - (len(values) - max_cycle)
        w = values[end - window:end]
        w_scaled = scaler.transform(w)

        true_rul = max(0, min(125, max_cycle - cycle_num))

        start_t = time.perf_counter()
        try:
            result = call_predict(args.api_url, w_scaled)
        except requests.exceptions.RequestException as e:
            print(f"[simulate] Could not reach backend at {args.api_url} — is uvicorn running? ({e})")
            return
        latency_ms = (time.perf_counter() - start_t) * 1000.0

        pred_rul = result["rul_prediction"]
        anomaly = result["anomaly_flag"]
        band = severity_band(pred_rul)

        print(f"{cycle_num:>6} {true_rul:>9.0f} {pred_rul:>9.1f} {band:>10} "
              f"{'YES' if anomaly else 'no':>8} {latency_ms:>12.3f}")

        telemetry_payload = {
            "unit": args.unit, "cycle": cycle_num,
            "rul_prediction": pred_rul, "anomaly_flag": anomaly,
            "timestamp": time.time(),
        }
        try_publish_mqtt(mqtt_client, args.telemetry_topic, telemetry_payload)
        if anomaly:
            try_publish_mqtt(mqtt_client, args.alert_topic, telemetry_payload)

        time.sleep(args.delay)

    print(f"\n[simulate] Done. Engine {args.unit} reached end of life at cycle {max_cycle}.")
    if mqtt_client:
        mqtt_client.loop_stop()


def run_snapshot(args, metadata, scaler, train_df):
    """
    Picks one engine per severity band (based on true final RUL across all
    engines) and runs a single prediction for each — a fast way to show the
    model handling a range of real cases without waiting for a full
    trajectory.
    """
    feature_cols = metadata["feature_columns"]
    window = metadata["window_size"]

    # Real final RUL per engine (last cycle = 0 remaining, so we probe
    # earlier points to get a spread of true RUL values, not always 0)
    candidates = []
    for unit_id, group in train_df.groupby("unit"):
        group = group.sort_values("cycle")
        max_cycle = group["cycle"].max()
        if max_cycle < window + 10:
            continue
        # Sample a point partway through life for a range of true RULs
        for frac, label in [(0.95, "CRITICAL"), (0.85, "WARNING"), (0.6, "WATCH"), (0.3, "HEALTHY")]:
            probe_cycle = max(window, int(max_cycle * frac))
            true_rul = max_cycle - probe_cycle
            candidates.append((unit_id, probe_cycle, true_rul, label))

    # Take one representative per label
    chosen = {}
    for unit_id, probe_cycle, true_rul, label in candidates:
        if label not in chosen:
            chosen[label] = (unit_id, probe_cycle, true_rul)

    print(f"\n[simulate] Snapshot mode — one real engine per severity band\n")
    print(f"{'BAND':>10} {'UNIT':>6} {'CYCLE':>7} {'TRUE RUL':>9} {'PRED RUL':>9} {'ANOMALY':>8} {'LATENCY(ms)':>12}")
    print("-" * 68)

    for label in ["HEALTHY", "WATCH", "WARNING", "CRITICAL"]:
        if label not in chosen:
            continue
        unit_id, probe_cycle, true_rul = chosen[label]
        unit_df = train_df[train_df["unit"] == unit_id].sort_values("cycle")
        values = unit_df[feature_cols].values
        w = values[probe_cycle - window:probe_cycle]
        w_scaled = scaler.transform(w)

        start_t = time.perf_counter()
        try:
            result = call_predict(args.api_url, w_scaled)
        except requests.exceptions.RequestException as e:
            print(f"[simulate] Could not reach backend at {args.api_url} — is uvicorn running? ({e})")
            return
        latency_ms = (time.perf_counter() - start_t) * 1000.0

        print(f"{label:>10} {unit_id:>6} {probe_cycle:>7} {true_rul:>9.0f} "
              f"{result['rul_prediction']:>9.1f} {'YES' if result['anomaly_flag'] else 'no':>8} "
              f"{latency_ms:>12.3f}")

    print("\n[simulate] Snapshot complete.")


def run_list(train_df):
    print(f"\n{'UNIT':>6} {'MAX CYCLE':>10}")
    print("-" * 18)
    summary = train_df.groupby("unit")["cycle"].max().sort_values(ascending=False)
    for unit_id, max_cycle in summary.items():
        print(f"{unit_id:>6} {max_cycle:>10}")
    print(f"\n{len(summary)} engines total. Longer-lived engines make for a more "
          f"interesting --mode trajectory demo (more cycles to watch degrade).")


def main():
    parser = argparse.ArgumentParser(description="TwinEdge MRO — real C-MAPSS data simulator")
    parser.add_argument("--mode", choices=["trajectory", "snapshot", "list"], default="snapshot")
    parser.add_argument("--unit", type=int, default=24, help="Engine unit id for trajectory mode")
    parser.add_argument("--delay", type=float, default=0.5, help="Seconds between cycles (trajectory mode)")
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--raw-data-dir", default="data/raw")
    parser.add_argument("--processed-data-dir", default="data/processed")
    parser.add_argument("--publish-mqtt", action="store_true")
    parser.add_argument("--mqtt-host", default="localhost")
    parser.add_argument("--mqtt-port", type=int, default=1883)
    parser.add_argument("--telemetry-topic", default="aerosentinel/telemetry")
    parser.add_argument("--alert-topic", default="aerosentinel/alerts")
    args = parser.parse_args()

    train_df = load_raw_train(args.raw_data_dir)

    if args.mode == "list":
        run_list(train_df)
        return

    metadata, scaler = load_pipeline_artifacts(args.processed_data_dir)

    if args.mode == "trajectory":
        run_trajectory(args, metadata, scaler, train_df)
    elif args.mode == "snapshot":
        run_snapshot(args, metadata, scaler, train_df)


if __name__ == "__main__":
    main()
