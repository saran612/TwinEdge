# TwinEdge: Edge-Native Digital Twin & AME Queue for Aircraft MRO

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-brightgreen?style=for-the-badge&logo=vercel)](https://twin-edge.vercel.app/)

TwinEdge is an edge-native digital twin MRO (Maintenance, Repair, Overhaul) platform designed for disconnected operations at regional airports (UDAN-tier hangars) where cloud connectivity is unavailable or unreliable. Telemetry data is preprocessed, evaluated locally via ONNX Runtime using a 1D CNN model, and cached in a local time-series store (InfluxDB) with an offline SQLite buffer fallback. Flagged anomalies route to a human-in-the-loop sign-off queue for Aircraft Maintenance Engineers (AME).

---

## Architecture & Data Flow

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
