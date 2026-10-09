import unittest
import tempfile
import json
import gzip
import hmac
import hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

from jetson_node.node.storage import NodeStorage
from jetson_node.node.uplink import UplinkClient

class MockIngestHandler(BaseHTTPRequestHandler):
    received_batches = []
    return_custom_results = False

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        compressed_body = self.rfile.read(content_len)
        sig = self.headers.get("X-Signature")
        dev_id = self.headers.get("X-Device-Id")

        # Decompress body
        raw_body = gzip.decompress(compressed_body)
        data = json.loads(raw_body.decode("utf-8"))
        MockIngestHandler.received_batches.append({
            "dev_id": dev_id,
            "signature": sig,
            "data": data,
            "raw_len": len(raw_body),
            "comp_len": len(compressed_body)
        })

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()

        if MockIngestHandler.return_custom_results:
            results = []
            for item in data.get("items", []):
                # Reject items where seq == 999
                if item["seq"] == 999:
                    results.append({"seq": item["seq"], "kind": item["kind"], "status": "rejected", "reason": "invalid"})
                else:
                    results.append({"seq": item["seq"], "kind": item["kind"], "status": "accepted"})
            resp = json.dumps({"status": "ok", "results": results}).encode("utf-8")
        else:
            resp = json.dumps({"status": "ok", "received": len(data.get("items", []))}).encode("utf-8")
        self.wfile.write(resp)

    def log_message(self, format, *args):
        pass # Silence test logs

class TestUplink(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        MockIngestHandler.received_batches = []
        cls.server = HTTPServer(("127.0.0.1", 0), MockIngestHandler)
        cls.port = cls.server.server_port
        cls.server_thread = threading.Thread(target=cls.server.serve_forever)
        cls.server_thread.daemon = True
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        MockIngestHandler.received_batches = []
        MockIngestHandler.return_custom_results = False
        self.tmp_dir = tempfile.mkdtemp()
        self.db_path = self.tmp_dir + "/uplink_test.db"
        self.storage = NodeStorage(self.db_path)
        self.secret = "test-secret-key-12345"
        self.client = UplinkClient(
            cloud_url="http://127.0.0.1:" + str(self.port),
            device_id="DEV-JETSON-1",
            device_secret=self.secret,
            storage=self.storage,
            allow_insecure=True
        )

    def test_https_enforcement(self):
        with self.assertRaises(ValueError):
            UplinkClient("http://insecure-host.com", "DEV", "secret", self.storage, allow_insecure=False)

    def test_flush_once_success_and_ack(self):
        self.storage.enqueue("DEV-JETSON-1", 10, "prediction", {"rul": 100.0}, force_commit=True)
        self.storage.enqueue("DEV-JETSON-1", 11, "event", {"kind": "alert_raised"}, force_commit=True)

        success = self.client.flush_once()
        self.assertTrue(success)
        self.assertEqual(self.client.link_status, "online")

        # Verify storage is drained
        stats = self.storage.get_stats()
        self.assertEqual(stats["outbox_depth"], 0)

        # Verify Mock received data and HMAC signature match
        self.assertEqual(len(MockIngestHandler.received_batches), 1)
        b = MockIngestHandler.received_batches[0]
        self.assertEqual(b["dev_id"], "DEV-JETSON-1")
        self.assertGreater(self.client.raw_bytes_sent, self.client.compressed_bytes_sent)

    def test_poison_quarantine_disposition(self):
        MockIngestHandler.return_custom_results = True
        self.storage.enqueue("DEV-JETSON-1", 1, "prediction", {"rul": 105.0}, force_commit=True)
        self.storage.enqueue("DEV-JETSON-1", 999, "prediction", {"rul": -1.0}, force_commit=True)

        success = self.client.flush_once()
        self.assertTrue(success)

        stats = self.storage.get_stats()
        self.assertEqual(stats["outbox_depth"], 0)
        self.assertEqual(stats["quarantine_count"], 1)

if __name__ == "__main__":
    unittest.main()
