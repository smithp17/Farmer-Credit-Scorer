# Farmer Credit Scorer

A full-stack agricultural credit scoring application. Accepts farmer profile inputs, returns a rule-based credit score with reason codes, persists every request, and monitors score distribution drift over time.

**Stack:** FastAPI · Pydantic v2 · SQLite · React · Vite · Docker Compose · nginx

---

## Quick Start

### Docker (recommended)

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Interactive API docs | http://localhost:8000/docs |

### Local

**Backend**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Vite proxies all API calls to `localhost:8000` automatically — no config needed.

**Tests**
```bash
cd backend
pytest tests/ -v
```

**Lint & Format**
```bash
# Backend
ruff check .
ruff format .

# Frontend
npm run lint
npm run format
```

---

## Project Structure

```
/backend
  main.py            # FastAPI app — routes, lifespan, CORS
  models.py          # Pydantic v2 request / response models + validators
  scorer.py          # Rule-based scoring logic (pure function, no I/O)
  db.py              # SQLite persistence (stdlib sqlite3, no ORM)
  drift.py           # PSI drift-check against reference distribution
  audit_logger.py    # Structured JSON audit log to stdout
  ruff.toml          # Linting config
  requirements.txt
  Dockerfile
  tests/
    test_score.py    # 22 tests — happy-path, validation, /scores, /drift

/frontend
  src/
    App.jsx          # All components + inline styles
    main.jsx         # React entry point
  index.html
  vite.config.js     # Dev proxy config
  nginx.conf         # Production reverse proxy (Docker)
  .eslintrc.cjs
  .prettierrc
  Dockerfile

docker-compose.yml   # Backend + frontend + SQLite volume + healthcheck
```

---

## API Reference

### `POST /score`

Score a farmer applicant.

**Request body**

| Field | Type | Rule |
|---|---|---|
| `land_area_acres` | number | > 0 |
| `crop_type` | string | non-empty, non-whitespace |
| `repayment_history_score` | number | 0 – 100 inclusive |
| `annual_income_band` | string | `<2L` · `2-5L` · `5-10L` · `>10L` |

**Example request**
```json
{
  "land_area_acres": 5.0,
  "crop_type": "wheat",
  "repayment_history_score": 80,
  "annual_income_band": "5-10L"
}
```

**Example response**
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "score": 67.0,
  "reason_codes": ["good_repayment", "mid_landholding", "mid_income_band"],
  "timestamp": "2026-04-21T10:00:00+00:00"
}
```

Invalid input returns `422 Unprocessable Entity` with field-level detail.

---

### `GET /scores?limit=10`

Returns the last N score events from SQLite (max 100).

```json
{
  "records": [
    {
      "request_id": "...",
      "timestamp": "...",
      "crop_type": "wheat",
      "annual_income_band": "5-10L",
      "score": 67.0,
      "reason_codes": ["good_repayment", "mid_landholding", "mid_income_band"]
    }
  ],
  "total": 1
}
```

---

### `GET /drift?window=200`

PSI (Population Stability Index) drift analysis over the last N records vs a reference distribution.

| PSI | Status | Meaning |
|---|---|---|
| < 0.10 | `stable` | Distribution matches baseline |
| 0.10 – 0.20 | `slight_drift` | Shift detected — monitor |
| ≥ 0.20 | `significant_drift` | Significant shift — investigate |
| — | `insufficient_data` | Fewer than 10 records exist |

---

### `GET /health`

Returns `{"status": "ok"}`.

---

## Scoring Logic

Three independent components, summed and capped at 100.

| Component | Contribution | Formula |
|---|---|---|
| Repayment history | 0 – 50 pts | `repayment_score × 0.5` |
| Income band | 0 – 30 pts | `<2L`→0 · `2-5L`→10 · `5-10L`→20 · `>10L`→30 |
| Land area | 0 – 20 pts | `min(20, log(1 + acres) × 5)` |

**Why log-scale for land area?** A linear or bucket approach creates cliff-edges (1.9 ac → 0 pts, 2.0 ac → 10 pts). Log-scale gives a smooth, continuous curve where extra land always helps but with diminishing returns — which matches domain intuition.

**Reason codes — always exactly 3, one per dimension:**

| Dimension | Codes |
|---|---|
| Repayment | `good_repayment` (≥75) · `average_repayment` (40–74) · `poor_repayment` (<40) |
| Land | `large_landholding` (≥10 ac) · `mid_landholding` (3–9.9 ac) · `small_landholding` (<3 ac) |
| Income | `high_income_band` (>10L) · `mid_income_band` (2–10L) · `low_income_band` (<2L) |

---

## Design Decisions

**FastAPI over Flask** — automatic OpenAPI docs at `/docs`, native Pydantic v2 integration, structured 422 validation errors out of the box.

**Pydantic validators for all constraints** — wrong types, missing fields, empty strings, and out-of-range values all produce field-level 422 responses with no manual error handling code.

**Scorer as a pure function** — `scorer.py` has no imports from FastAPI or the DB. The API layer calls it; the scoring logic knows nothing about HTTP. Easy to unit-test and easy to swap for an ML model later.

**stdlib `sqlite3` over an ORM** — one table, simple CRUD. SQLAlchemy would add setup overhead without any benefit at this scale.

**Stdout JSON logging** — structured logs to stdout work with every log aggregator (CloudWatch, Datadog, Loki) without file path configuration or rotation concerns.

**nginx reverse-proxy in Docker** — the React bundle is built with a relative API base (`VITE_API_URL=""`). nginx proxies `/score`, `/scores`, `/drift`, `/health` to the backend container. No hard-coded IP addresses in the browser bundle.

---

## Bonus Items

| Item | Detail |
|---|---|
| Docker Compose | nginx reverse-proxy, backend healthcheck, named volume for SQLite persistence across restarts |
| Linting / formatting | `ruff` (backend — E/F/I/UP/B rules), ESLint + Prettier (frontend) |
| Drift-check endpoint | `GET /drift` — toy PSI over 5 score buckets vs a calibrated reference distribution |
| Lightweight persistence | `db.py` — SQLite via stdlib `sqlite3`, powers history and drift endpoints |

---

## What I'd Improve Next

1. **`GET /scores/{request_id}`** — single-record lookup by UUID
2. **Per-feature drift** — PSI on each input feature (land area, income band), not just the output score
3. **Client-side validation** — mirror backend rules in the React form for instant feedback before the network round-trip
4. **Rate limiting** — simple in-memory token bucket on `/score` to prevent abuse
5. **Makefile** — `make test`, `make lint`, `make up` to replace memorising individual commands

---

## LLM / Tool Disclosure

**Tool:** Claude Code CLI (`claude-sonnet-4-6`)

**Used for:** Initial scaffolding of FastAPI structure, Pydantic models, React form component, Docker Compose file.

**Reviewed and corrected:**
- Whitespace-only `crop_type` was not caught by the initial validator output — added explicit `.strip()` check
- Replaced flat land-area bucket scoring with a log-scale formula to eliminate cliff-edges at bucket boundaries
- Expanded test suite from a 2-test draft to 22 tests covering boundary values, all validation error cases, and the new `/scores` and `/drift` endpoints
- Verified Vite proxy config so no hard-coded backend URL exists in development or production builds
