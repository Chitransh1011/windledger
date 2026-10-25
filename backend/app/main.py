import json
import os
from datetime import date, time
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .analysis import analyze_day, analyze_month
from .normalize import normalize

app = FastAPI(title="Wind Ledger API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8080"
    ).split(","),
    allow_methods=["GET"],
)


@lru_cache(maxsize=1)
def snapshot():
    path = Path(
        os.getenv(
            "SNAPSHOT_PATH",
            Path(__file__).resolve().parents[1] / "data" / "snapshot.json",
        )
    )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        forecasts, fq = normalize(data["WINDFOR"], "WINDFOR")
        actuals, aq = normalize(data["FUELHH"], "FUELHH")
        provenance = {k: v for k, v in data["provenance"].items() if k != "requests"}
        return (
            forecasts,
            actuals,
            {**provenance, "quality": {"WINDFOR": fq, "FUELHH": aq}},
        )
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise HTTPException(
            503, "Snapshot unavailable. Run python -m app.refresh and restart the API."
        ) from error


def cutoff_time(value):
    return time.fromisoformat(value)


@app.get("/health")
def health():
    _, _, provenance = snapshot()
    return {"status": "ok", "retrieved_at": provenance["retrieved_at"]}


@app.get("/api/day")
def day(
    decision_date: date = date(2026, 1, 1),
    cutoff: str = Query("09:50", pattern=r"^([01]\d|2[0-3]):[0-5]\d$"),
):
    if not date(2026, 1, 1) <= decision_date <= date(2026, 1, 31):
        raise HTTPException(422, "Decision date must be in January 2026")
    forecasts, actuals, provenance = snapshot()
    return {
        **analyze_day(decision_date, cutoff_time(cutoff), forecasts, actuals),
        "provenance": provenance,
    }


@lru_cache(maxsize=32)
def month_result(cutoff):
    forecasts, actuals, provenance = snapshot()
    return {
        **analyze_month(cutoff_time(cutoff), forecasts, actuals),
        "provenance": provenance,
    }


@app.get("/api/month")
def month(cutoff: str = Query("09:50", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")):
    return month_result(cutoff)
