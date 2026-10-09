import unittest
import json
import urllib.request
import tempfile
from jetson_node.node.storage import NodeStorage
from jetson_node.node.local_api import LocalApiServer

class DummyRuntime(object):
    name = "numpy_pure"
    model_sha = "mock_sha256"

class DummyUplink(object):
    link_status = "online"
    raw_bytes_sent = 12040
    compressed_bytes_sent = 2050

class DummyHealth(object):
    last_metrics = {"cpu_temp": 42.5, "clock_synced": True}

class DummyNode(object):
    def __init__(self, storage):
        self.device_id = "DEV-MOCK-1"
        self.boot_id = "boot-mock"
        self.runtime = DummyRuntime()
        self.uplink = DummyUplink()
        self.health_monitor = DummyHealth()
        self.storage = storage

    def get_engines_state(self):
        return {"val_unit_5": {"cycle": 45, "rul": 115.0, "band": "HEALTHY"}}

    def get_recent_events(self, since=0):
        return [{"kind": "session_start", "ts": 100.0}]

class TestLocalApi(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.storage = NodeStorage(self.tmp + "/test_api.db")
        self.node = DummyNode(self.storage)
        self.server = LocalApiServer(self.node, bind_addr="127.0.0.1", port=0) # ephemeral port
        self.port = self.server.server.server_port
        self.server.start()

    def tearDown(self):
        self.server.stop()

    def test_health_endpoint(self):
        url = "http://127.0.0.1:" + str(self.port) + "/health"
        req = urllib.request.urlopen(url)
        data = json.loads(req.read().decode("utf-8"))
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["runtime"], "numpy_pure")
        self.assertEqual(data["link_status"], "online")

    def test_state_endpoint(self):
        url = "http://127.0.0.1:" + str(self.port) + "/state"
        req = urllib.request.urlopen(url)
        data = json.loads(req.read().decode("utf-8"))
        self.assertEqual(data["device_id"], "DEV-MOCK-1")
        self.assertIn("val_unit_5", data["engines"])

    def test_metrics_endpoint(self):
        url = "http://127.0.0.1:" + str(self.port) + "/metrics"
        req = urllib.request.urlopen(url)
        content = req.read().decode("utf-8")
        self.assertIn("twinedge_outbox_depth", content)
        self.assertIn("twinedge_raw_bytes_sent 12040", content)

    def test_events_endpoint(self):
        url = "http://127.0.0.1:" + str(self.port) + "/events?since=50"
        req = urllib.request.urlopen(url)
        data = json.loads(req.read().decode("utf-8"))
        self.assertEqual(data["count"], 1)

if __name__ == "__main__":
    unittest.main()
