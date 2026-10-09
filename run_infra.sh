#!/bin/bash
# Helper script to manage local development infrastructure, backend, and frontend.

ACTION=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

# Source .env if present
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

export INFLUXDB_TOKEN="${INFLUXDB_TOKEN:-dev-influx-token-secret}"
export INFLUXDB_ORG="${INFLUXDB_ORG:-twinedge}"
export INFLUXDB_BUCKET="${INFLUXDB_BUCKET:-telemetry}"
export INFLUXDB_URL="${INFLUXDB_URL:-http://localhost:8086}"
export MQTT_HOST="${MQTT_HOST:-localhost}"
export MQTT_PORT="${MQTT_PORT:-1883}"

if ! command -v docker &>/dev/null; then
    echo "======================================================================"
    echo "[ERROR] Docker is not installed or not in PATH."
    echo "Containerized infrastructure (Mosquitto & InfluxDB) requires Docker."
    echo ""
    echo "For native edge mode without Docker:"
    echo "  1. Start Mosquitto broker: mosquitto -c backend/config/mosquitto.conf"
    echo "  2. Start Subscriber:      PYTHONPATH=backend backend/venv/bin/python backend/app/influx_writer.py"
    echo "======================================================================"
    exit 1
fi

is_backend_running() {
    pgrep -f "uvicorn app.main:app" >/dev/null 2>&1
}

is_frontend_running() {
    pgrep -f "vite" >/dev/null 2>&1
}

if [ "$ACTION" == "start" ]; then
    echo "Starting infrastructure containers..."
    
    # 1. Start Mosquitto
    docker rm -f twinedge_mosquitto 2>/dev/null || true
    docker run -d \
        --name twinedge_mosquitto \
        -p 1883:1883 \
        -v "$SCRIPT_DIR/backend/config/mosquitto.conf:/mosquitto/config/mosquitto.conf" \
        eclipse-mosquitto:2.0.18
        
    # 2. Start InfluxDB
    docker rm -f twinedge_influxdb 2>/dev/null || true
    docker run -d \
        --name twinedge_influxdb \
        -p 8086:8086 \
        -e DOCKER_INFLUXDB_INIT_MODE=setup \
        -e DOCKER_INFLUXDB_INIT_USERNAME="${DOCKER_INFLUXDB_INIT_USERNAME:-admin}" \
        -e DOCKER_INFLUXDB_INIT_PASSWORD="${DOCKER_INFLUXDB_INIT_PASSWORD:-dev-admin-password}" \
        -e DOCKER_INFLUXDB_INIT_ORG="${INFLUXDB_ORG}" \
        -e DOCKER_INFLUXDB_INIT_BUCKET="${INFLUXDB_BUCKET}" \
        -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN="${INFLUXDB_TOKEN}" \
        influxdb:2.7.6
        
    # 3. Start MQTT Subscriber
    docker rm -f twinedge_subscriber 2>/dev/null || true
    sleep 2
    docker run -d \
        --name twinedge_subscriber \
        --network host \
        -e MQTT_HOST="${MQTT_HOST}" \
        -e MQTT_PORT="${MQTT_PORT}" \
        -e INFLUXDB_URL="${INFLUXDB_URL}" \
        -e INFLUXDB_TOKEN="${INFLUXDB_TOKEN}" \
        -e INFLUXDB_ORG="${INFLUXDB_ORG}" \
        -e INFLUXDB_BUCKET="${INFLUXDB_BUCKET}" \
        -v "$SCRIPT_DIR/backend:/app" \
        twinedge_backend \
        python3 -u app/influx_writer.py

    echo "Containers started successfully."

    # 4. Start Backend API
    if is_backend_running; then
        echo "Backend is already running (PID: $(pgrep -f 'uvicorn app.main:app' | head -n1))."
    else
        echo "Starting backend service on port 8000..."
        nohup env PYTHONPATH="$SCRIPT_DIR/backend" INFLUXDB_TOKEN="$INFLUXDB_TOKEN" INFLUXDB_URL="$INFLUXDB_URL" "$SCRIPT_DIR/backend/venv/bin/python" -m uvicorn app.main:app --app-dir "$SCRIPT_DIR/backend" --host 0.0.0.0 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
        sleep 1
        echo "Backend started (PID: $(pgrep -f 'uvicorn app.main:app' | head -n1), logs: $LOG_DIR/backend.log)."
    fi

    # 5. Start Frontend
    if is_frontend_running; then
        echo "Frontend is already running (PID: $(pgrep -f 'vite' | head -n1))."
    else
        echo "Starting frontend dev server on port 5173..."
        nohup npm --prefix "$SCRIPT_DIR/frontend" run dev -- --host 0.0.0.0 --port 5173 > "$LOG_DIR/frontend.log" 2>&1 &
        sleep 1
        echo "Frontend started (PID: $(pgrep -f 'vite' | head -n1), logs: $LOG_DIR/frontend.log)."
    fi

    echo "======================================================================"
    echo "TwinEdge stack is UP!"
    echo "  Frontend:  http://localhost:5173"
    echo "  Backend:   http://localhost:8000 (docs: http://localhost:8000/docs)"
    echo "  InfluxDB:  http://localhost:8086"
    echo "  Mosquitto: localhost:1883"
    echo "======================================================================"

elif [ "$ACTION" == "stop" ]; then
    echo "Stopping infrastructure and services..."

    # Stop Frontend
    pkill -f "vite" 2>/dev/null || true

    # Stop Backend
    pkill -f "uvicorn app.main:app" 2>/dev/null || true

    # Stop Containers
    docker stop twinedge_mosquitto twinedge_influxdb twinedge_subscriber 2>/dev/null || true
    docker rm twinedge_mosquitto twinedge_influxdb twinedge_subscriber 2>/dev/null || true

    echo "All TwinEdge services and containers stopped."

elif [ "$ACTION" == "status" ]; then
    echo "=== Docker Containers ==="
    docker ps -a --filter name=twinedge_
    echo ""
    echo "=== Backend Process ==="
    if is_backend_running; then
        echo "Backend is RUNNING (PID: $(pgrep -f 'uvicorn app.main:app' | tr '\n' ' '))"
    else
        echo "Backend is STOPPED"
    fi
    echo ""
    echo "=== Frontend Process ==="
    if is_frontend_running; then
        echo "Frontend is RUNNING (PID: $(pgrep -f 'vite' | tr '\n' ' '))"
    else
        echo "Frontend is STOPPED"
    fi

else
    echo "Usage: $0 {start|stop|status}"
    exit 1
fi
