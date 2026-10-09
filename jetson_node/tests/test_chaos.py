import unittest
import tempfile
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import json
import gzip

from jetson_node.node.storage import NodeStorage
from jetson_node.node.uplink import UplinkClient
from jetson_node.tools.fault_proxy import ChaosProxyServer, chaos_config

class EchoUpstreamHandler(BaseHTTPRequestHandler):
    received_count = 0
    def do_POST(self):
        EchoUpstreamHandler.received_count += 1
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status": "ok", "received": 1}')
    def log_message(self, *args):
        pass

class TestChaosScenarios(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        EchoUpstreamHandler.received_count = 0
        cls.upstream = HTTPServer(("127.0.0.1", 0), EchoUpstreamHandler)
        cls.up_port = cls.upstream.server_port
        cls.up_thread = threading.Thread(target=cls.upstream.serve_forever)
        cls.up_thread.daemon = True
        cls.up_thread.start()

        cls.proxy = ChaosProxyServer(target_url="http://127.0.0.1:" + str(cls.up_port), port=0)
        cls.proxy_port = cls.proxy.port
        cls.proxy.start()

    @classmethod
    def tearDownClass(cls):
        cls.proxy.stop()
        cls.upstream.shutdown()
        cls.upstream.server_close()

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.storage = NodeStorage(self.tmp + "/chaos.db")
        self.client = UplinkClient(
            cloud_url="http://127.0.0.1:" + str(self.proxy_port),
            device_id="CHAOS-DEV",
            device_secret="secret123",
            storage=self.storage,
            allow_insecure=True
        )
        # Reset chaos
        chaos_config.latency_sec = 0.0
        chaos_config.drop_prob = 0.0
        chaos_config.blackout_until = 0.0
        chaos_config.force_status_code = None
        chaos_config.truncate_body = False
        chaos_config.duplicate_delivery = False

    def test_scenario_cloud_blackout_and_drain(self):
        # 1. Enqueue items while blackout is active
        chaos_config.blackout_until = time.time() + 0.5 # 500ms blackout
        self.storage.enqueue("CHAOS-DEV", 1, "prediction", {"rul": 100}, force_commit=True)
        self.storage.enqueue("CHAOS-DEV", 2, "event", {"kind": "alert_raised"}, force_commit=True)

        # Flush during blackout -> fails, items stay in outbox
        success = self.client.flush_once()
        self.assertFalse(success)
        stats = self.storage.get_stats()
        self.assertEqual(stats["outbox_depth"], 2)

        # 2. Wait until blackout ends
        time.sleep(0.6)
        success2 = self.client.flush_once()
        self.assertTrue(success2)
        stats2 = self.storage.get_stats()
        self.assertEqual(stats2["outbox_depth"], 0)

    def test_scenario_latency_injection(self):
        chaos_config.latency_sec = 0.2 # 200 ms injected latency
        self.storage.enqueue("CHAOS-DEV", 10, "prediction", {"rul": 90}, force_commit=True)
        t0 = time.time()
        success = self.client.flush_once()
        duration = time.time() - t0
        self.assertTrue(success)
        self.assertGreaterEqual(duration, 0.18)

    def test_scenario_drop_rate(self):
        chaos_config.drop_prob = 1.0 # 100% drops
        self.storage.enqueue("CHAOS-DEV", 20, "prediction", {"rul": 80}, force_commit=True)
        success = self.client.flush_once()
        self.assertFalse(success)
        self.assertEqual(self.storage.get_stats()["outbox_depth"], 1)

    def test_scenario_bad_key_backoff(self):
        chaos_config.force_status_code = 401
        self.storage.enqueue("CHAOS-DEV", 30, "prediction", {"rul": 70}, force_commit=True)
        success = self.client.flush_once()
        self.assertFalse(success)
        self.assertEqual(self.client.link_status, "offline")

    def test_scenario_disk_cap_preserves_events(self):
        # Create storage with tiny 20KB cap
        small_storage = NodeStorage(self.tmp + "/small.db", max_bytes=20 * 1024)
        for i in range(50):
            small_storage.enqueue("CHAOS-DEV", i, "telemetry", {"filler": "z" * 1000}, force_commit=True)
        # Critical event
        small_storage.enqueue("CHAOS-DEV", 9999, "event", {"kind": "critical_alert"}, force_commit=True)

        small_storage._enforce_size_cap()
        stats = small_storage.get_stats()
        self.assertGreater(stats["drop_count"], 0)

        # Verify event 9999 is intact
        batch = small_storage.get_pending_batch(limit=100)
        ev_items = [it for it in batch if it["seq"] == 9999]
        self.assertEqual(len(ev_items), 1)

if __name__ == "__main__":
    unittest.main()
