#!/usr/bin/env bash
set -e

INSTALL_SERVICE=0
for arg in "$@"; do
    if [ "$arg" = "--install-service" ]; then
        INSTALL_SERVICE=1
    fi
done

echo "=== TwinEdge Jetson Node Installation ==="
PY_VER=$(python3 -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')")
echo "Detected Python version: $PY_VER"

if [ "$PY_VER" = "3.6" ]; then
    REQ_FILE="jetson_node/requirements-py36.txt"
else
    REQ_FILE="jetson_node/requirements-py38plus.txt"
fi

echo "Installing dependencies from $REQ_FILE..."
python3 -m pip install --user -r "$REQ_FILE"

if [ "$INSTALL_SERVICE" -eq 1 ]; then
    echo "Installing systemd service (requires sudo)..."
    sudo mkdir -p /etc/twinedge
    if [ ! -f /etc/twinedge/node.env ]; then
        sudo cp jetson_node/node.env.example /etc/twinedge/node.env
        sudo chmod 0600 /etc/twinedge/node.env
        echo "Created template /etc/twinedge/node.env (permissions 0600)"
    fi
    sudo cp jetson_node/tools/twinedge-jetson.service /etc/systemd/system/
    sudo systemctl daemon-reload
    echo "Service twinedge-jetson.service installed. Enable with: sudo systemctl enable --now twinedge-jetson"
fi

echo "Installation complete."
