import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from audit_logger import log_score_event
from db import fetch_all_scores, fetch_recent_events, init_db, insert_score_event
from drift import BUCKET_LABELS, REFERENCE_DIST, compute_psi
from models import ScoreRequest, ScoreResponse
from scorer import compute_score


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Arbix Farmer Credit Scorer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    request_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    score_val, reason_codes = compute_score(req)

    insert_score_event(
        request_id=request_id,
        timestamp=timestamp,
        land_area_acres=req.land_area_acres,
        crop_type=req.crop_type,
        repayment_history_score=req.repayment_history_score,
        annual_income_band=req.annual_income_band.value,
        score=score_val,
        reason_codes=reason_codes,
    )

    log_score_event(
        request_id=request_id,
        timestamp=timestamp,
        land_area_acres=req.land_area_acres,
        crop_type=req.crop_type,
        repayment_history_score=req.repayment_history_score,
        annual_income_band=req.annual_income_band.value,
        score=score_val,
        reason_codes=reason_codes,
    )

    return ScoreResponse(
        request_id=request_id,
        score=score_val,
        reason_codes=reason_codes,
        timestamp=timestamp,
    )


@app.get("/scores")
def recent_scores(limit: int = Query(10, ge=1, le=100)):
    records = fetch_recent_events(limit)
    return {"records": records, "total": len(records)}


@app.get("/drift")
def drift_check(window: int = Query(200, ge=1, le=500, description="Max recent records to analyse")):
    scores = fetch_all_scores(window)
    psi, status, actual_dist, ref_dist = compute_psi(scores)

    if psi is None:
        return {
            "status": "insufficient_data",
            "sample_size": len(scores),
            "minimum_required": 10,
            "message": "Submit at least 10 score requests before drift analysis is available.",
        }

    return {
        "psi": psi,
        "status": status,
        "sample_size": len(scores),
        "buckets": BUCKET_LABELS,
        "actual_distribution": [round(v, 4) for v in actual_dist],
        "reference_distribution": ref_dist,
        "thresholds": {"stable": "< 0.10", "slight_drift": "0.10–0.20", "significant_drift": ">= 0.20"},
    }


@app.get("/health")
def health():
    return {"status": "ok"}
