import logging
import json
import sys


def _build_logger() -> logging.Logger:
    logger = logging.getLogger("audit")
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


_logger = _build_logger()


def log_score_event(
    request_id: str,
    timestamp: str,
    land_area_acres: float,
    crop_type: str,
    repayment_history_score: float,
    annual_income_band: str,
    score: float,
    reason_codes: list[str],
) -> None:
    record = {
        "event": "score_request",
        "request_id": request_id,
        "timestamp": timestamp,
        "inputs": {
            "land_area_acres": land_area_acres,
            "crop_type": crop_type,
            "repayment_history_score": repayment_history_score,
            "annual_income_band": annual_income_band,
        },
        "score": score,
        "reason_codes": reason_codes,
    }
    _logger.info(json.dumps(record))
