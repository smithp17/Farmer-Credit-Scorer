import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

# Point db at a temp file BEFORE importing main so all db calls use it
import db as _db

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_db.DB_PATH = _db.DB_PATH.__class__(_tmp.name)
_tmp.close()

from fastapi.testclient import TestClient
from main import app

# Use context manager so FastAPI lifespan (init_db) fires correctly
@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


VALID_PAYLOAD = {
    "land_area_acres": 5.0,
    "crop_type": "wheat",
    "repayment_history_score": 80,
    "annual_income_band": "5-10L",
}


# ---------------------------------------------------------------------------
# /score — happy path
# ---------------------------------------------------------------------------

def test_score_happy_path(client):
    resp = client.post("/score", json=VALID_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert "request_id" in data
    assert 0 <= data["score"] <= 100
    assert len(data["reason_codes"]) == 3
    assert "timestamp" in data


def test_good_repayment_code(client):
    resp = client.post("/score", json={**VALID_PAYLOAD, "repayment_history_score": 90})
    assert "good_repayment" in resp.json()["reason_codes"]


def test_poor_repayment_code(client):
    resp = client.post("/score", json={**VALID_PAYLOAD, "repayment_history_score": 10})
    assert "poor_repayment" in resp.json()["reason_codes"]


def test_high_income_band_code(client):
    resp = client.post("/score", json={**VALID_PAYLOAD, "annual_income_band": ">10L"})
    assert "high_income_band" in resp.json()["reason_codes"]


def test_large_landholding_code(client):
    resp = client.post("/score", json={**VALID_PAYLOAD, "land_area_acres": 15.0})
    assert "large_landholding" in resp.json()["reason_codes"]


def test_score_boundary_repayment_0(client):
    resp = client.post("/score", json={**VALID_PAYLOAD, "repayment_history_score": 0})
    assert resp.status_code == 200
    assert 0 <= resp.json()["score"] <= 100


def test_score_boundary_repayment_100(client):
    resp = client.post("/score", json={**VALID_PAYLOAD, "repayment_history_score": 100})
    assert resp.status_code == 200
    assert resp.json()["score"] <= 100


# ---------------------------------------------------------------------------
# /score — validation / error path
# ---------------------------------------------------------------------------

def test_missing_field_returns_422(client):
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "crop_type"}
    assert client.post("/score", json=payload).status_code == 422


def test_negative_land_area_returns_422(client):
    assert client.post("/score", json={**VALID_PAYLOAD, "land_area_acres": -1}).status_code == 422


def test_zero_land_area_returns_422(client):
    assert client.post("/score", json={**VALID_PAYLOAD, "land_area_acres": 0}).status_code == 422


def test_empty_crop_type_returns_422(client):
    assert client.post("/score", json={**VALID_PAYLOAD, "crop_type": ""}).status_code == 422


def test_whitespace_crop_type_returns_422(client):
    assert client.post("/score", json={**VALID_PAYLOAD, "crop_type": "   "}).status_code == 422


def test_repayment_above_100_returns_422(client):
    assert client.post("/score", json={**VALID_PAYLOAD, "repayment_history_score": 101}).status_code == 422


def test_repayment_below_0_returns_422(client):
    assert client.post("/score", json={**VALID_PAYLOAD, "repayment_history_score": -5}).status_code == 422


def test_invalid_income_band_returns_422(client):
    assert client.post("/score", json={**VALID_PAYLOAD, "annual_income_band": "100L+"}).status_code == 422


def test_wrong_type_for_land_area_returns_422(client):
    assert client.post("/score", json={**VALID_PAYLOAD, "land_area_acres": "five"}).status_code == 422


# ---------------------------------------------------------------------------
# /scores endpoint
# ---------------------------------------------------------------------------

def test_scores_endpoint_returns_list(client):
    client.post("/score", json=VALID_PAYLOAD)
    resp = client.get("/scores?limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "records" in data
    assert "total" in data
    assert isinstance(data["records"], list)


def test_scores_record_shape(client):
    client.post("/score", json=VALID_PAYLOAD)
    record = client.get("/scores?limit=1").json()["records"][0]
    for key in ("request_id", "timestamp", "crop_type", "annual_income_band", "score", "reason_codes"):
        assert key in record


def test_scores_limit_respected(client):
    for _ in range(5):
        client.post("/score", json=VALID_PAYLOAD)
    data = client.get("/scores?limit=3").json()
    assert data["total"] <= 3


# ---------------------------------------------------------------------------
# /drift endpoint
# ---------------------------------------------------------------------------

def test_drift_status_field_present(client):
    resp = client.get("/drift")
    assert resp.status_code == 200
    assert "status" in resp.json()


def test_drift_returns_valid_status(client):
    resp = client.get("/drift")
    assert resp.json()["status"] in (
        "stable", "slight_drift", "significant_drift", "insufficient_data"
    )


def test_drift_response_shape_after_seeding(client):
    for i in range(15):
        client.post("/score", json={**VALID_PAYLOAD, "repayment_history_score": float(i * 6)})

    data = client.get("/drift").json()
    if data["status"] != "insufficient_data":
        for key in ("psi", "status", "sample_size", "buckets", "actual_distribution", "reference_distribution"):
            assert key in data
        assert len(data["buckets"]) == 5
        assert len(data["actual_distribution"]) == 5
        assert 0.0 <= data["psi"]
