import pytest
from fastapi.testclient import TestClient
from backend.app.main import app, pg_reader
import backend.app.main as main_mod

def test_logs_contract_sqlite_and_postgres():
    client = TestClient(app)

    # 1. Test /health exposes log_sink
    res_health = client.get("/health")
    assert res_health.status_code == 200
    h_data = res_health.json()
    assert "log_sink" in h_data
    assert "mode" in h_data["log_sink"]
    assert "queue_depth" in h_data["log_sink"]
    assert "dropped" in h_data["log_sink"]

    # 2. Test GET /logs with LOG_READ_STORE=sqlite
    main_mod.LOG_READ_STORE = "sqlite"
    res_logs_sqlite = client.get("/logs?limit=10")
    assert res_logs_sqlite.status_code == 200
    logs_sq = res_logs_sqlite.json()
    assert isinstance(logs_sq, list)
    if logs_sq:
        assert logs_sq[0].get("store") == "sqlite"

    # 3. Test GET /logs with LOG_READ_STORE=postgres
    main_mod.LOG_READ_STORE = "postgres"
    res_logs_pg = client.get("/logs?limit=10")
    assert res_logs_pg.status_code == 200
    logs_pg = res_logs_pg.json()
    assert isinstance(logs_pg, list)
    if logs_pg:
        # Either postgres or fallback sqlite if pool was down
        assert logs_pg[0].get("store") in ("postgres", "sqlite")

    # 4. Test keyset pagination and filtering
    res_filtered = client.get("/logs?level=INFO&limit=5")
    assert res_filtered.status_code == 200

    # 5. Test GET /logs/stats
    res_stats = client.get("/logs/stats")
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert "by_level" in stats
    assert "by_source" in stats

    # 6. Test fallback when postgres pool is broken
    try:
        pg_reader._forced_unhealthy = True  # simulate broken pool
        res_fb = client.get("/logs?limit=5")
        assert res_fb.status_code == 200
        logs_fb = res_fb.json()
        assert isinstance(logs_fb, list)
        if logs_fb:
            assert logs_fb[0].get("store") == "sqlite"
            assert logs_fb[0].get("degraded") is True
    finally:
        pg_reader._forced_unhealthy = False

