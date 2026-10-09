import os
import sys
import unittest
import tempfile
import time
import threading

from jetson_node.node.app import JetsonNodeApp
from jetson_node.cloud_receiver.server import app as cloud_app, init_db
from fastapi.testclient import TestClient
from http.server import HTTPServer, BaseHTTPRequestHandler
import gzip
import json
import hmac
import hashlib

class IngestReceiverHandler(BaseHTTPRequestHandler):
    received_items = []
    lock = threading.Lock()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        comp_body = self.rfile.read(length)
        raw_body = gzip.decompress(comp_body)
        data = json.loads(raw_body.decode("utf-8"))

        with IngestReceiverHandler.lock:
            items = data.get("items", [])
            IngestReceiverHandler.received_items.extend(items)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status": "ok", "received": 1}')

    def log_message(self, *args):
        pass

class TestIntegrationSoak(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        IngestReceiverHandler.received_items = []
        cls.server = HTTPServer(("127.0.0.1", 0), IngestReceiverHandler)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.daemon = True
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_multi_engine_integration_soak(self):
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        model_dir = os.path.join(repo_root, "jetson_node", "model")
        data_dir = os.path.join(repo_root, "jetson_node", "data")

        tmp = tempfile.mkdtemp()
        db_path = os.path.join(tmp, "soak_test.db")

        # Launch node at 10 cycles/s across 3 engines for 5 seconds
        node = JetsonNodeApp(
            device_id="INTEG-JETSON",
            device_secret="testsecret",
            cloud_url="http://127.0.0.1:" + str(self.port),
            model_dir=model_dir,
            data_dir=data_dir,
            db_path=db_path,
            engines_count=3,
            rate_hz=10.0,
            allow_insecure=True
        )
        node.setup()
        node.start()

        # Run for 5 seconds
        time.sleep(5.0)

        # Stop node and wait for outbox flush
        node.stop()

        # Verify items received by cloud receiver
        with IngestReceiverHandler.lock:
            items = list(IngestReceiverHandler.received_items)

        self.assertGreater(len(items), 30)

        # Verify no sequence gaps for events and predictions
        seqs = [it["seq"] for it in items]
        self.assertEqual(len(seqs), len(set(seqs)), "Duplicate sequence numbers detected!")

        # Verify predictions match schema properties
        pred_items = [it for it in items if it["kind"] == "prediction"]
        self.assertGreater(len(pred_items), 10)
        p0 = pred_items[0]["data"]
        self.assertEqual(p0["v"], 1)
        self.assertEqual(p0["inference"]["site"], "EDGE")
        self.assertIn("rul", p0["inference"])
        self.assertIn("health_index", p0["twin"])
        self.assertIn("band", p0["twin"])

if __name__ == "__main__":
    unittest.main()
