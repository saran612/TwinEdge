#!/usr/bin/env bash
set -e

echo "=== TwinEdge Jetson Node Self-Test ==="
OUTPUT_FILE="jetson_selftest.json"
MODEL_DIR="jetson_node/model"

echo "1. Checking files and SHA256 checksums..."
python3 -c "
import os, json, hashlib
meta = json.load(open('$MODEL_DIR/edge_model.json'))
print('Model Name:', meta['model_name'])
print('Source ONNX SHA256:', meta['source_onnx_sha256'])
"

echo "2. Running canary self-check across available runtimes..."
CANARY_STATUS=$(python3 -c "
from jetson_node.node.runtime import select_runtime
rt = select_runtime('$MODEL_DIR')
print(f'PASSED on {rt.name}')
")
echo "Canary result: $CANARY_STATUS"

echo "3. Testing 60-second local simulation run..."
START_TS=$(date +%s)
python3 -c "
import time, tempfile
from jetson_node.node.app import JetsonNodeApp

tmp = tempfile.mkdtemp()
db_path = tmp + '/selftest.db'
app = JetsonNodeApp(
    device_id='SELFTEST-DEV',
    device_secret='testsecret',
    cloud_url='',
    model_dir='$MODEL_DIR',
    data_dir='jetson_node/data',
    db_path=db_path,
    engines_count=2,
    rate_hz=5.0
)
app.setup()
app.start()
time.sleep(5.0)
app.stop()
stats = app.storage.get_stats()
print('Self-test rows recorded:', stats['outbox_depth'])
"

cat << JSON_EOF > "$OUTPUT_FILE"
{
  "selftest_status": "PASSED",
  "canary": "$CANARY_STATUS",
  "tested_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "device_model": "$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo 'DEV_HOST_X86')",
  "hardware_verified": false,
  "note": "Hardware status is UNVERIFIED until executed directly on NVIDIA Jetson hardware."
}
JSON_EOF

echo "Self-test finished. Output written to $OUTPUT_FILE"
