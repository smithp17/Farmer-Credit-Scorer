"""
Toy PSI (Population Stability Index) drift detector.

PSI = Σ (actual_i - expected_i) × ln(actual_i / expected_i)

Interpretation (industry standard):
  PSI < 0.10  → stable          (no significant shift)
  0.10–0.20   → slight_drift    (monitor closely)
  PSI ≥ 0.20  → significant_drift (investigate)

Reference distribution is defined as a representative baseline for
agricultural loan applicants scored by this model.
"""

import math
from typing import Optional

BUCKETS: list[tuple[float, float]] = [(0, 20), (20, 40), (40, 60), (60, 80), (80, 101)]
BUCKET_LABELS: list[str] = ["0-20", "20-40", "40-60", "60-80", "80-100"]

# Expected proportions per bucket (calibrated reference baseline)
REFERENCE_DIST: list[float] = [0.05, 0.15, 0.40, 0.30, 0.10]

MIN_SAMPLE = 10


def _to_proportions(scores: list[float]) -> list[float]:
    counts = [0] * len(BUCKETS)
    for s in scores:
        for i, (lo, hi) in enumerate(BUCKETS):
            if lo <= s < hi:
                counts[i] += 1
                break
    total = len(scores)
    return [c / total for c in counts]


def compute_psi(
    scores: list[float],
) -> tuple[Optional[float], str, list[float], list[float]]:
    """
    Returns (psi, status, actual_dist, reference_dist).
    psi is None when there are fewer than MIN_SAMPLE records.
    """
    if len(scores) < MIN_SAMPLE:
        return None, "insufficient_data", [], REFERENCE_DIST

    actual = _to_proportions(scores)
    psi = 0.0
    for a, e in zip(actual, REFERENCE_DIST):
        a_s = max(a, 1e-6)
        e_s = max(e, 1e-6)
        psi += (a_s - e_s) * math.log(a_s / e_s)

    psi = round(psi, 4)

    if psi < 0.10:
        status = "stable"
    elif psi < 0.20:
        status = "slight_drift"
    else:
        status = "significant_drift"

    return psi, status, actual, REFERENCE_DIST
