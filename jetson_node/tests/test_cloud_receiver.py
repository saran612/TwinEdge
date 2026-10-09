import unittest
import tempfile
import json
import gzip
import hmac
import hashlib
from fastapi.testclient import TestClient

from jetson_node.cloud_receiver.server import app, init_db

class TestCloudReceiver(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.db = self.tmp + "/recv_test.db"
        import jetson_node.cloud_receiver.server as srv
        srv.DB_PATH = self.db
        init_db(self.db)
        self.client = TestClient(app)
        self.secret = "test-secret-key-12345"
        self.device_id = "JETSON-TEST"

    def test_hmac_ingest_and_idempotency(self):
        envelope = {
            "v": 1,
            "device_id": self.device_id,
            "batch_id": "b1",
            "items": [
                {
                    "device_id": self.device_id,
                    "seq": 1,
                    "kind": "prediction",
                    "data": {
                        "cycle": 10,
                        "engine_key": "val_5",
                        "inference": {"rul": 115.0},
                        "twin": {"band": "HEALTHY"}
                    }
                }
            ]
        }
        raw_body = json.dumps(envelope).encode("utf-8")
        comp = gzip.compress(raw_body)
        sig = hmac.new(self.secret.encode("utf-8"), comp, hashlib.sha256).hexdigest()

        # Send request
        resp = self.client.post(
            "/ingest",
            content=comp,
            headers={
                "X-Device-Id": self.device_id,
                "X-Signature": sig,
                "Content-Encoding": "gzip",
                "Content-Type": "application/json"
            }
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["results"][0]["status"], "accepted")

        # Re-send same batch -> duplicate disposition (idempotent)
        resp2 = self.client.post(
            "/ingest",
            content=comp,
            headers={
                "X-Device-Id": self.device_id,
                "X-Signature": sig,
                "Content-Encoding": "gzip",
                "Content-Type": "application/json"
            }
        )
        self.assertEqual(resp2.status_code, 200)
        data2 = resp2.json()
        self.assertEqual(data2["results"][0]["status"], "duplicate")

        # Query GET /devices
        dev_resp = self.client.get("/devices")
        self.assertEqual(dev_resp.status_code, 200)
        devices = dev_resp.json()["devices"]
        self.assertEqual(len(devices), 1)
        self.assertEqual(devices[0]["device_id"], self.device_id)

    def test_bad_signature_401(self):
        comp = gzip.compress(b'{"v":1}')
        resp = self.client.post(
            "/ingest",
            content=comp,
            headers={
                "X-Device-Id": self.device_id,
                "X-Signature": "bad_hex_signature",
                "Content-Encoding": "gzip"
            }
        )
        self.assertEqual(resp.status_code, 401)

if __name__ == "__main__":
    unittest.main()
