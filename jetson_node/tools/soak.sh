#!/usr/bin/env bash
set -e

DURATION_SEC=${1:-60}
echo "=== TwinEdge Soak Test Runner ==="
echo "Duration: ${DURATION_SEC} seconds"

python3 -c "
import time, tempfile, json, os
from jetson_node.node.app import JetsonNodeApp

tmp = tempfile.mkdtemp()
db_path = tmp + '/soak.db'
app = JetsonNodeApp(
    device_id='SOAK-DEV',
    device_secret='testsecret',
    cloud_url='',
    model_dir='jetson_node/model',
    data_dir='jetson_node/data',
    db_path=db_path,
    engines_count=3,
    rate_hz=5.0
)
app.setup()
app.start()

start_time = time.time()
while time.time() - start_time < $DURATION_SEC:
    time.sleep(2.0)

app.stop()
stats = app.storage.get_stats()
db_bytes = stats['db_bytes']
mb_per_hour = (db_bytes / (1024 * 1024)) * (3600.0 / $DURATION_SEC)

res = {
    'duration_sec': $DURATION_SEC,
    'total_items_generated': stats['outbox_depth'],
    'db_bytes': db_bytes,
    'write_volume_mb_per_hour': round(mb_per_hour, 2),
    'quarantine_count': stats['quarantine_count'],
    'drop_count': stats['drop_count']
}
print('\nSoak Summary:')
print(json.dumps(res, indent=2))
with open('soak_results.json', 'w') as f:
    json.dump(res, f, indent=2)
"

echo "Soak run complete."
