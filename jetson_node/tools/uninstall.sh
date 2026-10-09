#!/usr/bin/env bash
set -e

echo "=== TwinEdge Jetson Node Uninstallation ==="
if [ -f /etc/systemd/system/twinedge-jetson.service ]; then
    echo "Stopping and disabling systemd service..."
    sudo systemctl stop twinedge-jetson 2>/dev/null || true
    sudo systemctl disable twinedge-jetson 2>/dev/null || true
    sudo rm -f /etc/systemd/system/twinedge-jetson.service
    sudo systemctl daemon-reload
fi

echo "Uninstallation complete. Data and env files in /etc/twinedge preserved."
