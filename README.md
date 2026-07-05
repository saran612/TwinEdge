# TwinEdge: Edge-Native Digital Twin & AME Queue for Aircraft MRO

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-brightgreen?style=for-the-badge&logo=vercel)](https://twin-edge.vercel.app/)

TwinEdge is an edge-native digital twin MRO (Maintenance, Repair, Overhaul) platform designed for disconnected operations at regional airports (UDAN-tier hangars) where cloud connectivity is unavailable or unreliable. Telemetry data is preprocessed, evaluated locally via ONNX Runtime using a 1D CNN model, and cached in a local time-series store (InfluxDB) with an offline SQLite buffer fallback. Flagged anomalies route to a human-in-the-loop sign-off queue for Aircraft Maintenance Engineers (AME).

---

## THE Problem

Aircraft downtime costs airlines up to $150,000 per hour, yet India outsources nearly 90% of its engine and component MRO work abroad, largely because existing digital twin platforms depend on continuous cloud connectivity. This dependency breaks down at the low-bandwidth regional airports India is rapidly building under the UDAN scheme, where intermittent connectivity makes real-time cloud-based diagnostics unreliable. As a result, maintenance decisions are delayed, turnaround times increase, and India's growing fleet remains dependent on foreign infrastructure to stay airworthy. No India-focused MRO platform today combines fully offline edge diagnostics with certified human sign-off at this scale. This gap is only widening as India's regional aviation network expands faster than the cloud infrastructure existing solutions assume. TwinEdge MRO is built specifically to close it.

---

## TwinEdge MRO — Tech Stack

### Edge AI / Model
* **1D-CNN (Conv1D → Conv1D → GlobalAveragePooling → Dense)**: RUL prediction
* **ONNX Runtime**: model inference
* **TensorFlow Lite**: quantized edge export
* **NASA C-MAPSS (FD001)**: training & benchmark dataset

### Backend
* **Python + FastAPI**: inference API (`/predict`, `/health`, `/alerts`, `/telemetry`, `/signoff`)
* **MQTT (Mosquitto)**: telemetry/alert messaging
* **InfluxDB**: local time-series cache (offline-resilient storage)
* **Docker + docker-compose**: service orchestration (simplified from originally-planned K3s, for build-time reasons)

### Frontend
* **React (Vite)**
* **Tailwind CSS**
* **Recharts**: telemetry visualization
* **Deployed on Vercel**

### Data Processing / ML Tooling
* **pandas, NumPy, scikit-learn**: preprocessing, scaling, train/val split
* **joblib**: scaler persistence
* **tf2onnx**: ONNX export

### Regulatory/Compliance Framework (design alignment, not certification)
* **EASA AI Concept Paper** (Level 2 AI — Human-AI Teaming)
* **DGCA CAR-145**
* **AS9100D**

---

## Architecture & Data Flow

For a detailed breakdown of the technical design, tradeoffs, and real vs. mocked scope, see the [architecture.md](file:///home/saran/project/TwinEdge/docs/architecture.md) documentation.

```
   Sensor Data (NASA C-MAPSS FD001)
                |
                v
       Edge Inference Engine (ONNX 1D CNN Model)
                |
                v
       MQTT Publisher (Topic: twinedge/telemetry)
                |
                v
       Mosquitto Broker (MQTT)
                |
                v
       Subscriber (influx_writer.py)
        |  (If InfluxDB offline: buffer in SQLite)
        +-------> InfluxDB Local Cache (time-series)
                     |
                     v
       FastAPI Backend Server (app/main.py)
                     |
                     v
       React Dashboard AME Sign-Off Queue
```

---

## Setup & Execution Instructions

### Prerequisites
- Docker & Docker Daemon running on host.
- Python 3.10+ (for local scripts).

### 1. Start Infrastructure Containers
Run the helper script at the repo root to pull and launch Mosquitto (MQTT) and InfluxDB:
```bash
./run_infra.sh start
```
This launches the containers and starts the subscriber loop (`twinedge_subscriber`) which writes MQTT packets to InfluxDB.

### 2. Set Up Python Virtual Environment (Optional, for scripts)
To run local evaluation or tests, initialize the virtual environment:
```bash
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt
```

### 3. Preprocess Dataset
Run the preprocessing script to clean and normalize the NASA C-MAPSS dataset:
```bash
backend/venv/bin/python3 backend/model/preprocess.py
```
This generates standard scaled sliding windows of size 30 and saves them to `/backend/data/processed/`.

### 4. Build and Run FastAPI Backend
Build the backend container and run it (bound to the host network on port 8000):
```bash
docker build -t twinedge_backend ./backend
docker run -d --name twinedge_backend --network host -v $(pwd)/backend:/app twinedge_backend
```

### 5. Launch React Dashboard Frontend
Navigate to `/frontend` and start the Vite development server:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` (or the port Vite prints) in your browser, or open the live website at https://twin-edge.vercel.app/.

---

## The API

The FastAPI backend exposes the following local REST endpoints for real-time edge processing and AME queue actions:

* **`GET /health`**
  * Returns backend status, checks if the 1D CNN ONNX model and fitted standard scaler are loaded, and returns metadata and connection states.
* **`POST /predict`**
  * Receives a sliding window matrix of shape `(30, 14)` of active turbofan sensor parameters. Performs ONNX inference to output RUL prediction and an anomaly flag (if predicted RUL < 60 cycles), pushing triggered anomalies into the AME sign-off queue database.
* **`GET /telemetry/recent`**
  * Fetches recent time-series telemetry metrics logged to InfluxDB for visualization. Supports filtering by `engine_id` and limiting history.
* **`GET /alerts`**
  * Lists alerts currently residing in the SQLite database queue. Can filter exclusively for `PENDING` states using the `unresolved_only` query flag.
* **`POST /alerts/{alert_id}/signoff`**
  * Submits the AME maintenance action decision (`APPROVED`, `REJECTED`, or `ESCALATED`) along with inspection audit notes for the safety record log.

---

## Automated Demos & Tests

### End-to-End Resilience Demo (Section L)
Simulate network disconnects, local SQLite buffering, and automatic database synchronization on reconnect:
```bash
PYTHONPATH=backend backend/venv/bin/python3 backend/model/demo_resilience.py
```
This script automates the manual sequence, showing:
1. Normal logging to InfluxDB.
2. InfluxDB container stop (caching to local SQLite).
3. InfluxDB container start (auto-flush and database sync).

### Backend Unit Tests (Section N)
Run backend endpoints and database test suite:
```bash
docker run --rm -v $(pwd)/backend:/app twinedge_backend bash -c "pip install pytest httpx && PYTHONPATH=. pytest app/test_main.py"
```

---

## Project Structure

```
TwinEdge/
├── backend/
│   ├── app/
│   │   ├── db.py               # SQLite database access and schema definitions
│   │   ├── db.sqlite3          # SQLite database storing AME alerts and buffer
│   │   ├── influx_writer.py    # MQTT subscriber loop and InfluxDB writer/SQLite buffer logic
│   │   ├── main.py             # FastAPI backend with ONNX inference endpoint
│   │   ├── mqtt_client.py      # MQTT publishing client helper
│   │   └── test_main.py        # Backend API integration and unit tests
│   ├── config/
│   │   └── mosquitto.conf      # Mosquitto broker configuration
│   ├── data/
│   │   ├── processed/          # Preprocessed C-MAPSS sliding windows & scaler
│   │   └── raw/                # Raw C-MAPSS dataset txt files
│   ├── model/
│   │   ├── train.py            # 1D CNN training & ONNX/TFLite export script
│   │   ├── preprocess.py       # C-MAPSS normalization & sliding window pipeline
│   │   ├── demo_resilience.py  # Script simulating database outage and SQLite buffering
│   │   └── twinedge_rul.onnx   # Quantized 1D CNN model in ONNX format
│   ├── Dockerfile              # Dockerfile for backend and subscriber containers
│   ├── requirements.txt        # Python package dependencies
│   ├── simulate.py             # Multi-mode dataset simulation replay script
│   └── simulator.py            # Real-time telemetry generator loop
├── docs/
│   ├── architecture.md         # Document mapping real vs mocked scope
│   └── results.md              # Model performance and latency benchmarking
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # React dashboard entry and AME sign-off control panel
│   │   ├── App.css             # Component-level styles
│   │   ├── index.css           # Global CSS variables and styles
│   │   └── main.jsx            # Vite React entry point
│   ├── index.html              # Frontend page template
│   ├── package.json            # Node.js dependencies and run scripts
│   └── vite.config.js          # Vite compilation config
├── docker-compose.yml          # Container configuration for local deployment
├── run_infra.sh                # Helper script to launch infrastructure locally
└── README.md                   # Platform documentation and setup guide
```

---

## Model Performance & Evaluation

For measured benchmarks, test set RMSE metrics, and CPU latency timings of the edge 1D CNN model, see the [results.md](file:///home/saran/project/TwinEdge/docs/results.md) documentation.

