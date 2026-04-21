import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "scores.db"


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS score_events (
                id                     INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id             TEXT    NOT NULL,
                timestamp              TEXT    NOT NULL,
                land_area_acres        REAL    NOT NULL,
                crop_type              TEXT    NOT NULL,
                repayment_history_score REAL   NOT NULL,
                annual_income_band     TEXT    NOT NULL,
                score                  REAL    NOT NULL,
                reason_codes           TEXT    NOT NULL
            )
        """)


def insert_score_event(
    request_id: str,
    timestamp: str,
    land_area_acres: float,
    crop_type: str,
    repayment_history_score: float,
    annual_income_band: str,
    score: float,
    reason_codes: list[str],
) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO score_events
              (request_id, timestamp, land_area_acres, crop_type,
               repayment_history_score, annual_income_band, score, reason_codes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                timestamp,
                land_area_acres,
                crop_type,
                repayment_history_score,
                annual_income_band,
                score,
                json.dumps(reason_codes),
            ),
        )


def fetch_recent_events(limit: int = 10) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT request_id, timestamp, crop_type, annual_income_band,
                   score, reason_codes
            FROM score_events
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "request_id": r["request_id"],
            "timestamp": r["timestamp"],
            "crop_type": r["crop_type"],
            "annual_income_band": r["annual_income_band"],
            "score": r["score"],
            "reason_codes": json.loads(r["reason_codes"]),
        }
        for r in rows
    ]


def fetch_all_scores(limit: int = 500) -> list[float]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT score FROM score_events ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [row[0] for row in rows]
