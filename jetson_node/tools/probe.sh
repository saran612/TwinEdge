#!/usr/bin/env bash
set -u

echo "=========================================="
echo "TwinEdge Jetson Hardware & Environment Probe"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=========================================="

echo "--- 1. Device Tree Model ---"
if [ -f /proc/device-tree/model ]; then
    tr -d '\0' < /proc/device-tree/model
    echo ""
else
    echo "UNAVAILABLE (/proc/device-tree/model not found)"
fi

echo "--- 2. NVIDIA Tegra Release ---"
if [ -f /etc/nv_tegra_release ]; then
    cat /etc/nv_tegra_release
else
    echo "UNAVAILABLE (/etc/nv_tegra_release not found)"
fi

echo "--- 3. OS Release ---"
if [ -f /etc/os-release ]; then
    cat /etc/os-release
else
    echo "UNAVAILABLE (/etc/os-release not found)"
fi

echo "--- 4. Architecture ---"
uname -m

echo "--- 5. Python & Pip ---"
if command -v python3 >/dev/null 2>&1; then
    python3 --version
else
    echo "python3: NOT FOUND"
fi

if command -v pip3 >/dev/null 2>&1; then
    pip3 --version
elif command -v pip >/dev/null 2>&1; then
    pip --version
else
    echo "pip: NOT FOUND"
fi

echo "--- 6. Memory (free -m) ---"
free -m 2>/dev/null || echo "free: NOT FOUND"

echo "--- 7. CPU Cores (nproc) ---"
nproc 2>/dev/null || echo "nproc: NOT FOUND"

echo "--- 8. Storage (df -h) ---"
df -h . 2>/dev/null || echo "df: NOT FOUND"

echo "--- 9. nvpmodel Power Mode ---"
if command -v nvpmodel >/dev/null 2>&1; then
    nvpmodel -q 2>/dev/null || echo "nvpmodel failed or permission denied"
else
    echo "nvpmodel: NOT AVAILABLE (non-Tegra host or not installed)"
fi

echo "--- 10. NTP / Clock Sync Status ---"
if command -v timedatectl >/dev/null 2>&1; then
    timedatectl status 2>/dev/null || echo "timedatectl failed"
else
    echo "timedatectl: NOT FOUND"
fi

echo "--- 11. Thermal Zones ---"
if ls /sys/class/thermal/thermal_zone* >/dev/null 2>&1; then
    for zone in /sys/class/thermal/thermal_zone*; do
        ztype=$(cat "$zone/type" 2>/dev/null || echo "unknown")
        ztemp=$(cat "$zone/temp" 2>/dev/null || echo "0")
        echo "$zone ($ztype): $((ztemp / 1000)) C"
    done
else
    echo "No thermal zones found in /sys/class/thermal"
fi

echo "--- 12. Docker Availability ---"
if command -v docker >/dev/null 2>&1; then
    docker --version
else
    echo "docker: NOT FOUND"
fi

echo "--- 13. Python Library Imports Check ---"
python3 -c "
libs = ['numpy', 'onnxruntime', 'tflite_runtime']
for lib in libs:
    try:
        mod = __import__(lib)
        ver = getattr(mod, '__version__', 'present')
        print('  ' + lib + ': ' + str(ver))
    except ImportError:
        print('  ' + lib + ': NOT INSTALLED')
" 2>/dev/null || echo "Python execution failed"

echo "=========================================="
echo "Probe Complete."
echo "=========================================="
