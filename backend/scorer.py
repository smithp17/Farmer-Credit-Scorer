from models import ScoreRequest, IncomeBand


_INCOME_WEIGHTS = {
    IncomeBand.lt_2L: 0,
    IncomeBand.bt_2_5L: 10,
    IncomeBand.bt_5_10L: 20,
    IncomeBand.gt_10L: 30,
}


def _repayment_code(score: float) -> str:
    if score >= 75:
        return "good_repayment"
    if score >= 40:
        return "average_repayment"
    return "poor_repayment"


def _land_code(acres: float) -> str:
    if acres >= 10:
        return "large_landholding"
    if acres >= 3:
        return "mid_landholding"
    return "small_landholding"


def _income_code(band: IncomeBand) -> str:
    if band == IncomeBand.gt_10L:
        return "high_income_band"
    if band in (IncomeBand.bt_2_5L, IncomeBand.bt_5_10L):
        return "mid_income_band"
    return "low_income_band"


def compute_score(req: ScoreRequest) -> tuple[float, list[str]]:
    """
    Rule-based scoring:
      - Repayment history: 50% weight (0–50 pts)
      - Income band: up to 30 pts
      - Land area: up to 20 pts (log-scaled, capped)
    """
    repayment_pts = req.repayment_history_score * 0.50

    income_pts = _INCOME_WEIGHTS[req.annual_income_band]

    import math
    land_pts = min(20.0, math.log1p(req.land_area_acres) * 5)

    raw = repayment_pts + income_pts + land_pts
    score = round(min(100.0, max(0.0, raw)), 2)

    reason_codes = [
        _repayment_code(req.repayment_history_score),
        _land_code(req.land_area_acres),
        _income_code(req.annual_income_band),
    ]

    return score, reason_codes
