#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

PYTHON="backend/venv/bin/python"
if [ ! -f "$PYTHON" ]; then
    PYTHON="python3"
fi

PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

echo "=========================================================="
echo " Starting TwinEdge Local Live Demo Stack (Path A)"
echo " SQLite mode - No external Docker or AWS required"
echo "=========================================================="

# 1. Start or verify Backend
if curl -sf http://localhost:8000/health >/dev/null; then
    echo "[OK] Backend already running on port 8000"
else
    echo "[*] Launching FastAPI backend on port 8000..."
    PYTHONPATH=backend $PYTHON -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > "$PID_DIR/backend.pid"
    # Wait for backend health
    for i in {1..20}; do
        if curl -sf http://localhost:8000/health >/dev/null; then
            echo "[OK] Backend online and healthy"
            break
        fi
        sleep 0.5
    done
fi

# 2. Start or verify Fleet Simulator (3 nodes at 5 Hz: VAL-001 lifecycle, VAL-005 degraded-start, TEST-002 steady)
if pgrep -f "edge_sim run" >/dev/null; then
    echo "[OK] Fleet simulator already running"
else
    echo "[*] Spawning 3-node virtual engine fleet (5 Hz)..."
    PYTHONPATH=backend:. $PYTHON -m edge_sim run --nodes 3 --engines VAL-001,VAL-005,TEST-002 --rate 5 --inference auto --cloud-url http://localhost:8000 --base-port 8100 > "$LOG_DIR/fleet.log" 2>&1 &
    FLEET_PID=$!
    echo $FLEET_PID > "$PID_DIR/fleet.pid"
    echo "[OK] Fleet simulator running (PID $FLEET_PID)"
fi

# 3. Start or verify Frontend (Serving built production preview bundle)
if curl -sf http://localhost:5173 >/dev/null; then
    echo "[OK] Frontend server already running on port 5173"
else
    echo "[*] Starting Vite preview on port 5173..."
    npm --prefix frontend run preview -- --host 0.0.0.0 --port 5173 > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$PID_DIR/frontend.pid"
    for i in {1..20}; do
        if curl -sf http://localhost:5173 >/dev/null; then
            echo "[OK] Frontend online on http://localhost:5173"
            break
        fi
        sleep 0.5
    done
fi

echo "=========================================================="
echo " Demo Live Stack Ready!"
echo " URLs: "
echo "   - Web Flightdeck: http://localhost:5173"
echo "   - Safe 3D Mode:   http://localhost:5173/#/twin?safe3d=1"
echo "   - Backend API:    http://localhost:8000/docs"
echo "=========================================================="
