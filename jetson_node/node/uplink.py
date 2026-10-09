"""
jetson_node/node/uplink.py
Uplink worker for TwinEdge Jetson node:
- Batches outbox rows into compressed JSON envelope
- Computes HMAC-SHA256 signature over raw gzipped body
- HTTP POST to /ingest with headers X-Device-Id, X-Signature
- HTTPS enforcement (refuses plain HTTP unless allow_insecure is True)
- Exponential backoff with jitter on failures
- Per-item ack/quarantine processing
- Network bytes tracking (raw vs gzip compressed)

Python 3.6+ compatible.
"""
import os
import sys
import json
import time
import gzip
import hmac
import hashlib
import random
import threading

if sys.version_info[0] >= 3:
    import urllib.request as urllib_request
    import urllib.error as urllib_error
    import ssl
else:
    import urllib2 as urllib_request
    import urllib2 as urllib_error
    import ssl

class UplinkClient(object):
    def __init__(self, cloud_url, device_id, device_secret, storage,
                 batch_size=50, allow_insecure=False, ca_file=None):
        self.cloud_url = cloud_url.rstrip("/")
        self.device_id = device_id
        self.device_secret = device_secret.encode("utf-8") if isinstance(device_secret, str) else device_secret
        self.storage = storage
        self.batch_size = batch_size
        self.allow_insecure = allow_insecure
        self.ca_file = ca_file

        if not self.cloud_url.startswith("https://") and not self.allow_insecure:
            raise ValueError("Insecure cloud URL (" + self.cloud_url + ") refused without --allow-insecure flag!")

        self.running = False
        self.thread = None
        self.link_status = "offline"
        self.raw_bytes_sent = 0
        self.compressed_bytes_sent = 0
        self.backoff_delay = 1.0

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._run_loop, name="uplink_worker")
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)

    def _run_loop(self):
        while self.running:
            success = self.flush_once()
            if success:
                self.backoff_delay = 1.0
                time.sleep(0.5)
            else:
                jitter = random.uniform(0.8, 1.2)
                sleep_sec = min(self.backoff_delay * jitter, 30.0)
                time.sleep(sleep_sec)
                self.backoff_delay = min(self.backoff_delay * 2.0, 30.0)

    def flush_once(self):
        items = self.storage.get_pending_batch(limit=self.batch_size)
        if not items:
            return True # Nothing to flush

        batch_id = "batch_" + str(self.device_id) + "_" + str(int(time.time() * 1000))
        envelope = {
            "v": 1,
            "device_id": self.device_id,
            "batch_id": batch_id,
            "items": [
                {
                    "device_id": it["device_id"],
                    "seq": it["seq"],
                    "kind": it["kind"],
                    "data": it["payload"]
                }
                for it in items
            ]
        }

        # Encode JSON & compress with gzip
        raw_json = json.dumps(envelope).encode("utf-8")
        compressed_body = gzip.compress(raw_json)
        self.raw_bytes_sent += len(raw_json)
        self.compressed_bytes_sent += len(compressed_body)

        # Compute HMAC-SHA256 signature over raw gzipped body
        sig = hmac.new(self.device_secret, compressed_body, hashlib.sha256).hexdigest()

        # Send request
        req = urllib_request.Request(self.cloud_url + "/ingest", data=compressed_body)
        req.add_header("Content-Type", "application/json")
        req.add_header("Content-Encoding", "gzip")
        req.add_header("X-Device-Id", self.device_id)
        req.add_header("X-Signature", sig)

        ctx = None
        if self.ca_file and os.path.exists(self.ca_file):
            ctx = ssl.create_default_context(cafile=self.ca_file)
        elif self.cloud_url.startswith("https://"):
            ctx = ssl.create_default_context()

        try:
            if ctx:
                resp = urllib_request.urlopen(req, timeout=10.0, context=ctx)
            else:
                resp = urllib_request.urlopen(req, timeout=10.0)

            code = resp.getcode()
            if code == 200:
                self.link_status = "online"
                resp_data = json.loads(resp.read().decode("utf-8"))
                self._handle_response(items, resp_data)
                return True
            else:
                self.link_status = "offline"
                return False

        except Exception as e:
            self.link_status = "offline"
            return False

    def _handle_response(self, sent_items, resp_data):
        # resp_data can contain results: [{"seq": s, "kind": k, "status": "accepted"|"duplicate"|"rejected"|"retry"}]
        # or legacy simple dict: {"status": "ok", "received": count}
        results = resp_data.get("results")
        if results:
            accepted_ids = []
            rejected_reasons = []
            # Map (seq, kind) -> outbox_id
            item_map = {(it["seq"], it["kind"]): it["id"] for it in sent_items}
            for res in results:
                key = (res.get("seq"), res.get("kind"))
                oid = item_map.get(key)
                if not oid:
                    continue
                st = res.get("status")
                if st in ["accepted", "duplicate"]:
                    accepted_ids.append(oid)
                elif st == "rejected":
                    rejected_reasons.append((oid, res.get("reason", "rejected_by_cloud")))
            self.storage.ack_items(accepted_ids=accepted_ids, rejected_with_reason=rejected_reasons)
        else:
            # If server accepted whole batch
            if resp_data.get("status") == "ok":
                all_ids = [it["id"] for it in sent_items]
                self.storage.ack_items(accepted_ids=all_ids)
