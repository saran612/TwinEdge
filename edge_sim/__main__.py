"""
Edge Sim Fleet Orchestrator CLI (`python -m edge_sim run`)
"""
import argparse
import asyncio
import multiprocessing
import signal
import sys
import time
import uvicorn
from typing import List

from edge_sim.edge_node import EdgeNode
from edge_sim.local_api import create_edge_app

def run_node_process(device_id: str, engine_key: str, port: int, rate: float, inference: str, cloud_url: str, scenario: str = "lifecycle"):
    node = EdgeNode(
        device_id=device_id,
        engine_key=engine_key,
        inference_policy=inference,
        rate=rate,
        scenario=scenario,
        cloud_url=cloud_url
    )
    app = create_edge_app(node)

    async def node_tick_loop():
        while True:
            try:
                node.process_cycle()
                node.flush_outbox()
            except Exception as e:
                print(f"[{device_id}] Error in cycle: {e}")
            await asyncio.sleep(1.0 / max(0.1, node.rate))

    @app.on_event("startup")
    def on_startup():
        asyncio.create_task(node_tick_loop())

    print(f"Starting Edge Node {device_id} on port {port} for engine {engine_key}...")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")

def main():
    parser = argparse.ArgumentParser(description="TwinEdge Fleet Stream Orchestrator")
    parser.add_argument("command", choices=["run"], help="Command to execute")
    parser.add_argument("--nodes", type=int, default=3, help="Number of nodes to spawn")
    parser.add_argument("--engines", type=str, default="VAL-001,VAL-005,TEST-002", help="Comma-separated engine keys")
    parser.add_argument("--rate", type=float, default=5.0, help="Cycles per second")
    parser.add_argument("--inference", type=str, default="auto", choices=["edge", "cloud", "auto"], help="Inference policy")
    parser.add_argument("--cloud-url", type=str, default="http://localhost:8000", help="Cloud backend URL")
    parser.add_argument("--base-port", type=int, default=8100, help="Base port for node HTTP APIs")
    args = parser.parse_args()

    engine_list = [k.strip() for k in args.engines.split(",") if k.strip()]
    processes: List[multiprocessing.Process] = []

    scenarios = ["lifecycle", "degraded-start", "steady"]

    for i in range(args.nodes):
        dev_id = f"edge-{i+1:02d}"
        eng = engine_list[i % len(engine_list)]
        port = args.base_port + i
        scen = scenarios[i % len(scenarios)]

        p = multiprocessing.Process(
            target=run_node_process,
            args=(dev_id, eng, port, args.rate, args.inference, args.cloud_url, scen)
        )
        p.start()
        processes.append(p)

    def shutdown(sig, frame):
        print("\nShutting down fleet...")
        for p in processes:
            p.terminate()
            p.join(timeout=1.0)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"TwinEdge Fleet spawned {args.nodes} nodes. Press Ctrl+C to terminate.")
    while True:
        time.sleep(5)
        # Status heartbeat
        alive = sum(1 for p in processes if p.is_alive())
        print(f"[Fleet Heartbeat] Active nodes: {alive}/{len(processes)}")

if __name__ == "__main__":
    main()
