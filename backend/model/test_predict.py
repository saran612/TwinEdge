import os
import requests
import numpy as np

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    processed_dir = os.path.join(base_dir, "data", "processed")
    
    # Load test array
    x_test_path = os.path.join(processed_dir, "x_test.npy")
    y_test_path = os.path.join(processed_dir, "y_test.npy")
    
    if not os.path.exists(x_test_path):
        print("x_test.npy not found!")
        return
        
    x_test = np.load(x_test_path)
    y_test = np.load(y_test_path)
    
    # Grab first test sample (engine 1)
    # The array contains scaled values, but wait! The endpoint expects RAW sensor readings 
    # and standard scales them inside the server.
    # To test this correctly, let's read the raw text from test_FD001.txt for engine 1.
    raw_file = os.path.join(base_dir, "data", "raw", "test_FD001.txt")
    if not os.path.exists(raw_file):
        print("Raw test data not found!")
        return
        
    import pandas as pd
    index_names = ['unit_number', 'time_in_cycles']
    setting_names = ['setting_1', 'setting_2', 'setting_3']
    sensor_names = [f's_{i}' for i in range(1, 22)]
    col_names = index_names + setting_names + sensor_names
    
    test_df = pd.read_csv(raw_file, sep=r'\s+', header=None, names=col_names)
    
    # Standard C-MAPSS: Drop near-zero variance sensors and setting columns
    sensors_to_drop = ['s_1', 's_5', 's_6', 's_10', 's_16', 's_18', 's_19']
    feature_cols = [s for s in sensor_names if s not in sensors_to_drop]
    
    # Filter engine 1
    engine1_df = test_df[test_df['unit_number'] == 1].sort_values('time_in_cycles')
    raw_window = engine1_df[feature_cols].tail(30).values.tolist()
    
    payload = {
        "engine_id": 1,
        "cycle": int(engine1_df['time_in_cycles'].max()),
        "window": raw_window
    }
    
    url = "http://localhost:8000/predict"
    print(f"Sending predict request to {url} for engine 1 at cycle {payload['cycle']}...")
    
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        print("Response JSON:")
        print(response.json())
        
        # Verify prediction is valid
        data = response.json()
        assert "rul_prediction" in data
        assert "anomaly_flag" in data
        assert "confidence" in data
        print("ACCEPTANCE CHECK: PASS")
    except Exception as e:
        print(f"Prediction test failed: {e}")

if __name__ == "__main__":
    main()
