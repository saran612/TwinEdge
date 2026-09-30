import os
import time
import json
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
import tf2onnx
import onnxruntime as ort

def build_model(window_size, n_features):
    inputs = layers.Input(shape=(window_size, n_features), name="sensor_window")
    x = layers.Conv1D(32, kernel_size=5, activation="relu", padding="same")(inputs)
    x = layers.Conv1D(64, kernel_size=5, activation="relu", padding="same")(x)
    x = layers.GlobalAveragePooling1D()(x)
    x = layers.Dense(64, activation="relu")(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(1, activation="linear", name="rul")(x)

    model = models.Model(inputs, outputs, name="twinedge_rul_cnn")
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3), loss="mse", metrics=["mae"])
    return model

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    processed_dir = os.path.join(base_dir, "data", "processed")
    model_dir = os.path.join(base_dir, "model")
    os.makedirs(model_dir, exist_ok=True)


    # 1. Load processed arrays
    x_train = np.load(os.path.join(processed_dir, 'x_train.npy'))
    y_train = np.load(os.path.join(processed_dir, 'y_train.npy'))
    x_val = np.load(os.path.join(processed_dir, 'x_val.npy'))
    y_val = np.load(os.path.join(processed_dir, 'y_val.npy'))
    x_test = np.load(os.path.join(processed_dir, 'x_test.npy'))
    y_test = np.load(os.path.join(processed_dir, 'y_test.npy'))

    print(f"Loaded train data: {x_train.shape}, val data: {x_val.shape}, test data: {x_test.shape}")

    # 2. Build and train model
    SEQUENCE_LENGTH = x_train.shape[1]
    n_features = x_train.shape[2]
    
    model = build_model(SEQUENCE_LENGTH, n_features)
    model.summary()

    early_stop = tf.keras.callbacks.EarlyStopping(monitor='val_loss', patience=8, restore_best_weights=True)
    
    print("Starting training...")
    history = model.fit(
        x_train, y_train, 
        validation_data=(x_val, y_val), 
        epochs=60, 
        batch_size=64, 
        callbacks=[early_stop], 
        verbose=1
    )

    # 3. Evaluate
    print("Evaluating model...")
    test_pred = model.predict(x_test, verbose=0).flatten()
    test_rmse = np.sqrt(np.mean((y_test - test_pred) ** 2))
    print(f"Official Test RMSE: {test_rmse:.3f}")

    # 4. Export ONNX
    print("Exporting model to ONNX...")
    onnx_path = os.path.join(model_dir, "twinedge_rul.onnx")
    spec = (tf.TensorSpec((None, SEQUENCE_LENGTH, n_features), tf.float32, name="sensor_window"),)
    model_proto, _ = tf2onnx.convert.from_keras(model, input_signature=spec, opset=13)
    with open(onnx_path, "wb") as f: 
        f.write(model_proto.SerializeToString())
    print(f"ONNX model saved to {onnx_path}")

    # 5. Export TFLite (Quantized)
    print("Exporting model to TFLite...")
    tflite_path = os.path.join(model_dir, "twinedge_rul.tflite")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()
    with open(tflite_path, "wb") as f: 
        f.write(tflite_model)
    print(f"TFLite model saved to {tflite_path}")


    # 6. Latency Benchmark (ONNX)
    print("Running ONNX CPU benchmark...")
    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    sample = x_test[0:1].astype(np.float32)

    # Warmup
    for _ in range(10): 
        session.run(None, {input_name: sample})

    start = time.perf_counter()
    for _ in range(100): 
        session.run(None, {input_name: sample})
    latency = (time.perf_counter() - start) / 100 * 1000
    print(f"Mean CPU Latency: {latency:.3f}ms")

    # 7. Save results
    results = {
        "test_rmse": float(test_rmse),
        "mean_cpu_latency_ms": float(latency),
        "model_name": "twinedge_rul_cnn",
        "dataset": "FD001"
    }


    results_path = os.path.join(model_dir, 'results.json')
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=4)
        
    print(f"Saved results to {results_path}")
    print(json.dumps(results, indent=4))

if __name__ == "__main__":
    main()
