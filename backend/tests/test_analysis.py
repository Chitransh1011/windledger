from datetime import date, time
from math import sqrt

import pytest
from fastapi.testclient import TestClient

from app.analysis import analyze_day, analyze_month, decision_window, latest, metrics
from app.main import app, snapshot
from app.normalize import Record, normalize, timestamp


def record(value, published="2026-01-01T09:00:00Z", start="2026-01-02T00:00:00Z"):
    return Record(timestamp(start), timestamp(published), value)


def test_cutoff_latest_eligible_and_equality():
    forecasts = [
        record(5),
        record(7, "2026-01-01T09:50:00Z"),
        record(999, "2026-01-01T09:50:01Z"),
    ]
    result = analyze_day(date(2026, 1, 1), time(9, 50), forecasts, [record(6)])
    assert result["intervals"][0]["forecast"] == 7
    assert result["metrics"]["bias"] == 1
    assert result["publication_max"] == "2026-01-01T09:50:00+00:00"


def test_latest_per_target_not_one_global_revision():
    rows = [
        record(10),
        record(20, start="2026-01-02T01:00:00Z"),
        record(30, "2026-01-01T09:30:00Z"),
    ]
    result = analyze_day(date(2026, 1, 1), time(9, 50), rows, [])
    assert result["intervals"][0]["forecast"] == 30
    assert result["intervals"][2]["forecast"] == 20
    assert result["publication_count"] == 2


def test_month_boundary():
    decision, start, end = decision_window(date(2026, 1, 31), time(9, 50))
    assert decision == timestamp("2026-01-31T09:50:00Z")
    assert start == timestamp("2026-02-01T00:00:00Z")
    assert end == timestamp("2026-02-02T00:00:00Z")


def test_timezone_normalization_and_naive_rejection():
    assert timestamp("2026-01-01T10:50:00+01:00") == timestamp("2026-01-01T09:50:00Z")
    with pytest.raises(ValueError):
        timestamp("2026-01-01T09:50:00")


def test_dst_window_is_timezone_aware():
    _, start, end = decision_window(date(2026, 3, 28), time(9, 50))
    assert (end - start).total_seconds() == 23 * 3600


def test_duplicate_order_independence_and_conflict():
    first, second = record(10), record(11)
    assert latest([first, first])[first.start][1] == 10
    assert latest([first, second]) == latest([second, first])
    assert latest([first, second])[first.start][1:] == (None, True)


def test_latest_null_does_not_fall_back_to_old_value():
    selected = latest([record(10), record(None, "2026-01-01T09:30:00Z")])
    assert selected[record(10).start][1] is None


def test_missing_no_interpolation_and_zero_actual():
    result = analyze_day(date(2026, 1, 1), time(9, 50), [record(10)], [record(0)])
    assert len(result["intervals"]) == 48
    assert result["intervals"][1]["forecast"] is None
    assert result["metrics"]["mae"] == 10
    assert result["metrics"]["coverage"] == 1 / 48
    assert result["metrics"]["matched"] == 1


def test_manually_verifiable_metrics():
    rows = [
        {"forecast": 13, "actual": 10, "error": 3},
        {"forecast": 6, "actual": 10, "error": -4},
        {"forecast": None, "actual": 10, "error": None},
    ]
    result = metrics(rows)
    assert result["mae"] == 3.5
    assert result["rmse"] == sqrt(12.5)
    assert result["bias"] == -0.5
    assert result["coverage"] == 2 / 3


def test_empty_metrics_not_zero():
    result = metrics([])
    assert result["mae"] is result["rmse"] is result["bias"] is None
    assert result["matched"] == 0


def test_month_reconstructs_each_day():
    rows = [
        record(10),
        record(1000, "2026-01-02T10:00:00Z"),
        record(20, "2026-01-02T09:00:00Z", "2026-01-03T00:00:00Z"),
    ]
    actuals = [record(8), record(18, start="2026-01-03T00:00:00Z")]
    result = analyze_month(time(9, 50), rows, actuals)
    assert result["metrics"]["mae"] == 2
    assert result["metrics"]["expected"] == 1488
    assert result["days"][-1]["delivery_date"] == "2026-02-01"


def test_normalization_filters_and_counts():
    row = {
        "dataset": "FUELHH",
        "fuelType": "WIND",
        "startTime": "2026-01-02T00:00:00Z",
        "publishTime": "2026-01-02T00:30:00Z",
        "generation": 0,
    }
    records, quality = normalize(
        [
            row,
            row,
            {**row, "fuelType": "GAS"},
            {**row, "generation": float("nan")},
            {**row, "startTime": "bad"},
        ],
        "FUELHH",
    )
    assert len(records) == 1
    assert quality == {"invalid": 2, "duplicates": 1, "null_values": 0}


def test_api_validation_and_unavailable_snapshot(monkeypatch, tmp_path):
    client = TestClient(app)
    assert client.get("/api/day?decision_date=2026-02-01").status_code == 422
    assert client.get("/api/day?cutoff=24:00").status_code == 422
    monkeypatch.setenv("SNAPSHOT_PATH", str(tmp_path / "missing.json"))
    snapshot.cache_clear()
    assert client.get("/api/day").status_code == 503
    snapshot.cache_clear()
