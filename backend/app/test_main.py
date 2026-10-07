import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import add_alert, init_db

# Initialize database for testing
init_db()

def test_health():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

def test_predict_validation():
    # Test valid padded lengths (1, 10, 29, 30)
    with TestClient(app) as client:
        row = [1.0] * 14
        for length in [1, 10, 29, 30]:
            payload = {
                "engine_id": 1,
                "cycle": length,
                "window": [row] * length
            }
            response = client.post("/predict", json=payload)
            assert response.status_code == 200, f"Expected 200 for length {length}, got {response.status_code}"
            data = response.json()
            assert "rul_prediction" in data

        # Length 31 should return 400
        response_31 = client.post("/predict", json={"engine_id": 1, "cycle": 31, "window": [row] * 31})
        assert response_31.status_code == 400

        # Bad feature dimension should return 400
        response_bad = client.post("/predict", json={"engine_id": 1, "cycle": 1, "window": [[1.0] * 13]})
        assert response_bad.status_code == 400

def test_alerts_signoff():
    # Insert mock alert directly to database
    add_alert("test_pytest_123", 1, 100, 50.0, 1)
    
    with TestClient(app) as client:
        # Verify it shows up in GET /alerts
        response = client.get("/alerts")
        assert response.status_code == 200
        alerts = response.json()
        assert any(a["id"] == "test_pytest_123" for a in alerts)
        
        # Sign off the alert
        signoff_payload = {
            "status": "APPROVED",
            "notes": "Pytest verification notes"
        }
        signoff_response = client.post("/alerts/test_pytest_123/signoff", json=signoff_payload)
        assert signoff_response.status_code == 200
        assert signoff_response.json()["status"] == "success"
        
        # Verify it is no longer in unresolved queue
        response = client.get("/alerts")
        assert response.status_code == 200
        alerts = response.json()
        assert not any(a["id"] == "test_pytest_123" for a in alerts)
